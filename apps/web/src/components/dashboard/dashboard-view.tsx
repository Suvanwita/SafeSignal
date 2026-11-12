'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileLock2,
  FolderLock,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { BRAND_TAGLINE } from '@/components/layout/navigation.config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type SafeSignalStatus } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { notify } from '@/components/ui/toaster';
import type { AuthUser } from '@/lib/auth/types';
import type {
  DashboardOverview,
  IncidentSeverity,
  IncidentStatus,
  RecommendationPriority,
} from '@/lib/dashboard/types';

export interface DashboardViewProps {
  user: AuthUser;
  initialOverview: DashboardOverview | null;
}

const EMPTY_OVERVIEW: DashboardOverview = {
  summary: {
    totalIncidents: 0,
    openIncidents: 0,
    escalatedIncidents: 0,
    evidenceRecords: 0,
    suspiciousProfiles: 0,
    officialAccounts: 0,
  },
  recentActivity: [],
  recentIncidents: [],
  recommendations: [],
};

const QUICK_ACTIONS = [
  {
    id: 'report-abuse',
    title: 'Report abuse',
    description: 'Log impersonation, phishing, or harassment and track takedowns.',
    icon: ShieldAlert,
    tone: 'alert' as const,
  },
  {
    id: 'add-suspicious-profile',
    title: 'Add suspicious profile',
    description: 'Record lookalike handles, URLs, and observed threat metadata.',
    icon: UserPlus,
    tone: 'neutral' as const,
  },
  {
    id: 'upload-evidence',
    title: 'Upload evidence',
    description: 'Store captures in the private vault with SHA-256 verification.',
    icon: FolderLock,
    tone: 'verified' as const,
  },
  {
    id: 'scan-sensitive-info',
    title: 'Scan sensitive information',
    description: 'Inspect drafts and metadata for exposed PII before sharing.',
    icon: ScanSearch,
    tone: 'neutral' as const,
  },
];

function mapIncidentStatus(status: IncidentStatus): SafeSignalStatus {
  switch (status) {
    case 'OPEN':
      return 'open';
    case 'IN_REVIEW':
      return 'in_review';
    case 'ESCALATED':
      return 'escalated';
    case 'RESOLVED':
      return 'resolved';
    case 'CLOSED':
      return 'closed';
  }
}

function mapIncidentSeverity(severity: IncidentSeverity): SafeSignalStatus {
  switch (severity) {
    case 'LOW':
      return 'low';
    case 'MEDIUM':
      return 'medium';
    case 'HIGH':
      return 'high';
    case 'CRITICAL':
      return 'critical';
  }
}

function formatCategory(category: string): string {
  return category
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function recommendationBadgeVariant(priority: RecommendationPriority) {
  switch (priority) {
    case 'critical':
    case 'high':
      return 'alert' as const;
    case 'medium':
      return 'warning' as const;
    case 'info':
      return 'verified' as const;
  }
}

export function DashboardView({
  user,
  initialOverview,
}: DashboardViewProps) {
  const router = useRouter();
  const [overview, setOverview] = React.useState<DashboardOverview>(
    initialOverview ?? EMPTY_OVERVIEW,
  );
  const [loadError, setLoadError] = React.useState<string | null>(
    initialOverview
      ? null
      : 'Unable to load live dashboard metrics from the API.',
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const { summary, recentActivity, recentIncidents, recommendations } =
    overview;

  async function handleRefresh() {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/dashboard', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to refresh dashboard data');
      }
      const payload = (await response.json()) as {
        overview: DashboardOverview;
      };
      setOverview(payload.overview);
      notify.verified(
        'Dashboard synchronized',
        'Metrics and recent activity updated from PostgreSQL.',
      );
    } catch {
      setLoadError('Could not refresh dashboard metrics. Please try again.');
      notify.alert('Refresh failed', 'Unable to reach the dashboard API.');
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleQuickAction(title: string) {
    if (title === 'Report abuse') {
      router.push('/abuse/new');
      return;
    }
    if (title === 'Add suspicious profile') {
      router.push('/intelligence');
      return;
    }
    if (
      title === 'Inspect incidents' ||
      title === 'Create incident' ||
      title === 'Review timeline'
    ) {
      router.push('/incidents');
      return;
    }
    if (title === 'Add official identity' || title === 'Add official account') {
      router.push('/identity');
      return;
    }
    if (title === 'Upload evidence') {
      router.push('/evidence');
      return;
    }
    notify.info(
      title,
      'This module workflow will open directly once feature pages are connected.',
    );
  }

  const displayName = user.displayName ?? user.email;

  return (
    <AppShell
      title="Security Dashboard"
      subtitle={BRAND_TAGLINE}
      user={user}
      alertCount={summary.escalatedIncidents}
      topBarActions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={isRefreshing}
          onClick={handleRefresh}
        >
          {!isRefreshing && <RefreshCw className="h-3.5 w-3.5" />}
          <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
        </Button>
      }
    >
      {/* Workspace Posture Banner */}
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="verified" dot>
                Protection Active
              </Badge>
              {summary.escalatedIncidents > 0 ? (
                <Badge variant="alert" dot>
                  {summary.escalatedIncidents} Escalated Alert
                  {summary.escalatedIncidents === 1 ? '' : 's'}
                </Badge>
              ) : (
                <Badge variant="neutral">No Escalated Alerts</Badge>
              )}
            </div>
            <h2 className="pt-1 text-lg font-semibold tracking-tight text-slate-900">
              Welcome back, {displayName}
            </h2>
            <p className="text-sm text-slate-500">
              Real-time overview of your incidents, preserved evidence custody,
              and active safety posture.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>
              {summary.officialAccounts} user-declared official account
              {summary.officialAccounts === 1 ? '' : 's'}
            </span>
          </div>
        </CardContent>
      </Card>

      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{loadError}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="alertOutline"
            onClick={handleRefresh}
          >
            Retry
          </Button>
        </div>
      )}

      {/* 1–4. Core KPI Metrics */}
      <section
        aria-label="Dashboard statistics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Total Incidents"
          value={summary.totalIncidents}
          detail="All documented safety cases in your workspace"
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <MetricCard
          label="Open Incidents"
          value={summary.openIncidents}
          tone={summary.openIncidents > 0 ? 'alert' : 'verified'}
          detail={
            summary.escalatedIncidents > 0
              ? `${summary.escalatedIncidents} escalated requiring attention`
              : 'Open, in-review, and escalated cases'
          }
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          label="Evidence Records"
          value={summary.evidenceRecords}
          tone={summary.evidenceRecords > 0 ? 'verified' : 'neutral'}
          detail="Preserved captures and cryptographic hashes"
          icon={<FileLock2 className="h-4 w-4" />}
        />
        <MetricCard
          label="Suspicious Profiles"
          value={summary.suspiciousProfiles}
          detail="Tracked impersonators and malicious accounts"
          icon={<UserX className="h-4 w-4" />}
        />
      </section>

      {/* 8. Quick Actions */}
      <section aria-label="Quick actions" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-slate-700 uppercase">
            Quick Actions
          </h2>
          <span className="text-xs text-slate-500">
            Immediate response &amp; evidence tools
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => handleQuickAction(action.title)}
                className="group flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 text-left shadow-2xs transition-all hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={
                      action.tone === 'alert'
                        ? 'flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700'
                        : action.tone === 'verified'
                          ? 'flex h-9 w-9 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700'
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <ArrowUpRight
                    className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-600"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {action.title}
                  </p>
                  <p className="text-xs leading-relaxed text-slate-500">
                    {action.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 6 & 5. Recent Incidents + Recent Activity */}
      <section className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Recent Incidents</CardTitle>
              <CardDescription>
                Latest safety incidents with severity, status, and custody
                counts.
              </CardDescription>
            </div>
            <Badge variant="neutral">{recentIncidents.length} shown</Badge>
          </CardHeader>
          <CardContent>
            {recentIncidents.length === 0 ? (
              <EmptyState
                title="No incidents recorded yet"
                description="Your workspace has no logged incidents. Start by reporting abuse or tracking a suspicious profile."
                action={
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleQuickAction('Report abuse')}
                  >
                    Report abuse
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incident</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Artifacts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentIncidents.map((incident) => (
                    <TableRow key={incident.id}>
                      <TableCell>
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="font-medium text-slate-900 hover:text-sky-700 hover:underline transition-colors"
                        >
                          {incident.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span>{formatCategory(incident.category)}</span>
                          {incident.platform && (
                            <>
                              <span>·</span>
                              <span>{incident.platform}</span>
                            </>
                          )}
                          {incident.suspiciousHandle && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-[11px]">
                                {incident.suspiciousHandle}
                              </span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={mapIncidentSeverity(incident.severity)}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={mapIncidentStatus(incident.status)}
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-500 tabular-nums">
                        {incident.evidenceCount} evidence ·{' '}
                        {incident.reportCount} report
                        {incident.reportCount === 1 ? '' : 's'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Chronological timeline of actions across your incidents.
              </CardDescription>
            </div>
            <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={<Clock className="h-5 w-5" aria-hidden="true" />}
                title="No recent activity"
                description="Timeline events appear automatically when you log incidents, upload evidence, or file abuse reports."
              />
            ) : (
              <ol className="space-y-4">
                {recentActivity.map((item) => (
                  <li
                    key={item.id}
                    className="relative border-l-2 border-slate-200 pl-4"
                  >
                    <span
                      className="absolute top-1.5 -left-[5px] h-2 w-2 rounded-full bg-slate-400 ring-2 ring-white"
                      aria-hidden="true"
                    />
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                        {formatTimestamp(item.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.incidentTitle}
                    </p>
                    {item.description && (
                      <p className="mt-1 text-xs text-slate-600">
                        {item.description}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 7. Safety Recommendations */}
      <section aria-label="Safety recommendations">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Safety Recommendations</CardTitle>
                <CardDescription>
                  Actionable steps tailored to your current account and evidence
                  posture.
                </CardDescription>
              </div>
              <Badge variant="verified" dot>
                Posture Guidance
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {recommendations.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                title="Baseline posture looks healthy"
                description="All recommended identity and evidence custody checks are up to date."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                          {rec.category}
                        </span>
                        <Badge
                          variant={recommendationBadgeVariant(rec.priority)}
                          dot
                        >
                          {rec.priority === 'info' ? 'Recommended' : rec.priority}
                        </Badge>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {rec.title}
                      </h3>
                      <p className="text-xs leading-relaxed text-slate-600">
                        {rec.description}
                      </p>
                    </div>
                    <div className="mt-4">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickAction(rec.actionLabel)}
                      >
                        {rec.actionLabel}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
