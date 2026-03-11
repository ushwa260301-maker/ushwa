'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useShops } from '@/hooks/useShops';
import { useCategories } from '@/hooks/useCategories';
import { ShopCard } from '@/components/shop/shop-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShopCardSkeleton } from '@/components/ui/loading-skeletons';
import { EmptyState } from '@/components/ui/empty-states';
import { Skeleton } from '@/components/ui/skeleton';
import type { ShopListParams } from '@/lib/api/shops';

const iconToEmoji: Record<string, string> = {
  'cake': '🎂', 'heart': '💝', 'gift': '🎁', 'flower-tulip': '🌷',
  'flower': '💐', 'store': '🏪', 'leaf': '🌿', 'basket': '🧺',
  'sun': '☀️', 'star': '⭐', 'sparkles': '✨', 'home': '🏠',
};

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

  const shops = shopsData?.data ?? [];
  const totalPages = shopsData?.pagination?.totalPages ?? 1;
  const categories = categoriesData?.data ?? [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="max-w-6xl mx-auto px-5 py-5 animate-fade-in-up">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#999]" />
        <Input
          placeholder="꽃집 이름으로 검색"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          className="pl-10 pr-4 h-11 rounded-full bg-[#F5F5F5] border-0 text-sm placeholder:text-[#999] focus-visible:ring-primary/30"
        />
      </form>

      {/* Category filter chips - horizontal scroll pill style */}
      {categories.length > 0 && (
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => { setSelectedCategory(''); setPage(1); }}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === ''
                ? 'bg-[#E91E63] text-white'
                : 'bg-[#F5F5F5] text-[#666] hover:bg-[#EFEFEF]'
            }`}
          >
            전체
          </button>
          {categories.map((cat) => (
            <button
              key={cat._id}
              onClick={() => { setSelectedCategory(cat.slug); setPage(1); }}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === cat.slug
                  ? 'bg-[#E91E63] text-white'
                  : 'bg-[#F5F5F5] text-[#666] hover:bg-[#EFEFEF]'
              }`}
            >
              {iconToEmoji[cat.icon ?? ''] || '🌸'} {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Sort options */}
      <div className="flex items-center gap-1 mt-4">
        {sortOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => { setSelectedSort(option.value); setPage(1); }}
            className={`text-sm px-3 py-1 rounded-md transition-colors ${
              selectedSort === option.value
                ? 'text-[#111] font-bold'
                : 'text-[#999] hover:text-[#666]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Shop grid */}
      <div className="mt-5">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ShopCardSkeleton key={i} />
            ))}
          </div>
        ) : shops.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                  className="rounded-full px-5"
                >
                  이전
                </Button>
                <span className="text-sm text-[#999] font-medium mx-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-full px-5"
                >
                  다음
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon="🏪"
            title="등록된 꽃집이 없습니다"
            description="아직 꽃집이 등록되지 않았어요. 다른 검색어나 필터를 시도해보세요."
          />
        )}
      </div>
    </div>
  );
}

function ShopsPageFallback() {
  return (
    <div className="max-w-6xl mx-auto px-5 py-5">
      <Skeleton className="h-11 rounded-full" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <ShopCardSkeleton key={i} />
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
