'use client';

import { use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useOrderDetail } from '@/hooks/useOrders';
import { ordersApi } from '@/lib/api/orders';
import { OrderTimeline } from '@/components/order/order-timeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryClient } from '@tanstack/react-query';

const statusLabels: Record<string, string> = {
  pending: '주문 대기',
  accepted: '주문 접수',
  preparing: '준비 중',
  ready: '준비 완료',
  delivering: '배달 중',
  delivered: '배달 완료',
  cancelled: '주문 취소',
  rejected: '주문 거절',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  ready: 'bg-indigo-100 text-indigo-800',
  delivering: 'bg-cyan-100 text-cyan-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
};

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading } = useOrderDetail(id);
  const queryClient = useQueryClient();

  const order = data?.data;

  const handleCancel = async () => {
    if (!order) return;
    try {
      await ordersApi.cancel(order._id);
      toast.success('주문이 취소되었습니다');
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    } catch {
      toast.error('주문 취소에 실패했습니다');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-4xl mb-4">😢</span>
        <p className="text-lg font-medium">주문을 찾을 수 없습니다</p>
        <Link
          href="/orders"
          className="text-primary text-sm mt-2 hover:underline"
        >
          주문 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const totalItemAmount = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = order.deliveryFee ?? 3000;
  const totalAmount = order.totalAmount ?? order.payment?.amount ?? totalItemAmount + deliveryFee;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">주문 상세</h1>
          {order.orderNumber && (
            <p className="text-xs text-muted-foreground">
              주문번호: {order.orderNumber}
            </p>
          )}
        </div>
        <Badge
          className={`${statusColors[order.status] ?? 'bg-gray-100 text-gray-800'} border-0`}
        >
          {statusLabels[order.status] ?? order.status}
        </Badge>
      </div>

      <div className="space-y-6">
        {/* Timeline */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-bold mb-3">주문 상태</h2>
          <OrderTimeline
            statusHistory={order.statusHistory ?? []}
            currentStatus={order.status}
          />
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-bold mb-3">주문 상품</h2>
          <div className="space-y-3">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="relative size-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {item.product?.images?.[0] ? (
                    <Image
                      src={item.product.images[0]}
                      alt={item.product?.name ?? '상품'}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/5">
                      <span className="text-lg">💐</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {item.product?.name ?? '상품'}
                  </p>
                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {item.selectedOptions
                        .map((o) => `${o.name}: ${o.value}`)
                        .join(', ')}
                    </p>
                  )}
                  {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      추가: {item.selectedAddOns.map((a) => a.name).join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {item.quantity}개
                  </p>
                </div>
                <span className="text-sm font-medium shrink-0">
                  {(item.price * item.quantity).toLocaleString()}원
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Info */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-bold mb-3">배달 정보</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">받는 분</span>
              <span>{order.delivery.recipientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">연락처</span>
              <span>{order.delivery.recipientPhone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">주소</span>
              <span className="text-right">
                {order.delivery.address} {order.delivery.addressDetail}
              </span>
            </div>
            {order.delivery.requestedDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">배달 희망일</span>
                <span>{order.delivery.requestedDate}</span>
              </div>
            )}
            {order.delivery.requestedTime && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">배달 시간</span>
                <span>{order.delivery.requestedTime}</span>
              </div>
            )}
            {order.delivery.message && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">메모</span>
                <span className="text-right">{order.delivery.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment */}
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h2 className="text-sm font-bold">결제 정보</h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">상품금액</span>
            <span>{totalItemAmount.toLocaleString()}원</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">배달비</span>
            <span>{deliveryFee.toLocaleString()}원</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between font-bold">
            <span>총 결제금액</span>
            <span className="text-primary text-lg">
              {totalAmount.toLocaleString()}원
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {order.status === 'pending' && (
            <Button
              variant="outline"
              onClick={handleCancel}
              className="flex-1"
            >
              주문 취소
            </Button>
          )}
          {order.status === 'delivered' && !order.hasReview && (
            <Link href={`/orders/${order._id}/review`} className="flex-1">
              <Button className="w-full">리뷰 작성</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
