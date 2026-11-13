'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Archive,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  EyeOff,
  FileCheck2,
  FileText,
  FolderPlus,
  Hash,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlink,
  UserX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { notify } from '@/components/ui/toaster';
import { fetchIncidentTimeline } from '@/lib/incidents/client-incidents';
import type {
  IncidentTimelineEvent,
  PaginatedTimelineResponse,
} from '@/lib/incidents/types';
import { scanIncidentPrivacy } from '@/lib/privacy/client-privacy';

export interface IncidentTimelineViewProps {
  incidentId: string;
  initialEvents?: IncidentTimelineEvent[];
  onRefreshIncident?: () => void;
}

type EventCategoryFilter =
  | 'ALL'
  | 'LIFECYCLE'
  | 'EVIDENCE'
  | 'REPORTS_PROFILES'
  | 'SAFETY_PRIVACY';

function formatEventTimestamp(iso: string): { formatted: string; relative: string } {
  try {
    const d = new Date(iso);
    const formatted = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);

    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    let relative = 'just now';
    if (diffDays > 0) {
      relative = diffDays === 1 ? 'yesterday' : `${diffDays} days ago`;
    } else if (diffHr > 0) {
      relative = `${diffHr}h ago`;
    } else if (diffMin > 0) {
      relative = `${diffMin}m ago`;
    } else if (diffSec > 10) {
      relative = `${diffSec}s ago`;
    }

    return { formatted, relative };
  } catch {
    return { formatted: iso, relative: '' };
  }
}

export function IncidentTimelineView({
  incidentId,
  initialEvents = [],
  onRefreshIncident,
}: IncidentTimelineViewProps) {
  const [events, setEvents] = React.useState<IncidentTimelineEvent[]>(initialEvents);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(10);
  const [order, setOrder] = React.useState<'desc' | 'asc'>('desc');
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] =
    React.useState<EventCategoryFilter>('ALL');

  const [totalPages, setTotalPages] = React.useState(1);
  const [totalEvents, setTotalEvents] = React.useState(initialEvents.length);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isScanningPrivacy, setIsScanningPrivacy] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const loadTimeline = React.useCallback(
    async (targetPage = page) => {
      setIsLoading(true);
      try {
        const res = await fetchIncidentTimeline(incidentId, {
          page: targetPage,
          limit,
          order,
          search: search.trim() || undefined,
        });

        setEvents(res.events);
        setPage(res.pagination.page);
        setTotalPages(res.pagination.totalPages);
        setTotalEvents(res.pagination.total);
      } catch (err: unknown) {
        // Fallback to initial events if BFF route has a hiccup
        console.error('Failed to fetch timeline:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [incidentId, page, limit, order, search],
  );

  React.useEffect(() => {
    loadTimeline(1);
  }, [loadTimeline, limit, order]);

  const handleRunPrivacyScan = async () => {
    setIsScanningPrivacy(true);
    try {
      const res = await scanIncidentPrivacy(incidentId);
      notify.verified(
        'Privacy scan completed',
        res.hasSensitiveData
          ? `Detected ${res.totalDetections} sensitive items in case content.`
          : 'Clean - zero sensitive personal data detected.',
      );
      loadTimeline(1);
      if (onRefreshIncident) onRefreshIncident();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Privacy scan failed.';
      notify.alert('Scan failed', msg);
    } finally {
      setIsScanningPrivacy(false);
    }
  };

  const handleCopyMeta = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    notify.verified('Reference copied to clipboard.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter events client-side by category tab if selected
  const filteredEvents = React.useMemo(() => {
    if (categoryFilter === 'ALL') return events;

    return events.filter((e) => {
      const type = e.eventType;
      switch (categoryFilter) {
        case 'LIFECYCLE':
          return (
            type === 'INCIDENT_CREATED' ||
            type === 'INCIDENT_CLOSED' ||
            type === 'INCIDENT_REOPENED' ||
            type === 'STATUS_CHANGED' ||
            type === 'SEVERITY_CHANGED' ||
            type === 'INCIDENT_ESCALATED' ||
            type === 'INCIDENT_RESOLVED'
          );
        case 'EVIDENCE':
          return (
            type.startsWith('EVIDENCE_') ||
            type === 'EVIDENCE_ATTACHED' ||
            type === 'EVIDENCE_UPLOADED' ||
            type === 'EVIDENCE_VERIFIED' ||
            type === 'EVIDENCE_DOWNLOADED'
          );
        case 'REPORTS_PROFILES':
          return (
            type.startsWith('ABUSE_REPORT_') ||
            type.startsWith('PROFILE_') ||
            type === 'ABUSE_REPORT_CREATED' ||
            type === 'ABUSE_REPORT_LINKED' ||
            type === 'PROFILE_LINKED'
          );
        case 'SAFETY_PRIVACY':
          return (
            type === 'PRIVACY_SCAN_COMPLETED' ||
            type === 'SAFETY_ANALYSIS_COMPLETED' ||
            type === 'REPORT_SAFETY_ANALYZED' ||
            type === 'EVIDENCE_SAFETY_ANALYZED'
          );
        default:
          return true;
      }
    });
  }, [events, categoryFilter]);

  const renderEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'INCIDENT_CREATED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 ring-4 ring-white shadow-xs">
            <FolderPlus className="h-3.5 w-3.5" />
          </span>
        );
      case 'INCIDENT_CLOSED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-700 ring-4 ring-white shadow-xs">
            <Archive className="h-3.5 w-3.5" />
          </span>
        );
      case 'INCIDENT_REOPENED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-4 ring-white shadow-xs">
            <RefreshCw className="h-3.5 w-3.5" />
          </span>
        );
      case 'ABUSE_REPORT_CREATED':
      case 'ABUSE_REPORT_SUBMITTED':
      case 'ABUSE_REPORT_LINKED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-4 ring-white shadow-xs">
            <AlertOctagon className="h-3.5 w-3.5" />
          </span>
        );
      case 'PROFILE_LINKED':
      case 'PROFILE_ASSOCIATED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-purple-700 ring-4 ring-white shadow-xs">
            <UserX className="h-3.5 w-3.5" />
          </span>
        );
      case 'EVIDENCE_ATTACHED':
      case 'EVIDENCE_UPLOADED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-4 ring-white shadow-xs">
            <FileCheck2 className="h-3.5 w-3.5" />
          </span>
        );
      case 'EVIDENCE_VERIFIED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 ring-4 ring-white shadow-xs">
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
        );
      case 'PRIVACY_SCAN_COMPLETED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-teal-700 ring-4 ring-white shadow-xs">
            <EyeOff className="h-3.5 w-3.5" />
          </span>
        );
      case 'SAFETY_ANALYSIS_COMPLETED':
      case 'REPORT_SAFETY_ANALYZED':
      case 'EVIDENCE_SAFETY_ANALYZED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 ring-4 ring-white shadow-xs">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
        );
      case 'INCIDENT_ESCALATED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700 ring-4 ring-white shadow-xs">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
        );
      case 'INCIDENT_RESOLVED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-4 ring-white shadow-xs">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        );
      default:
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 ring-4 ring-white shadow-xs">
            <Clock className="h-3.5 w-3.5" />
          </span>
        );
    }
  };

  const renderResourceReference = (evt: IncidentTimelineEvent) => {
    const meta = (evt.metadata || {}) as Record<string, unknown>;

    // Evidence Reference
    if (meta.evidenceId && typeof meta.evidenceId === 'string') {
      return (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href={`/evidence/${meta.evidenceId}`}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 hover:underline"
          >
            <FileText className="h-3 w-3 text-slate-400" />
            <span>
              Evidence: {String(meta.fileName || meta.title || 'View File')}
            </span>
            <ExternalLink className="h-2.5 w-2.5 text-slate-400" />
          </Link>
          {typeof meta.sha256 === 'string' && (
            <button
              type="button"
              onClick={() => handleCopyMeta(evt.id, String(meta.sha256))}
              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-slate-200"
              title="Copy SHA-256 hash"
            >
              <Hash className="h-2.5 w-2.5 text-slate-400" />
              <span>
                {meta.sha256.slice(0, 8)}...{meta.sha256.slice(-4)}
              </span>
              {copiedId === evt.id ? (
                <Check className="h-2.5 w-2.5 text-emerald-600" />
              ) : (
                <Copy className="h-2.5 w-2.5 text-slate-400" />
              )}
            </button>
          )}
          {typeof meta.status === 'string' && (
            <Badge
              variant="neutral"
              className={`text-[10px] font-bold ${
                meta.status === 'VERIFIED'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {meta.status === 'VERIFIED' ? 'Verified Match' : 'Mismatch Warning'}
            </Badge>
          )}
        </div>
      );
    }

    // Abuse Report Reference
    if (meta.abuseReportId && typeof meta.abuseReportId === 'string') {
      return (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href={`/abuse/${meta.abuseReportId}`}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-50 hover:underline"
          >
            <AlertOctagon className="h-3 w-3 text-amber-600" />
            <span>Abuse Report Case</span>
            <ExternalLink className="h-2.5 w-2.5 text-slate-400" />
          </Link>
          {Boolean(meta.platform) && (
            <Badge variant="neutral" className="text-[10px] font-semibold text-slate-600">
              {String(meta.platform)}
            </Badge>
          )}
          {Boolean(meta.severity) && (
            <Badge
              variant="neutral"
              className={`text-[10px] font-semibold ${
                meta.severity === 'HIGH' || meta.severity === 'CRITICAL'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {String(meta.severity)} Severity
            </Badge>
          )}
        </div>
      );
    }

    // Suspicious Profile Reference
    if (meta.suspiciousProfileId && typeof meta.suspiciousProfileId === 'string') {
      return (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-mono font-medium text-purple-700">
            <UserX className="h-3 w-3 text-purple-500" />
            <span>@{String(meta.handle || 'profile')}</span>
            {Boolean(meta.platform) && (
              <span className="text-[10px] text-slate-400">({String(meta.platform)})</span>
            )}
          </span>
        </div>
      );
    }

    // Safety Intelligence Reference
    if (meta.riskLevel && typeof meta.riskLevel === 'string') {
      return (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge
            variant="neutral"
            className={`text-[10px] font-bold ${
              meta.riskLevel === 'HIGH'
                ? 'border-rose-300 bg-rose-100 text-rose-800'
                : meta.riskLevel === 'MEDIUM'
                  ? 'border-amber-300 bg-amber-100 text-amber-800'
                  : 'border-emerald-300 bg-emerald-100 text-emerald-800'
            }`}
          >
            {meta.riskLevel} Safety Risk
          </Badge>
          {Boolean(meta.category) && (
            <Badge variant="neutral" className="bg-white border-slate-200 text-[10px] text-slate-700">
              {String(meta.category)}
            </Badge>
          )}
          {meta.overallScore !== undefined && (
            <span className="text-[10px] font-mono text-slate-500">
              Score: {String(meta.overallScore)}/100
            </span>
          )}
        </div>
      );
    }

    // Privacy Scan Reference
    if (evt.eventType === 'PRIVACY_SCAN_COMPLETED') {
      return (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge
            variant="neutral"
            className={`text-[10px] font-bold ${
              meta.hasSensitiveData
                ? 'border-teal-300 bg-teal-100 text-teal-800'
                : 'border-slate-200 bg-slate-100 text-slate-700'
            }`}
          >
            {meta.hasSensitiveData
              ? `${meta.totalDetections || 0} Detections Logged`
              : 'Zero PII Detected'}
          </Badge>
          {Boolean(meta.scannedLength) && (
            <span className="text-[10px] font-mono text-slate-400">
              {String(meta.scannedLength)} chars scanned
            </span>
          )}
        </div>
      );
    }

    // Status / Severity transition
    if (Boolean(meta.previousStatus && meta.newStatus)) {
      return (
        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-600">
          <Badge variant="neutral" className="text-[10px]">
            {String(meta.previousStatus)}
          </Badge>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <Badge variant="neutral" className="text-[10px] font-bold bg-slate-900 text-white">
            {String(meta.newStatus)}
          </Badge>
        </div>
      );
    }

    return null;
  };

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Comprehensive Incident Timeline & Audit Trail
                </CardTitle>
                <Badge variant="neutral" className="text-[11px] font-semibold text-slate-600">
                  {totalEvents} events
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-500">
                System-recorded immutable chronology with database timestamps and linked resource references.
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Action: Privacy Scan */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunPrivacyScan}
              disabled={isScanningPrivacy || isLoading}
              className="h-8 gap-1.5 text-xs font-semibold text-teal-700 border-teal-200 hover:bg-teal-50"
              title="Scan incident case text for sensitive personal data"
            >
              {isScanningPrivacy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-teal-600" />
              )}
              <span>Run Case Privacy Scan</span>
            </Button>

            {/* Sort Order Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              disabled={isLoading}
              className="h-8 gap-1 text-xs text-slate-700"
              title={
                order === 'desc'
                  ? 'Switch to oldest first (chronological progression)'
                  : 'Switch to newest first'
              }
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              <span>{order === 'desc' ? 'Newest First' : 'Oldest First'}</span>
            </Button>

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadTimeline(page)}
              disabled={isLoading}
              className="h-8 w-8 p-0 text-slate-700"
              title="Refresh timeline events"
              aria-label="Refresh timeline"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Filter Category Tabs & Search Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {(
              [
                ['ALL', 'All Events'],
                ['LIFECYCLE', 'Lifecycle & Status'],
                ['EVIDENCE', 'Evidence & Files'],
                ['REPORTS_PROFILES', 'Reports & Profiles'],
                ['SAFETY_PRIVACY', 'Safety & Privacy'],
              ] as const
            ).map(([cat, label]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter events..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadTimeline(1);
                }}
                className="h-7 w-36 sm:w-48 rounded-md border border-slate-200 bg-white pl-7 pr-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
              />
            </div>

            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
              aria-label="Items per page"
            >
              <option value={5}>5 / page</option>
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Loading Spinner */}
        {isLoading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
            <p className="text-xs">Loading incident timeline...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">
              No timeline events found
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {search
                ? `No events match "${search}". Try clearing your search filter.`
                : 'Timeline events are automatically recorded as incident lifecycle actions occur.'}
            </p>
          </div>
        ) : (
          <div className="relative pl-8 before:absolute before:bottom-2 before:left-3.5 before:top-2 before:w-0.5 before:bg-slate-200">
            <div className="space-y-4">
              {filteredEvents.map((evt) => {
                const { formatted, relative } = formatEventTimestamp(
                  evt.occurredAt,
                );

                return (
                  <div key={evt.id} className="relative group">
                    {/* Visual Timeline Marker */}
                    <div className="absolute -left-8 top-1.5 flex items-center justify-center">
                      {renderEventIcon(evt.eventType)}
                    </div>

                    {/* Timeline Event Card */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition-colors">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-900 text-sm block">
                            {evt.title}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {evt.eventType}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="font-mono text-xs text-slate-600 block">
                            {formatted}
                          </span>
                          {relative && (
                            <span className="text-[10px] text-slate-400 block">
                              ({relative})
                            </span>
                          )}
                        </div>
                      </div>

                      {evt.description && (
                        <p className="mt-1.5 text-xs text-slate-700 leading-relaxed">
                          {evt.description}
                        </p>
                      )}

                      {/* Resource Reference / Deep Links */}
                      {renderResourceReference(evt)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PAGINATION BAR */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span>
              Showing page <strong>{page}</strong> of <strong>{totalPages}</strong>{' '}
              ({totalEvents} total events)
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadTimeline(page - 1)}
                disabled={page <= 1 || isLoading}
                className="h-7 px-2 gap-1 text-xs"
              >
                <ChevronLeft className="h-3 w-3" />
                <span>Previous</span>
              </Button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                  let p = idx + 1;
                  if (totalPages > 5 && page > 3) {
                    p = page - 2 + idx;
                    if (p > totalPages) p = totalPages - (4 - idx);
                  }
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => loadTimeline(p)}
                      disabled={isLoading}
                      className={`h-6 w-6 rounded text-[11px] font-medium ${
                        page === p
                          ? 'bg-slate-900 text-white font-bold'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => loadTimeline(page + 1)}
                disabled={page >= totalPages || isLoading}
                className="h-7 px-2 gap-1 text-xs"
              >
                <span>Next</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* IMMUTABILITY COMPLIANCE FOOTER */}
        <div className="rounded-md border border-slate-200/60 bg-slate-50/50 p-2.5 text-[11px] text-slate-500 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>
            <strong>Immutable Historical Record:</strong> All timeline events are automatically recorded with server database timestamps and cryptographic references. Ordinary users cannot edit, overwrite, or delete historical audit entries.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
