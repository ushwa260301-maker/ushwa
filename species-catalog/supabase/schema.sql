-- ============================================================
-- Species Catalog · Cloud Database Schema  (T1)
-- ============================================================
-- 대한민국 조경업체 거래명세서 공용 OCR 데이터베이스.
--
-- 설계 원칙
--   · Cloud = Source of Truth. LocalStorage/IndexedDB 는 캐시.
--   · 개인 소유권 없음 — created_by/uploaded_by 는 "누가" 기록용.
--   · species/invoices/invoice_items 의 id 는 TEXT — 기존
--     LocalStorage v2 데이터(sp-###, inv-###, item-###)를 ID 보존
--     마이그레이션하기 위함. 신규 행은 RPC 가 uuid 기반 텍스트 생성.
--   · price_history 는 실테이블이 아니라 VIEW — 가격 이력의 진실은
--     invoice_items 한 곳에만 존재 (이중 쓰기 → 불일치 원천 차단).
--   · ocr_corrections / fixtures 는 INSERT-ONLY (정책은 policies.sql).
--
-- 적용 방법: Supabase SQL Editor 에서 이 파일 → policies.sql →
--            triggers.sql → rpc.sql 순으로 실행.
-- ============================================================

-- ------------------------------------------------------------
-- users — Supabase auth.users 1:1 미러 (로그인 감사 · attribution)
-- ------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  display_name  text,
  avatar_url    text,
  role          text not null default 'user' check (role in ('user', 'admin')),
  created_at    timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- suppliers — 거래처 정규화. norm_name UNIQUE 가 표기 차이 중복을
-- DB 레벨에서 단일화 (동시 등록 레이스 컨디션에도 안전).
-- ------------------------------------------------------------
create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  norm_name  text not null unique,   -- lower + 공백 제거 (rpc.sql 의 fn_norm_supplier_name)
  region     text not null default '',
  phone      text not null default '',
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- species — 수종 카탈로그 (공용).
--   · id TEXT: 기존 sp-### 보존 (matcher/seed 참조 무손상 마이그레이션)
--   · suppliers jsonb: 현 앱 카드 UI 가 쓰는 임베드 목록의 이관 수용.
--     정규화된 구매이력은 invoice_items→invoices→suppliers 로 계산.
-- ------------------------------------------------------------
create table if not exists public.species (
  id           text primary key,
  name         text not null,
  latin        text not null default '',
  category     text not null default '',
  bloom_months int[]  not null default '{}',
  colors       text[] not null default '{}',
  suppliers    jsonb  not null default '[]',
  notes        text   not null default '',
  version      int    not null default 1,
  created_by   uuid references public.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- invoices — 거래명세서 헤더.
--   supplier_id: 정규화 FK. supplier/supplier_phone/supplier_address 는
--   원문 스냅샷 (앱 표시 호환 + OCR 원문 보존 — 정규화가 원문을 잃지 않게).
-- ------------------------------------------------------------
create table if not exists public.invoices (
  id                text primary key,
  invoice_date      date not null,
  invoice_number    text not null default '',
  supplier_id       uuid references public.suppliers (id),
  supplier          text not null,               -- 표시용 스냅샷
  supplier_phone    text not null default '',
  supplier_address  text not null default '',
  ocr_correction_id uuid,                        -- FK 는 ocr_corrections 정의 후 추가
  version           int not null default 1,
  uploaded_by       uuid references public.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ------------------------------------------------------------
-- invoice_items — 품목. spec 은 NULLABLE (계약: 규격은 Optional ·
-- OCR raw 에 명확할 때만 저장, 추측 금지).
-- ------------------------------------------------------------
create table if not exists public.invoice_items (
  id           text primary key,
  invoice_id   text not null references public.invoices (id) on delete cascade,
  species_id   text references public.species (id),
  species_name text not null,
  spec         text,                             -- nullable · 규격 Optional
  unit         text not null default '주',
  quantity     numeric not null default 1 check (quantity >= 0),
  unit_price   numeric not null default 0 check (unit_price >= 0),
  amount       numeric not null default 0 check (amount >= 0),
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- attachments — 첨부 메타. 원본 파일은 Supabase Storage
-- (bucket: attachments · path = storage_path). Blob 은 DB 에 안 넣음.
-- ------------------------------------------------------------
create table if not exists public.attachments (
  id             text primary key,
  invoice_id     text not null references public.invoices (id) on delete cascade,
  filename       text not null,
  mime_type      text not null,
  size_bytes     bigint not null default 0,
  storage_path   text not null,
  thumbnail_path text not null default '',
  uploaded_by    uuid references public.users (id),
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ocr_corrections — OCR 학습 데이터 (INSERT-ONLY).
-- 수정할 때마다 새 행 (version+1) — 수정 이력 자체가 학습 데이터.
-- engine_version = vision.js 커밋 SHA → 엔진 버전별 정확도 추이 산출.
-- invoice 삭제 시에도 보존 (on delete set null) — 데이터셋은 영구 누적.
-- ------------------------------------------------------------
create table if not exists public.ocr_corrections (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         text references public.invoices (id) on delete set null,
  version            int not null default 1,
  raw_text           text not null default '',
  normalized_text    text not null default '',
  parsed_fields      jsonb not null default '{}',
  user_edited_fields jsonb,
  debug_meta         jsonb not null default '{}',
  engine_version     text not null default '',
  uploaded_by        uuid references public.users (id),
  created_at         timestamptz not null default now()
);

alter table public.invoices
  drop constraint if exists invoices_ocr_correction_id_fkey;
alter table public.invoices
  add constraint invoices_ocr_correction_id_fkey
  foreign key (ocr_correction_id) references public.ocr_corrections (id);

-- ------------------------------------------------------------
-- fixtures — OCR 회귀 fixture 미러 (INSERT-ONLY · git 이 primary).
-- id 는 텍스트 ('24-parens-account-holder-supplier' 형식 유지).
-- ------------------------------------------------------------
create table if not exists public.fixtures (
  id                   text primary key,
  description          text not null default '',
  ocr_text             text not null,
  expect               jsonb not null default '{}',
  coverage             jsonb,
  change_log           jsonb not null default '[]',
  source_correction_id uuid references public.ocr_corrections (id),
  git_commit_sha       text not null default '',
  created_by           uuid references public.users (id),
  created_at           timestamptz not null default now()
);

-- ------------------------------------------------------------
-- audit_log — 모든 공용 테이블 변경 이력 (triggers.sql 이 자동 기록).
-- 애플리케이션은 직접 쓰지 않음.
-- ------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text not null,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data   jsonb,
  new_data   jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- price_history — VIEW (실테이블 아님).
-- 진실은 invoice_items 한 곳. 10만 행 이상에서 MATERIALIZED VIEW 로
-- 전환해도 이름이 같아 클라이언트 무수정.
-- ------------------------------------------------------------
create or replace view public.price_history as
select ii.species_id,
       ii.species_name,
       i.supplier_id,
       i.supplier,
       ii.spec,
       ii.unit,
       ii.quantity,
       ii.unit_price,
       ii.amount,
       i.invoice_date,
       ii.invoice_id,
       ii.id as invoice_item_id
from public.invoice_items ii
join public.invoices i on i.id = ii.invoice_id
where ii.species_id is not null;

-- ============================================================
-- Indexes — 목록·통계 쿼리의 접근 경로에 맞춤.
-- invoice_date 를 선두/차순위에 배치 → 향후 연도 파티셔닝 대비.
-- ============================================================
create index if not exists idx_invoices_date
  on public.invoices (invoice_date desc);
create index if not exists idx_invoices_supplier_date
  on public.invoices (supplier_id, invoice_date desc);
create index if not exists idx_invoices_uploader
  on public.invoices (uploaded_by, created_at desc);

create index if not exists idx_items_invoice
  on public.invoice_items (invoice_id);
create index if not exists idx_items_species_invoice
  on public.invoice_items (species_id, invoice_id);

create index if not exists idx_attachments_invoice
  on public.attachments (invoice_id);

create index if not exists idx_corrections_invoice
  on public.ocr_corrections (invoice_id);
create index if not exists idx_corrections_created
  on public.ocr_corrections (created_at desc);
create index if not exists idx_corrections_engine
  on public.ocr_corrections (engine_version);

create index if not exists idx_fixtures_created
  on public.fixtures (created_at desc);

create index if not exists idx_audit_row
  on public.audit_log (table_name, row_id);
create index if not exists idx_audit_user_time
  on public.audit_log (changed_by, changed_at desc);
