'use client';

import * as React from 'react';
import { notify } from '@/components/ui/toaster';
import { SidebarNav } from './sidebar-nav';
import { TopNav } from './top-nav';

export interface AppShellProps {
  title: string;
  subtitle?: string;
  alertCount?: number;
  topBarActions?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  title,
  subtitle,
  alertCount = 0,
  topBarActions,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SidebarNav
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        onNavigate={(item) => {
          if (item.href !== '/') {
            notify.info(
              `${item.label} module`,
              'Module route scaffolding will be connected in upcoming milestones.',
            );
          }
        }}
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
          actions={topBarActions}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
