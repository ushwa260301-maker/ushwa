import { useQuery } from '@tanstack/react-query';
import { shopsApi, type ShopListParams } from '@/lib/api/shops';

export interface Shop {
  _id: string;
  name: string;
  description?: string;
  profileImage?: string;
  coverImage?: string;
  owner: string;
  phone?: string;
  address?: string;
  addressDetail?: string;
  coordinates?: { lat: number; lng: number };
  categories?: string[];
  tags?: string[];
  rating: number;
  reviewCount: number;
  deliveryFee: number;
  minOrderAmount: number;
  estimatedDeliveryTime?: string;
  operatingHours?: {
    day: string;
    open: string;
    close: string;
    isOpen: boolean;
  }[];
  isOpen: boolean;
  createdAt: string;
}

export function useShops(params?: ShopListParams) {
  return useQuery<{ data: { shops: Shop[]; total: number; page: number; totalPages: number } }>({
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
