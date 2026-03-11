'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { useShops } from '@/hooks/useShops';
import { useFeaturedProducts } from '@/hooks/useProducts';
import { ShopCard } from '@/components/shop/shop-card';
import { ProductCard } from '@/components/product/product-card';
import { CategorySkeleton, ShopCardSkeleton, ProductCardSkeleton } from '@/components/ui/loading-skeletons';
import { EmptyState } from '@/components/ui/empty-states';

// lucide icon name -> emoji mapping
const iconToEmoji: Record<string, string> = {
  'cake': '🎂',
  'heart': '💝',
  'gift': '🎁',
  'flower-tulip': '🌷',
  'flower': '💐',
  'store': '🏪',
  'leaf': '🌿',
  'basket': '🧺',
  'sun': '☀️',
  'star': '⭐',
  'sparkles': '✨',
  'home': '🏠',
};

// Pastel gradient backgrounds for each category
const categoryColors = [
  'from-pink-100 to-pink-50',
  'from-red-100 to-red-50',
  'from-orange-100 to-orange-50',
  'from-yellow-100 to-yellow-50',
  'from-green-100 to-green-50',
  'from-teal-100 to-teal-50',
  'from-blue-100 to-blue-50',
  'from-purple-100 to-purple-50',
];

export default function HomePage() {
  const { data: categoriesData, isLoading: categoriesLoading } = useCategories();
  const { data: shopsData, isLoading: shopsLoading } = useShops({ limit: 8, sort: 'rating' });
  const { data: featuredData, isLoading: featuredLoading } = useFeaturedProducts();

  const categories = categoriesData?.data ?? [];
  const shops = shopsData?.data ?? [];
  const featuredProducts = featuredData?.data ?? [];

  return (
    <div className="max-w-6xl mx-auto animate-fade-in-up">
      {/* Hero Banner */}
      <section className="mx-5 mt-4">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#E91E63] to-[#F48FB1] p-6 md:p-10">
          <div className="relative z-10">
            <h2 className="text-[28px] md:text-[32px] font-extrabold text-white leading-tight">
              오늘의 꽃 한 송이
            </h2>
            <p className="mt-2 text-white/80 text-sm md:text-base">
              가까운 꽃집에서 신선한 꽃을 빠르게 배달해드려요
            </p>
            <Link
              href="/shops"
              className="inline-flex items-center gap-1 mt-4 bg-white text-[#E91E63] rounded-full px-5 py-2.5 text-sm font-bold hover:bg-white/90 transition-colors shadow-sm"
            >
              꽃집 둘러보기
              <ChevronRight className="size-4" />
            </Link>
          </div>
          {/* Decorative flower */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-6xl md:text-7xl opacity-30 select-none pointer-events-none">
            🌸
          </div>
          {/* Dots indicator */}
          <div className="flex gap-1.5 mt-5">
            <span className="w-5 h-1.5 rounded-full bg-white" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
          </div>
        </div>
      </section>

      {/* Category - Horizontal Scroll */}
      <section className="mt-8">
        <div className="px-5">
          <h3 className="text-[20px] font-bold text-[#111]">카테고리</h3>
        </div>
        {categoriesLoading ? (
          <div className="px-5 mt-3">
            <CategorySkeleton />
          </div>
        ) : (
          <div className="flex gap-4 px-5 mt-3 overflow-x-auto scrollbar-hide pb-2">
            {categories.map((cat, i) => (
              <Link
                key={cat._id}
                href={`/shops?category=${cat.slug}`}
                className="flex flex-col items-center gap-2 group shrink-0"
              >
                <div className={`size-14 rounded-full bg-gradient-to-b ${categoryColors[i % categoryColors.length]} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-sm`}>
                  {iconToEmoji[cat.icon ?? ''] || '🌸'}
                </div>
                <span className="text-xs text-center font-medium text-[#666] group-hover:text-[#111] transition-colors whitespace-nowrap">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Popular Shops */}
      <section className="mt-10">
        <div className="flex items-center justify-between px-5 mb-1">
          <div>
            <h3 className="text-[20px] font-bold text-[#111] flex items-center gap-1.5">
              🔥 인기 꽃집
            </h3>
            <p className="text-[13px] text-[#999] mt-0.5">지금 가장 사랑받는 꽃집이에요</p>
          </div>
          <Link
            href="/shops"
            className="flex items-center gap-0.5 text-sm text-primary font-medium hover:underline"
          >
            더보기 <ChevronRight className="size-4" />
          </Link>
        </div>
        {shopsLoading ? (
          <div className="flex gap-3 px-5 overflow-x-auto pb-2 mt-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-60">
                <ShopCardSkeleton />
              </div>
            ))}
          </div>
        ) : shops.length > 0 ? (
          <div className="flex gap-3 px-5 overflow-x-auto scrollbar-hide pb-2 mt-3">
            {shops.map((shop) => (
              <div key={shop._id} className="shrink-0 w-60">
                <ShopCard shop={shop} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🏪"
            title="아직 등록된 꽃집이 없습니다"
            description="곧 다양한 꽃집이 등록될 예정이에요"
          />
        )}
      </section>

      {/* Featured Products */}
      <section className="mt-10 px-5 pb-8">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-[20px] font-bold text-[#111] flex items-center gap-1.5">
              ✨ 추천 상품
            </h3>
            <p className="text-[13px] text-[#999] mt-0.5">특별한 날을 위한 꽃다발</p>
          </div>
          <Link
            href="/shops"
            className="flex items-center gap-0.5 text-sm text-primary font-medium hover:underline"
          >
            더보기 <ChevronRight className="size-4" />
          </Link>
        </div>
        {featuredLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {featuredProducts.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🌸"
            title="아직 추천 상품이 없습니다"
            description="곧 다양한 상품이 등록될 예정이에요"
          />
        )}
      </section>
    </div>
  );
}
