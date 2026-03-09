import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../stores/auth.store';
import { StatusBar } from 'expo-status-bar';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function AuthInit({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);
  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInit>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#FFFFFF' },
            headerTintColor: '#E91E63',
            headerTitleStyle: { fontWeight: '600', color: '#1A1A1A' },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="shop/[id]" options={{ title: '꽃집' }} />
          <Stack.Screen name="product/[id]" options={{ title: '상품 상세' }} />
          <Stack.Screen name="cart" options={{ title: '장바구니' }} />
          <Stack.Screen name="checkout" options={{ title: '주문/결제' }} />
          <Stack.Screen name="order/[id]" options={{ title: '주문 상세' }} />
          <Stack.Screen name="review/[orderId]" options={{ title: '리뷰 작성' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: '정보' }} />
        </Stack>
      </AuthInit>
    </QueryClientProvider>
  );
}
