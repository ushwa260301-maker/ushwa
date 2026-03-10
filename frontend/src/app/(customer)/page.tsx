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
import { Button } from '@/components/ui/button';

const categoryIcons: Record<string, string> = {
  bouquet: '💐',
  basket: '🧺',
  plant: '🪴',
  wedding: '💒',
  birthday: '🎂',
  sympathy: '🕊️',
  anniversary: '💝',
  wreath: '🌿',
};

export default function HomePage() {
  const { data: categoriesData, isLoading: categoriesLoading } = useCategories();
  const { data: shopsData, isLoading: shopsLoading } = useShops({ limit: 8, sort: 'rating' });
  const { data: featuredData, isLoading: featuredLoading } = useFeaturedProducts();

  const categories = categoriesData?.data ?? [];
  const shops = shopsData?.data?.shops ?? [];
  const featuredProducts = featuredData?.data ?? [];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero Banner */}
      <section className="mx-4 mt-4 rounded-2xl bg-gradient-to-r from-primary/90 to-primary/70 p-6 md:p-10 text-white">
        <h2 className="text-2xl md:text-3xl font-bold">
          오늘도 꽃 한 송이,
          <br />
          마음을 전해보세요 🌷
        </h2>
        <p className="mt-2 text-white/80 text-sm md:text-base">
          가까운 꽃집에서 신선한 꽃을 빠르게 배달해드려요
        </p>
        <Link href="/shops">
          <Button
            variant="secondary"
            className="mt-4 bg-white text-primary hover:bg-white/90"
          >
            꽃집 둘러보기
          </Button>
        </Link>
      </section>

      {/* Category Grid */}
      <section className="px-4 mt-8">
        <h3 className="text-lg font-bold mb-4">카테고리</h3>
        {categoriesLoading ? (
          <CategorySkeleton />
        ) : (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
            {categories.map((cat) => (
              <Link
                key={cat._id}
                href={`/shops?category=${cat.slug}`}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="size-14 rounded-full bg-primary/5 flex items-center justify-center text-2xl group-hover:bg-primary/10 transition-colors">
                  {cat.icon || categoryIcons[cat.slug] || '🌸'}
                </div>
                <span className="text-xs text-center font-medium">{cat.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Popular Shops */}
      <section className="mt-10">
        <div className="flex items-center justify-between px-4 mb-4">
          <h3 className="text-lg font-bold">인기 꽃집</h3>
          <Link
            href="/shops"
            className="flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            더보기 <ChevronRight className="size-4" />
          </Link>
        </div>
        {shopsLoading ? (
          <div className="flex gap-4 px-4 overflow-x-auto pb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-56">
                <ShopCardSkeleton />
              </div>
            ))}
          </div>
        ) : shops.length > 0 ? (
          <div className="flex gap-4 px-4 overflow-x-auto pb-2 scrollbar-hide">
            {shops.map((shop) => (
              <div key={shop._id} className="shrink-0 w-56">
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
      <section className="mt-10 px-4 pb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">추천 상품</h3>
          <Link
            href="/shops"
            className="flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            더보기 <ChevronRight className="size-4" />
          </Link>
        </div>
        {featuredLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
