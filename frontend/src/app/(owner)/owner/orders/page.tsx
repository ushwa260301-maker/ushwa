'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ordersApi } from '@/lib/api/orders';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface ShopOrder {
  _id: string;
  orderNumber: string;
  user: { name: string; phone?: string };
  items: Array<{
    product: { name: string };
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  status: string;
  delivery: {
    type: string;
    address: string;
    recipientName: string;
    recipientPhone: string;
  };
  createdAt: string;
}

const statusTabs = [
  { value: '', label: '전체' },
  { value: 'pending', label: '대기중' },
  { value: 'accepted', label: '접수' },
  { value: 'preparing', label: '준비중' },
  { value: 'delivering', label: '배달중' },
  { value: 'delivered', label: '완료' },
];

const statusLabels: Record<string, string> = {
  pending: '대기중',
  accepted: '접수',
  preparing: '준비중',
  ready: '준비완료',
  delivering: '배달중',
  delivered: '완료',
  cancelled: '취소',
  rejected: '거절',
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

const nextStatus: Record<string, string> = {
  accepted: 'preparing',
  preparing: 'ready',
  ready: 'delivering',
  delivering: 'delivered',
};

const nextStatusLabel: Record<string, string> = {
  accepted: '준비 시작',
  preparing: '준비 완료',
  ready: '배달 시작',
  delivering: '배달 완료',
};

export default function OwnerOrdersPage() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await ordersApi.getShopOrders(params);
      setOrders(res.data?.orders ?? []);
    } catch {
      toast.error('주문 목록을 불러오지 못했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleAccept = async (id: string) => {
    try {
      await ordersApi.accept(id);
      toast.success('주문을 접수했습니다');
      fetchOrders();
    } catch {
      toast.error('주문 접수에 실패했습니다');
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('거절 사유를 입력해주세요');
    if (!reason) return;
    try {
      await ordersApi.reject(id, reason);
      toast.success('주문을 거절했습니다');
      fetchOrders();
    } catch {
      toast.error('주문 거절에 실패했습니다');
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      await ordersApi.updateStatus(id, status);
      toast.success('상태가 업데이트되었습니다');
      fetchOrders();
    } catch {
      toast.error('상태 변경에 실패했습니다');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">주문관리</h1>
        <Button variant="outline" size="sm" onClick={fetchOrders}>
          <RefreshCw className="size-4 mr-1" />
          새로고침
        </Button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === tab.value
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Orders */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : orders.length > 0 ? (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order._id} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString('ko-KR')}
                  </p>
                </div>
                <Badge
                  className={`${statusColors[order.status] ?? 'bg-gray-100 text-gray-800'} border-0`}
                >
                  {statusLabels[order.status] ?? order.status}
                </Badge>
              </div>

              {/* Items */}
              <div className="text-sm space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-muted-foreground">
                    <span>
                      {item.product?.name ?? '상품'} x {item.quantity}
                    </span>
                    <span>{(item.price * item.quantity).toLocaleString()}원</span>
                  </div>
                ))}
              </div>

              {/* Delivery info */}
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2">
                <p>
                  {order.delivery.recipientName} / {order.delivery.recipientPhone}
                </p>
                <p>{order.delivery.address}</p>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between font-medium text-sm">
                <span>합계</span>
                <span className="text-primary">
                  {order.totalAmount?.toLocaleString()}원
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {order.status === 'pending' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleAccept(order._id)}
                      className="flex-1"
                    >
                      접수
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(order._id)}
                      className="flex-1"
                    >
                      거절
                    </Button>
                  </>
                )}
                {nextStatus[order.status] && (
                  <Button
                    size="sm"
                    onClick={() =>
                      handleStatusUpdate(order._id, nextStatus[order.status])
                    }
                    className="flex-1"
                  >
                    {nextStatusLabel[order.status]}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">주문이 없습니다</p>
        </div>
      )}
    </div>
  );
}
