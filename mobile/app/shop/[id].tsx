import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { shopsApi } from '../../lib/api/shops';
import { Ionicons } from '@expo/vector-icons';

export default function ShopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: shopData, isLoading: shopLoading } = useQuery({
    queryKey: ['shop', id],
    queryFn: () => shopsApi.getById(id!),
    enabled: !!id,
  });

  const { data: productsData } = useQuery({
    queryKey: ['shopProducts', id],
    queryFn: () => shopsApi.getProducts(id!),
    enabled: !!id,
  });

  const shop = shopData?.data;
  const products = productsData?.data?.docs || productsData?.data || [];

  if (shopLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E91E63" />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyText}>꽃집을 찾을 수 없습니다</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Shop Header */}
      <Image
        source={{
          uri:
            shop.profileImage ||
            shop.images?.[0] ||
            'https://via.placeholder.com/400x200',
        }}
        style={styles.coverImage}
      />
      <View style={styles.shopInfo}>
        <Text style={styles.shopName}>{shop.name}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={16} color="#FFB800" />
          <Text style={styles.ratingText}>
            {shop.rating?.average?.toFixed(1) || '0.0'}
          </Text>
          <Text style={styles.reviewCount}>
            리뷰 {shop.rating?.count || 0}
          </Text>
        </View>
        {shop.description && (
          <Text style={styles.description}>{shop.description}</Text>
        )}
        <View style={styles.deliveryInfo}>
          <Text style={styles.deliveryText}>
            배달비{' '}
            {(
              shop.deliveryInfo?.fee ||
              shop.deliveryInfo?.deliveryFee ||
              3000
            ).toLocaleString()}
            원
          </Text>
          <Text style={styles.deliveryText}>
            최소주문{' '}
            {(shop.deliveryInfo?.minOrderAmount || 20000).toLocaleString()}원
          </Text>
        </View>
      </View>

      {/* Products */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>메뉴</Text>
        {products.length === 0 ? (
          <Text style={styles.emptyText}>등록된 상품이 없습니다</Text>
        ) : (
          products.map((product: any) => (
            <TouchableOpacity
              key={product._id}
              style={styles.productItem}
              onPress={() => router.push(`/product/${product._id}`)}
            >
              <Image
                source={{
                  uri:
                    product.thumbnail ||
                    product.images?.[0] ||
                    'https://via.placeholder.com/80',
                }}
                style={styles.productImage}
              />
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{product.name}</Text>
                {product.description && (
                  <Text style={styles.productDesc} numberOfLines={2}>
                    {product.description}
                  </Text>
                )}
                <View style={styles.priceRow}>
                  {product.salePrice ? (
                    <>
                      <Text style={styles.salePrice}>
                        {product.salePrice.toLocaleString()}원
                      </Text>
                      <Text style={styles.originalPrice}>
                        {product.price.toLocaleString()}원
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.price}>
                      {(product.price || product.basePrice || 0).toLocaleString()}원
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF8F6',
  },
  coverImage: {
    width: '100%',
    height: 200,
  },
  shopInfo: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  shopName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginLeft: 4,
  },
  reviewCount: {
    fontSize: 13,
    color: '#757575',
    marginLeft: 8,
  },
  description: {
    fontSize: 14,
    color: '#757575',
    marginTop: 8,
    lineHeight: 20,
  },
  deliveryInfo: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 12,
  },
  deliveryText: {
    fontSize: 13,
    color: '#757575',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 20,
  },
  productItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  productDesc: {
    fontSize: 13,
    color: '#757575',
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  price: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#E91E63',
  },
  salePrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#E91E63',
  },
  originalPrice: {
    fontSize: 13,
    color: '#999',
    textDecorationLine: 'line-through',
    marginLeft: 6,
  },
});
