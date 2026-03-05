'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { RoleGuard } from '@/components/auth/role-guard';
import { AdminSidebar, AdminBottomNav } from '@/components/layout/admin-sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RoleGuard allowedRoles={['admin']}>
        <div className="min-h-screen bg-background flex">
          <AdminSidebar />
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <AdminBottomNav />
        </div>
      </RoleGuard>
    </AuthGuard>
  );
}
