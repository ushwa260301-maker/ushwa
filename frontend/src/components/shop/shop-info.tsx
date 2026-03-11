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
    <div className="space-y-4">
      {/* Address */}
      {shop.address && (
        <div className="flex items-start gap-3">
          <MapPin className="size-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">주소</p>
            <p className="text-sm text-muted-foreground">
              {shop.address}
              {shop.addressDetail && ` ${shop.addressDetail}`}
            </p>
          </div>
        </div>
      )}

      {/* Phone */}
      {shop.phone && (
        <div className="flex items-start gap-3">
          <Phone className="size-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">전화번호</p>
            <p className="text-sm text-muted-foreground">{shop.phone}</p>
          </div>
        </div>
      )}

      {/* Operating Hours */}
      {shop.operatingHours && shop.operatingHours.length > 0 && (
        <div className="flex items-start gap-3">
          <Clock className="size-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">영업시간</p>
            <div className="mt-1 space-y-0.5">
              {shop.operatingHours.map((hours) => (
                <div key={hours.day} className="flex items-center gap-2 text-sm">
                  <span className="w-8 text-muted-foreground">{hours.day}</span>
                  {hours.isOpen ? (
                    <span>{hours.open} - {hours.close}</span>
                  ) : (
                    <span className="text-muted-foreground">휴무</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delivery info */}
      <div className="rounded-xl bg-muted/50 p-4 space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-1.5">
          <Truck className="size-4" />
          배달 정보
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">배달비</span>
            <p className="font-medium">{deliveryFee.toLocaleString()}원</p>
          </div>
          <div>
            <span className="text-muted-foreground">최소주문</span>
            <p className="font-medium">{minOrder.toLocaleString()}원</p>
          </div>
          {estimatedTime && (
            <div>
              <span className="text-muted-foreground">예상 배달시간</span>
              <p className="font-medium">{estimatedTime}</p>
            </div>
          )}
          {freeOver && (
            <div>
              <span className="text-muted-foreground">무료배달</span>
              <p className="font-medium">{freeOver.toLocaleString()}원 이상</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
