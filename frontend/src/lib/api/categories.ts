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
