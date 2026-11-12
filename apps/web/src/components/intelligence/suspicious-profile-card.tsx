'use client';

import {
  ExternalLink,
  RefreshCw,
  ScanSearch,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PLATFORM_LABEL_MAP } from '@/lib/identity/types';
import {
  SUSPICIOUS_PROFILE_STATUS_MAP,
  type SimilarityLevel,
  type SuspiciousProfile,
} from '@/lib/intelligence/types';
import { cn } from '@/lib/utils';

export interface SuspiciousProfileCardProps {
  profile: SuspiciousProfile;
  selected: boolean;
  reanalyzing: boolean;
  onSelect: (profile: SuspiciousProfile) => void;
  onReanalyze: (profileId: string) => void;
  onDelete: (profile: SuspiciousProfile) => void;
}

function similarityBadgeVariant(level: SimilarityLevel) {
  switch (level) {
    case 'HIGH_SIMILARITY':
      return 'alert' as const;
    case 'MODERATE_SIMILARITY':
      return 'warning' as const;
    case 'LOW_SIMILARITY':
      return 'neutral' as const;
    case 'NO_BASELINE':
      return 'info' as const;
  }
}

export function SuspiciousProfileCard({
  profile,
  selected,
  reanalyzing,
  onSelect,
  onReanalyze,
  onDelete,
}: SuspiciousProfileCardProps) {
  const analysis = profile.latestAnalysis;
  const statusMeta = SUSPICIOUS_PROFILE_STATUS_MAP[profile.reviewStatus];

  return (
    <Card
      className={cn(
        'flex flex-col justify-between transition-colors',
        selected
          ? 'border-slate-900 ring-1 ring-slate-900/15'
          : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div>
        <CardHeader className="space-y-2.5 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="dark">
              {PLATFORM_LABEL_MAP[profile.platform] ?? profile.platform}
            </Badge>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={statusMeta.badgeVariant} dot>
                {statusMeta.label}
              </Badge>
              {analysis && (
                <Badge variant={similarityBadgeVariant(analysis.level)}>
                  Score {analysis.overallScore}/100
                </Badge>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              {profile.displayName || `@${profile.username}`}
            </CardTitle>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-600">
              @{profile.username}
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {profile.profileUrl && (
            <a
              href={profile.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              title={profile.profileUrl}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{profile.profileUrl}</span>
            </a>
          )}

          {analysis && (
            <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
              {analysis.summary}
            </p>
          )}

          {analysis && analysis.indicators.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {analysis.indicators.slice(0, 2).map((indicator, index) => (
                <span
                  key={`${indicator.id}-${index}`}
                  className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                >
                  {indicator.title}
                </span>
              ))}
              {analysis.indicators.length > 2 && (
                <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                  +{analysis.indicators.length - 2} more
                </span>
              )}
            </div>
          )}
        </CardContent>
      </div>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <Button
          type="button"
          size="sm"
          variant={selected ? 'default' : 'outline'}
          onClick={() => onSelect(profile)}
        >
          <ScanSearch className="h-3.5 w-3.5" />
          {selected ? 'Inspecting' : 'Inspect Analysis'}
        </Button>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={reanalyzing}
            onClick={() => onReanalyze(profile.id)}
            aria-label={`Re-analyze ${profile.username}`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-analyze
          </Button>
          <Button
            type="button"
            size="sm"
            variant="alertOutline"
            onClick={() => onDelete(profile)}
            aria-label={`Delete ${profile.username}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
