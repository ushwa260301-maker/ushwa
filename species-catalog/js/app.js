(() => {
  const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const COLOR_MAP = {
    "백색": "#e8e8e8",
    "황색": "#f5c518",
    "적색": "#d43a3a",
    "분홍": "#ec8ab6",
    "자색": "#8a4ea0",
    "청색": "#4c78c8",
    "주황": "#f08a3c",
    "혼색": "#a0a0a0"
  };

  const state = {
    species: [],
    categories: [],
    colors: [],
    filters: {
      search: "",
      months: new Set(),
      categories: new Set(),
      colors: new Set(),
      supplier: "",
      minPrice: null,
      maxPrice: null
    },
    sort: "name"
  };

  const els = {
    grid: document.getElementById("cardGrid"),
    empty: document.getElementById("emptyState"),
    count: document.getElementById("resultCount"),
    search: document.getElementById("searchInput"),
    monthChips: document.getElementById("monthChips"),
    categoryChips: document.getElementById("categoryChips"),
    colorChips: document.getElementById("colorChips"),
    supplier: document.getElementById("supplierSelect"),
    minPrice: document.getElementById("minPrice"),
    maxPrice: document.getElementById("maxPrice"),
    sort: document.getElementById("sortSelect"),
    reset: document.getElementById("resetBtn"),
    template: document.getElementById("cardTemplate")
  };

  async function loadData() {
    try {
      const res = await fetch("data/species.json");
      if (!res.ok) throw new Error("데이터 로드 실패");
      const data = await res.json();
      state.species = data.species || [];
      state.categories = data.categories || [];
      state.colors = data.colors || [];
    } catch (err) {
      console.error(err);
      alert("데이터를 불러올 수 없습니다. index.html은 로컬 서버(예: python -m http.server)에서 열어주세요.");
    }
  }

  function buildChips(container, items, targetSet) {
    container.innerHTML = "";
    items.forEach(item => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = item.label ?? item;
      chip.dataset.value = String(item.value ?? item);
      chip.addEventListener("click", () => {
        const v = chip.dataset.value;
        if (targetSet.has(v)) {
          targetSet.delete(v);
          chip.classList.remove("active");
        } else {
          targetSet.add(v);
          chip.classList.add("active");
        }
        render();
      });
      container.appendChild(chip);
    });
  }

  function buildSupplierOptions() {
    const set = new Set();
    state.species.forEach(sp => (sp.suppliers || []).forEach(s => set.add(s.name)));
    const sorted = [...set].sort((a, b) => a.localeCompare(b, "ko"));
    els.supplier.innerHTML = '<option value="">전체</option>';
    sorted.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      els.supplier.appendChild(opt);
    });
  }

  function minPriceOf(sp) {
    if (!sp.prices || sp.prices.length === 0) return Infinity;
    return Math.min(...sp.prices.map(p => p.price));
  }

  function earliestBloomOf(sp) {
    if (!sp.bloomMonths || sp.bloomMonths.length === 0) return 13;
    return Math.min(...sp.bloomMonths);
  }

  function matchesFilters(sp) {
    const f = state.filters;

    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = `${sp.name} ${sp.scientificName || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (f.months.size > 0) {
      const bloom = new Set((sp.bloomMonths || []).map(String));
      const overlap = [...f.months].some(m => bloom.has(m));
      if (!overlap) return false;
    }

    if (f.categories.size > 0 && !f.categories.has(sp.category)) return false;

    if (f.colors.size > 0) {
      const cols = new Set(sp.colors || []);
      const overlap = [...f.colors].some(c => cols.has(c));
      if (!overlap) return false;
    }

    if (f.supplier) {
      const has = (sp.suppliers || []).some(s => s.name === f.supplier);
      if (!has) return false;
    }

    if (f.minPrice != null || f.maxPrice != null) {
      const prices = (sp.prices || []).map(p => p.price);
      if (prices.length === 0) return false;
      const min = f.minPrice ?? -Infinity;
      const max = f.maxPrice ?? Infinity;
      const hit = prices.some(p => p >= min && p <= max);
      if (!hit) return false;
    }

    return true;
  }

  function sortSpecies(list) {
    const arr = [...list];
    switch (state.sort) {
      case "priceAsc":
        arr.sort((a, b) => minPriceOf(a) - minPriceOf(b));
        break;
      case "priceDesc":
        arr.sort((a, b) => minPriceOf(b) - minPriceOf(a));
        break;
      case "bloomEarly":
        arr.sort((a, b) => earliestBloomOf(a) - earliestBloomOf(b));
        break;
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    return arr;
  }

  function formatBloom(months) {
    if (!months || months.length === 0) return "-";
    const sorted = [...months].sort((a, b) => a - b);
    return sorted.map(m => `${m}월`).join(", ");
  }

  function formatPrice(n) {
    return n.toLocaleString("ko-KR") + "원";
  }

  function renderCard(sp) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.querySelector(".card-title").textContent = sp.name;
    const sci = node.querySelector(".card-scientific");
    sci.textContent = sp.scientificName || "";
    if (!sp.scientificName) sci.remove();
    node.querySelector(".category-badge").textContent = sp.category || "-";
    node.querySelector(".bloom-months").textContent = formatBloom(sp.bloomMonths);

    const colorWrap = node.querySelector(".color-dots");
    (sp.colors || []).forEach(c => {
      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.color = COLOR_MAP[c] || "#888";
      dot.append(document.createTextNode(c));
      colorWrap.appendChild(dot);
    });
    if ((sp.colors || []).length === 0) {
      colorWrap.textContent = "-";
    }

    const priceBody = node.querySelector(".price-body");
    (sp.prices || []).forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${p.spec}</td><td>${p.unit}</td><td class="price-cell">${formatPrice(p.price)}</td>`;
      priceBody.appendChild(tr);
    });
    if ((sp.prices || []).length === 0) {
      priceBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--muted)">단가 정보 없음</td></tr>';
    }

    const supList = node.querySelector(".supplier-list");
    (sp.suppliers || []).forEach(s => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="supplier-name">${s.name}</span>` +
        (s.region ? `<span class="supplier-region">${s.region}</span>` : "") +
        (s.contact ? `<span class="supplier-contact">${s.contact}</span>` : "");
      supList.appendChild(li);
    });
    if ((sp.suppliers || []).length === 0) {
      supList.innerHTML = '<li style="color:var(--muted)">수급처 정보 없음</li>';
    }

    const notes = node.querySelector(".card-notes");
    notes.textContent = sp.notes || "";
    return node;
  }

  function render() {
    const filtered = state.species.filter(matchesFilters);
    const sorted = sortSpecies(filtered);
    els.count.textContent = sorted.length;
    els.grid.innerHTML = "";

    if (sorted.length === 0) {
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;

    const frag = document.createDocumentFragment();
    sorted.forEach(sp => frag.appendChild(renderCard(sp)));
    els.grid.appendChild(frag);
  }

  function resetFilters() {
    state.filters = {
      search: "",
      months: new Set(),
      categories: new Set(),
      colors: new Set(),
      supplier: "",
      minPrice: null,
      maxPrice: null
    };
    els.search.value = "";
    els.minPrice.value = "";
    els.maxPrice.value = "";
    els.supplier.value = "";
    document.querySelectorAll(".chip.active").forEach(c => c.classList.remove("active"));
    render();
  }

  function attachEvents() {
    els.search.addEventListener("input", e => {
      state.filters.search = e.target.value.trim();
      render();
    });

    els.supplier.addEventListener("change", e => {
      state.filters.supplier = e.target.value;
      render();
    });

    els.minPrice.addEventListener("input", e => {
      const v = e.target.value;
      state.filters.minPrice = v === "" ? null : Number(v);
      render();
    });

    els.maxPrice.addEventListener("input", e => {
      const v = e.target.value;
      state.filters.maxPrice = v === "" ? null : Number(v);
      render();
    });

    els.sort.addEventListener("change", e => {
      state.sort = e.target.value;
      render();
    });

    els.reset.addEventListener("click", resetFilters);
  }

  async function init() {
    await loadData();
    buildChips(
      els.monthChips,
      MONTHS.map(m => ({ label: `${m}월`, value: m })),
      state.filters.months
    );
    buildChips(els.categoryChips, state.categories, state.filters.categories);
    buildChips(els.colorChips, state.colors, state.filters.colors);
    buildSupplierOptions();
    attachEvents();
    render();
  }

  init();
})();
