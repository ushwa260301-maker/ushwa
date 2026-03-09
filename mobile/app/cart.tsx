import React from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '../stores/cart.store';
import { useAuthStore } from '../stores/auth.store';

export default function CartScreen() {
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const clearCart = useCartStore((s) => s.clearCart);
  const getTotal = useCartStore((s) => s.getTotal);
  const getDeliveryFee = useCartStore((s) => s.getDeliveryFee);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const subtotal = getTotal();
  const deliveryFee = items.length > 0 ? getDeliveryFee() : 0;
  const total = subtotal + deliveryFee;

  const handleRemoveItem = (productId: string, name: string) => {
    Alert.alert('삭제', `${name}을(를) 장바구니에서 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => removeItem(productId) },
    ]);
  };

  const handleClearCart = () => {
    Alert.alert('장바구니 비우기', '장바구니를 비우시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '비우기', style: 'destructive', onPress: () => clearCart() },
    ]);
  };

  const handleCheckout = () => {
    if (!isAuthenticated) {
      Alert.alert('로그인 필요', '주문하려면 로그인이 필요합니다', [
        { text: '취소', style: 'cancel' },
        { text: '로그인', onPress: () => router.push('/(auth)/login') },
      ]);
      return;
    }
    router.push('/checkout');
  };

  const renderCartItem = ({ item }: { item: any }) => {
    const itemOptionPrice = item.selectedOptions.reduce(
      (s: number, o: any) => s + o.price,
      0
    );
    const itemAddOnPrice = item.selectedAddOns.reduce(
      (s: number, a: any) => s + a.price,
      0
    );
    const itemTotal = (item.price + itemOptionPrice + itemAddOnPrice) * item.quantity;

    return (
      <View style={styles.cartItem}>
        <Image
          source={{
            uri: item.image || 'https://via.placeholder.com/70',
          }}
          style={styles.itemImage}
        />
        <View style={styles.itemInfo}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <TouchableOpacity
              onPress={() => handleRemoveItem(item.productId, item.name)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Options */}
          {item.selectedOptions.length > 0 && (
            <Text style={styles.optionText}>
              {item.selectedOptions
                .map((o: any) => `${o.name}: ${o.value}`)
                .join(', ')}
            </Text>
          )}
          {item.selectedAddOns.length > 0 && (
            <Text style={styles.optionText}>
              추가: {item.selectedAddOns.map((a: any) => a.name).join(', ')}
            </Text>
          )}

          <View style={styles.itemBottom}>
            <Text style={styles.itemPrice}>
              {itemTotal.toLocaleString()}원
            </Text>
            <View style={styles.quantityControl}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() =>
                  updateQuantity(item.productId, item.quantity - 1)
                }
              >
                <Ionicons name="remove" size={16} color="#1A1A1A" />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{item.quantity}</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() =>
                  updateQuantity(item.productId, item.quantity + 1)
                }
              >
                <Ionicons name="add" size={16} color="#1A1A1A" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={64} color="#E0E0E0" />
        <Text style={styles.emptyTitle}>장바구니가 비어있습니다</Text>
        <Text style={styles.emptySubtitle}>
          예쁜 꽃을 담아보세요
        </Text>
        <TouchableOpacity
          style={styles.shopButton}
          onPress={() => router.push('/(tabs)')}
        >
          <Text style={styles.shopButtonText}>쇼핑하러 가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Shop Name Header */}
      <View style={styles.shopHeader}>
        <Ionicons name="storefront-outline" size={18} color="#E91E63" />
        <Text style={styles.shopName}>{items[0]?.shopName || '꽃집'}</Text>
        <TouchableOpacity onPress={handleClearCart}>
          <Text style={styles.clearText}>비우기</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        renderItem={renderCartItem}
        keyExtractor={(item) => item.productId}
        contentContainerStyle={styles.listContent}
      />

      {/* Price Summary */}
      <View style={styles.summaryContainer}>
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
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>총 결제 금액</Text>
          <Text style={styles.totalValue}>
            {total.toLocaleString()}원
          </Text>
        </View>
      </View>

      {/* Checkout Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.checkoutButton}
          onPress={handleCheckout}
        >
          <Text style={styles.checkoutText}>
            {total.toLocaleString()}원 주문하기
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#FFF8F6',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#FFF8F6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
  },
  shopButton: {
    backgroundColor: '#E91E63',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  shopButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  shopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 6,
  },
  shopName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  clearText: {
    fontSize: 13,
    color: '#999',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  itemImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
    marginRight: 8,
  },
  optionText: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  itemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#E91E63',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    minWidth: 20,
    textAlign: 'center',
  },
  summaryContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
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
  divider: {
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
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  checkoutButton: {
    backgroundColor: '#E91E63',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkoutText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
});
