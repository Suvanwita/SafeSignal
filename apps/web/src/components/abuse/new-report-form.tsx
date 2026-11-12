'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FolderPlus, Link2, ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
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
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/components/ui/toaster';
import {
  ABUSE_CATEGORY_OPTIONS,
  SEVERITY_OPTIONS,
  type AbuseCategory,
  type IncidentOption,
  type Severity,
} from '@/lib/abuse/types';
import { createAbuseReport } from '@/lib/abuse/client-abuse';
import { AuthApiError } from '@/lib/auth/client-api';
import type { AuthUser } from '@/lib/auth/types';
import { PLATFORM_OPTIONS, type Platform } from '@/lib/identity/types';
import { cn } from '@/lib/utils';

export interface NewReportFormProps {
  user: AuthUser;
  incidents: IncidentOption[];
}

type IncidentMode = 'none' | 'existing' | 'new';

interface FormErrors {
  title?: string;
  description?: string;
  category?: string;
  platform?: string;
  severity?: string;
  incidentDate?: string;
  incidentId?: string;
  newIncidentTitle?: string;
  targetUrl?: string;
  referenceNumber?: string;
  form?: string;
}

function toLocalDateTimeInputValue(date: Date): string {
  const offsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offsetMinutes * 60_000);
  return local.toISOString().slice(0, 16);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function NewReportForm({ user, incidents }: NewReportFormProps) {
  const router = useRouter();

  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<AbuseCategory>('HARASSMENT');
  const [platform, setPlatform] = React.useState<Platform>('X');
  const [severity, setSeverity] = React.useState<Severity>('MEDIUM');
  const [incidentDate, setIncidentDate] = React.useState(() =>
    toLocalDateTimeInputValue(new Date()),
  );
  const [description, setDescription] = React.useState('');
  const [targetUrl, setTargetUrl] = React.useState('');
  const [referenceNumber, setReferenceNumber] = React.useState('');

  const [incidentMode, setIncidentMode] = React.useState<IncidentMode>(
    incidents.length > 0 ? 'none' : 'none',
  );
  const [selectedIncidentId, setSelectedIncidentId] = React.useState<string>(
    incidents[0]?.id ?? '',
  );
  const [newIncidentTitle, setNewIncidentTitle] = React.useState('');

  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  const selectedCategoryMeta = React.useMemo(
    () =>
      ABUSE_CATEGORY_OPTIONS.find((item) => item.value === category) ??
      ABUSE_CATEGORY_OPTIONS[0],
    [category],
  );

  function validateClient(): FormErrors {
    const next: FormErrors = {};

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      next.title = 'Title must be at least 3 characters';
    } else if (trimmedTitle.length > 200) {
      next.title = 'Title must not exceed 200 characters';
    }

    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 10) {
      next.description = 'Description must be at least 10 characters';
    } else if (trimmedDesc.length > 5000) {
      next.description = 'Description must not exceed 5000 characters';
    }

    if (!incidentDate) {
      next.incidentDate = 'Incident date and time are required';
    } else {
      const parsed = new Date(incidentDate);
      if (Number.isNaN(parsed.getTime())) {
        next.incidentDate = 'Please provide a valid incident date';
      } else if (parsed.getTime() > Date.now() + 60 * 60 * 1000) {
        next.incidentDate = 'Incident date cannot be in the future';
      }
    }

    if (targetUrl.trim().length > 0 && !isValidHttpUrl(targetUrl.trim())) {
      next.targetUrl = 'Target URL must be a valid http:// or https:// URL';
    }

    if (incidentMode === 'existing' && !selectedIncidentId) {
      next.incidentId = 'Select an existing incident to associate';
    }

    if (incidentMode === 'new') {
      const trimmedIncidentTitle = newIncidentTitle.trim();
      if (trimmedIncidentTitle.length < 3) {
        next.newIncidentTitle =
          'New incident title must be at least 3 characters';
      } else if (trimmedIncidentTitle.length > 200) {
        next.newIncidentTitle =
          'New incident title must not exceed 200 characters';
      }
    }

    return next;
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
      const isoIncidentDate = new Date(incidentDate).toISOString();

      const created = await createAbuseReport({
        title: title.trim(),
        description: description.trim(),
        category,
        platform,
        severity,
        incidentDate: isoIncidentDate,
        ...(targetUrl.trim() ? { targetUrl: targetUrl.trim() } : {}),
        ...(referenceNumber.trim()
          ? { referenceNumber: referenceNumber.trim() }
          : {}),
        ...(incidentMode === 'existing' && selectedIncidentId
          ? { incidentId: selectedIncidentId }
          : {}),
        ...(incidentMode === 'new' && newIncidentTitle.trim()
          ? { newIncidentTitle: newIncidentTitle.trim() }
          : {}),
      });

      notify.verified(
        'Abuse report filed',
        `Saved "${created.title}"${created.incident ? ` and linked to "${created.incident.title}"` : ''}.`,
      );
      router.push(`/abuse/${created.id}`);
      router.refresh();
    } catch (error: unknown) {
      if (error instanceof AuthApiError) {
        const mapped: FormErrors = { form: error.message };
        if (error.details) {
          for (const detail of error.details) {
            const firstMessage = detail.messages[0];
            if (!firstMessage) continue;
            if (detail.field === 'title') mapped.title = firstMessage;
            if (detail.field === 'description') mapped.description = firstMessage;
            if (detail.field === 'category') mapped.category = firstMessage;
            if (detail.field === 'platform') mapped.platform = firstMessage;
            if (detail.field === 'severity') mapped.severity = firstMessage;
            if (detail.field === 'incidentDate') {
              mapped.incidentDate = firstMessage;
            }
            if (detail.field === 'incidentId') mapped.incidentId = firstMessage;
            if (detail.field === 'newIncidentTitle') {
              mapped.newIncidentTitle = firstMessage;
            }
            if (detail.field === 'targetUrl') mapped.targetUrl = firstMessage;
            if (detail.field === 'referenceNumber') {
              mapped.referenceNumber = firstMessage;
            }
          }
        }
        setErrors(mapped);
        notify.alert('Validation or submission error', error.message);
      } else {
        const fallback =
          'An unexpected error occurred while submitting the abuse report.';
        setErrors({ form: fallback });
        notify.alert('Submission failed', fallback);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Submit Abuse Report"
      subtitle="Document cyberbullying, harassment, threats, stalking, impersonation, or privacy violations"
      user={user}
      topBarActions={
        <Link
          href="/abuse"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Report History
        </Link>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>New Abuse Report</CardTitle>
                <CardDescription className="mt-1">
                  Record accurate timestamps and behavioral details. You can
                  associate this report with an existing incident or open a new
                  incident in the same step.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {errors.form && (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
                >
                  {errors.form}
                </div>
              )}

              <FormField
                id="abuse-title"
                label="Report Title"
                required
                description="Concise summary of what occurred (3–200 characters)"
                error={errors.title}
              >
                <Input
                  id="abuse-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Repeated threatening messages after blocking account"
                  disabled={submitting}
                  aria-invalid={Boolean(errors.title)}
                  maxLength={200}
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  id="abuse-category"
                  label="Abuse Category"
                  required
                  description={selectedCategoryMeta.description}
                  error={errors.category}
                >
                  <select
                    id="abuse-category"
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as AbuseCategory)
                    }
                    disabled={submitting}
                    className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
                  >
                    {ABUSE_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  id="abuse-platform"
                  label="Platform"
                  required
                  description="Service or channel where the abuse occurred"
                  error={errors.platform}
                >
                  <select
                    id="abuse-platform"
                    value={platform}
                    onChange={(event) =>
                      setPlatform(event.target.value as Platform)
                    }
                    disabled={submitting}
                    className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
                  >
                    {PLATFORM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  id="abuse-severity"
                  label="Severity"
                  required
                  error={errors.severity}
                >
                  <select
                    id="abuse-severity"
                    value={severity}
                    onChange={(event) =>
                      setSeverity(event.target.value as Severity)
                    }
                    disabled={submitting}
                    className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
                  >
                    {SEVERITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} — {option.description}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  id="abuse-incident-date"
                  label="Incident Date & Time"
                  required
                  description="When this incident took place (local time)"
                  error={errors.incidentDate}
                >
                  <Input
                    id="abuse-incident-date"
                    type="datetime-local"
                    value={incidentDate}
                    onChange={(event) => setIncidentDate(event.target.value)}
                    disabled={submitting}
                    aria-invalid={Boolean(errors.incidentDate)}
                  />
                </FormField>
              </div>

              <FormField
                id="abuse-description"
                label="Description"
                required
                description={`Detailed factual account of messages, actions, or context (${description.trim().length}/5000 chars)`}
                error={errors.description}
              >
                <Textarea
                  id="abuse-description"
                  rows={5}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the incident clearly: who contacted you, specific behavior observed, frequency, and impact..."
                  disabled={submitting}
                  aria-invalid={Boolean(errors.description)}
                  maxLength={5000}
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  id="abuse-target-url"
                  label="Direct Post / Profile URL (Optional)"
                  description="http:// or https:// link to relevant post or profile"
                  error={errors.targetUrl}
                >
                  <Input
                    id="abuse-target-url"
                    type="url"
                    value={targetUrl}
                    onChange={(event) => setTargetUrl(event.target.value)}
                    placeholder="https://x.com/..."
                    disabled={submitting}
                    aria-invalid={Boolean(errors.targetUrl)}
                    maxLength={500}
                  />
                </FormField>

                <FormField
                  id="abuse-reference-number"
                  label="Platform Ticket / Reference # (Optional)"
                  description="External moderation or support case ID if filed"
                  error={errors.referenceNumber}
                >
                  <Input
                    id="abuse-reference-number"
                    value={referenceNumber}
                    onChange={(event) => setReferenceNumber(event.target.value)}
                    placeholder="e.g. TICKET-88421"
                    disabled={submitting}
                    maxLength={100}
                  />
                </FormField>
              </div>

              {/* Incident Association */}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Incident Association (Optional)
                  </p>
                  <p className="text-xs text-slate-500">
                    Group multiple related abuse reports under a single case
                    incident or keep this report standalone.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setIncidentMode('none')}
                    className={cn(
                      'rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer',
                      incidentMode === 'none'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    Standalone Report
                  </button>

                  <button
                    type="button"
                    disabled={submitting || incidents.length === 0}
                    onClick={() => setIncidentMode('existing')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
                      incidentMode === 'existing'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Existing Incident ({incidents.length})
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setIncidentMode('new')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer',
                      incidentMode === 'new'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                    <span>Create New Incident</span>
                  </button>
                </div>

                {incidentMode === 'existing' && (
                  <FormField
                    id="existing-incident-select"
                    label="Select Existing Incident"
                    required
                    error={errors.incidentId}
                  >
                    <select
                      id="existing-incident-select"
                      value={selectedIncidentId}
                      onChange={(event) =>
                        setSelectedIncidentId(event.target.value)
                      }
                      disabled={submitting}
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs focus-visible:outline-none"
                    >
                      {incidents.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} ({item.status} · {item.reportCount} report
                          {item.reportCount === 1 ? '' : 's'})
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}

                {incidentMode === 'new' && (
                  <FormField
                    id="new-incident-title"
                    label="New Incident Title"
                    required
                    description="Creates a new incident record and attaches this report atomically"
                    error={errors.newIncidentTitle}
                  >
                    <Input
                      id="new-incident-title"
                      value={newIncidentTitle}
                      onChange={(event) =>
                        setNewIncidentTitle(event.target.value)
                      }
                      placeholder="e.g. Q4 Coordinated Harassment Case"
                      disabled={submitting}
                      aria-invalid={Boolean(errors.newIncidentTitle)}
                      maxLength={200}
                    />
                  </FormField>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <Link
                  href="/abuse"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Cancel
                </Link>
                <Button type="submit" loading={submitting}>
                  Submit Abuse Report
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
