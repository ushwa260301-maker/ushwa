import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/lib/api/categories';

export interface Category {
  _id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  sortOrder?: number;
}

export function useCategories() {
  return useQuery<{ data: Category[] }>({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.getAll(),
  });
}
