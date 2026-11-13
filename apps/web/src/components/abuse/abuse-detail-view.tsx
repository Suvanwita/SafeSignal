'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Link2,
  Save,
  Trash2,
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
import { ConfirmDialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/components/ui/toaster';
import {
  deleteAbuseReport,
  updateAbuseReport,
} from '@/lib/abuse/client-abuse';
import {
  ABUSE_CATEGORY_LABEL_MAP,
  ABUSE_CATEGORY_OPTIONS,
  ABUSE_REPORT_STATUS_MAP,
  ABUSE_REPORT_STATUS_OPTIONS,
  SEVERITY_MAP,
  SEVERITY_OPTIONS,
  type AbuseCategory,
  type AbuseReport,
  type AbuseReportStatus,
  type IncidentOption,
  type Severity,
} from '@/lib/abuse/types';
import { AuthApiError } from '@/lib/auth/client-api';
import type { AuthUser } from '@/lib/auth/types';
import {
  PLATFORM_LABEL_MAP,
  PLATFORM_OPTIONS,
  type Platform,
} from '@/lib/identity/types';
import { SafetyAnalysisCard } from '@/components/intelligence/safety-analysis-card';
import {
  analyzeAbuseReportSafety,
  fetchSafetyAnalyses,
} from '@/lib/intelligence/client-intelligence';
import type { SafetyAnalysisResult } from '@/lib/intelligence/types';
import { cn } from '@/lib/utils';

export interface AbuseDetailViewProps {
  user: AuthUser;
  initialReport: AbuseReport;
  incidents: IncidentOption[];
}

type IncidentEditMode = 'none' | 'existing' | 'new';

interface FormErrors {
  title?: string;
  description?: string;
  incidentDate?: string;
  incidentId?: string;
  newIncidentTitle?: string;
  targetUrl?: string;
  form?: string;
}

function toLocalDateTimeValue(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function AbuseDetailView({
  user,
  initialReport,
  incidents: initialIncidents,
}: AbuseDetailViewProps) {
  const router = useRouter();
  const [report, setReport] = React.useState<AbuseReport>(initialReport);
  const [incidents, setIncidents] =
    React.useState<IncidentOption[]>(initialIncidents);

  const [title, setTitle] = React.useState(initialReport.title);
  const [category, setCategory] = React.useState<AbuseCategory>(
    initialReport.category,
  );
  const [platform, setPlatform] = React.useState<Platform>(
    initialReport.platform,
  );
  const [severity, setSeverity] = React.useState<Severity>(
    initialReport.severity,
  );
  const [incidentDate, setIncidentDate] = React.useState(() =>
    toLocalDateTimeValue(initialReport.incidentDate),
  );
  const [description, setDescription] = React.useState(
    initialReport.description,
  );
  const [targetUrl, setTargetUrl] = React.useState(
    initialReport.targetUrl ?? '',
  );
  const [referenceNumber, setReferenceNumber] = React.useState(
    initialReport.referenceNumber ?? '',
  );
  const [reportStatus, setReportStatus] = React.useState<AbuseReportStatus>(
    (initialReport.reportStatus as AbuseReportStatus) || 'PENDING',
  );

  const [incidentMode, setIncidentMode] = React.useState<IncidentEditMode>(() =>
    initialReport.incidentId ? 'existing' : 'none',
  );
  const [selectedIncidentId, setSelectedIncidentId] = React.useState<string>(
    initialReport.incidentId ?? initialIncidents[0]?.id ?? '',
  );
  const [newIncidentTitle, setNewIncidentTitle] = React.useState('');

  const [errors, setErrors] = React.useState<FormErrors>({});
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Safety Intelligence state
  const [safetyAnalyses, setSafetyAnalyses] = React.useState<
    SafetyAnalysisResult[]
  >([]);
  const [currentSafetyAnalysis, setCurrentSafetyAnalysis] =
    React.useState<SafetyAnalysisResult | null>(null);
  const [isAnalyzingSafety, setIsAnalyzingSafety] = React.useState(false);

  const loadSafetyAnalyses = React.useCallback(async () => {
    try {
      const list = await fetchSafetyAnalyses({ abuseReportId: report.id });
      setSafetyAnalyses(list);
      if (list.length > 0) {
        setCurrentSafetyAnalysis(list[0]);
      }
    } catch {
      // non-fatal
    }
  }, [report.id]);

  React.useEffect(() => {
    loadSafetyAnalyses();
  }, [loadSafetyAnalyses]);

  async function handleRunSafetyAnalysis() {
    setIsAnalyzingSafety(true);
    try {
      const res = await analyzeAbuseReportSafety(report.id);
      setCurrentSafetyAnalysis(res);
      setSafetyAnalyses((prev) => {
        const withoutCurrent = prev.filter((a) => a.id !== res.id);
        return [res, ...withoutCurrent];
      });
      notify.verified(
        'Safety analysis complete',
        `${res.riskLevel} Risk determined (${res.category}).`,
      );
    } catch (err: unknown) {
      const msg =
        err instanceof AuthApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unable to complete report safety analysis.';
      notify.alert('Analysis failed', msg);
    } finally {
      setIsAnalyzingSafety(false);
    }
  }

  function validateClient(): FormErrors {
    const next: FormErrors = {};
    if (title.trim().length < 3) {
      next.title = 'Title must be at least 3 characters';
    }
    if (description.trim().length < 10) {
      next.description = 'Description must be at least 10 characters';
    }
    const parsedDate = new Date(incidentDate);
    if (!incidentDate || Number.isNaN(parsedDate.getTime())) {
      next.incidentDate = 'Please provide a valid incident date';
    } else if (parsedDate.getTime() > Date.now() + 60 * 60 * 1000) {
      next.incidentDate = 'Incident date cannot be in the future';
    }
    if (targetUrl.trim().length > 0 && !isValidHttpUrl(targetUrl.trim())) {
      next.targetUrl = 'Target URL must be a valid http:// or https:// URL';
    }
    if (incidentMode === 'existing' && !selectedIncidentId) {
      next.incidentId = 'Select an incident or choose Standalone';
    }
    if (incidentMode === 'new' && newIncidentTitle.trim().length < 3) {
      next.newIncidentTitle =
        'New incident title must be at least 3 characters';
    }
    return next;
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      const updated = await updateAbuseReport(report.id, {
        title: title.trim(),
        description: description.trim(),
        category,
        platform,
        severity,
        incidentDate: new Date(incidentDate).toISOString(),
        reportStatus,
        targetUrl: targetUrl.trim().length > 0 ? targetUrl.trim() : null,
        referenceNumber:
          referenceNumber.trim().length > 0 ? referenceNumber.trim() : null,
        ...(incidentMode === 'none'
          ? { incidentId: null }
          : incidentMode === 'existing'
            ? { incidentId: selectedIncidentId }
            : { newIncidentTitle: newIncidentTitle.trim() }),
      });

      setReport(updated);

      if (
        incidentMode === 'new' &&
        updated.incident &&
        !incidents.some((i) => i.id === updated.incident?.id)
      ) {
        setIncidents((prev) => [
          {
            id: updated.incident!.id,
            userId: updated.userId,
            title: updated.incident!.title,
            description: null,
            status: updated.incident!.status,
            severity: updated.severity,
            category: updated.category,
            occurredAt: updated.incidentDate,
            reportCount: 1,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          },
          ...prev,
        ]);
        setSelectedIncidentId(updated.incident.id);
        setIncidentMode('existing');
        setNewIncidentTitle('');
      }

      notify.verified('Report updated', 'Abuse report changes saved.');
      router.refresh();
    } catch (error: unknown) {
      if (error instanceof AuthApiError) {
        setErrors({ form: error.message });
        notify.alert('Update failed', error.message);
      } else {
        setErrors({
          form: 'An unexpected error occurred while saving changes.',
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await deleteAbuseReport(report.id);
      notify.info('Abuse report deleted', `"${report.title}" removed.`);
      router.push('/abuse');
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof AuthApiError
          ? error.message
          : 'Unable to delete abuse report.';
      notify.alert('Delete failed', message);
      setDeleting(false);
    }
  }

  const severityMeta = SEVERITY_MAP[report.severity];
  const statusMeta =
    ABUSE_REPORT_STATUS_MAP[report.reportStatus as AbuseReportStatus] ??
    ABUSE_REPORT_STATUS_MAP.PENDING;

  return (
    <AppShell
      title={report.title}
      subtitle={`${ABUSE_CATEGORY_LABEL_MAP[report.category] ?? report.category} · ${PLATFORM_LABEL_MAP[report.platform] ?? report.platform}`}
      user={user}
      topBarActions={
        <div className="flex items-center gap-2">
          <Link
            href="/abuse"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Reports
          </Link>
          <Button
            type="button"
            variant="alertOutline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Metadata & Timestamps */}
        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Report Summary</CardTitle>
              <CardDescription>Current classification & status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="flex flex-wrap gap-2">
                <Badge variant="dark">
                  {PLATFORM_LABEL_MAP[report.platform] ?? report.platform}
                </Badge>
                <Badge variant="neutral">
                  {ABUSE_CATEGORY_LABEL_MAP[report.category] ?? report.category}
                </Badge>
                <StatusBadge
                  status={severityMeta.statusBadge}
                  label={severityMeta.label}
                />
                <Badge variant={statusMeta.badgeVariant}>
                  {statusMeta.label}
                </Badge>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Incident Date</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {formatDateTime(report.incidentDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Submitted</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {formatDateTime(report.submittedAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Created</span>
                  <span className="text-slate-700 tabular-nums">
                    {formatDateTime(report.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Last Updated</span>
                  <span className="text-slate-700 tabular-nums">
                    {formatDateTime(report.updatedAt)}
                  </span>
                </div>
              </div>

              {report.targetUrl && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-1 text-slate-500">Target URL</p>
                  <a
                    href={report.targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100"
                    title={report.targetUrl}
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{report.targetUrl}</span>
                  </a>
                </div>
              )}

              {report.referenceNumber && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-slate-500">Platform Reference #</p>
                  <p className="mt-0.5 font-mono text-slate-800">
                    {report.referenceNumber}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-slate-500" />
                Related Incident
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs">
              {report.incident ? (
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">
                    {report.incident.title}
                  </p>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Incident Status</span>
                    <Badge variant="info">{report.incident.status}</Badge>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">
                  This report is currently standalone and not linked to an
                  incident. Use the edit form to link or create an incident.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Safety Intelligence & Edit Form */}
        <div className="space-y-6 lg:col-span-8">
          <SafetyAnalysisCard
            title="Report Safety Intelligence & Threat Assessment"
            description="Evaluates report description, platform context, and recurring threat patterns across incident cases."
            analyses={safetyAnalyses}
            currentAnalysis={currentSafetyAnalysis}
            onSelectAnalysis={setCurrentSafetyAnalysis}
            isAnalyzing={isAnalyzingSafety}
            onRunAnalysis={handleRunSafetyAnalysis}
            buttonText="Evaluate Report Safety"
            targetType="report"
          />

          <Card>
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-base">
                Report Details & Incident Link
              </CardTitle>
              <CardDescription>
                Review or update details, incident association, severity, and
                report triage status.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleSave} className="space-y-5" noValidate>
                {errors.form && (
                  <div
                    role="alert"
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
                  >
                    {errors.form}
                  </div>
                )}

                <FormField
                  id="edit-title"
                  label="Report Title"
                  required
                  error={errors.title}
                >
                  <Input
                    id="edit-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    disabled={saving}
                    maxLength={200}
                  />
                </FormField>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField id="edit-category" label="Abuse Category" required>
                    <select
                      id="edit-category"
                      value={category}
                      onChange={(event) =>
                        setCategory(event.target.value as AbuseCategory)
                      }
                      disabled={saving}
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs"
                    >
                      {ABUSE_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField id="edit-platform" label="Platform" required>
                    <select
                      id="edit-platform"
                      value={platform}
                      onChange={(event) =>
                        setPlatform(event.target.value as Platform)
                      }
                      disabled={saving}
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs"
                    >
                      {PLATFORM_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField id="edit-severity" label="Severity" required>
                    <select
                      id="edit-severity"
                      value={severity}
                      onChange={(event) =>
                        setSeverity(event.target.value as Severity)
                      }
                      disabled={saving}
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs"
                    >
                      {SEVERITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField id="edit-status" label="Report Status" required>
                    <select
                      id="edit-status"
                      value={reportStatus}
                      onChange={(event) =>
                        setReportStatus(
                          event.target.value as AbuseReportStatus,
                        )
                      }
                      disabled={saving}
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs"
                    >
                      {ABUSE_REPORT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField
                    id="edit-incident-date"
                    label="Incident Date"
                    required
                    error={errors.incidentDate}
                  >
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="edit-incident-date"
                        type="datetime-local"
                        value={incidentDate}
                        onChange={(event) =>
                          setIncidentDate(event.target.value)
                        }
                        disabled={saving}
                        className="pl-8"
                      />
                    </div>
                  </FormField>
                </div>

                <FormField
                  id="edit-description"
                  label="Description"
                  required
                  error={errors.description}
                >
                  <Textarea
                    id="edit-description"
                    rows={5}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={saving}
                    maxLength={5000}
                  />
                </FormField>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    id="edit-target-url"
                    label="Target URL"
                    error={errors.targetUrl}
                  >
                    <Input
                      id="edit-target-url"
                      type="url"
                      value={targetUrl}
                      onChange={(event) => setTargetUrl(event.target.value)}
                      placeholder="https://..."
                      disabled={saving}
                      maxLength={500}
                    />
                  </FormField>

                  <FormField
                    id="edit-reference-number"
                    label="Platform Reference #"
                  >
                    <Input
                      id="edit-reference-number"
                      value={referenceNumber}
                      onChange={(event) =>
                        setReferenceNumber(event.target.value)
                      }
                      disabled={saving}
                      maxLength={100}
                    />
                  </FormField>
                </div>

                {/* Incident Re-association */}
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-semibold text-slate-900">
                    Associated Incident
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setIncidentMode('none')}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium cursor-pointer',
                        incidentMode === 'none'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700',
                      )}
                    >
                      Standalone
                    </button>
                    <button
                      type="button"
                      disabled={saving || incidents.length === 0}
                      onClick={() => setIncidentMode('existing')}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50',
                        incidentMode === 'existing'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700',
                      )}
                    >
                      Existing Incident ({incidents.length})
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setIncidentMode('new')}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium cursor-pointer',
                        incidentMode === 'new'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700',
                      )}
                    >
                      Create New Incident
                    </button>
                  </div>

                  {incidentMode === 'existing' && (
                    <FormField
                      id="edit-existing-incident"
                      label="Existing Incident"
                      error={errors.incidentId}
                    >
                      <select
                        id="edit-existing-incident"
                        value={selectedIncidentId}
                        onChange={(event) =>
                          setSelectedIncidentId(event.target.value)
                        }
                        disabled={saving}
                        className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs"
                      >
                        {incidents.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} ({item.status})
                          </option>
                        ))}
                      </select>
                    </FormField>
                  )}

                  {incidentMode === 'new' && (
                    <FormField
                      id="edit-new-incident-title"
                      label="New Incident Title"
                      error={errors.newIncidentTitle}
                    >
                      <Input
                        id="edit-new-incident-title"
                        value={newIncidentTitle}
                        onChange={(event) =>
                          setNewIncidentTitle(event.target.value)
                        }
                        placeholder="Title for new incident record..."
                        disabled={saving}
                        maxLength={200}
                      />
                    </FormField>
                  )}
                </div>

                <div className="flex justify-end border-t border-slate-100 pt-4">
                  <Button type="submit" loading={saving}>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteOpen(false);
        }}
        title="Delete abuse report?"
        description={`This permanently removes "${report.title}" from your workspace. Any linked incident itself will remain intact.`}
        confirmLabel="Delete Report"
        variant="destructive"
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </AppShell>
  );
}
