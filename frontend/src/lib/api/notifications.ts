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
