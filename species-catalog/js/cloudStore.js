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
import { normSupplierName } from "./supplierMatcher.js";

/** 첨부 원본이 올라가는 Storage 버킷 이름 (supabase/storage.sql 로 생성). */
const ATTACHMENT_BUCKET = "attachments";

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
    // PK 충돌은 다른 실패와 성격이 다르다 — 재시도해도 영원히 실패하고,
    // 그 id 의 Cloud 행은 **다른 문서**다. 호출자가 덮어쓰기로 우회하지
    // 않도록 conflict 로 표시해 돌려준다 (syncManager.js 상단 참조).
    if (isUniqueViolation(err)) {
      console.error("[cloud] saveInvoice 충돌 — 같은 id 가 Cloud 에 이미 있음:",
                    invoice.id, "·", err?.message || err);
      return { ok: false, conflict: true, error: err?.message || String(err) };
    }
    console.warn("[cloud] saveInvoice mirror failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * PostgreSQL unique_violation(23505) 인지 — PK/UNIQUE 충돌 판정.
 *
 * PostgREST 는 SQLSTATE 를 `code` 로 그대로 전달한다. 다만 SDK 버전이나
 * 래핑 경로에 따라 code 가 비는 경우가 있어 메시지도 함께 본다.
 * `isAlreadyExists()` 와 별개인 이유: 그쪽은 Storage 의 HTTP 409 판정이다.
 */
function isUniqueViolation(err) {
  if (!err) return false;
  if (String(err.code || "") === "23505") return true;
  return /duplicate key value|violates unique constraint/i.test(String(err.message || ""));
}

/**
 * 같은 id 의 Cloud 행이 **다른 문서**로 판정되는 시각 차이 (ms).
 *
 * 실측 근거 (2026-08-03 · inv-066~068 사고 데이터)
 *   같은 레코드   |Δ| = 2 ~ 3 초      (로컬 저장 → 서버 insert 사이 지연)
 *   다른 레코드    Δ = 2,912 ~ 3,116 초
 * 세 자릿수로 벌어져 있어 임계값 선택이 결과를 좌우하지 않는다.
 */
export const INVOICE_CREATED_AT_TOLERANCE_MS = 300_000;   // 300초

/**
 * 로컬 invoice 와 Cloud 행이 서로 다른 문서인지 — id 재사용 감지.
 *
 * `invoices.created_at` 은 update_invoice_tx 가 건드리지 않으므로 그 행이
 * 처음 만들어진 시각을 유지한다. 그리고 `invoiceFromDb()` 가 Cloud 값을
 * 그대로 `invoice.createdAt` 에 복원하므로, **Cloud 에서 읽어온 레코드를
 * 수정하는 정상 경로는 차이가 정확히 0** 이다. 로컬에서 갓 만든 레코드만
 * 클라이언트 시각 vs 서버 시각 차이(수 초)를 갖는다.
 *
 * 판정 불가(둘 중 하나라도 없거나 파싱 실패)면 **false** 를 돌려준다 —
 * 가드가 없던 때와 같은 동작을 유지하기 위해서다. createdAt 이 없는
 * 오래된 로컬 레코드가 수정 자체를 못 하게 되는 편이 더 나쁘다.
 *
 * @param {string|undefined} localCreatedAt   앱 shape invoice.createdAt (ISO)
 * @param {string|undefined} cloudCreatedAt   invoices.created_at (ISO)
 * @param {number} [toleranceMs]
 * @returns {boolean} true = 다른 문서 → 덮어쓰면 안 된다
 */
export function isDifferentInvoiceRecord(localCreatedAt, cloudCreatedAt,
                                         toleranceMs = INVOICE_CREATED_AT_TOLERANCE_MS) {
  const a = Date.parse(localCreatedAt ?? "");
  const b = Date.parse(cloudCreatedAt ?? "");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;   // 비교 불가 → 기존 동작
  return Math.abs(a - b) > toleranceMs;
}

/**
 * updateInvoice 미러 — Cloud 의 현재 version 을 조회해 낙관적 잠금으로
 * update_invoice_tx 호출. Cloud 에 행이 없으면(아직 미러 전) save 로 백필.
 *
 * id 재사용 가드
 *   낙관적 잠금(`p_expected_version`)은 직전에 읽은 version 을 넘기므로
 *   "다른 사용자의 동시 수정"만 막는다. **"이 행이 애초에 내 것인가"는
 *   검사하지 않는다.** localStorage 가 되감겨 이미 쓰인 id 가 재발급되면
 *   (실환경 inv-066~068), 재시도가 남의 거래명세서를 헤더째 덮고
 *   update_invoice_tx 가 items 를 전량 교체해 원본 품목이 사라진다.
 *   그래서 created_at 을 함께 읽어 다른 문서면 중단한다.
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
      .from("invoices").select("version, created_at").eq("id", invoice.id).maybeSingle();
    if (verErr) throw verErr;

    if (!row) {
      // Cloud 에 아직 없음 — save 로 백필.
      return await mirrorSaveInvoice(invoice, items, referencedSpecies);
    }

    // id 재사용 가드 — 덮어쓰기 직전의 마지막 방어선.
    if (isDifferentInvoiceRecord(invoice.createdAt, row.created_at)) {
      console.error("[cloud] updateInvoice 중단 — 같은 id 의 Cloud 행이 다른 문서입니다:",
                    invoice.id, "· 로컬 created", invoice.createdAt,
                    "· Cloud created", row.created_at);
      return {
        ok: false, conflict: true, guarded: true,
        error: `ID_REUSE_GUARD: ${invoice.id} 의 Cloud 행은 다른 거래명세서입니다 ` +
               `(로컬 ${invoice.createdAt} · Cloud ${row.created_at})`
      };
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

/**
 * saveAttachment 미러 (T8) — 원본 파일을 Storage 에 올리고 attachments 메타를
 * INSERT 한다. IndexedDB 경로는 그대로 두고 Cloud 사본만 추가하는 것이므로,
 * 실패해도 로컬 blob·invoice 저장에는 영향이 없다(never throw).
 *
 * · Cloud attachments.id 는 IndexedDB 와 동일한 att-<hex> 를 사용한다 —
 *   Cloud-first read 이후에도 뷰어가 같은 id 로 로컬 blob 을 찾기 때문.
 * · storage_path 는 사용자 파일명을 쓰지 않고 확장자만 취한다(sanitize).
 *     attachments/<invoiceId>/<attachmentId>.<ext>
 *   원본 파일명은 attachments.filename 컬럼에만 보관한다.
 *
 * @param {object} meta  putAttachment() 반환 메타 (id·filename·mimeType·size)
 * @param {string} invoiceId
 * @param {File|Blob} file 원본 파일
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
 */
export async function mirrorSaveAttachment(meta, invoiceId, file) {
  if (!isCloudConfigured()) return { ok: false, skipped: true };
  if (!meta?.id || !invoiceId || !file) {
    return { ok: false, error: "attachment 정보 부족" };
  }
  try {
    const supabase = await getSupabase();
    const path = buildStoragePath(invoiceId, meta.id, meta.filename);

    // upsert 를 쓰지 않는다. storage.sql 이 "첨부 원본은 불변" 계약으로
    // storage.objects 의 UPDATE 정책을 만들지 않으므로, upsert 는 객체가
    // 이미 있을 때 UPDATE 경로로 들어가 RLS 에 막힌다. 그 조합은 실제로
    // 발생했다 — 업로드는 성공했는데 아래 메타 insert 가 FK 로 실패하면,
    // 이후 모든 재시도가 "new row violates row-level security policy" 로
    // 영구 거부된다(2026-07-30 실환경). 순수 INSERT 로 올리고 "이미 존재"
    // 만 성공으로 흘린다 — 바로 아래 메타 insert 와 동일한 패턴이다.
    const { error: upErr } = await supabase
      .storage.from(ATTACHMENT_BUCKET)
      .upload(path, file, { contentType: meta.mimeType || "application/octet-stream" });
    if (upErr && !isAlreadyExists(upErr)) throw upErr;

    // 메타는 UPDATE 정책이 없으므로(불변) 이미 있으면 그대로 성공 처리.
    const { error: insErr } = await supabase.from("attachments").insert({
      id:             meta.id,
      invoice_id:     invoiceId,
      filename:       meta.filename || "",
      mime_type:      meta.mimeType || "application/octet-stream",
      size_bytes:     Number(meta.size) || 0,
      storage_path:   path,
      thumbnail_path: ""
    });
    if (insErr && !/duplicate key|already exists/i.test(insErr.message || "")) throw insErr;

    console.info("[cloud] saveAttachment mirrored:", meta.id, path);
    return { ok: true };
  } catch (err) {
    console.warn("[cloud] saveAttachment mirror failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * OCR 학습 데이터 미러 (T9) — `ocr_corrections` 에 1행 append.
 *
 * 왜 필요한가: OCR 결과(`invoice.analysis`)는 지금까지 로컬에만 있었다.
 * `invoiceToRpc()` 가 보내지 않고 `invoiceFromDb()` 가 복원하지 않으므로,
 * Cloud-first read 가 로컬 캐시를 갱신하는 순간 사라졌다. 이 함수가
 * 그 데이터를 영구 저장소로 옮긴다 — OCR 은 "읽는" 기능이 아니라 학습
 * 데이터를 만드는 엔진이라는 계약의 실제 배선이다.
 *
 * `ocr_corrections` 는 INSERT-ONLY 다(policies.sql: UPDATE/DELETE 정책
 * 부재 = DB 레벨 거부). 따라서 이 호출은 기존 행을 절대 건드리지 않는다.
 *
 * 멱등성: `id` 가 `gen_random_uuid()` 기본값이라 재호출하면 중복 행이
 * 생긴다. 그래서 삽입 전에 같은 invoice 의 행이 있는지 확인하고 있으면
 * skip 한다. (스키마의 `version` 컬럼은 향후 "수정할 때마다 새 행" 용도로
 * 남겨두고, T9 에서는 최초 1행만 기록한다.)
 *
 * FK 주의: `invoice_id → invoices(id)` 이므로 **invoice 미러 이후**에
 * 호출해야 한다.
 *
 * @param {string} invoiceId
 * @param {object} analysis  vision.js analyzeInvoice() 결과 (`_debug` 포함)
 * @param {object} header    사용자가 수정한 거래 헤더
 * @param {Array}  items     사용자가 수정한 품목 행
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
 */
export async function mirrorSaveOcrCorrection(invoiceId, analysis, header, items) {
  if (!isCloudConfigured()) return { ok: false, skipped: true };
  if (!invoiceId || !analysis) return { ok: false, skipped: true };
  try {
    const supabase = await getSupabase();

    const { data: existing, error: selErr } = await supabase
      .from("ocr_corrections").select("id").eq("invoice_id", invoiceId).limit(1);
    if (selErr) throw selErr;
    if (existing && existing.length) {
      console.info("[cloud] saveOcrCorrection skipped — 이미 기록됨:", invoiceId);
      return { ok: true, skipped: true };
    }

    const dbg = analysis._debug || {};
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("ocr_corrections").insert({
      invoice_id:      invoiceId,
      version:         1,
      raw_text:        dbg.raw?.text || "",
      normalized_text: dbg.raw?.normalized || "",
      parsed_fields: {
        supplier:      analysis.supplier ?? null,
        rows:          analysis.rows ?? [],
        invoiceDate:   analysis.invoiceDate ?? "",
        invoiceNumber: analysis.invoiceNumber ?? ""
      },
      user_edited_fields: { header, items },
      debug_meta:         stripHeavyDebug(dbg),
      engine_version:     dbg.model || "",
      uploaded_by:        userData?.user?.id || null
    });
    if (error) throw error;

    console.info("[cloud] saveOcrCorrection mirrored:", invoiceId,
                 "· confidence=", dbg.confidence ?? "n/a",
                 "· rawLen=", (dbg.raw?.text || "").length);
    return { ok: true };
  } catch (err) {
    console.warn("[cloud] saveOcrCorrection mirror failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * debug_meta 에서 data URL 썸네일을 제거한다.
 * `raw.originalImage` / `raw.preprocessedImage` 는 전처리 미리보기용
 * base64 이미지라 jsonb 행을 수백 KB 로 불린다 — 학습에 필요한 값도
 * 아니므로 저장하지 않는다. 원본 이미지는 Storage(attachments)에 있다.
 */
function stripHeavyDebug(dbg) {
  const raw = { ...(dbg.raw || {}) };
  delete raw.originalImage;
  delete raw.preprocessedImage;
  return { ...dbg, raw };
}

/**
 * "이미 같은 경로/키가 있다" 계열 오류인지 — 첨부는 불변이므로 이 경우는
 * 성공으로 간주한다(재시도 멱등성).
 * Supabase Storage 는 중복 업로드에 409 + "The resource already exists" 를
 * 돌려주지만 버전에 따라 문구가 "Duplicate" 로도 나오므로 상태코드도 함께 본다.
 */
function isAlreadyExists(err) {
  if (!err) return false;
  const msg = String(err.message || "");
  return /already exists|duplicate/i.test(msg) || String(err.statusCode || "") === "409";
}

/** 사용자 파일명을 경로에 쓰지 않는다 — 확장자만 취해 조립. */
function buildStoragePath(invoiceId, attachmentId, filename) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(filename || "");
  const ext = m ? m[1].toLowerCase() : "bin";
  return `${invoiceId}/${attachmentId}.${ext}`;
}

/**
 * deleteSpecies 미러 (T6 Phase 3) — 참조 없는 수종만 삭제.
 * Cloud `invoice_items.species_id → species` 는 cascade 가 아니므로,
 * Cloud 측 참조가 있으면 DB(FK)가 삭제를 거부한다(정책 iii 서버 백스톱).
 * 앱은 삭제 전 로컬 참조를 먼저 확인하지만, Cloud 측 참조가 있으면 여기서
 * FK 오류가 표면화된다.
 *
 * @param {string} speciesId
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
 */
export async function mirrorDeleteSpecies(speciesId) {
  if (!isCloudConfigured()) return { ok: false, skipped: true };
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from("species").delete().eq("id", speciesId);
    if (error) throw error;
    console.info("[cloud] deleteSpecies mirrored:", speciesId);
    return { ok: true };
  } catch (err) {
    console.warn("[cloud] deleteSpecies mirror failed:", err?.message || err);
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

  const [sp, inv, items, atts, sups, alias] = await Promise.all([
    supabase.from("species").select("*").order("id"),
    supabase.from("invoices").select("*").order("invoice_date", { ascending: false }),
    supabase.from("invoice_items").select("*"),
    supabase.from("attachments").select("*"),
    // 공급처 매칭용. suppliers 는 alias 를 기록할 때 실제 uuid 가 필요하고,
    // supplier_alias 는 기록해도 읽지 않으면 다음 명세서에서 효과가 없다.
    supabase.from("suppliers").select("id, name, norm_name"),
    supabase.from("supplier_alias").select("norm_alias, supplier_id, is_active")
  ]);
  for (const r of [sp, inv, items, atts]) {
    if (r.error) throw new Error("[cloud] fetchAll failed: " + r.error.message);
  }
  // suppliers / supplier_alias 는 부가 정보다. migration 이 아직 적용되지
  // 않은 환경에서도 기존 읽기 경로가 죽지 않도록 실패를 삼킨다.
  for (const [label, r] of [["suppliers", sups], ["supplier_alias", alias]]) {
    if (r.error) console.warn(`[cloud] ${label} 로드 실패(무시):`, r.error.message);
  }

  const attachmentByInvoice = new Map();
  for (const a of atts.data) attachmentByInvoice.set(a.invoice_id, a);

  return {
    species:      sp.data.map(speciesFromDb),
    invoices:     inv.data.map(r => invoiceFromDb(r, attachmentByInvoice)),
    invoiceItems: items.data.map(itemFromDb),
    suppliers:      sups.error  ? [] : (sups.data  || []),
    supplierAlias:  alias.error ? [] : (alias.data || [])
  };
}

/**
 * 공급처 alias 미러 — 사용자가 후보 목록에서 직접 고른 결과만 기록한다.
 * 자동 생성하지 않는다 (OCR_DATA_POLICY §5 규칙 1).
 *
 * `norm_alias` 는 반드시 `normSupplierName()` 결과여야 한다. DB 에
 * `check (norm_alias = fn_norm_supplier_name(alias_text))` 가 걸려 있어
 * 다르면 INSERT 가 거부된다 — 두 함수는 같은 공백 집합을 쓰도록 맞춰져 있다.
 *
 * 같은 alias→같은 공급처 재등록은 unique 위반(23505)이 나는데, 이미 기록된
 * 사실이므로 성공으로 처리한다.
 *
 * @param {string} aliasText   OCR 이 읽은 원문
 * @param {string} supplierId  suppliers.id (uuid)
 */
export async function mirrorSaveSupplierAlias(aliasText, supplierId) {
  if (!isCloudConfigured()) return { ok: false, skipped: true };
  const text = String(aliasText || "").trim();
  if (!text || !supplierId) return { ok: false, skipped: true };
  try {
    const supabase = await getSupabase();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("supplier_alias").insert({
      alias_text:  text,
      norm_alias:  normSupplierName(text),
      supplier_id: supplierId,
      source:      "user",
      created_by:  userData?.user?.id || null
    });
    if (error) {
      if (/duplicate key|23505/i.test(error.message || "")) {
        console.info("[cloud] supplierAlias 이미 기록됨:", text, "→", supplierId);
        return { ok: true, skipped: true };
      }
      throw error;
    }
    console.info("[cloud] supplierAlias mirrored:", text, "→", supplierId);
    return { ok: true };
  } catch (err) {
    console.warn("[cloud] supplierAlias mirror failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}
