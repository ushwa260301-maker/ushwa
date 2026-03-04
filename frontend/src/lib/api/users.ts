import api from '../api';

export const usersApi = {
  getProfile: async () => {
    const res = await api.get('/users/profile');
    return res.data;
  },
  updateProfile: async (data: { name?: string; phone?: string; profileImage?: string }) => {
    const res = await api.put('/users/profile', data);
    return res.data;
  },
  addAddress: async (data: {
    label: string;
    address: string;
    addressDetail: string;
    zipCode: string;
    coordinates: { lat: number; lng: number };
    isDefault?: boolean;
  }) => {
    const res = await api.post('/users/addresses', data);
    return res.data;
  },
  updateAddress: async (id: string, data: Partial<{
    label: string;
    address: string;
    addressDetail: string;
    zipCode: string;
    coordinates: { lat: number; lng: number };
    isDefault: boolean;
  }>) => {
    const res = await api.put(`/users/addresses/${id}`, data);
    return res.data;
  },
  deleteAddress: async (id: string) => {
    const res = await api.delete(`/users/addresses/${id}`);
    return res.data;
  },
};
