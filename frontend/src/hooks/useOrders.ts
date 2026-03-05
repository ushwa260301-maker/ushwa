import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api/orders';

export interface OrderItem {
  product: {
    _id: string;
    name: string;
    images?: string[];
    price: number;
  };
  quantity: number;
  price: number;
  selectedOptions?: Array<{ name: string; value: string; price: number }>;
  selectedAddOns?: Array<{ name: string; price: number }>;
}

export interface Order {
  _id: string;
  orderNumber: string;
  user: string;
  shop: {
    _id: string;
    name: string;
    profileImage?: string;
  };
  items: OrderItem[];
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
    method: string;
    amount: number;
  };
  status: string;
  statusHistory?: Array<{
    status: string;
    timestamp: string;
    note?: string;
  }>;
  totalAmount: number;
  deliveryFee: number;
  hasReview?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useMyOrders(params?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  return useQuery<{
    data: { orders: Order[]; total: number; page: number; totalPages: number };
  }>({
    queryKey: ['my-orders', params],
    queryFn: () => ordersApi.getMyOrders(params),
  });
}

export function useOrderDetail(id: string) {
  return useQuery<{ data: Order }>({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getById(id),
    enabled: !!id,
  });
}
