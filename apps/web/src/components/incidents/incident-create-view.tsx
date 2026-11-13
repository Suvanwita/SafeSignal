'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FolderLock,
  Loader2,
  Shield,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
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
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/components/ui/toaster';
import {
  ABUSE_CATEGORY_LABEL_MAP,
  ABUSE_CATEGORY_OPTIONS,
  SEVERITY_MAP,
  SEVERITY_OPTIONS,
  type AbuseCategory,
  type Severity,
} from '@/lib/abuse/types';
import type { AuthUser } from '@/lib/auth/types';
import type { OfficialAccount } from '@/lib/identity/types';
import { createIncident } from '@/lib/incidents/client-incidents';
import type { CreateIncidentInput } from '@/lib/incidents/types';
import type { SuspiciousProfile } from '@/lib/intelligence/types';

export interface IncidentCreateViewProps {
  user: AuthUser;
  officialAccounts: OfficialAccount[];
  suspiciousProfiles: SuspiciousProfile[];
}

const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  LOW: 'Isolated or mild harassment; low immediate threat to privacy or safety.',
  MEDIUM: 'Persistent harassment, recurring unverified accounts, or moderate distress.',
  HIGH: 'Direct threats, doxxing, identity theft, or sustained coordinated campaign.',
  CRITICAL: 'Imminent personal danger, extortion, swatting, or severe physical safety threat.',
};

export function IncidentCreateView({
  user,
  officialAccounts,
  suspiciousProfiles,
}: IncidentCreateViewProps) {
  const router = useRouter();

  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<AbuseCategory>('HARASSMENT');
  const [severity, setSeverity] = React.useState<Severity>('MEDIUM');
  const [description, setDescription] = React.useState('');
  const [occurredAt, setOccurredAt] = React.useState('');
  const [officialAccountId, setOfficialAccountId] = React.useState('');
  const [suspiciousProfileId, setSuspiciousProfileId] = React.useState('');

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [validationErrors, setValidationErrors] = React.useState<
    Record<string, string>
  >({});

  const handleSetCurrentTime = () => {
    const now = new Date();
    // format as YYYY-MM-DDTHH:mm
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setOccurredAt(localIso);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      errors.title = 'Incident title is required';
    } else if (trimmedTitle.length < 3) {
      errors.title = 'Title must be at least 3 characters long';
    } else if (trimmedTitle.length > 200) {
      errors.title = 'Title must not exceed 200 characters';
    }

    if (description.length > 5000) {
      errors.description = 'Description must not exceed 5000 characters';
    }

    if (occurredAt) {
      const parsedDate = new Date(occurredAt);
      if (Number.isNaN(parsedDate.getTime())) {
        errors.occurredAt = 'Please provide a valid date and time';
      } else {
        const now = Date.now();
        const maxFuture = now + 24 * 60 * 60 * 1000;
        if (parsedDate.getTime() > maxFuture) {
          errors.occurredAt =
            'Incident date cannot be in the future (max 24h drift allowed)';
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreateIncidentInput = {
        title: title.trim(),
        category,
        severity,
        description: description.trim() || undefined,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        officialAccountId: officialAccountId || undefined,
        suspiciousProfileId: suspiciousProfileId || undefined,
      };

      const created = await createIncident(payload);

      notify.verified(
        'Safety incident created',
        `Incident case #${created.id.slice(0, 8)} opened.`,
      );

      router.push(`/incidents/${created.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to create incident case.';
      setFormError(message);
      notify.alert('Failed to create incident', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Create Safety Incident"
      subtitle="Initialize an authoritative safety case unifying abuse reports, evidence captures, and threat tracking."
      user={user}
      topBarActions={
        <Button asChild variant="outline" size="sm">
          <Link href="/incidents">
            <ArrowLeft className="h-4 w-4" />
            <span>Cancel</span>
          </Link>
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/incidents" className="hover:text-slate-900 hover:underline">
            Safety Incidents
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-800">New Incident Case</span>
        </div>

        {formError && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold">Unable to create incident case</p>
              <p className="mt-1 text-xs">{formError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Core Classification */}
          <Card className="border-slate-200">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Incident Overview & Classification</CardTitle>
                  <CardDescription>
                    Define the primary nature and severity of this safety event.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Title Field */}
              <FormField
                id="incident-title"
                label="Incident Case Title"
                required
                error={validationErrors.title}
                description="A distinct, descriptive title identifying the safety threat or pattern."
              >
                <Input
                  id="incident-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Coordinated harassment and doxxing campaign across Telegram"
                  maxLength={200}
                  className={validationErrors.title ? 'border-red-300 focus:border-red-500' : ''}
                />
                <div className="flex justify-end text-[11px] text-slate-400">
                  {title.length}/200
                </div>
              </FormField>

              {/* Category & Severity Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  id="incident-category"
                  label="Abuse Category"
                  required
                  description="Primary classification of abusive behavior."
                >
                  <select
                    id="incident-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as AbuseCategory)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none"
                  >
                    {ABUSE_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  id="incident-severity"
                  label="Severity Rating"
                  required
                  description="Initial risk and impact assessment."
                >
                  <select
                    id="incident-severity"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as Severity)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none"
                  >
                    {SEVERITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} Severity
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              {/* Severity Explanation Banner */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={SEVERITY_MAP[severity]?.statusBadge ?? 'medium'}
                    label={`${severity} Priority`}
                  />
                  <span className="text-slate-600">
                    {SEVERITY_DESCRIPTIONS[severity]}
                  </span>
                </div>
              </div>

              {/* Narrative Description */}
              <FormField
                id="incident-description"
                label="Case Narrative & Context (optional)"
                error={validationErrors.description}
                description="Describe the background, timeline of events, accounts involved, and specific impact."
              >
                <Textarea
                  id="incident-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide chronological details or summary of how the harassment began, channels used, and any specific threats received..."
                  rows={4}
                  maxLength={5000}
                  className={validationErrors.description ? 'border-red-300 focus:border-red-500' : ''}
                />
                <div className="flex justify-end text-[11px] text-slate-400">
                  {description.length}/5000
                </div>
              </FormField>

              {/* Occurred At Field */}
              <FormField
                id="incident-occurred-at"
                label="Incident Occurrence Date & Time (optional)"
                error={validationErrors.occurredAt}
                description="When the harassment or safety violation originally started or was observed."
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="incident-occurred-at"
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSetCurrentTime}
                    className="text-xs"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Now</span>
                  </Button>
                  {occurredAt && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOccurredAt('')}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </FormField>
            </CardContent>
          </Card>

          {/* Section 2: Associated Entities */}
          <Card className="border-slate-200">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Associated Target & Offender (Optional)</CardTitle>
                  <CardDescription>
                    Link your affected official identity account or an existing tracked suspicious profile.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Official Account Selector */}
                <FormField
                  id="incident-official-account"
                  label="Targeted Official Account"
                  description="Your verified brand or personal account targeted by this incident."
                >
                  <select
                    id="incident-official-account"
                    value={officialAccountId}
                    onChange={(e) => setOfficialAccountId(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none"
                  >
                    <option value="">None / Not account-specific</option>
                    {officialAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        @{acc.username} ({acc.platform})
                        {acc.isPrimary ? ' ★ Primary' : ''}
                      </option>
                    ))}
                  </select>
                </FormField>

                {/* Suspicious Profile Selector */}
                <FormField
                  id="incident-suspicious-profile"
                  label="Tracked Suspicious Profile"
                  description="Offender handle or lookalike account associated with this case."
                >
                  <select
                    id="incident-suspicious-profile"
                    value={suspiciousProfileId}
                    onChange={(e) => setSuspiciousProfileId(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none"
                  >
                    <option value="">None / Offender unknown or multiple</option>
                    {suspiciousProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        @{p.username} ({p.platform}) - {p.reviewStatus}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Need to link more items later?</span>
                <p className="mt-0.5">
                  You can attach evidence files, connect multiple abuse reports, and link additional suspicious profiles at any time from the incident details page.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button asChild variant="outline">
              <Link href="/incidents">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Opening Incident Case...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Initialize Incident Case</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
