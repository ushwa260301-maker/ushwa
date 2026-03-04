'use client';

import { use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Star, MapPin } from 'lucide-react';
import { useShopDetail, useShopProducts, useShopReviews } from '@/hooks/useShops';
import { ShopInfo } from '@/components/shop/shop-info';
import { ProductCard } from '@/components/product/product-card';
import { ReviewCard } from '@/components/review/review-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Product } from '@/hooks/useProducts';
import type { Review } from '@/components/review/review-card';

export default function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: shopData, isLoading: shopLoading } = useShopDetail(id);
  const { data: productsData, isLoading: productsLoading } = useShopProducts(id);
  const { data: reviewsData, isLoading: reviewsLoading } = useShopReviews(id);

  const shop = shopData?.data;
  const products: Product[] = productsData?.data?.products ?? [];
  const reviews: Review[] = reviewsData?.data?.reviews ?? [];

  if (shopLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-4xl mb-4">😢</span>
        <p className="text-lg font-medium">꽃집을 찾을 수 없습니다</p>
        <Link href="/shops" className="text-primary text-sm mt-2 hover:underline">
          꽃집 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <div className="px-4 py-3">
        <Link
          href="/shops"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          꽃집 목록
        </Link>
      </div>

      {/* Shop Header */}
      <div className="px-4">
        <div className="relative aspect-[2.5/1] rounded-2xl overflow-hidden bg-muted">
          {shop.coverImage || shop.profileImage ? (
            <Image
              src={shop.coverImage || shop.profileImage!}
              alt={shop.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 896px"
              priority
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-primary/20 to-primary/5">
              <span className="text-6xl">🌸</span>
            </div>
          )}
          {!shop.isOpen && (
            <div className="absolute top-3 right-3">
              <Badge variant="destructive">준비중</Badge>
            </div>
          )}
        </div>

        <div className="mt-4">
          <h1 className="text-2xl font-bold">{shop.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1">
              <Star className="size-4 text-yellow-400 fill-yellow-400" />
              <span className="font-medium">{shop.rating.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">
                리뷰 {shop.reviewCount}개
              </span>
            </div>
            {shop.address && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-sm text-muted-foreground flex items-center gap-0.5">
                  <MapPin className="size-3" />
                  {shop.address}
                </span>
              </>
            )}
          </div>
          {shop.description && (
            <p className="text-sm text-muted-foreground mt-2">{shop.description}</p>
          )}
          {shop.tags && shop.tags.length > 0 && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {shop.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 px-4 pb-8">
        <Tabs defaultValue="menu">
          <TabsList className="w-full">
            <TabsTrigger value="menu" className="flex-1">
              메뉴
            </TabsTrigger>
            <TabsTrigger value="info" className="flex-1">
              정보
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex-1">
              리뷰 ({shop.reviewCount})
            </TabsTrigger>
          </TabsList>

          {/* Menu Tab */}
          <TabsContent value="menu" className="mt-4">
            {productsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="aspect-square rounded-xl" />
                    <Skeleton className="h-3 w-16 mt-3" />
                    <Skeleton className="h-4 w-24 mt-1" />
                    <Skeleton className="h-4 w-20 mt-1.5" />
                  </div>
                ))}
              </div>
            ) : products.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {products.map((product) => (
                  <ProductCard key={product._id} product={product} />
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground text-sm">
                등록된 상품이 없습니다
              </div>
            )}
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info" className="mt-4">
            <ShopInfo shop={shop} />
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="mt-4">
            {reviewsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2 py-4">
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-8 rounded-full" />
                      <div>
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-24 mt-1" />
                      </div>
                    </div>
                    <Skeleton className="h-12 w-full" />
                  </div>
                ))}
              </div>
            ) : reviews.length > 0 ? (
              <div>
                {reviews.map((review) => (
                  <ReviewCard key={review._id} review={review} />
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground text-sm">
                아직 리뷰가 없습니다
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
