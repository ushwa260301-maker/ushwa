import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

const STATUS_LABELS: Record<string, string> = {
  all: '전체',
  pending: '대기',
  accepted: '접수',
  preparing: '준비 중',
  delivering: '배달 중',
  delivered: '완료',
  cancelled: '취소',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9800',
  accepted: '#2196F3',
  preparing: '#9C27B0',
  ready: '#00BCD4',
  delivering: '#4CAF50',
  delivered: '#757575',
  cancelled: '#F44336',
  rejected: '#F44336',
};

const STATUS_FILTERS = ['all', 'pending', 'accepted', 'preparing', 'delivering', 'delivered', 'cancelled'];

export default function OrdersScreen() {
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const ordersQuery = useQuery({
    queryKey: ['orders', 'my', selectedStatus],
    queryFn: () =>
      ordersApi.getMyOrders({
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        limit: 50,
      }),
    enabled: isAuthenticated,
  });

  const orders = ordersQuery.data?.data || [];

  const onRefresh = async () => {
    setRefreshing(true);
    await ordersQuery.refetch();
    setRefreshing(false);
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="log-in-outline" size={48} color="#E0E0E0" />
        <Text style={styles.emptyText}>로그인이 필요합니다</Text>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginButtonText}>로그인</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderOrderItem = ({ item }: { item: any }) => {
    const firstItem = item.items?.[0];
    const statusColor = STATUS_COLORS[item.status] || '#757575';
    const statusLabel = STATUS_LABELS[item.status] || item.status;
    const itemCount = item.items?.length || 0;
    const displayName = firstItem?.productSnapshot?.name || '상품';

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => router.push(`/order/${item._id}`)}
      >
        <View style={styles.orderHeader}>
          <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.orderBody}>
          <View style={styles.orderIconContainer}>
            <Ionicons name="flower-outline" size={24} color="#E91E63" />
          </View>
          <View style={styles.orderDetails}>
            <Text style={styles.orderItemName} numberOfLines={1}>
              {displayName}
              {itemCount > 1 ? ` 외 ${itemCount - 1}건` : ''}
            </Text>
            <Text style={styles.orderPrice}>
              {item.pricing?.total?.toLocaleString()}원
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#BDBDBD" />
        </View>

        <Text style={styles.orderDate}>
          {new Date(item.createdAt).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Status Filter */}
      <FlatList
        data={STATUS_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterList}
        contentContainerStyle={styles.filterContent}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedStatus === item && styles.filterChipActive,
            ]}
            onPress={() => setSelectedStatus(item)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedStatus === item && styles.filterChipTextActive,
              ]}
            >
              {STATUS_LABELS[item] || item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Orders List */}
      {ordersQuery.isLoading ? (
        <ActivityIndicator color="#E91E63" style={styles.loader} />
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderItem}
          keyExtractor={(item: any) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E91E63" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color="#E0E0E0" />
              <Text style={styles.emptyText}>주문 내역이 없습니다</Text>
            </View>
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
  filterList: {
    maxHeight: 50,
    marginTop: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#E91E63',
    borderColor: '#E91E63',
  },
  filterChipText: {
    fontSize: 13,
    color: '#757575',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 4,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  orderBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFF0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderDetails: {
    flex: 1,
  },
  orderItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  orderPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E91E63',
  },
  orderDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 10,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#757575',
  },
  loginButton: {
    backgroundColor: '#E91E63',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
