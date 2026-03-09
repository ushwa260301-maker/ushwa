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
};
