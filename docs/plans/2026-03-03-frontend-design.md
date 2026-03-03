# 어서화 프론트엔드 디자인 문서

**날짜:** 2026-03-03
**프로젝트:** 어서화 (eoseohwa) - 꽃 중개 플랫폼
**범위:** 웹 (Next.js) + 모바일 (React Native Expo) 프론트엔드

---

## 1. 개요

배달의민족, 요기요, 여기어때를 레퍼런스로 한 꽃 중개 플랫폼.
고객이 꽃집을 탐색하고 주문/배달을 받을 수 있으며, 사장님은 주문을 관리하고, 관리자는 플랫폼 전체를 관리한다.

## 2. 아키텍처

**접근 방식:** 완전 분리 개발 (웹/모바일 독립)

```
ushwa/
├── shared/          # 공유 타입, 상수 (기존)
├── backend/         # Express + MongoDB (기존)
├── frontend/        # Next.js 14 웹앱 (신규)
└── mobile/          # Expo React Native 앱 (신규)
```

웹과 모바일은 독립적으로 개발하되, `shared/` 패키지의 타입과 상수를 공유한다.

## 3. 기술 스택

### 웹 (frontend/)
- **프레임워크:** Next.js 14 (App Router)
- **언어:** TypeScript
- **스타일링:** Tailwind CSS + shadcn/ui
- **상태관리:** Zustand
- **서버 통신:** Axios + TanStack Query (React Query)
- **폼 관리:** React Hook Form + Zod
- **인증:** JWT (httpOnly cookie)
- **실시간:** Socket.io Client
- **이미지:** next/image
- **지도:** Kakao Maps JavaScript SDK
- **결제:** 토스페이먼츠 Web SDK
- **폰트:** Pretendard

### 모바일 (mobile/)
- **프레임워크:** Expo SDK 51 + Expo Router
- **언어:** TypeScript
- **스타일링:** NativeWind (Tailwind 문법)
- **상태관리:** Zustand
- **서버 통신:** Axios + TanStack Query
- **폼 관리:** React Hook Form + Zod
- **인증:** JWT (expo-secure-store)
- **실시간:** Socket.io Client
- **이미지:** expo-image
- **지도:** react-native-maps
- **결제:** 토스페이먼츠 React Native SDK
- **폰트:** 시스템 폰트

## 4. 디자인 시스템

### 컬러 팔레트
| 이름 | 코드 | 용도 |
|------|------|------|
| Primary | #E91E63 | 로즈 핑크 - CTA, 강조 |
| Secondary | #4CAF50 | 리프 그린 - 자연/신선함 |
| Accent | #FF8A65 | 코랄 - 따뜻함/포인트 |
| Background | #FFF8F6 | 크림 핑크 - 배경 |
| Surface | #FFFFFF | 화이트 - 카드/컨테이너 |
| Text | #1A1A1A | 다크 그레이 - 본문 |
| SubText | #757575 | 미디엄 그레이 - 보조 텍스트 |

### 디자인 원칙
- **카드 기반 레이아웃:** 꽃집/상품을 카드형태로 표시
- **큰 이미지 중심:** 꽃은 시각적 상품이므로 이미지 강조
- **친근한 톤:** 둥근 모서리(12-16px), 부드러운 그림자
- **명확한 CTA:** 주문하기/장바구니 버튼은 Primary 색상 강조
- **여백 활용:** 답답하지 않은 레이아웃

### 타이포그래피
- 웹: Pretendard (한글 최적화)
- 모바일: 시스템 폰트 (iOS: SF Pro, Android: Roboto)

## 5. 화면 구성

### 5.1 고객 화면

| 화면 | 라우트 (웹) | 설명 |
|------|------------|------|
| 홈 | `/` | 배너, 카테고리, 추천 꽃집, 인기 상품 |
| 꽃집 목록 | `/shops` | 필터(거리, 평점, 가격), 정렬, 무한스크롤 |
| 꽃집 상세 | `/shops/[id]` | 상점 정보, 상품 목록, 리뷰, 영업시간 |
| 상품 상세 | `/shops/[shopId]/products/[id]` | 이미지 갤러리, 옵션 선택, 추가상품, 메시지카드 |
| 장바구니 | `/cart` | 수량 조절, 옵션 변경, 가격 합산 |
| 주문/결제 | `/checkout` | 배송지, 수령인, 결제수단 선택 |
| 주문 내역 | `/orders` | 상태별 필터, 주문 리스트 |
| 주문 상세 | `/orders/[id]` | 실시간 상태 추적, 주문 취소 |
| 리뷰 작성 | `/orders/[id]/review` | 별점, 사진, 텍스트 리뷰 |
| 마이페이지 | `/mypage` | 프로필, 주소 관리, 알림 설정 |

### 5.2 사장님 화면

| 화면 | 라우트 (웹) | 설명 |
|------|------------|------|
| 대시보드 | `/owner` | 오늘 주문수, 매출, 대기 주문 |
| 주문 관리 | `/owner/orders` | 접수/거절, 상태 변경, 실시간 알림 |
| 상품 관리 | `/owner/products` | CRUD, 재고 on/off |
| 가게 설정 | `/owner/shop` | 영업시간, 배달 범위, 가격 |
| 리뷰 관리 | `/owner/reviews` | 리뷰 목록, 답글 작성 |
| 매출 통계 | `/owner/stats` | 일/주/월별 매출, 인기 상품 |

### 5.3 관리자 화면

| 화면 | 라우트 (웹) | 설명 |
|------|------------|------|
| 대시보드 | `/admin` | 전체 주문, 매출, 가입자, 꽃집 수 |
| 꽃집 관리 | `/admin/shops` | 신규 승인, 정지, 상세 보기 |
| 사용자 관리 | `/admin/users` | 사용자 목록, 역할 변경 |
| 카테고리 관리 | `/admin/categories` | 카테고리 CRUD |
| 주문 현황 | `/admin/orders` | 모든 주문 조회, 통계 |

## 6. 프로젝트 구조

### 웹 (frontend/)
```
frontend/
├── src/
│   ├── app/                    # App Router 페이지
│   │   ├── (auth)/             # 로그인/회원가입
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (customer)/         # 고객 화면
│   │   │   ├── page.tsx            # 홈
│   │   │   ├── shops/
│   │   │   ├── cart/
│   │   │   ├── checkout/
│   │   │   ├── orders/
│   │   │   └── mypage/
│   │   ├── (owner)/            # 사장님 화면
│   │   │   ├── owner/
│   │   │   │   ├── page.tsx        # 대시보드
│   │   │   │   ├── orders/
│   │   │   │   ├── products/
│   │   │   │   ├── shop/
│   │   │   │   ├── reviews/
│   │   │   │   └── stats/
│   │   └── (admin)/            # 관리자 화면
│   │       └── admin/
│   │           ├── page.tsx        # 대시보드
│   │           ├── shops/
│   │           ├── users/
│   │           ├── categories/
│   │           └── orders/
│   ├── components/
│   │   ├── ui/                 # shadcn/ui 기본 컴포넌트
│   │   ├── layout/             # Header, Footer, Sidebar, Nav
│   │   ├── shop/               # ShopCard, ShopList, ShopDetail
│   │   ├── product/            # ProductCard, ProductDetail, OptionSelector
│   │   ├── order/              # OrderCard, OrderStatus, OrderTimeline
│   │   ├── review/             # ReviewCard, ReviewForm, StarRating
│   │   └── common/             # Loading, Empty, ErrorBoundary
│   ├── lib/
│   │   ├── api.ts              # Axios 인스턴스
│   │   ├── auth.ts             # 인증 유틸
│   │   ├── utils.ts            # 공통 유틸
│   │   └── constants.ts        # 프론트 전용 상수
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useCart.ts
│   │   ├── useShops.ts
│   │   ├── useProducts.ts
│   │   ├── useOrders.ts
│   │   └── useSocket.ts
│   └── stores/
│       ├── auth.store.ts
│       └── cart.store.ts
├── public/
├── tailwind.config.ts
├── next.config.js
└── package.json
```

### 모바일 (mobile/)
```
mobile/
├── app/                        # Expo Router
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/                 # 하단 탭 네비게이션
│   │   ├── _layout.tsx
│   │   ├── index.tsx               # 홈
│   │   ├── search.tsx              # 검색/탐색
│   │   ├── orders.tsx              # 주문 내역
│   │   └── mypage.tsx              # 마이페이지
│   ├── shop/[id].tsx
│   ├── product/[id].tsx
│   ├── cart.tsx
│   ├── checkout.tsx
│   └── order/[id].tsx
├── components/
├── lib/
├── hooks/
├── stores/
├── app.json
└── package.json
```

## 7. 데이터 플로우

```
사용자 액션
    ↓
React Component (UI)
    ↓
Custom Hook (useShops, useOrders 등)
    ↓
TanStack Query (캐싱, 재시도, 낙관적 업데이트)
    ↓
Axios API Client
    ↓
Backend API (Express)
    ↓
MongoDB
```

실시간 알림:
```
Backend (Socket.io Server)
    ↓
Socket.io Client (useSocket hook)
    ↓
Zustand Store (알림 상태)
    ↓
UI 업데이트 (토스트/뱃지)
```

## 8. 결제 플로우

```
장바구니 → 결제 페이지 → 토스페이먼츠 SDK 호출
    → 결제 성공 → 백엔드 검증 → 주문 생성
    → 결제 실패 → 에러 표시 → 재시도
```

결제수단: 카드, 카카오페이, 네이버페이, 토스페이, 계좌이체

## 9. 인증 플로우

- 회원가입: 이메일 + 비밀번호 + 이름 + 전화번호
- 로그인: 이메일 + 비밀번호 → JWT 발급
- 웹: JWT를 httpOnly cookie에 저장
- 모바일: JWT를 SecureStore에 저장
- 역할별 라우트 보호: customer, owner, admin

## 10. 주요 결정사항

1. **완전 분리 개발** — 웹/모바일 독립, shared/ 로 타입만 공유
2. **배민 스타일 + 꽃 테마** — 친근한 카드 UI, 핑크/그린 컬러
3. **토스페이먼츠** — 카카오페이/네이버페이 등 다양한 결제수단 통합
4. **Zustand** — 경량 상태관리, 러닝커브 낮음
5. **TanStack Query** — 서버 상태 캐싱, 자동 리페치
