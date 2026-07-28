-- ============================================================
-- Species Catalog · users.role 보호  (T12.5)
-- ============================================================
-- 이 파일은 **추가 전용 마이그레이션**이다.
--   · schema.sql / policies.sql / triggers.sql 을 수정하지 않는다.
--   · 기존 정책을 drop 하지 않는다 (create trigger 로 추가만).
--   · 기존 데이터를 변경하지 않는다.
--
-- ------------------------------------------------------------
-- 문제
-- ------------------------------------------------------------
-- policies.sql:34 `users_update_self` 가 자기 행 UPDATE 를 허용한다:
--
--     for update to authenticated
--       using (id = auth.uid()) with check (id = auth.uid())
--
-- 이 정책은 **어떤 컬럼을 바꾸는지 구분하지 않는다.** schema.sql:28 의
-- role 컬럼은 check (role in ('user','admin')) 만 걸려 있고 이를 보호하는
-- 트리거는 존재하지 않는다(triggers.sql 에 public.users 대상 트리거 0개).
-- 따라서 로그인한 사용자가 다음 한 줄로 스스로 관리자가 될 수 있다:
--
--     update public.users set role = 'admin' where id = auth.uid();
--
-- 게다가 users 에는 감사 트리거도 없어 이 변경은 **흔적이 남지 않는다**.
--
-- ------------------------------------------------------------
-- 해법
-- ------------------------------------------------------------
-- Part 1. role 변경 차단 트리거
--   최종 사용자 JWT 가 있는 요청(auth.uid() is not null)에서는 role 변경을
--   거부한다. SQL Editor · service_role 처럼 최종 사용자 JWT 가 없는
--   경로(auth.uid() is null)에서는 허용해, 관리자 지정 수단을 남긴다.
--
--   RLS 정책을 고치지 않고 트리거를 쓰는 이유:
--     · WITH CHECK 는 NEW 행만 보므로 "이전 값과 같은가" 를 표현하려면
--       자기 테이블 서브쿼리가 필요해 취약하고 읽기 어렵다.
--     · 정책 수정은 drop policy 가 필요해 "추가만" 원칙에 어긋난다.
--     · 트리거는 RLS 를 우회하는 경로(향후 SECURITY DEFINER 함수 등)
--       에도 함께 적용되어 방어 범위가 더 넓다.
--
--   SECURITY DEFINER 를 쓰지 않는다 — 거부만 하는 트리거라 추가 권한이
--   필요 없고, 최소 권한 원칙에 맞다. authenticated 는 public.users 의
--   소유자가 아니므로 이 트리거를 disable/drop 할 수 없다.
--
-- Part 2. users 감사 기록
--   triggers.sql 의 기존 fn_audit() 을 그대로 재사용해 users 변경을
--   audit_log 에 남긴다. 함수는 수정하지 않고 트리거만 부착한다.
--
-- ============================================================


-- ------------------------------------------------------------
-- Part 1 — role 변경 차단
-- ------------------------------------------------------------
create or replace function public.fn_protect_user_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 최종 사용자 JWT 가 없는 경로(SQL Editor · service_role)는 통과시킨다.
  -- 관리자 지정은 이 경로로만 수행한다.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception
      'users.role 은 애플리케이션에서 변경할 수 없습니다 (요청 사용자 %). '
      '관리자 지정은 Supabase SQL Editor 에서 수행하십시오.', auth.uid()
      using errcode = '42501';   -- insufficient_privilege
  end if;

  return new;
end;
$$;

comment on function public.fn_protect_user_role() is
  'users.role 자가 승격 차단 (T12.5). 최종 사용자 JWT 가 있는 요청에서 role 변경 시 42501 로 거부.';

drop trigger if exists trg_protect_user_role on public.users;
create trigger trg_protect_user_role
  before update on public.users
  for each row execute function public.fn_protect_user_role();


-- ------------------------------------------------------------
-- Part 2 — users 변경 감사 기록
-- ------------------------------------------------------------
-- triggers.sql:41 의 fn_audit() 을 재사용한다 (함수 무수정).
-- 로그인마다 auth.js:139 의 upsert 가 UPDATE 를 발생시키므로 로그인
-- 이력이 함께 쌓인다 — 의도된 부수효과다(최종 로그인 추적).
-- audit_log 에 담기는 email/display_name/avatar_url 은 users_select
-- (policies.sql:30)로 이미 로그인 사용자 전원에게 공개된 값이라
-- 노출 범위가 넓어지지 않는다.
drop trigger if exists trg_audit_users on public.users;
create trigger trg_audit_users
  after insert or update or delete on public.users
  for each row execute function public.fn_audit();


-- ------------------------------------------------------------
-- 적용 후 관리자 지정 방법 (Supabase SQL Editor 에서 실행)
-- ------------------------------------------------------------
--   update public.users set role = 'admin' where email = '<관리자 이메일>';
--
-- 되돌리기:
--   update public.users set role = 'user'  where email = '<이메일>';
-- ============================================================
