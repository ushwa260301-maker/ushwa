/**
 * db-schema.mjs — 저장소의 Supabase SQL 을 실제 PostgreSQL 에 적용해 검증한다.
 *
 *   node species-catalog/tests/db-schema.mjs
 *
 * 왜 필요한가
 *   SQL 은 지금까지 Supabase SQL Editor 에 붙여 넣어 봐야 맞는지 알 수 있었다.
 *   운영 DB 를 건드리기 전에 **같은 SQL 을 일회용 로컬 PostgreSQL 에서 먼저
 *   돌려** 문법 · 적용 순서 · 참조 오류를 잡는다. Supabase 접근이 필요 없다.
 *
 * 하는 일
 *   1. 일회용 클러스터를 만든다 (임시 디렉터리 · 끝나면 삭제).
 *   2. Supabase 최소 스텁(tests/db/supabase-stubs.sql)을 적용한다.
 *   3. 기본 스키마 → 날짜 마이그레이션 순서로 적용한다. 하나라도 실패하면 실패.
 *   4. 유지보수 스크립트(운영 데이터 정리 등)를 적용된 스키마 위에서 실행해,
 *      현재 스키마와 어긋나지 않는지 확인한다 (빈 DB 라 데이터 영향 없음).
 *   5. SQL 파일이 만든다고 적은 테이블 · 트리거가 실제로 생겼는지,
 *      public 테이블에 RLS 가 켜졌는지 확인한다.
 *   6. supabase/ 의 모든 .sql 이 아래 목록 중 하나로 분류돼 있는지 확인한다.
 *      새 SQL 파일이 분류 없이 추가되면 실패한다 — 적용 순서를 정하게 한다.
 *
 * 하지 않는 것
 *   Supabase(운영 DB)에 접속하지 않는다. 데이터를 옮기지 않는다.
 *
 * 환경
 *   PostgreSQL 서버 바이너리(initdb · pg_ctl · psql)가 없으면 SKIP 하고
 *   exit 0 — 어느 환경에서 실행해도 안전하다. 위치는 PATH ·
 *   /usr/lib/postgresql/<v>/bin · Homebrew 경로 · PG_BIN 환경변수 순으로 찾는다.
 *   root 로 실행되면(클라우드 컨테이너) `postgres` 사용자로 서버를 띄운다.
 *   PGTEST_DIR 로 임시 디렉터리 위치를, PGTEST_KEEP=1 로 보존을 정할 수 있다.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(HERE, "../supabase");
const STUBS = path.join(HERE, "db/supabase-stubs.sql");

// ---------------------------------------------------------------------------
// 분류 — supabase/ 의 모든 .sql 은 여기 셋 중 하나에 있어야 한다.
// ---------------------------------------------------------------------------

/** 기본 스키마. 새 DB 에 이 순서로 적용한다. */
const BASE = ["schema.sql", "policies.sql", "triggers.sql", "rpc.sql", "storage.sql"];

/** 스키마 마이그레이션. 기본 스키마 뒤에 이 순서로 적용한다. */
const MIGRATIONS = [
  "2026-07-27_supplier_upsert_fix.sql",
  "2026-07-28_protect_user_role.sql",
  "2026-07-30_save_invoice_species_order_fix.sql",
  "2026-07-31_add_uploaded_by_rls.sql",
  "2026-07-31_supplier_alias.sql"
];

/**
 * 유지보수 스크립트 — 스키마를 만들지 않고 운영 데이터를 조회·정리한다.
 * 스키마 적용 뒤, 빈 DB 에서 이 순서로 실행해 현재 스키마와 맞는지만 본다.
 */
const MAINTENANCE = [
  "2026-09-28_remove_ocr_pii_1_preview.sql",
  "2026-09-28_remove_ocr_pii_2_cleanup.sql",
  "2026-09-28_remove_ocr_pii_3_verify.sql"
];

// ---------------------------------------------------------------------------

let pass = 0, fail = 0;
const ok  = msg => { pass++; console.log(`  ✓ ${msg}`); };
const bad = (msg, detail = "") => { fail++; console.log(`  ✗ ${msg}${detail ? `\n      ${detail}` : ""}`); };

function skip(reason) {
  console.log(`db-schema: SKIP — ${reason}`);
  process.exit(0);
}

/** PostgreSQL 서버 바이너리 디렉터리를 찾는다. */
function findPgBin() {
  const has = dir => ["initdb", "pg_ctl", "psql"].every(b => fs.existsSync(path.join(dir, b)));
  const candidates = [];
  if (process.env.PG_BIN) candidates.push(process.env.PG_BIN);
  for (const d of (process.env.PATH || "").split(path.delimiter)) if (d) candidates.push(d);
  const versioned = root => {
    try {
      return fs.readdirSync(root)
        .map(v => ({ v, n: parseInt(v.replace(/\D+/g, ""), 10) || 0 }))
        .sort((a, b) => b.n - a.n)
        .map(({ v }) => path.join(root, v, "bin"));
    } catch { return []; }
  };
  candidates.push(...versioned("/usr/lib/postgresql"));
  for (const brew of ["/opt/homebrew/opt", "/usr/local/opt"]) {
    try {
      for (const v of fs.readdirSync(brew).filter(x => /^postgresql(@\d+)?$/.test(x)).sort().reverse()) {
        candidates.push(path.join(brew, v, "bin"));
      }
    } catch { /* 없음 */ }
  }
  return candidates.find(has) || null;
}

/** root 면 postgres 사용자로 실행한다 (initdb 는 root 실행을 거부한다). */
function runner() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return { wrap: [], user: null };
  const r = spawnSync("id", ["-u", "postgres"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const uid = parseInt(r.stdout, 10);
  const gid = parseInt(spawnSync("id", ["-g", "postgres"], { encoding: "utf8" }).stdout, 10);
  return { wrap: ["runuser", "-u", "postgres", "--"], user: { uid, gid } };
}

const binDir = findPgBin();
if (!binDir) skip("PostgreSQL 서버 바이너리(initdb · pg_ctl · psql)를 찾지 못했다");
const run = runner();
if (!run) skip("root 로 실행 중인데 postgres 사용자가 없다");

const exec = (bin, args, opts = {}) => {
  const cmd = run.wrap.length ? run.wrap[0] : path.join(binDir, bin);
  const full = run.wrap.length ? [...run.wrap.slice(1), path.join(binDir, bin), ...args] : args;
  return spawnSync(cmd, full, { encoding: "utf8", ...opts });
};

// ---------------------------------------------------------------------------
// 일회용 클러스터
// ---------------------------------------------------------------------------

const base = process.env.PGTEST_DIR
  ? (fs.mkdirSync(process.env.PGTEST_DIR, { recursive: true }), fs.mkdtempSync(path.join(process.env.PGTEST_DIR, "pg-")))
  : fs.mkdtempSync(path.join(os.tmpdir(), "ushwa-pgtest-"));
const dataDir = path.join(base, "data");
if (run.user) fs.chownSync(base, run.user.uid, run.user.gid);

let started = false;
function cleanup() {
  if (started) exec("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"]);
  started = false;
  if (process.env.PGTEST_KEEP !== "1") fs.rmSync(base, { recursive: true, force: true });
}
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { cleanup(); process.exit(130); });

let r = exec("initdb", ["-D", dataDir, "-E", "UTF8", "--no-locale", "-A", "trust", "-U", "postgres"]);
if (r.status !== 0) { console.log(r.stderr || r.stdout); skip("initdb 실패 — 이 환경에서는 로컬 클러스터를 만들 수 없다"); }
r = exec("pg_ctl", ["-D", dataDir, "-w", "-l", path.join(base, "log"),
                    "-o", `-k ${base} -c listen_addresses='' -c fsync=off -c full_page_writes=off`, "start"]);
if (r.status !== 0) {
  let log = ""; try { log = fs.readFileSync(path.join(base, "log"), "utf8").slice(-800); } catch { /* 없음 */ }
  console.log(r.stderr || r.stdout, log);
  skip("pg_ctl start 실패 — 이 환경에서는 로컬 서버를 띄울 수 없다");
}
started = true;

/** SQL 을 stdin 으로 넣는다 — postgres 사용자가 저장소 파일을 읽을 권한이 없어도 된다. */
function psql(sql, { db = "t", stop = true } = {}) {
  return exec("psql", ["-h", base, "-U", "postgres", "-d", db, "-X", "-q", "-A", "-t",
                       "-v", `ON_ERROR_STOP=${stop ? 1 : 0}`, "-f", "-"], { input: sql });
}
const firstError = res => (res.stderr || "").split("\n").find(l => /ERROR/.test(l))?.replace(/^psql:<stdin>:/, "줄 ") || res.stderr.trim();

psql("create database t", { db: "postgres" });

// ---------------------------------------------------------------------------
const pgVersion = (exec("psql", ["--version"]).stdout.match(/\d+(?:\.\d+)?/) || ["?"])[0];
console.log(`\ndb-schema — PostgreSQL ${pgVersion} · 일회용 클러스터 (${binDir})\n`);

console.log("[분류] supabase/*.sql 이 모두 분류돼 있는가");
const onDisk = fs.readdirSync(SQL_DIR).filter(f => f.endsWith(".sql")).sort();
const classified = new Set([...BASE, ...MIGRATIONS, ...MAINTENANCE]);
const unclassified = onDisk.filter(f => !classified.has(f));
const missing = [...classified].filter(f => !onDisk.includes(f));
unclassified.length ? bad("분류되지 않은 SQL — BASE · MIGRATIONS · MAINTENANCE 중 하나에 추가", unclassified.join(", "))
                    : ok(`${onDisk.length}개 파일 전부 분류됨`);
missing.length ? bad("목록에 있으나 파일이 없음", missing.join(", ")) : ok("목록의 파일이 모두 존재");

console.log("\n[적용] 스텁 → 기본 스키마 → 마이그레이션");
const applied = [];
let res = psql(fs.readFileSync(STUBS, "utf8"));
res.status === 0 ? ok("supabase-stubs.sql") : bad("supabase-stubs.sql", firstError(res));
let schemaOk = res.status === 0;
for (const f of [...BASE, ...MIGRATIONS]) {
  if (!schemaOk) { bad(`${f} — 앞 단계 실패로 건너뜀`); continue; }
  const sql = fs.readFileSync(path.join(SQL_DIR, f), "utf8");
  res = psql(sql);
  if (res.status === 0) { ok(f); applied.push(sql); }
  else { bad(f, firstError(res)); schemaOk = false; }
}

if (schemaOk) {
  console.log("\n[구조] SQL 이 만든다고 적은 객체가 실제로 생겼는가");
  const src = applied.join("\n");
  const wantTables = [...new Set([...src.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)].map(m => m[1]))].sort();
  const wantTriggers = [...new Set([...src.matchAll(/create\s+trigger\s+(\w+)/gi)].map(m => m[1]))].sort();
  const q = sql => psql(sql).stdout.trim().split("\n").filter(Boolean);

  const haveTables = new Set(q("select tablename from pg_tables where schemaname = 'public'"));
  const noTable = wantTables.filter(t => !haveTables.has(t));
  noTable.length ? bad("테이블 누락", noTable.join(", ")) : ok(`public 테이블 ${wantTables.length}개 생성 (${wantTables.join(" · ")})`);

  const haveTriggers = new Set(q("select tgname from pg_trigger where not tgisinternal"));
  const noTrigger = wantTriggers.filter(t => !haveTriggers.has(t));
  noTrigger.length ? bad("트리거 누락", noTrigger.join(", ")) : ok(`트리거 ${wantTriggers.length}개 생성`);

  const noRls = q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`);
  noRls.length ? bad("RLS 가 꺼진 public 테이블", noRls.join(", ")) : ok("public 테이블 전부 RLS 활성");

  console.log("\n[유지보수 스크립트] 현재 스키마 위에서 실행되는가 (빈 DB)");
  for (const f of MAINTENANCE) {
    res = psql(fs.readFileSync(path.join(SQL_DIR, f), "utf8"));
    res.status === 0 ? ok(f) : bad(f, firstError(res));
  }
} else {
  bad("스키마 적용 실패로 구조 · 유지보수 검사를 건너뜀");
}

console.log(`\n${"=".repeat(56)}\n통과 ${pass} · 실패 ${fail}\n${"=".repeat(56)}`);
cleanup();
process.exit(fail ? 1 : 0);
