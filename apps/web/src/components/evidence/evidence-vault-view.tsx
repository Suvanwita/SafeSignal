'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  Filter,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
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
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { notify } from '@/components/ui/toaster';
import type { AuthUser } from '@/lib/auth/types';
import {
  deleteEvidence,
  fetchEvidence,
  verifyEvidence,
} from '@/lib/evidence/client-evidence';
import {
  formatBytes,
  getFileFormatCategory,
  type EvidenceRecord,
  type VerifyEvidenceResult,
} from '@/lib/evidence/types';
import { UploadEvidenceDialog } from './upload-evidence-dialog';
import { VerifyEvidenceDialog } from './verify-evidence-dialog';

export interface EvidenceVaultViewProps {
  user: AuthUser;
  initialEvidence: EvidenceRecord[];
  incidents: Array<{ id: string; title: string }>;
}

type FormatFilter = 'ALL' | 'PNG' | 'JPG' | 'PDF' | 'TXT' | 'DOCX';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function EvidenceVaultView({
  user,
  initialEvidence,
  incidents,
}: EvidenceVaultViewProps) {
  const [evidenceList, setEvidenceList] =
    React.useState<EvidenceRecord[]>(initialEvidence);
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [formatFilter, setFormatFilter] = React.useState<FormatFilter>('ALL');
  const [incidentFilter, setIncidentFilter] = React.useState<string>('ALL');

  const [isUploadDialogOpen, setIsUploadDialogOpen] =
    React.useState<boolean>(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState<boolean>(false);
  const [copiedShaId, setCopiedShaId] = React.useState<string | null>(null);

  // Verification state
  const [verifyingId, setVerifyingId] = React.useState<string | null>(null);
  const [verificationResult, setVerificationResult] = React.useState<{
    result: VerifyEvidenceResult;
    record: EvidenceRecord;
  } | null>(null);

  const incidentTitleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const inc of incidents) {
      map.set(inc.id, inc.title);
    }
    return map;
  }, [incidents]);

  // Refresh records
  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const records = await fetchEvidence();
      setEvidenceList(records);
      notify.verified('Vault refreshed', 'Latest evidence records loaded.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unable to refresh evidence vault.';
      notify.alert('Refresh failed', msg);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Copy SHA-256 checksum
  const handleCopySha = (id: string, sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedShaId(id);
    notify.verified(
      'Checksum copied',
      'SHA-256 hash copied to clipboard for integrity verification.',
    );
    setTimeout(() => {
      setCopiedShaId((curr) => (curr === id ? null : curr));
    }, 2500);
  };

  // Download evidence file
  const handleDownload = (ev: EvidenceRecord) => {
    const downloadUrl = `/api/evidence/${encodeURIComponent(ev.id)}/download`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = ev.fileName || 'evidence-file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Cryptographically verify evidence integrity
  const handleVerify = async (ev: EvidenceRecord) => {
    setVerifyingId(ev.id);
    try {
      const res = await verifyEvidence(ev.id);
      setVerificationResult({ result: res, record: ev });
      if (res.status === 'VERIFIED') {
        notify.verified(
          'Cryptographic integrity verified',
          'Recalculated SHA-256 matches the original upload hash byte-for-byte.',
        );
      } else {
        notify.alert(
          'Integrity mismatch detected',
          'Recalculated SHA-256 hash does not match the upload record!',
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Integrity verification failed.';
      notify.alert('Verification error', msg);
    } finally {
      setVerifyingId(null);
    }
  };

  // Delete evidence
  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await deleteEvidence(deletingId);
      setEvidenceList((prev) => prev.filter((item) => item.id !== deletingId));
      notify.verified(
        'Evidence record removed',
        'Physical file purged from vault storage and database record deleted.',
      );
      setDeletingId(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to delete evidence file.';
      notify.alert('Deletion failed', msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculated Stats
  const totalFiles = evidenceList.length;
  const totalSizeBytes = evidenceList.reduce(
    (acc, curr) => acc + (curr.fileSize || 0),
    0,
  );
  const uniqueIncidentsCount = new Set(evidenceList.map((e) => e.incidentId))
    .size;

  // Filtered evidence records
  const filteredEvidence = React.useMemo(() => {
    return evidenceList.filter((ev) => {
      // Format filter
      const category = getFileFormatCategory(ev.fileName, ev.mimeType);
      if (formatFilter !== 'ALL' && category !== formatFilter) {
        return false;
      }

      // Incident filter
      if (incidentFilter !== 'ALL' && ev.incidentId !== incidentFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = ev.title.toLowerCase().includes(q);
        const matchesDesc = (ev.description || '').toLowerCase().includes(q);
        const matchesFilename = (ev.fileName || '').toLowerCase().includes(q);
        const matchesSha = (ev.sha256 || '').toLowerCase().includes(q);
        const matchesIncident = (incidentTitleMap.get(ev.incidentId) || '')
          .toLowerCase()
          .includes(q);

        return (
          matchesTitle ||
          matchesDesc ||
          matchesFilename ||
          matchesSha ||
          matchesIncident
        );
      }

      return true;
    });
  }, [evidenceList, formatFilter, incidentFilter, searchQuery, incidentTitleMap]);

  return (
    <AppShell
      title="Evidence Vault"
      subtitle="Tamper-evident, cryptographically hashed evidence files (PNG, JPG, PDF, TXT, DOCX) linked to safety incidents."
      user={user}
    >
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Evidence Vault
              </h1>
              <Badge
                variant="neutral"
                className="gap-1 border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                Air-Gapped Private Storage
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Tamper-evident, cryptographically hashed evidence files (PNG, JPG, PDF, TXT, DOCX) linked to safety incidents.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2 text-slate-700"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setIsUploadDialogOpen(true)}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4" />
              Upload Evidence
            </Button>
          </div>
        </div>

        {/* Security Assurance Banner */}
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div className="leading-relaxed">
            <span className="font-semibold text-slate-900">
              Zero Public Exposure Guarantee:
            </span>{' '}
            Evidence files are held strictly outside web-accessible roots and
            served via authenticated, authorized streaming endpoints with
            signature verification. Filesystem paths and storage keys are never
            disclosed.
          </div>
        </div>

        {/* Metrics Overview Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Files
              </CardTitle>
              <FileCheck className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{totalFiles}</div>
              <p className="mt-1 text-xs text-slate-500">
                Active vaulted records
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Vault Storage Used
              </CardTitle>
              <HardDrive className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {formatBytes(totalSizeBytes)}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Encrypted at rest (15 MB max per file)
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Associated Incidents
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {uniqueIncidentsCount}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Cases with verified attachments
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Integrity Engine
              </CardTitle>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">SHA-256</div>
              <p className="mt-1 text-xs text-slate-500">
                100% cryptographic checksummed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by title, filename, SHA-256 checksum..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Format filter pills */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50/70 p-1 text-xs">
              {(
                ['ALL', 'PNG', 'JPG', 'PDF', 'TXT', 'DOCX'] as FormatFilter[]
              ).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormatFilter(fmt)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    formatFilter === fmt
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            {/* Incident filter */}
            {incidents.length > 0 && (
              <select
                value={incidentFilter}
                onChange={(e) => setIncidentFilter(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-slate-900 focus:outline-none"
              >
                <option value="ALL">All Incidents</option>
                {incidents.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.title.length > 25
                      ? `${inc.title.slice(0, 25)}...`
                      : inc.title}
                  </option>
                ))}
              </select>
            )}

            {(searchQuery ||
              formatFilter !== 'ALL' ||
              incidentFilter !== 'ALL') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setFormatFilter('ALL');
                  setIncidentFilter('ALL');
                }}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Evidence Records Content */}
        {evidenceList.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8 text-slate-400" />}
            title="Evidence Vault is Empty"
            description="Securely upload screenshots, chat logs, PDF records, or threat documentation to preserve evidence for your safety cases."
            action={
              <Button
                onClick={() => setIsUploadDialogOpen(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4" />
                Upload First Evidence Record
              </Button>
            }
          />
        ) : filteredEvidence.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="py-12 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">
                No matching evidence records found
              </p>
              <p className="text-xs text-slate-500">
                Try adjusting your search terms, format filter, or incident selector.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setFormatFilter('ALL');
                  setIncidentFilter('ALL');
                }}
                className="mt-4"
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Evidence Item</TableHead>
                    <TableHead>Type & Size</TableHead>
                    <TableHead>Associated Incident</TableHead>
                    <TableHead>SHA-256 Checksum</TableHead>
                    <TableHead>Captured / Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvidence.map((ev) => {
                    const format = getFileFormatCategory(
                      ev.fileName,
                      ev.mimeType,
                    );
                    const incidentTitle =
                      incidentTitleMap.get(ev.incidentId) || 'Incident Case';

                    return (
                      <TableRow key={ev.id} className="group">
                        {/* Title & Description */}
                        <TableCell>
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                              {format === 'PNG' || format === 'JPG' ? (
                                <ImageIcon className="h-4 w-4 text-blue-600" />
                              ) : (
                                <FileText className="h-4 w-4 text-slate-600" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/evidence/${ev.id}`}
                                className="truncate text-sm font-semibold text-slate-900 hover:text-blue-600 hover:underline block"
                              >
                                {ev.title}
                              </Link>
                              {ev.description && (
                                <p className="line-clamp-1 text-xs text-slate-500">
                                  {ev.description}
                                </p>
                              )}
                              <p className="mt-0.5 truncate text-[11px] font-mono text-slate-400">
                                {ev.fileName ?? 'evidence.dat'}
                              </p>
                              {ev.sourceUrl && (
                                <a
                                  href={ev.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                                >
                                  <span>Source URL</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Format & Size */}
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
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
                            <span className="text-xs text-slate-500">
                              {formatBytes(ev.fileSize)}
                            </span>
                          </div>
                        </TableCell>

                        {/* Associated Incident */}
                        <TableCell>
                          <Link
                            href={`/incidents/${ev.incidentId}`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-800 hover:text-blue-600 hover:underline"
                          >
                            <span className="max-w-[180px] truncate">
                              {incidentTitle}
                            </span>
                            <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
                          </Link>
                        </TableCell>

                        {/* SHA-256 Checksum */}
                        <TableCell>
                          {ev.sha256 ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="font-mono text-xs text-slate-600"
                                title={ev.sha256}
                              >
                                {ev.sha256.slice(0, 10)}...{ev.sha256.slice(-6)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopySha(ev.id, ev.sha256!)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Copy full SHA-256 checksum"
                              >
                                {copiedShaId === ev.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>

                        {/* Date Captured / Uploaded */}
                        <TableCell className="text-xs text-slate-500">
                          {formatDate(ev.capturedAt ?? ev.createdAt)}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/evidence/${ev.id}`}
                              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              title="View metadata and evidence details"
                            >
                              Details
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVerify(ev)}
                              disabled={verifyingId === ev.id}
                              title="Cryptographically verify SHA-256 integrity"
                              className="h-8 gap-1.5 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50 border-blue-200"
                            >
                              {verifyingId === ev.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                              )}
                              Verify
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(ev)}
                              title="Download authenticated evidence file"
                              className="h-8 gap-1.5 text-xs text-slate-700"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingId(ev.id)}
                              title="Delete from vault"
                              className="h-8 w-8 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Upload Dialog */}
      <UploadEvidenceDialog
        isOpen={isUploadDialogOpen}
        onClose={() => setIsUploadDialogOpen(false)}
        onSuccess={(newRecord) => {
          setEvidenceList((prev) => [newRecord, ...prev]);
        }}
        incidents={incidents}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Vault Evidence Record"
        description="Are you sure you want to delete this evidence record? The physical file will be securely shredded from local storage and the database integrity audit log will be permanently removed. This action cannot be undone."
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete File'}
        variant="destructive"
        loading={isDeleting}
      />

      {/* Cryptographic Integrity Verification Dialog */}
      <VerifyEvidenceDialog
        isOpen={Boolean(verificationResult)}
        onClose={() => setVerificationResult(null)}
        result={verificationResult?.result ?? null}
        evidenceTitle={verificationResult?.record.title}
        evidenceFilename={verificationResult?.record.fileName}
      />
    </AppShell>
  );
}
