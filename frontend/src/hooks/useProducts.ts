import { useQuery } from '@tanstack/react-query';
import { productsApi, type ProductListParams } from '@/lib/api/products';

export interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  salePrice?: number;
  images: string[];
  shop: {
    _id: string;
    name: string;
    profileImage?: string;
  };
  category?: string;
  tags?: string[];
  rating: number;
  reviewCount: number;
  options?: Array<{
    name: string;
    values: Array<{ label: string; price: number }>;
  }>;
  addOns?: Array<{ name: string; price: number }>;
  isAvailable: boolean;
  createdAt: string;
}

export function useProducts(params?: ProductListParams) {
  return useQuery<{ data: { products: Product[]; total: number; page: number; totalPages: number } }>({
    queryKey: ['products', params],
    queryFn: () => productsApi.getList(params),
  });
}

export function useFeaturedProducts() {
  return useQuery<{ data: Product[] }>({
    queryKey: ['products', 'featured'],
    queryFn: () => productsApi.getFeatured(),
  });
}

export function useProductDetail(id: string) {
  return useQuery<{ data: Product }>({
    queryKey: ['product', id],
    queryFn: () => productsApi.getById(id),
    enabled: !!id,
  });
}
