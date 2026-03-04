'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Shop } from '@/hooks/useShops';

interface ShopCardProps {
  shop: Shop;
}

export function ShopCard({ shop }: ShopCardProps) {
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
            <span className="text-sm">⭐ {shop.rating.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">
              ({shop.reviewCount})
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <MapPin className="size-3" />
              배달비 {shop.deliveryFee.toLocaleString()}원
            </span>
            {shop.estimatedDeliveryTime && (
              <span className="flex items-center gap-0.5">
                <Clock className="size-3" />
                {shop.estimatedDeliveryTime}
              </span>
            )}
          </div>
          {shop.tags && shop.tags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {shop.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
