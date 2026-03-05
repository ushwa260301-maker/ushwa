'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { useMyOrders } from '@/hooks/useOrders';
import { ordersApi } from '@/lib/api/orders';
import { OrderCard } from '@/components/order/order-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
            <div key={i} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32 mt-1" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <div className="flex gap-3">
                <Skeleton className="size-16 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-20 mt-1" />
                </div>
              </div>
            </div>
          ))
        ) : orders.length > 0 ? (
          orders.map((order) => (
            <OrderCard key={order._id} order={order} onCancel={handleCancel} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="size-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <ClipboardList className="size-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              주문 내역이 없습니다
            </p>
          </div>
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
