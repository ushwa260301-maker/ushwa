-- ============================================================
-- Species Catalog · 표준식물목록 이미지 (T11-6.1)
-- 2026-09-21
-- ============================================================
-- 목적
--   국립수목원 표준식물목록 이미지 목록(공공데이터 15116414)을 한 테이블에
--   적재한다. 도감 API(`plantPilbkInfo`)는 사진을 주지 않는다 — 사진은 이
--   CSV 에만 있고, 도감과 이 목록을 잇는 공통 ID 는 **없다.** 유일한 고리가
--   학명 문자열이라서, 조회 경로 전체가 `scientific_name` 완전 일치다.
--
-- 이 파일이 지키는 제약
--   · schema.sql 수정 없음 — 신규 테이블만 추가한다.
--   · 기존 policy 삭제·수정 없음 — create policy 추가만.
--   · 기존 데이터 변경 없음 — 기존 테이블에 대한 UPDATE/DELETE 문 전무.
--   · 재실행 안전 — create ... if not exists + 정책 조건부 생성.
--
-- 설계 결정
--   · PK 가 (scientific_name, image_url) 인 이유
--       같은 식물이 꽃·잎·수피 여러 장을 갖는다. 학명만으로는 유일하지 않고,
--       URL 은 이미 원본이 부여한 식별자다. 둘을 합치면 자연키가 되고 —
--       재적재가 upsert 로 안전해진다(같은 CSV 를 두 번 넣어도 행이 늘지 않음).
--   · 대리키(uuid)를 두지 않는 이유
--       이 테이블은 참조되는 쪽이 아니다. 아무 FK 도 걸리지 않으므로 대리키는
--       인덱스 하나를 더 먹을 뿐 얻는 것이 없다.
--   · source 컬럼을 두는 이유
--       적재 출처가 하나뿐인 지금은 상수지만, 다른 목록이 섞여 들어온 뒤에는
--       어느 행이 어디서 왔는지 되짚을 수 없다. 나중에 컬럼을 추가하는 것보다
--       지금 두는 비용이 낮다.
--   · image_type 을 enum 으로 만들지 않는 이유
--       원본이 무엇을 주는지 전량 확인되지 않았다. 제약을 걸면 미확인 값이
--       적재 단계에서 조용히 버려진다. 원문을 그대로 받고, `flower`·`leaf`
--       같은 분류는 애플리케이션(plantNormalizer.photoType)이 **정확히 일치할
--       때만** 한다.
--
-- 적용 방법: Supabase SQL Editor 에서 이 파일을 실행.
-- ============================================================


-- ------------------------------------------------------------
-- 테이블
-- ------------------------------------------------------------
create table if not exists public.plant_images (
  -- 원본 학명. **명명자를 포함한 그대로** 보관한다 (Lavandula angustifolia Mill.).
  -- 공백만 정리해 넣는다(앞뒤 제거 + 연속 공백 1칸).
  --
  -- ⚠ 이 컬럼은 조회 키가 아니다. 우리 species.latin 은 명명자를 붙이지 않아
  --   원문끼리는 맞지 않는다(실측: 4,565종 × 77종에서 정확 매칭 0건).
  --   조회는 명명자를 뗀 canonical 로 하며, 그 값은 **저장하지 않는다** —
  --   파생값이라 원문과 어긋날 수 있고 규칙을 고칠 때마다 전량 재계산해야 한다.
  --   services/scientificName.js 가 조회 시점에 계산한다.
  --
  --   조회 경로: like 'Genus%' 로 후보를 받고 → JS 가 canonical 완전 일치 판정
  --   like 는 후보를 넓히기만 하고 어느 행이 붙을지 정하지 않는다.
  scientific_name text not null,

  -- 사진 캡션으로 쓴다. 조회 키가 아니다.
  korean_name     text not null,

  -- 원본이 준 "이미지 종류" 원문 (예: 꽃 · 잎 · 열매). 정규화하지 않는다.
  image_type      text not null,

  -- 원본 URL. **변형하지 않는다** — 재인코딩·리다이렉트 해석·CDN 치환 없음.
  image_url       text not null,

  source          text not null default 'KNA_IMAGE_CSV',

  created_at      timestamptz not null default now(),

  primary key (scientific_name, image_url)
);

-- TODO(T12): 대표 이미지 · 갤러리 기능에서 아래 컬럼을 추가한다.
--
--   is_primary    boolean not null default false
--       수종 카드에 내걸 한 장. 지금은 photos[0] 을 대표로 쓰는데, 그건 적재
--       순서일 뿐 "가장 잘 보여 주는 사진" 이 아니다.
--       ※ 한 학명에 true 가 둘 이상이면 안 된다 — 부분 유니크 인덱스로 막는다:
--         create unique index … on plant_images (scientific_name) where is_primary;
--
--   sort_order    int not null default 0
--       갤러리 배치 순서. 지금 순서는 CSV 행 순서라 의미가 없다.
--
--   review_status text not null default 'PENDING'
--       사람이 확인했는가 (PENDING · APPROVED · REJECTED).
--       이 목록의 image_type 이 전량 "사진" 이라 부위를 자동 판정할 수 없고,
--       품종/원종 오연결도 사람이 봐야 걸러진다.
--
-- 지금 넣지 않는 이유: 셋 다 **사람의 판단을 담는 컬럼**인데, 그 판단을 입력할
-- 화면이 아직 없다. 화면 없이 만들면 전량 기본값으로 남아 "검토했다"와
-- "검토한 적 없다"가 구분되지 않는다 — 없느니만 못한 상태다.
--
-- 추가는 신규 마이그레이션 파일로 한다. 이 파일은 수정하지 않는다(적용 완료).

-- 조회는 학명 단일 조건이다. PK 선두 컬럼이라 이미 인덱스가 서지만,
-- 명시해 두어야 PK 구성이 바뀌어도 조회 경로가 살아남는다.
--
-- [확인 필요] 조회가 like 'Genus%' 라서, 기본 collation 에서는 이 btree 가
--   쓰이지 않고 seq scan 이 된다. text_pattern_ops 인덱스를 따로 걸면 쓰이지만,
--   4,763행 규모에서는 seq scan 도 1ms 수준이라 지금 추가하지 않는다.
--   행 수가 크게 늘면 그때 별도 마이그레이션으로 추가한다.
create index if not exists idx_plant_images_scientific_name
  on public.plant_images (scientific_name);


-- ------------------------------------------------------------
-- RLS — 기존 테이블과 같은 원칙 (policies.sql)
-- ------------------------------------------------------------
-- 익명(anon)에는 정책을 만들지 않는다 = 차단.
-- 적재가 upsert 이므로 INSERT 와 UPDATE 가 모두 필요하다.
-- DELETE 정책은 만들지 않는다 → DB 레벨 거부. 잘못 적재한 행은 재적재로
-- 덮어쓴다(같은 PK). 원본 목록을 지우는 경로는 열지 않는다.
alter table public.plant_images enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'plant_images' and policyname = 'plant_images_select') then
    create policy plant_images_select on public.plant_images
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'plant_images' and policyname = 'plant_images_insert') then
    create policy plant_images_insert on public.plant_images
      for insert to authenticated with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'plant_images' and policyname = 'plant_images_update') then
    create policy plant_images_update on public.plant_images
      for update to authenticated using (true) with check (true);
  end if;
end $$;
-- DELETE 정책 없음 → 삭제 불가


-- ============================================================
-- 적재
-- ============================================================
-- CSV 는 Storage 버킷 `plant-images` 의 `plant_images.csv` 에 있다.
-- Postgres 는 Storage 를 직접 읽지 못하므로 SQL Editor 만으로는 적재할 수
-- 없다. 둘 중 하나를 쓴다.
--
--   (a) 대시보드   Table Editor → plant_images → Import data from CSV
--                  ※ 헤더가 한글이면 컬럼 매핑을 수동으로 지정해야 한다.
--
--   (b) 스크립트   node species-catalog/tests/import-plant-images.mjs <csv> --apply
--                  헤더를 컬럼에 맞춰 주고, 빈 URL 행을 건너뛰고,
--                  (scientific_name, image_url) 로 upsert 한다.
--                  --dry-run(기본)으로 먼저 무엇이 들어갈지 확인한다.
--
-- upsert 형태 (스크립트가 내보내는 것과 동일)
--   insert into public.plant_images
--     (scientific_name, korean_name, image_type, image_url, source)
--   values (...)
--   on conflict (scientific_name, image_url) do update
--     set korean_name = excluded.korean_name,
--         image_type  = excluded.image_type,
--         source      = excluded.source;
--   -- created_at 은 갱신하지 않는다 — 처음 적재 시점이 사실이다.


-- ============================================================
-- 적용 후 확인 쿼리
-- ============================================================
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'plant_images' order by policyname;
--
-- 기대 (3행)
--   plant_images_insert | INSERT
--   plant_images_select | SELECT
--   plant_images_update | UPDATE
--
-- 적재 결과 점검
--   select count(*) from public.plant_images;
--   select count(distinct scientific_name) from public.plant_images;
--   select image_type, count(*) from public.plant_images group by 1 order by 2 desc;
--
-- 앞뒤 공백이 남은 행이 있으면 적재 정규화가 어긋난 것이다 (기대: 0행)
--   select count(*) from public.plant_images
--    where scientific_name <> btrim(scientific_name)
--       or scientific_name ~ '\s\s';
--
-- 롤백
--   drop table public.plant_images;        -- 정책·인덱스가 함께 삭제된다
