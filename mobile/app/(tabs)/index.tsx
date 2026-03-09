import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi, shopsApi, productsApi } from '@/lib/api';

const CATEGORY_ICONS: Record<string, string> = {
  bouquet: 'flower-outline',
  basket: 'basket-outline',
  plant: 'leaf-outline',
  wreath: 'ellipse-outline',
  default: 'pricetag-outline',
};

export default function HomeScreen() {
  const [refreshing, setRefreshing] = React.useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll,
  });

  const shopsQuery = useQuery({
    queryKey: ['shops', 'popular'],
    queryFn: () => shopsApi.getList({ sort: 'rating', limit: 6 }),
  });

  const featuredQuery = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: productsApi.getFeatured,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      categoriesQuery.refetch(),
      shopsQuery.refetch(),
      featuredQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const categories = categoriesQuery.data?.data || [];
  const shops = shopsQuery.data?.data || [];
  const featuredProducts = featuredQuery.data?.data || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E91E63" />
      }
    >
      {/* Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>특별한 날,{'\n'}꽃으로 마음을 전하세요</Text>
        <Text style={styles.bannerSubtitle}>신선한 꽃을 당일 배달해 드립니다</Text>
      </View>

      {/* Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>카테고리</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {categories.length > 0 ? (
            categories.map((cat: any) => (
              <TouchableOpacity
                key={cat._id}
                style={styles.categoryItem}
                onPress={() => router.push(`/(tabs)/search?category=${cat.slug}`)}
              >
                <View style={styles.categoryIcon}>
                  <Ionicons
                    name={(CATEGORY_ICONS[cat.slug] || CATEGORY_ICONS.default) as any}
                    size={24}
                    color="#E91E63"
                  />
                </View>
                <Text style={styles.categoryName}>{cat.name}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCategories}>
              {['꽃다발', '꽃바구니', '화분', '화환', '드라이플라워'].map((name, i) => (
                <TouchableOpacity key={i} style={styles.categoryItem}>
                  <View style={styles.categoryIcon}>
                    <Ionicons name="flower-outline" size={24} color="#E91E63" />
                  </View>
                  <Text style={styles.categoryName}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Popular Shops */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>인기 꽃집</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/search')}>
            <Text style={styles.seeAll}>더보기</Text>
          </TouchableOpacity>
        </View>
        {shopsQuery.isLoading ? (
          <ActivityIndicator color="#E91E63" style={styles.loader} />
        ) : shops.length > 0 ? (
          <FlatList
            data={shops}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item: any) => item._id}
            renderItem={({ item }: { item: any }) => (
              <TouchableOpacity
                style={styles.shopCard}
                onPress={() => router.push(`/shop/${item._id}`)}
              >
                <View style={styles.shopImagePlaceholder}>
                  {item.coverImage ? (
                    <Image source={{ uri: item.coverImage }} style={styles.shopImage} />
                  ) : (
                    <Ionicons name="storefront-outline" size={32} color="#E91E63" />
                  )}
                </View>
                <Text style={styles.shopName} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.shopRating}>
                  <Ionicons name="star" size={12} color="#FFB800" />
                  <Text style={styles.shopRatingText}>
                    {item.rating?.toFixed(1) || '0.0'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        ) : (
          <Text style={styles.emptyText}>아직 등록된 꽃집이 없습니다</Text>
        )}
      </View>

      {/* Featured Products */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>추천 상품</Text>
        </View>
        {featuredQuery.isLoading ? (
          <ActivityIndicator color="#E91E63" style={styles.loader} />
        ) : featuredProducts.length > 0 ? (
          <View style={styles.productGrid}>
            {featuredProducts.slice(0, 4).map((product: any) => (
              <TouchableOpacity
                key={product._id}
                style={styles.productCard}
                onPress={() => router.push(`/product/${product._id}`)}
              >
                <View style={styles.productImagePlaceholder}>
                  {product.images?.[0] ? (
                    <Image
                      source={{ uri: product.images[0] }}
                      style={styles.productImage}
                    />
                  ) : (
                    <Ionicons name="flower-outline" size={36} color="#E91E63" />
                  )}
                </View>
                <Text style={styles.productName} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={styles.productPrice}>
                  {product.basePrice?.toLocaleString()}원
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>추천 상품이 없습니다</Text>
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
  content: {
    paddingBottom: 20,
  },
  banner: {
    backgroundColor: '#E91E63',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 24,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 32,
    marginBottom: 8,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  section: {
    marginTop: 28,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 14,
  },
  seeAll: {
    fontSize: 13,
    color: '#E91E63',
    fontWeight: '600',
    marginBottom: 14,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: 20,
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF0F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 12,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  emptyCategories: {
    flexDirection: 'row',
  },
  shopCard: {
    width: 140,
    marginRight: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  shopImagePlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: '#FFF0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  shopName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  shopRating: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 4,
    gap: 4,
  },
  shopRatingText: {
    fontSize: 12,
    color: '#757575',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  productImagePlaceholder: {
    width: '100%',
    height: 140,
    backgroundColor: '#FFF0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E91E63',
    paddingHorizontal: 10,
    paddingBottom: 12,
    paddingTop: 4,
  },
  loader: {
    paddingVertical: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: '#757575',
    fontSize: 14,
    paddingVertical: 20,
  },
});
