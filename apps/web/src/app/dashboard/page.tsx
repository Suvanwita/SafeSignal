import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { BRAND_TAGLINE } from '@/components/layout/navigation.config';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
} from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { requireServerSession } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard — SafeSignal',
};

export default async function DashboardPage() {
  const user = await requireServerSession('/dashboard');

  return (
    <AppShell
      title="Security Dashboard"
      subtitle={BRAND_TAGLINE}
      user={user}
      alertCount={0}
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Authenticated Workspace</CardTitle>
              <CardDescription>
                Signed in as{' '}
                <span className="font-medium text-slate-700">{user.email}</span>
              </CardDescription>
            </div>
            <StatusBadge status="secure" label="Session Verified" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Account Status"
            value={user.isActive ? 'Active' : 'Inactive'}
            tone="verified"
            icon={<ShieldCheck className="h-4 w-4" />}
            detail="Verified via server-backed JWT session"
          />
          <MetricCard
            label="Session Protection"
            value="HttpOnly"
            tone="verified"
            detail="SameSite=Lax cookie + CSRF double-submit token"
          />
          <MetricCard
            label="Active Alerts"
            value="0"
            detail="Safety monitoring modules ready for activation"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Summary</CardTitle>
          <CardDescription>
            Live profile fetched from the NestJS authentication API (
            <code>GET /api/v1/auth/me</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs font-medium text-slate-500 uppercase">
              User ID
            </p>
            <p className="mt-1 font-mono text-xs text-slate-800">{user.id}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs font-medium text-slate-500 uppercase">
              Display Name
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-slate-900">
                {user.displayName ?? 'Not set'}
              </span>
              <Badge variant="verified" dot>
                Authenticated
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
