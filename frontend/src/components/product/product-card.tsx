'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/hooks/useProducts';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const hasDiscount = product.salePrice && product.salePrice < product.price;
  const displayPrice = hasDiscount ? product.salePrice! : product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.price - product.salePrice!) / product.price) * 100)
    : 0;

  const shopId = typeof product.shop === 'object' ? product.shop._id : product.shop;

  return (
    <Link href={`/shops/${shopId}/products/${product._id}`} className="block group">
      <div className="bg-white rounded-xl overflow-hidden card-hover-lift">
        {/* Product image */}
        <div className="relative aspect-square bg-[#F5F5F5] overflow-hidden rounded-xl">
          {product.images && product.images.length > 0 ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-50 to-pink-100">
              <span className="text-4xl">💐</span>
            </div>
          )}
          {/* Discount badge - top left */}
          {hasDiscount && (
            <span className="absolute top-2 left-2 bg-[#E91E63] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {discountPercent}%
            </span>
          )}
          {/* Sold out overlay */}
          {!product.isAvailable && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
              <span className="text-white font-semibold text-sm">품절</span>
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="pt-3 pb-1">
          <p className="text-xs text-[#999] truncate">
            {typeof product.shop === 'object' ? product.shop.name : ''}
          </p>
          <h3 className="font-semibold text-[14px] text-[#111] mt-0.5 line-clamp-2 leading-snug">
            {product.name}
          </h3>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            {hasDiscount && (
              <span className="text-[16px] font-bold text-primary">{discountPercent}%</span>
            )}
            <span className="text-[16px] font-bold text-[#111]">
              {displayPrice.toLocaleString()}원
            </span>
          </div>
          {hasDiscount && (
            <span className="text-xs text-[#999] line-through">
              {product.price.toLocaleString()}원
            </span>
          )}
          {product.rating > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-xs">⭐</span>
              <span className="text-xs text-[#666]">{product.rating.toFixed(1)}</span>
              <span className="text-xs text-[#999]">
                ({product.reviewCount})
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
