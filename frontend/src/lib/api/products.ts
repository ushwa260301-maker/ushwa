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
