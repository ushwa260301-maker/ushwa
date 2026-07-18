/**
 * Pure DOM builders. Every function here takes its inputs explicitly and
 * returns (or fills) a DOM node. No global state, no side effects beyond
 * the container it's asked to write to.
 *
 * Keeping this layer pure makes the render pipeline easy to reason about:
 * app.js decides *what* data to show and *when*, this file decides *how*
 * to draw it.
 */

import {
  MONTHS,
  colorFor,
  escapeHtml,
  normalizeCounts,
  freqLevel,
  formatBloom
} from "./utils.js";

// ============================================================
// Cards (species grid)
// ============================================================

/**
 * Build one species card node from the <template id="cardTemplate">.
 * @param {object} sp
 * @param {HTMLTemplateElement} cardTpl
 * @param {{onEdit:(id:string)=>void, onDelete:(id:string)=>void, onOpen?:(id:string)=>void}} handlers
 * @returns {HTMLElement}
 */
export function createCard(sp, cardTpl, handlers) {
  const node = cardTpl.content.firstElementChild.cloneNode(true);

  node.querySelector(".card-id").textContent = (sp.id || "").toUpperCase();
  node.querySelector(".card-title").textContent = sp.name;

  const latin = node.querySelector(".card-latin");
  if (sp.scientificName) latin.textContent = sp.scientificName;
  else latin.remove();

  node.querySelector(".card-cat").textContent = sp.category || "—";
  node.querySelector(".phenology-label .val").textContent = formatBloom(sp.bloomMonths);

  // Bloom strip — 12 cells, one per month, "active" when the month is in bloomMonths.
  fillPhenologyStrip(node.querySelector(".phenology-strip"), sp.bloomMonths || []);

  // Purchase heatmap — 12 cells, color-only intensity by count.
  const counts = normalizeCounts(sp.purchaseCounts);
  const total = counts.reduce((a, b) => a + b, 0);
  node.querySelector(".freq-label .val").textContent =
    total > 0 ? `총 ${total}회` : "구매 이력 없음";
  fillFreqStrip(node.querySelector(".freq-strip"), counts);

  // Bloom colors — pills with actual color swatch.
  fillColorRow(node.querySelector(".color-row"), sp.colors || []);

  // Price table + supplier list use the section-label .n count elements.
  const sectionCounts = node.querySelectorAll(".section-label .n");
  fillPriceTable(node.querySelector(".price-body"), sp.prices || []);
  sectionCounts[0].textContent = `${(sp.prices || []).length}종 규격`;

  fillSupplierList(node.querySelector(".supplier-list"), sp.suppliers || []);
  sectionCounts[1].textContent = `${(sp.suppliers || []).length}곳`;

  // Notes (italic quote); remove entirely if there aren't any.
  const notes = node.querySelector(".card-notes");
  if (sp.notes) notes.textContent = "“" + sp.notes + "”";
  else notes.remove();

  // Hover-revealed action buttons — stop propagation so the card body
  // click (which opens the history modal) doesn't fire on top of them.
  const editBtn = node.querySelector(".edit-btn");
  const deleteBtn = node.querySelector(".delete-btn");
  editBtn.addEventListener("click", e => { e.stopPropagation(); handlers.onEdit(sp.id); });
  deleteBtn.addEventListener("click", e => { e.stopPropagation(); handlers.onDelete(sp.id); });

  // Card body click → open history modal.
  if (handlers.onOpen) {
    node.classList.add("clickable");
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-label", `${sp.name} 구매 이력 열기`);
    node.addEventListener("click", () => handlers.onOpen(sp.id));
    node.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlers.onOpen(sp.id);
      }
    });
  }

  return node;
}

function fillPhenologyStrip(container, bloomMonths) {
  const set = new Set(bloomMonths);
  for (let m = 1; m <= 12; m++) {
    const cell = document.createElement("div");
    cell.className = "ph-cell" + (set.has(m) ? " active" : "");
    cell.textContent = m;
    cell.title = `${m}월 ${set.has(m) ? "(개화)" : ""}`;
    container.appendChild(cell);
  }
}

function fillFreqStrip(container, counts) {
  for (let m = 1; m <= 12; m++) {
    const cell = document.createElement("div");
    cell.className = "pf-cell";
    cell.dataset.level = String(freqLevel(counts[m - 1]));
    cell.title = `${m}월 · 구매 ${counts[m - 1]}회`;
    container.appendChild(cell);
  }
}

function fillColorRow(container, colors) {
  colors.forEach(c => {
    const tag = document.createElement("span");
    tag.className = "color-tag";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = colorFor(c);
    tag.appendChild(swatch);
    tag.append(document.createTextNode(c));
    container.appendChild(tag);
  });
}

function fillPriceTable(tbody, prices) {
  prices.forEach(p => {
    const tr = document.createElement("tr");
    const priceStr = Number(p.price).toLocaleString("ko-KR");
    tr.innerHTML =
      `<th scope="row">${escapeHtml(p.spec)}</th>` +
      `<td class="unit">/ ${escapeHtml(p.unit)}</td>` +
      `<td class="price">${priceStr}<span class="won">원</span></td>`;
    tbody.appendChild(tr);
  });
}

function fillSupplierList(ul, suppliers) {
  suppliers.forEach(s => {
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
    ul.appendChild(li);
  });
}

// ============================================================
// Reusable controls (used by both the filter rail and the modal)
// ============================================================

/**
 * Fill a 6×2 button grid for months 1..12. Toggles a Set of string keys.
 * @param {Element} container
 * @param {Set<string>} targetSet
 * @param {Function} [onToggle]
 */
export function buildMonthGrid(container, targetSet, onToggle) {
  container.innerHTML = "";
  MONTHS.forEach(m => {
    const key = String(m);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "month-cell";
    cell.textContent = m;
    cell.setAttribute("aria-pressed", targetSet.has(key) ? "true" : "false");
    cell.setAttribute("aria-label", `${m}월`);
    cell.addEventListener("click", () => {
      if (targetSet.has(key)) {
        targetSet.delete(key);
        cell.setAttribute("aria-pressed", "false");
      } else {
        targetSet.add(key);
        cell.setAttribute("aria-pressed", "true");
      }
      onToggle && onToggle();
    });
    container.appendChild(cell);
  });
}

/**
 * Fill a chip row. Items get an optional swatch. Selection is stored in
 * targetSet (mutated on click).
 * @param {Element} container
 * @param {string[]} items
 * @param {Set<string>} targetSet
 * @param {{withSwatch?:boolean}} [opts]
 * @param {Function} [onToggle]
 */
export function buildChips(container, items, targetSet, opts = {}, onToggle) {
  container.innerHTML = "";
  items.forEach(item => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.setAttribute("aria-pressed", targetSet.has(item) ? "true" : "false");
    if (opts.withSwatch) {
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = colorFor(item);
      chip.appendChild(sw);
    }
    const label = document.createElement("span");
    label.textContent = item;
    chip.appendChild(label);
    chip.addEventListener("click", () => {
      if (targetSet.has(item)) {
        targetSet.delete(item);
        chip.setAttribute("aria-pressed", "false");
      } else {
        targetSet.add(item);
        chip.setAttribute("aria-pressed", "true");
      }
      onToggle && onToggle();
    });
    container.appendChild(chip);
  });
}

/**
 * Rebuild the supplier <select> from all suppliers currently in the catalog.
 * @param {HTMLSelectElement} select
 * @param {object[]} species
 * @param {string} currentValue
 * @returns {boolean} whether currentValue is still present after the rebuild
 */
export function populateSupplierOptions(select, species, currentValue) {
  const set = new Set();
  species.forEach(sp => (sp.suppliers || []).forEach(s => set.add(s.name)));
  const sorted = [...set].sort((a, b) => a.localeCompare(b, "ko"));
  select.innerHTML = '<option value="">전체</option>';
  sorted.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  const keep = sorted.includes(currentValue);
  if (keep) select.value = currentValue;
  return keep;
}

// ============================================================
// Modal-only row editors
// ============================================================

export function makePriceRow(p, tpl) {
  const row = tpl.content.firstElementChild.cloneNode(true);
  row.querySelector(".rf-spec").value = p.spec || "";
  row.querySelector(".rf-unit").value = p.unit || "";
  row.querySelector(".rf-price").value = p.price ?? "";
  row.querySelector(".row-remove").addEventListener("click", () => row.remove());
  return row;
}

export function renderPriceRows(container, prices, tpl) {
  container.innerHTML = "";
  const list = prices.length ? prices : [{ spec: "", unit: "", price: "" }];
  list.forEach(p => container.appendChild(makePriceRow(p, tpl)));
}

export function makeSupplierRow(s, tpl) {
  const row = tpl.content.firstElementChild.cloneNode(true);
  row.querySelector(".rf-name").value = s.name || "";
  row.querySelector(".rf-region").value = s.region || "";
  row.querySelector(".rf-contact").value = s.contact || "";
  row.querySelector(".row-remove").addEventListener("click", () => row.remove());
  return row;
}

export function renderSupplierRows(container, suppliers, tpl) {
  container.innerHTML = "";
  const list = suppliers.length ? suppliers : [{ name: "", region: "", contact: "" }];
  list.forEach(s => container.appendChild(makeSupplierRow(s, tpl)));
}

/** Render a 12-input grid for editing the monthly purchase counts. */
export function renderFreqEditor(container, counts) {
  const values = normalizeCounts(counts);
  container.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const cell = document.createElement("label");
    cell.className = "freq-edit-cell";
    const label = document.createElement("span");
    label.textContent = `${m}월`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = String(values[m - 1]);
    input.dataset.month = String(m);
    input.inputMode = "numeric";
    cell.appendChild(label);
    cell.appendChild(input);
    container.appendChild(cell);
  }
}

/** Rebuild the color chip row inside the modal (uses the modal's own Set). */
export function rebuildFormColorChips(container, colors, selected) {
  container.innerHTML = "";
  colors.forEach(color => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.setAttribute("aria-pressed", selected.has(color) ? "true" : "false");
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = colorFor(color);
    chip.appendChild(sw);
    const label = document.createElement("span");
    label.textContent = color;
    chip.appendChild(label);
    chip.addEventListener("click", () => {
      if (selected.has(color)) {
        selected.delete(color);
        chip.setAttribute("aria-pressed", "false");
      } else {
        selected.add(color);
        chip.setAttribute("aria-pressed", "true");
      }
    });
    container.appendChild(chip);
  });
}
