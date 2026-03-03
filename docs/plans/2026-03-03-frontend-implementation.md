# 어서화 프론트엔드 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 배달의민족 스타일의 꽃 중개 플랫폼 프론트엔드를 웹(Next.js)과 모바일(Expo)로 동시 구축한다.

**Architecture:** 웹과 모바일을 완전 분리하여 독립 개발하되, shared/ 패키지로 타입과 상수를 공유한다. 각 플랫폼은 Zustand(상태), TanStack Query(서버 캐싱), Axios(API)를 공통 스택으로 사용한다.

**Tech Stack:** Next.js 14 (App Router) + Tailwind CSS + shadcn/ui (웹), Expo SDK 51 + Expo Router + NativeWind (모바일), TypeScript, Zustand, TanStack Query, React Hook Form + Zod, Socket.io Client

**Backend API Base:** `http://localhost:5000/api`
**Auth:** JWT Bearer token (access: 15min, refresh: 7d)
**User Roles:** customer, owner, admin

---

## Phase 1: 프로젝트 초기 설정

### Task 1.1: Next.js 웹 프로젝트 생성

**Files:**
- Create: `frontend/` (Next.js 프로젝트)

**Step 1: Next.js 프로젝트 생성**

```bash
cd /Users/choeseungbin/ushwa
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

**Step 2: 추가 패키지 설치**

```bash
cd /Users/choeseungbin/ushwa/frontend
npm install zustand @tanstack/react-query axios react-hook-form @hookform/resolvers zod socket.io-client lucide-react clsx tailwind-merge class-variance-authority
npm install -D @types/node
```

**Step 3: shadcn/ui 초기화**

```bash
cd /Users/choeseungbin/ushwa/frontend
npx shadcn@latest init
```

설정:
- Style: Default
- Base color: Slate
- CSS variables: Yes

**Step 4: 핵심 shadcn/ui 컴포넌트 설치**

```bash
cd /Users/choeseungbin/ushwa/frontend
npx shadcn@latest add button card input label badge separator sheet dialog dropdown-menu avatar tabs toast skeleton select textarea
```

**Step 5: 커밋**

```bash
cd /Users/choeseungbin/ushwa
git add frontend/
git commit -m "feat: scaffold Next.js frontend with Tailwind, shadcn/ui, and dependencies"
```

---

### Task 1.2: Expo 모바일 프로젝트 생성

**Files:**
- Create: `mobile/` (Expo 프로젝트)

**Step 1: Expo 프로젝트 생성**

```bash
cd /Users/choeseungbin/ushwa
npx create-expo-app@latest mobile --template tabs
```

**Step 2: 추가 패키지 설치**

```bash
cd /Users/choeseungbin/ushwa/mobile
npx expo install nativewind tailwindcss react-native-css-interop
npx expo install expo-secure-store expo-image expo-image-picker
npm install zustand @tanstack/react-query axios react-hook-form @hookform/resolvers zod socket.io-client
```

**Step 3: NativeWind 설정**

Create `mobile/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#E91E63',
        secondary: '#4CAF50',
        accent: '#FF8A65',
        background: '#FFF8F6',
        surface: '#FFFFFF',
        'text-primary': '#1A1A1A',
        'text-secondary': '#757575',
      },
    },
  },
  plugins: [],
};
```

Create `mobile/global.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 4: 커밋**

```bash
cd /Users/choeseungbin/ushwa
git add mobile/
git commit -m "feat: scaffold Expo mobile app with NativeWind and dependencies"
```

---

### Task 1.3: 웹 디자인 시스템 설정

**Files:**
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/src/app/globals.css`
- Create: `frontend/src/lib/utils.ts`

**Step 1: Tailwind 테마 설정**

Update `frontend/tailwind.config.ts`:
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#E91E63",
          50: "#FDE8EF",
          100: "#FBD1DF",
          200: "#F7A3BF",
          300: "#F3759F",
          400: "#EF477F",
          500: "#E91E63",
          600: "#C2185B",
          700: "#9C1350",
          800: "#750E3C",
          900: "#4F0A29",
        },
        secondary: {
          DEFAULT: "#4CAF50",
          50: "#E8F5E9",
          100: "#C8E6C9",
          200: "#A5D6A7",
          300: "#81C784",
          400: "#66BB6A",
          500: "#4CAF50",
          600: "#43A047",
          700: "#388E3C",
          800: "#2E7D32",
          900: "#1B5E20",
        },
        accent: {
          DEFAULT: "#FF8A65",
          50: "#FBE9E7",
          100: "#FFCCBC",
          200: "#FFAB91",
          300: "#FF8A65",
          400: "#FF7043",
          500: "#FF5722",
        },
        background: "#FFF8F6",
        surface: "#FFFFFF",
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

**Step 2: 글로벌 CSS 설정**

Update `frontend/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css');

@layer base {
  :root {
    --background: 15 100% 98%;
    --foreground: 0 0% 10%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 10%;
    --primary: 340 82% 52%;
    --primary-foreground: 0 0% 100%;
    --secondary: 122 39% 49%;
    --secondary-foreground: 0 0% 100%;
    --accent: 14 100% 70%;
    --accent-foreground: 0 0% 100%;
    --muted: 0 0% 96%;
    --muted-foreground: 0 0% 46%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 0 0% 90%;
    --input: 0 0% 90%;
    --ring: 340 82% 52%;
    --radius: 12px;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground font-sans antialiased;
  }
}
```

**Step 3: 커밋**

```bash
cd /Users/choeseungbin/ushwa
git add frontend/
git commit -m "feat: configure design system with flower theme colors and Pretendard font"
```

---

## Phase 2: 공통 인프라 (웹)

### Task 2.1: API 클라이언트 설정

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/auth.ts`

**Step 1: Axios 인스턴스 생성**

Create `frontend/src/lib/api.ts`:
```typescript
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

**Step 2: 인증 유틸리티**

Create `frontend/src/lib/auth.ts`:
```typescript
import api from './api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone: string;
  role?: 'customer' | 'owner';
}

export const authApi = {
  login: async (data: LoginRequest) => {
    const res = await api.post('/auth/login', data);
    return res.data;
  },
  register: async (data: RegisterRequest) => {
    const res = await api.post('/auth/register', data);
    return res.data;
  },
  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
  refresh: async (refreshToken: string) => {
    const res = await api.post('/auth/refresh', { refreshToken });
    return res.data;
  },
};
```

**Step 3: 커밋**

```bash
cd /Users/choeseungbin/ushwa
git add frontend/src/lib/
git commit -m "feat: add API client with auth interceptor and token refresh"
```

---

### Task 2.2: Zustand 인증 스토어

**Files:**
- Create: `frontend/src/stores/auth.store.ts`
- Create: `frontend/src/stores/cart.store.ts`

**Step 1: 인증 스토어 생성**

Create `frontend/src/stores/auth.store.ts`:
```typescript
import { create } from 'zustand';
import { authApi, LoginRequest, RegisterRequest } from '@/lib/auth';

interface User {
  _id: string;
  email: string;
  name: string;
  phone: string;
  role: 'customer' | 'owner' | 'admin';
  profileImage?: string;
  addresses: Array<{
    _id?: string;
    label: string;
    address: string;
    addressDetail: string;
    zipCode: string;
    coordinates: { lat: number; lng: number };
    isDefault: boolean;
  }>;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (data) => {
    const res = await authApi.login(data);
    localStorage.setItem('accessToken', res.data.accessToken);
    localStorage.setItem('refreshToken', res.data.refreshToken);
    set({ user: res.data.user, isAuthenticated: true, isLoading: false });
  },

  register: async (data) => {
    const res = await authApi.register(data);
    localStorage.setItem('accessToken', res.data.accessToken);
    localStorage.setItem('refreshToken', res.data.refreshToken);
    set({ user: res.data.user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchUser: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const res = await authApi.getMe();
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => set({ user }),
}));
```

**Step 2: 장바구니 스토어 생성**

Create `frontend/src/stores/cart.store.ts`:
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CartItem {
  productId: string;
  shopId: string;
  shopName: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  selectedOptions: Array<{ name: string; value: string; price: number }>;
  selectedAddOns: Array<{ name: string; price: number }>;
  messageCard?: string;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getDeliveryFee: () => number;
  getItemCount: () => number;
  getShopId: () => string | null;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const items = get().items;
        // 다른 가게 상품이면 장바구니 비우기
        if (items.length > 0 && items[0].shopId !== item.shopId) {
          set({ items: [item] });
          return;
        }
        const existing = items.find((i) => i.productId === item.productId);
        if (existing) {
          set({
            items: items.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
          });
        } else {
          set({ items: [...items, item] });
        }
      },

      removeItem: (productId) => {
        set({ items: get().items.filter((i) => i.productId !== productId) });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.productId === productId ? { ...i, quantity } : i
          ),
        });
      },

      clearCart: () => set({ items: [] }),

      getTotal: () => {
        return get().items.reduce((sum, item) => {
          const optionsPrice = item.selectedOptions.reduce((s, o) => s + o.price, 0);
          const addOnsPrice = item.selectedAddOns.reduce((s, a) => s + a.price, 0);
          return sum + (item.price + optionsPrice + addOnsPrice) * item.quantity;
        }, 0);
      },

      getDeliveryFee: () => 3000, // 기본 배달비

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getShopId: () => {
        const items = get().items;
        return items.length > 0 ? items[0].shopId : null;
      },
    }),
    { name: 'eoseohwa-cart' }
  )
);
```

**Step 3: 커밋**

```bash
cd /Users/choeseungbin/ushwa
git add frontend/src/stores/
git commit -m "feat: add auth and cart Zustand stores with persistence"
```

---

### Task 2.3: TanStack Query 및 Provider 설정

**Files:**
- Create: `frontend/src/lib/query-client.ts`
- Create: `frontend/src/components/providers.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Step 1: Query Client 생성**

Create `frontend/src/lib/query-client.ts`:
```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5분
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

**Step 2: Provider 컴포넌트 생성**

Create `frontend/src/components/providers.tsx`:
```typescript
'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { Toaster } from '@/components/ui/toaster';

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        {children}
        <Toaster />
      </AuthInitializer>
    </QueryClientProvider>
  );
}
```

**Step 3: layout.tsx 업데이트**

Update `frontend/src/app/layout.tsx`:
```typescript
import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: '어서화 - 꽃 중개 플랫폼',
  description: '가까운 꽃집에서 신선한 꽃을 주문하세요',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Step 4: 커밋**

```bash
cd /Users/choeseungbin/ushwa
git add frontend/src/
git commit -m "feat: add TanStack Query provider and auth initializer"
```

---

### Task 2.4: API 서비스 레이어

**Files:**
- Create: `frontend/src/lib/api/shops.ts`
- Create: `frontend/src/lib/api/products.ts`
- Create: `frontend/src/lib/api/orders.ts`
- Create: `frontend/src/lib/api/reviews.ts`
- Create: `frontend/src/lib/api/categories.ts`
- Create: `frontend/src/lib/api/notifications.ts`
- Create: `frontend/src/lib/api/admin.ts`
- Create: `frontend/src/lib/api/users.ts`
- Create: `frontend/src/lib/api/index.ts`

**Step 1: Shop API**

Create `frontend/src/lib/api/shops.ts`:
```typescript
import api from '../api';

export interface ShopListParams {
  page?: number;
  limit?: number;
  lat?: number;
  lng?: number;
  maxDistance?: number;
  category?: string;
  search?: string;
  sort?: 'rating' | 'name' | 'distance';
}

export const shopsApi = {
  getList: async (params?: ShopListParams) => {
    const res = await api.get('/shops', { params });
    return res.data;
  },
  getById: async (id: string) => {
    const res = await api.get(`/shops/${id}`);
    return res.data;
  },
  getProducts: async (id: string, params?: { page?: number; limit?: number }) => {
    const res = await api.get(`/shops/${id}/products`, { params });
    return res.data;
  },
  getReviews: async (id: string, params?: { page?: number; limit?: number }) => {
    const res = await api.get(`/shops/${id}/reviews`, { params });
    return res.data;
  },
  // Owner
  createShop: async (data: FormData) => {
    const res = await api.post('/shops', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  updateMyShop: async (data: FormData) => {
    const res = await api.put('/shops/my', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  toggleOpen: async () => {
    const res = await api.put('/shops/my/toggle-open');
    return res.data;
  },
  getAnalytics: async () => {
    const res = await api.get('/shops/my/analytics');
    return res.data;
  },
};
```

**Step 2: Product API**

Create `frontend/src/lib/api/products.ts`:
```typescript
import api from '../api';

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'price_asc' | 'price_desc' | 'rating' | 'popular';
}

export const productsApi = {
  getList: async (params?: ProductListParams) => {
    const res = await api.get('/products', { params });
    return res.data;
  },
  getFeatured: async () => {
    const res = await api.get('/products/featured');
    return res.data;
  },
  getById: async (id: string) => {
    const res = await api.get(`/products/${id}`);
    return res.data;
  },
  // Owner
  create: async (data: FormData) => {
    const res = await api.post('/products', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  update: async (id: string, data: FormData) => {
    const res = await api.put(`/products/${id}`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/products/${id}`);
    return res.data;
  },
};
```

**Step 3: Orders API**

Create `frontend/src/lib/api/orders.ts`:
```typescript
import api from '../api';

export interface CreateOrderData {
  shop: string;
  items: Array<{
    product: string;
    quantity: number;
    selectedOptions?: Array<{ name: string; value: string; price: number }>;
    selectedAddOns?: Array<{ name: string; price: number }>;
  }>;
  delivery: {
    type: 'delivery' | 'pickup';
    address: string;
    addressDetail: string;
    recipientName: string;
    recipientPhone: string;
    requestedDate?: string;
    requestedTime?: string;
    message?: string;
  };
  payment: {
    method: 'card' | 'transfer' | 'cash';
  };
}

export const ordersApi = {
  // Customer
  create: async (data: CreateOrderData) => {
    const res = await api.post('/orders', data);
    return res.data;
  },
  getMyOrders: async (params?: { page?: number; limit?: number; status?: string }) => {
    const res = await api.get('/orders/my', { params });
    return res.data;
  },
  cancel: async (id: string) => {
    const res = await api.put(`/orders/${id}/cancel`);
    return res.data;
  },
  getById: async (id: string) => {
    const res = await api.get(`/orders/${id}`);
    return res.data;
  },
  // Owner
  getShopOrders: async (params?: { page?: number; limit?: number; status?: string }) => {
    const res = await api.get('/orders/shop', { params });
    return res.data;
  },
  accept: async (id: string) => {
    const res = await api.put(`/orders/${id}/accept`);
    return res.data;
  },
  reject: async (id: string, reason: string) => {
    const res = await api.put(`/orders/${id}/reject`, { reason });
    return res.data;
  },
  updateStatus: async (id: string, status: string) => {
    const res = await api.put(`/orders/${id}/status`, { status });
    return res.data;
  },
};
```

**Step 4: Reviews, Categories, Notifications, Admin, Users API**

Create `frontend/src/lib/api/reviews.ts`:
```typescript
import api from '../api';

export const reviewsApi = {
  create: async (data: FormData) => {
    const res = await api.post('/reviews', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  getMyReviews: async (params?: { page?: number; limit?: number }) => {
    const res = await api.get('/reviews/my', { params });
    return res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/reviews/${id}`);
    return res.data;
  },
  getShopReviews: async (shopId: string, params?: { page?: number; limit?: number }) => {
    const res = await api.get(`/reviews/shop/${shopId}`, { params });
    return res.data;
  },
  reply: async (id: string, content: string) => {
    const res = await api.post(`/reviews/${id}/reply`, { content });
    return res.data;
  },
};
```

Create `frontend/src/lib/api/categories.ts`:
```typescript
import api from '../api';

export const categoriesApi = {
  getAll: async () => {
    const res = await api.get('/categories');
    return res.data;
  },
  create: async (data: { name: string; slug: string; icon?: string; description?: string; sortOrder?: number }) => {
    const res = await api.post('/categories', data);
    return res.data;
  },
  update: async (id: string, data: Partial<{ name: string; slug: string; icon: string; description: string; sortOrder: number }>) => {
    const res = await api.put(`/categories/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/categories/${id}`);
    return res.data;
  },
};
```

Create `frontend/src/lib/api/notifications.ts`:
```typescript
import api from '../api';

export const notificationsApi = {
  getAll: async (params?: { page?: number; limit?: number }) => {
    const res = await api.get('/notifications', { params });
    return res.data;
  },
  markAsRead: async (id: string) => {
    const res = await api.put(`/notifications/${id}/read`);
    return res.data;
  },
  markAllAsRead: async () => {
    const res = await api.put('/notifications/read-all');
    return res.data;
  },
  getUnreadCount: async () => {
    const res = await api.get('/notifications/unread-count');
    return res.data;
  },
};
```

Create `frontend/src/lib/api/admin.ts`:
```typescript
import api from '../api';

export const adminApi = {
  getDashboard: async () => {
    const res = await api.get('/admin/dashboard');
    return res.data;
  },
  getUsers: async (params?: { page?: number; limit?: number; role?: string; search?: string }) => {
    const res = await api.get('/admin/users', { params });
    return res.data;
  },
  getUserById: async (id: string) => {
    const res = await api.get(`/admin/users/${id}`);
    return res.data;
  },
  updateUserStatus: async (id: string, isActive: boolean) => {
    const res = await api.put(`/admin/users/${id}/status`, { isActive });
    return res.data;
  },
  getShops: async (params?: { page?: number; limit?: number; status?: string; search?: string }) => {
    const res = await api.get('/admin/shops', { params });
    return res.data;
  },
  approveShop: async (id: string) => {
    const res = await api.put(`/admin/shops/${id}/approve`);
    return res.data;
  },
  rejectShop: async (id: string, reason: string) => {
    const res = await api.put(`/admin/shops/${id}/reject`, { reason });
    return res.data;
  },
  suspendShop: async (id: string, reason: string) => {
    const res = await api.put(`/admin/shops/${id}/suspend`, { reason });
    return res.data;
  },
};
```

Create `frontend/src/lib/api/users.ts`:
```typescript
import api from '../api';

export const usersApi = {
  getProfile: async () => {
    const res = await api.get('/users/profile');
    return res.data;
  },
  updateProfile: async (data: { name?: string; phone?: string; profileImage?: string }) => {
    const res = await api.put('/users/profile', data);
    return res.data;
  },
  addAddress: async (data: {
    label: string;
    address: string;
    addressDetail: string;
    zipCode: string;
    coordinates: { lat: number; lng: number };
    isDefault?: boolean;
  }) => {
    const res = await api.post('/users/addresses', data);
    return res.data;
  },
  updateAddress: async (id: string, data: Partial<{
    label: string;
    address: string;
    addressDetail: string;
    zipCode: string;
    coordinates: { lat: number; lng: number };
    isDefault: boolean;
  }>) => {
    const res = await api.put(`/users/addresses/${id}`, data);
    return res.data;
  },
  deleteAddress: async (id: string) => {
    const res = await api.delete(`/users/addresses/${id}`);
    return res.data;
  },
};
```

Create `frontend/src/lib/api/index.ts`:
```typescript
export { shopsApi } from './shops';
export { productsApi } from './products';
export { ordersApi } from './orders';
export { reviewsApi } from './reviews';
export { categoriesApi } from './categories';
export { notificationsApi } from './notifications';
export { adminApi } from './admin';
export { usersApi } from './users';
```

**Step 5: 커밋**

```bash
cd /Users/choeseungbin/ushwa
git add frontend/src/lib/api/
git commit -m "feat: add complete API service layer for all endpoints"
```

---

## Phase 3: 인증 화면 (웹)

### Task 3.1: 로그인 페이지

**Files:**
- Create: `frontend/src/app/(auth)/login/page.tsx`
- Create: `frontend/src/app/(auth)/layout.tsx`

**Step 1: Auth 레이아웃 생성**

Create `frontend/src/app/(auth)/layout.tsx`:
```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">🌸 어서화</h1>
          <p className="text-muted-foreground mt-2">가까운 꽃집에서 신선한 꽃을</p>
        </div>
        {children}
      </div>
    </div>
  );
}
```

**Step 2: 로그인 페이지 생성**

Create `frontend/src/app/(auth)/login/page.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth.store';

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError('');
    try {
      await login(data);
      router.push('/');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '로그인에 실패했습니다';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">로그인</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              placeholder="email@example.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              placeholder="비밀번호 입력"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full bg-primary hover:bg-primary-600" disabled={isLoading}>
            {isLoading ? '로그인 중...' : '로그인'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          계정이 없으신가요?{' '}
          <Link href="/register" className="text-primary hover:underline font-medium">
            회원가입
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
```

**Step 3: 커밋**

```bash
cd /Users/choeseungbin/ushwa
git add frontend/src/app/\(auth\)/
git commit -m "feat: add login page with form validation"
```

---

### Task 3.2: 회원가입 페이지

**Files:**
- Create: `frontend/src/app/(auth)/register/page.tsx`

**Step 1: 회원가입 페이지 생성**

Create `frontend/src/app/(auth)/register/page.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth.store';

const registerSchema = z.object({
  name: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  email: z.string().email('올바른 이메일을 입력해주세요'),
  phone: z.string().regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, '올바른 전화번호를 입력해주세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
  confirmPassword: z.string(),
  role: z.enum(['customer', 'owner']),
}).refine((data) => data.password === data.confirmPassword, {
  message: '비밀번호가 일치하지 않습니다',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const registerUser = useAuthStore((s) => s.register);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'customer' },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    setError('');
    try {
      await registerUser({
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
        role: data.role,
      });
      router.push('/');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '회원가입에 실패했습니다';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">회원가입</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 역할 선택 */}
          <div className="space-y-2">
            <Label>가입 유형</Label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedRole === 'customer'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <input type="radio" value="customer" {...register('role')} className="sr-only" />
                <div className="text-center">
                  <span className="text-2xl">🛒</span>
                  <p className="text-sm font-medium mt-1">고객</p>
                </div>
              </label>
              <label
                className={`flex items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedRole === 'owner'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <input type="radio" value="owner" {...register('role')} className="sr-only" />
                <div className="text-center">
                  <span className="text-2xl">🏪</span>
                  <p className="text-sm font-medium mt-1">꽃집 사장님</p>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">이름</Label>
            <Input id="name" placeholder="홍길동" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" placeholder="email@example.com" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">전화번호</Label>
            <Input id="phone" placeholder="010-1234-5678" {...register('phone')} />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" placeholder="6자 이상" {...register('password')} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">비밀번호 확인</Label>
            <Input id="confirmPassword" type="password" placeholder="비밀번호 재입력" {...register('confirmPassword')} />
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
          </div>

          <Button type="submit" className="w-full bg-primary hover:bg-primary-600" disabled={isLoading}>
            {isLoading ? '가입 중...' : '회원가입'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            로그인
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
```

**Step 2: 커밋**

```bash
cd /Users/choeseungbin/ushwa
git add frontend/src/app/\(auth\)/register/
git commit -m "feat: add register page with role selection and validation"
```

---

## Phase 4: 고객 화면 - 홈 & 탐색 (웹)

### Task 4.1: 공통 레이아웃 컴포넌트

**Files:**
- Create: `frontend/src/components/layout/header.tsx`
- Create: `frontend/src/components/layout/bottom-nav.tsx`
- Create: `frontend/src/app/(customer)/layout.tsx`

**Step 1:** Create header with logo, search, cart icon, user menu. Mobile-responsive with bottom navigation bar for small screens.

**Step 2:** Create customer layout wrapping header + main content + bottom nav.

**Step 3:** Commit.

---

### Task 4.2: 홈 페이지

**Files:**
- Create: `frontend/src/app/(customer)/page.tsx`
- Create: `frontend/src/components/shop/shop-card.tsx`
- Create: `frontend/src/components/product/product-card.tsx`
- Create: `frontend/src/hooks/useCategories.ts`
- Create: `frontend/src/hooks/useShops.ts`
- Create: `frontend/src/hooks/useProducts.ts`

**Step 1:** Create TanStack Query hooks for categories, shops, and featured products.

**Step 2:** Create ShopCard component (image, name, rating, delivery info).

**Step 3:** Create ProductCard component (image, name, price, shop name).

**Step 4:** Build home page with sections: hero banner, category grid, featured shops, popular products.

**Step 5:** Commit.

---

### Task 4.3: 꽃집 목록 & 검색

**Files:**
- Create: `frontend/src/app/(customer)/shops/page.tsx`
- Create: `frontend/src/components/shop/shop-filter.tsx`

**Step 1:** Create filter sidebar/panel (category, price range, sort).

**Step 2:** Build shop list page with infinite scroll, search, and filters.

**Step 3:** Commit.

---

### Task 4.4: 꽃집 상세 페이지

**Files:**
- Create: `frontend/src/app/(customer)/shops/[id]/page.tsx`
- Create: `frontend/src/components/shop/shop-info.tsx`
- Create: `frontend/src/components/review/review-card.tsx`

**Step 1:** Build shop detail page with shop info header, product tabs, review section.

**Step 2:** Commit.

---

## Phase 5: 고객 화면 - 상품 & 주문 (웹)

### Task 5.1: 상품 상세 페이지

**Files:**
- Create: `frontend/src/app/(customer)/shops/[shopId]/products/[id]/page.tsx`
- Create: `frontend/src/components/product/option-selector.tsx`
- Create: `frontend/src/components/product/addon-selector.tsx`
- Create: `frontend/src/components/product/image-gallery.tsx`

**Step 1:** Create image gallery with thumbnail navigation.

**Step 2:** Create option selector (size, color, etc.) and add-on selector.

**Step 3:** Build product detail page with gallery, info, options, add-to-cart button.

**Step 4:** Commit.

---

### Task 5.2: 장바구니 페이지

**Files:**
- Create: `frontend/src/app/(customer)/cart/page.tsx`
- Create: `frontend/src/components/order/cart-item.tsx`

**Step 1:** Build cart page with item list, quantity controls, price summary, checkout button.

**Step 2:** Commit.

---

### Task 5.3: 주문/결제 페이지

**Files:**
- Create: `frontend/src/app/(customer)/checkout/page.tsx`
- Create: `frontend/src/components/order/delivery-form.tsx`
- Create: `frontend/src/components/order/payment-selector.tsx`

**Step 1:** Create delivery info form (address, recipient, date/time, message).

**Step 2:** Create payment method selector.

**Step 3:** Build checkout page combining delivery form, order summary, payment, and submit.

**Step 4:** Commit.

---

### Task 5.4: 주문 내역 & 상세

**Files:**
- Create: `frontend/src/app/(customer)/orders/page.tsx`
- Create: `frontend/src/app/(customer)/orders/[id]/page.tsx`
- Create: `frontend/src/components/order/order-card.tsx`
- Create: `frontend/src/components/order/order-timeline.tsx`
- Create: `frontend/src/hooks/useOrders.ts`

**Step 1:** Create order hooks and order card component.

**Step 2:** Build order list page with status tabs (전체, 진행중, 완료, 취소).

**Step 3:** Build order detail page with timeline, items, delivery info, cancel button.

**Step 4:** Commit.

---

### Task 5.5: 리뷰 작성

**Files:**
- Create: `frontend/src/app/(customer)/orders/[id]/review/page.tsx`
- Create: `frontend/src/components/review/star-rating.tsx`
- Create: `frontend/src/components/review/review-form.tsx`

**Step 1:** Create star rating input component.

**Step 2:** Build review form with rating, text, photo upload.

**Step 3:** Commit.

---

### Task 5.6: 마이페이지

**Files:**
- Create: `frontend/src/app/(customer)/mypage/page.tsx`
- Create: `frontend/src/components/user/address-form.tsx`
- Create: `frontend/src/components/user/profile-form.tsx`

**Step 1:** Build mypage with profile edit, address management, order shortcut.

**Step 2:** Commit.

---

## Phase 6: 사장님 화면 (웹)

### Task 6.1: 사장님 레이아웃 & 대시보드

**Files:**
- Create: `frontend/src/app/(owner)/layout.tsx`
- Create: `frontend/src/app/(owner)/owner/page.tsx`
- Create: `frontend/src/components/layout/owner-sidebar.tsx`

**Step 1:** Create owner layout with sidebar navigation (대시보드, 주문, 상품, 가게, 리뷰, 통계).

**Step 2:** Build dashboard with today's stats cards (orders, revenue, pending orders) and recent orders list.

**Step 3:** Commit.

---

### Task 6.2: 주문 관리

**Files:**
- Create: `frontend/src/app/(owner)/owner/orders/page.tsx`
- Create: `frontend/src/components/order/owner-order-card.tsx`
- Create: `frontend/src/hooks/useSocket.ts`

**Step 1:** Create Socket.io hook for real-time order notifications.

**Step 2:** Build order management page with status tabs, accept/reject buttons, status update flow.

**Step 3:** Commit.

---

### Task 6.3: 상품 관리

**Files:**
- Create: `frontend/src/app/(owner)/owner/products/page.tsx`
- Create: `frontend/src/app/(owner)/owner/products/new/page.tsx`
- Create: `frontend/src/app/(owner)/owner/products/[id]/edit/page.tsx`
- Create: `frontend/src/components/product/product-form.tsx`

**Step 1:** Build product list page with add/edit/toggle availability.

**Step 2:** Build product form (shared for create/edit) with image upload, options, add-ons.

**Step 3:** Commit.

---

### Task 6.4: 가게 설정 & 리뷰 & 통계

**Files:**
- Create: `frontend/src/app/(owner)/owner/shop/page.tsx`
- Create: `frontend/src/app/(owner)/owner/reviews/page.tsx`
- Create: `frontend/src/app/(owner)/owner/stats/page.tsx`

**Step 1:** Build shop settings page (info, hours, delivery settings, toggle open/close).

**Step 2:** Build review management page with reply functionality.

**Step 3:** Build stats page with charts (daily/weekly/monthly revenue, popular products).

**Step 4:** Commit.

---

## Phase 7: 관리자 화면 (웹)

### Task 7.1: 관리자 레이아웃 & 대시보드

**Files:**
- Create: `frontend/src/app/(admin)/layout.tsx`
- Create: `frontend/src/app/(admin)/admin/page.tsx`
- Create: `frontend/src/components/layout/admin-sidebar.tsx`

**Step 1:** Create admin layout with sidebar.

**Step 2:** Build dashboard with platform stats (users, shops, orders, revenue).

**Step 3:** Commit.

---

### Task 7.2: 꽃집 & 사용자 & 카테고리 관리

**Files:**
- Create: `frontend/src/app/(admin)/admin/shops/page.tsx`
- Create: `frontend/src/app/(admin)/admin/users/page.tsx`
- Create: `frontend/src/app/(admin)/admin/categories/page.tsx`
- Create: `frontend/src/app/(admin)/admin/orders/page.tsx`

**Step 1:** Build shop management page (approve/reject/suspend, search, filter by status).

**Step 2:** Build user management page (list, search, status toggle).

**Step 3:** Build category management page (CRUD with drag-sort).

**Step 4:** Build order overview page (all orders, stats).

**Step 5:** Commit.

---

## Phase 8: 라우트 보호 & 미들웨어

### Task 8.1: Auth Guard 및 Role Guard

**Files:**
- Create: `frontend/src/components/auth/auth-guard.tsx`
- Create: `frontend/src/components/auth/role-guard.tsx`
- Modify: `frontend/src/app/(customer)/layout.tsx`
- Modify: `frontend/src/app/(owner)/layout.tsx`
- Modify: `frontend/src/app/(admin)/layout.tsx`

**Step 1:** Create AuthGuard component that redirects to /login if not authenticated.

**Step 2:** Create RoleGuard component that checks user role and redirects if unauthorized.

**Step 3:** Apply guards to each route group layout.

**Step 4:** Commit.

---

## Phase 9: 모바일 앱 (Expo)

### Task 9.1: 모바일 공통 인프라

**Files:**
- Create: `mobile/lib/api.ts` (Axios with SecureStore token)
- Create: `mobile/lib/api/` (same API services as web)
- Create: `mobile/stores/auth.store.ts`
- Create: `mobile/stores/cart.store.ts`
- Create: `mobile/lib/query-client.ts`

**Step 1:** Port API client from web, replacing localStorage with expo-secure-store.

**Step 2:** Port Zustand stores from web.

**Step 3:** Commit.

---

### Task 9.2: 모바일 인증 화면

**Files:**
- Create: `mobile/app/(auth)/login.tsx`
- Create: `mobile/app/(auth)/register.tsx`
- Create: `mobile/app/(auth)/_layout.tsx`

**Step 1:** Build login screen with NativeWind styling.

**Step 2:** Build register screen with role selection.

**Step 3:** Commit.

---

### Task 9.3: 모바일 메인 탭 & 홈

**Files:**
- Create: `mobile/app/(tabs)/_layout.tsx` (Tab navigator: 홈, 검색, 주문, 마이)
- Create: `mobile/app/(tabs)/index.tsx` (Home)
- Create: `mobile/app/(tabs)/search.tsx`
- Create: `mobile/app/(tabs)/orders.tsx`
- Create: `mobile/app/(tabs)/mypage.tsx`
- Create: `mobile/components/shop/ShopCard.tsx`
- Create: `mobile/components/product/ProductCard.tsx`

**Step 1:** Set up tab navigator with icons and flower theme.

**Step 2:** Build home screen (banner, categories, featured shops, products).

**Step 3:** Build search screen with filters.

**Step 4:** Build orders and mypage screens.

**Step 5:** Commit.

---

### Task 9.4: 모바일 꽃집 & 상품 상세

**Files:**
- Create: `mobile/app/shop/[id].tsx`
- Create: `mobile/app/product/[id].tsx`
- Create: `mobile/components/product/OptionSelector.tsx`

**Step 1:** Build shop detail screen with sticky header animation.

**Step 2:** Build product detail screen with bottom sheet for options.

**Step 3:** Commit.

---

### Task 9.5: 모바일 장바구니 & 결제

**Files:**
- Create: `mobile/app/cart.tsx`
- Create: `mobile/app/checkout.tsx`

**Step 1:** Build cart screen with swipe-to-delete.

**Step 2:** Build checkout screen with delivery form and payment.

**Step 3:** Commit.

---

### Task 9.6: 모바일 주문 상세 & 리뷰

**Files:**
- Create: `mobile/app/order/[id].tsx`
- Create: `mobile/app/review/[orderId].tsx`

**Step 1:** Build order detail screen with status timeline.

**Step 2:** Build review screen.

**Step 3:** Commit.

---

## Phase 10: 실시간 기능 & 마무리

### Task 10.1: Socket.io 실시간 알림

**Files:**
- Create: `frontend/src/hooks/useSocket.ts`
- Create: `frontend/src/hooks/useNotifications.ts`
- Create: `frontend/src/components/layout/notification-bell.tsx`

**Step 1:** Create Socket.io connection hook that joins user room on auth.

**Step 2:** Create notification bell component with unread count badge.

**Step 3:** Wire up real-time notifications for orders (new order, status change).

**Step 4:** Commit.

---

### Task 10.2: 반응형 디자인 확인 & 최종 정리

**Step 1:** Test all pages at mobile (375px), tablet (768px), desktop (1280px) breakpoints.

**Step 2:** Fix any responsive layout issues.

**Step 3:** Add loading skeletons for all list pages.

**Step 4:** Add empty states for all list pages.

**Step 5:** Final commit.

---

## monorepo package.json 업데이트

### Task 0 (사전 작업): workspace 설정 업데이트

`package.json` workspaces에 `mobile` 추가:
```json
{
  "workspaces": ["shared", "backend", "frontend", "mobile"]
}
```

스크립트 추가:
```json
{
  "scripts": {
    "dev:backend": "npm run dev --workspace=backend",
    "dev:frontend": "npm run dev --workspace=frontend",
    "dev:mobile": "npx expo start --workspace=mobile",
    "seed": "npm run seed --workspace=backend"
  }
}
```

---

## 실행 순서 요약

1. **Phase 1** (Task 1.1~1.3): 프로젝트 초기 설정
2. **Phase 2** (Task 2.1~2.4): 공통 인프라
3. **Phase 3** (Task 3.1~3.2): 인증 화면
4. **Phase 4** (Task 4.1~4.4): 고객 홈 & 탐색
5. **Phase 5** (Task 5.1~5.6): 고객 상품 & 주문
6. **Phase 6** (Task 6.1~6.4): 사장님 화면
7. **Phase 7** (Task 7.1~7.2): 관리자 화면
8. **Phase 8** (Task 8.1): 라우트 보호
9. **Phase 9** (Task 9.1~9.6): 모바일 앱
10. **Phase 10** (Task 10.1~10.2): 실시간 기능 & 마무리
