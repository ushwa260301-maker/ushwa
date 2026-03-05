'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  Settings,
  MessageSquare,
  BarChart3,
  Menu,
  X,
  Store,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/owner', label: '대시보드', icon: LayoutDashboard },
  { href: '/owner/orders', label: '주문관리', icon: ClipboardList },
  { href: '/owner/products', label: '상품관리', icon: Package },
  { href: '/owner/shop', label: '가게설정', icon: Settings },
  { href: '/owner/reviews', label: '리뷰관리', icon: MessageSquare },
  { href: '/owner/stats', label: '매출통계', icon: BarChart3 },
];

export function OwnerSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-border transition-transform duration-300 md:translate-x-0 md:static md:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Shop info */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Store className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold">사장님 관리</p>
              <p className="text-xs text-muted-foreground">어서화 꽃집</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/owner'
                ? pathname === '/owner'
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

export function OwnerBottomNav() {
  const pathname = usePathname();

  const items = navItems.slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white md:hidden">
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const isActive =
            item.href === '/owner'
              ? pathname === '/owner'
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
