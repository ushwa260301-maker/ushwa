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
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden transition-shadow hover:shadow-md">
        {/* Product image */}
        <div className="relative aspect-square bg-muted overflow-hidden">
          {product.images && product.images.length > 0 ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/5">
              <span className="text-4xl">💐</span>
            </div>
          )}
          {!product.isAvailable && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white font-medium text-sm">품절</span>
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="p-3">
          <p className="text-xs text-muted-foreground truncate">
            {typeof product.shop === 'object' ? product.shop.name : ''}
          </p>
          <h3 className="font-medium text-sm mt-0.5 truncate">{product.name}</h3>
          <div className="flex items-center gap-1.5 mt-1.5">
            {hasDiscount && (
              <span className="text-sm font-bold text-primary">{discountPercent}%</span>
            )}
            <span className="text-sm font-bold">{displayPrice.toLocaleString()}원</span>
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through">
                {product.price.toLocaleString()}원
              </span>
            )}
          </div>
          {product.rating > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs">⭐ {product.rating.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">
                ({product.reviewCount})
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
