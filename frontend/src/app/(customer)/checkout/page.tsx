'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { useCartStore } from '@/stores/cart.store';
import { ordersApi } from '@/lib/api/orders';
import { DeliveryForm, type DeliveryFormData } from '@/components/order/delivery-form';
import { PaymentSelector, type PaymentMethod } from '@/components/order/payment-selector';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);
  const getDeliveryFee = useCartStore((s) => s.getDeliveryFee);
  const clearCart = useCartStore((s) => s.clearCart);
  const getShopId = useCartStore((s) => s.getShopId);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const total = getTotal();
  const deliveryFee = items.length > 0 ? getDeliveryFee() : 0;
  const totalWithDelivery = total + deliveryFee;
  const shopId = getShopId();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="size-24 rounded-full bg-muted flex items-center justify-center mb-6">
          <ShoppingCart className="size-10 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold">주문할 상품이 없습니다</h2>
        <p className="text-sm text-muted-foreground mt-2">
          장바구니에 상품을 먼저 담아주세요
        </p>
        <Link href="/shops">
          <Button className="mt-6">꽃집 둘러보기</Button>
        </Link>
      </div>
    );
  }

  const handleDeliverySubmit = async (deliveryData: DeliveryFormData) => {
    if (!shopId) return;
    setIsSubmitting(true);

    try {
      const paymentMethodMap: Record<PaymentMethod, 'card' | 'transfer' | 'cash'> = {
        card: 'card',
        kakaopay: 'card',
        naverpay: 'card',
        transfer: 'transfer',
      };

      const res = await ordersApi.create({
        shop: shopId,
        items: items.map((item) => ({
          product: item.productId,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
          selectedAddOns: item.selectedAddOns,
        })),
        delivery: {
          type: 'delivery',
          address: deliveryData.address,
          addressDetail: deliveryData.addressDetail,
          recipientName: deliveryData.recipientName,
          recipientPhone: deliveryData.recipientPhone,
          requestedDate: deliveryData.requestedDate,
          requestedTime: deliveryData.requestedTime,
          message: deliveryData.message,
        },
        payment: {
          method: paymentMethodMap[paymentMethod],
        },
      });

      clearCart();
      toast.success('주문이 완료되었습니다!');
      router.push(`/orders/${res.data?._id ?? res._id ?? ''}`);
    } catch {
      toast.error('주문에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePlaceOrder = () => {
    if (formRef.current) {
      formRef.current.requestSubmit();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-bold">주문/결제</h1>
      </div>

      <div className="space-y-6">
        {/* Order Items Summary */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-bold mb-3">주문 상품</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.productId} className="flex gap-3">
                <div className="relative size-14 rounded-lg overflow-hidden bg-muted shrink-0">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/5">
                      <span className="text-lg">💐</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity}개
                  </p>
                </div>
                <span className="text-sm font-medium shrink-0">
                  {(
                    (item.price +
                      item.selectedOptions.reduce(
                        (s, o) => s + o.price,
                        0
                      ) +
                      item.selectedAddOns.reduce(
                        (s, a) => s + a.price,
                        0
                      )) *
                    item.quantity
                  ).toLocaleString()}
                  원
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Form */}
        <div className="bg-white rounded-xl border p-4">
          <DeliveryForm onSubmit={handleDeliverySubmit} formRef={formRef} />
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-xl border p-4">
          <PaymentSelector
            selected={paymentMethod}
            onChange={setPaymentMethod}
          />
        </div>

        {/* Price Summary */}
        <div className="bg-white rounded-xl border p-4 space-y-3">
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
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-lg px-4 py-3 md:max-w-4xl md:mx-auto">
        <Button
          size="lg"
          className="w-full text-base"
          onClick={handlePlaceOrder}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? '주문 처리 중...'
            : `${totalWithDelivery.toLocaleString()}원 결제하기`}
        </Button>
      </div>
    </div>
  );
}
