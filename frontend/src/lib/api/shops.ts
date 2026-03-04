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
