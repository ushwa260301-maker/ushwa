import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';

interface NotificationPayload {
  _id: string;
  title: string;
  body: string;
  type: string;
  data?: {
    orderId?: string;
    [key: string]: unknown;
  };
}

export function useSocket() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?._id) return;

    connectSocket(user._id);
    const socket = getSocket();

    const handleNotification = (notification: NotificationPayload) => {
      // Invalidate notification queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['notifications'] });

      // Show an alert to the user
      Alert.alert(notification.title, notification.body);
    };

    socket.on('notification', handleNotification);

    return () => {
      socket.off('notification', handleNotification);
      disconnectSocket(user._id);
    };
  }, [user?._id, queryClient]);
}
