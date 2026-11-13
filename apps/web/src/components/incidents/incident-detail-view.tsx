'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderLock,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Unlink,
  UserX,
} from 'lucide-react';
import { UploadEvidenceDialog } from '@/components/evidence/upload-evidence-dialog';
import { VerifyEvidenceDialog } from '@/components/evidence/verify-evidence-dialog';
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
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/components/ui/toaster';
import {
  ABUSE_CATEGORY_LABEL_MAP,
  ABUSE_REPORT_STATUS_MAP,
  SEVERITY_MAP,
  SEVERITY_OPTIONS,
  type AbuseReport,
} from '@/lib/abuse/types';
import type { AuthUser } from '@/lib/auth/types';
import {
  closeIncident,
  fetchIncidentById,
  linkProfilesToIncident,
  linkReportsToIncident,
  reopenIncident,
  unlinkProfileFromIncident,
  unlinkReportFromIncident,
  updateIncidentStatus,
} from '@/lib/incidents/client-incidents';
import {
  INCIDENT_STATUS_MAP,
  INCIDENT_STATUS_OPTIONS,
  type IncidentDetail,
  type IncidentStatus,
} from '@/lib/incidents/types';
import { verifyEvidence } from '@/lib/evidence/client-evidence';
import {
  formatBytes,
  getFileFormatCategory,
  type VerifyEvidenceResult,
} from '@/lib/evidence/types';
import type { SuspiciousProfile } from '@/lib/intelligence/types';

export interface IncidentDetailViewProps {
  user: AuthUser;
  initialIncident: IncidentDetail;
  availableReports?: AbuseReport[];
  availableProfiles?: SuspiciousProfile[];
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

export function IncidentDetailView({
  user,
  initialIncident,
  availableReports = [],
  availableProfiles = [],
}: IncidentDetailViewProps) {
  const router = useRouter();
  const [incident, setIncident] = React.useState<IncidentDetail>(initialIncident);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Status / Severity update dialog
  const [statusDialogOpen, setStatusDialogOpen] = React.useState(false);
  const [newStatus, setNewStatus] = React.useState<IncidentStatus>(incident.status);
  const [newSeverity, setNewSeverity] = React.useState<string>(incident.severity);
  const [statusReason, setStatusReason] = React.useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);

  // Close / Reopen dialogs
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);
  const [closeReason, setCloseReason] = React.useState('');
  const [isClosing, setIsClosing] = React.useState(false);

  const [reopenDialogOpen, setReopenDialogOpen] = React.useState(false);
  const [reopenReason, setReopenReason] = React.useState('');
  const [isReopening, setIsReopening] = React.useState(false);

  // Unlink Profile state
  const [unlinkingProfileId, setUnlinkingProfileId] = React.useState<string | null>(null);
  const [isUnlinkingProfile, setIsUnlinkingProfile] = React.useState(false);

  // Unlink Report state
  const [unlinkingReportId, setUnlinkingReportId] = React.useState<string | null>(null);
  const [isUnlinkingReport, setIsUnlinkingReport] = React.useState(false);

  // Link Profile Dialog
  const [linkProfileDialogOpen, setLinkProfileDialogOpen] = React.useState(false);
  const [selectedProfileId, setSelectedProfileId] = React.useState('');
  const [linkProfileNotes, setLinkProfileNotes] = React.useState('');
  const [isLinkingProfile, setIsLinkingProfile] = React.useState(false);

  // Link Report Dialog
  const [linkReportDialogOpen, setLinkReportDialogOpen] = React.useState(false);
  const [selectedReportId, setSelectedReportId] = React.useState('');
  const [isLinkingReport, setIsLinkingReport] = React.useState(false);

  // Evidence Vault Dialog & State
  const [uploadEvidenceDialogOpen, setUploadEvidenceDialogOpen] = React.useState(false);
  const [copiedShaId, setCopiedShaId] = React.useState<string | null>(null);

  // Evidence Verification Dialog & State
  const [verifyingEvidenceId, setVerifyingEvidenceId] = React.useState<string | null>(null);
  const [verificationResult, setVerificationResult] = React.useState<{
    result: VerifyEvidenceResult;
    evidence: { id: string; title: string; fileName: string | null };
  } | null>(null);

  const handleVerifyEvidence = async (ev: {
    id: string;
    title: string;
    fileName: string | null;
  }) => {
    setVerifyingEvidenceId(ev.id);
    try {
      const res = await verifyEvidence(ev.id);
      setVerificationResult({ result: res, evidence: ev });
      if (res.status === 'VERIFIED') {
        notify.verified(
          'Cryptographic integrity verified',
          'Recalculated SHA-256 matches the original upload hash.',
        );
      } else {
        notify.alert(
          'Integrity mismatch detected',
          'Recalculated SHA-256 does NOT match the upload record!',
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Integrity verification failed.';
      notify.alert('Verification error', msg);
    } finally {
      setVerifyingEvidenceId(null);
    }
  };

  const handleCopySha = (id: string, sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedShaId(id);
    notify.verified('Hash copied', 'SHA-256 checksum copied to clipboard.');
    setTimeout(() => setCopiedShaId((c) => (c === id ? null : c)), 2500);
  };

  const handleDownloadEvidence = (ev: { id: string; fileName: string | null }) => {
    const downloadUrl = `/api/evidence/${encodeURIComponent(ev.id)}/download`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = ev.fileName || 'evidence-file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const refreshIncident = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const refreshed = await fetchIncidentById(incident.id);
      setIncident(refreshed);
      setNewStatus(refreshed.status);
      setNewSeverity(refreshed.severity);
    } catch {
      notify.alert('Refresh failed', 'Could not refresh incident details.');
    } finally {
      setIsRefreshing(false);
    }
  }, [incident.id]);

  // Handle Status Update
  async function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault();
    setIsUpdatingStatus(true);
    try {
      const updated = await updateIncidentStatus(incident.id, {
        status: newStatus !== incident.status ? newStatus : undefined,
        severity: newSeverity !== incident.severity ? newSeverity : undefined,
        reason: statusReason.trim() || undefined,
      });
      setIncident(updated);
      setStatusDialogOpen(false);
      setStatusReason('');
      notify.verified('Status updated', 'Incident status and audit trail recorded.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to update status.';
      notify.alert('Update failed', msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  // Handle Close
  async function handleCloseIncident() {
    setIsClosing(true);
    try {
      const updated = await closeIncident(incident.id, {
        reason: closeReason.trim() || undefined,
      });
      setIncident(updated);
      setCloseDialogOpen(false);
      setCloseReason('');
      notify.verified('Incident closed', 'Incident marked as closed and archived.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to close incident.';
      notify.alert('Close failed', msg);
    } finally {
      setIsClosing(false);
    }
  }

  // Handle Reopen
  async function handleReopenIncident() {
    setIsReopening(true);
    try {
      const updated = await reopenIncident(incident.id, {
        reason: reopenReason.trim() || undefined,
      });
      setIncident(updated);
      setReopenDialogOpen(false);
      setReopenReason('');
      notify.verified('Incident reopened', 'Incident marked active and reopened.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to reopen incident.';
      notify.alert('Reopen failed', msg);
    } finally {
      setIsReopening(false);
    }
  }

  // Handle Unlink Profile
  async function handleUnlinkProfile() {
    if (!unlinkingProfileId) return;
    setIsUnlinkingProfile(true);
    try {
      const updated = await unlinkProfileFromIncident(incident.id, unlinkingProfileId);
      setIncident(updated);
      setUnlinkingProfileId(null);
      notify.verified(
        'Profile association removed',
        'Suspicious profile unlinked from incident without deleting its record.',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to unlink profile.';
      notify.alert('Unlink failed', msg);
    } finally {
      setIsUnlinkingProfile(false);
    }
  }

  // Handle Unlink Report
  async function handleUnlinkReport() {
    if (!unlinkingReportId) return;
    setIsUnlinkingReport(true);
    try {
      const updated = await unlinkReportFromIncident(incident.id, unlinkingReportId);
      setIncident(updated);
      setUnlinkingReportId(null);
      notify.verified(
        'Report association removed',
        'Abuse report unlinked from incident without deleting the report.',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to unlink report.';
      notify.alert('Unlink failed', msg);
    } finally {
      setIsUnlinkingReport(false);
    }
  }

  // Handle Link Profile
  async function handleLinkProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProfileId) return;
    setIsLinkingProfile(true);
    try {
      const updated = await linkProfilesToIncident(
        incident.id,
        [selectedProfileId],
        linkProfileNotes.trim() || undefined,
      );
      setIncident(updated);
      setLinkProfileDialogOpen(false);
      setSelectedProfileId('');
      setLinkProfileNotes('');
      notify.verified('Profile linked', 'Suspicious profile associated with incident.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to link profile.';
      notify.alert('Link failed', msg);
    } finally {
      setIsLinkingProfile(false);
    }
  }

  // Handle Link Report
  async function handleLinkReport(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReportId) return;
    setIsLinkingReport(true);
    try {
      const updated = await linkReportsToIncident(incident.id, [selectedReportId]);
      setIncident(updated);
      setLinkReportDialogOpen(false);
      setSelectedReportId('');
      notify.verified('Report linked', 'Abuse report associated with incident.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to link report.';
      notify.alert('Link failed', msg);
    } finally {
      setIsLinkingReport(false);
    }
  }

  // Unlinked candidate profiles for linking modal
  const existingProfileIds = new Set(incident.suspiciousProfiles.map((p) => p.id));
  const linkableProfiles = availableProfiles.filter((p) => !existingProfileIds.has(p.id));

  // Unlinked candidate reports for linking modal
  const existingReportIds = new Set(incident.abuseReports.map((r) => r.id));
  const linkableReports = availableReports.filter((r) => !existingReportIds.has(r.id));

  const statusMeta = INCIDENT_STATUS_MAP[incident.status] ?? INCIDENT_STATUS_MAP.OPEN;
  const severityMeta = SEVERITY_MAP[incident.severity] ?? SEVERITY_MAP.MEDIUM;
  const categoryLabel = ABUSE_CATEGORY_LABEL_MAP[incident.category] ?? incident.category;

  return (
    <AppShell
      title={incident.title}
      subtitle={`Incident Case #${incident.id.slice(0, 8)} • ${categoryLabel}`}
      user={user}
      topBarActions={
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/incidents">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">All Incidents</span>
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={refreshIncident}
            disabled={isRefreshing}
            aria-label="Refresh incident details"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusDialogOpen(true)}
          >
            Change Status
          </Button>

          {incident.status !== 'CLOSED' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCloseDialogOpen(true)}
              className="text-slate-700 hover:text-red-700"
            >
              Close Incident
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => setReopenDialogOpen(true)}
            >
              Reopen Incident
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Incident Summary Card */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={statusMeta.statusBadge}
                  label={statusMeta.label}
                />
                <StatusBadge
                  status={severityMeta.statusBadge}
                  label={`${severityMeta.label} Severity`}
                />
                <Badge variant="neutral">{categoryLabel}</Badge>
              </div>

              <div className="text-xs text-slate-500">
                Created: {formatDateTime(incident.createdAt)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {incident.description && (
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {incident.description}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4">
              <div>
                <span className="text-slate-400">Occurred Date:</span>
                <p className="font-medium text-slate-700">
                  {formatDateTime(incident.occurredAt)}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Resolved Date:</span>
                <p className="font-medium text-slate-700">
                  {formatDateTime(incident.resolvedAt)}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Linked Reports:</span>
                <p className="font-medium text-slate-700">
                  {incident.abuseReports.length}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Linked Profiles:</span>
                <p className="font-medium text-slate-700">
                  {incident.suspiciousProfiles.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 1: RELATED SUSPICIOUS PROFILES */}
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Related Suspicious Profiles</CardTitle>
              <CardDescription>
                Tracked handles and lookalike profiles linked to this safety case.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinkProfileDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span>Associate Profile</span>
            </Button>
          </CardHeader>
          <CardContent>
            {incident.suspiciousProfiles.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No suspicious profiles are currently associated with this incident.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Handle & Platform</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Review Status</TableHead>
                    <TableHead>Profile Link</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incident.suspiciousProfiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-slate-900">@{p.handle}</span>
                          <span className="text-xs text-slate-400">({p.platform})</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {p.displayName ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{p.reviewStatus}</Badge>
                      </TableCell>
                      <TableCell>
                        {p.profileUrl ? (
                          <a
                            href={p.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <span>Visit profile</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUnlinkingProfileId(p.id)}
                          className="text-slate-600 hover:text-red-700"
                          title="Unlink profile from incident"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                          <span>Unlink</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* SECTION 2: RELATED ABUSE REPORTS */}
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Related Abuse Reports</CardTitle>
              <CardDescription>
                Formal abuse submissions grouped under this incident.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/abuse/new">
                  <Plus className="h-4 w-4" />
                  <span>New Report</span>
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLinkReportDialogOpen(true)}
              >
                <Link2 className="h-4 w-4" />
                <span>Link Existing</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {incident.abuseReports.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No abuse reports are currently associated with this incident.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Incident Date</TableHead>
                    <TableHead>Report Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incident.abuseReports.map((r) => {
                    const rSeverity = SEVERITY_MAP[r.severity] ?? SEVERITY_MAP.MEDIUM;
                    const rCat = ABUSE_CATEGORY_LABEL_MAP[r.category] ?? r.category;
                    const rStatus =
                      ABUSE_REPORT_STATUS_MAP[r.reportStatus as keyof typeof ABUSE_REPORT_STATUS_MAP] ?? {
                        label: r.reportStatus,
                        badgeVariant: 'neutral' as const,
                      };

                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link
                            href={`/abuse/${r.id}`}
                            className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                          >
                            {r.title}
                          </Link>
                          {r.referenceNumber && (
                            <div className="font-mono text-xs text-slate-400">
                              Ref: {r.referenceNumber}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">{rCat}</TableCell>
                        <TableCell className="text-xs text-slate-700">{r.platform}</TableCell>
                        <TableCell>
                          <StatusBadge
                            status={rSeverity.statusBadge}
                            label={rSeverity.label}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {formatDateTime(r.incidentDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={rStatus.badgeVariant}>
                            {rStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUnlinkingReportId(r.id)}
                            className="text-slate-600 hover:text-red-700"
                            title="Unlink report from incident"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                            <span>Unlink</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* SECTION 3: EVIDENCE RECORDS */}
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Evidence Vault Records</CardTitle>
                <Badge variant="neutral" className="text-[11px] font-semibold text-slate-600">
                  {incident.evidence.length}
                </Badge>
              </div>
              <CardDescription>
                Cryptographically hashed snapshots, captures, and source logs stored in the private Evidence Vault.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUploadEvidenceDialogOpen(true)}
              className="gap-1.5 text-xs font-semibold text-slate-700"
            >
              <Plus className="h-3.5 w-3.5 text-slate-500" />
              Upload Evidence
            </Button>
          </CardHeader>
          <CardContent>
            {incident.evidence.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
                <FolderLock className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No evidence attached to this incident</p>
                <p className="mt-1 text-xs text-slate-500">
                  Upload screenshots, PDF exports, or harassment records to securely preserve case evidence.
                </p>
                <Button
                  size="sm"
                  onClick={() => setUploadEvidenceDialogOpen(true)}
                  className="mt-4 gap-1.5 bg-blue-600 text-white hover:bg-blue-700 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Upload First Evidence File
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Filename & Size</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>SHA-256 Checksum</TableHead>
                    <TableHead>Captured</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incident.evidence.map((ev) => {
                    const format = getFileFormatCategory(ev.fileName, ev.mimeType);
                    return (
                      <TableRow key={ev.id}>
                        <TableCell className="font-medium text-slate-900">
                          <Link
                            href={`/evidence/${ev.id}`}
                            className="font-medium text-slate-900 hover:text-blue-600 hover:underline block"
                          >
                            {ev.title}
                          </Link>
                          {ev.description && (
                            <p className="line-clamp-1 text-xs text-slate-500">
                              {ev.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">
                          <span className="font-mono">{ev.fileName ?? '—'}</span>
                          {ev.fileSize ? (
                            <span className="ml-1 text-[11px] text-slate-400">
                              ({formatBytes(ev.fileSize)})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="neutral"
                            className={`text-[10px] font-bold ${
                              format === 'PNG'
                                ? 'border-blue-200 bg-blue-50 text-blue-700'
                                : format === 'JPG'
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  : format === 'PDF'
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : format === 'DOCX'
                                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {format}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">
                          {ev.sha256 ? (
                            <div className="flex items-center gap-1.5">
                              <span>
                                {ev.sha256.slice(0, 10)}...{ev.sha256.slice(-6)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopySha(ev.id, ev.sha256!)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Copy full SHA-256 hash"
                              >
                                {copiedShaId === ev.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {formatDateTime(ev.capturedAt ?? ev.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/evidence/${ev.id}`}
                              className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              title="View metadata and evidence details"
                            >
                              Details
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVerifyEvidence(ev)}
                              disabled={verifyingEvidenceId === ev.id}
                              className="h-7 gap-1 px-2 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50 border-blue-200"
                              title="Cryptographically verify SHA-256 integrity"
                            >
                              {verifyingEvidenceId === ev.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-3 w-3 text-blue-600" />
                              )}
                              Verify
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadEvidence(ev)}
                              className="h-7 gap-1 px-2 text-xs text-slate-700"
                              title="Download authenticated evidence"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* SECTION 4: CHRONOLOGICAL TIMELINE */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-400" />
              <div>
                <CardTitle className="text-base">Audit Trail & Timeline</CardTitle>
                <CardDescription>
                  Chronological history of case creation, status changes, linked reports, and evidence.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {incident.timelineEvents.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                No timeline events recorded.
              </div>
            ) : (
              <div className="relative pl-6 before:absolute before:bottom-0 before:left-2.5 before:top-2 before:w-0.5 before:bg-slate-200">
                <div className="space-y-6">
                  {incident.timelineEvents.map((evt) => (
                    <div key={evt.id} className="relative">
                      {/* Timeline Dot */}
                      <span className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-4 ring-slate-100">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            evt.eventType === 'INCIDENT_CREATED'
                              ? 'bg-blue-600'
                              : evt.eventType === 'INCIDENT_ESCALATED'
                                ? 'bg-red-600'
                                : evt.eventType === 'INCIDENT_CLOSED'
                                  ? 'bg-slate-600'
                                  : evt.eventType === 'INCIDENT_RESOLVED'
                                    ? 'bg-emerald-600'
                                    : evt.eventType.includes('LINKED')
                                      ? 'bg-indigo-600'
                                      : 'bg-amber-600'
                          }`}
                        />
                      </span>

                      <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 text-sm">
                            {evt.title}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatDateTime(evt.occurredAt)}
                          </span>
                        </div>

                        {evt.description && (
                          <p className="mt-1 text-xs text-slate-600">
                            {evt.description}
                          </p>
                        )}

                        <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-slate-400">
                          <span>Event: {evt.eventType}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* DIALOG 1: UPDATE STATUS / SEVERITY */}
      {statusDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-md border-slate-200 bg-white shadow-xl">
            <CardHeader>
              <CardTitle>Update Status & Severity</CardTitle>
              <CardDescription>
                Modify the operational state of this incident. This will be recorded on the audit timeline.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdateStatus}>
              <CardContent className="space-y-4">
                <FormField id="incident-status-select" label="Incident Status">
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as IncidentStatus)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  >
                    {INCIDENT_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField id="incident-severity-select" label="Severity Level">
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  >
                    {SEVERITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField id="incident-status-reason" label="Reason for change (optional)">
                  <Textarea
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="E.g., Escalated due to discovery of secondary extortion account."
                    maxLength={500}
                    rows={3}
                  />
                </FormField>
              </CardContent>
              <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStatusDialogOpen(false)}
                  disabled={isUpdatingStatus}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isUpdatingStatus}>
                  {isUpdatingStatus ? 'Updating...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* DIALOG 2: CLOSE INCIDENT */}
      {closeDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-md border-slate-200 bg-white shadow-xl">
            <CardHeader>
              <CardTitle>Close and Archive Incident</CardTitle>
              <CardDescription>
                Mark this safety incident as closed. The case will be archived with a resolution timestamp.
              </CardDescription>
            </CardHeader>
            <div className="p-4 space-y-3">
              <FormField id="incident-close-reason" label="Closure Reason (optional)">
                <Textarea
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="E.g., Offending accounts taken down and threat neutralized."
                  maxLength={500}
                  rows={3}
                />
              </FormField>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <Button
                variant="outline"
                onClick={() => setCloseDialogOpen(false)}
                disabled={isClosing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleCloseIncident}
                disabled={isClosing}
              >
                {isClosing ? 'Closing...' : 'Confirm Closure'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* DIALOG 3: REOPEN INCIDENT */}
      {reopenDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-md border-slate-200 bg-white shadow-xl">
            <CardHeader>
              <CardTitle>Reopen Incident</CardTitle>
              <CardDescription>
                Reactivate this safety case and mark it back to Open status.
              </CardDescription>
            </CardHeader>
            <div className="p-4 space-y-3">
              <FormField id="incident-reopen-reason" label="Reason for reopening (optional)">
                <Textarea
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="E.g., Actor resumed harassment from a new alt account."
                  maxLength={500}
                  rows={3}
                />
              </FormField>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <Button
                variant="outline"
                onClick={() => setReopenDialogOpen(false)}
                disabled={isReopening}
              >
                Cancel
              </Button>
              <Button onClick={handleReopenIncident} disabled={isReopening}>
                {isReopening ? 'Reopening...' : 'Reopen Case'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* DIALOG 4: LINK SUSPICIOUS PROFILE */}
      {linkProfileDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-md border-slate-200 bg-white shadow-xl">
            <CardHeader>
              <CardTitle>Associate Suspicious Profile</CardTitle>
              <CardDescription>
                Link one of your tracked suspicious profiles to this safety incident.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleLinkProfile}>
              <CardContent className="space-y-4">
                {linkableProfiles.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    All of your reported suspicious profiles are already linked to this incident, or you have not submitted any yet.
                  </p>
                ) : (
                  <>
                    <FormField id="incident-link-profile-select" label="Select Suspicious Profile">
                      <select
                        value={selectedProfileId}
                        onChange={(e) => setSelectedProfileId(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                        required
                      >
                        <option value="">— Choose a profile —</option>
                        {linkableProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            @{p.username} ({p.platform}) - {p.displayName ?? 'No display name'}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <FormField id="incident-link-profile-notes" label="Investigation notes (optional)">
                      <Input
                        value={linkProfileNotes}
                        onChange={(e) => setLinkProfileNotes(e.target.value)}
                        placeholder="E.g., Coordinated alt account sharing same bio."
                        maxLength={500}
                      />
                    </FormField>
                  </>
                )}
              </CardContent>
              <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLinkProfileDialogOpen(false)}
                  disabled={isLinkingProfile}
                >
                  Cancel
                </Button>
                {linkableProfiles.length > 0 && (
                  <Button
                    type="submit"
                    disabled={!selectedProfileId || isLinkingProfile}
                  >
                    {isLinkingProfile ? 'Linking...' : 'Link to Incident'}
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* DIALOG 5: LINK ABUSE REPORT */}
      {linkReportDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-md border-slate-200 bg-white shadow-xl">
            <CardHeader>
              <CardTitle>Associate Abuse Report</CardTitle>
              <CardDescription>
                Group an existing abuse report under this unified safety case.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleLinkReport}>
              <CardContent className="space-y-4">
                {linkableReports.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    All of your abuse reports are already associated with this incident, or you have not filed any yet.
                  </p>
                ) : (
                  <FormField id="incident-link-report-select" label="Select Abuse Report">
                    <select
                      value={selectedReportId}
                      onChange={(e) => setSelectedReportId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      required
                    >
                      <option value="">— Choose a report —</option>
                      {linkableReports.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} ({r.platform} • {r.category})
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}
              </CardContent>
              <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLinkReportDialogOpen(false)}
                  disabled={isLinkingReport}
                >
                  Cancel
                </Button>
                {linkableReports.length > 0 && (
                  <Button
                    type="submit"
                    disabled={!selectedReportId || isLinkingReport}
                  >
                    {isLinkingReport ? 'Linking...' : 'Link Report'}
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* CONFIRM DIALOG: UNLINK SUSPICIOUS PROFILE */}
      <ConfirmDialog
        open={Boolean(unlinkingProfileId)}
        onOpenChange={(open) => !open && setUnlinkingProfileId(null)}
        title="Unlink Suspicious Profile"
        description="Are you sure you want to remove this profile from the incident? This will unlink the association without deleting the profile from your Intelligence tracking records."
        confirmLabel="Unlink Profile"
        variant="destructive"
        loading={isUnlinkingProfile}
        onConfirm={handleUnlinkProfile}
      />

      {/* CONFIRM DIALOG: UNLINK ABUSE REPORT */}
      <ConfirmDialog
        open={Boolean(unlinkingReportId)}
        onOpenChange={(open) => !open && setUnlinkingReportId(null)}
        title="Unlink Abuse Report"
        description="Are you sure you want to remove this abuse report from this incident? This will disconnect the report without deleting the original report or its evidence."
        confirmLabel="Unlink Report"
        variant="destructive"
        loading={isUnlinkingReport}
        onConfirm={handleUnlinkReport}
      />

      {/* UPLOAD EVIDENCE DIALOG */}
      <UploadEvidenceDialog
        isOpen={uploadEvidenceDialogOpen}
        onClose={() => setUploadEvidenceDialogOpen(false)}
        onSuccess={() => {
          refreshIncident();
        }}
        preselectedIncidentId={incident.id}
      />

      {/* CRYPTOGRAPHIC INTEGRITY VERIFICATION DIALOG */}
      <VerifyEvidenceDialog
        isOpen={Boolean(verificationResult)}
        onClose={() => setVerificationResult(null)}
        result={verificationResult?.result ?? null}
        evidenceTitle={verificationResult?.evidence.title}
        evidenceFilename={verificationResult?.evidence.fileName}
      />
    </AppShell>
  );
}
