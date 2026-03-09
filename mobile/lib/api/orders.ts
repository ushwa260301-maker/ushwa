import api from '../api';

export interface CreateOrderData {
  shop: string;
  items: Array<{
    product: string;
    quantity: number;
    selectedOptions?: Array<{ name: string; value: string; price: number }>;
    selectedAddOns?: Array<{ name: string; price: number }>;
  }>;
  delivery: {
    type: 'delivery' | 'pickup';
    address: string;
    addressDetail: string;
    recipientName: string;
    recipientPhone: string;
    requestedDate?: string;
    requestedTime?: string;
    message?: string;
  };
  payment: {
    method: 'card' | 'transfer' | 'cash';
  };
}

export const ordersApi = {
  create: async (data: CreateOrderData) => {
    const res = await api.post('/orders', data);
    return res.data;
  },
  getMyOrders: async (params?: { page?: number; limit?: number; status?: string }) => {
    const res = await api.get('/orders/my', { params });
    return res.data;
  },
  cancel: async (id: string) => {
    const res = await api.put(`/orders/${id}/cancel`);
    return res.data;
  },
  getById: async (id: string) => {
    const res = await api.get(`/orders/${id}`);
    return res.data;
  },
};
