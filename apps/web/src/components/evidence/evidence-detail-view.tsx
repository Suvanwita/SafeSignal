'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  FileCheck2,
  FileCode,
  FileText,
  HardDrive,
  Hash,
  Image as ImageIcon,
  Info,
  Layers,
  Link2,
  Loader2,
  Lock,
  Maximize2,
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
import { notify } from '@/components/ui/toaster';
import type { AuthUser } from '@/lib/auth/types';
import {
  deleteEvidence,
  verifyEvidence,
} from '@/lib/evidence/client-evidence';
import {
  EVIDENCE_INTEGRITY_DISCLAIMER,
  formatBytes,
  getFileFormatCategory,
  type EvidenceRecord,
  type VerifyEvidenceResult,
} from '@/lib/evidence/types';
import { VerifyEvidenceDialog } from './verify-evidence-dialog';

export interface EvidenceDetailViewProps {
  user: AuthUser;
  evidence: EvidenceRecord;
  incidentTitle?: string | null;
  abuseReportTitle?: string | null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function EvidenceDetailView({
  user,
  evidence: initialEvidence,
  incidentTitle,
  abuseReportTitle,
}: EvidenceDetailViewProps) {
  const router = useRouter();
  const [evidence] = React.useState<EvidenceRecord>(initialEvidence);

  const [isVerifying, setIsVerifying] = React.useState<boolean>(false);
  const [verifyResult, setVerifyResult] =
    React.useState<VerifyEvidenceResult | null>(null);
  const [isVerifyDialogOpen, setIsVerifyDialogOpen] =
    React.useState<boolean>(false);

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] =
    React.useState<boolean>(false);
  const [isDeleting, setIsDeleting] = React.useState<boolean>(false);

  const [copiedSha, setCopiedSha] = React.useState<boolean>(false);
  const [copiedJson, setCopiedJson] = React.useState<boolean>(false);
  const [isJsonExpanded, setIsJsonExpanded] = React.useState<boolean>(false);

  const format = getFileFormatCategory(evidence.fileName, evidence.mimeType);
  const meta = evidence.metadata;
  const isImage = format === 'PNG' || format === 'JPG';
  const isPdf = format === 'PDF';
  const isText = format === 'TXT';
  const hasExif = Boolean(meta?.image?.exif);
  const hasRedactedGps = meta?.image?.exif?.hasRedactedGps ?? false;

  const handleCopySha = async () => {
    if (!evidence.sha256) return;
    try {
      await navigator.clipboard.writeText(evidence.sha256);
      setCopiedSha(true);
      notify.verified('SHA-256 checksum copied to clipboard.');
      setTimeout(() => setCopiedSha(false), 2000);
    } catch {
      notify.alert('Failed to copy checksum.');
    }
  };

  const handleCopyJson = async () => {
    if (!meta) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(meta, null, 2));
      setCopiedJson(true);
      notify.verified('Structured metadata JSON copied to clipboard.');
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      notify.alert('Failed to copy metadata JSON.');
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const res = await verifyEvidence(evidence.id);
      setVerifyResult(res);
      setIsVerifyDialogOpen(true);
      if (res.status === 'VERIFIED') {
        notify.verified('Cryptographic integrity verified: File matches recorded hash.');
      } else {
        notify.alert('Integrity check failed: File has been altered.');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Verification request failed.';
      notify.alert(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDownload = () => {
    window.location.href = `/api/evidence/${evidence.id}/download`;
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteEvidence(evidence.id);
      notify.verified('Evidence record and vault file removed successfully.');
      router.push(`/incidents/${evidence.incidentId}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to delete evidence record.';
      notify.alert(msg);
      setIsDeleting(false);
    }
  };

  return (
    <AppShell user={user} title="Evidence Details">
      <div className="space-y-6">
        {/* TOP BREADCRUMBS & NAVIGATION */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link
              href="/evidence"
              className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Evidence Vault</span>
            </Link>
            <span>/</span>
            <span className="font-semibold text-slate-900 truncate max-w-[280px]">
              {evidence.title}
            </span>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleVerify}
              disabled={isVerifying}
              className="gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:bg-blue-50 border-blue-200"
            >
              {isVerifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              )}
              <span>Verify Integrity</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-1.5 text-xs font-semibold text-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download File</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsConfirmDeleteOpen(true)}
              className="gap-1.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        </div>

        {/* HEADER HERO CARD */}
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                  {isImage ? (
                    <ImageIcon className="h-6 w-6 text-blue-600" />
                  ) : isPdf ? (
                    <FileText className="h-6 w-6 text-red-600" />
                  ) : (
                    <FileCode className="h-6 w-6 text-slate-600" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-xl font-bold text-slate-900">
                      {evidence.title}
                    </CardTitle>
                    <Badge
                      variant="neutral"
                      className={`text-xs font-bold ${
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
                    <Badge
                      variant="neutral"
                      className="border-slate-200 text-xs font-medium text-slate-600"
                    >
                      {formatBytes(evidence.fileSize)}
                    </Badge>
                  </div>
                  {evidence.description ? (
                    <CardDescription className="mt-1 text-sm text-slate-600">
                      {evidence.description}
                    </CardDescription>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400 italic">
                      No descriptive custody notes attached.
                    </p>
                  )}
                </div>
              </div>

              {/* ASSOCIATED INCIDENT PILL */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
                  Attached Case
                </span>
                <Link
                  href={`/incidents/${evidence.incidentId}`}
                  className="mt-0.5 inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                >
                  <span>{incidentTitle || 'View Incident Case'}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* PRIVACY & LOCATION REDACTION ALERT */}
        {hasRedactedGps ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-start gap-3">
              <EyeOff className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-amber-900">
                  Location Privacy Protection Active (GPS Redacted)
                </h4>
                <p className="mt-0.5 text-xs text-amber-800 leading-relaxed">
                  Precise GPS latitude and longitude coordinates were detected
                  in this image&apos;s EXIF metadata upon upload and were
                  automatically stripped at the extraction layer. SafeSignal
                  never stores or displays geographic coordinates in order to
                  safeguard your physical location and safety.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Privacy Safeguard Active:</strong> Sensitive location
                coordinates (GPS coordinates, device serial numbers) are strictly
                protected and restricted exclusively to the authenticated
                evidence owner.
              </span>
            </div>
          </div>
        )}

        {/* SHA-256 FINGERPRINT & CUSTODY INTEGRITY CARD */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  Cryptographic Evidence Integrity
                </CardTitle>
              </div>
              <Badge
                variant="neutral"
                className="border-blue-200 bg-blue-50 text-[11px] font-bold text-blue-700"
              >
                SHA-256 (FIPS 180-4)
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Immutable cryptographic hash calculated directly from original raw
              bytes upon arrival in the vault.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-emerald-400">
              <div className="flex items-center gap-2 truncate">
                <Hash className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate selection:bg-emerald-900 selection:text-white">
                  {evidence.sha256 || 'HASH_CALCULATION_UNAVAILABLE'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopySha}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                title="Copy full SHA-256 checksum"
              >
                {copiedSha ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">
              <Info className="inline h-3.5 w-3.5 text-slate-400 mr-1 -mt-0.5" />
              {EVIDENCE_INTEGRITY_DISCLAIMER}
            </p>
          </CardContent>
        </Card>

        {/* TWO-COLUMN METADATA SECTION */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* CARD 1: CORE FILE METADATA */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  Core File Attributes
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-slate-500">
                Low-level container properties recorded at ingest.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500">Original File Name</dt>
                  <dd className="font-mono font-medium text-slate-900 truncate max-w-[240px]">
                    {meta?.file?.fileName || evidence.fileName || '—'}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500">Canonical MIME Type</dt>
                  <dd className="font-mono text-slate-800">
                    {meta?.file?.mimeType || evidence.mimeType || '—'}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500">Exact File Size</dt>
                  <dd className="font-medium text-slate-900">
                    {formatBytes(evidence.fileSize)}{' '}
                    <span className="font-mono text-[11px] text-slate-400">
                      ({evidence.fileSize?.toLocaleString()} bytes)
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500">Ingest Timestamp</dt>
                  <dd className="text-slate-800">{formatDate(evidence.createdAt)}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500">Recorded Incident Capture</dt>
                  <dd className="text-slate-800">
                    {evidence.capturedAt
                      ? formatDate(evidence.capturedAt)
                      : 'Same as upload'}
                  </dd>
                </div>
                {evidence.sourceUrl && (
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Source Capture URL</dt>
                    <dd className="truncate max-w-[240px]">
                      <a
                        href={evidence.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <span className="truncate">{evidence.sourceUrl}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </dd>
                  </div>
                )}
                {evidence.abuseReportId && (
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Associated Abuse Report</dt>
                    <dd>
                      <Link
                        href={`/abuse/${evidence.abuseReportId}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                      >
                        <span>{abuseReportTitle || 'View Abuse Report'}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* CARD 2: FORMAT-SPECIFIC ATTRIBUTES */}
          {isImage && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Image Display & Dimensions
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-slate-500">
                  Raster dimensions and color profile parameters.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-slate-100 text-xs">
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Image Dimensions</dt>
                    <dd className="font-semibold text-slate-900">
                      {meta?.image?.width && meta?.image?.height
                        ? `${meta.image.width} × ${meta.image.height} px`
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Aspect Ratio</dt>
                    <dd className="font-mono text-slate-800">
                      {meta?.image?.aspectRatio || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Bit Depth</dt>
                    <dd className="text-slate-800">
                      {meta?.image?.bitDepth
                        ? `${meta.image.bitDepth}-bit per channel`
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Color Profile</dt>
                    <dd className="text-slate-800">
                      {meta?.image?.colorSpace || 'sRGB'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Image Encoding Format</dt>
                    <dd className="font-mono text-slate-800">
                      {meta?.image?.format || format}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          {isPdf && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    PDF Document Properties
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-slate-500">
                  Extracted trailer dictionary and document metadata.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-slate-100 text-xs">
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Page Count</dt>
                    <dd className="font-semibold text-slate-900">
                      {meta?.pdf?.pageCount
                        ? `${meta.pdf.pageCount} ${meta.pdf.pageCount === 1 ? 'page' : 'pages'}`
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Document Title</dt>
                    <dd className="font-medium text-slate-900 truncate max-w-[220px]">
                      {meta?.pdf?.title || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Author</dt>
                    <dd className="text-slate-800 truncate max-w-[220px]">
                      {meta?.pdf?.author || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Subject / Matter</dt>
                    <dd className="text-slate-800 truncate max-w-[220px]">
                      {meta?.pdf?.subject || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">PDF Specification</dt>
                    <dd className="font-mono text-slate-800">
                      {meta?.pdf?.pdfVersion
                        ? `PDF ${meta.pdf.pdfVersion}`
                        : 'PDF 1.x'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Producer / Generator</dt>
                    <dd className="text-slate-600 truncate max-w-[220px]">
                      {meta?.pdf?.producer || meta?.pdf?.creator || '—'}
                    </dd>
                  </div>
                  {meta?.pdf?.keywords && meta.pdf.keywords.length > 0 && (
                    <div className="flex justify-between py-2.5">
                      <dt className="text-slate-500">Keywords</dt>
                      <dd className="flex flex-wrap gap-1 max-w-[220px] justify-end">
                        {meta.pdf.keywords.map((kw, idx) => (
                          <Badge
                            key={idx}
                            variant="neutral"
                            className="text-[10px] py-0 px-1.5"
                          >
                            {kw}
                          </Badge>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {isText && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Text Metrics & Complexity
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-slate-500">
                  Statistical text metrics for logs and chat transcripts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-slate-100 text-xs">
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Line Count</dt>
                    <dd className="font-semibold text-slate-900">
                      {meta?.text?.lineCount?.toLocaleString() ?? '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Word Count</dt>
                    <dd className="font-semibold text-slate-900">
                      {meta?.text?.wordCount?.toLocaleString() ?? '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Character Count</dt>
                    <dd className="font-mono text-slate-800">
                      {meta?.text?.characterCount?.toLocaleString() ?? '—'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          {!isImage && !isPdf && !isText && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Document Container
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-slate-500">
                  Binary archive structure information.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-slate-100 text-xs">
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Container Format</dt>
                    <dd className="font-semibold text-slate-900">{format}</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-500">Zip Packaging</dt>
                    <dd className="text-slate-800">
                      {meta?.docx?.isZipContainer ? 'Valid PKZIP container' : '—'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}
        </div>

        {/* EXIF CAMERA METADATA (IF PRESENT FOR IMAGES) */}
        {isImage && hasExif && (
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Camera & Optical EXIF Settings
                  </CardTitle>
                </div>
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                  Safe EXIF Filter Applied
                </span>
              </div>
              <CardDescription className="text-xs text-slate-500">
                Non-sensitive camera hardware and exposure properties extracted
                without location coordinates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 md:grid-cols-3 text-xs">
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-500 block">Device Camera</span>
                  <span className="font-medium text-slate-900">
                    {meta?.image?.exif?.make || meta?.image?.exif?.model
                      ? `${meta.image.exif.make ?? ''} ${meta.image.exif.model ?? ''}`.trim()
                      : '—'}
                  </span>
                </div>
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-500 block">Capture Software</span>
                  <span className="text-slate-800 truncate block">
                    {meta?.image?.exif?.software || '—'}
                  </span>
                </div>
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-500 block">Original Date/Time</span>
                  <span className="text-slate-800">
                    {meta?.image?.exif?.dateTimeOriginal || '—'}
                  </span>
                </div>
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-500 block">Exposure Time</span>
                  <span className="font-mono text-slate-800">
                    {meta?.image?.exif?.exposureTime || '—'}
                  </span>
                </div>
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-500 block">Aperture (F-Stop)</span>
                  <span className="font-mono text-slate-800">
                    {meta?.image?.exif?.fNumber
                      ? `f/${meta.image.exif.fNumber}`
                      : '—'}
                  </span>
                </div>
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-500 block">ISO Sensitivity</span>
                  <span className="font-mono text-slate-800">
                    {meta?.image?.exif?.iso ? `ISO ${meta.image.exif.iso}` : '—'}
                  </span>
                </div>
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-500 block">Focal Length</span>
                  <span className="text-slate-800">
                    {meta?.image?.exif?.focalLength || '—'}
                  </span>
                </div>
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-500 block">Lens Specification</span>
                  <span className="text-slate-800 truncate block">
                    {meta?.image?.exif?.lensModel || '—'}
                  </span>
                </div>
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-500 block">Orientation</span>
                  <span className="text-slate-800">
                    {meta?.image?.exif?.orientation?.toString() || 'Standard'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STRUCTURED JSON AUDIT VIEWER */}
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  Structured Metadata JSON
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-slate-500">
                Machine-readable JSON schema stored in PostgreSQL for chain-of-custody audit exports.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyJson}
                className="h-8 gap-1.5 text-xs text-slate-700"
              >
                {copiedJson ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>Copy JSON</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsJsonExpanded(!isJsonExpanded)}
                className="h-8 text-xs text-slate-600"
              >
                {isJsonExpanded ? 'Collapse' : 'Expand'}
              </Button>
            </div>
          </CardHeader>
          {isJsonExpanded && (
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs text-slate-200">
                <pre>{JSON.stringify(meta ?? { evidenceId: evidence.id }, null, 2)}</pre>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* VERIFY DIALOG */}
      <VerifyEvidenceDialog
        isOpen={isVerifyDialogOpen}
        onClose={() => setIsVerifyDialogOpen(false)}
        result={verifyResult}
        evidenceTitle={evidence.title}
        evidenceFilename={evidence.fileName}
      />

      {/* CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        open={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
        onConfirm={handleDelete}
        title="Delete Evidence Record"
        description={`Are you sure you want to delete "${evidence.title}"? This will permanently remove the record and delete the encrypted file from vault storage.`}
        confirmLabel="Delete Evidence"
        loading={isDeleting}
        variant="destructive"
      />
    </AppShell>
  );
}
