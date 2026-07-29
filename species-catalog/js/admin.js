/**
 * admin — 관리자 화면 컨트롤러 (admin.html 전용).
 *
 * 설계 근거: ADMIN.md
 *
 * 원칙
 *   · **읽기 전용**. 어떤 데이터도 생성·수정·삭제하지 않는다.
 *   · 별도 페이지(admin.html)라 index.html / app.js 를 전혀 건드리지 않는다.
 *   · 기존 자산만 재사용한다 — auth.js(로그인 게이트) · supabaseClient(세션) ·
 *     audit_log(트리거가 이미 기록 중) · 기존 CSS.
 *
 * ⚠️ 권한에 대한 정직한 한계
 *   여기서 하는 role 검사는 **화면 제어용**이다. 정적 사이트라 클라이언트
 *   코드는 신뢰할 수 없고, 실제 데이터 보호는 서버측 RLS 가 담당한다.
 *   현재 이 검사는 두 가지 이유로 접근을 "막는" 것이 아니라 "감추는"
 *   수준에 그친다:
 *     1) `audit_log` RLS(policies.sql:107)가 `to authenticated` 라
 *        로그인한 사용자면 누구나 직접 조회할 수 있다.
 *     2) `users_update_self`(policies.sql:34)가 자기 행 UPDATE 를 허용하고
 *        `role` 컬럼을 막는 정책·트리거가 없어, 사용자가 스스로
 *        role='admin' 으로 바꿀 수 있다.
 *   admin 전용으로 강제하려면 서버측 정책 보강이 필요하다
 *   (ADMIN.md §7 확인 필요 1번).
 */

import { initAuthGate, currentUser } from "./auth.js";
import { getSupabase, isCloudConfigured } from "./supabaseClient.js";

const PAGE_SIZE = 200;

const els = {};
let userMap = new Map();   // uuid → email (표시용)

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cache();

  if (!isCloudConfigured()) {
    deny("Cloud 가 설정되지 않았습니다 — 관리자 화면은 Cloud 연결이 필요합니다.");
    return;
  }

  try {
    await initAuthGate();          // 미로그인 시 게이트가 여기서 대기한다
  } catch (err) {
    deny("로그인 처리 실패: " + (err?.message || err));
    return;
  }

  const user = currentUser();
  if (!user) { deny("로그인이 필요합니다."); return; }

  const role = await fetchRole(user.id);
  els.who.textContent = `${user.email || user.id} · ${role}`;
  els.dashUser.textContent = user.email || user.id;
  els.dashRole.textContent = role;

  if (role !== "admin") {
    deny(`관리자 권한이 필요합니다. 현재 권한: ${role}`);
    return;
  }

  els.main.hidden = false;
  wire();
  await loadUserOptions();
  console.info("[admin] ready · role=admin");
}

function cache() {
  els.who        = document.getElementById("admWho");
  els.denied     = document.getElementById("admDenied");
  els.deniedMsg  = document.getElementById("admDeniedMsg");
  els.main       = document.getElementById("admMain");

  els.navDash    = document.getElementById("navDashboard");
  els.navAudit   = document.getElementById("navAudit");
  els.paneDash   = document.getElementById("paneDashboard");
  els.paneAudit  = document.getElementById("paneAudit");

  els.dashUser   = document.getElementById("dashUser");
  els.dashRole   = document.getElementById("dashRole");
  els.dashCount  = document.getElementById("dashAuditCount");

  els.fTable     = document.getElementById("fTable");
  els.fUser      = document.getElementById("fUser");
  els.fFrom      = document.getElementById("fFrom");
  els.fTo        = document.getElementById("fTo");
  els.search     = document.getElementById("auditSearch");
  els.status     = document.getElementById("auditStatus");
  els.rows       = document.getElementById("auditRows");

  els.detail     = document.getElementById("auditDetail");
  els.adTitle    = document.getElementById("adTitle");
  els.adBefore   = document.getElementById("adBefore");
  els.adAfter    = document.getElementById("adAfter");
}

function wire() {
  els.navDash.addEventListener("click", () => showPane("dash"));
  els.navAudit.addEventListener("click", () => showPane("audit"));
  els.search.addEventListener("click", runAuditQuery);
  els.rows.addEventListener("click", e => {
    const tr = e.target.closest("tr[data-idx]");
    if (tr) showDetail(Number(tr.dataset.idx));
  });
}

function showPane(which) {
  els.paneDash.hidden  = which !== "dash";
  els.paneAudit.hidden = which !== "audit";
}

function deny(msg) {
  els.who.textContent = "접근 불가";
  els.deniedMsg.textContent = msg;
  els.denied.hidden = false;
  els.main.hidden = true;
  console.warn("[admin] denied:", msg);
}

/** users.role 조회. 실패 시 'user' 로 간주(보수적). */
async function fetchRole(userId) {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("users").select("role").eq("id", userId).maybeSingle();
    if (error) throw error;
    return data?.role || "user";
  } catch (err) {
    console.warn("[admin] role 조회 실패:", err?.message || err);
    return "user";
  }
}

/** 변경자 필터용 사용자 목록 (표시는 email). */
async function loadUserOptions() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.from("users").select("id, email");
    if (error) throw error;
    userMap = new Map((data || []).map(u => [u.id, u.email || u.id]));
    for (const [id, email] of userMap) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = email;
      els.fUser.appendChild(opt);
    }
  } catch (err) {
    console.warn("[admin] users 조회 실패:", err?.message || err);
  }
}

/** audit_log 조회 — SELECT 만 수행한다. */
let lastRows = [];

async function runAuditQuery() {
  els.status.textContent = "조회 중…";
  els.rows.innerHTML = "";
  els.detail.hidden = true;

  try {
    const supabase = await getSupabase();
    let q = supabase.from("audit_log")
      .select("id, table_name, row_id, action, old_data, new_data, changed_by, changed_at")
      .order("changed_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (els.fTable.value) q = q.eq("table_name", els.fTable.value);
    if (els.fUser.value)  q = q.eq("changed_by", els.fUser.value);
    if (els.fFrom.value)  q = q.gte("changed_at", new Date(els.fFrom.value).toISOString());
    if (els.fTo.value) {
      const to = new Date(els.fTo.value);
      to.setDate(to.getDate() + 1);              // 종료일 포함
      q = q.lt("changed_at", to.toISOString());
    }

    const { data, error } = await q;
    if (error) throw error;

    lastRows = data || [];
    render(lastRows);
    els.status.textContent = lastRows.length
      ? `${lastRows.length}건${lastRows.length === PAGE_SIZE ? ` (최대 ${PAGE_SIZE}건 표시)` : ""}`
      : "결과 없음";
    els.dashCount.textContent = `${lastRows.length}건`;
  } catch (err) {
    els.status.textContent = "조회 실패: " + (err?.message || err);
    console.warn("[admin] audit 조회 실패:", err?.message || err);
  }
}

function render(rows) {
  els.rows.innerHTML = rows.map((r, i) => `
    <tr data-idx="${i}" role="button" tabindex="0">
      <td>${esc(fmtTime(r.changed_at))}</td>
      <td>${esc(r.table_name)}</td>
      <td>${esc(r.action)}</td>
      <td>${esc(r.row_id)}</td>
      <td>${esc(userMap.get(r.changed_by) || r.changed_by || "—")}</td>
    </tr>`).join("");
}

function showDetail(idx) {
  const r = lastRows[idx];
  if (!r) return;
  els.adTitle.textContent = `${r.table_name} · ${r.action} · ${r.row_id}`;
  els.adBefore.textContent = r.old_data ? JSON.stringify(r.old_data, null, 2) : "—";
  els.adAfter.textContent  = r.new_data ? JSON.stringify(r.new_data, null, 2) : "—";
  els.detail.hidden = false;
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("ko-KR");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
