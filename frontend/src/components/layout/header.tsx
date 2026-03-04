'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ShoppingCart, User, LogOut, ClipboardList } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useCartStore } from '@/stores/cart.store';
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
  const { user, isAuthenticated, logout } = useAuthStore();
  const itemCount = useCartStore((s) => s.getItemCount());

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1 shrink-0">
          <span className="text-xl font-bold text-primary">🌸 어서화</span>
        </Link>

        {/* Search - hidden on mobile, shown on md+ */}
        <div className="hidden md:flex flex-1 max-w-md">
          <button
            onClick={() => router.push('/shops')}
            className="w-full flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <Search className="size-4" />
            <span>꽃집이나 상품을 검색해보세요</span>
          </button>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Mobile search icon */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => router.push('/shops')}
          >
            <Search className="size-5" />
          </Button>

          {/* Cart */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => router.push('/cart')}
          >
            <ShoppingCart className="size-5" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </Button>

          {/* User */}
          {isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
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
              className="text-sm"
            >
              로그인
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
