'use client';

import { MapPin, Phone, Clock, Truck } from 'lucide-react';
import type { Shop } from '@/hooks/useShops';

interface ShopInfoProps {
  shop: Shop;
}

export function ShopInfo({ shop }: ShopInfoProps) {
  const deliveryFee = shop.deliveryInfo?.fee ?? 0;
  const minOrder = shop.deliveryInfo?.minOrderAmount ?? 0;
  const estimatedTime = shop.deliveryInfo?.estimatedTime;
  const freeOver = shop.deliveryInfo?.freeDeliveryOver;

  return (
    <div className="space-y-5">
      {/* Address */}
      {shop.address && (
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
            <MapPin className="size-4 text-[#666]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111]">주소</p>
            <p className="text-sm text-[#666] mt-0.5">
              {shop.address}
              {shop.addressDetail && ` ${shop.addressDetail}`}
            </p>
          </div>
        </div>
      )}

      {/* Phone */}
      {shop.phone && (
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
            <Phone className="size-4 text-[#666]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111]">전화번호</p>
            <p className="text-sm text-[#666] mt-0.5">{shop.phone}</p>
          </div>
        </div>
      )}

      {/* Operating Hours */}
      {shop.operatingHours && shop.operatingHours.length > 0 && (
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
            <Clock className="size-4 text-[#666]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111]">영업시간</p>
            <div className="mt-1.5 space-y-1">
              {shop.operatingHours.map((hours) => (
                <div key={hours.day} className="flex items-center gap-3 text-sm">
                  <span className="w-8 text-[#999] font-medium">{hours.day}</span>
                  {hours.isOpen ? (
                    <span className="text-[#666]">{hours.open} - {hours.close}</span>
                  ) : (
                    <span className="text-[#999]">휴무</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delivery info card */}
      <div className="rounded-2xl bg-[#FAFAFA] p-5 space-y-3">
        <h4 className="text-sm font-bold text-[#111] flex items-center gap-2">
          <Truck className="size-4 text-primary" />
          배달 정보
        </h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-[#999] text-xs">배달비</span>
            <p className="font-bold text-[#111] mt-0.5">{deliveryFee.toLocaleString()}원</p>
          </div>
          <div>
            <span className="text-[#999] text-xs">최소주문</span>
            <p className="font-bold text-[#111] mt-0.5">{minOrder.toLocaleString()}원</p>
          </div>
          {estimatedTime && (
            <div>
              <span className="text-[#999] text-xs">예상 배달시간</span>
              <p className="font-bold text-[#111] mt-0.5">{estimatedTime}</p>
            </div>
          )}
          {freeOver && (
            <div>
              <span className="text-[#999] text-xs">무료배달</span>
              <p className="font-bold text-primary mt-0.5">{freeOver.toLocaleString()}원 이상</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
