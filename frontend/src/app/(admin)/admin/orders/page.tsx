'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, ShoppingCart, DollarSign, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { ordersApi } from '@/lib/api/orders';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminOrder {
  _id: string;
  orderNumber: string;
  user: { name: string; email?: string };
  shop: { name: string };
  totalAmount: number;
  status: string;
  createdAt: string;
}

const statusTabs = [
  { value: '', label: '전체' },
  { value: 'pending', label: '대기' },
  { value: 'accepted', label: '접수' },
  { value: 'preparing', label: '준비중' },
  { value: 'delivering', label: '배달중' },
  { value: 'delivered', label: '완료' },
  { value: 'cancelled', label: '취소' },
];

const statusLabels: Record<string, string> = {
  pending: '대기',
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

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ total: 0, pending: 0, totalRevenue: 0 });

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await ordersApi.getShopOrders(params);
      const ordersList = res.data?.orders ?? res.data ?? [];
      setOrders(ordersList);
      setStats({
        total: res.data?.total ?? ordersList.length,
        pending: ordersList.filter((o: AdminOrder) => o.status === 'pending').length,
        totalRevenue: ordersList.reduce(
          (sum: number, o: AdminOrder) => sum + (o.totalAmount ?? 0),
          0,
        ),
      });
    } catch {
      toast.error('주문 목록을 불러오지 못했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = searchQuery
    ? orders.filter((o) =>
        o.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : orders;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">주문현황</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <ShoppingCart className="size-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">전체 주문</p>
            <p className="text-xl font-bold">{stats.total}건</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <Clock className="size-8 text-orange-500" />
          <div>
            <p className="text-xs text-muted-foreground">대기 주문</p>
            <p className="text-xl font-bold">{stats.pending}건</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <DollarSign className="size-8 text-green-500" />
          <div>
            <p className="text-xs text-muted-foreground">총 매출</p>
            <p className="text-xl font-bold">{stats.totalRevenue.toLocaleString()}원</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="주문번호로 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
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

      {/* Orders Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">주문번호</th>
                  <th className="text-left px-4 py-3 font-medium">고객</th>
                  <th className="text-left px-4 py-3 font-medium">꽃집</th>
                  <th className="text-left px-4 py-3 font-medium">금액</th>
                  <th className="text-left px-4 py-3 font-medium">상태</th>
                  <th className="text-left px-4 py-3 font-medium">주문일시</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order._id} className="border-t">
                    <td className="px-4 py-3 font-medium">{order.orderNumber}</td>
                    <td className="px-4 py-3">{order.user?.name}</td>
                    <td className="px-4 py-3">{order.shop?.name}</td>
                    <td className="px-4 py-3">
                      {order.totalAmount?.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`${statusColors[order.status] ?? 'bg-gray-100 text-gray-800'} border-0`}
                      >
                        {statusLabels[order.status] ?? order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(order.createdAt).toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">주문이 없습니다</p>
        </div>
      )}
    </div>
  );
}
