/**
 * Application entry point.
 *
 * Bootstraps the app:
 *   1. Cache DOM elements
 *   2. Load persisted data (or fetch seed on first run)
 *   3. Initialize the species modal
 *   4. Wire toolbar + filter-rail events
 *   5. First render
 *
 * Business-logic mutations flow through the helpers here (saveSpecies,
 * deleteSpecies, persistAndRerender) so persistence + re-rendering stay
 * consistent regardless of who triggered the change.
 */

import { state, resetFilters } from "./state.js";
import { storage } from "./storage.js";
import { loadSeed, exportJson, importJson } from "./importExport.js";
import { cacheElements, els, render, refreshFilterUi, toast, toggleTheme } from "./ui.js";
import { initModal, openModal } from "./modal.js";
import { nextId } from "./utils.js";

// ============================================================
// Business-logic mutation helpers
// ============================================================

function saveSpecies(payload, id) {
  if (id) {
    const idx = state.data.species.findIndex(s => s.id === id);
    if (idx >= 0) {
      state.data.species[idx] = { ...state.data.species[idx], ...payload, id };
      toast("수정되었습니다");
    }
  } else {
    state.data.species.push({ id: nextId(state.data.species), ...payload });
    toast("추가되었습니다");
  }
  persistAndRerender();
}

function deleteSpecies(id) {
  const sp = state.data.species.find(s => s.id === id);
  if (!sp) return;
  if (!confirm(`「${sp.name}」을(를) 삭제하시겠습니까?`)) return;
  state.data.species = state.data.species.filter(s => s.id !== id);
  toast("삭제되었습니다");
  persistAndRerender();
}

/** Save to storage, rebuild filter chips (in case master lists changed), rerender. */
function persistAndRerender() {
  storage.save(state.data);
  refreshFilterUi(rerender);
  rerender();
}

const cardHandlers = {
  onEdit: id => openModal(id),
  onDelete: id => deleteSpecies(id)
};

function rerender() {
  render(cardHandlers);
}

// ============================================================
// Event wiring
// ============================================================

function wireToolbar() {
  els.addBtn.addEventListener("click", () => openModal(null));

  els.exportBtn.addEventListener("click", () => {
    exportJson(state.data);
    toast("JSON을 내보냈습니다");
  });

  els.importFile.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importJson(file);
      if (!confirm(`${parsed.species.length}개 수종으로 덮어씁니다. 계속?`)) return;
      state.data = parsed;
      persistAndRerender();
      toast("가져오기 완료");
    } catch (err) {
      alert("JSON 파싱 실패: " + err.message);
    } finally {
      e.target.value = "";  // Allow re-selecting the same file
    }
  });

  els.resetSeedBtn.addEventListener("click", async () => {
    if (!confirm("모든 사용자 데이터를 지우고 시드 데이터로 초기화합니다. 계속?")) return;
    try {
      const seed = await loadSeed();
      state.data = seed;
      persistAndRerender();
      toast("시드 데이터로 초기화되었습니다");
    } catch (err) {
      alert("시드 파일을 불러올 수 없습니다: " + err.message);
    }
  });

  els.themeToggle.addEventListener("click", toggleTheme);
}

function wireFilterRail() {
  els.searchInput.addEventListener("input", e => {
    state.filters.search = e.target.value.trim();
    rerender();
  });
  els.supplierSelect.addEventListener("change", e => {
    state.filters.supplier = e.target.value;
    rerender();
  });
  els.minPrice.addEventListener("input", e => {
    state.filters.minPrice = e.target.value === "" ? null : Number(e.target.value);
    rerender();
  });
  els.maxPrice.addEventListener("input", e => {
    state.filters.maxPrice = e.target.value === "" ? null : Number(e.target.value);
    rerender();
  });
  els.sortSelect.addEventListener("change", e => {
    state.sort = e.target.value;
    rerender();
  });
  els.resetBtn.addEventListener("click", () => {
    resetFilters();
    els.searchInput.value = "";
    els.minPrice.value = "";
    els.maxPrice.value = "";
    els.supplierSelect.value = "";
    refreshFilterUi(rerender);
    rerender();
  });
}

// ============================================================
// Bootstrap
// ============================================================

async function init() {
  cacheElements();

  // Load persisted data; fall back to fetched seed on first visit.
  let data = storage.load();
  if (!data) {
    try {
      data = await loadSeed();
      storage.save(data);
    } catch (err) {
      console.error("[app] seed load failed:", err);
      alert("데이터를 불러올 수 없습니다. 로컬 서버(python3 -m http.server)로 열어주세요.");
      data = { categories: [], colors: [], species: [] };
    }
  }
  state.data = data;

  initModal({
    onSave: saveSpecies,
    onDelete: deleteSpecies,
    toast
  });

  wireToolbar();
  wireFilterRail();
  refreshFilterUi(rerender);
  rerender();
}

init();
