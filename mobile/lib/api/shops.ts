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
};
