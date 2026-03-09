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
