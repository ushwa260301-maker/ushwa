import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';

export function useNotifications(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['notifications', page, limit],
    queryFn: () => notificationsApi.getAll({ page, limit }),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
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
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
