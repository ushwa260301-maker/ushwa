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
