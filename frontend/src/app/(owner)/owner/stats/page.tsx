'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingCart, DollarSign, BarChart3 } from 'lucide-react';
import { shopsApi } from '@/lib/api/shops';
import { Skeleton } from '@/components/ui/skeleton';

type Period = 'today' | 'week' | 'month';

interface StatsData {
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  topProducts: Array<{
    _id: string;
    name: string;
    salesCount: number;
    revenue: number;
  }>;
}

export default function OwnerStatsPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);
      try {
        const res = await shopsApi.getAnalytics();
        const data = res.data;
        setStats({
          revenue: data?.revenue ?? data?.todayRevenue ?? 0,
          orderCount: data?.orderCount ?? data?.todayOrders ?? 0,
          averageOrderValue: data?.averageOrderValue ?? 0,
          topProducts: data?.topProducts ?? [],
        });
      } catch {
        setStats({
          revenue: 0,
          orderCount: 0,
          averageOrderValue: 0,
          topProducts: [],
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, [period]);

  const periodLabels: Record<Period, string> = {
    today: '오늘',
    week: '이번주',
    month: '이번달',
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">매출통계</h1>

      {/* Period Selector */}
      <div className="flex gap-2">
        {(Object.keys(periodLabels) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              period === p
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <DollarSign className="size-5" />
                <span className="text-sm font-medium">매출</span>
              </div>
              <p className="text-3xl font-bold text-primary">
                {(stats?.revenue ?? 0).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground mt-1">원</p>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <ShoppingCart className="size-5" />
                <span className="text-sm font-medium">주문수</span>
              </div>
              <p className="text-3xl font-bold">{stats?.orderCount ?? 0}</p>
              <p className="text-sm text-muted-foreground mt-1">건</p>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <TrendingUp className="size-5" />
                <span className="text-sm font-medium">평균 주문금액</span>
              </div>
              <p className="text-3xl font-bold">
                {(stats?.averageOrderValue ?? 0).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground mt-1">원</p>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="size-5 text-primary" />
              <h2 className="font-bold">인기 상품</h2>
            </div>

            {stats?.topProducts && stats.topProducts.length > 0 ? (
              <div className="space-y-3">
                {stats.topProducts.map((product, idx) => (
                  <div
                    key={product._id}
                    className="flex items-center gap-4 py-2 border-b last:border-0"
                  >
                    <span
                      className={`size-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        idx === 0
                          ? 'bg-yellow-100 text-yellow-800'
                          : idx === 1
                            ? 'bg-gray-100 text-gray-600'
                            : idx === 2
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.salesCount}건 판매
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      {product.revenue.toLocaleString()}원
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                데이터가 없습니다
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
