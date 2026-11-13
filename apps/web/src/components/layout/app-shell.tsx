'use client';

import * as React from 'react';
import { LogoutButton } from '@/components/auth/logout-button';
import { notify } from '@/components/ui/toaster';
import type { AuthUser } from '@/lib/auth/types';
import { Breadcrumbs, type BreadcrumbItem } from './breadcrumbs';
import { SidebarNav } from './sidebar-nav';
import { TopNav } from './top-nav';

export interface AppShellProps {
  title: string;
  subtitle?: string;
  alertCount?: number;
  user?: AuthUser;
  breadcrumbs?: BreadcrumbItem[];
  topBarActions?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  title,
  subtitle,
  alertCount = 0,
  user,
  breadcrumbs,
  topBarActions,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const combinedActions = (
    <div className="flex items-center gap-2.5">
      {user && (
        <div className="hidden items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs md:flex">
          <span className="font-medium text-slate-800">
            {user.displayName ?? user.email}
          </span>
          {user.displayName && (
            <span className="text-slate-400">({user.email})</span>
          )}
        </div>
      )}
      {topBarActions}
      {user && <LogoutButton />}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SidebarNav
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <TopNav
          title={title}
          subtitle={subtitle}
          alertCount={alertCount}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onAlertClick={() =>
            notify.alert(
              'Safety Alert Center',
              alertCount > 0
                ? `${alertCount} active safety notifications require review.`
                : 'No active safety alerts.',
            )
          }
          actions={combinedActions}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <Breadcrumbs items={breadcrumbs} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
