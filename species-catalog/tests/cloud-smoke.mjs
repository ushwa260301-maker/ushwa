#!/usr/bin/env node
/**
 * Supabase 연결 스모크 (로그인 前 단계 · 사용자 로컬 실행용).
 *
 *   node species-catalog/tests/cloud-smoke.mjs
 *
 * SDK 없이 REST 만 사용한다. 로그인 없이 검증 가능한 것만 확인:
 *   1. auth/v1/health   — 프로젝트 도달성
 *   2. auth/v1/settings — Google Provider 활성 여부
 *   3. rest/v1/species  — schema.sql 적용 여부 + RLS 익명 차단
 *      (RLS 정상: HTTP 200 + 빈 배열 — 행이 있어도 익명에겐 0건)
 *   4. rpc/save_invoice_tx — 익명 호출 거부 (grant 가 authenticated 전용)
 *
 * 참고: Claude 실행 환경은 supabase.co 아웃바운드가 차단되어 있어
 * 이 스크립트는 사용자 PC 에서 실행해야 한다.
 */

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../js/supabaseConfig.js";

const H = { apikey: SUPABASE_PUBLISHABLE_KEY };
const results = [];
const push = (step, ok, detail) => {
  results.push({ step, ok: ok ? "✓" : "✗", detail });
  console.log(`${ok ? "✓" : "✗"} ${step} — ${detail}`);
};

// 1. reachability
try {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: H });
  push("1 reach", r.ok, `auth/v1/health HTTP ${r.status}`);
} catch (e) {
  push("1 reach", false, `네트워크 실패: ${e.message}`);
  console.table(results);
  process.exit(1);
}

// 2. Google provider
try {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: H });
  const j = await r.json();
  const on = !!j?.external?.google;
  push("2 provider", on, on ? "Google Provider 활성" : "비활성 — Supabase Auth 설정 필요");
} catch (e) {
  push("2 provider", false, e.message);
}

// 3. schema + RLS (익명)
try {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/species?select=id&limit=1`, { headers: H });
  const body = await r.text();
  if (r.status === 404) {
    push("3 schema", false, "species 테이블 없음 — supabase/*.sql 미적용");
  } else if (r.ok) {
    const rows = JSON.parse(body);
    push("3 schema", true, `테이블 존재 · 익명 조회 ${rows.length}건 (RLS ${rows.length === 0 ? "차단 정상" : "⚠ 익명 노출!"})`);
  } else {
    push("3 schema", r.status === 401 || r.status === 403,
      `HTTP ${r.status} (401/403 = RLS 차단 정상): ${body.slice(0, 120)}`);
  }
} catch (e) {
  push("3 schema", false, e.message);
}

// 4. RPC 익명 거부
try {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_invoice_tx`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ p_invoice: {}, p_items: [], p_new_species: [] })
  });
  const body = await r.text();
  if (r.status === 404) {
    push("4 rpc", false, "save_invoice_tx 없음 — rpc.sql 미적용");
  } else {
    const denied = r.status === 401 || r.status === 403 || /permission denied/i.test(body);
    push("4 rpc", denied,
      denied ? `익명 거부 정상 (HTTP ${r.status})` : `⚠ 익명 호출이 거부되지 않음 (HTTP ${r.status})`);
  }
} catch (e) {
  push("4 rpc", false, e.message);
}

console.table(results);
const fails = results.filter(r => r.ok === "✗").length;
console.log(fails === 0
  ? "\n로그인 前 스모크 전체 통과 — 브라우저에서 ?cloudtest=1 로 로그인 후 7단계 검증을 진행하세요."
  : `\n${fails}건 실패 — 위 detail 로 원인 확인.`);
process.exit(fails === 0 ? 0 : 1);
