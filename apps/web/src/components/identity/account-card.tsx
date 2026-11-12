'use client';

import {
  ExternalLink,
  Globe,
  Mail,
  Pencil,
  Star,
  Trash2,
  UserCheck,
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
import {
  PLATFORM_LABEL_MAP,
  type OfficialAccount,
  type Platform,
} from '@/lib/identity/types';
import { cn } from '@/lib/utils';

export interface AccountCardProps {
  account: OfficialAccount;
  settingPrimaryId: string | null;
  onEdit: (account: OfficialAccount) => void;
  onDelete: (account: OfficialAccount) => void;
  onSetPrimary: (account: OfficialAccount) => void;
}

function formatHandle(platform: Platform, username: string): string {
  if (platform === 'EMAIL' || platform === 'WEBSITE') {
    return username;
  }
  return username.startsWith('@') ? username : `@${username}`;
}

function formatShortDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

export function AccountCard({
  account,
  settingPrimaryId,
  onEdit,
  onDelete,
  onSetPrimary,
}: AccountCardProps) {
  const isPromoting = settingPrimaryId === account.id;
  const platformLabel =
    PLATFORM_LABEL_MAP[account.platform] ?? account.platform;

  const PlatformIcon =
    account.platform === 'EMAIL'
      ? Mail
      : account.platform === 'WEBSITE'
        ? Globe
        : UserCheck;

  return (
    <Card
      className={cn(
        'flex flex-col justify-between transition-colors',
        account.isPrimary
          ? 'border-sky-300 ring-1 ring-sky-100'
          : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              <PlatformIcon className="h-3.5 w-3.5 text-slate-500" />
              <span>{platformLabel}</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {account.isPrimary && (
                <Badge variant="info" dot>
                  Primary
                </Badge>
              )}
              <Badge
                variant="neutral"
                title="Self-declared by workspace owner; not externally verified"
              >
                User-Declared
              </Badge>
            </div>
          </div>

          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              {account.displayName || formatHandle(account.platform, account.username)}
            </CardTitle>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-600">
              {formatHandle(account.platform, account.username)}
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {account.profileUrl ? (
            <a
              href={account.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 truncate rounded-md border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
              title={account.profileUrl}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-700" />
              <span className="truncate">{account.profileUrl}</span>
            </a>
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 px-2.5 py-1.5 text-xs text-slate-400">
              No profile URL provided
            </div>
          )}

          {account.notes && (
            <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
              {account.notes}
            </p>
          )}

          <p className="text-[11px] text-slate-400">
            Updated {formatShortDate(account.updatedAt)}
          </p>
        </CardContent>
      </div>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        {!account.isPrimary ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isPromoting}
            disabled={settingPrimaryId !== null && !isPromoting}
            onClick={() => onSetPrimary(account)}
          >
            <Star className="h-3.5 w-3.5" />
            Mark Primary
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700">
            <Star className="h-3.5 w-3.5 fill-sky-500 text-sky-500" />
            Primary account
          </span>
        )}

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(account)}
            aria-label={`Edit ${account.username}`}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            type="button"
            variant="alertOutline"
            size="sm"
            onClick={() => onDelete(account)}
            aria-label={`Delete ${account.username}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
