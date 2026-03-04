'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useShops } from '@/hooks/useShops';
import { useCategories } from '@/hooks/useCategories';
import { ShopCard } from '@/components/shop/shop-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ShopListParams } from '@/lib/api/shops';

const sortOptions = [
  { value: 'rating', label: '평점순' },
  { value: 'name', label: '이름순' },
  { value: 'distance', label: '거리순' },
] as const;

function ShopsContent() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get('category') || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedSort, setSelectedSort] = useState<ShopListParams['sort']>('rating');
  const [page, setPage] = useState(1);

  const params = useMemo<ShopListParams>(
    () => ({
      page,
      limit: 12,
      search: searchQuery || undefined,
      category: selectedCategory || undefined,
      sort: selectedSort,
    }),
    [page, searchQuery, selectedCategory, selectedSort]
  );

  const { data: shopsData, isLoading } = useShops(params);
  const { data: categoriesData } = useCategories();

  const shops = shopsData?.data?.shops ?? [];
  const totalPages = shopsData?.data?.totalPages ?? 1;
  const categories = categoriesData?.data ?? [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="꽃집 이름으로 검색"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          className="pl-9 pr-4 h-11 rounded-full bg-white"
        />
      </form>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
          <Badge
            variant={selectedCategory === '' ? 'default' : 'outline'}
            className="cursor-pointer shrink-0"
            onClick={() => {
              setSelectedCategory('');
              setPage(1);
            }}
          >
            전체
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat._id}
              variant={selectedCategory === cat.slug ? 'default' : 'outline'}
              className="cursor-pointer shrink-0"
              onClick={() => {
                setSelectedCategory(cat.slug);
                setPage(1);
              }}
            >
              {cat.icon || ''} {cat.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Sort options */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          {sortOptions.map((option) => (
            <Button
              key={option.value}
              variant={selectedSort === option.value ? 'default' : 'ghost'}
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                setSelectedSort(option.value);
                setPage(1);
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Shop grid */}
      <div className="mt-6">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[16/10] rounded-xl" />
                <Skeleton className="h-4 w-32 mt-3" />
                <Skeleton className="h-3 w-20 mt-2" />
                <Skeleton className="h-3 w-28 mt-1" />
              </div>
            ))}
          </div>
        ) : shops.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {shops.map((shop) => (
                <ShopCard key={shop._id} shop={shop} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  이전
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  다음
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-4xl mb-4">🔍</span>
            <p className="text-muted-foreground">검색 결과가 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">
              다른 검색어나 필터를 시도해보세요
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ShopsPageFallback() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <Skeleton className="h-11 rounded-full" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[16/10] rounded-xl" />
            <Skeleton className="h-4 w-32 mt-3" />
            <Skeleton className="h-3 w-20 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ShopsPage() {
  return (
    <Suspense fallback={<ShopsPageFallback />}>
      <ShopsContent />
    </Suspense>
  );
}
