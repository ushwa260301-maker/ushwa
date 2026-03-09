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
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewsApi } from '../../lib/api/reviews';
import { ordersApi } from '../../lib/api/orders';
import { Ionicons } from '@expo/vector-icons';

export default function ReviewScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');

  const { data: orderData } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.getById(orderId!),
    enabled: !!orderId,
  });

  const order = orderData?.data;

  const submitMutation = useMutation({
    mutationFn: (formData: FormData) => reviewsApi.create(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      Alert.alert('리뷰 등록', '리뷰가 등록되었습니다!', [
        {
          text: '확인',
          onPress: () => router.back(),
        },
      ]);
    },
    onError: (error: any) => {
      Alert.alert(
        '등록 실패',
        error?.response?.data?.message || '리뷰 등록에 실패했습니다.'
      );
    },
  });

  const handleSubmit = () => {
    if (!content.trim()) {
      Alert.alert('알림', '리뷰 내용을 입력해주세요');
      return;
    }
    if (content.trim().length < 10) {
      Alert.alert('알림', '리뷰는 10자 이상 입력해주세요');
      return;
    }

    const formData = new FormData();
    formData.append('order', orderId!);
    if (order?.shop?._id || order?.shop) {
      formData.append('shop', order.shop._id || order.shop);
    }
    formData.append('rating', String(rating));
    formData.append('content', content.trim());

    submitMutation.mutate(formData);
  };

  const renderStars = () => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => setRating(star)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={star <= rating ? 'star' : 'star-outline'}
              size={40}
              color={star <= rating ? '#FFB800' : '#E0E0E0'}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const getRatingLabel = () => {
    switch (rating) {
      case 1:
        return '별로예요';
      case 2:
        return '그저 그래요';
      case 3:
        return '보통이에요';
      case 4:
        return '좋아요';
      case 5:
        return '최고예요!';
      default:
        return '';
    }
  };

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
        {/* Order Info */}
        {order && (
          <View style={styles.orderInfo}>
            <View style={styles.orderIconContainer}>
              <Ionicons name="flower-outline" size={24} color="#E91E63" />
            </View>
            <View style={styles.orderDetails}>
              <Text style={styles.orderShop}>
                {order.shop?.name || '꽃집'}
              </Text>
              <Text style={styles.orderItems} numberOfLines={1}>
                {order.items
                  ?.map(
                    (item: any) =>
                      item.productSnapshot?.name || item.product?.name || '상품'
                  )
                  .join(', ')}
              </Text>
            </View>
          </View>
        )}

        {/* Star Rating */}
        <View style={styles.ratingSection}>
          <Text style={styles.ratingTitle}>만족도를 선택해주세요</Text>
          {renderStars()}
          <Text style={styles.ratingLabel}>{getRatingLabel()}</Text>
        </View>

        {/* Review Text */}
        <View style={styles.reviewSection}>
          <Text style={styles.reviewTitle}>리뷰를 작성해주세요</Text>
          <TextInput
            style={styles.reviewInput}
            value={content}
            onChangeText={setContent}
            placeholder="꽃의 상태, 배달 서비스 등에 대한 솔직한 리뷰를 남겨주세요 (10자 이상)"
            placeholderTextColor="#BDBDBD"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>
            {content.length}/500
          </Text>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            submitMutation.isPending && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>리뷰 등록</Text>
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
    paddingBottom: 100,
  },
  orderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
  orderShop: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  orderItems: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  ratingSection: {
    backgroundColor: '#fff',
    padding: 24,
    marginTop: 8,
    alignItems: 'center',
  },
  ratingTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingLabel: {
    fontSize: 15,
    color: '#E91E63',
    fontWeight: '600',
    marginTop: 12,
  },
  reviewSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  reviewInput: {
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1A1A1A',
    minHeight: 150,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 6,
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
  submitButton: {
    backgroundColor: '#E91E63',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
});
