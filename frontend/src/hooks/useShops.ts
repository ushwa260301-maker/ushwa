import { useQuery } from '@tanstack/react-query';
import { shopsApi, type ShopListParams } from '@/lib/api/shops';

export interface Shop {
  _id: string;
  name: string;
  description?: string;
  profileImage?: string;
  images?: string[];
  owner: { _id: string; name: string } | string;
  phone?: string;
  address?: string;
  addressDetail?: string;
  location?: { type: string; coordinates: number[] };
  categories?: string[];
  operatingHours?: {
    day: string;
    open: string;
    close: string;
    isOpen: boolean;
  }[];
  deliveryInfo?: {
    isAvailable: boolean;
    fee: number;
    freeDeliveryOver: number;
    minOrderAmount: number;
    estimatedTime: string;
    maxDistance: number;
  };
  rating: { average: number; count: number };
  status?: string;
  isOpen: boolean;
  isActive?: boolean;
  createdAt: string;
}

export function useShops(params?: ShopListParams) {
  return useQuery<{
    data: Shop[];
    pagination?: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      limit: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }>({
    queryKey: ['shops', params],
    queryFn: () => shopsApi.getList(params),
  });
}

export function useShopDetail(id: string) {
  return useQuery<{ data: Shop }>({
    queryKey: ['shop', id],
    queryFn: () => shopsApi.getById(id),
    enabled: !!id,
  });
}

export function useShopProducts(id: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['shop-products', id, params],
    queryFn: () => shopsApi.getProducts(id, params),
    enabled: !!id,
  });
}

export function useShopReviews(id: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['shop-reviews', id, params],
    queryFn: () => shopsApi.getReviews(id, params),
    enabled: !!id,
  });
}
