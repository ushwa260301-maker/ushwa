(() => {
  // ==== State ====
  const state = {
    step: 1,
    file: null,
    text: "",
    supplier: { name: "", region: "", contact: "" },
    candidates: [] // { name, spec, unit, price, targetId (null|id|"new") }
  };

  const els = {};

  function open() {
    resetAll();
    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    goTo(1);
  }
  function close() {
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
  }
  function resetAll() {
    state.file = null;
    state.text = "";
    state.supplier = { name: "", region: "", contact: "" };
    state.candidates = [];
    els.docFile.value = "";
    els.ocrText.value = "";
    setProgress(0, "준비 중…");
    els.impSupName.value = "";
    els.impSupRegion.value = "";
    els.impSupContact.value = "";
    els.candBody.innerHTML = "";
  }
  function goTo(n) {
    state.step = n;
    els.modal.querySelectorAll(".step").forEach(el => {
      const s = Number(el.dataset.step);
      el.classList.toggle("active", s === n);
      el.classList.toggle("done", s < n);
    });
    els.modal.querySelectorAll(".step-panel").forEach(p => {
      p.hidden = Number(p.dataset.panel) !== n;
    });
  }
  function setProgress(pct, status) {
    els.ocrFill.style.width = `${Math.round(pct * 100)}%`;
    els.ocrPercent.textContent = `${Math.round(pct * 100)}%`;
    if (status) els.ocrStatus.textContent = status;
  }

  // ==== Extraction ====
  async function extract(file) {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      return extractPdf(file);
    }
    return extractImage(file);
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) throw new Error("PDF.js가 로드되지 않았습니다.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    setProgress(0.05, "PDF 열기…");
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const numPages = pdf.numPages;
    let combined = "";
    let anyText = false;
    for (let i = 1; i <= numPages; i++) {
      setProgress(0.05 + 0.4 * (i - 1) / numPages, `PDF 텍스트 추출 (${i}/${numPages})`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(it => it.str).join("\n").trim();
      if (pageText.length > 20) {
        anyText = true;
        combined += pageText + "\n\n";
      } else {
        // Rasterize + OCR fallback
        setProgress(0.05 + 0.4 * (i - 0.5) / numPages, `스캔 PDF 감지, ${i}쪽 OCR 준비…`);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const ocrText = await ocrImageData(canvas, (m) => {
          const base = 0.05 + 0.4 * (i - 1) / numPages;
          const scoped = 0.4 * m / numPages;
          setProgress(base + scoped, `${i}쪽 OCR (${Math.round(m * 100)}%)`);
        });
        combined += ocrText + "\n\n";
      }
    }
    setProgress(1.0, anyText ? "완료 (내장 텍스트)" : "완료 (OCR)");
    return combined.trim();
  }

  async function extractImage(file) {
    const url = URL.createObjectURL(file);
    try {
      setProgress(0.05, "이미지 로드…");
      const img = await loadImage(url);
      return await ocrImageData(img, (m) => setProgress(0.05 + 0.9 * m, `OCR 진행 (${Math.round(m * 100)}%)`));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function ocrImageData(source, onProgress) {
    if (!window.Tesseract) throw new Error("Tesseract.js가 로드되지 않았습니다.");
    setProgress(0.1, "OCR 엔진 로드 중… (최초 실행 시 언어 데이터 다운로드)");
    const result = await Tesseract.recognize(source, "kor+eng", {
      logger: m => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          onProgress?.(m.progress);
        } else if (m.status && m.status !== "recognizing text") {
          els.ocrStatus.textContent = m.status;
        }
      }
    });
    setProgress(1.0, "완료");
    return result.data.text || "";
  }

  // ==== Parsing ====
  const SPEC_RE = /(?:R\s?\d+(?:\.\d+)?|H\s?\d+(?:\.\d+)?|B\s?\d+(?:\.\d+)?|W\s?\d+(?:\.\d+)?|\d+\s?(?:분|포트|주|본|치|㎝|cm|㎜|mm|m))/gi;
  const PRICE_RE = /(?:\d{1,3}(?:,\d{3})+|\d{4,})(?:\s?원)?/g;
  const PHONE_RE_G = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
  const PHONE_TEST_RE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;
  const MOBILE_PREFIX_RE = /^01[016789]/;
  const PROVINCE_RE = /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청?[북남]?|충남|충북|전라?[북남]?|전남|전북|경상?[북남]?|경남|경북|제주)/;
  // 개행 제외 (literal space)
  const ADDRESS_LINE_RE = new RegExp(`(?:${PROVINCE_RE.source})[가-힣 \\d\\-()·]*?(?:시|군|구)[가-힣 \\d\\-()·]*?(?:동|면|리|로|길)[가-힣 \\d\\-()·]*`, "g");
  const REGION_HINT_RE = new RegExp(`${PROVINCE_RE.source}[가-힣 \\d]*?[시군구]`);
  const UNIT_HINT_RE = /(?:^|\s)(주|포트|본|그루|치|개|EA)(?:\s|$)/;
  const BIZ_SUFFIX_KEYWORDS = ["농원", "수목원", "원예", "농장", "조합", "산업", "㈜", "주식회사", "회사", "상사", "화훼"];
  const BIZ_KEYWORD_RE = /(?:상호|업체명|공급자|공급업체|사업자명)\s*[:.\-–]?\s*([가-힣A-Za-z0-9()\s㈜]{2,40})/;
  const ADDRESS_KEYWORD_RE = /(?:주소|소재지|사업장\s*소재지|address)\s*[:.\-–]?\s*([^\n]+)/i;
  const MOBILE_KEYWORD_RE = /(?:핸드폰|휴대(?:폰|전화)|모바일|H\.?P|Mobile)\s*[:.\-–]?\s*(01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4})/i;
  const HEADER_LINE_RE = /^(?:상호|업체명|공급자|공급업체|사업자|사업자번호|주소|소재지|사업장|핸드폰|휴대|전화|TEL|Tel|FAX|Fax|팩스|대표자|담당자|발행일|일자|번호|합계|총계|부가세|VAT|세금)/i;

  function parseText(text) {
    const supplier = detectSupplier(text);
    const rows = extractCandidateRows(text);
    return { supplier, rows };
  }

  function normalizePhone(p) {
    return p.replace(/[.\s]/g, "-");
  }
  function digitsOnly(p) {
    return p.replace(/[^\d]/g, "");
  }

  function detectSupplier(text) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const head = lines.slice(0, 20);
    const headText = head.join("\n");

    // 상호(business name): 라벨 우선 → 회사형 접미어 → 첫 유의미한 한글 라인
    let name = "";
    const bizKey = headText.match(BIZ_KEYWORD_RE);
    if (bizKey) {
      name = bizKey[1].replace(/\s+/g, " ").trim();
      const suf = name.match(BIZ_SUFFIX_RE);
      if (suf) name = suf[0];
    }
    if (!name) {
      for (const l of head) {
        if (BIZ_SUFFIX_KEYWORDS.some(k => l.includes(k))) {
          // 라인 전체를 상호로 (전화번호/기타 정보 라인 제외)
          if (PHONE_TEST_RE.test(l)) continue;
          if (HEADER_LINE_RE.test(l)) continue;
          name = l.replace(/[·]+/g, " ").replace(/\s+/g, " ").trim();
          // 뒤쪽에 다른 필드가 붙어있으면 자르기
          name = name.split(/(?:대표자|사업자|주소|소재지|전화|TEL|FAX|핸드폰|휴대전화)/i)[0].trim();
          if (name.length >= 2 && name.length <= 30) break;
          name = "";
        }
      }
    }

    // 핸드폰 번호: 라벨 우선 → 010 접두 → 아무 전화번호
    let contact = "";
    const mobileKey = text.match(MOBILE_KEYWORD_RE);
    if (mobileKey) {
      contact = normalizePhone(mobileKey[1]);
    } else {
      const phones = [...text.matchAll(PHONE_RE_G)].map(m => m[0]);
      const mobile = phones.find(p => MOBILE_PREFIX_RE.test(digitsOnly(p)));
      contact = normalizePhone(mobile || phones[0] || "");
    }

    // 사업장 소재지: 라벨 우선 → 전체 주소 라인 → 광역시/도+시/군/구
    let region = "";
    const addrKey = headText.match(ADDRESS_KEYWORD_RE);
    if (addrKey) {
      region = addrKey[1].replace(/\s+/g, " ").trim();
    }
    if (!region) {
      const full = text.match(ADDRESS_LINE_RE);
      if (full && full[0]) region = full[0].replace(/\s+/g, " ").trim();
    }
    if (!region) {
      const short = text.match(REGION_HINT_RE);
      if (short) region = short[0].trim();
    }
    // 주소 정리: 뒤쪽에 다른 정보가 붙어있으면 자르기
    region = region
      .split(/(?:상호|대표자|사업자|전화|TEL|FAX|팩스|핸드폰|휴대전화)/i)[0]
      .replace(/[·]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return { name, region, contact };
  }

  const COLUMN_HEADER_WORDS = new Set([
    "품명", "품목", "규격", "수종", "단위", "단가", "수량", "금액", "번호", "합계", "총계", "적요", "비고"
  ]);

  function extractCandidateRows(text) {
    const rows = [];
    const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    for (const line of lines) {
      // 헤더/수급처 메타 라인은 후보로 넣지 않음
      if (HEADER_LINE_RE.test(line)) continue;
      if (PHONE_TEST_RE.test(line)) continue;
      if (!/[가-힣]{2,}/.test(line)) continue;

      // 토큰화 후 순수 한글 토큰 중 컬럼헤더가 아닌 첫 토큰을 품목명으로
      const tokens = line.split(/\s+/);
      const nameTok = tokens.find(t => /^[가-힣]{2,15}$/.test(t) && !COLUMN_HEADER_WORDS.has(t));
      if (!nameTok) continue;

      const specs = [...line.matchAll(SPEC_RE)].map(m => m[0].trim().replace(/\s+/g, ""));
      const prices = [...line.matchAll(PRICE_RE)]
        .map(m => normalizePrice(m[0]))
        .filter(p => p != null && p >= 100);
      if (!specs.length && !prices.length) continue;

      const spec = specs[0] || "";
      // 단위 추정
      let unit = "";
      const unitMatch = line.match(UNIT_HINT_RE);
      if (unitMatch) unit = unitMatch[1];
      if (!unit && /\d+\s?포트/.test(spec)) unit = "포트";
      if (!unit && /R\s?\d/.test(spec)) unit = "주";
      if (!unit && /H\s?\d/.test(spec)) unit = "주";

      // 단가: 여러 숫자면 통상 [수량, 단가, 금액] 순, 최솟값이 대체로 수량이 아닌 단가가 되도록 100 이상만 통과.
      // 3개 이상이면 중간값 선호(단가), 2개면 작은쪽(단가), 1개면 그것.
      let price;
      const sorted = [...prices].sort((a, b) => a - b);
      if (sorted.length >= 3) price = sorted[Math.floor(sorted.length / 2)];
      else if (sorted.length === 2) price = sorted[0];
      else if (sorted.length === 1) price = sorted[0];
      else price = null;
      if (price == null) continue;

      rows.push({ name: nameTok, spec, unit, price, targetId: "new" });
    }
    return dedupeRows(rows);
  }

  function normalizePrice(str) {
    const digits = str.replace(/[^\d]/g, "");
    if (!digits) return null;
    return Number(digits);
  }

  function dedupeRows(rows) {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const key = `${r.name}|${r.spec}|${r.price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  // ==== Candidate table UI ====
  function isRowComplete(r) {
    return !!(r.name && r.spec && r.price != null && !Number.isNaN(Number(r.price)) && Number(r.price) >= 0);
  }
  function updateCandCount() {
    const total = state.candidates.length;
    const ok = state.candidates.filter(isRowComplete).length;
    const missing = total - ok;
    if (!total) {
      els.candCount.textContent = "";
    } else if (missing) {
      els.candCount.textContent = `· 총 ${total}건 (완전 ${ok} · 누락 ${missing})`;
    } else {
      els.candCount.textContent = `· 총 ${total}건 (모두 완전)`;
    }
  }
  function updateRowState(tr, row) {
    tr.classList.toggle("incomplete", !isRowComplete(row));
  }
  function renderCandidates() {
    const tbody = els.candBody;
    tbody.innerHTML = "";
    els.candEmpty.hidden = state.candidates.length > 0;
    updateCandCount();
    if (!state.candidates.length) return;

    const species = window.SpeciesCatalog.getData().species;
    state.candidates.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.idx = String(idx);
      const chk = `<td><input type="checkbox" data-idx="${idx}" class="cand-chk" checked /></td>`;
      const name = `<td><input type="text" data-idx="${idx}" data-field="name" value="${escapeAttr(row.name)}" placeholder="필수" /></td>`;
      const spec = `<td><input type="text" data-idx="${idx}" data-field="spec" value="${escapeAttr(row.spec)}" placeholder="필수" /></td>`;
      const unit = `<td><input type="text" data-idx="${idx}" data-field="unit" value="${escapeAttr(row.unit)}" /></td>`;
      const price = `<td><input type="number" data-idx="${idx}" data-field="price" value="${row.price ?? ""}" min="0" placeholder="필수" /></td>`;
      let opts = `<option value="new">새 수종</option>`;
      species.forEach(sp => {
        const sel = row.targetId === sp.id ? " selected" : "";
        opts += `<option value="${sp.id}"${sel}>${escapeAttr(sp.name)}</option>`;
      });
      const target = `<td><select data-idx="${idx}" data-field="targetId">${opts}</select></td>`;
      tr.innerHTML = chk + name + spec + unit + price + target;
      updateRowState(tr, row);
      tbody.appendChild(tr);
    });

    // Auto-match by name suggestion
    state.candidates.forEach((row, idx) => {
      if (row.targetId !== "new") return;
      const match = species.find(sp => sp.name === row.name);
      if (match) {
        row.targetId = match.id;
        const sel = tbody.querySelector(`select[data-idx="${idx}"]`);
        if (sel) sel.value = match.id;
      }
    });
  }
  function escapeAttr(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // ==== Apply ====
  function apply() {
    // 1) 수급처 필수 검증 (상호·소재지·핸드폰)
    const supplier = {
      name: els.impSupName.value.trim(),
      region: els.impSupRegion.value.trim(),
      contact: els.impSupContact.value.trim()
    };
    const missing = [];
    if (!supplier.name) missing.push("상호");
    if (!supplier.region) missing.push("사업장 소재지");
    if (!supplier.contact) missing.push("핸드폰 번호");
    if (missing.length) {
      alert(`수급처 필수 정보가 누락되었습니다: ${missing.join(", ")}\n(모두 반영 규칙상 필수)`);
      (missing[0] === "상호" ? els.impSupName
        : missing[0] === "사업장 소재지" ? els.impSupRegion
        : els.impSupContact).focus();
      return;
    }

    // 2) 선택된 항목 수집
    const selectedIdx = [];
    els.candBody.querySelectorAll(".cand-chk").forEach(chk => {
      if (chk.checked) selectedIdx.push(Number(chk.dataset.idx));
    });
    if (!selectedIdx.length) {
      window.SpeciesCatalog.toast("반영할 항목을 선택하세요");
      return;
    }

    // 3) 품목·규격·단가 필수 검증 → 완전한 행만 반영
    const selected = selectedIdx.map(i => state.candidates[i]);
    const valid = selected.filter(isRowComplete);
    const invalid = selected.length - valid.length;
    if (!valid.length) {
      alert("반영 가능한 항목이 없습니다. 품목·규격·단가는 필수입니다.");
      return;
    }
    if (invalid > 0) {
      if (!confirm(`${invalid}건은 품목/규격/단가 중 누락이 있어 제외됩니다.\n나머지 ${valid.length}건을 반영할까요?`)) return;
    }

    // 4) 대상별 그룹핑 후 반영
    const groups = new Map();
    valid.forEach(row => {
      const key = row.targetId || "new";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    let added = 0, updated = 0;
    groups.forEach((rows, key) => {
      const cleanPrices = rows.map(r => ({
        spec: r.spec.trim(),
        unit: (r.unit || "주").trim(),
        price: Number(r.price)
      }));
      if (key === "new") {
        const byName = new Map();
        rows.forEach(r => {
          if (!byName.has(r.name)) byName.set(r.name, []);
          byName.get(r.name).push(r);
        });
        byName.forEach((rs, name) => {
          const prices = rs.map(r => ({
            spec: r.spec.trim(),
            unit: (r.unit || "주").trim(),
            price: Number(r.price)
          }));
          const cats = window.SpeciesCatalog.getData().categories;
          const category = cats[0] || "교목";
          window.SpeciesCatalog.ensureCategory(category);
          window.SpeciesCatalog.createSpecies({
            name,
            scientificName: "",
            category,
            bloomMonths: [],
            colors: [],
            prices,
            suppliers: [supplier],
            notes: "명세서에서 자동 등록됨"
          });
          added++;
        });
      } else {
        window.SpeciesCatalog.updateSpecies(key, (sp) => {
          const existingKeys = new Set((sp.prices || []).map(p => `${p.spec}|${p.unit}|${p.price}`));
          cleanPrices.forEach(np => {
            const k = `${np.spec}|${np.unit}|${np.price}`;
            if (!existingKeys.has(k)) sp.prices = [...(sp.prices || []), np];
          });
          // 수급처: 상호+연락처 조합으로 중복 판별
          const supKey = `${supplier.name}|${supplier.contact}`;
          const supKeys = new Set((sp.suppliers || []).map(s => `${s.name}|${s.contact}`));
          if (!supKeys.has(supKey)) {
            sp.suppliers = [...(sp.suppliers || []), supplier];
          }
          return sp;
        });
        updated++;
      }
    });

    window.SpeciesCatalog.toast(`${added}건 추가, ${updated}건 업데이트`);
    close();
  }

  // ==== Wiring ====
  function attach() {
    document.getElementById("importDocBtn").addEventListener("click", () => {
      if (!window.Tesseract || !window.pdfjsLib) {
        alert("OCR/PDF 라이브러리 로드가 아직 안 됐습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      open();
    });
    els.modal.addEventListener("click", (e) => {
      if (e.target.matches("[data-close-importer]")) close();
      if (e.target.matches("[data-goto]")) goTo(Number(e.target.dataset.goto));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.modal.hidden) close();
    });

    els.docFile.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      state.file = file;
      goTo(2);
      setProgress(0, "시작…");
      els.ocrText.value = "";
      try {
        const text = await extract(file);
        state.text = text;
        els.ocrText.value = text;
      } catch (err) {
        console.error(err);
        alert("추출 실패: " + err.message);
        goTo(1);
      }
    });

    els.parseBtn.addEventListener("click", () => {
      state.text = els.ocrText.value;
      if (!state.text.trim()) {
        alert("텍스트가 비어 있습니다.");
        return;
      }
      const { supplier, rows } = parseText(state.text);
      state.supplier = supplier;
      state.candidates = rows;
      els.impSupName.value = supplier.name || "";
      els.impSupRegion.value = supplier.region || "";
      els.impSupContact.value = supplier.contact || "";
      renderCandidates();
      goTo(3);
    });

    els.candBody.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      if (Number.isNaN(idx) || !field) return;
      if (field === "price") state.candidates[idx][field] = e.target.value === "" ? null : Number(e.target.value);
      else state.candidates[idx][field] = e.target.value;
      const tr = els.candBody.querySelector(`tr[data-idx="${idx}"]`);
      if (tr) updateRowState(tr, state.candidates[idx]);
      updateCandCount();
    });
    els.candBody.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      if (field === "targetId") state.candidates[idx].targetId = e.target.value;
    });
    document.getElementById("candAll").addEventListener("change", (e) => {
      const on = e.target.checked;
      els.candBody.querySelectorAll(".cand-chk").forEach(chk => { chk.checked = on; });
    });

    els.applyBtn.addEventListener("click", apply);
  }

  // Public utilities for other modules (e.g., species add modal)
  window.SpeciesImporter = {
    extract,
    parseText,
    detectSupplier,
    extractCandidateRows
  };

  function init() {
    els.modal = document.getElementById("importerModal");
    els.docFile = document.getElementById("docFile");
    els.ocrText = document.getElementById("ocrText");
    els.ocrFill = document.getElementById("ocrFill");
    els.ocrPercent = document.getElementById("ocrPercent");
    els.ocrStatus = document.getElementById("ocrStatus");
    els.parseBtn = document.getElementById("parseBtn");
    els.applyBtn = document.getElementById("applyBtn");
    els.impSupName = document.getElementById("impSupplierName");
    els.impSupRegion = document.getElementById("impSupplierRegion");
    els.impSupContact = document.getElementById("impSupplierContact");
    els.candBody = document.getElementById("candBody");
    els.candCount = document.getElementById("candCount");
    els.candEmpty = document.getElementById("candEmpty");
    attach();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
