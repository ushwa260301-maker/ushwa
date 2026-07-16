# 프로젝트 마인드맵 — 실시간 협업 웹앱

정적 HTML 한 파일 + Firebase Firestore 실시간 동기화.
사이트 방문자 전원이 **하나의 마인드맵을 함께 편집**합니다.

- 프론트: `index.html` (Firebase 모듈 SDK를 CDN에서 로드)
- 저장소: Firestore 문서 `mindmaps/main` 하나
- 배포: Vercel(정적) 권장 — GitHub Pages, Netlify, Cloudflare Pages 어디든 가능

Firebase 설정 값을 넣지 않으면 이전과 동일하게 **로컬 저장(localStorage) 모드**로 동작하므로,
설정 전에도 `index.html`을 브라우저로 바로 열어 테스트할 수 있습니다.

---

## 1) Firebase 프로젝트 만들기 (5분)

1. https://console.firebase.google.com/ 접속 → **프로젝트 추가**
2. 프로젝트 이름 입력(예: `ushwa-mindmap`) → Google Analytics는 꺼도 무방 → **만들기**
3. 왼쪽 사이드바 **빌드 → Firestore Database → 데이터베이스 만들기**
   - 위치는 `asia-northeast3` (서울) 권장
   - **테스트 모드로 시작** 선택 → 완료
4. 프로젝트 개요(⚙️ 아이콘) → **프로젝트 설정** → 하단 **내 앱**에서 `</>` 웹 아이콘 클릭
   - 앱 닉네임 입력(예: `mindmap-web`) → **앱 등록**
   - 표시되는 `firebaseConfig` 객체를 복사

## 2) `index.html`에 설정 값 붙여넣기

`mindmap/index.html` 상단 `FIREBASE_CONFIG` 블록을 방금 복사한 값으로 교체:

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",
  authDomain:        "ushwa-mindmap.firebaseapp.com",
  projectId:         "ushwa-mindmap",
  storageBucket:     "ushwa-mindmap.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abcdef...",
};
```

> Firebase 웹 config는 공개용입니다 — 코드에 그대로 커밋해도 안전합니다.
> 실제 접근 제어는 아래의 Firestore 보안 규칙으로 합니다.

## 3) Firestore 보안 규칙 설정

Firebase 콘솔 → **Firestore Database → 규칙** 탭에서 아래 내용으로 교체:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /mindmaps/{docId} {
      // MVP: 로그인 없이 누구나 이 마인드맵을 읽고 씀
      allow read, write: if true;
    }
  }
}
```

**게시**을 눌러 저장.

> 나중에 남용이 걱정되면 이 규칙을 `allow write: if request.time < timestamp.date(2027, 1, 1);` 같은
> 만료형이나 익명 인증(`request.auth != null`) 기반으로 바꿀 수 있습니다.

## 4) 로컬에서 미리 열어보기

브라우저에서 `mindmap/index.html`을 직접 열어봅니다.
브라우저에 따라 `file://` 스킴에서 ES 모듈이 막힐 수 있으니
간단히 로컬 서버로 띄우는 게 확실합니다:

```bash
# 프로젝트 루트에서
cd mindmap
python3 -m http.server 8000
# → http://localhost:8000 접속
```

우측 상단 상태 인디케이터가 초록불 **"실시간 연결"** 이면 성공.
두 번째 탭으로 같은 주소를 열어 실시간 반영 여부 확인.

## 5) Vercel에 배포

1. https://vercel.com 로그인 → **Add New… → Project**
2. GitHub 저장소 (`ushwa`) 선택 → Import
3. 프로젝트 설정 화면:
   - **Framework Preset**: `Other`
   - **Root Directory**: `mindmap` ← 중요
   - Build & Output: 그대로 (Static)
4. **Deploy** 클릭 → 30초 뒤 `https://<프로젝트명>.vercel.app` 발급

이후 `mindmap/` 하위 파일을 커밋·푸시할 때마다 Vercel이 자동 재배포합니다.
Firebase Firestore 데이터는 코드 재배포와 무관하게 그대로 유지됩니다.

### 다른 정적 호스팅 사용 시

- **GitHub Pages**: 저장소 Settings → Pages → Source에서 브랜치와 `/mindmap` 폴더 선택
- **Netlify**: New site → GitHub 연결 → Publish directory `mindmap`
- **Cloudflare Pages**: Build output directory `mindmap`

---

## 데이터 스키마 (참고)

Firestore `mindmaps/main` 문서 하나에 트리 전체가 저장됩니다:

```json
{
  "id": "root",
  "label": "새 프로젝트",
  "sub": "YOUR PRODUCT",
  "desc": "…",
  "children": [
    {
      "id": "concept",
      "label": "핵심 컨셉",
      "color": "c-concept",
      "desc": "…",
      "children": [
        { "id": "problem", "label": "문제 정의", "desc": "…" }
      ]
    }
  ],
  "_updatedAt": 1721145600000,
  "_updatedBy": "abc12345"
}
```

- `_updatedBy`는 각 브라우저 세션의 임시 ID — 자기가 쓴 스냅샷을 되받았을 때 무시하는 용도
- 문서 크기 한도 1MB — 대략 갈래 8 × 하위 8 × 5000자 설명 규모까지 여유

## 원격 저장이 코드 변경에 안전한 이유

- 마인드맵 데이터는 **Firestore**에 삽니다 (Google 인프라)
- 웹앱 코드는 **Vercel** 등 정적 호스팅에 삽니다
- 두 곳이 완전히 분리되어 있으므로, `index.html`을 아무리 다시 배포해도
  Firestore 문서는 그대로입니다.
- Claude를 통해 UI/기능을 계속 확장해도 사용자가 쌓은 마인드맵은 유지됩니다.

## 장애 대응

| 증상 | 원인 | 해결 |
|---|---|---|
| 상태 인디케이터 "오프라인" | Firestore 규칙 거부 / 네트워크 | 콘솔 규칙 확인, 브라우저 콘솔의 에러 확인 |
| "로컬 저장됨" 만 표시 | Firebase 설정 값이 비어있음 | `FIREBASE_CONFIG` 값 확인 |
| 다른 탭에서 편집이 안 보임 | Firestore 문서 경로 불일치 | 두 탭 모두 같은 `DOC_PATH` 사용하는지 확인 |
| 실수로 초기화 | 누가 Reset 버튼을 눌렀음 | Firestore 콘솔에서 이전 문서 상태 복구, 또는 Import로 백업 JSON 로드 |

정기 백업이 필요하면 상단의 `↓ Export` 버튼으로 JSON을 로컬에 저장해두세요.
