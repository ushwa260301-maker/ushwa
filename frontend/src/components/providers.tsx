'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { Toaster } from '@/components/ui/sonner';

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        {children}
        <Toaster richColors position="top-right" />
      </AuthInitializer>
    </QueryClientProvider>
  );
}
