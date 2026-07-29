/**
 * plantGuideModal — 도감(Plant Guide) 검색·상세 UI (Presentation 계층).
 *
 * 설계 근거: PLANT_GUIDE.md
 *
 * 격리 원칙
 *   · **조회 전용**. Species 를 생성/수정하지 않고 guide_id 도 저장하지 않는다.
 *   · LocalStorage · Cloud · Sync 를 사용하지 않는다.
 *   · app.js / state.js 를 import 하지 않는다 — 운영 데이터와 접점이 0 이라
 *     app.js 를 경유할 필요가 없고, 그래서 기존 부팅 흐름도 건드리지 않는다.
 *   · 도감 데이터는 plantGuideStore 가 **모달을 처음 열 때** 로드한다(지연 로드).
 *
 * 마크업은 index.html 의 #plantGuideModal 을 사용하며, 기존 모달 클래스
 * (.modal / .modal-panel / .modal-head / .hist-stats …)를 그대로 재사용한다
 * — CSS 는 추가하지 않는다.
 */

import { load, search, getById, status } from "./plantGuideStore.js";

const SEARCH_DEBOUNCE_MS = 200;

const els = {};
let wired = false;
let debounceTimer = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  els.openBtn = document.getElementById("openGuideBtn");
  els.modal   = document.getElementById("plantGuideModal");
  if (!els.openBtn || !els.modal) return;      // 마크업이 없으면 조용히 비활성

  els.query   = document.getElementById("pgQuery");
  els.status  = document.getElementById("pgStatus");
  els.results = document.getElementById("pgResults");
  els.count   = document.getElementById("pgCount");
  els.detail  = document.getElementById("pgDetail");
  els.dName   = document.getElementById("pgDetailName");
  els.dLatin  = document.getElementById("pgdLatin");
  els.dBloom  = document.getElementById("pgdBloom");
  els.dHeight = document.getElementById("pgdHeight");
  els.dLight  = document.getElementById("pgdLight");
  els.dUse    = document.getElementById("pgdUse");
  els.dMarket = document.getElementById("pgdMarket");
  els.dDens   = document.getElementById("pgdDensity");
  els.dPage   = document.getElementById("pgdPage");

  els.openBtn.addEventListener("click", open);
  els.modal.querySelectorAll("[data-close-guide]").forEach(el =>
    el.addEventListener("click", close));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.modal.hidden) close();
  });

  els.query.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
  });

  els.results.addEventListener("click", e => {
    const row = e.target.closest("[data-guide-id]");
    if (row) showDetail(row.dataset.guideId);
  });

  wired = true;
  console.info("[guide-ui] ready");
}

/** 모달 열기 — 이 시점에 도감이 처음 로드된다(부팅 비용 0). */
async function open() {
  if (!wired) return;
  els.modal.hidden = false;
  els.modal.setAttribute("aria-hidden", "false");
  els.query.value = "";
  els.results.innerHTML = "";
  els.detail.hidden = true;
  els.status.textContent = "도감을 불러오는 중…";
  els.query.focus();

  // 도감 로드를 직접 트리거한다 (search("") 는 빈 검색어에서 조기 반환하므로 부적합).
  await load();
  const st = status();
  els.status.textContent = st.loaded
    ? "검색어를 입력하세요."
    : "도감 데이터를 불러오지 못했습니다.";
  els.count.textContent = st.loaded ? `${st.count}종` : "";
}

function close() {
  els.modal.hidden = true;
  els.modal.setAttribute("aria-hidden", "true");
  clearTimeout(debounceTimer);
}

async function runSearch() {
  const q = els.query.value.trim();
  els.detail.hidden = true;
  if (!q) {
    els.results.innerHTML = "";
    els.status.textContent = "검색어를 입력하세요.";
    return;
  }

  const rows = await search(q, { limit: 30 });
  if (!rows.length) {
    els.results.innerHTML = "";
    els.status.textContent = `"${q}" 결과 없음`;
    return;
  }

  els.status.textContent = `${rows.length}건`;
  els.results.innerHTML = rows.map(r => `
    <div class="hist-stat" data-guide-id="${escape(r.id)}" role="button" tabindex="0"
         title="${escape(r.scientific_name)}">
      <dt>${escape(r.name)}</dt>
      <dd>${escape(r.scientific_name || "—")} · p.${escape(String(r.page))}</dd>
    </div>`).join("");
}

async function showDetail(id) {
  const g = await getById(id);
  if (!g) return;
  els.dName.textContent   = g.name;
  els.dLatin.textContent  = g.scientific_name || "—";
  els.dBloom.textContent  = formatBloom(g.flowering_start, g.flowering_end);
  els.dHeight.textContent = g.height || "—";
  els.dLight.textContent  = g.light || "—";
  els.dUse.textContent    = g.landscape_use || "—";
  els.dMarket.textContent = g.market_size || "—";
  els.dDens.textContent   = g.plant_density
    ? `${g.plant_density.min} / ${g.plant_density.mid} / ${g.plant_density.max}`
    : "—";
  els.dPage.textContent   = g.page ? `p.${g.page}` : "—";
  els.detail.hidden = false;
}

function formatBloom(start, end) {
  if (start == null && end == null) return "—";
  if (start != null && end != null) return start === end ? `${start}월` : `${start}~${end}월`;
  return `${start ?? end}월`;
}

/** 도감 원문에 어떤 문자가 있어도 안전하게 렌더링한다. */
function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
