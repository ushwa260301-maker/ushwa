import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
} from '@/hooks/useNotifications';

interface Notification {
  _id: string;
  type: 'order' | 'review' | 'shop' | 'promotion' | 'system';
  title: string;
  body: string;
  isRead: boolean;
  data?: {
    orderId?: string;
    shopId?: string;
    screen?: string;
  };
  createdAt: string;
}

const TYPE_EMOJI: Record<string, string> = {
  order: '📦',
  review: '⭐',
  shop: '🌸',
  promotion: '🎉',
  system: '🔔',
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString('ko-KR');
}

function NotificationItem({
  item,
  onPress,
}: {
  item: Notification;
  onPress: (item: Notification) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.notificationItem, !item.isRead && styles.unreadItem]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.iconText}>
          {TYPE_EMOJI[item.type] || '🔔'}
        </Text>
      </View>
      <View style={styles.contentContainer}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, !item.isRead && styles.unreadTitle]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!item.isRead && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.body} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useNotifications();
  const { data: unreadData } = useUnreadCount();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const notifications: Notification[] = data?.data || [];
  const unreadCount = unreadData?.data?.count || 0;

  const handlePress = useCallback(
    (item: Notification) => {
      if (!item.isRead) {
        markAsRead.mutate(item._id);
      }
      if (item.data?.orderId) {
        router.push(`/order/${item.data.orderId}`);
      }
    },
    [markAsRead, router],
  );

  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead.mutate();
  }, [markAllAsRead]);

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <NotificationItem item={item} onPress={handlePress} />
    ),
    [handlePress],
  );

  const keyExtractor = useCallback((item: Notification) => item._id, []);

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔔</Text>
        <Text style={styles.emptyText}>아직 알림이 없어요</Text>
        <Text style={styles.emptySubText}>
          주문 상태 변경, 리뷰 알림 등을 받을 수 있어요
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: '알림',
          headerRight: () =>
            unreadCount > 0 ? (
              <TouchableOpacity
                onPress={handleMarkAllAsRead}
                style={styles.markAllButton}
              >
                <Text style={styles.markAllText}>모두 읽음</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E91E63" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={
            notifications.length === 0
              ? styles.emptyListContent
              : styles.listContent
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#E91E63"
              colors={['#E91E63']}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  unreadItem: {
    backgroundColor: '#FFF0F5',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF8F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  contentContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    color: '#1A1A1A',
    flex: 1,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E91E63',
    marginLeft: 8,
  },
  body: {
    fontSize: 13,
    color: '#757575',
    lineHeight: 18,
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: '#BDBDBD',
  },
  separator: {
    height: 1,
    backgroundColor: '#F5F5F5',
    marginLeft: 72,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 20,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAllText: {
    fontSize: 14,
    color: '#E91E63',
    fontWeight: '600',
  },
});
