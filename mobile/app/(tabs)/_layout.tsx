import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUnreadCount } from '@/hooks/useNotifications';

function NotificationBell() {
  const router = useRouter();
  const { data } = useUnreadCount();
  const unreadCount = data?.data?.count || 0;

  return (
    <TouchableOpacity
      onPress={() => router.push('/notifications')}
      style={bellStyles.container}
      activeOpacity={0.7}
    >
      <Ionicons name="notifications-outline" size={24} color="#1A1A1A" />
      {unreadCount > 0 && (
        <View style={bellStyles.badge}>
          <Text style={bellStyles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const bellStyles = StyleSheet.create({
  container: {
    marginRight: 16,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#E91E63',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#E91E63',
        tabBarInactiveTintColor: '#757575',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#F0F0F0',
          height: 88,
          paddingBottom: 28,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#FFF8F6',
        },
        headerTitleStyle: {
          color: '#1A1A1A',
          fontWeight: '700',
          fontSize: 18,
        },
        headerShadowVisible: false,
        headerRight: () => <NotificationBell />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          headerTitle: '어서화',
          headerTitleStyle: {
            color: '#E91E63',
            fontWeight: '800',
            fontSize: 22,
          },
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: '검색',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
          headerTitle: '꽃집 검색',
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: '주문',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
          headerTitle: '주문 내역',
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: 'MY',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          headerTitle: '마이페이지',
        }}
      />
    </Tabs>
  );
}
