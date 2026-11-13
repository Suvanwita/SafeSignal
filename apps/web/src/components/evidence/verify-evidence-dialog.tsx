'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  FileCheck2,
  HardDrive,
  Info,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { notify } from '@/components/ui/toaster';
import {
  formatBytes,
  type VerifyEvidenceResult,
} from '@/lib/evidence/types';

interface VerifyEvidenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: VerifyEvidenceResult | null;
  evidenceTitle?: string;
  evidenceFilename?: string | null;
}

function formatIso(iso: string | null): string {
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

export function VerifyEvidenceDialog({
  isOpen,
  onClose,
  result,
  evidenceTitle,
  evidenceFilename,
}: VerifyEvidenceDialogProps) {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  if (!isOpen || !result) return null;

  const isVerified = result.status === 'VERIFIED';

  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    notify.verified(`${label} copied`, text);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold text-slate-900">
                Cryptographic Integrity Verification
              </CardTitle>
              <Badge
                variant={isVerified ? 'verified' : 'alert'}
                className="text-[11px] font-bold"
              >
                {result.status}
              </Badge>
            </div>
            <CardDescription className="mt-0.5 text-xs text-slate-500">
              {evidenceTitle || 'Vault Evidence Record'}
              {evidenceFilename ? ` (${evidenceFilename})` : ''}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          {/* Status Verdict Banner */}
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              isVerified
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
                : 'border-red-200 bg-red-50/80 text-red-950'
            }`}
          >
            {isVerified ? (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            )}
            <div>
              <p className="text-sm font-semibold">
                {isVerified
                  ? 'File Integrity Fully Verified (Byte-for-Byte Match)'
                  : 'Integrity Mismatch Detected (Possible File Alteration or Corruption)'}
              </p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                {isVerified
                  ? 'The file currently stored in private vault storage exactly matches the cryptographic SHA-256 hash calculated and sealed when it was originally uploaded.'
                  : 'The file currently stored in the vault does NOT match the cryptographic SHA-256 hash recorded upon upload. This indicates the file has been modified, corrupted, or replaced since upload.'}
              </p>
            </div>
          </div>

          {/* Cryptographic Hash Comparison Grid */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              SHA-256 Checksum Audit Comparison
            </h3>

            {/* Original Upload Hash */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold text-slate-800">
                  Original Upload Hash (Recorded in DB)
                </span>
                <span className="text-[11px] text-slate-500">
                  Sealed at {formatIso(result.uploadedAt)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="break-all font-mono text-xs text-slate-800">
                  {result.originalHash || '—'}
                </span>
                {result.originalHash && (
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(result.originalHash, 'original', 'Upload hash')
                    }
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                    title="Copy original hash"
                  >
                    {copiedKey === 'original' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Recalculated Hash */}
            <div
              className={`rounded-lg border p-3.5 ${
                isVerified
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-red-200 bg-red-50/40'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  Recalculated Vault File Hash (Stored Original File)
                </span>
                <span className="text-[11px] text-slate-500">
                  Recalculated at {formatIso(result.verifiedAt)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className={`break-all font-mono text-xs ${
                    isVerified ? 'text-emerald-900 font-semibold' : 'text-red-900 font-semibold'
                  }`}
                >
                  {result.recalculatedHash}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      result.recalculatedHash,
                      'recalculated',
                      'Recalculated hash',
                    )
                  }
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                  title="Copy recalculated hash"
                >
                  {copiedKey === 'recalculated' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Custody Metrics Grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <HardDrive className="h-3.5 w-3.5" />
                <span>File Size Audit</span>
              </div>
              <p className="mt-1 font-semibold text-sm text-slate-900">
                {formatBytes(result.currentFileSize)}
              </p>
              <p className="text-[11px] text-slate-500">
                Recorded: {formatBytes(result.originalFileSize)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>Algorithm & Format</span>
              </div>
              <p className="mt-1 font-semibold text-sm text-slate-900">
                {result.algorithm}
              </p>
              <p className="text-[11px] text-slate-500">
                {result.mimeType ?? 'application/octet-stream'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                <span>Verified At</span>
              </div>
              <p className="mt-1 font-semibold text-sm text-slate-900 truncate">
                {formatIso(result.verifiedAt).split(',')[0]}
              </p>
              <p className="text-[11px] text-slate-500">
                {formatIso(result.verifiedAt).split(',')[1] || ''}
              </p>
            </div>
          </div>

          {/* Prominent Legal & Technical Disclaimer */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <div className="text-xs leading-relaxed text-blue-950">
                <span className="font-bold">
                  Integrity Guarantee vs. Content Authenticity:
                </span>{' '}
                {result.disclaimer}
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-end border-t border-slate-100 bg-slate-50/50 px-6 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
