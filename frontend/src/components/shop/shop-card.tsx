'use client';

import Link from 'next/link';
import Image from 'next/image';
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
      <div className="bg-white rounded-xl overflow-hidden card-hover-lift shadow-sm">
        {/* Shop image with overlay gradient */}
        <div className="relative aspect-[4/3] bg-[#F5F5F5] overflow-hidden">
          {shop.profileImage ? (
            <Image
              src={shop.profileImage}
              alt={shop.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-50 to-pink-100">
              <span className="text-5xl">🌸</span>
            </div>
          )}
          {/* Bottom gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
          {/* Status badges */}
          <div className="absolute top-2.5 left-2.5 flex gap-1.5">
            {shop.isOpen ? (
              <span className="bg-[#00C853] text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
                영업중
              </span>
            ) : (
              <span className="bg-[#666] text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
                준비중
              </span>
            )}
          </div>
          {!shop.isOpen && (
            <div className="absolute inset-0 bg-black/30" />
          )}
        </div>

        {/* Shop info */}
        <div className="p-3.5">
          <h3 className="font-semibold text-[15px] text-[#111] truncate">{shop.name}</h3>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm">⭐</span>
            <span className="text-sm font-medium text-[#111]">{rating.toFixed(1)}</span>
            <span className="text-xs text-[#999]">
              ({reviewCount})
            </span>
          </div>
          <p className="text-xs text-[#999] mt-1.5 truncate">
            {estimatedTime && `배달 ${estimatedTime}`}
            {estimatedTime && deliveryFee > 0 && ' · '}
            {deliveryFee > 0 && `배달비 ${deliveryFee.toLocaleString()}원`}
            {deliveryFee === 0 && '무료배달'}
          </p>
        </div>
      </div>
    </Link>
  );
}
