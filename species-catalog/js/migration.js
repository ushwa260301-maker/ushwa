/**
 * migration.js — T5: LocalStorage v2 → Supabase Cloud 1회 승격(promotion).
 *
 * 안전 원칙 (요구사항 반영)
 *   · 무손상      : LocalStorage 를 절대 수정/삭제하지 않는다 (읽기 전용).
 *                   Cloud 로 복사만. T6 읽기 전환 전까지 로컬이 여전히 원본.
 *   · dry-run 기본: runMigration() 은 dryRun=true 가 기본. 실제 쓰기는
 *                   runMigration({ dryRun:false }) 로만 발생.
 *   · idempotent  : 이미 Cloud 에 있는 invoice(id 기준)는 건너뛰고, species
 *                   upsert 는 ignoreDuplicates 로 기존 행을 덮지 않는다.
 *                   → 몇 번 재실행해도 중복/손상 없음.
 *   · preview     : previewMigration() 이 쓰기 없이 계획(무엇이 이전/스킵/
 *                   경고)을 반환. 실제 이전 전에 미리 확인 가능.
 *   · 로그 저장   : 매 실행 결과를 LocalStorage(MIGRATION_LOG_KEY)에 누적 +
 *                   console + 반환값.
 *   · 기존 기능 불변: 신규 모듈. app.js 는 ?migrate=1 일 때만 지연 import
 *                     (cloudSelfTest 와 동일한 0비용 게이팅). 자동 이전 없음.
 *
 * 계층: Repository 보조. state/UI 를 모른다. storage(로컬)+supabase(클라우드)만.
 */

import { storage } from "./storage.js";
import { getSupabase, isCloudConfigured } from "./supabaseClient.js";
import { invoiceToRpc, itemToRpc, speciesToDb } from "./cloudStore.js";

const MIGRATION_LOG_KEY = "species-catalog:migration:log";
const MAX_LOG_RUNS = 20;

/** URL 에 ?migrate=1 이 있을 때만 true. */
export function isMigrationRequested() {
  try {
    return new URL(window.location.href).searchParams.get("migrate") === "1";
  } catch {
    return false;
  }
}

/**
 * 이전 계획 산출 — **쓰기 없음**(순수 preview).
 * @returns {Promise<{ok:boolean, reason?:string, plan?:object}>}
 */
export async function previewMigration() {
  const guard = await ensureReady();
  if (!guard.ok) return guard;
  return await buildPlan(guard.supabase);
}

/**
 * 실행. dryRun=true(기본)면 계획만 반환하고 아무것도 쓰지 않는다.
 * dryRun=false 일 때만 Cloud 에 실제 이전한다.
 * @returns {Promise<object>} 실행 기록(로그에 저장된 것과 동일)
 */
export async function runMigration({ dryRun = true } = {}) {
  const startedAt = new Date().toISOString();

  const guard = await ensureReady();
  if (!guard.ok) {
    return finalize({ startedAt, dryRun, ok: false, reason: guard.reason });
  }

  const pv = await buildPlan(guard.supabase);
  if (!pv.ok) {
    return finalize({ startedAt, dryRun, ok: false, reason: pv.reason });
  }
  const { plan } = pv;
  const { toMigrate, itemsByInvoice, newSpecies } = pv._internal;

  // ── DRY-RUN: 계획만 ──
  if (dryRun) {
    console.info("[migrate] DRY-RUN — 쓰기 없음. 아래는 실제 이전 시 반영될 계획.");
    console.table(plan.toMigrate);
    if (plan.warnings.length) console.warn("[migrate] 경고:", plan.warnings);
    return finalize({ startedAt, dryRun: true, ok: true, plan, perInvoice: [] });
  }

  // ── 실제 이전 ──
  const supabase = guard.supabase;

  // Phase A: 신규 species upsert (기존 Cloud 행 보호 — ignoreDuplicates)
  let speciesMigrated = 0;
  if (newSpecies.length) {
    const { error } = await supabase
      .from("species")
      .upsert(newSpecies.map(speciesToDb), { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      return finalize({
        startedAt, dryRun: false, ok: false,
        reason: "species upsert 실패: " + error.message, plan
      });
    }
    speciesMigrated = newSpecies.length;
  }

  // Phase B: invoice 별 save_invoice_tx (이미 있는 것은 plan 에서 제외됨)
  const perInvoice = [];
  let okCount = 0, errCount = 0;
  for (const inv of toMigrate) {
    const items = itemsByInvoice.get(inv.id) || [];
    try {
      const { data, error } = await supabase.rpc("save_invoice_tx", {
        p_invoice: invoiceToRpc(inv),
        p_items: items.map(itemToRpc),
        p_new_species: []          // Phase A 에서 이미 upsert
      });
      if (error) throw error;
      perInvoice.push({ invoiceId: data?.invoiceId || inv.id, status: "ok", items: items.length });
      okCount++;
    } catch (err) {
      perInvoice.push({ invoiceId: inv.id, status: "error", error: err?.message || String(err) });
      errCount++;
      console.warn("[migrate] invoice 실패:", inv.id, err?.message || err);
    }
  }

  const rec = finalize({
    startedAt, dryRun: false, ok: errCount === 0, plan, perInvoice,
    result: {
      speciesMigrated,
      invoicesOk: okCount,
      invoicesError: errCount,
      invoicesSkipped: plan.skip.invoices
    }
  });
  console.info("[migrate] 완료:", rec.result);
  console.table(rec.result);
  return rec;
}

/** 저장된 migration 로그(최근 실행이 앞) 반환. */
export function getMigrationLog() {
  try {
    return JSON.parse(localStorage.getItem(MIGRATION_LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

// ============================================================
// 내부 헬퍼
// ============================================================

/** Cloud 설정·SDK·로그인 세션을 확인. save_invoice_tx 는 auth.uid() 를 쓴다. */
async function ensureReady() {
  if (!isCloudConfigured()) return fail("Cloud 미설정 (supabaseConfig 비어있음)");
  let supabase;
  try {
    supabase = await getSupabase();
  } catch (err) {
    return fail("Supabase SDK 로드 실패: " + (err?.message || err));
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return fail("로그인 필요 — Google 로그인 후 재시도");
  return { ok: true, supabase, user: data.user };
}

/** 순수 계획 산출 (쓰기 없음). local 을 읽고 Cloud 의 기존 id 만 조회. */
async function buildPlan(supabase) {
  const local = storage.load();
  if (!local) {
    return { ok: true, plan: emptyPlan("LocalStorage 비어있음 — 이전할 데이터 없음"),
      _internal: { toMigrate: [], itemsByInvoice: new Map(), newSpecies: [] } };
  }

  const species = local.species || [];
  const invoices = local.invoices || [];
  const items = local.invoiceItems || [];

  // Cloud 기존 id 만 가볍게 조회 (전체 행 안 가져옴)
  const [invRes, spRes] = await Promise.all([
    supabase.from("invoices").select("id"),
    supabase.from("species").select("id")
  ]);
  if (invRes.error) return fail("Cloud invoices 조회 실패: " + invRes.error.message);
  if (spRes.error) return fail("Cloud species 조회 실패: " + spRes.error.message);

  const cloudInvoiceIds = new Set(invRes.data.map(r => r.id));
  const cloudSpeciesIds = new Set(spRes.data.map(r => r.id));
  const localSpeciesIds = new Set(species.map(s => s.id));
  const localInvoiceIds = new Set(invoices.map(i => i.id));
  const itemsByInvoice = groupBy(items, it => it.invoiceId);

  const toMigrate = [];
  let skipCount = 0;
  for (const inv of invoices) {
    if (cloudInvoiceIds.has(inv.id)) skipCount++;
    else toMigrate.push(inv);
  }
  const newSpecies = species.filter(s => !cloudSpeciesIds.has(s.id));

  // 경고 — 실제 이전 전 확인용 (이전을 막지는 않되 사용자가 인지)
  const warnings = [];
  const orphanItems = items.filter(it => !localInvoiceIds.has(it.invoiceId));
  if (orphanItems.length) warnings.push(`헤더 없는 품목 ${orphanItems.length}건 — 이전 제외됨`);
  const danglingItems = items.filter(it => it.speciesId && !localSpeciesIds.has(it.speciesId));
  if (danglingItems.length) warnings.push(`미등록 수종 참조 품목 ${danglingItems.length}건 — 해당 invoice FK 실패 가능`);
  const noDate = invoices.filter(i => !i.invoiceDate);
  if (noDate.length) warnings.push(`거래일 없는 명세서 ${noDate.length}건 — 이전 실패 예상`);

  const plan = {
    localCounts: { species: species.length, invoices: invoices.length, items: items.length },
    cloudCounts: { invoices: cloudInvoiceIds.size, species: cloudSpeciesIds.size },
    toMigrate: {
      species: newSpecies.length,
      invoices: toMigrate.length,
      items: toMigrate.reduce((n, inv) => n + (itemsByInvoice.get(inv.id)?.length || 0), 0)
    },
    skip: { invoices: skipCount },
    warnings
  };

  return { ok: true, plan, _internal: { toMigrate, itemsByInvoice, newSpecies } };
}

function fail(reason) { return { ok: false, reason }; }

function emptyPlan(note) {
  return {
    localCounts: { species: 0, invoices: 0, items: 0 },
    cloudCounts: { invoices: 0, species: 0 },
    toMigrate: { species: 0, invoices: 0, items: 0 },
    skip: { invoices: 0 },
    warnings: note ? [note] : []
  };
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

/** 실행 기록을 로그에 누적 저장하고 그대로 반환. */
function finalize(rec) {
  rec.finishedAt = new Date().toISOString();
  try {
    const log = getMigrationLog();
    log.unshift(rec);
    localStorage.setItem(MIGRATION_LOG_KEY, JSON.stringify(log.slice(0, MAX_LOG_RUNS)));
  } catch (err) {
    console.warn("[migrate] 로그 저장 실패:", err?.message || err);
  }
  if (!rec.ok && rec.reason) console.error("[migrate] 중단:", rec.reason);
  return rec;
}
