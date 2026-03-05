'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { RoleGuard } from '@/components/auth/role-guard';
import { OwnerSidebar, OwnerBottomNav } from '@/components/layout/owner-sidebar';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RoleGuard allowedRoles={['owner']}>
        <div className="min-h-screen bg-background flex">
          <OwnerSidebar />
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <OwnerBottomNav />
        </div>
      </RoleGuard>
    </AuthGuard>
  );
}
