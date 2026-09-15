/**
 * plant-search-kna — 국립수목원 조회 Edge Function.
 *
 * ## 왜 Edge Function 인가
 *
 * 배포본은 GitHub Pages 정적 파일이다. 서비스 키를 프론트에 두면 누구나 읽는다.
 * 그래서 키는 여기에만 있고, 브라우저는 이 함수만 부른다. CORS 도 함께 풀린다.
 *
 * ## 책임 경계
 *
 *   Edge Function   API 호출 · XML/JSON 통일 · version 생성    ← 이 파일
 *   knaProvider     응답 필드 → PlantRecord 이름 바꾸기
 *   plantNormalizer 값 정규화 (월 배열 · enum · HTML 제거)
 *
 * 값을 해석하지 않는다. 행을 그대로 `records` 에 담아 넘긴다.
 *
 * ## 이 세션에서 검증하지 못한 것
 *
 * 실제 국립수목원 API 도, Supabase 도 이 세션의 네트워크 정책에 막혀 있다.
 * 그래서 **배포·실호출 검증은 하지 않았다.** 파라미터 이름은 공공데이터포털
 * 공통 규격을 기본값으로 두었고(API_PROFILE), 실제 응답으로 확인하는 것은
 * T11-4.1 이다.
 *
 * 배포 시 반드시 넣어야 하는 것은 둘뿐이다 — `KNA_API_ENDPOINT` ·
 * `KNA_SERVICE_KEY`. 없으면 호출하지 않고 `notConfigured` 로 답한다.
 */

import {
  PROVIDER_NAME, FUNCTION_NAME, OK_RESULT_CODE,
  parsePayload, buildResponse, resultCodeOf, resultMessageOf,
  type EdgeResponse
} from "./parser.ts";

export { PROVIDER_NAME, FUNCTION_NAME };

/**
 * 공공데이터포털 파라미터 이름 — **문자열 리터럴은 여기에만 둔다.**
 *
 * 아래 코드에서 `"serviceKey"` 같은 이름을 직접 쓰지 않는다. API 판이 바뀌어
 * 이름이 달라져도 고칠 자리가 한 곳이고, nire·gbif Edge Function 을 더할 때
 * 같은 모양을 복사하면 된다 — 문자열이 파일마다 흩어지면 어느 것이 진짜인지
 * 알 수 없게 된다.
 *
 * 각 값은 환경변수로 덮을 수 있다(KNA_PARAM_*). 여기 있는 것은 명세가 정한
 * 계약값이고, 환경변수는 그 계약이 바뀌었을 때 배포를 다시 하지 않고 넘기는
 * 수단이다.
 *
 * ⚠ 이름이 틀리면 API 는 200 에 0건을 돌려준다 — "결과 없음"과 구분되지 않는다.
 *   T11-4.1 에서 실제 응답으로 확인할 때 이 표를 먼저 본다.
 */
export const API_PROFILE = {
  key:    "serviceKey",
  query:  "searchKeyword",
  rows:   "numOfRows",
  format: "_type"
} as const;

/** 응답 형식. JSON 을 요청해 XML 파서에 의존하지 않는다 — XML 은 대비책이다. */
export const FORMAT_JSON = "json";

/** 브라우저(GitHub Pages)에서 직접 부르므로 CORS 를 연다. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

/** Deno 와 Node 양쪽에서 읽는다 — 테스트가 Node 에서 돌기 때문이다. */
function env(name: string): string {
  const g = globalThis as Record<string, any>;
  try {
    const value = g.Deno?.env?.get?.(name);
    if (value !== undefined && value !== null) return String(value);
  } catch { /* 환경변수 권한이 없으면 아래로 */ }
  return String(g.process?.env?.[name] ?? "");
}

export interface SearchOptions {
  /** 주입용. 테스트는 Mock 을 넣고, 배포본은 전역 fetch 를 쓴다. */
  fetchImpl?: typeof fetch;
  endpoint?: string;
  serviceKey?: string;
  queryParam?: string;
  keyParam?: string;
  rowsParam?: string;
  formatParam?: string;
  rows?: number;
  /** 판 생성 기준 시각. 테스트에서 고정하려고 뺐다. */
  now?: Date;
}

export interface SearchResult {
  ok: boolean;
  status: number;
  body?: EdgeResponse;
  error?: string;
  notConfigured?: boolean;
}

/**
 * 오류 문구에서 서비스 키를 지운다.
 *
 * 실패 메시지에는 호출한 URL 이 섞여 들어오기 쉽고, 그 URL 에는 키가 들어 있다.
 * 오류는 로그로도 응답으로도 흘러가므로 **나가기 전에** 지운다.
 */
export function redact(text: unknown, secret: string): string {
  const s = text instanceof Error ? (text.message || String(text)) : String(text ?? "");
  const key = String(secret ?? "").trim();
  if (!key) return s;
  return s.split(key).join("***").split(encodeURIComponent(key)).join("***");
}

interface Config {
  endpoint: string;
  serviceKey: string;
  queryParam: string;
  keyParam: string;
  rowsParam: string;
  formatParam: string;
  missing: string[];
}

/** 앞에서부터 비어 있지 않은 첫 값. 빈 문자열은 "지정하지 않음"으로 본다. */
function pick(...values: Array<string | undefined>): string {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function readConfig(opts: SearchOptions): Config {
  // 파라미터 이름은 계약값(API_PROFILE)이 기본이고 환경변수가 덮는다.
  // 엔드포인트와 키는 기본값이 있을 수 없다 — 배포 때 넣어야 한다.
  return {
    endpoint:    pick(opts.endpoint,   env("KNA_API_ENDPOINT")),
    serviceKey:  pick(opts.serviceKey, env("KNA_SERVICE_KEY")),
    queryParam:  pick(opts.queryParam,  env("KNA_PARAM_QUERY"),  API_PROFILE.query),
    keyParam:    pick(opts.keyParam,    env("KNA_PARAM_KEY"),    API_PROFILE.key),
    rowsParam:   pick(opts.rowsParam,   env("KNA_PARAM_ROWS"),   API_PROFILE.rows),
    formatParam: pick(opts.formatParam, env("KNA_PARAM_FORMAT"), API_PROFILE.format),
    missing: [
      ...(pick(opts.endpoint,   env("KNA_API_ENDPOINT")) ? [] : ["KNA_API_ENDPOINT"]),
      ...(pick(opts.serviceKey, env("KNA_SERVICE_KEY"))  ? [] : ["KNA_SERVICE_KEY"])
    ]
  };
}

/** 호출 URL. 키가 들어가므로 이 문자열을 로그에 남기지 않는다. */
export function buildUrl(cfg: Config, query: string, rows: number): string {
  const url = new URL(cfg.endpoint);
  url.searchParams.set(cfg.keyParam, cfg.serviceKey);
  url.searchParams.set(cfg.queryParam, query);
  url.searchParams.set(cfg.rowsParam, String(rows));
  url.searchParams.set(cfg.formatParam, FORMAT_JSON);
  return url.toString();
}

/**
 * 국립수목원을 조회해 계약 모양으로 돌려준다. **절대 throw 하지 않는다.**
 *
 * @param query 식물명 또는 학명
 */
export async function searchPlants(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const q = String(query ?? "").trim();
  const now = opts.now ?? new Date();
  const cfg = readConfig(opts);

  // 빈 검색어는 실패가 아니다 — 물어본 게 없으니 답도 없다.
  if (!q) return { ok: true, status: 200, body: buildResponse({}, now) };

  if (cfg.missing.length) {
    return {
      ok: false, status: 503, notConfigured: true,
      error: `${FUNCTION_NAME} 설정이 비어 있습니다: ${cfg.missing.join(", ")}`
    };
  }

  const doFetch = opts.fetchImpl ?? (globalThis as Record<string, any>).fetch;
  if (typeof doFetch !== "function") {
    return { ok: false, status: 500, error: "fetch 를 쓸 수 없습니다" };
  }

  let res: Response;
  try {
    res = await doFetch(buildUrl(cfg, q, opts.rows ?? 10), {
      headers: { accept: "application/json" }
    });
  } catch (err) {
    return { ok: false, status: 502, error: redact(err, cfg.serviceKey) };
  }

  if (!res.ok) {
    return { ok: false, status: res.status,
             error: redact(`국립수목원 응답 ${res.status}`, cfg.serviceKey) };
  }

  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    return { ok: false, status: 502, error: redact(err, cfg.serviceKey) };
  }

  const payload = parsePayload(text, res.headers?.get?.("content-type") ?? "");

  // 결과 코드를 주는 응답이면 존중한다. 주지 않으면 본문으로 판단한다 —
  // "코드를 주지 않는 응답"과 "실패"는 다르다.
  const code = resultCodeOf(payload);
  if (code && code !== OK_RESULT_CODE) {
    const msg = resultMessageOf(payload);
    return { ok: false, status: 502,
             error: redact(`국립수목원 오류 ${code}${msg ? `: ${msg}` : ""}`, cfg.serviceKey) };
  }

  return { ok: true, status: 200, body: buildResponse(payload, now) };
}

/** 요청 1건 처리. Deno.serve 가 이 함수를 부른다. */
export async function handleRequest(req: Request, opts: SearchOptions = {}): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return json({ error: "POST 만 받습니다" }, 405);
  }

  let query = "";
  try {
    const body = await req.json();
    query = String(body?.query ?? "");
  } catch {
    return json({ error: "본문을 읽을 수 없습니다 — { \"query\": \"…\" } 형태여야 합니다" }, 400);
  }

  const result = await searchPlants(query, opts);
  return result.ok
    ? json(result.body as EdgeResponse, 200)
    : json({ error: result.error, ...(result.notConfigured ? { notConfigured: true } : {}) },
           result.status);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" }
  });
}

// 배포 환경(Deno)에서만 서버를 연다. Node 테스트가 이 파일을 불러도 아무 일도
// 일어나지 않아야 한다.
{
  const serve = (globalThis as Record<string, any>).Deno?.serve;
  if (typeof serve === "function") serve((req: Request) => handleRequest(req));
}
