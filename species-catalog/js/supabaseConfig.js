/**
 * Supabase 환경설정 — 정적 사이트의 "환경변수" 등가물.
 *
 * GitHub Pages 는 빌드 단계가 없어 process.env 를 쓸 수 없으므로,
 * 환경별 설정을 이 단일 모듈에 격리한다. 다른 파일은 이 값을 직접
 * 알지 못하고 supabaseClient.js 를 통해서만 사용한다.
 *
 * SUPABASE_PUBLISHABLE_KEY 는 공개 전제의 클라이언트 키다
 * (sb_publishable_… — 구 anon key 의 후속 형식). 실제 접근 제어는
 * 서버측 RLS(supabase/policies.sql)가 담당하므로 저장소에 커밋되어도
 * 안전하다. service_role 등 비밀 키는 절대 이 파일에 넣지 않는다.
 *
 * 두 값을 비우면 앱은 Cloud 없이 LocalStorage 단독으로 동작한다
 * (로그인 게이트 비활성).
 */

export const SUPABASE_URL = "https://egbbqibiaeuntzbabpec.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_oAuUYuKy5QvNcVsnPtN_BA_XfVpywoG";
