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
