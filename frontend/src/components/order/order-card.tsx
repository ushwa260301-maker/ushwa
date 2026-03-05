'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Order } from '@/hooks/useOrders';

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

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface OrderCardProps {
  order: Order;
  onCancel?: (id: string) => void;
}

export function OrderCard({ order, onCancel }: OrderCardProps) {
  const firstItem = order.items[0];
  const otherCount = order.items.length - 1;
  const firstImage = firstItem?.product?.images?.[0];

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {typeof order.shop === 'object' ? order.shop.name : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(order.createdAt)}
          </p>
        </div>
        <Badge
          className={`${statusColors[order.status] ?? 'bg-gray-100 text-gray-800'} border-0`}
        >
          {statusLabels[order.status] ?? order.status}
        </Badge>
      </div>

      {/* Item Preview */}
      <Link
        href={`/orders/${order._id}`}
        className="flex gap-3 hover:bg-muted/30 -mx-2 px-2 py-1 rounded-lg transition-colors"
      >
        <div className="relative size-16 rounded-lg overflow-hidden bg-muted shrink-0">
          {firstImage ? (
            <Image
              src={firstImage}
              alt={firstItem.product?.name ?? '상품'}
              fill
              className="object-cover"
              sizes="64px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/5">
              <span className="text-2xl">💐</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {firstItem?.product?.name ?? '상품'}
            {otherCount > 0 && (
              <span className="text-muted-foreground"> 외 {otherCount}건</span>
            )}
          </p>
          <p className="text-sm font-bold mt-1">
            {order.totalAmount?.toLocaleString() ??
              order.payment?.amount?.toLocaleString() ??
              '0'}
            원
          </p>
        </div>
      </Link>

      {/* Actions */}
      <div className="flex gap-2">
        {order.status === 'pending' && onCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCancel(order._id)}
            className="text-xs"
          >
            주문 취소
          </Button>
        )}
        {order.status === 'delivered' && !order.hasReview && (
          <Link href={`/orders/${order._id}/review`}>
            <Button size="sm" className="text-xs">
              리뷰 작성
            </Button>
          </Link>
        )}
        <Link href={`/orders/${order._id}`}>
          <Button variant="ghost" size="sm" className="text-xs">
            주문 상세
          </Button>
        </Link>
      </div>
    </div>
  );
}
