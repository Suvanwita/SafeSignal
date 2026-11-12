'use client';

import * as React from 'react';
import {
  AlertCircle,
  ExternalLink,
  Image as ImageIcon,
  Info,
  RefreshCw,
  Save,
  ShieldAlert,
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
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { PLATFORM_LABEL_MAP } from '@/lib/identity/types';
import {
  SUSPICIOUS_PROFILE_STATUS_MAP,
  SUSPICIOUS_PROFILE_STATUS_OPTIONS,
  type DimensionBreakdown,
  type IndicatorLevel,
  type OfficialAccountComparison,
  type SimilarityLevel,
  type SuspiciousProfile,
  type SuspiciousProfileStatus,
} from '@/lib/intelligence/types';
import { cn } from '@/lib/utils';

export interface SimilarityBreakdownPanelProps {
  profile: SuspiciousProfile;
  updatingStatus: boolean;
  reanalyzing: boolean;
  onUpdateStatus: (
    profileId: string,
    reviewStatus: SuspiciousProfileStatus,
    notes: string | null,
  ) => Promise<void>;
  onReanalyze: (profileId: string) => Promise<void>;
}

function levelBadgeProps(level: SimilarityLevel) {
  switch (level) {
    case 'HIGH_SIMILARITY':
      return { variant: 'alert' as const, label: 'High Similarity Indicator' };
    case 'MODERATE_SIMILARITY':
      return {
        variant: 'warning' as const,
        label: 'Moderate Similarity Indicator',
      };
    case 'LOW_SIMILARITY':
      return { variant: 'neutral' as const, label: 'Low Similarity Indicator' };
    case 'NO_BASELINE':
      return { variant: 'info' as const, label: 'No Baseline Registered' };
  }
}

function indicatorBadgeVariant(level: IndicatorLevel) {
  if (level === 'HIGH') return 'alert' as const;
  if (level === 'MODERATE') return 'warning' as const;
  return 'neutral' as const;
}

function scoreBarColor(score: number | null): string {
  if (score === null) return 'bg-slate-300';
  if (score >= 70) return 'bg-red-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-emerald-500';
}

interface DimensionCardProps {
  title: string;
  dimension: DimensionBreakdown;
}

function DimensionCard({ title, dimension }: DimensionCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-900">{title}</p>
          <p className="text-[11px] text-slate-500">
            Weight: {Math.round(dimension.weight * 100)}%
          </p>
        </div>
        {dimension.available && dimension.score !== null ? (
          <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
            {dimension.score}%
          </span>
        ) : (
          <Badge variant="neutral">Not Comparable</Badge>
        )}
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            scoreBarColor(dimension.available ? dimension.score : null),
          )}
          style={{
            width: `${dimension.available && dimension.score !== null ? dimension.score : 0}%`,
          }}
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        {dimension.explanation}
      </p>
    </div>
  );
}

export function SimilarityBreakdownPanel({
  profile,
  updatingStatus,
  reanalyzing,
  onUpdateStatus,
  onReanalyze,
}: SimilarityBreakdownPanelProps) {
  const analysis = profile.latestAnalysis;
  const comparisons = React.useMemo(
    () => analysis?.comparisons ?? [],
    [analysis?.comparisons],
  );

  const [selectedOfficialId, setSelectedOfficialId] = React.useState<
    string | null
  >(analysis?.matchedOfficialAccountId ?? null);

  const [draftStatus, setDraftStatus] =
    React.useState<SuspiciousProfileStatus>(profile.reviewStatus);
  const [draftNotes, setDraftNotes] = React.useState(profile.notes ?? '');

  React.useEffect(() => {
    setSelectedOfficialId(
      profile.latestAnalysis?.matchedOfficialAccountId ?? null,
    );
    setDraftStatus(profile.reviewStatus);
    setDraftNotes(profile.notes ?? '');
  }, [profile]);

  const activeComparison: OfficialAccountComparison | null = React.useMemo(() => {
    if (!analysis) return null;
    if (comparisons.length === 0) return null;
    return (
      comparisons.find((c) => c.officialAccountId === selectedOfficialId) ??
      analysis.bestMatch ??
      comparisons[0]
    );
  }, [analysis, comparisons, selectedOfficialId]);

  const statusMeta = SUSPICIOUS_PROFILE_STATUS_MAP[profile.reviewStatus];
  const scoreBadge = analysis ? levelBadgeProps(analysis.level) : null;

  async function handleStatusSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedNotes = draftNotes.trim();
    await onUpdateStatus(
      profile.id,
      draftStatus,
      cleanedNotes.length > 0 ? cleanedNotes : null,
    );
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-3 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="dark">
                {PLATFORM_LABEL_MAP[profile.platform] ?? profile.platform}
              </Badge>
              <Badge variant={statusMeta.badgeVariant} dot>
                {statusMeta.label}
              </Badge>
              {scoreBadge && (
                <Badge variant={scoreBadge.variant} dot>
                  {scoreBadge.label}
                </Badge>
              )}
            </div>
            <CardTitle className="pt-1 text-lg">
              {profile.displayName || `@${profile.username}`}
            </CardTitle>
            <p className="font-mono text-xs text-slate-600">
              @{profile.username}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={reanalyzing}
            onClick={() => onReanalyze(profile.id)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-run Analysis
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {profile.profileUrl && (
            <a
              href={profile.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              title={profile.profileUrl}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{profile.profileUrl}</span>
            </a>
          )}
          {profile.profileImageUrl && (
            <a
              href={profile.profileImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              title={`Image URL: ${profile.profileImageUrl}`}
            >
              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">
                Avatar URL: {profile.profileImageUrl}
              </span>
            </a>
          )}
        </div>

        {profile.bio && (
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              Submitted Bio Text
            </p>
            <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
              {profile.bio}
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {analysis ? (
          <>
            {/* Overall Similarity Summary + Disclaimer */}
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Explainable Similarity Score
                  </p>
                  <CardDescription className="mt-0.5 text-xs text-slate-700">
                    {analysis.summary}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {analysis.overallScore}
                  </span>
                  <span className="text-sm text-slate-500"> / 100</span>
                </div>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    scoreBarColor(analysis.overallScore),
                  )}
                  style={{ width: `${analysis.overallScore}%` }}
                />
              </div>

              <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span>{analysis.disclaimer}</span>
              </div>
            </div>

            {/* Official Account Comparison Switcher */}
            {comparisons.length > 0 && activeComparison && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Comparison Breakdown vs. Declared Official Account
                  </h4>
                  {comparisons.length > 1 && (
                    <select
                      aria-label="Select declared official account comparison"
                      value={activeComparison.officialAccountId}
                      onChange={(event) =>
                        setSelectedOfficialId(event.target.value)
                      }
                      className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 shadow-2xs focus-visible:outline-none"
                    >
                      {comparisons.map((item) => (
                        <option
                          key={item.officialAccountId}
                          value={item.officialAccountId}
                        >
                          {PLATFORM_LABEL_MAP[item.platform] ?? item.platform} ·{' '}
                          {item.username} ({item.overallScore}/100)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <DimensionCard
                    title="1. Username Similarity"
                    dimension={activeComparison.dimensions.username}
                  />
                  <DimensionCard
                    title="2. Display-Name Similarity"
                    dimension={activeComparison.dimensions.displayName}
                  />
                  <DimensionCard
                    title="3. Bio Text Similarity"
                    dimension={activeComparison.dimensions.bio}
                  />
                  <DimensionCard
                    title="4. Profile URL / Domain Comparison"
                    dimension={activeComparison.dimensions.profileUrl}
                  />
                </div>

                {/* Potential Indicators & Explanations */}
                <div className="space-y-2.5">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Potential Impersonation Indicators
                  </h4>
                  {activeComparison.indicators.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-200 px-3.5 py-3 text-xs text-slate-500">
                      No elevated similarity indicators triggered against{' '}
                      <span className="font-medium text-slate-700">
                        {activeComparison.username}
                      </span>
                      .
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeComparison.indicators.map((indicator, idx) => (
                        <div
                          key={`${indicator.id}-${idx}`}
                          className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3"
                        >
                          {indicator.level === 'HIGH' ? (
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                          ) : (
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-900">
                                {indicator.title}
                              </span>
                              <Badge
                                variant={indicatorBadgeVariant(indicator.level)}
                              >
                                {indicator.category.replace('_', ' ')}
                              </Badge>
                            </div>
                            <p className="text-xs leading-relaxed text-slate-600">
                              {indicator.explanation}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 p-4 text-xs text-slate-500">
            No similarity analysis stored yet. Click &ldquo;Re-run
            Analysis&rdquo; above to evaluate against your declared official
            accounts.
          </div>
        )}

        {/* Manual Review Status Workflow */}
        <form
          onSubmit={handleStatusSubmit}
          className="space-y-4 border-t border-slate-200 pt-5"
        >
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Manual Review Decision
            </h4>
            <p className="text-xs text-slate-500">
              You remain in control of review status; SafeSignal does not
              automatically declare profiles fake.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="review-status-select" label="Review Status">
              <select
                id="review-status-select"
                value={draftStatus}
                onChange={(event) =>
                  setDraftStatus(event.target.value as SuspiciousProfileStatus)
                }
                disabled={updatingStatus}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
              >
                {SUSPICIOUS_PROFILE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="flex items-end pb-1.5 text-xs text-slate-500">
              {SUSPICIOUS_PROFILE_STATUS_MAP[draftStatus].description}
            </div>
          </div>

          <FormField id="review-status-notes" label="Reviewer Notes">
            <Textarea
              id="review-status-notes"
              rows={2}
              value={draftNotes}
              onChange={(event) => setDraftNotes(event.target.value)}
              placeholder="Document manual review context, rationale, or follow-up plan..."
              disabled={updatingStatus}
              maxLength={1000}
            />
          </FormField>

          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={updatingStatus}>
              <Save className="h-3.5 w-3.5" />
              Update Review Status
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
