'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FileText,
  Filter,
  FolderLock,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  UserX,
  X,
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
import {
  ABUSE_CATEGORY_LABEL_MAP,
  ABUSE_CATEGORY_OPTIONS,
  SEVERITY_MAP,
  SEVERITY_OPTIONS,
} from '@/lib/abuse/types';
import type { AuthUser } from '@/lib/auth/types';
import { fetchIncidents } from '@/lib/incidents/client-incidents';
import {
  INCIDENT_STATUS_MAP,
  INCIDENT_STATUS_OPTIONS,
  type IncidentStatus,
  type IncidentSummary,
} from '@/lib/incidents/types';

export interface IncidentHistoryViewProps {
  user: AuthUser;
  initialIncidents: IncidentSummary[] | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function IncidentHistoryView({
  user,
  initialIncidents,
}: IncidentHistoryViewProps) {
  const [incidents, setIncidents] = React.useState<IncidentSummary[]>(
    initialIncidents ?? [],
  );
  const [loadFailed, setLoadFailed] = React.useState(initialIncidents === null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'cards' | 'table'>('cards');

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = React.useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');

  const reloadIncidents = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchIncidents({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        severity: severityFilter !== 'ALL' ? severityFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
      setIncidents(data);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      notify.alert(
        'Unable to load incidents',
        'Could not fetch your safety incidents. Please check your connection and retry.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [statusFilter, severityFilter, categoryFilter, searchQuery]);

  const filteredIncidents = React.useMemo(() => {
    return incidents.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (severityFilter !== 'ALL' && item.severity !== severityFilter)
        return false;
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter)
        return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = (item.description ?? '').toLowerCase().includes(q);
        const matchesHandle = (item.suspiciousProfile?.handle ?? '')
          .toLowerCase()
          .includes(q);
        if (!matchesTitle && !matchesDesc && !matchesHandle) return false;
      }
      return true;
    });
  }, [incidents, statusFilter, severityFilter, categoryFilter, searchQuery]);

  const kpis = React.useMemo(() => {
    const total = incidents.length;
    const open = incidents.filter(
      (i) => i.status === 'OPEN' || i.status === 'IN_REVIEW',
    ).length;
    const escalated = incidents.filter((i) => i.status === 'ESCALATED').length;
    const resolved = incidents.filter(
      (i) => i.status === 'RESOLVED' || i.status === 'CLOSED',
    ).length;
    return { total, open, escalated, resolved };
  }, [incidents]);

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    severityFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    Boolean(searchQuery.trim());

  const resetFilters = () => {
    setStatusFilter('ALL');
    setSeverityFilter('ALL');
    setCategoryFilter('ALL');
    setSearchQuery('');
  };

  return (
    <AppShell
      title="Safety Incidents"
      subtitle="Unified command center grouping abuse reports, suspicious profiles, evidence records, and audit timelines."
      user={user}
      topBarActions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reloadIncidents}
            disabled={isRefreshing}
            aria-label="Refresh incident list"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button asChild variant="outline" size="sm">
            <Link href="/abuse/new">
              <FileText className="h-4 w-4" />
              <span>Report Abuse</span>
            </Link>
          </Button>

          <Button asChild size="sm">
            <Link href="/incidents/new">
              <Plus className="h-4 w-4" />
              <span>New Incident</span>
            </Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Cases
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {kpis.total}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Active & archived safety incidents
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Active / In Progress
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-600">
                {kpis.open}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Open or currently under review
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Escalated
              </div>
              <div className="mt-2 text-2xl font-bold text-red-600">
                {kpis.escalated}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Urgent attention required
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Resolved / Closed
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-600">
                {kpis.resolved}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Mitigated or archived safety cases
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search Bar */}
        <Card className="border-slate-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              {/* Search by Incident Title */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search incidents by title, description or handle..."
                  className="pl-9 pr-8"
                  aria-label="Search by incident title"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Clear search query"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Status and Severity Filters */}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by incident status"
                  className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm focus:border-slate-900 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  {INCIDENT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  aria-label="Filter by incident severity"
                  className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm focus:border-slate-900 focus:outline-none"
                >
                  <option value="ALL">All Severities</option>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Filter by abuse category"
                  className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm focus:border-slate-900 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  {ABUSE_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* View Mode Toggle: Overview Cards vs Table */}
                <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`rounded p-1.5 text-xs transition-colors ${
                      viewMode === 'cards'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                    title="Incident overview cards"
                    aria-label="Cards view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`rounded p-1.5 text-xs transition-colors ${
                      viewMode === 'table'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                    title="Table view"
                    aria-label="Table view"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Status Filter Pills & Filter Summary */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-medium mr-1">Status:</span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    statusFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({incidents.length})
                </button>
                {INCIDENT_STATUS_OPTIONS.map((opt) => {
                  const count = incidents.filter((i) => i.status === opt.value).length;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatusFilter(opt.value)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        statusFilter === opt.value
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {opt.label} ({count})
                    </button>
                  );
                })}
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Reset filters</span>
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Content Section */}
        {loadFailed ? (
          <Card className="border-red-200 bg-red-50/50 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-900">
              Failed to load incidents
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              There was an issue fetching your safety incidents from the server.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={reloadIncidents}
              className="mt-4"
            >
              Retry
            </Button>
          </Card>
        ) : filteredIncidents.length === 0 ? (
          <EmptyState
            icon={<FolderLock className="h-8 w-8" />}
            title={
              incidents.length === 0
                ? 'No safety incidents recorded'
                : 'No matching incidents found'
            }
            description={
              incidents.length === 0
                ? 'Incidents unify your abuse reports, evidence snapshots, and tracked suspicious profiles into single coordinated cases.'
                : 'No incidents match your current search criteria or active filters. Try resetting filters to view all cases.'
            }
            action={
              incidents.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm">
                    <Link href="/incidents/new">
                      <Plus className="h-4 w-4" />
                      Create first incident
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/abuse/new">
                      <FileText className="h-4 w-4" />
                      Report abuse
                    </Link>
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={resetFilters}>
                  Clear all filters
                </Button>
              )
            }
          />
        ) : viewMode === 'cards' ? (
          /* INCIDENT OVERVIEW CARDS (Grid View) */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredIncidents.map((inc) => {
              const statusMeta =
                INCIDENT_STATUS_MAP[inc.status] ?? INCIDENT_STATUS_MAP.OPEN;
              const severityMeta =
                SEVERITY_MAP[inc.severity] ?? SEVERITY_MAP.MEDIUM;
              const categoryLabel =
                ABUSE_CATEGORY_LABEL_MAP[inc.category] ?? inc.category;

              return (
                <Card
                  key={inc.id}
                  className="flex flex-col justify-between border-slate-200 transition-all hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="p-5">
                    {/* Header: Badges & Case ID */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge
                          status={statusMeta.statusBadge}
                          label={statusMeta.label}
                        />
                        <StatusBadge
                          status={severityMeta.statusBadge}
                          label={`${severityMeta.label}`}
                        />
                        <Badge variant="neutral" className="text-[10px]">
                          {categoryLabel}
                        </Badge>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">
                        #{inc.id.slice(0, 6)}
                      </span>
                    </div>

                    {/* Title */}
                    <div className="mt-3">
                      <Link
                        href={`/incidents/${inc.id}`}
                        className="font-semibold text-slate-900 hover:text-blue-600 line-clamp-1"
                      >
                        {inc.title}
                      </Link>
                      {inc.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {inc.description}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs italic text-slate-400">
                          No narrative description provided.
                        </p>
                      )}
                    </div>

                    {/* Suspect Handle if associated */}
                    {inc.suspiciousProfile && (
                      <div className="mt-3 flex items-center gap-1.5 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                        <UserX className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono font-medium text-slate-800 truncate">
                          @{inc.suspiciousProfile.handle}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({inc.suspiciousProfile.platform})
                        </span>
                      </div>
                    )}

                    {/* Key Metrics Row */}
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                      <div className="rounded bg-slate-50/70 p-1.5">
                        <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                          <FileText className="h-3 w-3" />
                          <span>Reports</span>
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-800">
                          {inc.reportCount}
                        </div>
                      </div>

                      <div className="rounded bg-slate-50/70 p-1.5">
                        <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                          <FolderLock className="h-3 w-3" />
                          <span>Evidence</span>
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-800">
                          {inc.evidenceCount}
                        </div>
                      </div>

                      <div className="rounded bg-slate-50/70 p-1.5">
                        <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                          <Clock className="h-3 w-3" />
                          <span>Events</span>
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-800">
                          {inc.timelineEventCount}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-xs">
                    <span className="text-slate-400">
                      Opened {formatDate(inc.createdAt)}
                    </span>
                    <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <Link href={`/incidents/${inc.id}`}>
                        <span>View case</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          /* TABLE VIEW */
          <Card className="overflow-hidden border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Incident Case</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Reports</TableHead>
                  <TableHead className="text-center">Evidence</TableHead>
                  <TableHead className="text-center">Timeline</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncidents.map((inc) => {
                  const statusMeta =
                    INCIDENT_STATUS_MAP[inc.status] ??
                    INCIDENT_STATUS_MAP.OPEN;
                  const severityMeta =
                    SEVERITY_MAP[inc.severity] ?? SEVERITY_MAP.MEDIUM;
                  const categoryLabel =
                    ABUSE_CATEGORY_LABEL_MAP[inc.category] ?? inc.category;

                  return (
                    <TableRow key={inc.id} className="hover:bg-slate-50/80">
                      <TableCell className="max-w-xs">
                        <Link
                          href={`/incidents/${inc.id}`}
                          className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                        >
                          {inc.title}
                        </Link>
                        {inc.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                            {inc.description}
                          </p>
                        )}
                        {inc.suspiciousProfile && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                            <span className="font-mono text-slate-500">
                              @{inc.suspiciousProfile.handle}
                            </span>
                            <span className="text-slate-400">
                              ({inc.suspiciousProfile.platform})
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={statusMeta.statusBadge}
                          label={statusMeta.label}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={severityMeta.statusBadge}
                          label={severityMeta.label}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {categoryLabel}
                      </TableCell>
                      <TableCell className="text-center font-medium text-slate-700">
                        {inc.reportCount}
                      </TableCell>
                      <TableCell className="text-center font-medium text-slate-700">
                        {inc.evidenceCount}
                      </TableCell>
                      <TableCell className="text-center font-medium text-slate-700">
                        {inc.timelineEventCount}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {formatDate(inc.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/incidents/${inc.id}`}>
                            <span>View case</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
