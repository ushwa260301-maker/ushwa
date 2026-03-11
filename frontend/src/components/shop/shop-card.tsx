'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Clock } from 'lucide-react';
import type { Shop } from '@/hooks/useShops';

interface ShopCardProps {
  shop: Shop;
}

export function ShopCard({ shop }: ShopCardProps) {
  const rating = shop.rating?.average ?? 0;
  const reviewCount = shop.rating?.count ?? 0;
  const deliveryFee = shop.deliveryInfo?.fee ?? 0;
  const estimatedTime = shop.deliveryInfo?.estimatedTime;

  return (
    <Link href={`/shops/${shop._id}`} className="block group">
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden transition-shadow hover:shadow-md">
        {/* Shop image */}
        <div className="relative aspect-[16/10] bg-muted overflow-hidden">
          {shop.profileImage ? (
            <Image
              src={shop.profileImage}
              alt={shop.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/5">
              <span className="text-4xl">🌸</span>
            </div>
          )}
          {!shop.isOpen && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white font-medium text-sm">준비중</span>
            </div>
          )}
        </div>

        {/* Shop info */}
        <div className="p-3">
          <h3 className="font-semibold text-sm truncate">{shop.name}</h3>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm">⭐ {rating.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">
              ({reviewCount})
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <MapPin className="size-3" />
              배달비 {deliveryFee.toLocaleString()}원
            </span>
            {estimatedTime && (
              <span className="flex items-center gap-0.5">
                <Clock className="size-3" />
                {estimatedTime}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
