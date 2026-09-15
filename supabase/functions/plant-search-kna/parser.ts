/**
 * plant-search-kna / parser — 국립수목원 응답을 Edge Function 계약으로 옮긴다.
 *
 * 여기에는 **순수 함수만** 둔다. fetch · Deno · 환경변수를 쓰지 않으므로
 * Deno 와 Node 양쪽에서 그대로 불러 테스트할 수 있다.
 *
 * ## 이 계층이 맡는 일
 *
 *   XML/JSON 통일    출처가 어느 형식으로 주든 하나의 모양으로 만든다
 *   records 추출     응답 껍데기를 벗기고 행 배열만 남긴다
 *   version 결정     응답이 판을 말하면 그대로, 아니면 실행일로 만든다
 *
 * 값 변환은 하지 않는다. `"6~8월"` 은 `"6~8월"` 로 넘어간다 — 필드 이름을 읽는
 * 일은 knaProvider.mapRow 가, 값 정규화는 plantNormalizer 가 한다.
 *
 * ⚠ 서비스 키는 이 파일에 오지 않는다. 키를 만지는 쪽은 index.ts 뿐이다.
 */

/** 출처 코드. 문자열을 흩뿌리지 않으려고 여기 한 곳에서만 정한다. */
export const PROVIDER_NAME = "kna";

/** Edge Function 이름. knaProvider.FUNCTION_NAME 과 같아야 한다. */
export const FUNCTION_NAME = `plant-search-${PROVIDER_NAME}`;

/** 정상 응답 코드. 다른 값이면 본문이 있어도 결과로 보지 않는다. */
export const OK_RESULT_CODE = "00";

// ============================================================
// XML → 객체
// ============================================================

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'"
};

/** `&amp;` · `&#48;` · `&#x30;` 을 되돌린다. 모르는 참조는 그대로 둔다. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/**
 * 토큰: 주석 · 선언 · CDATA · 닫는 태그 · 여는 태그.
 * 속성값 안의 `>` 에 속지 않도록 따옴표 구간을 통째로 건너뛴다.
 */
const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\s*\/\s*([A-Za-z_][\w.:-]*)\s*>|<\s*([A-Za-z_][\w.:-]*)((?:'[^']*'|"[^"]*"|[^'">])*)>/g;

interface Frame {
  name: string;
  kids: Record<string, unknown[]>;
  text: string;
}

function newFrame(name: string): Frame {
  return { name, kids: {}, text: "" };
}

/** 같은 이름이 두 번 나오면 배열이 된다 — `<item>` 반복이 그렇다. */
function addKid(frame: Frame, name: string, value: unknown): void {
  (frame.kids[name] ??= []).push(value);
}

/**
 * 자식이 있으면 객체, 없으면 텍스트.
 * 자식과 텍스트가 섞이면 자식을 택한다 — 사이의 공백은 값이 아니다.
 */
function frameValue(frame: Frame): unknown {
  const names = Object.keys(frame.kids);
  if (names.length === 0) return frame.text.trim();
  const out: Record<string, unknown> = {};
  for (const n of names) {
    const list = frame.kids[n];
    out[n] = list.length === 1 ? list[0] : list;
  }
  return out;
}

/**
 * 최소 XML 파서 — 이 응답을 읽는 데 필요한 만큼만.
 *
 * **다루지 않는 것**: 속성(무시한다) · 네임스페이스 접두사 분해 · DTD 실체 ·
 * 혼합 콘텐츠의 텍스트 순서. 국립수목원 응답은 값이 전부 엘리먼트라 충분하다.
 * 이보다 복잡한 XML 이 오면 파서를 늘리지 말고 형식을 JSON 으로 요청한다.
 */
export function parseXml(xml: string): Record<string, unknown> {
  const root = newFrame("#root");
  const stack: Frame[] = [root];
  const top = () => stack[stack.length - 1];

  let cursor = 0;
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = TOKEN.exec(xml)) !== null) {
    if (m.index > cursor) top().text += decodeEntities(xml.slice(cursor, m.index));
    cursor = m.index + m[0].length;

    const [, cdata, closeName, openName, attrs] = m;

    if (cdata !== undefined) { top().text += cdata; continue; }

    if (closeName !== undefined) {
      // 짝이 맞는 프레임까지 닫는다. 짝이 없으면 무시한다 — 던지지 않는다.
      const depth = stack.findIndex(f => f.name === closeName);
      if (depth <= 0) continue;
      while (stack.length - 1 >= depth) {
        const done = stack.pop() as Frame;
        addKid(top(), done.name, frameValue(done));
      }
      continue;
    }

    if (openName !== undefined) {
      if ((attrs ?? "").trimEnd().endsWith("/")) {
        addKid(top(), openName, "");        // <x/> 는 빈 값
      } else {
        stack.push(newFrame(openName));
      }
    }
  }
  if (cursor < xml.length) top().text += decodeEntities(xml.slice(cursor));

  // 닫히지 않은 채 끝난 태그도 값으로 살린다.
  while (stack.length > 1) {
    const done = stack.pop() as Frame;
    addKid(top(), done.name, frameValue(done));
  }

  const value = frameValue(root);
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

// ============================================================
// 응답 해석
// ============================================================

/**
 * 본문 → 객체. 형식은 Content-Type 이 말해 주고, 없으면 첫 글자로 본다.
 * 해석할 수 없으면 빈 객체다 — 던지지 않는다.
 */
export function parsePayload(body: string, contentType = ""): Record<string, unknown> {
  const text = String(body ?? "").trim();
  if (!text) return {};

  const ct = contentType.toLowerCase();
  const looksJson = ct.includes("json") || text.startsWith("{") || text.startsWith("[");
  if (looksJson) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch { /* XML 일 수도 있다 — 아래로 내려간다 */ }
  }
  if (text.startsWith("<")) return parseXml(text);
  return {};
}

/** 배열이 아니어도 배열로. 행이 하나면 XML 은 배열을 만들지 않는다. */
function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function at(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** 행이 들어 있을 만한 자리들. 깊은 쪽(XML)을 먼저 본다. */
const RECORD_PATHS: string[][] = [
  ["response", "body", "items", "item"],
  ["response", "body", "items"],
  ["body", "items", "item"],
  ["body", "items"],
  ["items", "item"],
  ["items"],
  ["records"]
];

/**
 * 응답 껍데기를 벗기고 행 배열만 남긴다.
 *
 * JSON 은 `{ items: [...] }`, XML 은 `<response><body><items><item>…` 로 온다.
 * 두 모양을 여기서 하나로 만든다 — 그래야 Provider 가 형식을 모른다.
 */
export function toRecords(payload: unknown): Record<string, unknown>[] {
  for (const path of RECORD_PATHS) {
    const found = at(payload, path);
    const rows = asArray(found).filter(
      (x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x)
    );
    if (rows.length) return rows;
  }
  return [];
}

/** 결과 코드. 없으면 빈 문자열 — "코드를 주지 않는 응답"과 "실패"는 다르다. */
export function resultCodeOf(payload: unknown): string {
  for (const path of [["resultCode"], ["response", "header", "resultCode"],
                      ["header", "resultCode"], ["body", "resultCode"]]) {
    const v = at(payload, path);
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** 결과 메시지. 오류를 그대로 전하려고 읽는다. */
export function resultMessageOf(payload: unknown): string {
  for (const path of [["resultMsg"], ["response", "header", "resultMsg"],
                      ["header", "resultMsg"], ["body", "resultMsg"]]) {
    const v = at(payload, path);
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** UTC 기준 `YYYY-MM-DD`. 실행한 날을 판으로 쓴다. */
export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * 판을 정한다.
 *
 *   ① 응답이 판을 말하면 그대로 쓴다.
 *   ② 말하지 않으면 **실행일**로 만든다.
 *
 * 판이 없으면 STALE 을 계산할 수 없다. 실행일을 넣으면 적어도 "언제 받은
 * 자료인가" 는 남고, 다음에 받은 것과 달라지므로 갱신 여부를 판단할 수 있다.
 * 판을 만드는 일은 **여기까지**다 — Provider 는 만들지 않고 받기만 한다.
 */
export function resolveVersion(payload: unknown, now: Date = new Date()): string {
  for (const path of [["version"], ["response", "body", "version"], ["body", "version"]]) {
    const v = at(payload, path);
    const s = v === undefined || v === null ? "" : String(v).trim();
    if (s) return s;
  }
  return utcDate(now);
}

export interface EdgeResponse {
  provider: string;
  version: string;
  latestVersions: Record<string, string>;
  records: Record<string, unknown>[];
}

/**
 * 계약 모양으로 조립한다 — `{ provider, version, latestVersions, records }`.
 *
 * `latestVersions` 는 전역 기준값이라 레코드마다 담지 않는다. 지금은 이 함수가
 * 자기 출처 하나만 아는 게 정직하다 — 다른 출처의 판을 지어내지 않는다.
 */
export function buildResponse(payload: unknown, now: Date = new Date()): EdgeResponse {
  const version = resolveVersion(payload, now);
  return {
    provider: PROVIDER_NAME,
    version,
    latestVersions: { [PROVIDER_NAME]: version },
    records: toRecords(payload)
  };
}
