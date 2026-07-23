/**
 * cloudStore — Supabase CRUD (Repository 계층 · Cloud = Source of Truth 예정).
 *
 * T4 단계 역할: **dual-write 미러**.
 *   · 로컬(LocalStorage) 경로는 기존 그대로 동작한다.
 *   · 여기의 mirror* 함수들은 같은 변경을 Supabase 에 복제한다.
 *   · Cloud 미설정( isCloudConfigured()=false ) → 즉시 no-op.
 *   · Cloud 쓰기 실패 → console.warn 만 — **절대 throw 하지 않는다**.
 *     (dual-write 가 로컬 저장을 깨뜨리면 안 된다는 안전 원칙)
 *
 * 읽기 전환(T6)을 위해 fetchAll() 도 여기서 제공한다 — DB 행(snake_case)
 * 을 앱 shape(camelCase)로 변환해 storage.load() 와 동일한 모양을 반환.
 *
 * 계층 규칙: 이 파일은 state/UI 를 모른다. 호출자(app.js)가 필요한
 * 데이터를 인자로 넘긴다.
 */

import { getSupabase, isCloudConfigured } from "./supabaseClient.js";

// ============================================================
// Shape 변환 — 앱(camelCase) ↔ DB(snake_case)
// ============================================================

function speciesToDb(sp) {
  return {
    id:           sp.id,
    name:         sp.name,
    latin:        sp.latin || "",
    category:     sp.category || "",
    bloom_months: sp.bloomMonths || [],
    colors:       sp.colors || [],
    suppliers:    sp.suppliers || [],
    notes:        sp.notes || ""
  };
}

function speciesFromDb(row) {
  return {
    id:           row.id,
    name:         row.name,
    latin:        row.latin || "",
    category:     row.category || "",
    bloomMonths:  row.bloom_months || [],
    colors:       row.colors || [],
    suppliers:    row.suppliers || [],
    notes:        row.notes || ""
  };
}

// speciesToDb / invoiceToRpc / itemToRpc 는 migration.js(T5)도 재사용한다
// (동일 매핑 단일 소스 유지). export 는 additive — 기존 동작 불변.
export { speciesToDb };

function invoiceFromDb(row, attachmentByInvoice) {
  const inv = {
    id:              row.id,
    invoiceDate:     row.invoice_date,
    invoiceNumber:   row.invoice_number || "",
    supplier:        row.supplier,
    supplierPhone:   row.supplier_phone || "",
    supplierAddress: row.supplier_address || "",
    createdAt:       row.created_at
  };
  const att = attachmentByInvoice?.get(row.id);
  if (att) {
    inv.attachment = {
      id:            att.id,
      filename:      att.filename,
      mimeType:      att.mime_type,
      size:          att.size_bytes,
      createdAt:     att.created_at,
      storagePath:   att.storage_path,
      thumbnailPath: att.thumbnail_path || ""
    };
  }
  return inv;
}

function itemFromDb(row) {
  return {
    id:          row.id,
    invoiceId:   row.invoice_id,
    speciesId:   row.species_id || null,
    speciesName: row.species_name,
    spec:        row.spec || "",           // DB null → 앱 "" (규격 Optional)
    unit:        row.unit || "주",
    quantity:    Number(row.quantity) || 0,
    unitPrice:   Number(row.unit_price) || 0,
    amount:      Number(row.amount) || 0
  };
}

// rpc.sql 의 save_invoice_tx / update_invoice_tx 가 읽는 camelCase 키.
// export: migration.js(T5) 재사용 — additive, 동작 불변.
export function invoiceToRpc(inv) {
  return {
    id:              inv.id || "",
    invoiceDate:     inv.invoiceDate,
    invoiceNumber:   inv.invoiceNumber || "",
    supplier:        inv.supplier,
    supplierPhone:   inv.supplierPhone || "",
    supplierAddress: inv.supplierAddress || ""
  };
}

export function itemToRpc(it) {
  return {
    id:          it.id || "",
    speciesId:   it.speciesId || "",
    speciesName: it.speciesName || it.name || "",
    spec:        it.spec || "",
    unit:        it.unit || "주",
    quantity:    Number(it.quantity) || 1,
    unitPrice:   Number(it.unitPrice) || 0,
    amount:      Number(it.amount) || 0
  };
}

function speciesToRpc(sp) {
  return {
    id:          sp.id,
    name:        sp.name,
    latin:       sp.latin || "",
    category:    sp.category || "",
    bloomMonths: sp.bloomMonths || [],
    colors:      sp.colors || [],
    suppliers:   sp.suppliers || [],
    notes:       sp.notes || ""
  };
}

// ============================================================
// Dual-write 미러 (fire-and-forget · 절대 throw 안 함)
// ============================================================

/**
 * saveInvoice 미러 — save_invoice_tx RPC 1회 (supplier upsert → invoice
 * → items → species upsert 가 서버에서 원자 실행).
 *
 * @param {object} invoice        앱 shape Invoice (id 포함)
 * @param {Array}  items          앱 shape InvoiceItem[] (이 invoice 의 것)
 * @param {Array}  referencedSpecies  items 가 참조하는 Species 전체
 *                 (신규+기존 — 서버에 없으면 FK 가 깨지므로 함께 upsert.
 *                  rpc 의 on conflict do nothing 이 기존 행을 보호)
 */
export async function mirrorSaveInvoice(invoice, items, referencedSpecies = []) {
  if (!isCloudConfigured()) return { ok: false, skipped: true };
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("save_invoice_tx", {
      p_invoice:     invoiceToRpc(invoice),
      p_items:       items.map(itemToRpc),
      p_new_species: referencedSpecies.map(speciesToRpc)
    });
    if (error) throw error;
    console.info("[cloud] saveInvoice mirrored:", data?.invoiceId || invoice.id);
    return { ok: true, data };
  } catch (err) {
    console.warn("[cloud] saveInvoice mirror failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * updateInvoice 미러 — Cloud 의 현재 version 을 조회해 낙관적 잠금으로
 * update_invoice_tx 호출. Cloud 에 행이 없으면(아직 미러 전) save 로 백필.
 */
export async function mirrorUpdateInvoice(invoice, items, referencedSpecies = []) {
  if (!isCloudConfigured()) return { ok: false, skipped: true };
  try {
    const supabase = await getSupabase();

    // 참조 species 선-upsert (기존 행은 ignoreDuplicates 로 보호)
    if (referencedSpecies.length) {
      const { error: spErr } = await supabase
        .from("species")
        .upsert(referencedSpecies.map(speciesToDb),
                { onConflict: "id", ignoreDuplicates: true });
      if (spErr) console.warn("[cloud] species upsert warn:", spErr.message);
    }

    const { data: row, error: verErr } = await supabase
      .from("invoices").select("version").eq("id", invoice.id).maybeSingle();
    if (verErr) throw verErr;

    if (!row) {
      // Cloud 에 아직 없음 — save 로 백필.
      return await mirrorSaveInvoice(invoice, items, referencedSpecies);
    }

    const { data, error } = await supabase.rpc("update_invoice_tx", {
      p_invoice_id:       invoice.id,
      p_expected_version: row.version,
      p_invoice:          invoiceToRpc(invoice),
      p_items:            items.map(itemToRpc)
    });
    if (error) throw error;
    console.info("[cloud] updateInvoice mirrored:", invoice.id, "v" + data?.version);
    return { ok: true, data };
  } catch (err) {
    console.warn("[cloud] updateInvoice mirror failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/** deleteInvoice 미러 — Cloud 에 없으면(NOT_FOUND) 이미 삭제된 것으로 보고 성공. */
export async function mirrorDeleteInvoice(invoiceId) {
  if (!isCloudConfigured()) return { ok: false, skipped: true };
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc("delete_invoice_tx", {
      p_invoice_id: invoiceId
    });
    if (error && !/NOT_FOUND/.test(error.message || "")) throw error;
    console.info("[cloud] deleteInvoice mirrored:", invoiceId);
    return { ok: true };
  } catch (err) {
    console.warn("[cloud] deleteInvoice mirror failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * saveSpecies 미러 (T6 Phase 2) — 수종 기본 정보만 Cloud 에 upsert.
 * species 테이블은 RLS 로 authenticated upsert 허용. 합성 invoice 는
 * Cloud 재구성하지 않는다(구매 데이터는 invoice CRUD 로 유지 · 승인 범위).
 *
 * @param {object} species  앱 shape Species (id 포함)
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
 */
export async function mirrorSaveSpecies(species) {
  if (!isCloudConfigured()) return { ok: false, skipped: true };
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("species")
      .upsert(speciesToDb(species), { onConflict: "id" });
    if (error) throw error;
    console.info("[cloud] saveSpecies mirrored:", species.id);
    return { ok: true };
  } catch (err) {
    console.warn("[cloud] saveSpecies mirror failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// ============================================================
// 읽기 — fetchAll (T6 읽기 전환에서 사용 · T4 에서는 미사용)
// ============================================================

/**
 * Cloud 전체를 앱 shape 로 반환. storage.load() 와 동일한 모양이되
 * categories/colors(meta)는 로컬 관리이므로 포함하지 않는다 — 호출자가
 * 기존 meta 와 병합한다.
 *
 * @returns {Promise<{species:[],invoices:[],invoiceItems:[]}|null>}
 */
export async function fetchAll() {
  if (!isCloudConfigured()) return null;
  const supabase = await getSupabase();

  const [sp, inv, items, atts] = await Promise.all([
    supabase.from("species").select("*").order("id"),
    supabase.from("invoices").select("*").order("invoice_date", { ascending: false }),
    supabase.from("invoice_items").select("*"),
    supabase.from("attachments").select("*")
  ]);
  for (const r of [sp, inv, items, atts]) {
    if (r.error) throw new Error("[cloud] fetchAll failed: " + r.error.message);
  }

  const attachmentByInvoice = new Map();
  for (const a of atts.data) attachmentByInvoice.set(a.invoice_id, a);

  return {
    species:      sp.data.map(speciesFromDb),
    invoices:     inv.data.map(r => invoiceFromDb(r, attachmentByInvoice)),
    invoiceItems: items.data.map(itemFromDb)
  };
}
