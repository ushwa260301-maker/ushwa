'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import type { Notification } from './useNotifications';

const TYPE_EMOJI: Record<string, string> = {
  order: '\uD83D\uDED2',
  review: '\u2B50',
  shop: '\uD83C\uDFEA',
  promotion: '\uD83C\uDF89',
  system: '\uD83D\uDD14',
};

export function useSocket() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?._id) return;

    connectSocket(user._id);

    const socket = getSocket();

    const handleNotification = (notification: Notification) => {
      // Invalidate queries so UI updates
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });

      // Show sonner toast
      const emoji = TYPE_EMOJI[notification.type] || '\uD83D\uDD14';
      toast(`${emoji} ${notification.title}`, {
        description: notification.body,
      });
    };

    socket.on('notification', handleNotification);

    return () => {
      socket.off('notification', handleNotification);
      disconnectSocket(user._id);
    };
  }, [user?._id, queryClient]);
}
