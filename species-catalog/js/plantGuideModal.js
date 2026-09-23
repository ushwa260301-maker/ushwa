/**
 * plantGuideModal — 도감(Plant Guide) 검색·상세 UI (Presentation 계층).
 *
 * 설계 근거: PLANT_GUIDE.md
 *
 * 격리 원칙
 *   · **조회 전용**. Species 를 생성/수정하지 않고 guide_id 도 저장하지 않는다.
 *   · LocalStorage · Sync 를 사용하지 않는다.
 *   · Cloud 는 **읽기만** 한다 (T12-1 UI-1) — `plant_taxa` · `plant_images`
 *     SELECT 뿐이고, 39,603종을 LocalStorage 에 내려받지 않는다. 조회는
 *     상세를 열 때 그 한 종에 대해서만 일어난다.
 *   · `species` · `invoice_items` · `ocr_corrections` 는 읽지 않는다.
 *   · app.js / state.js 를 import 하지 않는다 — 운영 데이터와 접점이 0 이라
 *     app.js 를 경유할 필요가 없고, 그래서 기존 부팅 흐름도 건드리지 않는다.
 *   · 도감 데이터는 plantGuideStore 가 **모달을 처음 열 때** 로드한다(지연 로드).
 *
 * 마크업은 index.html 의 #plantGuideModal 을 사용하며, 기존 모달 클래스
 * (.modal / .modal-panel / .modal-head / .hist-stats …)를 그대로 재사용한다
 * — CSS 는 추가하지 않는다.
 */

import { load, search, getById, listLoaded, status } from "./plantGuideStore.js";
import { fetchDetail, mergeDetail, resolveScientificName, sourceLabel }
  from "./plantDetailSource.js";

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

  // Species Detail (T12-1)
  els.dFamily   = document.getElementById("pgdFamily");
  els.dGenus    = document.getElementById("pgdGenus");
  els.dForm     = document.getElementById("pgdForm");
  els.dSource   = document.getElementById("pgdSource");
  els.dSynced   = document.getElementById("pgdSyncedAt");
  els.dImage    = document.getElementById("pgdImage");
  els.dPhotoBox = document.getElementById("pgdPhotoBox");
  els.dPhotoNil = document.getElementById("pgdPhotoEmpty");

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

  openFromUrl();
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

/** 값이 없으면 자리표시자. 빈 문자열을 그대로 넣으면 칸이 무너진다. */
const DASH = "—";
const dash = v => {
  const s = String(v ?? "").trim();
  return s === "" ? DASH : s;
};

/**
 * 도감 원본 → 화면이 읽는 한 가지 모양 (T12-1 UI-2).
 *
 * 출처가 늘어도 화면은 이 함수만 본다. 정적 도감 JSON 과 `plant_taxa` 는
 * 필드명이 다르므로 **여기서 한 번만** 맞춘다 — 화면이 출처마다 다른
 * 필드명을 알면 출처를 늘릴 때마다 화면을 고쳐야 한다.
 *
 *     plant_taxa.sunlight          ┐
 *     정적 도감 light              ┴→ light        (기준정보가 앞선다)
 *     plant_taxa.flowering_months  ┐
 *     정적 도감 flowering_start/end ┴→ bloom
 *
 * **없는 값을 지어내지 않는다.** 비면 빈 문자열로 두고 화면이 "—" 로 보여 준다.
 */
export function toDetailView(g) {
  if (!g) return null;
  return {
    name:           g.name || "",
    scientificName: g.scientific_name || "",
    family:         g.family || "",
    genus:          g.genus || "",
    // 생육형 — 관목·교목·초본. `form`/`plant_type` 은 이전 도감 표기.
    form:           g.growth_form || g.form || g.plant_type || "",
    // 기준정보가 정적 도감보다 앞선다.
    light:          g.sunlight || g.light || "",
    bloom:          g.flowering_months != null && g.flowering_months !== ""
      ? formatFloweringMonths(g.flowering_months)
      : formatBloom(g.flowering_start, g.flowering_end),
    height:         g.height || "",
    landscapeUse:   g.landscape_use || "",
    marketSize:     g.market_size || "",
    density:        g.plant_density
      ? `${g.plant_density.min} / ${g.plant_density.mid} / ${g.plant_density.max}`
      : "",
    page:           g.page ? `p.${g.page}` : "",
    imageUrl:       g.image_url || "",
    source:         sourceLabel(g.source),      // KNA_IMAGE_CSV → 국립수목원 표준식물목록
    syncedAt:       formatDate(g.synced_at)
  };
}

/**
 * 상세를 연다 (T12-1 UI-1 / UI-3).
 *
 * 정적 도감을 **먼저** 그리고, Cloud 기준정보가 오면 덧그린다. 순서가
 * 중요하다 — 네트워크를 기다리며 빈 화면을 보여 주지 않는다. Cloud 가
 * 느리거나 실패해도 책에 있는 값(광조건·개화월·크기)은 이미 떠 있다.
 */
async function showDetail(id) {
  const guide = await getById(id);
  if (guide) await renderDetailFor(guide);
}

async function renderDetailFor(guide) {
  const base = toDetailView(guide);
  if (!base) return;

  render(base);
  els.detail.hidden = false;

  const client = await getCloudClient();
  if (!client) return;

  // 조회가 끝나기 전에 사용자가 다른 종을 눌렀으면 그 결과를 버린다 —
  // 늦게 도착한 응답이 지금 보고 있는 종을 덮어쓰면 안 된다.
  const token = ++detailToken;
  try {
    const cloud = await fetchDetail(client, guide.scientific_name);
    if (token !== detailToken) return;
    if (!cloud.taxa && !cloud.image) return;
    render(toDetailView(mergeDetail(guide, cloud)));
  } catch (err) {
    console.warn("[guide-ui] 기준정보 조회 실패:", err?.message || err);
  }
}

/** 로마자가 섞여 있으면 학명으로 본다. 국명에는 로마자가 없다. */
const looksScientific = s => /[A-Za-z]/.test(s);

/**
 * 이름 하나로 상세를 연다 — URL 딥링크 (T12-1.2).
 *
 *     index.html?plant=Hydrangea serrata
 *     index.html?plant=산수국
 *
 * **검색이 아니다.** 정확히 같은 이름만 연다. 정적 도감은 110~111쪽 12종뿐이라
 * 산수국은 거기에 없고, 그래서 Cloud 로 내려간다. 도감 전체를 Cloud 검색으로
 * 바꾸는 일은 T12-4 이며 여기서 당기지 않는다.
 */
export async function openByName(rawName) {
  const query = String(rawName ?? "").trim();
  if (!wired || !query) return;

  await open();
  els.query.value = query;

  // ① 정적 도감에 정확히 같은 이름이 있으면 그것을 쓴다.
  const hit = listLoaded().find(e => e.name === query || e.scientific_name === query);
  if (hit) { await renderDetailFor(hit); return; }

  // ② 없으면 기준정보에서 찾는다.
  const client = await getCloudClient();
  if (!client) {
    els.status.textContent = `"${query}" — 기준정보에 연결할 수 없습니다.`;
    return;
  }

  const scientificName = looksScientific(query)
    ? query
    : await resolveScientificName(client, query);

  if (!scientificName) {
    els.status.textContent = `"${query}" 결과 없음`;
    return;
  }

  els.status.textContent = "";
  await renderDetailFor({
    name: looksScientific(query) ? "" : query,
    scientific_name: scientificName
  });
}

/** `?plant=` 이 있으면 부팅 직후 그 상세를 연다. 없으면 아무 일도 하지 않는다. */
function openFromUrl() {
  let param = "";
  try {
    param = new URLSearchParams(location.search).get("plant") || "";
  } catch { return; }
  if (param) openByName(param);
}

/** 마지막으로 연 상세의 순번. 늦게 온 응답을 버리는 데 쓴다. */
let detailToken = 0;

/**
 * Supabase client — **상세를 열 때만** 가져온다.
 *
 * 도감은 로그인 없이도 열리므로 부팅 시 연결하지 않는다. 미설정·미로그인·
 * 네트워크 차단은 모두 "기준정보 없음"으로 같게 취급한다 — 화면은 정적
 * 도감만으로도 완결이다.
 */
async function getCloudClient() {
  try {
    const mod = await import("./supabaseClient.js");
    if (!mod.isCloudConfigured?.()) return null;
    return await mod.getSupabase();
  } catch (err) {
    console.info("[guide-ui] Cloud 미연결 — 정적 도감만 표시:", err?.message || err);
    return null;
  }
}

/** 뷰 모델 하나를 화면에 붙인다. 이 함수 밖에서 DOM 을 건드리지 않는다. */
function render(v) {
  els.dName.textContent   = v.name;
  els.dLatin.textContent  = dash(v.scientificName);
  els.dFamily.textContent = dash(v.family);
  els.dGenus.textContent  = dash(v.genus);
  els.dForm.textContent   = dash(v.form);
  els.dLight.textContent  = dash(v.light);
  els.dBloom.textContent  = dash(v.bloom);
  els.dHeight.textContent = dash(v.height);
  els.dUse.textContent    = dash(v.landscapeUse);
  els.dMarket.textContent = dash(v.marketSize);
  els.dDens.textContent   = dash(v.density);
  els.dPage.textContent   = dash(v.page);
  els.dSource.textContent = dash(v.source);
  els.dSynced.textContent = dash(v.syncedAt);
  renderPhoto(v.imageUrl, v.name);
}

/**
 * 대표 이미지. 없으면 자리표시자를 남겨 **칸 크기를 유지한다** —
 * 값이 채워질 때 화면이 뛰지 않는다.
 *
 * 이미지가 깨져도 같은 자리로 되돌린다. 국립수목원 URL 은 http 라
 * https 페이지에서 차단될 수 있고, 그때 빈 깨진 아이콘을 보여 주는 것보다
 * "이미지 없음"이 정직하다.
 */
function renderPhoto(url, alt) {
  if (!els.dImage || !els.dPhotoNil) return;
  const src = String(url ?? "").trim();
  if (!src) {
    els.dImage.hidden = true;
    els.dImage.removeAttribute("src");
    els.dPhotoNil.hidden = false;
    return;
  }
  els.dImage.onerror = () => {
    els.dImage.hidden = true;
    els.dPhotoNil.hidden = false;
    els.dPhotoNil.textContent = "이미지를 불러오지 못했습니다";
  };
  els.dPhotoNil.hidden = true;
  els.dPhotoNil.textContent = "이미지 없음";
  els.dImage.alt = alt ? `${alt} 사진` : "";
  els.dImage.src = src;
  els.dImage.hidden = false;
}

/** 동기화 시각은 날짜까지만 보여 준다 — 초 단위는 사용자에게 의미가 없다. */
function formatDate(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

/**
 * `plant_taxa.flowering_months` → "6~7월".
 *
 * 원본 모양을 아직 못 봤으므로(T12-2 가 적재한다) 문자열과 월 배열을 모두
 * 받는다. 문자열이면 **그대로 둔다** — 원본이 이미 사람이 읽는 표기라면
 * 우리가 다시 꾸밀 이유가 없고, 꾸미다 뜻을 바꾸는 쪽이 더 위험하다.
 *
 * 배열이면 연속 구간은 `6~8월`, 흩어져 있으면 `3 · 9월` 로 적는다.
 * 연속인지 아닌지를 무시하고 최소~최대로 적으면 없는 달이 있는 것처럼 된다.
 */
export function formatFloweringMonths(v) {
  if (v == null) return "";
  if (!Array.isArray(v)) return String(v).trim();

  const months = [...new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12))]
    .sort((a, b) => a - b);
  if (!months.length) return "";

  const contiguous = months.every((m, i) => i === 0 || m === months[i - 1] + 1);
  if (contiguous) {
    return months.length === 1 ? `${months[0]}월` : `${months[0]}~${months[months.length - 1]}월`;
  }
  return `${months.join(" · ")}월`;
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
