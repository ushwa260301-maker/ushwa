/**
 * Supabase client 싱글턴 — Cloud 계층의 최하층 (Infra).
 *
 * 이 파일만 Supabase 프로젝트 좌표(URL + anon key)를 안다.
 * 다른 모듈은 전부 `getSupabase()` 를 통해서만 접근한다.
 *
 *   ┌─ 설정 방법 ───────────────────────────────────────────────┐
 *   │ 아래 SUPABASE_URL / SUPABASE_ANON_KEY 상수에 Supabase     │
 *   │ 프로젝트의 값을 채우면 Cloud 모드가 활성화된다.           │
 *   │                                                          │
 *   │ 두 값이 비어 있으면 `isCloudConfigured()` 가 false 를    │
 *   │ 반환하고, 앱은 지금까지처럼 LocalStorage 단독으로 동작   │
 *   │ 한다 (로그인 게이트도 나타나지 않음). 따라서 이 파일이   │
 *   │ 배포되어도 Supabase 프로젝트가 준비되기 전까지 사용자    │
 *   │ 경험은 아무것도 변하지 않는다 — 안전한 단계적 전환.      │
 *   └──────────────────────────────────────────────────────────┘
 *
 * anon key 는 공개 전제의 클라이언트 키다 — 실제 접근 제어는 서버의
 * RLS(policies.sql)가 담당하므로 정적 사이트에 노출되어도 안전하다.
 *
 * SDK 는 CDN ESM 을 지연 import 한다 (Tesseract/pdf.js 와 동일 패턴).
 * 미설정 상태에서는 네트워크 요청이 한 번도 발생하지 않는다.
 */

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabaseConfig.js";

const SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;   // supabase-js v2 는 publishable key 를 anon 자리에 그대로 받음

const SUPABASE_SDK_SRC =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/** Cloud 모드 여부 — 두 상수가 모두 채워졌을 때만 true. */
export function isCloudConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** @type {Promise<object>|null} */
let clientPromise = null;

/**
 * Supabase 클라이언트 싱글턴을 반환한다.
 * 미설정 상태에서는 null 을 반환한다 (throw 하지 않음 — 호출자는
 * isCloudConfigured() 로 먼저 분기하는 것이 정석이지만, 방어적으로도
 * 안전하게).
 *
 * @returns {Promise<object|null>}
 */
export async function getSupabase() {
  if (!isCloudConfigured()) return null;
  if (clientPromise) return clientPromise;
  clientPromise = import(/* webpackIgnore: true */ SUPABASE_SDK_SRC)
    .then(mod => {
      const { createClient } = mod;
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,       // 새로고침 후 세션 유지
          autoRefreshToken: true,
          detectSessionInUrl: true    // OAuth redirect 복귀 처리
        }
      });
      console.info("[supabase] client initialized");
      return client;
    })
    .catch(err => {
      clientPromise = null;           // 다음 호출에서 재시도 가능
      console.error("[supabase] SDK load failed:", err?.message || err);
      throw new Error(`Supabase SDK 로드 실패 — ${err?.message || err}`);
    });
  return clientPromise;
}
