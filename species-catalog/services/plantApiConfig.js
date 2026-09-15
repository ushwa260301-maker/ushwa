/**
 * plantApiConfig — 국가 식물 DB(국립수목원 · 국가생물종지식정보) 연결 설정.
 *
 * ⚠ 서비스 키를 이 파일에 커밋하지 않는다.
 *   배포본은 정적 파일이라 여기에 넣은 값은 누구나 읽을 수 있다. 운영 키는
 *   아래 두 방법 중 하나로 주입한다:
 *     ① 배포 파이프라인이 이 파일을 치환 (supabaseConfig.js 와 같은 방식)
 *     ② 프록시가 키를 들고, 앱은 프록시만 호출 (CORS 도 함께 해결됨)
 *
 * ⚠ 필드 매핑은 **검증된 실제 응답**을 보고 채운다.
 *   PLANT_API_FIELD_MAP 이 비어 있으면 plantApi 는 후보를 만들지 않는다.
 *   추측으로 채우면 원본에 없는 데이터가 Species 에 들어간다 — 이 프로젝트가
 *   가장 경계하는 실패다.
 */

/** API 엔드포인트. 프록시를 쓴다면 프록시 URL 을 넣는다. */
export const PLANT_API_ENDPOINT = "";

/** 서비스 키. 프록시 방식이면 비워 둔다(프록시가 들고 있는다). */
export const PLANT_API_SERVICE_KEY = "";

/** Species.metadata.plant_api_source 에 기록될 출처 이름. */
export const PLANT_API_SOURCE_LABEL = "국립수목원";

/**
 * 응답 JSON 에서 결과 배열까지의 경로. 점 표기.
 * 예: "response.body.items.item"
 */
export const PLANT_API_RESULT_PATH = "";

/**
 * 응답 레코드 → PlantRecord 필드 매핑.
 *
 * 키   = PlantRecord 필드 (plantApi.js 의 PLANT_RECORD_FIELDS)
 * 값   = 응답 레코드 안의 경로(점 표기). 배열이면 여러 후보를 순서대로 시도한다.
 *
 * 예 (실제 응답 확인 후 작성할 것):
 *   koreanName:     "korNm",
 *   scientificName: "scinm",
 *   photoUrls:      ["imgUrl1", "imgUrl2"]
 *
 * 비어 있으면 = 아직 검증된 샘플이 없다 = 조회를 시도하지 않는다.
 */
export const PLANT_API_FIELD_MAP = {};

/**
 * 값 변환기. 응답이 문자열로 주는 값을 앱이 쓰는 형태로 바꾼다.
 * 매핑과 마찬가지로 실제 응답을 보고 채운다.
 *
 *   bloomMonths   "4~6월" 같은 원문 → [4,5,6]
 *   sunlight      원문 → "양지" | "반양지" | "음지"
 *   ...
 */
export const PLANT_API_VALUE_PARSERS = {};

/** 네트워크 타임아웃 (ms). */
export const PLANT_API_TIMEOUT_MS = 10_000;
