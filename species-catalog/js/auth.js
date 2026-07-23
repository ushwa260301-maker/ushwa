/**
 * Google 로그인 · 세션 관리 · 로그인 게이트 (Auth 계층).
 *
 * 역할
 *   · initAuthGate() — 앱 부팅 시 1회 호출. Cloud 미설정이면 즉시
 *     resolve (현행 LocalStorage 동작 그대로). 설정돼 있으면 세션을
 *     확인하고, 없으면 전체 화면 로그인 게이트를 띄운 채 로그인이
 *     완료될 때까지 resolve 하지 않는다.
 *   · 로그인 성공 시 public.users 에 upsert (email · last_login_at) —
 *     소유권이 아니라 "누가" 기록용 (공용 데이터 원칙).
 *   · 헤더에 프로필 칩(아바타 + 로그아웃)을 JS 로 주입 — index.html /
 *     CSS 파일은 손대지 않는다 (debugPanel 의 preview strip 과 동일 기법).
 *
 * 게이트 UI 는 전부 이 파일이 동적 생성/제거한다. Cloud 미설정 상태
 * 에서는 DOM 에 아무것도 추가되지 않는다.
 */

import { getSupabase, isCloudConfigured } from "./supabaseClient.js";

/** @type {{uid:string, email:string, name:string, avatar:string}|null} */
let sessionUser = null;

/** 현재 로그인 사용자 (Cloud 미설정/미로그인 → null). */
export function currentUser() {
  return sessionUser;
}

/**
 * 앱 부팅 게이트. app.js init() 최상단에서 await 한다.
 *
 *   · Cloud 미설정  → 즉시 resolve(null) — 기존 동작 무변화.
 *   · 세션 있음     → users upsert 후 resolve(user).
 *   · 세션 없음     → 게이트 표시 · 로그인 완료 시 resolve(user).
 *
 * @returns {Promise<object|null>}
 */
export async function initAuthGate() {
  if (!isCloudConfigured()) {
    console.info("[auth] cloud not configured — login gate skipped");
    return null;
  }

  const supabase = await getSupabase();

  // OAuth redirect 복귀 포함 — 현재 세션 확인.
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await handleSignedIn(supabase, session);
    watchAuthChanges(supabase);
    return sessionUser;
  }

  // 미로그인 — 게이트를 띄우고 로그인 완료까지 대기.
  showGate();
  watchAuthChanges(supabase);
  return new Promise(resolve => {
    gateResolve = resolve;
  });
}

/** Google OAuth 로그인 시작 (redirect flow — 정적 사이트 표준). */
export async function signInWithGoogle() {
  const supabase = await getSupabase();
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    console.error("[auth] signIn failed:", error.message);
    setGateMessage(`로그인 실패: ${error.message}`);
  }
}

/** 로그아웃 — 게이트가 다시 나타난다. */
export async function signOut() {
  const supabase = await getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
  // onAuthStateChange(SIGNED_OUT) 가 게이트 재표시를 처리.
}

// ============================================================
// Internals — 세션 이벤트
// ============================================================

let gateResolve = null;
let authWatcherAttached = false;

function watchAuthChanges(supabase) {
  if (authWatcherAttached) return;
  authWatcherAttached = true;
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.info("[auth] state:", event);
    if (event === "SIGNED_IN" && session) {
      await handleSignedIn(supabase, session);
      if (gateResolve) { gateResolve(sessionUser); gateResolve = null; }
    } else if (event === "SIGNED_OUT") {
      sessionUser = null;
      removeProfileChip();
      showGate();
    }
  });
}

async function handleSignedIn(supabase, session) {
  const u = session.user;
  sessionUser = {
    uid:    u.id,
    email:  u.email || "",
    name:   u.user_metadata?.full_name || u.user_metadata?.name || u.email || "",
    avatar: u.user_metadata?.avatar_url || u.user_metadata?.picture || ""
  };

  // users upsert — attribution 기록 (소유권 아님).
  try {
    const { error } = await supabase.from("users").upsert({
      id:            sessionUser.uid,
      email:         sessionUser.email,
      display_name:  sessionUser.name,
      avatar_url:    sessionUser.avatar,
      last_login_at: new Date().toISOString()
    }, { onConflict: "id" });
    if (error) console.warn("[auth] users upsert failed:", error.message);
  } catch (err) {
    console.warn("[auth] users upsert threw:", err?.message || err);
  }

  hideGate();
  injectProfileChip();
}

// ============================================================
// Internals — 게이트 오버레이 (JS 주입 · inline style · HTML 무수정)
// ============================================================

const GATE_ID = "authGateOverlay";

function showGate() {
  if (document.getElementById(GATE_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = GATE_ID;
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;" +
    "justify-content:center;background:rgba(10,14,12,0.92);backdrop-filter:blur(4px);";

  const card = document.createElement("div");
  card.style.cssText =
    "max-width:360px;width:90%;padding:36px 32px;border-radius:12px;" +
    "background:#161d18;border:1px solid #2c3a30;color:#e6ece7;" +
    "display:flex;flex-direction:column;gap:16px;text-align:center;" +
    "font-family:inherit;";

  const title = document.createElement("h2");
  title.textContent = "수종 도감 · Species Catalog";
  title.style.cssText = "margin:0;font-size:20px;font-weight:700;";

  const desc = document.createElement("p");
  desc.textContent =
    "조경업체 거래명세서 공용 데이터 플랫폼입니다. " +
    "모든 데이터는 로그인한 사용자 전체가 함께 사용합니다.";
  desc.style.cssText = "margin:0;font-size:13px;line-height:1.6;opacity:.75;";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Google 계정으로 로그인";
  btn.style.cssText =
    "padding:12px 20px;border-radius:8px;border:1px solid #3a4a3f;" +
    "background:#233127;color:#e6ece7;font-size:14px;font-weight:600;" +
    "cursor:pointer;";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Google 로 이동 중…";
    signInWithGoogle();
  });

  const msg = document.createElement("p");
  msg.id = GATE_ID + "Msg";
  msg.style.cssText = "margin:0;font-size:12px;color:#e08484;min-height:1em;";

  card.append(title, desc, btn, msg);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function hideGate() {
  document.getElementById(GATE_ID)?.remove();
}

function setGateMessage(text) {
  const el = document.getElementById(GATE_ID + "Msg");
  if (el) el.textContent = text;
}

// ============================================================
// Internals — 헤더 프로필 칩 (JS 주입)
// ============================================================

const CHIP_ID = "authProfileChip";

function injectProfileChip() {
  if (!sessionUser || document.getElementById(CHIP_ID)) return;
  const host = document.querySelector(".masthead-meta");
  if (!host) return;

  const chip = document.createElement("button");
  chip.id = CHIP_ID;
  chip.type = "button";
  chip.title = `${sessionUser.email} · 클릭하면 로그아웃`;
  chip.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;padding:4px 10px;" +
    "border-radius:999px;border:1px solid rgba(128,128,128,.35);" +
    "background:transparent;color:inherit;font-size:12px;cursor:pointer;";

  if (sessionUser.avatar) {
    const img = document.createElement("img");
    img.src = sessionUser.avatar;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.style.cssText = "width:18px;height:18px;border-radius:50%;";
    chip.appendChild(img);
  }
  const label = document.createElement("span");
  label.textContent = sessionUser.name || sessionUser.email;
  chip.appendChild(label);

  chip.addEventListener("click", () => {
    if (confirm("로그아웃 하시겠습니까?")) signOut();
  });
  host.appendChild(chip);
}

function removeProfileChip() {
  document.getElementById(CHIP_ID)?.remove();
}
