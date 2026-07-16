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
  const PHONE_RE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;
  const REGION_HINT_RE = /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣\s\d]*?[시군구]/;
  const UNIT_HINT_RE = /(?:^|\s)(주|포트|본|그루|치|개|EA)(?:\s|$)/;

  function parseText(text) {
    const supplier = detectSupplier(text);
    const rows = extractCandidateRows(text);
    return { supplier, rows };
  }

  function detectSupplier(text) {
    const head = text.split(/\n/).slice(0, 10).join("\n");
    const phoneMatch = head.match(PHONE_RE) || text.match(PHONE_RE);
    const regionMatch = head.match(REGION_HINT_RE) || text.match(REGION_HINT_RE);
    // Try to find a company/farm name in first 4 lines (short-ish Korean line)
    let name = "";
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(6, lines.length); i++) {
      const l = lines[i];
      if (/[가-힣]{2,}(?:농원|수목원|원예|농장|조합|산업|주식회사|㈜|회사|상사)/.test(l)) {
        name = l.match(/[가-힣A-Za-z0-9]{2,}(?:농원|수목원|원예|농장|조합|산업|㈜|회사|상사)/)?.[0] || l;
        break;
      }
    }
    return {
      name: name,
      region: regionMatch ? regionMatch[0].trim() : "",
      contact: phoneMatch ? phoneMatch[0].replace(/[.\s]/g, "-") : ""
    };
  }

  function extractCandidateRows(text) {
    const rows = [];
    const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    for (const line of lines) {
      // Need at least: Korean text (name) + price OR spec
      if (!/[가-힣]{2,}/.test(line)) continue;
      const prices = [...line.matchAll(PRICE_RE)].map(m => normalizePrice(m[0])).filter(p => p != null && p >= 100);
      const specs = [...line.matchAll(SPEC_RE)].map(m => m[0].trim().replace(/\s+/g, ""));
      if (prices.length === 0 && specs.length === 0) continue;

      // Extract name: take Korean run at the start (before spec/price)
      const nameMatch = line.match(/^[^\d]*?([가-힣][가-힣A-Za-z\s()·]{1,20}[가-힣A-Za-z])/);
      let name = nameMatch ? nameMatch[1].trim() : "";
      // Clean common noise words
      name = name.replace(/^(품명|규격|수종|번호|No\.?)\s*[:.]?\s*/i, "").trim();
      if (!name || name.length < 2 || name.length > 25) continue;

      const spec = specs[0] || "";
      // Unit: look for word after spec or common unit tokens
      let unit = "";
      const unitMatch = line.match(UNIT_HINT_RE);
      if (unitMatch) unit = unitMatch[1];
      if (!unit && /\d+\s?포트/.test(spec)) unit = "포트";
      if (!unit && /R\s?\d/.test(spec)) unit = "주";
      if (!unit && /H\s?\d/.test(spec)) unit = "주";

      // Price: prefer the largest price on the line if there are multiple (usually 금액), else the one that looks like 단가
      // Heuristic: if 2+ prices and one is much larger, assume [단가, 금액] or [수량, 단가, 금액]. Pick the smallest that is >= 100.
      const price = prices.length ? Math.min(...prices) : null;
      if (price == null) continue;

      rows.push({ name, spec, unit, price, targetId: "new" });
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
  function renderCandidates() {
    const tbody = els.candBody;
    tbody.innerHTML = "";
    els.candCount.textContent = state.candidates.length ? `· ${state.candidates.length}건` : "";
    els.candEmpty.hidden = state.candidates.length > 0;
    if (!state.candidates.length) return;

    const species = window.SpeciesCatalog.getData().species;
    state.candidates.forEach((row, idx) => {
      const tr = document.createElement("tr");
      const chk = `<td><input type="checkbox" data-idx="${idx}" class="cand-chk" checked /></td>`;
      const name = `<td><input type="text" data-idx="${idx}" data-field="name" value="${escapeAttr(row.name)}" /></td>`;
      const spec = `<td><input type="text" data-idx="${idx}" data-field="spec" value="${escapeAttr(row.spec)}" /></td>`;
      const unit = `<td><input type="text" data-idx="${idx}" data-field="unit" value="${escapeAttr(row.unit)}" /></td>`;
      const price = `<td><input type="number" data-idx="${idx}" data-field="price" value="${row.price ?? ""}" min="0" /></td>`;
      let opts = `<option value="new">새 수종</option>`;
      species.forEach(sp => {
        const sel = row.targetId === sp.id ? " selected" : "";
        opts += `<option value="${sp.id}"${sel}>${escapeAttr(sp.name)}</option>`;
      });
      const target = `<td><select data-idx="${idx}" data-field="targetId">${opts}</select></td>`;
      tr.innerHTML = chk + name + spec + unit + price + target;
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
    const selected = state.candidates.filter((_, idx) => {
      const chk = els.candBody.querySelector(`.cand-chk[data-idx="${idx}"]`);
      return chk?.checked;
    });
    if (!selected.length) {
      window.SpeciesCatalog.toast("반영할 항목을 선택하세요");
      return;
    }
    const supplier = {
      name: els.impSupName.value.trim(),
      region: els.impSupRegion.value.trim(),
      contact: els.impSupContact.value.trim()
    };
    const hasSupplier = !!supplier.name;

    // Group by targetId
    const groups = new Map();
    selected.forEach(row => {
      const key = row.targetId || "new";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    let added = 0, updated = 0;
    groups.forEach((rows, key) => {
      const cleanPrices = rows
        .filter(r => r.name && r.price != null && r.price >= 0)
        .map(r => ({ spec: r.spec || "-", unit: r.unit || "주", price: Number(r.price) }));
      if (key === "new") {
        // Create one species per unique name
        const byName = new Map();
        rows.forEach(r => {
          if (!byName.has(r.name)) byName.set(r.name, []);
          byName.get(r.name).push(r);
        });
        byName.forEach((rs, name) => {
          const prices = rs.map(r => ({ spec: r.spec || "-", unit: r.unit || "주", price: Number(r.price) }));
          const suppliers = hasSupplier ? [supplier] : [];
          window.SpeciesCatalog.ensureCategory("교목");
          const payload = {
            name,
            scientificName: "",
            category: window.SpeciesCatalog.getData().categories[0] || "교목",
            bloomMonths: [],
            colors: [],
            prices,
            suppliers,
            notes: "명세서에서 자동 등록됨"
          };
          window.SpeciesCatalog.createSpecies(payload);
          added++;
        });
      } else {
        window.SpeciesCatalog.updateSpecies(key, (sp) => {
          const existingKeys = new Set((sp.prices || []).map(p => `${p.spec}|${p.unit}|${p.price}`));
          cleanPrices.forEach(np => {
            const k = `${np.spec}|${np.unit}|${np.price}`;
            if (!existingKeys.has(k)) sp.prices = [...(sp.prices || []), np];
          });
          if (hasSupplier) {
            const supKeys = new Set((sp.suppliers || []).map(s => s.name));
            if (!supKeys.has(supplier.name)) {
              sp.suppliers = [...(sp.suppliers || []), supplier];
            }
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
