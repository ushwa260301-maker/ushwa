import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { ordersApi, CreateOrderData } from '../lib/api/orders';
import { useCartStore } from '../stores/cart.store';
import { useAuthStore } from '../stores/auth.store';

type PaymentMethod = 'card' | 'transfer' | 'cash';

export default function CheckoutScreen() {
  const items = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);
  const getDeliveryFee = useCartStore((s) => s.getDeliveryFee);
  const clearCart = useCartStore((s) => s.clearCart);
  const user = useAuthStore((s) => s.user);

  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [message, setMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');

  const subtotal = getTotal();
  const deliveryFee = getDeliveryFee();
  const total = subtotal + deliveryFee;

  const createOrderMutation = useMutation({
    mutationFn: (data: CreateOrderData) => ordersApi.create(data),
    onSuccess: (res) => {
      clearCart();
      Alert.alert('주문 완료', '주문이 완료되었습니다!', [
        {
          text: '주문 확인',
          onPress: () => router.replace(`/order/${res.data?._id || res.data?.order?._id}`),
        },
      ]);
    },
    onError: (error: any) => {
      Alert.alert(
        '주문 실패',
        error?.response?.data?.message || '주문에 실패했습니다. 다시 시도해주세요.'
      );
    },
  });

  const handleOrder = () => {
    if (!recipientName.trim()) {
      Alert.alert('알림', '받는 분 이름을 입력해주세요');
      return;
    }
    if (!recipientPhone.trim()) {
      Alert.alert('알림', '받는 분 연락처를 입력해주세요');
      return;
    }
    if (!address.trim()) {
      Alert.alert('알림', '배달 주소를 입력해주세요');
      return;
    }

    const orderData: CreateOrderData = {
      shop: items[0]?.shopId || '',
      items: items.map((item) => ({
        product: item.productId,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions,
        selectedAddOns: item.selectedAddOns,
      })),
      delivery: {
        type: 'delivery',
        address: address.trim(),
        addressDetail: addressDetail.trim(),
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        requestedDate: requestedDate.trim() || undefined,
        requestedTime: requestedTime.trim() || undefined,
        message: message.trim() || undefined,
      },
      payment: {
        method: paymentMethod,
      },
    };

    createOrderMutation.mutate(orderData);
  };

  const paymentOptions: Array<{ value: PaymentMethod; label: string; icon: string }> = [
    { value: 'card', label: '카드 결제', icon: 'card-outline' },
    { value: 'transfer', label: '계좌이체', icon: 'swap-horizontal-outline' },
    { value: 'cash', label: '현금 결제', icon: 'cash-outline' },
  ];

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={48} color="#E0E0E0" />
        <Text style={styles.emptyText}>장바구니가 비어있습니다</Text>
        <TouchableOpacity
          style={styles.goBackButton}
          onPress={() => router.back()}
        >
          <Text style={styles.goBackText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Delivery Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>배달 정보</Text>

          <Text style={styles.inputLabel}>받는 분 이름 *</Text>
          <TextInput
            style={styles.input}
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="이름을 입력해주세요"
            placeholderTextColor="#BDBDBD"
          />

          <Text style={styles.inputLabel}>받는 분 연락처 *</Text>
          <TextInput
            style={styles.input}
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            placeholder="010-0000-0000"
            placeholderTextColor="#BDBDBD"
            keyboardType="phone-pad"
          />

          <Text style={styles.inputLabel}>배달 주소 *</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="주소를 입력해주세요"
            placeholderTextColor="#BDBDBD"
          />

          <Text style={styles.inputLabel}>상세 주소</Text>
          <TextInput
            style={styles.input}
            value={addressDetail}
            onChangeText={setAddressDetail}
            placeholder="동/호수 등 상세 주소"
            placeholderTextColor="#BDBDBD"
          />

          <Text style={styles.inputLabel}>희망 배달 날짜</Text>
          <TextInput
            style={styles.input}
            value={requestedDate}
            onChangeText={setRequestedDate}
            placeholder="예: 2026-03-15"
            placeholderTextColor="#BDBDBD"
          />

          <Text style={styles.inputLabel}>희망 배달 시간</Text>
          <TextInput
            style={styles.input}
            value={requestedTime}
            onChangeText={setRequestedTime}
            placeholder="예: 14:00"
            placeholderTextColor="#BDBDBD"
          />

          <Text style={styles.inputLabel}>카드 메시지</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            value={message}
            onChangeText={setMessage}
            placeholder="꽃과 함께 전할 메시지를 적어주세요"
            placeholderTextColor="#BDBDBD"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>주문 내역</Text>
          {items.map((item) => {
            const optionPrice = item.selectedOptions.reduce(
              (s, o) => s + o.price,
              0
            );
            const addOnPrice = item.selectedAddOns.reduce(
              (s, a) => s + a.price,
              0
            );
            const itemTotal =
              (item.price + optionPrice + addOnPrice) * item.quantity;

            return (
              <View key={item.productId} style={styles.orderItem}>
                <View style={styles.orderItemTop}>
                  <Text style={styles.orderItemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.orderItemQty}>x{item.quantity}</Text>
                </View>
                {item.selectedOptions.length > 0 && (
                  <Text style={styles.orderItemOption}>
                    {item.selectedOptions
                      .map((o) => `${o.name}: ${o.value}`)
                      .join(', ')}
                  </Text>
                )}
                {item.selectedAddOns.length > 0 && (
                  <Text style={styles.orderItemOption}>
                    추가: {item.selectedAddOns.map((a) => a.name).join(', ')}
                  </Text>
                )}
                <Text style={styles.orderItemPrice}>
                  {itemTotal.toLocaleString()}원
                </Text>
              </View>
            );
          })}
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>결제 수단</Text>
          {paymentOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.paymentOption,
                paymentMethod === option.value && styles.paymentOptionActive,
              ]}
              onPress={() => setPaymentMethod(option.value)}
            >
              <View style={styles.paymentLeft}>
                <View
                  style={[
                    styles.radioOuter,
                    paymentMethod === option.value && styles.radioOuterActive,
                  ]}
                >
                  {paymentMethod === option.value && (
                    <View style={styles.radioInner} />
                  )}
                </View>
                <Ionicons
                  name={option.icon as any}
                  size={20}
                  color={
                    paymentMethod === option.value ? '#E91E63' : '#757575'
                  }
                />
                <Text
                  style={[
                    styles.paymentLabel,
                    paymentMethod === option.value &&
                      styles.paymentLabelActive,
                  ]}
                >
                  {option.label}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Price Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>결제 금액</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>상품 금액</Text>
            <Text style={styles.summaryValue}>
              {subtotal.toLocaleString()}원
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>배달비</Text>
            <Text style={styles.summaryValue}>
              {deliveryFee.toLocaleString()}원
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>총 결제 금액</Text>
            <Text style={styles.totalValue}>
              {total.toLocaleString()}원
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.orderButton,
            createOrderMutation.isPending && styles.orderButtonDisabled,
          ]}
          onPress={handleOrder}
          disabled={createOrderMutation.isPending}
        >
          {createOrderMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.orderButtonText}>
              {total.toLocaleString()}원 결제하기
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#FFF8F6',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#FFF8F6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#757575',
  },
  goBackButton: {
    backgroundColor: '#E91E63',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  goBackText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A1A1A',
  },
  messageInput: {
    height: 80,
    paddingTop: 12,
  },
  orderItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  orderItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  orderItemQty: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 8,
  },
  orderItemOption: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E91E63',
    marginTop: 4,
    textAlign: 'right',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    marginBottom: 8,
  },
  paymentOptionActive: {
    borderColor: '#E91E63',
    backgroundColor: '#FFF0F5',
  },
  paymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: '#E91E63',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E91E63',
  },
  paymentLabel: {
    fontSize: 15,
    color: '#757575',
  },
  paymentLabelActive: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#757575',
  },
  summaryValue: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E91E63',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 4,
  },
  orderButton: {
    backgroundColor: '#E91E63',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  orderButtonDisabled: {
    opacity: 0.7,
  },
  orderButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
});
