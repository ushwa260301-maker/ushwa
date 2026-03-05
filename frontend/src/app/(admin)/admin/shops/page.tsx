'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, CheckCircle, XCircle, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Shop {
  _id: string;
  name: string;
  owner: { name: string; email: string };
  status: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

const statusTabs = [
  { value: '', label: '전체' },
  { value: 'pending', label: '대기' },
  { value: 'approved', label: '승인' },
  { value: 'rejected', label: '거절' },
  { value: 'suspended', label: '정지' },
];

const statusLabels: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '거절',
  suspended: '정지',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800',
};

export default function AdminShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchShops = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;
      const res = await adminApi.getShops(params);
      setShops(res.data?.shops ?? res.data ?? []);
    } catch {
      toast.error('꽃집 목록을 불러오지 못했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchShops();
  }, [fetchShops]);

  const handleApprove = async (id: string) => {
    try {
      await adminApi.approveShop(id);
      toast.success('승인되었습니다');
      fetchShops();
    } catch {
      toast.error('승인에 실패했습니다');
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('거절 사유를 입력해주세요');
    if (!reason) return;
    try {
      await adminApi.rejectShop(id, reason);
      toast.success('거절되었습니다');
      fetchShops();
    } catch {
      toast.error('거절에 실패했습니다');
    }
  };

  const handleSuspend = async (id: string) => {
    const reason = prompt('정지 사유를 입력해주세요');
    if (!reason) return;
    try {
      await adminApi.suspendShop(id, reason);
      toast.success('정지되었습니다');
      fetchShops();
    } catch {
      toast.error('정지에 실패했습니다');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">꽃집관리</h1>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="꽃집 이름으로 검색"
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

      {/* Shops Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : shops.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">가게명</th>
                  <th className="text-left px-4 py-3 font-medium">사장님</th>
                  <th className="text-left px-4 py-3 font-medium">상태</th>
                  <th className="text-left px-4 py-3 font-medium">등록일</th>
                  <th className="text-right px-4 py-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <tr key={shop._id} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium">{shop.name}</p>
                      {shop.address && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {shop.address}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p>{shop.owner?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {shop.owner?.email}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`${statusColors[shop.status] ?? 'bg-gray-100 text-gray-800'} border-0`}
                      >
                        {statusLabels[shop.status] ?? shop.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(shop.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {shop.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600"
                              onClick={() => handleApprove(shop._id)}
                            >
                              <CheckCircle className="size-3.5 mr-1" />
                              승인
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleReject(shop._id)}
                            >
                              <XCircle className="size-3.5 mr-1" />
                              거절
                            </Button>
                          </>
                        )}
                        {shop.status === 'approved' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600"
                            onClick={() => handleSuspend(shop._id)}
                          >
                            <Ban className="size-3.5 mr-1" />
                            정지
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">꽃집이 없습니다</p>
        </div>
      )}
    </div>
  );
}
