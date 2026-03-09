import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../../lib/api/orders';
import { Ionicons } from '@expo/vector-icons';

const STATUS_LABELS: Record<string, string> = {
  pending: '주문 대기',
  accepted: '주문 접수',
  preparing: '준비 중',
  ready: '준비 완료',
  delivering: '배달 중',
  delivered: '배달 완료',
  cancelled: '주문 취소',
  rejected: '주문 거절',
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

const STATUS_FLOW = ['pending', 'accepted', 'preparing', 'ready', 'delivering', 'delivered'];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: orderData, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getById(id!),
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => ordersApi.cancel(id!),
    onSuccess: () => {
      Alert.alert('취소 완료', '주문이 취소되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: any) => {
      Alert.alert(
        '취소 실패',
        error?.response?.data?.message || '주문 취소에 실패했습니다.'
      );
    },
  });

  const order = orderData?.data;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E91E63" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyText}>주문을 찾을 수 없습니다</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[order.status] || '#757575';
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const currentStepIndex = STATUS_FLOW.indexOf(order.status);
  const isCancelled = order.status === 'cancelled' || order.status === 'rejected';
  const canCancel = order.status === 'pending';
  const canReview = order.status === 'delivered';

  const handleCancel = () => {
    Alert.alert('주문 취소', '정말 주문을 취소하시겠습니까?', [
      { text: '아니오', style: 'cancel' },
      {
        text: '취소하기',
        style: 'destructive',
        onPress: () => cancelMutation.mutate(),
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Order Header */}
      <View style={styles.headerSection}>
        <View style={styles.orderNumberRow}>
          <Text style={styles.orderNumber}>
            주문번호 #{order.orderNumber}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor + '15' },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.orderDate}>
          {new Date(order.createdAt).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>

      {/* Status Timeline */}
      {!isCancelled && (
        <View style={styles.timelineSection}>
          <Text style={styles.sectionTitle}>주문 상태</Text>
          {STATUS_FLOW.map((status, index) => {
            const isCompleted = index <= currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isLast = index === STATUS_FLOW.length - 1;

            return (
              <View key={status} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View
                    style={[
                      styles.timelineDot,
                      isCompleted && styles.timelineDotCompleted,
                      isCurrent && styles.timelineDotCurrent,
                    ]}
                  >
                    {isCompleted && !isCurrent && (
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    )}
                  </View>
                  {!isLast && (
                    <View
                      style={[
                        styles.timelineLine,
                        isCompleted && index < currentStepIndex && styles.timelineLineCompleted,
                      ]}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.timelineLabel,
                    isCompleted && styles.timelineLabelCompleted,
                    isCurrent && styles.timelineLabelCurrent,
                  ]}
                >
                  {STATUS_LABELS[status] || status}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Order Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>주문 상품</Text>
        {(order.items || []).map((item: any, index: number) => (
          <View key={index} style={styles.itemRow}>
            <View style={styles.itemIconContainer}>
              <Ionicons name="flower-outline" size={20} color="#E91E63" />
            </View>
            <View style={styles.itemDetails}>
              <Text style={styles.itemName}>
                {item.productSnapshot?.name || item.product?.name || '상품'}
              </Text>
              {item.selectedOptions?.length > 0 && (
                <Text style={styles.itemOption}>
                  {item.selectedOptions
                    .map((o: any) => `${o.name}: ${o.value}`)
                    .join(', ')}
                </Text>
              )}
              {item.selectedAddOns?.length > 0 && (
                <Text style={styles.itemOption}>
                  추가: {item.selectedAddOns.map((a: any) => a.name).join(', ')}
                </Text>
              )}
              <Text style={styles.itemQty}>수량: {item.quantity}</Text>
            </View>
            <Text style={styles.itemPrice}>
              {(item.subtotal || item.price || 0).toLocaleString()}원
            </Text>
          </View>
        ))}
      </View>

      {/* Delivery Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>배달 정보</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>받는 분</Text>
          <Text style={styles.infoValue}>
            {order.delivery?.recipientName || '-'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>연락처</Text>
          <Text style={styles.infoValue}>
            {order.delivery?.recipientPhone || '-'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>주소</Text>
          <Text style={styles.infoValue}>
            {order.delivery?.address || '-'}
            {order.delivery?.addressDetail
              ? ` ${order.delivery.addressDetail}`
              : ''}
          </Text>
        </View>
        {order.delivery?.requestedDate && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>배달 날짜</Text>
            <Text style={styles.infoValue}>
              {order.delivery.requestedDate}
            </Text>
          </View>
        )}
        {order.delivery?.requestedTime && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>배달 시간</Text>
            <Text style={styles.infoValue}>
              {order.delivery.requestedTime}
            </Text>
          </View>
        )}
        {order.delivery?.message && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>메시지</Text>
            <Text style={styles.infoValue}>{order.delivery.message}</Text>
          </View>
        )}
      </View>

      {/* Pricing Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>결제 정보</Text>
        <View style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>상품 금액</Text>
          <Text style={styles.pricingValue}>
            {(order.pricing?.subtotal || 0).toLocaleString()}원
          </Text>
        </View>
        <View style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>배달비</Text>
          <Text style={styles.pricingValue}>
            {(order.pricing?.deliveryFee || 0).toLocaleString()}원
          </Text>
        </View>
        {(order.pricing?.discount || 0) > 0 && (
          <View style={styles.pricingRow}>
            <Text style={styles.pricingLabel}>할인</Text>
            <Text style={[styles.pricingValue, { color: '#E91E63' }]}>
              -{(order.pricing?.discount || 0).toLocaleString()}원
            </Text>
          </View>
        )}
        <View style={styles.pricingDivider} />
        <View style={styles.pricingRow}>
          <Text style={styles.pricingTotalLabel}>총 결제 금액</Text>
          <Text style={styles.pricingTotalValue}>
            {(order.pricing?.total || 0).toLocaleString()}원
          </Text>
        </View>
        <View style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>결제 수단</Text>
          <Text style={styles.pricingValue}>
            {order.payment?.method === 'card'
              ? '카드 결제'
              : order.payment?.method === 'transfer'
              ? '계좌이체'
              : order.payment?.method === 'cash'
              ? '현금 결제'
              : order.payment?.method || '-'}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        {canCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? (
              <ActivityIndicator color="#F44336" size="small" />
            ) : (
              <Text style={styles.cancelButtonText}>주문 취소</Text>
            )}
          </TouchableOpacity>
        )}
        {canReview && (
          <TouchableOpacity
            style={styles.reviewButton}
            onPress={() => router.push(`/review/${order._id}`)}
          >
            <Ionicons name="star-outline" size={18} color="#fff" />
            <Text style={styles.reviewButtonText}>리뷰 작성</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F6',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF8F6',
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
  },
  headerSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orderNumberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  orderDate: {
    fontSize: 13,
    color: '#757575',
    marginTop: 6,
  },
  timelineSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 14,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 40,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 24,
    marginRight: 12,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotCompleted: {
    backgroundColor: '#4CAF50',
  },
  timelineDotCurrent: {
    backgroundColor: '#E91E63',
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 2,
    minHeight: 16,
  },
  timelineLineCompleted: {
    backgroundColor: '#4CAF50',
  },
  timelineLabel: {
    fontSize: 14,
    color: '#BDBDBD',
    paddingTop: 1,
  },
  timelineLabelCompleted: {
    color: '#1A1A1A',
  },
  timelineLabelCurrent: {
    color: '#E91E63',
    fontWeight: '700',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  itemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFF0F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  itemOption: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  itemQty: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E91E63',
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 14,
    color: '#757575',
    width: 80,
  },
  infoValue: {
    fontSize: 14,
    color: '#1A1A1A',
    flex: 1,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  pricingLabel: {
    fontSize: 14,
    color: '#757575',
  },
  pricingValue: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  pricingDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 8,
  },
  pricingTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  pricingTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E91E63',
  },
  actionSection: {
    padding: 16,
    gap: 10,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#F44336',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    color: '#F44336',
    fontWeight: '600',
  },
  reviewButton: {
    backgroundColor: '#E91E63',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  reviewButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
