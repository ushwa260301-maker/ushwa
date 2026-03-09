import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '../../lib/api/products';
import { useCartStore } from '../../stores/cart.store';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const addItem = useCartStore((s) => s.addItem);

  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<
    Array<{ name: string; value: string; price: number }>
  >([]);
  const [selectedAddOns, setSelectedAddOns] = useState<
    Array<{ name: string; price: number }>
  >([]);

  const { data: productData, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.getById(id!),
    enabled: !!id,
  });

  const product = productData?.data;

  const totalPrice = useMemo(() => {
    if (!product) return 0;
    const basePrice = product.salePrice || product.price || product.basePrice || 0;
    const optionsPrice = selectedOptions.reduce((sum, o) => sum + o.price, 0);
    const addOnsPrice = selectedAddOns.reduce((sum, a) => sum + a.price, 0);
    return (basePrice + optionsPrice + addOnsPrice) * quantity;
  }, [product, selectedOptions, selectedAddOns, quantity]);

  const handleOptionSelect = (optionGroup: any, choice: any) => {
    setSelectedOptions((prev) => {
      const filtered = prev.filter((o) => o.name !== optionGroup.name);
      return [
        ...filtered,
        { name: optionGroup.name, value: choice.label || choice.value, price: choice.price || 0 },
      ];
    });
  };

  const handleAddOnToggle = (addOn: any) => {
    setSelectedAddOns((prev) => {
      const exists = prev.find((a) => a.name === addOn.name);
      if (exists) {
        return prev.filter((a) => a.name !== addOn.name);
      }
      return [...prev, { name: addOn.name, price: addOn.price || 0 }];
    });
  };

  const handleAddToCart = () => {
    if (!product) return;

    // Check required options
    const options = product.options || [];
    for (const opt of options) {
      if (opt.required) {
        const selected = selectedOptions.find((o) => o.name === opt.name);
        if (!selected) {
          Alert.alert('알림', `${opt.name}을(를) 선택해주세요`);
          return;
        }
      }
    }

    addItem({
      productId: product._id,
      shopId: product.shop?._id || product.shop || '',
      shopName: product.shop?.name || '',
      name: product.name,
      image: product.images?.[0] || product.thumbnail || '',
      price: product.salePrice || product.price || product.basePrice || 0,
      quantity,
      selectedOptions,
      selectedAddOns,
    });

    Alert.alert('장바구니', '상품이 장바구니에 담겼습니다', [
      { text: '계속 쇼핑', style: 'cancel' },
      {
        text: '장바구니 보기',
        onPress: () => router.push('/cart'),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E91E63" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyText}>상품을 찾을 수 없습니다</Text>
      </View>
    );
  }

  const images = product.images || [];
  const options = product.options || [];
  const addOns = product.addOns || [];

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Product Images */}
        {images.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.imageScroll}
          >
            {images.map((img: string, index: number) => (
              <Image
                key={index}
                source={{ uri: img }}
                style={styles.productImage}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="flower-outline" size={64} color="#E91E63" />
          </View>
        )}

        {/* Image Indicator */}
        {images.length > 1 && (
          <View style={styles.imageIndicator}>
            <Text style={styles.imageIndicatorText}>
              {images.length}장의 사진
            </Text>
          </View>
        )}

        {/* Product Info */}
        <View style={styles.infoSection}>
          {product.shop?.name && (
            <TouchableOpacity
              onPress={() =>
                router.push(
                  `/shop/${product.shop?._id || product.shop}`
                )
              }
            >
              <Text style={styles.shopName}>{product.shop.name}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.productName}>{product.name}</Text>
          <View style={styles.priceRow}>
            {product.salePrice ? (
              <>
                <Text style={styles.salePrice}>
                  {product.salePrice.toLocaleString()}원
                </Text>
                <Text style={styles.originalPrice}>
                  {(product.price || product.basePrice || 0).toLocaleString()}원
                </Text>
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>
                    {Math.round(
                      (1 -
                        product.salePrice /
                          (product.price || product.basePrice)) *
                        100
                    )}
                    %
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.price}>
                {(product.price || product.basePrice || 0).toLocaleString()}원
              </Text>
            )}
          </View>
          {product.description && (
            <Text style={styles.description}>{product.description}</Text>
          )}
        </View>

        {/* Options */}
        {options.length > 0 && (
          <View style={styles.optionSection}>
            <Text style={styles.sectionTitle}>옵션 선택</Text>
            {options.map((optionGroup: any, gIdx: number) => (
              <View key={gIdx} style={styles.optionGroup}>
                <Text style={styles.optionGroupName}>
                  {optionGroup.name}
                  {optionGroup.required && (
                    <Text style={styles.requiredMark}> *</Text>
                  )}
                </Text>
                <View style={styles.optionChoices}>
                  {(optionGroup.choices || optionGroup.values || []).map(
                    (choice: any, cIdx: number) => {
                      const isSelected = selectedOptions.some(
                        (o) =>
                          o.name === optionGroup.name &&
                          o.value === (choice.label || choice.value)
                      );
                      return (
                        <TouchableOpacity
                          key={cIdx}
                          style={[
                            styles.optionChip,
                            isSelected && styles.optionChipActive,
                          ]}
                          onPress={() =>
                            handleOptionSelect(optionGroup, choice)
                          }
                        >
                          <Text
                            style={[
                              styles.optionChipText,
                              isSelected && styles.optionChipTextActive,
                            ]}
                          >
                            {choice.label || choice.value}
                            {choice.price
                              ? ` (+${choice.price.toLocaleString()}원)`
                              : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Add-ons */}
        {addOns.length > 0 && (
          <View style={styles.optionSection}>
            <Text style={styles.sectionTitle}>추가 상품</Text>
            {addOns.map((addOn: any, idx: number) => {
              const isSelected = selectedAddOns.some(
                (a) => a.name === addOn.name
              );
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.addOnItem,
                    isSelected && styles.addOnItemActive,
                  ]}
                  onPress={() => handleAddOnToggle(addOn)}
                >
                  <View style={styles.addOnLeft}>
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxActive,
                      ]}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.addOnName}>{addOn.name}</Text>
                  </View>
                  <Text style={styles.addOnPrice}>
                    +{(addOn.price || 0).toLocaleString()}원
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Quantity */}
        <View style={styles.quantitySection}>
          <Text style={styles.sectionTitle}>수량</Text>
          <View style={styles.quantityControl}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Ionicons name="remove" size={20} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity((q) => q + 1)}
            >
              <Ionicons name="add" size={20} color="#1A1A1A" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.totalPriceContainer}>
          <Text style={styles.totalLabel}>총 금액</Text>
          <Text style={styles.totalPrice}>
            {totalPrice.toLocaleString()}원
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addToCartButton}
          onPress={handleAddToCart}
        >
          <Ionicons name="cart-outline" size={20} color="#fff" />
          <Text style={styles.addToCartText}>장바구니 담기</Text>
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
  container: {
    flex: 1,
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
    textAlign: 'center',
  },
  imageScroll: {
    height: 300,
  },
  productImage: {
    width: SCREEN_WIDTH,
    height: 300,
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: 300,
    backgroundColor: '#FFF0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageIndicator: {
    position: 'absolute',
    top: 270,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageIndicatorText: {
    color: '#fff',
    fontSize: 12,
  },
  infoSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  shopName: {
    fontSize: 13,
    color: '#E91E63',
    fontWeight: '600',
    marginBottom: 4,
  },
  productName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  price: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#E91E63',
  },
  salePrice: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#E91E63',
  },
  originalPrice: {
    fontSize: 16,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    backgroundColor: '#E91E63',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
    marginTop: 12,
  },
  optionSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  optionGroup: {
    marginBottom: 16,
  },
  optionGroupName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  requiredMark: {
    color: '#E91E63',
  },
  optionChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  optionChipActive: {
    borderColor: '#E91E63',
    backgroundColor: '#FFF0F5',
  },
  optionChipText: {
    fontSize: 13,
    color: '#757575',
  },
  optionChipTextActive: {
    color: '#E91E63',
    fontWeight: '600',
  },
  addOnItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
  },
  addOnItemActive: {
    borderColor: '#E91E63',
    backgroundColor: '#FFF0F5',
  },
  addOnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#E91E63',
    borderColor: '#E91E63',
  },
  addOnName: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  addOnPrice: {
    fontSize: 14,
    color: '#E91E63',
    fontWeight: '600',
  },
  quantitySection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    minWidth: 24,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
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
  totalPriceContainer: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 12,
    color: '#757575',
  },
  totalPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  addToCartButton: {
    backgroundColor: '#E91E63',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  addToCartText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
