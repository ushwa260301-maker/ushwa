/**
 * parser.ts 의 Deno 쪽 테스트.
 *
 *   deno test supabase/functions/plant-search-kna/parser.test.ts
 *
 * ⚠ **이 세션에서는 실행하지 않았다.** Deno 가 없다. 여기 있는 이유는 Edge
 *   Function 을 손보는 사람이 Deno 툴체인만으로도 파서를 확인할 수 있게 하기
 *   위해서다.
 *
 * 전체 회귀는 Node 쪽이 맡는다 — `species-catalog/tests/plant-search-kna.mjs`
 * 가 같은 parser.ts 를 불러 80여 건을 검사하고, index.ts 의 fetch 경계와
 * Provider 와의 맞물림까지 본다. 그래서 이 파일은 **파서 핵심만** 둔다.
 * 두 곳에 같은 검사를 늘려 두면 한쪽만 고쳐지고 갈라진다.
 */

import { assertEquals } from "jsr:@std/assert@1";
import {
  PROVIDER_NAME, FUNCTION_NAME,
  parseXml, parsePayload, toRecords, resolveVersion, buildResponse,
  resultCodeOf, decodeEntities
} from "./parser.ts";

const NOW = new Date("2026-09-15T07:30:00.000Z");

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE</resultMsg></header>
  <body>
    <items>
      <item><plantId>K1</plantId><floweringPeriod>6~8월</floweringPeriod></item>
      <item><plantId>K2</plantId><floweringPeriod>4월경</floweringPeriod></item>
    </items>
  </body>
</response>`;

Deno.test("이름 상수는 출처에서 파생된다", () => {
  assertEquals(PROVIDER_NAME, "kna");
  assertEquals(FUNCTION_NAME, "plant-search-kna");
});

Deno.test("XML 반복 엘리먼트는 배열이 된다", () => {
  const parsed = parseXml(XML) as Record<string, any>;
  assertEquals(resultCodeOf(parsed), "00");
  assertEquals(parsed.response.body.items.item.length, 2);
  // 값은 원문 그대로 — 변환은 정규화 계층의 일이다.
  assertEquals(parsed.response.body.items.item[0].floweringPeriod, "6~8월");
});

Deno.test("CDATA 는 태그째 살린다", () => {
  const parsed = parseXml("<a><d><![CDATA[산지 <b>계곡</b>]]></d></a>") as Record<string, any>;
  assertEquals(parsed.a.d, "산지 <b>계곡</b>");
});

Deno.test("엔티티를 되돌린다", () => {
  assertEquals(decodeEntities("가&amp;나 &lt;b&gt; &#48;"), "가&나 <b> 0");
  assertEquals(decodeEntities("&nope;"), "&nope;");
});

Deno.test("XML 과 JSON 이 같은 records 를 낸다", () => {
  assertEquals(toRecords(parsePayload(XML, "application/xml")).length, 2);
  assertEquals(
    toRecords(parsePayload(JSON.stringify({ items: [{ plantId: "K1" }] }), "application/json")).length,
    1
  );
});

Deno.test("해석할 수 없는 본문은 빈 객체 — 던지지 않는다", () => {
  assertEquals(parsePayload("<<broken"), {});
  assertEquals(parsePayload(""), {});
});

Deno.test("판은 응답이 말하면 그대로, 아니면 실행일", () => {
  assertEquals(resolveVersion({ version: "2026-09" }, NOW), "2026-09");
  assertEquals(resolveVersion({}, NOW), "2026-09-15");
});

Deno.test("계약 모양으로 조립한다", () => {
  const out = buildResponse(parsePayload(XML, "application/xml"), NOW);
  assertEquals(Object.keys(out).sort(), ["latestVersions", "provider", "records", "version"]);
  assertEquals(out.provider, "kna");
  assertEquals(out.latestVersions, { kna: "2026-09-15" });
  assertEquals(out.records.length, 2);
});
