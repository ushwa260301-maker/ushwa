'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, ShoppingBag, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: '홈', icon: Home },
  { href: '/shops', label: '검색', icon: Search },
  { href: '/orders', label: '주문', icon: ShoppingBag },
  { href: '/mypage', label: 'MY', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.05)] md:hidden">
      <div className="flex items-stretch justify-around h-[60px]">
        {navItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 flex-1 transition-colors',
                isActive ? 'text-primary' : 'text-[#999]'
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-primary rounded-b-full" />
              )}
              <Icon className={cn(
                'size-[22px] transition-transform',
                isActive && 'scale-110'
              )} />
              <span className={cn(
                'text-[10px]',
                isActive ? 'font-semibold text-primary' : 'font-normal'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
      {/* Safe area for iOS */}
      <div className="h-safe-area-inset-bottom" />
    </nav>
  );
}
