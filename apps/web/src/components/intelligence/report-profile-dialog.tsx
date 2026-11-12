'use client';

import * as React from 'react';
import { ShieldAlert } from 'lucide-react';
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
import { PLATFORM_OPTIONS, type Platform } from '@/lib/identity/types';
import { reportSuspiciousProfile } from '@/lib/intelligence/client-intelligence';
import type { SuspiciousProfile } from '@/lib/intelligence/types';

export interface IncidentOptionItem {
  id: string;
  title: string;
  status: string;
}

export interface ReportProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReported: (profile: SuspiciousProfile) => void;
  incidents?: IncidentOptionItem[];
}

interface FormErrors {
  profileUrl?: string;
  platform?: string;
  username?: string;
  displayName?: string;
  bio?: string;
  profileImageUrl?: string;
  notes?: string;
  incidentId?: string;
  newIncidentTitle?: string;
  form?: string;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ReportProfileDialog({
  open,
  onOpenChange,
  onReported,
  incidents = [],
}: ReportProfileDialogProps) {
  const [platform, setPlatform] = React.useState<Platform>('X');
  const [profileUrl, setProfileUrl] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [profileImageUrl, setProfileImageUrl] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [incidentMode, setIncidentMode] = React.useState<'none' | 'existing' | 'new'>('none');
  const [selectedIncidentId, setSelectedIncidentId] = React.useState('');
  const [newIncidentTitle, setNewIncidentTitle] = React.useState('');
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPlatform('X');
    setProfileUrl('');
    setUsername('');
    setDisplayName('');
    setBio('');
    setProfileImageUrl('');
    setNotes('');
    setIncidentMode('none');
    setSelectedIncidentId(incidents[0]?.id ?? '');
    setNewIncidentTitle('');
    setErrors({});
  }, [open, incidents]);

  const selectedPlatform = React.useMemo(
    () =>
      PLATFORM_OPTIONS.find((item) => item.value === platform) ??
      PLATFORM_OPTIONS[0],
    [platform],
  );

  function validateClient(): FormErrors {
    const nextErrors: FormErrors = {};

    const trimmedUrl = profileUrl.trim();
    if (!trimmedUrl) {
      nextErrors.profileUrl = 'Profile URL is required';
    } else if (trimmedUrl.length > 500) {
      nextErrors.profileUrl = 'Profile URL must not exceed 500 characters';
    } else if (!isValidHttpUrl(trimmedUrl)) {
      nextErrors.profileUrl =
        'Profile URL must be a valid http:// or https:// URL';
    }

    const trimmedUsername = username.trim();
    const strippedSocial =
      platform === 'EMAIL' || platform === 'WEBSITE'
        ? trimmedUsername
        : trimmedUsername.replace(/^@+/, '');

    if (!trimmedUsername || strippedSocial.length === 0) {
      nextErrors.username = 'Username or handle is required';
    } else if (trimmedUsername.length > 100) {
      nextErrors.username = 'Username must not exceed 100 characters';
    }

    if (displayName.trim().length > 100) {
      nextErrors.displayName = 'Display name must not exceed 100 characters';
    }

    if (bio.trim().length > 2000) {
      nextErrors.bio = 'Bio text must not exceed 2000 characters';
    }

    const trimmedImageUrl = profileImageUrl.trim();
    if (trimmedImageUrl.length > 0) {
      if (trimmedImageUrl.length > 1000) {
        nextErrors.profileImageUrl =
          'Profile image URL must not exceed 1000 characters';
      } else if (!isValidHttpUrl(trimmedImageUrl)) {
        nextErrors.profileImageUrl =
          'Profile image URL must be a valid http:// or https:// URL';
      }
    }

    if (notes.trim().length > 1000) {
      nextErrors.notes = 'Notes must not exceed 1000 characters';
    }

    if (incidentMode === 'existing' && !selectedIncidentId) {
      nextErrors.incidentId = 'Please select an existing safety incident';
    }

    if (incidentMode === 'new') {
      const trimmedTitle = newIncidentTitle.trim();
      if (!trimmedTitle) {
        nextErrors.newIncidentTitle = 'Incident title is required';
      } else if (trimmedTitle.length < 3) {
        nextErrors.newIncidentTitle = 'Incident title must be at least 3 characters';
      } else if (trimmedTitle.length > 200) {
        nextErrors.newIncidentTitle = 'Incident title must not exceed 200 characters';
      }
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

    try {
      const created = await reportSuspiciousProfile({
        platform,
        profileUrl: profileUrl.trim(),
        username: username.trim(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(bio.trim() ? { bio: bio.trim() } : {}),
        ...(profileImageUrl.trim()
          ? { profileImageUrl: profileImageUrl.trim() }
          : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(incidentMode === 'existing' && selectedIncidentId
          ? { incidentId: selectedIncidentId }
          : {}),
        ...(incidentMode === 'new' && newIncidentTitle.trim()
          ? { newIncidentTitle: newIncidentTitle.trim() }
          : {}),
      });
      onReported(created);
      onOpenChange(false);
    } catch (error: unknown) {
      if (error instanceof AuthApiError) {
        const mapped: FormErrors = { form: error.message };
        if (error.details) {
          for (const detail of error.details) {
            const firstMessage = detail.messages[0];
            if (!firstMessage) continue;
            if (detail.field === 'profileUrl') mapped.profileUrl = firstMessage;
            if (detail.field === 'platform') mapped.platform = firstMessage;
            if (detail.field === 'username') mapped.username = firstMessage;
            if (detail.field === 'displayName') {
              mapped.displayName = firstMessage;
            }
            if (detail.field === 'bio') mapped.bio = firstMessage;
            if (detail.field === 'profileImageUrl') {
              mapped.profileImageUrl = firstMessage;
            }
            if (detail.field === 'notes') mapped.notes = firstMessage;
          }
        }
        setErrors(mapped);
      } else {
        setErrors({
          form: 'An unexpected error occurred while submitting the suspicious profile.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report Suspicious Profile</DialogTitle>
          <DialogDescription>
            Submit observed profile details manually for explainable similarity
            comparison against your declared official accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>
            SafeSignal never scrapes external social networks. Automated
            similarity scores are review indicators based strictly on your
            submitted details and do not determine whether an account is fake.
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
              id="suspicious-platform"
              label="Platform"
              required
              error={errors.platform}
            >
              <select
                id="suspicious-platform"
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
              id="suspicious-username"
              label="Username / Handle"
              required
              error={errors.username}
            >
              <Input
                id="suspicious-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={`e.g. ${selectedPlatform.handlePlaceholder}_support`}
                disabled={submitting}
                aria-invalid={Boolean(errors.username)}
                maxLength={100}
              />
            </FormField>
          </div>

          <FormField
            id="suspicious-profile-url"
            label="Profile URL"
            required
            description="Public URL of the reported profile (must start with http:// or https://)"
            error={errors.profileUrl}
          >
            <Input
              id="suspicious-profile-url"
              type="url"
              value={profileUrl}
              onChange={(event) => setProfileUrl(event.target.value)}
              placeholder={selectedPlatform.urlPlaceholder}
              disabled={submitting}
              aria-invalid={Boolean(errors.profileUrl)}
              maxLength={500}
            />
          </FormField>

          <FormField
            id="suspicious-display-name"
            label="Display Name"
            description="Observed profile display name shown to users"
            error={errors.displayName}
          >
            <Input
              id="suspicious-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. SafeSignal Official Support"
              disabled={submitting}
              aria-invalid={Boolean(errors.displayName)}
              maxLength={100}
            />
          </FormField>

          <FormField
            id="suspicious-bio"
            label="Bio"
            description="Copy-paste observed profile bio text for keyword and brand reference checks"
            error={errors.bio}
          >
            <Textarea
              id="suspicious-bio"
              rows={3}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Paste the bio or profile description text..."
              disabled={submitting}
              aria-invalid={Boolean(errors.bio)}
              maxLength={2000}
            />
          </FormField>

          <FormField
            id="suspicious-image-url"
            label="Profile Image URL (Optional)"
            description="Optional avatar/image URL for manual reference only (never fetched automatically)"
            error={errors.profileImageUrl}
          >
            <Input
              id="suspicious-image-url"
              type="url"
              value={profileImageUrl}
              onChange={(event) => setProfileImageUrl(event.target.value)}
              placeholder="https://example.org/avatars/profile.png"
              disabled={submitting}
              aria-invalid={Boolean(errors.profileImageUrl)}
              maxLength={1000}
            />
          </FormField>

          <FormField
            id="suspicious-notes"
            label="Review Notes (Optional)"
            error={errors.notes}
          >
            <Textarea
              id="suspicious-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Where this profile was encountered or initial observation notes..."
              disabled={submitting}
              aria-invalid={Boolean(errors.notes)}
              maxLength={1000}
            />
          </FormField>

          {/* Incident Association */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900">
              Incident Association (Optional)
            </div>
            <p className="text-xs text-slate-500">
              Optionally link this suspicious profile to a safety incident to coordinate evidence and timelines.
            </p>

            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex cursor-pointer items-center justify-center rounded-md border p-2 text-xs font-medium text-center transition-colors ${
                  incidentMode === 'none'
                    ? 'border-slate-900 bg-white text-slate-900 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="incidentMode"
                  value="none"
                  checked={incidentMode === 'none'}
                  onChange={() => setIncidentMode('none')}
                  className="sr-only"
                />
                Standalone
              </label>

              <label
                className={`flex cursor-pointer items-center justify-center rounded-md border p-2 text-xs font-medium text-center transition-colors ${
                  incidentMode === 'existing'
                    ? 'border-slate-900 bg-white text-slate-900 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="incidentMode"
                  value="existing"
                  checked={incidentMode === 'existing'}
                  onChange={() => setIncidentMode('existing')}
                  className="sr-only"
                />
                Existing Incident
              </label>

              <label
                className={`flex cursor-pointer items-center justify-center rounded-md border p-2 text-xs font-medium text-center transition-colors ${
                  incidentMode === 'new'
                    ? 'border-slate-900 bg-white text-slate-900 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="incidentMode"
                  value="new"
                  checked={incidentMode === 'new'}
                  onChange={() => setIncidentMode('new')}
                  className="sr-only"
                />
                New Incident
              </label>
            </div>

            {incidentMode === 'existing' && (
              <FormField
                id="incident-select"
                label="Select Existing Incident"
                error={errors.incidentId}
              >
                {incidents.length === 0 ? (
                  <p className="text-xs text-amber-600">
                    No active incidents found. Please choose "New Incident" to create one.
                  </p>
                ) : (
                  <select
                    id="incident-select"
                    value={selectedIncidentId}
                    onChange={(e) => setSelectedIncidentId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                    disabled={submitting}
                  >
                    <option value="">— Select incident —</option>
                    {incidents.map((inc) => (
                      <option key={inc.id} value={inc.id}>
                        {inc.title} ({inc.status})
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            )}

            {incidentMode === 'new' && (
              <FormField
                id="new-incident-title"
                label="New Incident Title"
                error={errors.newIncidentTitle}
              >
                <Input
                  id="new-incident-title"
                  value={newIncidentTitle}
                  onChange={(e) => setNewIncidentTitle(e.target.value)}
                  placeholder="e.g. Coordinated Impersonator Campaign"
                  disabled={submitting}
                  maxLength={200}
                />
              </FormField>
            )}
          </div>

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
              Run Similarity Analysis & Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
