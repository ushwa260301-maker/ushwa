import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { shopsApi, categoriesApi } from '@/lib/api';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    params.category || null
  );

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll,
  });

  const shopsQuery = useQuery({
    queryKey: ['shops', searchText, selectedCategory],
    queryFn: () =>
      shopsApi.getList({
        search: searchText || undefined,
        category: selectedCategory || undefined,
        limit: 20,
      }),
  });

  const categories = categoriesQuery.data?.data || [];
  const shops = shopsQuery.data?.data || [];

  const renderShopItem = useCallback(
    ({ item }: { item: any }) => (
      <TouchableOpacity
        style={styles.shopCard}
        onPress={() => router.push(`/shop/${item._id}`)}
      >
        <View style={styles.shopImageContainer}>
          {item.coverImage ? (
            <Image source={{ uri: item.coverImage }} style={styles.shopImage} />
          ) : (
            <View style={styles.shopImagePlaceholder}>
              <Ionicons name="storefront-outline" size={32} color="#E91E63" />
            </View>
          )}
        </View>
        <View style={styles.shopInfo}>
          <Text style={styles.shopName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.shopDescription} numberOfLines={2}>
            {item.description || '신선한 꽃을 만나보세요'}
          </Text>
          <View style={styles.shopMeta}>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#FFB800" />
              <Text style={styles.ratingText}>{item.rating?.toFixed(1) || '0.0'}</Text>
            </View>
            {item.isOpen !== undefined && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: item.isOpen ? '#E8F5E9' : '#FAFAFA' },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: item.isOpen ? '#4CAF50' : '#757575' },
                  ]}
                >
                  {item.isOpen ? '영업 중' : '준비 중'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    ),
    []
  );

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#757575" />
        <TextInput
          style={styles.searchInput}
          placeholder="꽃집 이름이나 상품을 검색하세요"
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Chips */}
      <FlatList
        data={categories}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryList}
        contentContainerStyle={styles.categoryContent}
        keyExtractor={(item: any) => item._id}
        renderItem={({ item }: { item: any }) => (
          <TouchableOpacity
            style={[
              styles.categoryChip,
              selectedCategory === item.slug && styles.categoryChipActive,
            ]}
            onPress={() =>
              setSelectedCategory(selectedCategory === item.slug ? null : item.slug)
            }
          >
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === item.slug && styles.categoryChipTextActive,
              ]}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Shop List */}
      {shopsQuery.isLoading ? (
        <ActivityIndicator color="#E91E63" style={styles.loader} />
      ) : (
        <FlatList
          data={shops}
          renderItem={renderShopItem}
          keyExtractor={(item: any) => item._id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color="#E0E0E0" />
              <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A1A',
  },
  categoryList: {
    maxHeight: 50,
    marginTop: 12,
  },
  categoryContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryChipActive: {
    backgroundColor: '#E91E63',
    borderColor: '#E91E63',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#757575',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  shopCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 4,
  },
  shopImageContainer: {
    width: 110,
    height: 110,
  },
  shopImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  shopImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFF0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  shopName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  shopDescription: {
    fontSize: 13,
    color: '#757575',
    lineHeight: 18,
    marginBottom: 8,
  },
  shopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#757575',
  },
});
