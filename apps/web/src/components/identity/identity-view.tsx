'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Fingerprint,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Star,
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
import {
  deleteOfficialAccount,
  setPrimaryOfficialAccount,
} from '@/lib/identity/client-identity';
import {
  PLATFORM_LABEL_MAP,
  type OfficialAccount,
} from '@/lib/identity/types';
import { AccountCard } from './account-card';
import { AccountFormDialog } from './account-form-dialog';

export interface IdentityViewProps {
  user: AuthUser;
  initialAccounts: OfficialAccount[] | null;
}

function sortAccounts(accounts: OfficialAccount[]): OfficialAccount[] {
  return [...accounts].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function IdentityView({ user, initialAccounts }: IdentityViewProps) {
  const [accounts, setAccounts] = React.useState<OfficialAccount[]>(() =>
    initialAccounts ? sortAccounts(initialAccounts) : [],
  );
  const [loadFailed, setLoadFailed] = React.useState(initialAccounts === null);
  const [reloading, setReloading] = React.useState(false);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [platformFilter, setPlatformFilter] = React.useState<string>('ALL');

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] =
    React.useState<OfficialAccount | null>(null);

  const [deletingAccount, setDeletingAccount] =
    React.useState<OfficialAccount | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [settingPrimaryId, setSettingPrimaryId] = React.useState<string | null>(
    null,
  );

  async function refreshAccounts() {
    setReloading(true);
    try {
      const response = await fetch('/api/identity/accounts', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load accounts');
      }
      const payload = (await response.json()) as {
        accounts: OfficialAccount[];
      };
      setAccounts(sortAccounts(payload.accounts ?? []));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      notify.alert(
        'Unable to refresh accounts',
        'Please check that the backend service is reachable.',
      );
    } finally {
      setReloading(false);
    }
  }

  function handleOpenCreate() {
    setEditingAccount(null);
    setFormOpen(true);
  }

  function handleOpenEdit(account: OfficialAccount) {
    setEditingAccount(account);
    setFormOpen(true);
  }

  function handleAccountSaved(
    saved: OfficialAccount,
    mode: 'create' | 'edit',
  ) {
    setAccounts((prev) => {
      const cleared = saved.isPrimary
        ? prev.map((item) => ({ ...item, isPrimary: false }))
        : prev;

      if (mode === 'create') {
        return sortAccounts([saved, ...cleared]);
      }
      return sortAccounts(
        cleared.map((item) => (item.id === saved.id ? saved : item)),
      );
    });

    notify.verified(
      mode === 'create' ? 'Official account added' : 'Official account updated',
      `${PLATFORM_LABEL_MAP[saved.platform] ?? saved.platform}: ${saved.username} saved as user-declared.`,
    );
  }

  async function handleSetPrimary(account: OfficialAccount) {
    setSettingPrimaryId(account.id);
    try {
      const updated = await setPrimaryOfficialAccount(account.id);
      setAccounts((prev) =>
        sortAccounts(
          prev.map((item) =>
            item.id === updated.id ? updated : { ...item, isPrimary: false },
          ),
        ),
      );
      notify.verified(
        'Primary account updated',
        `${updated.username} is now marked as your primary user-declared account.`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof AuthApiError
          ? error.message
          : 'Unable to update primary account.';
      notify.alert('Action failed', message);
    } finally {
      setSettingPrimaryId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingAccount) return;
    const target = deletingAccount;
    setDeleting(true);
    try {
      await deleteOfficialAccount(target.id);
      setAccounts((prev) => prev.filter((item) => item.id !== target.id));
      setDeletingAccount(null);
      notify.info(
        'Official account removed',
        `${target.username} has been deleted from your registry.`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof AuthApiError
          ? error.message
          : 'Unable to delete official account.';
      notify.alert('Delete failed', message);
    } finally {
      setDeleting(false);
    }
  }

  const primaryAccount = accounts.find((item) => item.isPrimary) ?? null;
  const distinctPlatforms = Array.from(
    new Set(accounts.map((item) => item.platform)),
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredAccounts = accounts.filter((account) => {
    if (platformFilter !== 'ALL' && account.platform !== platformFilter) {
      return false;
    }
    if (!normalizedQuery) return true;
    const haystack = [
      account.platform,
      PLATFORM_LABEL_MAP[account.platform] ?? '',
      account.username,
      account.displayName ?? '',
      account.profileUrl ?? '',
      account.notes ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return (
    <AppShell
      title="Identity Protection"
      subtitle="Manage your user-declared official social media and web accounts"
      user={user}
      topBarActions={
        <Button type="button" size="sm" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  User-Declared Account Registry
                </h2>
                <Badge variant="neutral">Self-Declared</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Register the handles, usernames, and URLs you officially operate
                so impersonation investigations reference consistent baselines.
                Entries are user-declared and do not imply external platform
                verification.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={reloading}
            onClick={refreshAccounts}
            className="shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {loadFailed && (
          <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>
                Unable to load your official accounts right now. Retry below.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={reloading}
              onClick={refreshAccounts}
            >
              Retry
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Declared Accounts
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {accounts.length}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
                <Fingerprint className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-medium text-slate-500">
                  Primary Account
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {primaryAccount
                    ? `${PLATFORM_LABEL_MAP[primaryAccount.platform] ?? primaryAccount.platform} · ${primaryAccount.username}`
                    : 'None selected'}
                </p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700">
                <Star className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Platforms Covered
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {distinctPlatforms.length}
                </p>
              </div>
              <Badge variant="neutral">Owned</Badge>
            </CardContent>
          </Card>
        </div>

        {accounts.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Filter by username, display name, or URL..."
                className="pl-9"
                aria-label="Filter official accounts"
              />
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="platform-filter"
                className="text-xs font-medium text-slate-600"
              >
                Platform
              </label>
              <select
                id="platform-filter"
                value={platformFilter}
                onChange={(event) => setPlatformFilter(event.target.value)}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-2xs focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
              >
                <option value="ALL">All platforms ({accounts.length})</option>
                {distinctPlatforms.map((item) => (
                  <option key={item} value={item}>
                    {PLATFORM_LABEL_MAP[item] ?? item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {accounts.length === 0 ? (
          <EmptyState
            icon={<Fingerprint className="h-5 w-5" />}
            title="No official accounts registered yet"
            description="Add your user-declared social media handles, email addresses, or domains so impersonation checks and incident reports have an accurate reference."
            action={
              <Button type="button" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" />
                Add Your First Official Account
              </Button>
            }
          />
        ) : filteredAccounts.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No matching official accounts"
            description="Adjust your search query or platform filter to view your registered accounts."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setPlatformFilter('ALL');
                }}
              >
                Clear Filters
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                settingPrimaryId={settingPrimaryId}
                onEdit={handleOpenEdit}
                onDelete={setDeletingAccount}
                onSetPrimary={handleSetPrimary}
              />
            ))}
          </div>
        )}
      </div>

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editingAccount}
        hasAnyAccounts={accounts.length > 0}
        onSaved={handleAccountSaved}
      />

      <ConfirmDialog
        open={deletingAccount !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) {
            setDeletingAccount(null);
          }
        }}
        title="Delete user-declared account?"
        description={
          deletingAccount
            ? `This will permanently remove ${deletingAccount.username} (${PLATFORM_LABEL_MAP[deletingAccount.platform] ?? deletingAccount.platform}) from your declared official accounts.`
            : ''
        }
        confirmLabel="Delete Account"
        variant="destructive"
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </AppShell>
  );
}
