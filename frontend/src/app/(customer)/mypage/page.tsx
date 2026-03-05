'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  User,
  MapPin,
  ClipboardList,
  MessageSquare,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { usersApi } from '@/lib/api/users';
import { ProfileForm } from '@/components/user/profile-form';
import { AddressForm } from '@/components/user/address-form';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function MyPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout, fetchUser } = useAuthStore();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);

  if (!isAuthenticated || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <User className="size-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">로그인이 필요합니다</p>
        <Link href="/login">
          <Button>로그인하기</Button>
        </Link>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await usersApi.deleteAddress(id);
      toast.success('주소가 삭제되었습니다');
      fetchUser();
    } catch {
      toast.error('주소 삭제에 실패했습니다');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20 space-y-6">
      <h1 className="text-xl font-bold">마이페이지</h1>

      {/* Profile Section */}
      <div className="bg-white rounded-xl border p-6">
        {isEditingProfile ? (
          <ProfileForm
            onSuccess={() => {
              setIsEditingProfile(false);
              fetchUser();
            }}
            onCancel={() => setIsEditingProfile(false)}
          />
        ) : (
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
              {user.profileImage ? (
                <Image
                  src={user.profileImage}
                  alt={user.name}
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                />
              ) : (
                <span className="text-2xl text-muted-foreground">
                  {user.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              {user.phone && (
                <p className="text-sm text-muted-foreground">{user.phone}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingProfile(true)}
            >
              <Pencil className="size-4 mr-1" />
              수정
            </Button>
          </div>
        )}
      </div>

      {/* Address Section */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <MapPin className="size-4" />
            배송지 관리
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsAddingAddress(true);
              setEditingAddress(null);
            }}
          >
            <Plus className="size-4 mr-1" />
            추가
          </Button>
        </div>

        {isAddingAddress && (
          <div className="mb-4 p-4 bg-muted/30 rounded-lg">
            <AddressForm
              mode="add"
              onSuccess={() => {
                setIsAddingAddress(false);
                fetchUser();
              }}
              onCancel={() => setIsAddingAddress(false)}
            />
          </div>
        )}

        {user.addresses && user.addresses.length > 0 ? (
          <div className="space-y-3">
            {user.addresses.map((addr) => (
              <div key={addr._id ?? addr.label} className="border rounded-lg p-3">
                {editingAddress === addr._id ? (
                  <AddressForm
                    mode="edit"
                    initialData={addr}
                    onSuccess={() => {
                      setEditingAddress(null);
                      fetchUser();
                    }}
                    onCancel={() => setEditingAddress(null)}
                  />
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{addr.label}</span>
                        {addr.isDefault && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            기본
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {addr.address} {addr.addressDetail}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {addr.zipCode}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          setEditingAddress(addr._id ?? null);
                          setIsAddingAddress(false);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => addr._id && handleDeleteAddress(addr._id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          !isAddingAddress && (
            <p className="text-sm text-muted-foreground text-center py-4">
              등록된 배송지가 없습니다
            </p>
          )
        )}
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-xl border divide-y">
        <Link
          href="/orders"
          className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors"
        >
          <span className="flex items-center gap-3 text-sm">
            <ClipboardList className="size-5 text-muted-foreground" />
            주문내역
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
        <Link
          href="/orders"
          className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors"
        >
          <span className="flex items-center gap-3 text-sm">
            <MessageSquare className="size-5 text-muted-foreground" />
            내 리뷰
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Logout */}
      <Button
        variant="outline"
        onClick={handleLogout}
        className="w-full"
      >
        <LogOut className="size-4 mr-2" />
        로그아웃
      </Button>
    </div>
  );
}
