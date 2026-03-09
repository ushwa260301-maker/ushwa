import api from '../api';

export const categoriesApi = {
  getAll: async () => {
    const res = await api.get('/categories');
    return res.data;
  },
};
