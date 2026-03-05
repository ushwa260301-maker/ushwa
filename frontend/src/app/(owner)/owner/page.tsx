'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  DollarSign,
  Clock,
  Star,
  Plus,
  Settings,
} from 'lucide-react';
import { shopsApi } from '@/lib/api/shops';
import { ordersApi } from '@/lib/api/orders';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Analytics {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  averageRating: number;
}

interface RecentOrder {
  _id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

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
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export default function OwnerDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [analyticsRes, ordersRes] = await Promise.all([
          shopsApi.getAnalytics(),
          ordersApi.getShopOrders({ limit: 5 }),
        ]);
        setAnalytics(
          analyticsRes.data ?? {
            todayOrders: 0,
            todayRevenue: 0,
            pendingOrders: 0,
            averageRating: 0,
          },
        );
        setRecentOrders(ordersRes.data?.orders ?? []);
      } catch {
        setAnalytics({
          todayOrders: 0,
          todayRevenue: 0,
          pendingOrders: 0,
          averageRating: 0,
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <ShoppingCart className="size-4" />
            <span className="text-xs">오늘 주문</span>
          </div>
          <p className="text-2xl font-bold">{analytics?.todayOrders ?? 0}</p>
          <p className="text-xs text-muted-foreground">건</p>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <DollarSign className="size-4" />
            <span className="text-xs">오늘 매출</span>
          </div>
          <p className="text-2xl font-bold">
            {(analytics?.todayRevenue ?? 0).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">원</p>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="size-4" />
            <span className="text-xs">대기 주문</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">
            {analytics?.pendingOrders ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">건</p>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Star className="size-4" />
            <span className="text-xs">평균 평점</span>
          </div>
          <p className="text-2xl font-bold">
            {(analytics?.averageRating ?? 0).toFixed(1)}
          </p>
          <p className="text-xs text-muted-foreground">/ 5.0</p>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">최근 주문</h2>
          <Link href="/owner/orders">
            <Button variant="ghost" size="sm" className="text-primary">
              전체보기
            </Button>
          </Link>
        </div>

        {recentOrders.length > 0 ? (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order._id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString('ko-KR')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {order.totalAmount?.toLocaleString()}원
                  </span>
                  <Badge
                    className={`${statusColors[order.status] ?? 'bg-gray-100 text-gray-800'} border-0 text-xs`}
                  >
                    {statusLabels[order.status] ?? order.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            아직 주문이 없습니다
          </p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/owner/products/new">
          <div className="bg-white rounded-xl border p-4 hover:border-primary/50 transition-colors cursor-pointer">
            <Plus className="size-6 text-primary mb-2" />
            <p className="text-sm font-medium">새 상품 등록</p>
            <p className="text-xs text-muted-foreground">상품을 추가하세요</p>
          </div>
        </Link>
        <Link href="/owner/shop">
          <div className="bg-white rounded-xl border p-4 hover:border-primary/50 transition-colors cursor-pointer">
            <Settings className="size-6 text-primary mb-2" />
            <p className="text-sm font-medium">가게 설정</p>
            <p className="text-xs text-muted-foreground">가게 정보를 수정하세요</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
