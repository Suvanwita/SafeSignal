'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Fingerprint,
  Info,
  Plus,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { notify } from '@/components/ui/toaster';
import { AuthApiError } from '@/lib/auth/client-api';
import type { AuthUser } from '@/lib/auth/types';
import { PLATFORM_LABEL_MAP } from '@/lib/identity/types';
import {
  deleteSuspiciousProfile,
  reanalyzeSuspiciousProfile,
  updateSuspiciousProfileStatus,
} from '@/lib/intelligence/client-intelligence';
import {
  SUSPICIOUS_PROFILE_STATUS_OPTIONS,
  type SuspiciousProfile,
  type SuspiciousProfileStatus,
} from '@/lib/intelligence/types';
import { ReportProfileDialog } from './report-profile-dialog';
import { SimilarityBreakdownPanel } from './similarity-breakdown-panel';
import { SuspiciousProfileCard } from './suspicious-profile-card';

export interface IntelligenceViewProps {
  user: AuthUser;
  initialProfiles: SuspiciousProfile[] | null;
  officialAccountCount: number;
  incidents?: { id: string; title: string; status: string }[];
}

export function IntelligenceView({
  user,
  initialProfiles,
  officialAccountCount,
  incidents = [],
}: IntelligenceViewProps) {
  const [profiles, setProfiles] = React.useState<SuspiciousProfile[]>(
    () => initialProfiles ?? [],
  );
  const [loadFailed, setLoadFailed] = React.useState(initialProfiles === null);
  const [reloading, setReloading] = React.useState(false);

  const [selectedId, setSelectedId] = React.useState<string | null>(
    () => initialProfiles?.[0]?.id ?? null,
  );
  const [reportOpen, setReportOpen] = React.useState(false);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  const [reanalyzingId, setReanalyzingId] = React.useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  const [deletingProfile, setDeletingProfile] =
    React.useState<SuspiciousProfile | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function refreshProfiles() {
    setReloading(true);
    try {
      const response = await fetch('/api/intelligence/suspicious-profiles', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load suspicious profiles');
      }
      const payload = (await response.json()) as {
        profiles: SuspiciousProfile[];
      };
      const nextList = payload.profiles ?? [];
      setProfiles(nextList);
      setLoadFailed(false);
      if (nextList.length > 0 && !nextList.some((p) => p.id === selectedId)) {
        setSelectedId(nextList[0].id);
      }
    } catch {
      setLoadFailed(true);
      notify.alert(
        'Unable to refresh suspicious profiles',
        'Check backend connectivity and try again.',
      );
    } finally {
      setReloading(false);
    }
  }

  function handleReported(created: SuspiciousProfile) {
    setProfiles((prev) => [created, ...prev]);
    setSelectedId(created.id);
    const score = created.latestAnalysis?.overallScore ?? 0;
    notify.verified(
      'Suspicious profile recorded',
      `Similarity indicator score: ${score}/100 against your declared official accounts.`,
    );
  }

  async function handleReanalyze(profileId: string) {
    setReanalyzingId(profileId);
    try {
      const updated = await reanalyzeSuspiciousProfile(profileId);
      setProfiles((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedId(updated.id);
      notify.verified(
        'Similarity analysis updated',
        `Score refreshed: ${updated.latestAnalysis?.overallScore ?? 0}/100.`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof AuthApiError
          ? error.message
          : 'Unable to re-run similarity analysis.';
      notify.alert('Analysis failed', message);
    } finally {
      setReanalyzingId(null);
    }
  }

  async function handleUpdateStatus(
    profileId: string,
    reviewStatus: SuspiciousProfileStatus,
    notes: string | null,
  ) {
    setUpdatingStatus(true);
    try {
      const updated = await updateSuspiciousProfileStatus(profileId, {
        reviewStatus,
        notes,
      });
      setProfiles((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      notify.verified(
        'Review status updated',
        `@${updated.username} marked as ${reviewStatus.replace(/_/g, ' ').toLowerCase()}.`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof AuthApiError
          ? error.message
          : 'Unable to update review status.';
      notify.alert('Update failed', message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingProfile) return;
    const target = deletingProfile;
    setDeleting(true);
    try {
      await deleteSuspiciousProfile(target.id);
      const next = profiles.filter((item) => item.id !== target.id);
      setProfiles(next);
      if (selectedId === target.id) {
        setSelectedId(next[0]?.id ?? null);
      }
      setDeletingProfile(null);
      notify.info(
        'Report deleted',
        `Removed @${target.username} from suspicious profiles.`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof AuthApiError
          ? error.message
          : 'Unable to delete suspicious profile.';
      notify.alert('Delete failed', message);
    } finally {
      setDeleting(false);
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProfiles = profiles.filter((profile) => {
    if (statusFilter !== 'ALL' && profile.reviewStatus !== statusFilter) {
      return false;
    }
    if (!normalizedQuery) return true;
    const haystack = [
      profile.username,
      profile.displayName ?? '',
      profile.profileUrl ?? '',
      profile.bio ?? '',
      PLATFORM_LABEL_MAP[profile.platform] ?? profile.platform,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const selectedProfile =
    filteredProfiles.find((item) => item.id === selectedId) ??
    profiles.find((item) => item.id === selectedId) ??
    filteredProfiles[0] ??
    null;

  const pendingOrActiveCount = profiles.filter(
    (p) =>
      p.reviewStatus === 'PENDING_REVIEW' ||
      p.reviewStatus === 'UNDER_REVIEW' ||
      p.reviewStatus === 'ESCALATED',
  ).length;

  const highIndicatorCount = profiles.filter(
    (p) => p.latestAnalysis?.level === 'HIGH_SIMILARITY',
  ).length;

  return (
    <AppShell
      title="Suspicious Profiles & Intelligence"
      subtitle="Submit observed profiles and review explainable similarity indicators"
      user={user}
      topBarActions={
        <Button type="button" size="sm" onClick={() => setReportOpen(true)}>
          <Plus className="h-4 w-4" />
          Report Profile
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Non-scraping & Indicator-Only Guidance Banner */}
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
              <ScanSearch className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Explainable Similarity Analysis
                </h2>
                <Badge variant="neutral">Indicators Only</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                SafeSignal compares your submitted profile fields (username,
                display name, bio text, and URL/domain) against your
                user-declared official accounts without scraping social media
                websites. Scores highlight review indicators, never proof that an
                account is fake.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={reloading}
            onClick={refreshProfiles}
            className="shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {officialAccountCount === 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <span>
                You have not registered any user-declared official accounts yet.
                You can still log suspicious profiles now, then register official
                accounts in Identity Protection and re-run comparison.
              </span>
            </div>
            <Link
              href="/identity"
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100/60"
            >
              Add Official Accounts
            </Link>
          </div>
        )}

        {loadFailed && (
          <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>
                Unable to load suspicious profiles right now. Retry below.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={reloading}
              onClick={refreshProfiles}
            >
              Retry
            </Button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Reported Profiles
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {profiles.length}
                </p>
              </div>
              <ScanSearch className="h-4 w-4 text-slate-500" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Needing Review
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {pendingOrActiveCount}
                </p>
              </div>
              <Badge variant="warning">Manual Queue</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  High Similarity
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {highIndicatorCount}
                </p>
              </div>
              <ShieldAlert className="h-4 w-4 text-red-600" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Official Baseline
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {officialAccountCount}
                </p>
              </div>
              <Fingerprint className="h-4 w-4 text-slate-500" />
            </CardContent>
          </Card>
        </div>

        {/* Filter Bar */}
        {profiles.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search username, display name, URL, or bio..."
                className="pl-9"
                aria-label="Filter suspicious profiles"
              />
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="review-status-filter"
                className="text-xs font-medium text-slate-600"
              >
                Status
              </label>
              <select
                id="review-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-2xs focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
              >
                <option value="ALL">All statuses ({profiles.length})</option>
                {SUSPICIOUS_PROFILE_STATUS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Content Grid + Breakdown Inspector */}
        {profiles.length === 0 ? (
          <EmptyState
            icon={<ScanSearch className="h-5 w-5" />}
            title="No suspicious profiles submitted yet"
            description="Submit an observed profile URL, platform, username, display name, and bio to compare against your user-declared official accounts."
            action={
              <Button type="button" onClick={() => setReportOpen(true)}>
                <Plus className="h-4 w-4" />
                Report Suspicious Profile
              </Button>
            }
          />
        ) : filteredProfiles.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No matching suspicious profiles"
            description="Adjust your search text or status filter."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
              >
                Clear Filters
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-5">
              {filteredProfiles.map((profile) => (
                <SuspiciousProfileCard
                  key={profile.id}
                  profile={profile}
                  selected={selectedProfile?.id === profile.id}
                  reanalyzing={reanalyzingId === profile.id}
                  onSelect={(item) => setSelectedId(item.id)}
                  onReanalyze={handleReanalyze}
                  onDelete={setDeletingProfile}
                />
              ))}
            </div>

            <div className="xl:col-span-7">
              {selectedProfile && (
                <SimilarityBreakdownPanel
                  profile={selectedProfile}
                  updatingStatus={updatingStatus}
                  reanalyzing={reanalyzingId === selectedProfile.id}
                  onUpdateStatus={handleUpdateStatus}
                  onReanalyze={handleReanalyze}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <ReportProfileDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        onReported={handleReported}
        incidents={incidents}
      />

      <ConfirmDialog
        open={deletingProfile !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) {
            setDeletingProfile(null);
          }
        }}
        title="Delete suspicious profile report?"
        description={
          deletingProfile
            ? `This removes @${deletingProfile.username} and its stored similarity analysis history from your workspace.`
            : ''
        }
        confirmLabel="Delete Report"
        variant="destructive"
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </AppShell>
  );
}
