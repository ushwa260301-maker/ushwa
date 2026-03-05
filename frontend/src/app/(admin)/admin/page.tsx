'use client';

import { useEffect, useState } from 'react';
import { Users, Store, ShoppingCart, DollarSign, Activity } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardData {
  totalUsers: number;
  totalShops: number;
  totalOrders: number;
  totalRevenue: number;
  recentActivity: Array<{
    _id: string;
    type: string;
    description: string;
    createdAt: string;
  }>;
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await adminApi.getDashboard();
        setData(
          res.data ?? {
            totalUsers: 0,
            totalShops: 0,
            totalOrders: 0,
            totalRevenue: 0,
            recentActivity: [],
          },
        );
      } catch {
        setData({
          totalUsers: 0,
          totalShops: 0,
          totalOrders: 0,
          totalRevenue: 0,
          recentActivity: [],
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
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
      <h1 className="text-2xl font-bold">관리자 대시보드</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="size-4" />
            <span className="text-xs">총 사용자</span>
          </div>
          <p className="text-2xl font-bold">{data?.totalUsers ?? 0}</p>
          <p className="text-xs text-muted-foreground">명</p>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Store className="size-4" />
            <span className="text-xs">총 꽃집</span>
          </div>
          <p className="text-2xl font-bold">{data?.totalShops ?? 0}</p>
          <p className="text-xs text-muted-foreground">개</p>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <ShoppingCart className="size-4" />
            <span className="text-xs">총 주문</span>
          </div>
          <p className="text-2xl font-bold">{data?.totalOrders ?? 0}</p>
          <p className="text-xs text-muted-foreground">건</p>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <DollarSign className="size-4" />
            <span className="text-xs">총 매출</span>
          </div>
          <p className="text-2xl font-bold">
            {(data?.totalRevenue ?? 0).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">원</p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="size-5 text-primary" />
          <h2 className="font-bold">최근 활동</h2>
        </div>

        {data?.recentActivity && data.recentActivity.length > 0 ? (
          <div className="space-y-3">
            {data.recentActivity.map((activity) => (
              <div
                key={activity._id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div>
                  <p className="text-sm">{activity.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(activity.createdAt).toLocaleString('ko-KR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            최근 활동이 없습니다
          </p>
        )}
      </div>
    </div>
  );
}
