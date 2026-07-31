-- ============================================================
-- Species Catalog · 공급처 Alias 테이블 (Supplier Alias Phase A)
-- 2026-07-31
-- ============================================================
-- 목적
--   OCR 이 잘못 읽은 공급처명을 기존 공급처와 연결한다.
--     OCR  : 대림원예가듣센테
--     정답 : 대림원예가든센터
--
--   `suppliers.norm_name` 은 이미 `fn_norm_supplier_name()`(lower + 공백 제거)로
--   표기 차이를 흡수한다 — `대림 원예 가든` ↔ `대림원예가든` 은 alias 없이도
--   합쳐진다(실측 유사도 1.000). alias 가 메우는 것은 그 너머, **글자 자체가
--   틀린** 경우뿐이다.
--
-- 이 파일이 지키는 제약
--   · 기존 schema 수정 없음 — suppliers 를 포함해 기존 테이블 무수정.
--   · 기존 policy 삭제·수정 없음 — create policy 추가만.
--   · 기존 데이터 변경 없음 — UPDATE/DELETE 문 전무.
--   · 재실행 안전 — create ... if not exists + 정책 조건부 생성.
--
-- 확정된 설계 결정 (승인 완료)
--   · alias 승격 3회 정책 사용하지 않는다 — 사용자가 직접 고른 결과이므로
--     이미 사람 확인 1회를 거쳤다. 생성 즉시 적용한다.
--   · correction_count 컬럼 없음 — 갱신이 필요한 집계 컬럼은 append-only 와
--     충돌한다. 필요하면 count(*) 로 센다.
--   · confidence 컬럼 없음 — 계산 방법이 정의된 바 없다. 근거 없는 컬럼은
--     만들지 않는다.
--   · unique (norm_alias, supplier_id) 유지 — 같은 alias→같은 업체 중복 방지.
--   · unique (norm_alias) 는 만들지 않는다 — 한 alias 가 서로 다른 업체로
--     교정된 이력이 남아야 "모호한 alias" 를 탐지할 수 있다
--     (OCR_DATA_POLICY §5 규칙 4). UNIQUE 를 걸면 그 이력이 사라진다.
--
-- append-only 강제
--   DELETE 정책을 만들지 않는다 → 정책 부재 = 거부. fixtures/ocr_corrections
--   와 같은 방식으로 DB 레벨에서 삭제를 막는다.
-- ============================================================


-- ------------------------------------------------------------
-- 테이블
-- ------------------------------------------------------------
create table if not exists public.supplier_alias (
  id          uuid primary key default gen_random_uuid(),

  -- OCR 원문 그대로. 감사·재현용이며 조회 키로 쓰지 않는다.
  alias_text  text not null,

  -- 조회 키. fn_norm_supplier_name(alias_text) 와 항상 같아야 한다.
  -- 애플리케이션이 계산해 넣고, 아래 CHECK 가 그것을 강제한다.
  norm_alias  text not null,

  supplier_id uuid not null references public.suppliers (id),

  -- 'user'   사용자가 후보 목록에서 직접 고름 (현재 유일한 경로)
  -- 'rule'   규칙 기반 자동 생성 (미구현)
  -- 'import' 외부 일괄 등록 (미구현)
  source      text not null default 'user'
              check (source in ('user', 'rule', 'import')),

  -- 잘못 만든 alias 를 무효화하기 위한 플래그.
  -- [확인 필요] 현재 UPDATE 정책이 없어 값을 바꿀 수 없다. 무효화 경로를
  -- 열지 여부는 별도 결정 대상이며, 그때 UPDATE 정책만 추가하면 되도록
  -- 컬럼을 미리 둔다(나중에 컬럼을 추가하는 것보다 비용이 낮다).
  is_active   boolean not null default true,

  created_by  uuid references public.users (id),
  created_at  timestamptz not null default now(),

  -- 같은 alias 를 같은 업체로 두 번 등록하지 않는다.
  constraint supplier_alias_unique unique (norm_alias, supplier_id),

  -- norm_alias 가 alias_text 의 정규화 결과와 어긋나면 조회가 조용히 실패한다.
  -- 애플리케이션 실수를 DB 가 막는다.
  constraint supplier_alias_norm_matches
    check (norm_alias = public.fn_norm_supplier_name(alias_text)),

  -- 빈 alias 는 모든 것과 매칭될 수 있어 위험하다.
  constraint supplier_alias_not_blank check (length(norm_alias) > 0)
);

-- 조회 경로는 norm_alias 단일 조건이다. 무효 행은 조회하지 않으므로 부분 인덱스.
create index if not exists supplier_alias_norm_idx
  on public.supplier_alias (norm_alias) where is_active;

-- 특정 공급처에 붙은 alias 를 역방향으로 훑을 때 (관리·진단용).
create index if not exists supplier_alias_supplier_idx
  on public.supplier_alias (supplier_id);


-- ------------------------------------------------------------
-- RLS — suppliers 와 동일한 공용 정책 + append-only
-- ------------------------------------------------------------
-- alias 를 사용자별로 두지 않는 이유
--   `대림원예가듣센테 → 대림원예가든센터` 는 누가 올려도 같은 사실이다.
--   OCR 오탈자 교정은 개인 취향이 아니며, 사용자별로 두면 같은 학습을
--   사람 수만큼 반복해야 한다. suppliers 자체가 공용 테이블이므로 그 위에
--   붙는 alias 만 격리하면 계층이 어긋난다.
--
--   같은 날 적용한 ocr_corrections 격리와 대비되는데, 그쪽은 raw_text 에
--   개인정보가 들어가기 때문이다. alias 는 업체명 매핑뿐이라 해당 없다.
alter table public.supplier_alias enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'supplier_alias' and policyname = 'supplier_alias_select') then
    create policy supplier_alias_select on public.supplier_alias
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'supplier_alias' and policyname = 'supplier_alias_insert') then
    create policy supplier_alias_insert on public.supplier_alias
      for insert to authenticated with check (true);
  end if;
end $$;
-- UPDATE / DELETE 정책 없음 → DB 레벨 거부 (append-only)


-- ============================================================
-- 적용 후 확인 쿼리
-- ============================================================
-- select policyname, cmd, permissive
--   from pg_policies
--  where schemaname = 'public' and tablename = 'supplier_alias'
--  order by policyname;
--
-- 기대 (2행)
--   supplier_alias_insert | INSERT | PERMISSIVE
--   supplier_alias_select | SELECT | PERMISSIVE
--
-- 롤백
--   drop table public.supplier_alias;      -- 정책·인덱스가 함께 삭제된다
