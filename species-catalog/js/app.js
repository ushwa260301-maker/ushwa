(() => {
  const STORAGE_KEY = "species-catalog:v1";
  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

  const COLOR_MAP = {
    "백색": "#f2f0e6",
    "황색": "#e8b937",
    "적색": "#c33a2a",
    "분홍": "#e58ab0",
    "자색": "#8551a3",
    "청색": "#3f6cb0",
    "주황": "#e0803a",
    "혼색": "linear-gradient(135deg,#e58ab0 0%,#8551a3 50%,#e8b937 100%)"
  };
  function colorFor(name) {
    return COLOR_MAP[name] || `hsl(${hash(name) % 360}, 45%, 55%)`;
  }
  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
    return Math.abs(h);
  }

  const state = {
    data: { categories: [], colors: [], species: [] },
    filters: {
      search: "",
      months: new Set(),
      categories: new Set(),
      colors: new Set(),
      supplier: "",
      minPrice: null,
      maxPrice: null
    },
    sort: "name",
    editingId: null
  };

  const els = {};
  function q(id) { return document.getElementById(id); }

  // ==== Storage ====
  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.species)) return null;
      return parsed;
    } catch { return null; }
  }
  async function fetchSeed() {
    const res = await fetch("data/species.json");
    if (!res.ok) throw new Error("seed fetch failed");
    return res.json();
  }

  // ==== Utilities ====
  function nextId() {
    const nums = state.data.species
      .map(s => (s.id || "").match(/^sp-(\d+)$/))
      .filter(Boolean)
      .map(m => parseInt(m[1], 10));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return "sp-" + String(next).padStart(3, "0");
  }
  function minPriceOf(sp) {
    return sp.prices?.length ? Math.min(...sp.prices.map(p => p.price)) : Infinity;
  }
  function earliestBloomOf(sp) {
    return sp.bloomMonths?.length ? Math.min(...sp.bloomMonths) : 13;
  }
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { els.toast.hidden = true; }, 2000);
  }

  // ==== Filter/render ====
  function matches(sp) {
    const f = state.filters;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!`${sp.name} ${sp.scientificName || ""}`.toLowerCase().includes(q)) return false;
    }
    if (f.months.size) {
      const bloom = new Set((sp.bloomMonths || []).map(String));
      if (![...f.months].some(m => bloom.has(m))) return false;
    }
    if (f.categories.size && !f.categories.has(sp.category)) return false;
    if (f.colors.size) {
      const cs = new Set(sp.colors || []);
      if (![...f.colors].some(c => cs.has(c))) return false;
    }
    if (f.supplier && !(sp.suppliers || []).some(s => s.name === f.supplier)) return false;
    if (f.minPrice != null || f.maxPrice != null) {
      const prices = (sp.prices || []).map(p => p.price);
      if (!prices.length) return false;
      const min = f.minPrice ?? -Infinity;
      const max = f.maxPrice ?? Infinity;
      if (!prices.some(p => p >= min && p <= max)) return false;
    }
    return true;
  }
  function sortList(arr) {
    const list = [...arr];
    switch (state.sort) {
      case "priceAsc": list.sort((a,b) => minPriceOf(a) - minPriceOf(b)); break;
      case "priceDesc": list.sort((a,b) => minPriceOf(b) - minPriceOf(a)); break;
      case "bloomEarly": list.sort((a,b) => earliestBloomOf(a) - earliestBloomOf(b)); break;
      default: list.sort((a,b) => a.name.localeCompare(b.name, "ko"));
    }
    return list;
  }
  function formatBloom(months) {
    if (!months || !months.length) return "—";
    return [...months].sort((a,b) => a - b).map(m => `${m}월`).join(" · ");
  }

  function normalizeCounts(arr) {
    const out = Array(12).fill(0);
    if (Array.isArray(arr)) {
      for (let i = 0; i < 12; i++) {
        const v = Number(arr[i]);
        out[i] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
      }
    }
    return out;
  }
  function freqLevel(n) {
    if (n <= 0) return 0;
    if (n === 1) return 1;
    if (n <= 3) return 2;
    if (n <= 6) return 3;
    return 4;
  }

  function renderCard(sp) {
    const node = els.cardTpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = sp.id;
    node.querySelector(".card-id").textContent = (sp.id || "").toUpperCase();
    node.querySelector(".card-title").textContent = sp.name;
    const latin = node.querySelector(".card-latin");
    if (sp.scientificName) latin.textContent = sp.scientificName;
    else latin.remove();
    node.querySelector(".card-cat").textContent = sp.category || "—";

    node.querySelector(".phenology-label .val").textContent = formatBloom(sp.bloomMonths);
    const strip = node.querySelector(".phenology-strip");
    const bloomSet = new Set(sp.bloomMonths || []);
    for (let m = 1; m <= 12; m++) {
      const cell = document.createElement("div");
      cell.className = "ph-cell" + (bloomSet.has(m) ? " active" : "");
      cell.textContent = m;
      cell.title = `${m}월 ${bloomSet.has(m) ? "(개화)" : ""}`;
      strip.appendChild(cell);
    }

    // Purchase frequency heatmap
    const counts = normalizeCounts(sp.purchaseCounts);
    const total = counts.reduce((a, b) => a + b, 0);
    const freqVal = node.querySelector(".freq-label .val");
    freqVal.textContent = total > 0 ? `총 ${total}회` : "구매 이력 없음";
    const freqStrip = node.querySelector(".freq-strip");
    for (let m = 1; m <= 12; m++) {
      const cell = document.createElement("div");
      cell.className = "pf-cell";
      const c = counts[m - 1];
      cell.dataset.level = String(freqLevel(c));
      cell.title = `${m}월 · 구매 ${c}회`;
      freqStrip.appendChild(cell);
    }

    const colorRow = node.querySelector(".color-row");
    (sp.colors || []).forEach(c => {
      const tag = document.createElement("span");
      tag.className = "color-tag";
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = colorFor(c);
      tag.appendChild(sw);
      tag.append(document.createTextNode(c));
      colorRow.appendChild(tag);
    });

    const priceBody = node.querySelector(".price-body");
    const labels = node.querySelectorAll(".section-label .n");
    (sp.prices || []).forEach(p => {
      const tr = document.createElement("tr");
      const price = Number(p.price).toLocaleString("ko-KR");
      tr.innerHTML = `<th scope="row">${escapeHtml(p.spec)}</th><td class="unit">/ ${escapeHtml(p.unit)}</td><td class="price">${price}<span class="won">원</span></td>`;
      priceBody.appendChild(tr);
    });
    labels[0].textContent = `${(sp.prices || []).length}종 규격`;

    const supList = node.querySelector(".supplier-list");
    (sp.suppliers || []).forEach(s => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "supplier-name";
      name.textContent = s.name;
      li.appendChild(name);
      const meta = document.createElement("span");
      meta.className = "supplier-meta";
      if (s.region) {
        const r = document.createElement("span");
        r.className = "region";
        r.textContent = s.region;
        meta.appendChild(r);
      }
      if (s.region && s.contact) {
        const dot = document.createElement("span");
        dot.className = "dot";
        meta.appendChild(dot);
      }
      if (s.contact) {
        const c = document.createElement("span");
        c.textContent = s.contact;
        meta.appendChild(c);
      }
      li.appendChild(meta);
      supList.appendChild(li);
    });
    labels[1].textContent = `${(sp.suppliers || []).length}곳`;

    const notes = node.querySelector(".card-notes");
    if (sp.notes) notes.textContent = "“" + sp.notes + "”";
    else notes.remove();

    node.querySelector(".edit-btn").addEventListener("click", () => openModal(sp.id));
    node.querySelector(".delete-btn").addEventListener("click", () => deleteSpecies(sp.id));
    return node;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function render() {
    const filtered = state.data.species.filter(matches);
    const sorted = sortList(filtered);
    els.count.textContent = sorted.length;
    els.grid.innerHTML = "";
    if (!sorted.length) {
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    const frag = document.createDocumentFragment();
    sorted.forEach(sp => frag.appendChild(renderCard(sp)));
    els.grid.appendChild(frag);
  }

  // ==== Filter chips build (rebuilds on data change) ====
  function buildMonthGrid(container, targetSet, onToggle) {
    container.innerHTML = "";
    MONTHS.forEach(m => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "month-cell";
      cell.textContent = m;
      cell.setAttribute("aria-pressed", targetSet.has(String(m)) ? "true" : "false");
      cell.setAttribute("aria-label", `${m}월`);
      cell.addEventListener("click", () => {
        const v = String(m);
        if (targetSet.has(v)) { targetSet.delete(v); cell.setAttribute("aria-pressed", "false"); }
        else { targetSet.add(v); cell.setAttribute("aria-pressed", "true"); }
        onToggle && onToggle();
      });
      container.appendChild(cell);
    });
  }

  function buildChips(container, items, targetSet, opts, onToggle) {
    container.innerHTML = "";
    items.forEach(item => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.setAttribute("aria-pressed", targetSet.has(item) ? "true" : "false");
      if (opts?.withSwatch) {
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.background = colorFor(item);
        chip.appendChild(sw);
      }
      const label = document.createElement("span");
      label.textContent = item;
      chip.appendChild(label);
      chip.addEventListener("click", () => {
        if (targetSet.has(item)) { targetSet.delete(item); chip.setAttribute("aria-pressed", "false"); }
        else { targetSet.add(item); chip.setAttribute("aria-pressed", "true"); }
        onToggle && onToggle();
      });
      container.appendChild(chip);
    });
  }

  function buildSupplierOptions() {
    const set = new Set();
    state.data.species.forEach(sp => (sp.suppliers || []).forEach(s => set.add(s.name)));
    const sorted = [...set].sort((a, b) => a.localeCompare(b, "ko"));
    const cur = els.supplier.value;
    els.supplier.innerHTML = '<option value="">전체</option>';
    sorted.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      els.supplier.appendChild(opt);
    });
    if (sorted.includes(cur)) els.supplier.value = cur;
    else state.filters.supplier = "";
  }

  function refreshFilterUi() {
    buildMonthGrid(els.monthGrid, state.filters.months, render);
    buildChips(els.categoryChips, state.data.categories, state.filters.categories, {}, render);
    buildChips(els.colorChips, state.data.colors, state.filters.colors, { withSwatch: true }, render);
    buildSupplierOptions();
  }

  // ==== Modal / form ====
  const formState = { months: new Set(), colors: new Set() };

  function openModal(id) {
    state.editingId = id ?? null;
    const sp = id ? state.data.species.find(s => s.id === id) : null;
    document.getElementById("modalTitle").textContent = sp ? "수종 수정" : "수종 추가";
    // 명세서 첨부 UI 리셋 (수정 모드에서는 섹션 자체를 숨김)
    const attachSec = document.getElementById("speciesAttachSection");
    const attachProg = document.getElementById("fAttachProgress");
    const attachSum = document.getElementById("fAttachSummary");
    if (attachSec) attachSec.hidden = !!sp;
    if (attachProg) attachProg.hidden = true;
    if (attachSum) { attachSum.hidden = true; attachSum.textContent = ""; attachSum.classList.remove("attach-empty"); }
    const attachFile = document.getElementById("fAttachFile");
    if (attachFile) attachFile.value = "";
    q("fEditingId").value = sp?.id || "";
    q("fName").value = sp?.name || "";
    q("fLatin").value = sp?.scientificName || "";
    populateCategorySelect(sp?.category);
    q("fCategoryNew").value = "";
    q("fNotes").value = sp?.notes || "";

    formState.months = new Set(sp?.bloomMonths || []);
    buildMonthGrid(q("fMonthGrid"), new Set([...formState.months].map(String)), () => {
      formState.months = new Set([...q("fMonthGrid").querySelectorAll('[aria-pressed="true"]')]
        .map(el => Number(el.textContent)));
    });

    formState.colors = new Set(sp?.colors || []);
    rebuildFormColorChips();
    q("fColorNew").value = "";

    renderPriceRows(sp?.prices || []);
    renderSupplierRows(sp?.suppliers || []);
    renderFreqEditor(sp?.purchaseCounts);

    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    setTimeout(() => q("fName").focus(), 20);
  }

  function renderFreqEditor(counts) {
    const wrap = q("fFreqEditor");
    if (!wrap) return;
    const values = normalizeCounts(counts);
    wrap.innerHTML = "";
    for (let m = 1; m <= 12; m++) {
      const cell = document.createElement("label");
      cell.className = "freq-edit-cell";
      const spanText = document.createElement("span");
      spanText.textContent = `${m}월`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.value = String(values[m - 1]);
      input.dataset.month = String(m);
      input.inputMode = "numeric";
      cell.appendChild(spanText);
      cell.appendChild(input);
      wrap.appendChild(cell);
    }
  }

  function closeModal() {
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    state.editingId = null;
  }

  function populateCategorySelect(selected) {
    const sel = q("fCategory");
    sel.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "선택하세요";
    sel.appendChild(placeholder);
    state.data.categories.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      if (c === selected) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function rebuildFormColorChips() {
    const c = q("fColorChips");
    c.innerHTML = "";
    state.data.colors.forEach(color => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.setAttribute("aria-pressed", formState.colors.has(color) ? "true" : "false");
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = colorFor(color);
      chip.appendChild(sw);
      const label = document.createElement("span");
      label.textContent = color;
      chip.appendChild(label);
      chip.addEventListener("click", () => {
        if (formState.colors.has(color)) { formState.colors.delete(color); chip.setAttribute("aria-pressed", "false"); }
        else { formState.colors.add(color); chip.setAttribute("aria-pressed", "true"); }
      });
      c.appendChild(chip);
    });
  }

  function renderPriceRows(prices) {
    const wrap = q("fPriceRows");
    wrap.innerHTML = "";
    if (prices.length === 0) prices = [{ spec: "", unit: "", price: "" }];
    prices.forEach(p => wrap.appendChild(makePriceRow(p)));
  }
  function makePriceRow(p = {}) {
    const tpl = q("priceRowTemplate").content.firstElementChild.cloneNode(true);
    tpl.querySelector(".rf-spec").value = p.spec || "";
    tpl.querySelector(".rf-unit").value = p.unit || "";
    tpl.querySelector(".rf-price").value = p.price ?? "";
    tpl.querySelector(".row-remove").addEventListener("click", () => tpl.remove());
    return tpl;
  }
  function renderSupplierRows(suppliers) {
    const wrap = q("fSupplierRows");
    wrap.innerHTML = "";
    if (suppliers.length === 0) suppliers = [{ name: "", region: "", contact: "" }];
    suppliers.forEach(s => wrap.appendChild(makeSupplierRow(s)));
  }
  function makeSupplierRow(s = {}) {
    const tpl = q("supplierRowTemplate").content.firstElementChild.cloneNode(true);
    tpl.querySelector(".rf-name").value = s.name || "";
    tpl.querySelector(".rf-region").value = s.region || "";
    tpl.querySelector(".rf-contact").value = s.contact || "";
    tpl.querySelector(".row-remove").addEventListener("click", () => tpl.remove());
    return tpl;
  }

  function collectForm() {
    const name = q("fName").value.trim();
    if (!name) { toast("수종명을 입력해 주세요"); q("fName").focus(); return null; }
    let category = q("fCategory").value;
    const newCat = q("fCategoryNew").value.trim();
    if (newCat) {
      category = newCat;
      if (!state.data.categories.includes(newCat)) state.data.categories.push(newCat);
    }
    if (!category) { toast("카테고리를 선택하거나 새로 입력하세요"); return null; }

    const months = [...q("fMonthGrid").querySelectorAll('[aria-pressed="true"]')]
      .map(el => Number(el.textContent))
      .sort((a,b) => a - b);
    const colors = [...formState.colors];

    const prices = [...q("fPriceRows").querySelectorAll(".price-row")]
      .map(row => ({
        spec: row.querySelector(".rf-spec").value.trim(),
        unit: row.querySelector(".rf-unit").value.trim(),
        price: Number(row.querySelector(".rf-price").value)
      }))
      .filter(p => p.spec && p.unit && !Number.isNaN(p.price) && p.price >= 0);

    const suppliers = [...q("fSupplierRows").querySelectorAll(".supplier-row")]
      .map(row => ({
        name: row.querySelector(".rf-name").value.trim(),
        region: row.querySelector(".rf-region").value.trim(),
        contact: row.querySelector(".rf-contact").value.trim()
      }))
      .filter(s => s.name);

    const purchaseCounts = Array.from({ length: 12 }, (_, i) => {
      const inp = q("fFreqEditor")?.querySelector(`input[data-month="${i + 1}"]`);
      const v = Number(inp?.value);
      return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    });

    return {
      name,
      scientificName: q("fLatin").value.trim(),
      category,
      bloomMonths: months,
      colors,
      prices,
      suppliers,
      purchaseCounts,
      notes: q("fNotes").value.trim()
    };
  }

  function saveForm(e) {
    e.preventDefault();
    const payload = collectForm();
    if (!payload) return;
    if (state.editingId) {
      const idx = state.data.species.findIndex(s => s.id === state.editingId);
      if (idx >= 0) {
        state.data.species[idx] = { ...state.data.species[idx], ...payload, id: state.editingId };
        toast("수정되었습니다");
      }
    } else {
      state.data.species.push({ id: nextId(), ...payload });
      toast("추가되었습니다");
    }
    saveData();
    refreshFilterUi();
    render();
    closeModal();
  }

  function deleteSpecies(id) {
    const sp = state.data.species.find(s => s.id === id);
    if (!sp) return;
    if (!confirm(`「${sp.name}」을(를) 삭제하시겠습니까?`)) return;
    state.data.species = state.data.species.filter(s => s.id !== id);
    saveData();
    refreshFilterUi();
    render();
    toast("삭제되었습니다");
  }

  // ==== Import / Export / Seed ====
  function exportJson() {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `species-catalog-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("JSON을 내보냈습니다");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !Array.isArray(parsed.species)) throw new Error("올바른 형식이 아닙니다");
        if (!confirm(`${parsed.species.length}개 수종으로 덮어씁니다. 계속하시겠습니까? (현재 데이터는 사라집니다)`)) return;
        state.data = {
          categories: parsed.categories || [],
          colors: parsed.colors || [],
          species: parsed.species
        };
        saveData();
        refreshFilterUi();
        render();
        toast("가져오기 완료");
      } catch (err) {
        alert("JSON 파싱 실패: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  async function resetToSeed() {
    if (!confirm("모든 사용자 데이터를 지우고 시드 데이터로 초기화합니다. 계속?")) return;
    try {
      const seed = await fetchSeed();
      state.data = seed;
      saveData();
      refreshFilterUi();
      render();
      toast("시드 데이터로 초기화되었습니다");
    } catch {
      alert("시드 파일을 불러올 수 없습니다.");
    }
  }

  // ==== Init ====
  function attachEvents() {
    els.search.addEventListener("input", e => { state.filters.search = e.target.value.trim(); render(); });
    els.supplier.addEventListener("change", e => { state.filters.supplier = e.target.value; render(); });
    els.minPrice.addEventListener("input", e => { state.filters.minPrice = e.target.value === "" ? null : Number(e.target.value); render(); });
    els.maxPrice.addEventListener("input", e => { state.filters.maxPrice = e.target.value === "" ? null : Number(e.target.value); render(); });
    els.sort.addEventListener("change", e => { state.sort = e.target.value; render(); });
    els.reset.addEventListener("click", () => {
      state.filters.search = "";
      state.filters.months.clear();
      state.filters.categories.clear();
      state.filters.colors.clear();
      state.filters.supplier = "";
      state.filters.minPrice = null;
      state.filters.maxPrice = null;
      els.search.value = "";
      els.minPrice.value = "";
      els.maxPrice.value = "";
      els.supplier.value = "";
      refreshFilterUi();
      render();
    });
    els.themeToggle.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : cur === "light" ? "dark" : (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
      document.documentElement.setAttribute("data-theme", next);
    });

    q("addBtn").addEventListener("click", () => openModal(null));
    q("exportBtn").addEventListener("click", exportJson);
    q("resetSeedBtn").addEventListener("click", resetToSeed);
    q("importFile").addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file) importJson(file);
      e.target.value = "";
    });

    els.modal.addEventListener("click", e => {
      if (e.target.matches("[data-close]")) closeModal();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !els.modal.hidden) closeModal();
    });
    q("speciesForm").addEventListener("submit", saveForm);
    q("fPriceAdd").addEventListener("click", () => q("fPriceRows").appendChild(makePriceRow()));
    q("fSupplierAdd").addEventListener("click", () => q("fSupplierRows").appendChild(makeSupplierRow()));
    q("fColorAddBtn").addEventListener("click", () => {
      const v = q("fColorNew").value.trim();
      if (!v) return;
      if (!state.data.colors.includes(v)) state.data.colors.push(v);
      formState.colors.add(v);
      rebuildFormColorChips();
      q("fColorNew").value = "";
    });

    // 명세서 첨부 → 폼 자동 채움
    q("fAttachFile").addEventListener("change", handleAttachFile);
  }

  async function handleAttachFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.SpeciesImporter) {
      alert("명세서 파서가 아직 로드되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      e.target.value = "";
      return;
    }
    const progress = q("fAttachProgress");
    const summary = q("fAttachSummary");
    const fillEl = q("fAttachFill");
    const pctEl = q("fAttachPercent");
    const statusEl = q("fAttachStatus");
    progress.hidden = false;
    summary.hidden = true;
    fillEl.style.width = "0%";
    pctEl.textContent = "0%";
    statusEl.textContent = "시작…";

    // 진행률 폴링용 옵저버 (importer.js의 내부 progress DOM을 재사용하지 않고 별도)
    const observer = new MutationObserver(() => {
      const importerFill = document.getElementById("ocrFill");
      const importerPct = document.getElementById("ocrPercent");
      const importerStatus = document.getElementById("ocrStatus");
      if (importerFill) fillEl.style.width = importerFill.style.width;
      if (importerPct) pctEl.textContent = importerPct.textContent;
      if (importerStatus) statusEl.textContent = importerStatus.textContent;
    });
    const importerProgress = document.getElementById("ocrFill")?.parentElement;
    if (importerProgress) observer.observe(importerProgress, { attributes: true, subtree: true, childList: true, characterData: true });

    try {
      const text = await window.SpeciesImporter.extract(file);
      observer.disconnect();
      fillEl.style.width = "100%";
      pctEl.textContent = "100%";
      statusEl.textContent = "파싱 중…";

      const { supplier, rows } = window.SpeciesImporter.parseText(text);
      applyExtractedToForm(supplier, rows);

      const parts = [];
      if (supplier.name) parts.push(`상호: ${supplier.name}`);
      if (supplier.region) parts.push(`소재지: ${supplier.region.slice(0, 30)}${supplier.region.length > 30 ? "…" : ""}`);
      if (supplier.contact) parts.push(`연락처: ${supplier.contact}`);
      const rowSummary = `품목 ${rows.length}건`;
      const detected = [rowSummary, ...parts].join(" · ");
      summary.hidden = false;
      summary.textContent = rows.length || parts.length
        ? `✓ 인식 완료 — ${detected}. 아래 필드를 검토·수정하고 저장하세요.`
        : "⚠ 자동 인식된 값이 없습니다. 아래 필드를 직접 입력해 주세요. (손글씨·저해상도 문서는 OCR 정확도가 낮습니다)";
      summary.classList.toggle("attach-empty", !rows.length && !parts.length);
      setTimeout(() => { progress.hidden = true; }, 800);
    } catch (err) {
      observer.disconnect();
      console.error(err);
      progress.hidden = true;
      summary.hidden = false;
      summary.textContent = "⚠ 추출 실패: " + err.message;
      summary.classList.add("attach-empty");
    } finally {
      e.target.value = "";
    }
  }

  function applyExtractedToForm(supplier, rows) {
    // 수종명 (기존 값이 비어있을 때만 채움)
    const firstRow = rows[0];
    if (firstRow && !q("fName").value.trim()) {
      q("fName").value = firstRow.name;
    }
    // 단가표: 기존 비어있는 초기 행을 지우고 추출값 삽입
    const priceWrap = q("fPriceRows");
    // 완전히 비어있는 행만 삭제
    [...priceWrap.querySelectorAll(".price-row")].forEach(row => {
      const spec = row.querySelector(".rf-spec").value.trim();
      const unit = row.querySelector(".rf-unit").value.trim();
      const price = row.querySelector(".rf-price").value.trim();
      if (!spec && !unit && !price) row.remove();
    });
    rows.forEach(r => {
      const tpl = q("priceRowTemplate").content.firstElementChild.cloneNode(true);
      tpl.querySelector(".rf-spec").value = r.spec || "";
      tpl.querySelector(".rf-unit").value = r.unit || "";
      tpl.querySelector(".rf-price").value = r.price ?? "";
      tpl.querySelector(".row-remove").addEventListener("click", () => tpl.remove());
      priceWrap.appendChild(tpl);
    });
    if (!priceWrap.querySelector(".price-row")) {
      // 아무것도 없으면 빈 행 하나 남겨두기
      priceWrap.appendChild(makePriceRowEmpty());
    }
    // 수급처: 첫 행에 채우거나 새 행 추가
    if (supplier.name || supplier.region || supplier.contact) {
      const supWrap = q("fSupplierRows");
      const firstSup = supWrap.querySelector(".supplier-row");
      const isEmpty = firstSup &&
        !firstSup.querySelector(".rf-name").value.trim() &&
        !firstSup.querySelector(".rf-region").value.trim() &&
        !firstSup.querySelector(".rf-contact").value.trim();
      const target = isEmpty ? firstSup : (() => {
        const tpl = q("supplierRowTemplate").content.firstElementChild.cloneNode(true);
        tpl.querySelector(".row-remove").addEventListener("click", () => tpl.remove());
        supWrap.appendChild(tpl);
        return tpl;
      })();
      target.querySelector(".rf-name").value = supplier.name || "";
      target.querySelector(".rf-region").value = supplier.region || "";
      target.querySelector(".rf-contact").value = supplier.contact || "";
    }
  }

  function makePriceRowEmpty() {
    const tpl = q("priceRowTemplate").content.firstElementChild.cloneNode(true);
    tpl.querySelector(".row-remove").addEventListener("click", () => tpl.remove());
    return tpl;
  }

  // Public API for other modules (e.g., importer.js)
  window.SpeciesCatalog = {
    getData: () => state.data,
    findSpecies: (id) => state.data.species.find(s => s.id === id),
    createSpecies: (payload) => {
      const sp = { id: nextId(), ...payload };
      state.data.species.push(sp);
      saveData();
      refreshFilterUi();
      render();
      return sp;
    },
    updateSpecies: (id, updater) => {
      const idx = state.data.species.findIndex(s => s.id === id);
      if (idx < 0) return null;
      const updated = updater({ ...state.data.species[idx] });
      state.data.species[idx] = { ...updated, id };
      saveData();
      refreshFilterUi();
      render();
      return state.data.species[idx];
    },
    ensureCategory: (name) => {
      if (name && !state.data.categories.includes(name)) {
        state.data.categories.push(name);
        saveData();
      }
    },
    toast: (msg) => toast(msg)
  };

  async function init() {
    els.grid = q("cardGrid");
    els.empty = q("emptyState");
    els.count = q("resultCount");
    els.search = q("searchInput");
    els.monthGrid = q("monthGrid");
    els.categoryChips = q("categoryChips");
    els.colorChips = q("colorChips");
    els.supplier = q("supplierSelect");
    els.minPrice = q("minPrice");
    els.maxPrice = q("maxPrice");
    els.sort = q("sortSelect");
    els.reset = q("resetBtn");
    els.themeToggle = q("themeToggle");
    els.cardTpl = q("cardTemplate");
    els.modal = q("modal");
    els.toast = q("toast");

    let data = loadFromStorage();
    if (!data) {
      try {
        data = await fetchSeed();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        data = { categories: [], colors: [], species: [] };
        alert("데이터를 불러올 수 없습니다. 로컬 서버(python -m http.server)로 열어주세요.");
      }
    }
    state.data = data;
    attachEvents();
    refreshFilterUi();
    render();
  }

  init();
})();
