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
