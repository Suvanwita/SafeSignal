'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FolderLock,
  Link2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { notify } from '@/components/ui/toaster';
import { fetchAbuseReports } from '@/lib/abuse/client-abuse';
import {
  ABUSE_CATEGORY_LABEL_MAP,
  ABUSE_CATEGORY_OPTIONS,
  ABUSE_REPORT_STATUS_MAP,
  SEVERITY_MAP,
  SEVERITY_OPTIONS,
  type AbuseReport,
  type AbuseReportStatus,
  type IncidentOption,
} from '@/lib/abuse/types';
import type { AuthUser } from '@/lib/auth/types';
import { PLATFORM_LABEL_MAP, PLATFORM_OPTIONS } from '@/lib/identity/types';

export interface AbuseHistoryViewProps {
  user: AuthUser;
  initialReports: AbuseReport[] | null;
  incidents: IncidentOption[];
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AbuseHistoryView({
  user,
  initialReports,
  incidents,
}: AbuseHistoryViewProps) {
  const [reports, setReports] = React.useState<AbuseReport[]>(
    () => initialReports ?? [],
  );
  const [loadFailed, setLoadFailed] = React.useState(initialReports === null);
  const [reloading, setReloading] = React.useState(false);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('ALL');
  const [platformFilter, setPlatformFilter] = React.useState('ALL');
  const [severityFilter, setSeverityFilter] = React.useState('ALL');
  const [incidentFilter, setIncidentFilter] = React.useState('ALL');

  async function handleRefresh() {
    setReloading(true);
    try {
      const fresh = await fetchAbuseReports();
      setReports(fresh);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      notify.alert(
        'Unable to refresh abuse reports',
        'Check backend connectivity and try again.',
      );
    } finally {
      setReloading(false);
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredReports = reports.filter((report) => {
    if (categoryFilter !== 'ALL' && report.category !== categoryFilter) {
      return false;
    }
    if (platformFilter !== 'ALL' && report.platform !== platformFilter) {
      return false;
    }
    if (severityFilter !== 'ALL' && report.severity !== severityFilter) {
      return false;
    }
    if (incidentFilter === 'STANDALONE' && report.incidentId !== null) {
      return false;
    }
    if (
      incidentFilter !== 'ALL' &&
      incidentFilter !== 'STANDALONE' &&
      report.incidentId !== incidentFilter
    ) {
      return false;
    }
    if (!normalizedQuery) return true;
    const haystack = [
      report.title,
      report.description,
      report.referenceNumber ?? '',
      report.incident?.title ?? '',
      ABUSE_CATEGORY_LABEL_MAP[report.category] ?? report.category,
      PLATFORM_LABEL_MAP[report.platform] ?? report.platform,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const linkedCount = reports.filter((r) => r.incidentId !== null).length;
  const highCriticalCount = reports.filter(
    (r) => r.severity === 'HIGH' || r.severity === 'CRITICAL',
  ).length;
  const pendingCount = reports.filter((r) => r.reportStatus === 'PENDING').length;

  return (
    <AppShell
      title="Abuse Reports"
      subtitle="Document, organize, and track harassment, threats, stalking, impersonation, and privacy violations"
      user={user}
      topBarActions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={reloading}
            onClick={handleRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Link
            href="/abuse/new"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white shadow-xs hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            New Report
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {loadFailed && (
          <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>
                Unable to load your abuse report history right now. Retry below.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={reloading}
              onClick={handleRefresh}
            >
              Retry
            </Button>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Total Reports
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                  {reports.length}
                </p>
              </div>
              <FolderLock className="h-4 w-4 text-slate-500" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  High / Critical
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                  {highCriticalCount}
                </p>
              </div>
              <ShieldAlert className="h-4 w-4 text-red-600" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Linked to Incidents
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                  {linkedCount}
                </p>
              </div>
              <Link2 className="h-4 w-4 text-slate-500" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Pending</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                  {pendingCount}
                </p>
              </div>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        {reports.length > 0 && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3.5 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search title, reference, incident..."
                className="pl-9"
                aria-label="Search abuse reports"
              />
            </div>

            <select
              aria-label="Filter by abuse category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-2xs focus-visible:outline-none"
            >
              <option value="ALL">All categories</option>
              {ABUSE_CATEGORY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by platform"
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-2xs focus-visible:outline-none"
            >
              <option value="ALL">All platforms</option>
              {PLATFORM_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by severity"
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-2xs focus-visible:outline-none"
            >
              <option value="ALL">All severities</option>
              {SEVERITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by incident"
              value={incidentFilter}
              onChange={(event) => setIncidentFilter(event.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-2xs focus-visible:outline-none"
            >
              <option value="ALL">All incidents</option>
              <option value="STANDALONE">Standalone (unlinked)</option>
              {incidents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Reports Table / Empty State */}
        {reports.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="h-5 w-5" />}
            title="No abuse reports filed yet"
            description="Submit structured incident reports for cyberbullying, harassment, stalking, threats, impersonation, unwanted contact, or privacy violations."
            action={
              <Link
                href="/abuse/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-4 text-sm font-medium text-white shadow-xs hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Submit First Abuse Report
              </Link>
            }
          />
        ) : filteredReports.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No matching abuse reports"
            description="Clear or adjust one of your active filters to see reports."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('ALL');
                  setPlatformFilter('ALL');
                  setSeverityFilter('ALL');
                  setIncidentFilter('ALL');
                }}
              >
                Reset Filters
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Incident</TableHead>
                    <TableHead>Incident Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => {
                    const severityMeta = SEVERITY_MAP[report.severity];
                    const statusMeta =
                      ABUSE_REPORT_STATUS_MAP[
                        report.reportStatus as AbuseReportStatus
                      ] ?? ABUSE_REPORT_STATUS_MAP.PENDING;

                    return (
                      <TableRow key={report.id}>
                        <TableCell className="max-w-xs">
                          <Link
                            href={`/abuse/${report.id}`}
                            className="block font-medium text-slate-900 hover:underline"
                          >
                            {report.title}
                          </Link>
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                            {report.description}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral">
                            {ABUSE_CATEGORY_LABEL_MAP[report.category] ??
                              report.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {PLATFORM_LABEL_MAP[report.platform] ??
                            report.platform}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={severityMeta.statusBadge}
                            label={severityMeta.label}
                          />
                        </TableCell>
                        <TableCell className="max-w-[180px] text-xs">
                          {report.incident ? (
                            <span className="inline-flex items-center gap-1 truncate font-medium text-slate-800">
                              <Link2 className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate">
                                {report.incident.title}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">Standalone</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 tabular-nums">
                          {formatDateTime(report.incidentDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusMeta.badgeVariant}>
                            {statusMeta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/abuse/${report.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                          >
                            View
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card List */}
            <div className="space-y-3 md:hidden">
              {filteredReports.map((report) => {
                const severityMeta = SEVERITY_MAP[report.severity];
                const statusMeta =
                  ABUSE_REPORT_STATUS_MAP[
                    report.reportStatus as AbuseReportStatus
                  ] ?? ABUSE_REPORT_STATUS_MAP.PENDING;

                return (
                  <Card key={report.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="neutral">
                          {ABUSE_CATEGORY_LABEL_MAP[report.category] ??
                            report.category}
                        </Badge>
                        <StatusBadge
                          status={severityMeta.statusBadge}
                          label={severityMeta.label}
                        />
                      </div>

                      <div>
                        <Link
                          href={`/abuse/${report.id}`}
                          className="text-sm font-semibold text-slate-900 hover:underline"
                        >
                          {report.title}
                        </Link>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                          {report.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                        <span>
                          {PLATFORM_LABEL_MAP[report.platform] ??
                            report.platform}{' '}
                          · {formatDateTime(report.incidentDate)}
                        </span>
                        <Badge variant={statusMeta.badgeVariant}>
                          {statusMeta.label}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
