-- =====================================================================
-- Supabase 최소 스텁 — tests/db-schema.mjs 전용
-- =====================================================================
--
-- 로컬 PostgreSQL 에는 Supabase 가 제공하는 auth · storage 스키마와 역할이
-- 없다. 저장소의 SQL(supabase/*.sql)이 **참조하는 것만** 흉내 낸다.
-- Supabase 의 실제 동작(인증 · 스토리지 · RLS 판정 주체)을 재현하지 않는다 —
-- 이 스텁 위에서 검증하는 것은 "SQL 이 현재 스키마에 문제없이 적용되는가" 다.
--
-- 참조 근거 (2026-09-30 기준 grep):
--   auth.uid()          28회   · auth.users  2회   · to authenticated  39회
--   storage.buckets (id, name, public)  · storage.objects (bucket_id) 정책
-- 새 SQL 이 여기에 없는 Supabase 객체를 참조하면 db-schema 가 실패한다 —
-- 그때 이 파일에 최소한으로 추가한다.
-- =====================================================================

create extension if not exists pgcrypto;          -- gen_random_uuid (PG13+ 는 내장이지만 명시)

create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);
-- 로그인 세션이 없는 상태를 흉내 낸다 (트리거의 changed_by 등이 null).
create or replace function auth.uid() returns uuid
  language sql stable as $$ select null::uuid $$;

do $$ begin create role anon;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);
create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text
);
alter table storage.objects enable row level security;
