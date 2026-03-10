'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useMyOrders } from '@/hooks/useOrders';
import { ordersApi } from '@/lib/api/orders';
import { OrderCard } from '@/components/order/order-card';
import { OrderCardSkeleton } from '@/components/ui/loading-skeletons';
import { EmptyState } from '@/components/ui/empty-states';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';

const statusTabs = [
  { value: '', label: '전체' },
  { value: 'active', label: '진행중' },
  { value: 'delivered', label: '완료' },
  { value: 'cancelled', label: '취소' },
];

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useMyOrders({
    page,
    limit: 10,
    status: statusFilter || undefined,
  });

  const orders = data?.data?.orders ?? [];
  const totalPages = data?.data?.totalPages ?? 1;

  const handleCancel = async (id: string) => {
    try {
      await ordersApi.cancel(id);
      toast.success('주문이 취소되었습니다');
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    } catch {
      toast.error('주문 취소에 실패했습니다');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold">주문내역</h1>

      {/* Status Tabs */}
      <div className="mt-4">
        <Tabs
          value={statusFilter}
          onValueChange={(val) => {
            setStatusFilter(val);
            setPage(1);
          }}
        >
          <TabsList className="w-full">
            {statusTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="flex-1">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Order List */}
      <div className="mt-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <OrderCardSkeleton key={i} />
          ))
        ) : orders.length > 0 ? (
          orders.map((order) => (
            <OrderCard key={order._id} order={order} onCancel={handleCancel} />
          ))
        ) : (
          <EmptyState
            icon="📦"
            title="주문 내역이 없습니다"
            description="아직 주문하신 내역이 없어요"
            action={
              <Link href="/shops">
                <Button>꽃집 둘러보기</Button>
              </Link>
            }
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            이전
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
