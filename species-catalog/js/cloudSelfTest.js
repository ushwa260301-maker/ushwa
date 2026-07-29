/**
 * Cloud 연결 셀프테스트 — `?cloudtest=1` 로만 활성화되는 검증 러너.
 *
 * 목적: Supabase 연결 상태를 사용자 브라우저에서 7단계로 검증하고
 * 결과를 콘솔 표 + 토스트로 보고한다. Migration(T5)과 무관하며 기존
 * 데이터·UI 를 건드리지 않는다.
 *
 * 단계
 *   1. env         — URL/Key 설정 여부
 *   2. reach       — auth/v1/health 도달성
 *   3. provider    — Google Provider 활성화 여부 (auth/v1/settings)
 *   4. session     — 로그인 세션 + 사용자 정보
 *   5. schema      — species 테이블 SELECT (schema.sql 적용 여부)
 *   6. write       — save_invoice_tx 로 테스트 거래 1건 저장
 *   7. read+clean  — 저장분 재조회 → delete_invoice_tx 로 삭제
 *
 * 테스트 데이터는 거래처 "CLOUD-TEST 연결검증" 1건이며 7단계에서
 * 자동 삭제되므로 공용 DB 에 잔류물이 남지 않는다.
 * (ocr_corrections 는 이 테스트에서 만들지 않음 · audit_log 에는
 *  INSERT/DELETE 이력이 남는데, 이는 감사 로그의 정상 동작이다)
 */

import { getSupabase, isCloudConfigured } from "./supabaseClient.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabaseConfig.js";

/** URL 에 ?cloudtest=1 이 있을 때만 true. */
export function isCloudTestRequested() {
  try {
    const v = new URL(window.location.href).searchParams.get("cloudtest");
    return v === "1" || v === "true";
  } catch { return false; }
}

/**
 * 7단계 셀프테스트 실행. 각 단계는 { step, ok, detail } 로 기록되고
 * 실패해도 다음 단계 진행 가능한 경우 계속한다 (원인 최대 수집).
 *
 * @param {{toast?: (msg:string)=>void}} [ctx]
 * @returns {Promise<Array<{step:string, ok:boolean, detail:string}>>}
 */
export async function runCloudSelfTest(ctx = {}) {
  const results = [];
  const push = (step, ok, detail) => {
    results.push({ step, ok, detail });
    console[ok ? "info" : "error"](`[cloudtest] ${ok ? "✓" : "✗"} ${step} — ${detail}`);
  };

  // 1. env
  if (!isCloudConfigured()) {
    push("1 env", false, "SUPABASE_URL / PUBLISHABLE_KEY 미설정");
    return finish(results, ctx);
  }
  push("1 env", true, SUPABASE_URL);

  // 2. reachability — SDK 없이 raw fetch (네트워크 계층 분리 진단)
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
    });
    push("2 reach", r.ok, `auth/v1/health HTTP ${r.status}`);
    if (!r.ok) return finish(results, ctx);
  } catch (err) {
    push("2 reach", false, `네트워크 실패: ${err?.message || err}`);
    return finish(results, ctx);
  }

  // 3. Google Provider 활성화 여부
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
    });
    const j = await r.json();
    const on = !!j?.external?.google;
    push("3 provider", on, on ? "Google Provider 활성" : "Google Provider 비활성 — Supabase Auth 설정 필요");
  } catch (err) {
    push("3 provider", false, `settings 조회 실패: ${err?.message || err}`);
  }

  // 4. session
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    push("4 session", false, "로그인 세션 없음 — 게이트에서 Google 로그인 후 재시도");
    return finish(results, ctx);
  }
  push("4 session", true, `${session.user.email} (uid ${session.user.id.slice(0, 8)}…)`);

  // 5. schema — species SELECT (테이블 부재시 PostgREST 에러)
  try {
    const { error, count } = await supabase
      .from("species").select("id", { count: "exact", head: true });
    if (error) throw error;
    push("5 schema", true, `species 테이블 OK (rows=${count ?? "?"})`);
  } catch (err) {
    push("5 schema", false,
      `species 조회 실패: ${err?.message || err} — supabase/*.sql 4개가 SQL Editor 로 적용됐는지 확인`);
    return finish(results, ctx);
  }

  // 6. write — save_invoice_tx 테스트 1건
  const marker = `CLOUDTEST-${Date.now()}`;
  let invoiceId = null;
  try {
    const { data, error } = await supabase.rpc("save_invoice_tx", {
      p_invoice: {
        id: "",                                 // 서버 생성
        invoiceDate: new Date().toISOString().slice(0, 10),
        invoiceNumber: marker,
        supplier: "CLOUD-TEST 연결검증",
        supplierPhone: "",
        supplierAddress: ""
      },
      p_items: [{
        id: "", speciesId: "", speciesName: "연결테스트수종",
        spec: "", unit: "주", quantity: 1, unitPrice: 1, amount: 1
      }],
      p_new_species: []
    });
    if (error) throw error;
    invoiceId = data?.invoiceId || null;
    push("6 write", !!invoiceId, invoiceId ? `저장 성공 · ${invoiceId}` : "invoiceId 미반환");
  } catch (err) {
    push("6 write", false, `저장 실패: ${err?.message || err}`);
    return finish(results, ctx);
  }

  // 7. read — 저장분이 5개 테이블에 실제로 생성됐는지 종합 검증.
  //    사용자 요구 3(users)·6(invoices)·7(invoice_items)·8(suppliers)·
  //    9(audit_log)를 이 한 단계에서 전부 확인한다.
  try {
    const inv = await supabase
      .from("invoices").select("id, invoice_number, supplier, supplier_id, uploaded_by")
      .eq("id", invoiceId).maybeSingle();
    if (inv.error) throw inv.error;
    if (!inv.data || inv.data.invoice_number !== marker) {
      push("7 read", false, "invoices 저장분 조회 불일치");
      return await cleanupAndFinish(supabase, invoiceId, results, ctx);
    }

    const items = await supabase
      .from("invoice_items").select("id", { count: "exact", head: true })
      .eq("invoice_id", invoiceId);
    const sup = await supabase
      .from("suppliers").select("id, name").eq("id", inv.data.supplier_id).maybeSingle();
    const usr = await supabase
      .from("users").select("id").eq("id", inv.data.uploaded_by).maybeSingle();
    const audit = await supabase
      .from("audit_log").select("id", { count: "exact", head: true })
      .eq("table_name", "invoices").eq("row_id", invoiceId);

    const checks = {
      invoices:      !!inv.data,
      invoice_items: (items.count ?? 0) >= 1,
      suppliers:     !!sup.data,
      users:         !!usr.data,
      audit_log:     (audit.count ?? 0) >= 1
    };
    const allOk = Object.values(checks).every(Boolean);
    const detail = Object.entries(checks)
      .map(([k, v]) => `${v ? "✓" : "✗"}${k}`).join(" · ");
    push("7 read", allOk, detail +
      (checks.audit_log ? "" : "  (audit_log 0건 — triggers.sql 적용 확인)"));
  } catch (err) {
    push("7 read", false, `종합 검증 실패: ${err?.message || err}`);
  }

  return await cleanupAndFinish(supabase, invoiceId, results, ctx);
}

/** 테스트 잔류물(거래 1건)을 삭제하고 결과를 리포트한다. */
async function cleanupAndFinish(supabase, invoiceId, results, ctx) {
  if (invoiceId) {
    try {
      const { error } = await supabase.rpc("delete_invoice_tx", { p_invoice_id: invoiceId });
      if (error) throw error;
      console.info(`[cloudtest] cleanup ✓ ${invoiceId} 삭제됨 (audit_log 에 DELETE 이력은 정상 잔류)`);
    } catch (err) {
      console.warn(`[cloudtest] cleanup 실패 (Dashboard 수동 삭제 필요: ${invoiceId}):`, err?.message || err);
    }
  }
  return finish(results, ctx);
}

function finish(results, ctx) {
  const pass = results.filter(r => r.ok).length;
  console.table(results);
  const summary = `Cloud 셀프테스트 ${pass}/${results.length} 통과`;
  console.info(`[cloudtest] ${summary}`);
  if (ctx.toast) ctx.toast(summary + " (상세: 콘솔)");
  return results;
}
