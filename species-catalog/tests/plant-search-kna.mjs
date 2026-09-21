#!/usr/bin/env node
/**
 * plant-search-kna Edge Function 회귀 테스트 (T11-4).
 *
 *   node --experimental-strip-types species-catalog/tests/plant-search-kna.mjs
 *
 * ⚠ 다른 스위트와 달리 `--experimental-strip-types` 가 필요하다. Edge Function 이
 *   TypeScript(Deno)라서다 — 플래그를 붙이면 Node 가 타입만 벗겨 그대로 불러올 수
 *   있고, 그래야 **검사하는 코드와 배포되는 코드가 같은 파일**이 된다.
 *   JS 사본을 따로 두면 둘이 갈라진다.
 *
 * 네트워크를 쓰지 않는다. `fetchImpl` 을 주입한다.
 *
 * ⚠ **실호출 검증이 아니다.** 실제 국립수목원 API 도 Supabase 도 이 세션에서
 *   막혀 있다. 여기서 보는 것은 계약과 경계 처리이지, 실제 응답과 맞는지가
 *   아니다 — 그 대조는 T11-4.1 이다.
 *
 * 계약
 *   ① 응답은 { provider, version, latestVersions, records }
 *   ② version 은 응답이 말하면 그대로, 아니면 실행일(UTC YYYY-MM-DD)
 *   ③ XML 로 오든 JSON 으로 오든 records 는 같은 모양이다
 *   ④ 서비스 키는 어떤 출력에도 나오지 않는다
 *   ⑤ 설정이 없으면 호출하지 않는다
 */

const P = await import("../../supabase/functions/plant-search-kna/parser.ts");
const F = await import("../../supabase/functions/plant-search-kna/index.ts");
const kna = await import("../services/plantProviders/knaProvider.js");

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

const NOW = new Date("2026-09-15T07:30:00.000Z");
const KEY = "SECRET-SERVICE-KEY-0001";
const CFG = {
  endpoint: "https://example.invalid/kna/search",
  serviceKey: KEY,
  queryParam: "plantName",
  now: NOW
};

/** 최소 Response 흉내 — 실제 fetch 응답에서 쓰는 것만 갖춘다. */
const mockRes = (body, { status = 200, contentType = "application/json" } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: k => (String(k).toLowerCase() === "content-type" ? contentType : null) },
  async text() { return body; }
});

const JSON_BODY = JSON.stringify({
  resultCode: "00",
  resultMsg: "NORMAL SERVICE",
  items: [
    { plantScnmId: "31234", plantSpecsScnm: "Hydrangea serrata (Thunb.) Ser.",
      plantGnrlNm: "산수국", stpltScnmRltnCdNm: "정명" }
  ]
});

const XML_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE</resultMsg></header>
  <body>
    <items>
      <item>
        <plantScnmId>31234</plantScnmId>
        <plantSpecsScnm>Hydrangea serrata (Thunb.) Ser.</plantSpecsScnm>
        <stpltScnmRltnCdNm>정명</stpltScnmRltnCdNm>
      </item>
      <item>
        <plantScnmId>42001</plantScnmId>
        <plantSpecsScnm>Spiraea prunifolia Siebold &amp; Zucc.</plantSpecsScnm>
        <stpltScnmRltnCdNm>정명</stpltScnmRltnCdNm>
      </item>
    </items>
  </body>
</response>`;

// ============================================================
section("1. 이름 상수 — 문자열이 갈라지지 않는다");
// ============================================================
check("출처 코드", P.PROVIDER_NAME, "kna");
check("함수 이름은 출처에서 파생", P.FUNCTION_NAME, "plant-search-kna");
// 이 둘이 어긋나면 Provider 가 없는 함수를 부른다 — 배포 후에야 드러난다.
check("Provider 와 함수 이름이 같다", kna.FUNCTION_NAME, P.FUNCTION_NAME);
check("Provider 와 출처 코드가 같다", kna.SOURCE, P.PROVIDER_NAME);
check("index 도 같은 상수를 쓴다", [F.PROVIDER_NAME, F.FUNCTION_NAME],
      [P.PROVIDER_NAME, P.FUNCTION_NAME]);

// ============================================================
section("2. XML → 객체");
// ============================================================
const parsed = P.parseXml(XML_BODY);
check("루트가 살아 있다", Object.keys(parsed), ["response"]);
check("헤더 코드", P.resultCodeOf(parsed), "00");
check("헤더 메시지", P.resultMessageOf(parsed), "NORMAL SERVICE");
check("반복 엘리먼트는 배열", Array.isArray(parsed.response.body.items.item), true);
check("행 2건", parsed.response.body.items.item.length, 2);
check("값은 원문 그대로", parsed.response.body.items.item[0].plantSpecsScnm,
      "Hydrangea serrata (Thunb.) Ser.");
check("엔티티가 섞인 학명도 복원", parsed.response.body.items.item[1].plantSpecsScnm,
      "Spiraea prunifolia Siebold & Zucc.");

check("엔티티 복원", P.decodeEntities("가&amp;나 &lt;b&gt; &#48; &#x31;"), "가&나 <b> 0 1");
check("모르는 엔티티는 그대로", P.decodeEntities("&nope;"), "&nope;");
check("빈 태그는 빈 값", P.parseXml("<a><b/></a>"), { a: { b: "" } });
check("속성은 무시한다", P.parseXml('<a><b id="1">v</b></a>'), { a: { b: "v" } });
check("주석·선언은 버린다", P.parseXml("<?xml v?><!--c--><a>v</a>"), { a: "v" });
check("닫히지 않아도 값은 살린다", P.parseXml("<a><b>v"), { a: { b: "v" } });
check("짝 없는 닫는 태그는 무시", P.parseXml("<a>v</zz></a>"), { a: "v" });
check("빈 입력", P.parseXml(""), {});

// ============================================================
section("3. records 추출 — 형식이 달라도 같은 모양");
// ============================================================
check("JSON items", P.toRecords(JSON.parse(JSON_BODY)).length, 1);
check("XML items.item", P.toRecords(parsed).length, 2);
check("행이 하나여도 배열",
      P.toRecords({ response: { body: { items: { item: { plantScnmId: "K1" } } } } }).length, 1);
check("계약 모양(records)도 받는다", P.toRecords({ records: [{ plantScnmId: "K1" }] }).length, 1);
check("행이 없으면 빈 배열", P.toRecords({ resultCode: "00" }), []);
check("null 안전", P.toRecords(null), []);

// ============================================================
section("4. version — 응답이 말하면 그대로, 아니면 실행일");
// ============================================================
check("응답이 판을 말하면 그대로", P.resolveVersion({ version: "2026-09" }, NOW), "2026-09");
check("XML 안쪽 판도 읽는다",
      P.resolveVersion({ response: { body: { version: "2026-08" } } }, NOW), "2026-08");
check("없으면 실행일 UTC", P.resolveVersion({}, NOW), "2026-09-15");
check("빈 문자열도 없는 것", P.resolveVersion({ version: "   " }, NOW), "2026-09-15");

const built = P.buildResponse(JSON.parse(JSON_BODY), NOW);
check("계약 키", Object.keys(built).sort(),
      ["latestVersions", "provider", "records", "version"]);
check("provider", built.provider, "kna");
check("latestVersions 는 자기 출처만", built.latestVersions, { kna: "2026-09-15" });
check("판이 두 자리에 같은 값", built.version, built.latestVersions.kna);

// ============================================================
section("5. searchPlants — Mock fetch");
// ============================================================
let seenUrl = null;
const okFetch = async url => { seenUrl = url; return mockRes(JSON_BODY); };

const r1 = await F.searchPlants("산수국", { ...CFG, fetchImpl: okFetch });
check("성공", r1.ok, true);
check("행 1건", r1.body.records.length, 1);
check("판은 실행일", r1.body.version, "2026-09-15");
check("조회어를 넘긴다", new URL(seenUrl).searchParams.get("plantName"), "산수국");
check("키를 넘긴다", new URL(seenUrl).searchParams.get("serviceKey"), KEY);
check("건수 기본값", new URL(seenUrl).searchParams.get("numOfRows"), "10");

const r2 = await F.searchPlants("산수국", {
  ...CFG, rows: 3, keyParam: "authKey", rowsParam: "count",
  fetchImpl: async url => { seenUrl = url; return mockRes(JSON_BODY); }
});
check("파라미터 이름을 바꿀 수 있다",
      [new URL(seenUrl).searchParams.get("authKey"),
       new URL(seenUrl).searchParams.get("count")], [KEY, "3"]);
check("바꿔도 결과는 같다", r2.body.records.length, 1);

const xmlRes = await F.searchPlants("산수국", {
  ...CFG,
  fetchImpl: async () => mockRes(XML_BODY, { contentType: "application/xml" })
});
check("XML 응답도 같은 계약", Object.keys(xmlRes.body).sort(),
      ["latestVersions", "provider", "records", "version"]);
check("XML 행 2건", xmlRes.body.records.length, 2);
check("Content-Type 이 없어도 XML 을 알아본다",
      (await F.searchPlants("산수국", {
        ...CFG, fetchImpl: async () => mockRes(XML_BODY, { contentType: "" })
      })).body.records.length, 2);

check("빈 결과도 성공이다 — 실패가 아니다",
      (await F.searchPlants("산수국", {
        ...CFG, fetchImpl: async () => mockRes(JSON.stringify({ resultCode: "00", items: [] }))
      })).body.records, []);
check("빈 검색어는 부르지 않는다",
      (await F.searchPlants("   ", {
        ...CFG, fetchImpl: async () => { throw new Error("불렸다"); }
      })).ok, true);

// ============================================================
section("6. 실패 경로 — 던지지 않는다");
// ============================================================
const httpErr = await F.searchPlants("산수국", {
  ...CFG, fetchImpl: async () => mockRes("", { status: 500 })
});
check("HTTP 오류", [httpErr.ok, httpErr.status], [false, 500]);

const thrown = await F.searchPlants("산수국", {
  ...CFG, fetchImpl: async () => { throw new Error("network down"); }
});
check("fetch 가 던져도 결과로 돌려준다", [thrown.ok, thrown.status], [false, 502]);
check("원인을 전한다", thrown.error.includes("network down"), true);

const apiErr = await F.searchPlants("산수국", {
  ...CFG,
  fetchImpl: async () => mockRes(JSON.stringify({
    resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED"
  }))
});
check("출처가 오류 코드를 주면 실패", apiErr.ok, false);
check("코드와 메시지를 전한다",
      apiErr.error.includes("30") && apiErr.error.includes("NOT REGISTERED"), true);

check("코드를 주지 않는 응답은 실패가 아니다",
      (await F.searchPlants("산수국", {
        ...CFG, fetchImpl: async () => mockRes(JSON.stringify({ items: [{ plantScnmId: "K1" }] }))
      })).ok, true);

check("깨진 본문도 던지지 않는다",
      (await F.searchPlants("산수국", {
        ...CFG, fetchImpl: async () => mockRes("<<not xml or json")
      })).ok, true);

// ============================================================
section("7. 설정이 없으면 부르지 않는다");
// ============================================================
let called = 0;
const countFetch = async () => { called++; return mockRes(JSON_BODY); };

const noCfg = await F.searchPlants("산수국", {
  endpoint: "", serviceKey: "", fetchImpl: countFetch, now: NOW
});
check("notConfigured", noCfg.notConfigured, true);
check("외부를 부르지 않는다", called, 0);
check("무엇이 없는지 말해 준다",
      ["KNA_API_ENDPOINT", "KNA_SERVICE_KEY"].every(n => noCfg.error.includes(n)), true);
// 파라미터 이름은 계약값이 있으므로 설정 누락이 아니다.
check("파라미터 이름은 누락 목록에 없다", noCfg.error.includes("KNA_PARAM"), false);

// ============================================================
section("7-1. API_PROFILE — 파라미터 이름은 한 곳에서만 정한다");
// ============================================================
check("계약값", { ...F.API_PROFILE },
      { key: "serviceKey", query: "reqPlantGnrlNm", rows: "numOfRows", format: "_type" });
check("조회 경로", F.SEARCH_PATH, "scnmSearch");

// 기준 URL 에 오퍼레이션 경로를 붙인다. 둘 중 어느 쪽으로 설정하든 같은 곳.
check("경로를 붙인다",
      F.endpointFor("https://x/KpniService"), "https://x/KpniService/scnmSearch");
check("끝 슬래시도 처리",
      F.endpointFor("https://x/KpniService/"), "https://x/KpniService/scnmSearch");
check("이미 붙어 있으면 두 번 붙이지 않는다",
      F.endpointFor("https://x/KpniService/scnmSearch"), "https://x/KpniService/scnmSearch");
check("실제 호출도 경로를 탄다", new URL(seenUrl).pathname.endsWith("/scnmSearch"), true);

// 환경변수를 넣지 않아도 부를 수 있어야 한다 — 그게 기본값을 두는 이유다.
let bare = null;
await F.searchPlants("산수국", {
  endpoint: CFG.endpoint, serviceKey: KEY, now: NOW,
  fetchImpl: async url => { bare = new URL(url); return mockRes(JSON_BODY); }
});
check("조회 파라미터 기본값", bare.searchParams.get(F.API_PROFILE.query), "산수국");
check("키 파라미터 기본값", bare.searchParams.get(F.API_PROFILE.key), KEY);
check("건수 파라미터 기본값", bare.searchParams.get(F.API_PROFILE.rows), "10");
check("형식은 JSON 을 요청한다",
      bare.searchParams.get(F.API_PROFILE.format), F.FORMAT_JSON);

// 계약이 바뀌면 배포를 다시 하지 않고 환경변수로 넘긴다.
let overridden = null;
await F.searchPlants("산수국", {
  endpoint: CFG.endpoint, serviceKey: KEY, now: NOW, queryParam: "plantName",
  fetchImpl: async url => { overridden = new URL(url); return mockRes(JSON_BODY); }
});
check("기본값을 덮을 수 있다", overridden.searchParams.get("plantName"), "산수국");
check("덮으면 기본 이름은 쓰이지 않는다",
      overridden.searchParams.get(F.API_PROFILE.query), null);
check("빈 문자열은 지정하지 않은 것 — 기본값으로 돌아간다",
      (await (async () => {
        let u = null;
        await F.searchPlants("산수국", {
          endpoint: CFG.endpoint, serviceKey: KEY, now: NOW, queryParam: "",
          fetchImpl: async url => { u = new URL(url); return mockRes(JSON_BODY); }
        });
        return u.searchParams.get(F.API_PROFILE.query);
      })()), "산수국");

/**
 * 파라미터 이름이 코드에 흩어지지 않았는지 본다. API_PROFILE 밖에서 같은
 * 문자열을 쓰면 표를 고쳐도 한쪽만 바뀐다 — 그게 드리프트의 시작이다.
 */
const indexSrc = await (await import("node:fs/promises")).readFile(
  new URL("../../supabase/functions/plant-search-kna/index.ts", import.meta.url), "utf8");
const indexCode = indexSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
for (const [field, literal] of Object.entries(F.API_PROFILE)) {
  const hits = indexCode.split(`"${literal}"`).length - 1;
  check(`${field} 리터럴은 API_PROFILE 에만`, hits, 1);
}

// ============================================================
section("8. 서비스 키는 새어 나가지 않는다");
// ============================================================
check("redact — 평문", F.redact(`https://x?serviceKey=${KEY}&q=1`, KEY),
      "https://x?serviceKey=***&q=1");
check("redact — URL 인코딩된 키",
      F.redact(`https://x?k=${encodeURIComponent("a b+c")}`, "a b+c"), "https://x?k=***");
check("redact — Error 객체", F.redact(new Error(`fail ${KEY}`), KEY), "fail ***");
check("redact — 키가 없으면 그대로", F.redact("plain", ""), "plain");

// fetch 가 URL 을 품은 오류를 던지는 상황 — 실제로 가장 흔한 누출 경로다.
const leaky = await F.searchPlants("산수국", {
  ...CFG,
  fetchImpl: async url => { throw new Error(`connect ECONNREFUSED ${url}`); }
});
check("오류 메시지에 키가 없다", leaky.error.includes(KEY), false);
check("가려진 자리가 남는다", leaky.error.includes("***"), true);

const allText = JSON.stringify(await F.searchPlants("산수국", { ...CFG, fetchImpl: okFetch }));
check("성공 응답에도 키가 없다", allText.includes(KEY), false);

// ============================================================
section("8-1. 0건이어도 계약은 그대로 — 진단은 로그로만");
// ============================================================
/**
 * 200 에 0건이 오는 가장 흔한 원인은 "검색 결과 없음"이 아니라 파라미터 이름이
 * 틀린 것이다. 그래도 **응답 스키마는 바뀌지 않는다** — API 계약은 디버깅
 * 때문에 바뀌지 않는다. 진단은 Edge Function 로그에만 남긴다.
 */
const CONTRACT_KEYS = ["latestVersions", "provider", "records", "version"];
const logs = [];
const emptyRes = await F.searchPlants("없는식물", {
  ...CFG, log: m => logs.push(m),
  fetchImpl: async () => mockRes(JSON.stringify({ resultCode: "00", items: [] }))
});
check("0건도 성공", emptyRes.ok, true);
check("0건도 같은 계약 키", Object.keys(emptyRes.body).sort(), CONTRACT_KEYS);
check("진단 필드를 붙이지 않는다", "diagnostics" in emptyRes.body, false);
check("행이 있을 때와 키가 같다",
      Object.keys(emptyRes.body).sort(),
      Object.keys((await F.searchPlants("산수국", { ...CFG, fetchImpl: okFetch })).body).sort());

/**
 * 진단 로그 (P1) — 요청이 무엇을 보냈고 응답이 무엇을 돌려줬는지 남긴다.
 * 조회 조건이 먹지 않을 때 "필터가 없는 결과"와 "필터가 무시된 결과"를 응답만
 * 보고는 구분할 수 없어서, 보낸 파라미터를 나란히 찍는다.
 */
const joined = logs.join("\n");
check("보낸 파라미터 목록을 남긴다", joined.includes("params "), true);
check("조회 파라미터 이름과 값을 남긴다", joined.includes("plantName=없는식물"), true);
check("최종 URL 을 남긴다", joined.includes("GET https://"), true);
check("응답 요약을 남긴다", joined.includes("records=0"), true);
check("0건이면 이름을 먼저 의심하라고 남긴다",
      joined.includes("파라미터 이름을 먼저 확인"), true);

// 키는 어떤 줄에도 나오면 안 된다 — 로그는 Supabase 로 나가는 출력이다.
check("로그에 키가 없다", joined.includes(KEY), false);
check("키 자리는 가려져 있다", joined.includes("***"), true);

// Encoding 형태 키(%2B · %2F · %3D 포함)도 가려지는지 본다.
const encLogs = [];
await F.searchPlants("산수국", {
  ...CFG, serviceKey: "AA%2BBB%2FCC%3D", log: m => encLogs.push(m), fetchImpl: okFetch
});
check("인코딩된 키도 가려진다", encLogs.join("\n").includes("AA%2BBB%2FCC%3D"), false);

const quiet = [];
await F.searchPlants("산수국", { ...CFG, log: m => quiet.push(m), fetchImpl: okFetch });
check("행이 있으면 0건 안내는 남기지 않는다",
      quiet.some(l => l.includes("파라미터 이름을 먼저 확인")), false);
check("그래도 요청·응답 진단은 남긴다", quiet.length >= 4, true);

// ============================================================
section("9. handleRequest — HTTP 경계");
// ============================================================
const post = (body, opts = { ...CFG, fetchImpl: okFetch }) =>
  F.handleRequest(new Request("https://fn.local/", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }), opts);

const okRes = await post({ query: "산수국" });
check("200", okRes.status, 200);
check("CORS 열림", okRes.headers.get("access-control-allow-origin"), "*");
const okJson = await okRes.json();
check("계약 키", Object.keys(okJson).sort(),
      ["latestVersions", "provider", "records", "version"]);

const pre = await F.handleRequest(new Request("https://fn.local/", { method: "OPTIONS" }));
check("preflight 204", pre.status, 204);
check("preflight 에도 CORS", pre.headers.get("access-control-allow-methods"), "POST, OPTIONS");

check("GET 은 405",
      (await F.handleRequest(new Request("https://fn.local/"), CFG)).status, 405);
check("본문이 JSON 이 아니면 400",
      (await F.handleRequest(new Request("https://fn.local/", {
        method: "POST", body: "not json"
      }), CFG)).status, 400);

const errRes = await post({ query: "산수국" }, {
  ...CFG, fetchImpl: async url => { throw new Error(`boom ${url}`); }
});
check("실패는 상태코드로", errRes.status, 502);
check("실패 응답에도 키가 없다", (await errRes.text()).includes(KEY), false);

// ============================================================
section("10. Provider 와 맞물린다");
// ============================================================
/**
 * Edge Function 이 만든 records 를 Provider 가 그대로 읽을 수 있어야 한다.
 * 두 계층이 각자 테스트를 통과해도 경계에서 어긋날 수 있어 여기서 이어 본다.
 */
const e2e = await F.searchPlants("산수국", {
  ...CFG, fetchImpl: async () => mockRes(XML_BODY, { contentType: "application/xml" })
});
const mapped = e2e.body.records.map(r => kna.mapRow(r)).filter(Boolean);
check("Provider 가 두 행을 다 읽는다", mapped.length, 2);
check("recordId", mapped.map(m => m.recordId), ["31234", "42001"]);
check("학명이 원문 그대로 넘어온다", mapped[0].scientificName,
      "Hydrangea serrata (Thunb.) Ser.");
check("엔티티 복원도 Provider 까지", mapped[1].scientificName,
      "Spiraea prunifolia Siebold & Zucc.");

const cand = mapped.map(m => kna.toCandidate(m, e2e.body.version));
check("판이 레코드에 실린다", cand.map(c => c.provider.version),
      ["2026-09-15", "2026-09-15"]);
check("출처가 실린다", cand[0].provider.name, "kna");

// ============================================================
section("11. speciesService — Edge Function 까지 이어 붙인다");
// ============================================================
/**
 * PENDING 인 수종만 골라 Edge Function 을 태우고, 받은 값을 기존 metadata 위에
 * 얹는다. 여기서 보는 것은 세 계층(Edge Function → Provider → 병합)이 실제로
 * 맞물리는지다 — 각자 통과해도 경계에서 어긋날 수 있다.
 */
const svc = await import("../services/speciesService.js");
const { resolveSyncStatus } = await import("../services/metadataMigration.js");

/** Edge Function 을 그대로 태우는 invoke — 네트워크만 Mock 이다. */
const invokeVia = fetchImpl => async (_fn, body) => {
  const r = await F.searchPlants(body.query, { ...CFG, fetchImpl });
  if (!r.ok) throw new Error(r.error);
  return r.body;
};

const SPECIES = [
  { id: "sp-001", name: "산수국", metadata: { sync_status: "PENDING" } },
  { id: "sp-002", name: "느티나무", metadata: { sync_status: "USER_EDITED", soil: "사질양토" } }
];

const applied = [];
const okSync = await svc.syncMetadata(SPECIES, {
  invoke: invokeVia(async () => mockRes(JSON_BODY)),
  applyPatch: (id, patch) => applied.push({ id, patch }),
  now: "2026-09-15T07:30:00.000Z"
});
check("PENDING 만 대상", okSync.updated.map(u => u.id), ["sp-001"]);
check("USER_EDITED 는 건드리지 않는다", okSync.skipped.length + okSync.failed.length, 0);
check("patch 는 1건", applied.length, 1);
check("출처가 붙는다", applied[0].patch.metadata.provider.name, "kna");
check("학명이 들어간다", applied[0].patch.metadata.scientific_name,
      "Hydrangea serrata (Thunb.) Ser.");
check("상태가 SYNCED 로", applied[0].patch.metadata.sync_status, "SYNCED");
check("species.latin 도 채운다", applied[0].patch.latin, "Hydrangea serrata (Thunb.) Ser.");
// UPDATE ONLY — 새 수종을 만들지 않는다.
check("새 수종을 만들지 않는다", applied.every(a => a.id === "sp-001"), true);
check("원본을 변형하지 않는다", SPECIES[0].metadata.sync_status, "PENDING");

// resultCode 가 00 이 아니면 반영하지 않는다 — PENDING 으로 남는다.
const failApplied = [];
const errSync = await svc.syncMetadata(SPECIES, {
  invoke: invokeVia(async () => mockRes(JSON.stringify({
    resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED"
  }))),
  applyPatch: (id, patch) => failApplied.push({ id, patch })
});
check("오류면 갱신하지 않는다", errSync.updated.length, 0);
check("실패로 보고한다", errSync.failed.map(f => f.id), ["sp-001"]);
check("patch 를 적용하지 않는다", failApplied.length, 0);
check("PENDING 으로 남는다", resolveSyncStatus(SPECIES[0].metadata), "PENDING");

// 후보가 둘이면 고르지 않는다 — 어느 쪽인지 정할 근거가 없다.
const ambig = await svc.syncMetadata(SPECIES, {
  invoke: invokeVia(async () => mockRes(JSON.stringify({
    resultCode: "00",
    items: [
      { plantScnmId: "A", plantSpecsScnm: "X", stpltScnmRltnCdNm: "정명" },
      { plantScnmId: "B", plantSpecsScnm: "Y", stpltScnmRltnCdNm: "정명" }
    ]
  }))),
  applyPatch: () => { throw new Error("적용하면 안 된다"); }
});
check("후보가 둘이면 건너뛴다", ambig.skipped.map(s => s.reason),
      [svc.SKIP_REASON.AMBIGUOUS]);
check("건너뛰어도 PENDING", resolveSyncStatus(SPECIES[0].metadata), "PENDING");

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
