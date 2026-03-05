'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface UserData {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  phone?: string;
  createdAt: string;
}

const roleTabs = [
  { value: '', label: '전체' },
  { value: 'customer', label: '고객' },
  { value: 'owner', label: '사장님' },
  { value: 'admin', label: '관리자' },
];

const roleLabels: Record<string, string> = {
  customer: '고객',
  owner: '사장님',
  admin: '관리자',
};

const roleColors: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-800',
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-red-100 text-red-800',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (roleFilter) params.role = roleFilter;
      if (searchQuery) params.search = searchQuery;
      const res = await adminApi.getUsers(params);
      setUsers(res.data?.users ?? res.data ?? []);
    } catch {
      toast.error('사용자 목록을 불러오지 못했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [roleFilter, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await adminApi.updateUserStatus(id, !currentStatus);
      toast.success(
        !currentStatus ? '사용자가 활성화되었습니다' : '사용자가 비활성화되었습니다',
      );
      fetchUsers();
    } catch {
      toast.error('상태 변경에 실패했습니다');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">사용자관리</h1>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="이름 또는 이메일로 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Role Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {roleTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setRoleFilter(tab.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              roleFilter === tab.value
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Users Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : users.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">이름</th>
                  <th className="text-left px-4 py-3 font-medium">이메일</th>
                  <th className="text-left px-4 py-3 font-medium">역할</th>
                  <th className="text-left px-4 py-3 font-medium">상태</th>
                  <th className="text-left px-4 py-3 font-medium">가입일</th>
                  <th className="text-right px-4 py-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-t">
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`${roleColors[user.role] ?? 'bg-gray-100 text-gray-800'} border-0`}
                      >
                        {roleLabels[user.role] ?? user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`${
                          user.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        } border-0`}
                      >
                        {user.isActive ? '활성' : '비활성'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleStatus(user._id, user.isActive)}
                          className={
                            user.isActive ? 'text-red-600' : 'text-green-600'
                          }
                        >
                          {user.isActive ? (
                            <>
                              <UserX className="size-3.5 mr-1" />
                              비활성
                            </>
                          ) : (
                            <>
                              <UserCheck className="size-3.5 mr-1" />
                              활성
                            </>
                          )}
                        </Button>
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
          <p className="text-muted-foreground">사용자가 없습니다</p>
        </div>
      )}
    </div>
  );
}
