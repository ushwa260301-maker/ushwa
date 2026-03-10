import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api/notifications';

export interface Notification {
  _id: string;
  recipient: string;
  type: 'order' | 'review' | 'shop' | 'promotion' | 'system';
  title: string;
  body: string;
  data?: {
    orderId?: string;
    shopId?: string;
    screen?: string;
  };
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useNotifications(page = 1, limit = 20) {
  return useQuery<{
    data: {
      notifications: Notification[];
      total: number;
      page: number;
      totalPages: number;
    };
  }>({
    queryKey: ['notifications', page, limit],
    queryFn: () => notificationsApi.getAll({ page, limit }),
  });
}

export function useUnreadCount() {
  return useQuery<{ data: { count: number } }>({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
}
