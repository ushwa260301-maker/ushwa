'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  type Notification,
} from '@/hooks/useNotifications';

const TYPE_EMOJI: Record<string, string> = {
  order: '\uD83D\uDED2',
  review: '\u2B50',
  shop: '\uD83C\uDFEA',
  promotion: '\uD83C\uDF89',
  system: '\uD83D\uDD14',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return '\uBC29\uAE08 \uC804';
  if (diff < 3600) return `${Math.floor(diff / 60)}\uBD84 \uC804`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}\uC2DC\uAC04 \uC804`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}\uC77C \uC804`;
  return new Date(dateStr).toLocaleDateString('ko-KR');
}

function getNotificationLink(notification: Notification): string | null {
  if (notification.data?.orderId) {
    return `/orders/${notification.data.orderId}`;
  }
  if (notification.data?.shopId) {
    return `/shops/${notification.data.shopId}`;
  }
  return null;
}

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: notificationsData } = useNotifications(1, 10);
  const { data: unreadData } = useUnreadCount();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const notifications = notificationsData?.data?.notifications ?? [];
  const unreadCount = unreadData?.data?.count ?? 0;

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead.mutate(notification._id);
    }
    const link = getNotificationLink(notification);
    if (link) {
      router.push(link);
    }
    setIsOpen(false);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg border border-border shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">알림</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                모두 읽음
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                알림이 없습니다
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification._id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0 ${
                    !notification.isRead ? 'bg-primary/5' : ''
                  }`}
                >
                  {/* Type emoji */}
                  <span className="text-lg shrink-0 mt-0.5">
                    {TYPE_EMOJI[notification.type] || '\uD83D\uDD14'}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {notification.title}
                      </p>
                      {!notification.isRead && (
                        <span className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {notification.body}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {timeAgo(notification.createdAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
