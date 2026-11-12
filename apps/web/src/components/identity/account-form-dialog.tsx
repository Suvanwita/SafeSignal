'use client';

import * as React from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AuthApiError } from '@/lib/auth/client-api';
import {
  createOfficialAccount,
  updateOfficialAccount,
} from '@/lib/identity/client-identity';
import {
  PLATFORM_OPTIONS,
  type OfficialAccount,
  type Platform,
} from '@/lib/identity/types';

export interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: OfficialAccount | null;
  hasAnyAccounts: boolean;
  onSaved: (account: OfficialAccount, mode: 'create' | 'edit') => void;
}

interface FormErrors {
  platform?: string;
  username?: string;
  profileUrl?: string;
  displayName?: string;
  notes?: string;
  form?: string;
}

function validateHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  hasAnyAccounts,
  onSaved,
}: AccountFormDialogProps) {
  const isEditing = account !== null;

  const [platform, setPlatform] = React.useState<Platform>('X');
  const [username, setUsername] = React.useState('');
  const [profileUrl, setProfileUrl] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [isPrimary, setIsPrimary] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    if (account) {
      setPlatform(account.platform);
      setUsername(account.username);
      setProfileUrl(account.profileUrl ?? '');
      setDisplayName(account.displayName ?? '');
      setNotes(account.notes ?? '');
      setIsPrimary(account.isPrimary);
    } else {
      setPlatform('X');
      setUsername('');
      setProfileUrl('');
      setDisplayName('');
      setNotes('');
      setIsPrimary(!hasAnyAccounts);
    }
    setErrors({});
  }, [open, account, hasAnyAccounts]);

  const selectedPlatformMeta = React.useMemo(
    () =>
      PLATFORM_OPTIONS.find((item) => item.value === platform) ??
      PLATFORM_OPTIONS[0],
    [platform],
  );

  function validateClient(): FormErrors {
    const nextErrors: FormErrors = {};
    const trimmedUsername = username.trim();
    const normalizedSocialHandle =
      platform === 'EMAIL' || platform === 'WEBSITE'
        ? trimmedUsername
        : trimmedUsername.replace(/^@+/, '');

    if (!trimmedUsername || normalizedSocialHandle.length === 0) {
      nextErrors.username = 'Username or handle is required';
    } else if (trimmedUsername.length > 100) {
      nextErrors.username = 'Username must not exceed 100 characters';
    }

    const trimmedUrl = profileUrl.trim();
    if (trimmedUrl.length > 0) {
      if (trimmedUrl.length > 500) {
        nextErrors.profileUrl = 'Profile URL must not exceed 500 characters';
      } else if (!validateHttpUrl(trimmedUrl)) {
        nextErrors.profileUrl =
          'Profile URL must be a valid http:// or https:// URL';
      }
    }

    if (displayName.trim().length > 100) {
      nextErrors.displayName = 'Display name must not exceed 100 characters';
    }

    if (notes.trim().length > 1000) {
      nextErrors.notes = 'Notes must not exceed 1000 characters';
    }

    return nextErrors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    const trimmedUsername = username.trim();
    const trimmedUrl = profileUrl.trim();
    const trimmedDisplayName = displayName.trim();
    const trimmedNotes = notes.trim();

    try {
      if (isEditing && account) {
        const updated = await updateOfficialAccount(account.id, {
          platform,
          username: trimmedUsername,
          profileUrl: trimmedUrl.length > 0 ? trimmedUrl : null,
          displayName: trimmedDisplayName.length > 0 ? trimmedDisplayName : null,
          notes: trimmedNotes.length > 0 ? trimmedNotes : null,
          isPrimary,
        });
        onSaved(updated, 'edit');
      } else {
        const created = await createOfficialAccount({
          platform,
          username: trimmedUsername,
          ...(trimmedUrl.length > 0 ? { profileUrl: trimmedUrl } : {}),
          ...(trimmedDisplayName.length > 0
            ? { displayName: trimmedDisplayName }
            : {}),
          ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
          isPrimary,
        });
        onSaved(created, 'create');
      }
      onOpenChange(false);
    } catch (error: unknown) {
      if (error instanceof AuthApiError) {
        const mappedErrors: FormErrors = {
          form: error.message,
        };
        if (error.details) {
          for (const detail of error.details) {
            const firstMessage = detail.messages[0];
            if (!firstMessage) continue;
            if (detail.field === 'platform') mappedErrors.platform = firstMessage;
            if (detail.field === 'username') mappedErrors.username = firstMessage;
            if (detail.field === 'profileUrl') {
              mappedErrors.profileUrl = firstMessage;
            }
            if (detail.field === 'displayName') {
              mappedErrors.displayName = firstMessage;
            }
            if (detail.field === 'notes') mappedErrors.notes = firstMessage;
          }
        }
        setErrors(mappedErrors);
      } else {
        setErrors({
          form: 'An unexpected error occurred while saving your official account.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? 'Edit Official Account'
              : 'Add User-Declared Official Account'}
          </DialogTitle>
          <DialogDescription>
            Record one of your official social media profiles or web channels for
            impersonation reference.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p>
            Accounts listed here are{' '}
            <span className="font-semibold text-slate-800">user-declared</span>{' '}
            entries owned by your workspace. SafeSignal does not claim external
            platform verification.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {errors.form && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            >
              {errors.form}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="official-platform"
              label="Platform"
              required
              error={errors.platform}
            >
              <select
                id="official-platform"
                value={platform}
                onChange={(event) => setPlatform(event.target.value as Platform)}
                disabled={submitting}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs transition-colors focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              id="official-username"
              label="Username / Handle"
              required
              error={errors.username}
            >
              <Input
                id="official-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={selectedPlatformMeta.handlePlaceholder}
                disabled={submitting}
                aria-invalid={Boolean(errors.username)}
                maxLength={100}
              />
            </FormField>
          </div>

          <FormField
            id="official-display-name"
            label="Display Name"
            description="Public name shown on that profile"
            error={errors.displayName}
          >
            <Input
              id="official-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. SafeSignal Security Team"
              disabled={submitting}
              aria-invalid={Boolean(errors.displayName)}
              maxLength={100}
            />
          </FormField>

          <FormField
            id="official-profile-url"
            label="Profile URL"
            description="Full public link starting with http:// or https://"
            error={errors.profileUrl}
          >
            <Input
              id="official-profile-url"
              type="url"
              value={profileUrl}
              onChange={(event) => setProfileUrl(event.target.value)}
              placeholder={selectedPlatformMeta.urlPlaceholder}
              disabled={submitting}
              aria-invalid={Boolean(errors.profileUrl)}
              maxLength={500}
            />
          </FormField>

          <FormField
            id="official-notes"
            label="Notes"
            description="Optional context (e.g. regional handle, purpose, campaign use)"
            error={errors.notes}
          >
            <Textarea
              id="official-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional ownership context or moderation notes..."
              disabled={submitting}
              aria-invalid={Boolean(errors.notes)}
              maxLength={1000}
            />
          </FormField>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(event) => setIsPrimary(event.target.checked)}
              disabled={submitting}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
            />
            <span className="text-xs leading-relaxed text-slate-700">
              <span className="block font-semibold text-slate-900">
                Mark as primary official account
              </span>
              Setting this as primary clears the primary designation from any
              previously marked account.
            </span>
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {isEditing ? 'Save Changes' : 'Add Official Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
