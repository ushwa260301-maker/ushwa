'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/stores/cart.store';
import { CartItem } from '@/components/order/cart-item';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);
  const getDeliveryFee = useCartStore((s) => s.getDeliveryFee);
  const getItemCount = useCartStore((s) => s.getItemCount);

  const total = getTotal();
  const deliveryFee = items.length > 0 ? getDeliveryFee() : 0;
  const totalWithDelivery = total + deliveryFee;
  const shopName = items.length > 0 ? items[0].shopName : '';

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="size-24 rounded-full bg-muted flex items-center justify-center mb-6">
          <ShoppingCart className="size-10 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold">장바구니가 비어있어요</h2>
        <p className="text-sm text-muted-foreground mt-2">
          예쁜 꽃을 골라 장바구니에 담아보세요
        </p>
        <Link href="/shops">
          <Button className="mt-6">꽃집 둘러보기</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      <h1 className="text-xl font-bold">장바구니</h1>

      {/* Shop name */}
      <div className="mt-4 px-4 py-3 bg-muted/50 rounded-xl">
        <p className="text-sm font-medium">{shopName}</p>
        <p className="text-xs text-muted-foreground">
          {getItemCount()}개 상품
        </p>
      </div>

      {/* Items */}
      <div className="mt-4">
        {items.map((item) => (
          <CartItem key={item.productId} item={item} />
        ))}
      </div>

      {/* Price Summary */}
      <div className="mt-6 bg-white rounded-xl border p-4 space-y-3">
        <h2 className="text-sm font-bold">결제 금액</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">상품금액</span>
          <span>{total.toLocaleString()}원</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">배달비</span>
          <span>{deliveryFee.toLocaleString()}원</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between font-bold">
          <span>총 결제금액</span>
          <span className="text-primary text-lg">
            {totalWithDelivery.toLocaleString()}원
          </span>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-lg px-4 py-3 md:max-w-4xl md:mx-auto">
        <Link href="/checkout" className="block">
          <Button size="lg" className="w-full text-base">
            {totalWithDelivery.toLocaleString()}원 주문하기
          </Button>
        </Link>
      </div>
    </div>
  );
}
