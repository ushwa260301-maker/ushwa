'use client';

import { use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Star, MapPin, Clock, Truck } from 'lucide-react';
import { useShopDetail, useShopProducts, useShopReviews } from '@/hooks/useShops';
import { ShopInfo } from '@/components/shop/shop-info';
import { ProductCard } from '@/components/product/product-card';
import { ReviewCard } from '@/components/review/review-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShopDetailHeaderSkeleton, ProductCardSkeleton, ReviewCardSkeleton } from '@/components/ui/loading-skeletons';
import { EmptyState } from '@/components/ui/empty-states';
import type { Product } from '@/hooks/useProducts';
import type { Review } from '@/components/review/review-card';

export default function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: shopData, isLoading: shopLoading } = useShopDetail(id);
  const { data: productsData, isLoading: productsLoading } = useShopProducts(id);
  const { data: reviewsData, isLoading: reviewsLoading } = useShopReviews(id);

  const shop = shopData?.data;
  const products: Product[] = productsData?.data ?? [];
  const reviews: Review[] = reviewsData?.data ?? [];

  if (shopLoading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6 space-y-6">
        <ShopDetailHeaderSkeleton />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <EmptyState
        icon="😢"
        title="꽃집을 찾을 수 없습니다"
        description="요청하신 꽃집 정보를 찾을 수 없어요"
        action={
          <Link href="/shops" className="text-primary text-sm hover:underline font-medium">
            꽃집 목록으로 돌아가기
          </Link>
        }
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in-up">
      {/* Hero Image - Full width */}
      <div className="relative">
        <div className="relative aspect-[2/1] bg-[#F5F5F5] overflow-hidden">
          {shop.profileImage ? (
            <Image
              src={shop.profileImage}
              alt={shop.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 896px"
              priority
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-[#E91E63]/20 to-[#F48FB1]/20">
              <span className="text-7xl">🌸</span>
            </div>
          )}
          {/* Bottom gradient */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
        {/* Back button */}
        <Link
          href="/shops"
          className="absolute top-3 left-3 flex items-center justify-center size-9 rounded-full bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white transition-colors"
        >
          <ArrowLeft className="size-5 text-[#111]" />
        </Link>
      </div>

      {/* Shop Info Card - Overlapping */}
      <div className="relative mx-5 -mt-10 bg-white rounded-2xl shadow-lg p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold text-[#111]">{shop.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex items-center gap-1">
                <Star className="size-4 text-yellow-400 fill-yellow-400" />
                <span className="font-bold text-[15px] text-[#111]">{(shop.rating?.average ?? 0).toFixed(1)}</span>
              </div>
              <span className="text-[#999]">·</span>
              <span className="text-sm text-[#666]">
                리뷰 {shop.rating?.count ?? 0}개
              </span>
            </div>
          </div>
          {/* Status */}
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            shop.isOpen
              ? 'bg-[#E8F5E9] text-[#00C853]'
              : 'bg-[#F5F5F5] text-[#999]'
          }`}>
            {shop.isOpen ? '영업중' : '준비중'}
          </span>
        </div>

        {shop.address && (
          <p className="text-sm text-[#666] mt-2.5 flex items-center gap-1">
            <MapPin className="size-3.5 shrink-0" />
            {shop.address}
          </p>
        )}

        {shop.description && (
          <p className="text-sm text-[#999] mt-2">{shop.description}</p>
        )}

        {/* Delivery Info Badges */}
        {shop.deliveryInfo && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-[#F5F5F5] text-[#666] text-xs px-2.5 py-1 rounded-full">
              <Truck className="size-3" />
              배달비 {(shop.deliveryInfo.fee ?? 0).toLocaleString()}원
            </span>
            <span className="inline-flex items-center gap-1 bg-[#F5F5F5] text-[#666] text-xs px-2.5 py-1 rounded-full">
              최소주문 {(shop.deliveryInfo.minOrderAmount ?? 0).toLocaleString()}원
            </span>
            {shop.deliveryInfo.estimatedTime && (
              <span className="inline-flex items-center gap-1 bg-[#F5F5F5] text-[#666] text-xs px-2.5 py-1 rounded-full">
                <Clock className="size-3" />
                {shop.deliveryInfo.estimatedTime}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs - Underline Style */}
      <div className="mt-6 px-5 pb-8">
        <Tabs defaultValue="menu">
          <TabsList className="w-full bg-transparent border-b border-[#F0F0F0] rounded-none p-0 h-auto">
            <TabsTrigger
              value="menu"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary font-semibold py-3 text-[15px]"
            >
              메뉴
            </TabsTrigger>
            <TabsTrigger
              value="info"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary font-semibold py-3 text-[15px]"
            >
              정보
            </TabsTrigger>
            <TabsTrigger
              value="reviews"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary font-semibold py-3 text-[15px]"
            >
              리뷰 ({shop.rating?.count ?? 0})
            </TabsTrigger>
          </TabsList>

          {/* Menu Tab */}
          <TabsContent value="menu" className="mt-5">
            {productsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : products.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {products.map((product) => (
                  <ProductCard key={product._id} product={product} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="🌸"
                title="등록된 상품이 없습니다"
                description="아직 등록된 상품이 없어요"
              />
            )}
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info" className="mt-5">
            <ShopInfo shop={shop} />
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="mt-5">
            {reviewsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <ReviewCardSkeleton key={i} />
                ))}
              </div>
            ) : reviews.length > 0 ? (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <ReviewCard key={review._id} review={review} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="💬"
                title="아직 리뷰가 없습니다"
                description="첫 번째 리뷰를 작성해보세요"
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
