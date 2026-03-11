'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Search, ShoppingCart, User, LogOut, ClipboardList, MapPin } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useCartStore } from '@/stores/cart.store';
import { NotificationBell } from '@/components/layout/notification-bell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const itemCount = useCartStore((s) => s.getItemCount());

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      {/* Row 1: Logo + Location + Actions */}
      <div className="max-w-6xl mx-auto px-5 h-[52px] flex items-center justify-between gap-3">
        {/* Logo + Location */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center shrink-0">
            <span className="text-xl font-extrabold text-primary tracking-tight">어서화</span>
          </Link>
          <button className="flex items-center gap-0.5 text-sm text-[#666] hover:text-[#111] transition-colors">
            <MapPin className="size-3.5 text-primary" />
            <span className="font-medium">서울</span>
          </button>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          {/* Notifications */}
          {isAuthenticated && <NotificationBell />}

          {/* Cart */}
          <Button
            variant="ghost"
            size="icon"
            className="relative size-9"
            onClick={() => router.push('/cart')}
          >
            <ShoppingCart className="size-[22px]" />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 size-[18px] rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </Button>

          {/* User */}
          {isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9">
                  <User className="size-[22px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-[#999]">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/mypage')}>
                  <User className="size-4" />
                  마이페이지
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/orders')}>
                  <ClipboardList className="size-4" />
                  주문내역
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="size-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/login')}
              className="text-sm font-medium h-9"
            >
              로그인
            </Button>
          )}
        </div>
      </div>

      {/* Row 2: Full-width search bar (hidden on /shops since it has its own) */}
      {!pathname.startsWith('/shops') && (
        <div className="px-5 pb-3">
          <button
            onClick={() => router.push('/shops')}
            className="w-full flex items-center gap-2.5 rounded-full bg-[#F5F5F5] px-4 py-2.5 text-sm text-[#999] hover:bg-[#EFEFEF] transition-colors"
          >
            <Search className="size-4 text-[#999]" />
            <span>꽃집이나 상품을 검색해보세요</span>
          </button>
        </div>
      )}
    </header>
  );
}
