-- ============================================================
-- Species Catalog · 국립수목원 기준정보 (T12-2)
-- 2026-09-23
-- ============================================================
-- 목적
--   Species Detail 화면이 과·속·생육형·광조건·개화월을 읽을 곳을 만든다.
--   지금은 이 값들이 **어느 테이블에도 없어서** 화면에 `—` 로 나온다.
--
-- 원본 (확정)
--   · 국립수목원 표준식물목록 API — 과·속·학명·국명
--   · 국립수목원 식물자원 도감 API (`plantPilbkInfo`) — 형태·생육환경 서술
--   · 이미지는 `plant_images` 가 따로 맡는다 (2026-09-21 적재 완료)
--
-- 이 파일이 하지 않는 일
--   · `species` 를 건드리지 않는다 — 기준 도감과 거래 품명은 다른 것이다.
--   · `invoice_items` · `price_history` · `ocr_corrections` 를 건드리지 않는다.
--   · schema.sql 을 수정하지 않는다 — 신규 파일만 추가한다.
--   · 행을 넣지 않는다. 적재는 `tests/import-plant-taxa.mjs` 가 따로 한다.
--
-- 동작에 미치는 영향: **없음**
--   matcher 도 OCR 도 이 테이블을 읽지 않는다. 읽는 것은 화면
--   (`js/plantDetailSource.js`) 하나뿐이고, 없으면 `—` 로 두게 돼 있다.
--
-- 적용 방법: Supabase SQL Editor 에서 이 파일을 실행.
-- ============================================================


-- ⚠ **T12-2 가 화면에 쓰는 컬럼만 만든다.** 쓰지 않는 칸을 미리 파 두면
--   무엇이 실제로 채워지는 값이고 무엇이 빈 약속인지 구분할 수 없게 된다.
--   `metadata` · `status` · `origin` · `merged_into` 는 여기 없다 —
--   각각 T12-8 · T12-5 의 것이다.
create table if not exists public.plant_taxa (
  -- 학명이 열쇠다. `plant_images` 와 잇는 공통 ID 가 없어서, 두 출처를
  -- 붙이는 것은 학명 문자열뿐이다. 명명자가 붙어 와도 **원문 그대로** 넣는다
  -- — canonical 은 조회할 때 계산한다(`services/scientificName.js`).
  scientific_name   text primary key,

  korean_name       text,

  -- 과·속. API 가 필드로 준다 — 문장에서 뽑지 않는다.
  family            text,
  genus             text,

  -- ── 서술 문장에서 뽑은 값 ────────────────────────────────
  -- KNA 에는 이 셋에 해당하는 **필드가 없다.** 형태·생육환경 서술 안에만
  -- 있어서 `services/knaTaxonText.js` 가 원문에서 뽑는다.
  -- 원문이 말하지 않으면 null 이고, 화면은 `—` 로 보여 준다.
  growth_form       text,              -- 예: '낙엽 활엽 관목'
  sunlight          text,              -- 예: '반양지'
  flowering_months  smallint[],        -- 예: '{6,7}'

  -- ── 대조용 원문 ──────────────────────────────────────────
  -- 위 셋을 검증할 유일한 근거다. 파생값만 저장하면 규칙을 고쳤을 때 다시
  -- 계산할 수 없고, 값이 틀렸는지 확인할 방법도 없다.
  shpe_raw          text,              -- 형태 서술 원문
  grw_evrnt_raw     text,              -- 생육환경 서술 원문

  synced_at         timestamptz not null default now()
);

-- [확인 필요] `source` 컬럼을 두지 않았다 — 이 표의 모든 행이 KNA 에서 온다.
--   그래서 화면의 출처는 `plant_images.source`(`KNA_IMAGE_CSV`)가 말한다.
--   **이미지가 없는 종은 출처가 `—` 로 뜬다.** 산수국은 이미지가 있어
--   T12-2A 에는 영향이 없지만, 전체 적재(T12-2B) 때 다시 볼 것.

comment on table  public.plant_taxa is
  '국립수목원 기준정보. 화면(Species Detail)이 읽는다. OCR·거래와 무관.';
comment on column public.plant_taxa.flowering_months is
  '개화월. KNA 에 필드가 없어 shpe_raw 에서 뽑는다. 원문이 말하지 않으면 null.';
comment on column public.plant_taxa.shpe_raw is
  '형태 서술 원문. growth_form·flowering_months 를 대조·재계산하는 근거.';


-- ------------------------------------------------------------
-- 인덱스
-- ------------------------------------------------------------
-- 화면은 속명 prefix 로 후보를 좁힌 뒤 JS 에서 canonical 완전 일치를 본다
-- (`plantDetailSource.selectByGenus`). PK 의 기본 btree 가 이 `like 'Genus%'`
-- 를 받아 주지만, C 가 아닌 로케일에서는 prefix 스캔에 쓰이지 않는다.
-- `text_pattern_ops` 를 따로 걸어 로케일과 무관하게 인덱스를 타게 한다.
create index if not exists idx_plant_taxa_scientific_name_prefix
  on public.plant_taxa (scientific_name text_pattern_ops);

-- 국명 → 학명 해석(URL 딥링크). 정확히 같은 이름만 찾으므로 equality 다.
create index if not exists idx_plant_taxa_korean_name
  on public.plant_taxa (korean_name);


-- ------------------------------------------------------------
-- RLS — `plant_images` 와 같은 정책을 쓴다
-- ------------------------------------------------------------
-- 로그인한 사용자 전체가 함께 쓰는 공용 참고 데이터다. anon 에게는 정책을
-- 주지 않는다 = 차단. delete 정책도 두지 않는다 — 기준정보를 화면에서
-- 지울 이유가 없고, 지운다면 그건 재적재로 해야 한다.
alter table public.plant_taxa enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'plant_taxa'
                   and policyname = 'plant_taxa_select') then
    create policy plant_taxa_select on public.plant_taxa
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'plant_taxa'
                   and policyname = 'plant_taxa_insert') then
    create policy plant_taxa_insert on public.plant_taxa
      for insert to authenticated with check (true);
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'plant_taxa'
                   and policyname = 'plant_taxa_update') then
    create policy plant_taxa_update on public.plant_taxa
      for update to authenticated using (true) with check (true);
  end if;
end $$;


-- ============================================================
-- 적용 후 확인 쿼리 (읽기 전용)
-- ============================================================
-- 1) 테이블이 생겼는가
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'plant_taxa'
--    order by ordinal_position;
--
-- 2) 적재 후 — 화면 기준을 만족하는 행이 몇이나 되는가  ← T12-2 판정
--   select
--     count(*)                                                     as 전체,
--     count(*) filter (where family      <> '' and family      is not null) as 과,
--     count(*) filter (where genus       <> '' and genus       is not null) as 속,
--     count(*) filter (where growth_form is not null)              as 생육형,
--     count(*) filter (where sunlight    is not null)              as 광조건,
--     count(*) filter (where flowering_months is not null)         as 개화월
--   from public.plant_taxa;
--
-- 3) 산수국이 들어왔는가  ← Sprint 종료 조건
--   select scientific_name, korean_name, family, genus,
--          growth_form, sunlight, flowering_months, synced_at
--     from public.plant_taxa
--    where korean_name = '산수국';
--
--   기대: 범의귀과 · 수국속 · 관목 계열 · 광조건 · {6,7}
--   ※ 빈 칸이 있으면 shpe_raw / grw_evrnt_raw 를 함께 떠서 원문을 확인한다.
--     원문이 말하지 않은 것이면 그대로 두고, 뽑기 규칙이 놓친 것이면
--     services/knaTaxonText.js 를 고쳐 재적재한다.
--
-- 4) 이미지와 실제로 이어지는가
--   select t.korean_name, t.scientific_name, i.image_url
--     from public.plant_taxa t
--     join public.plant_images i
--       on split_part(i.scientific_name, ' ', 1) = split_part(t.scientific_name, ' ', 1)
--    where t.korean_name = '산수국'
--    limit 5;
--   ※ 실제 판정은 JS 의 canonical 비교다. 이 쿼리는 속명까지만 본다.


-- ============================================================
-- 롤백
-- ============================================================
--   drop table if exists public.plant_taxa;
--
-- 적재한 값이 함께 사라진다. 원본(KNA API)에서 다시 받을 수 있으므로
-- 복구 불가능한 손실은 아니지만, 재적재 시간이 든다.
