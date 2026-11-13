'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileText,
  Filter,
  Info,
  Layers,
  Lock,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
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
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/components/ui/toaster';
import type { AuthUser } from '@/lib/auth/types';
import { redactSensitiveText, scanSensitiveText } from '@/lib/privacy/client-privacy';
import type {
  ConfidenceLevel,
  RedactionStrategy,
  RedactSensitiveTextResponse,
  ScanSensitiveTextResponse,
  SensitiveCategory,
  SensitiveDetection,
} from '@/lib/privacy/types';

interface PrivacyScannerViewProps {
  user: AuthUser;
}

const MAX_CHAR_LIMIT = 50_000;

const ALL_CATEGORIES: Array<{
  id: SensitiveCategory;
  label: string;
  description: string;
}> = [
  {
    id: 'EMAIL',
    label: 'Email Addresses',
    description: 'RFC-compliant emails and standard obfuscated patterns',
  },
  {
    id: 'PHONE_INDIAN',
    label: 'Indian Phones',
    description: '10-digit mobile numbers, +91 prefixes, and landlines with STD codes',
  },
  {
    id: 'PHONE_INTERNATIONAL',
    label: 'International Phones',
    description: 'E.164 and NANP patterns (+1, +44, +61, etc.)',
  },
  {
    id: 'ADDRESS',
    label: 'Physical Addresses',
    description: 'Postal codes (PIN/ZIP), Indian states/cities, and street markers',
  },
];

const STRATEGY_OPTIONS: Array<{
  id: RedactionStrategy;
  label: string;
  description: string;
  example: string;
}> = [
  {
    id: 'CATEGORY_LABEL',
    label: 'Category Labels',
    description: 'Replaces sensitive items with semantic category placeholders',
    example: '[REDACTED_EMAIL], [REDACTED_PHONE], [REDACTED_ADDRESS]',
  },
  {
    id: 'PARTIAL_MASK',
    label: 'Partial Masking',
    description: 'Retains anchor characters while masking sensitive core values',
    example: 'j***e@domain.com, +91 ******3210',
  },
  {
    id: 'FULL_MASK',
    label: 'Full Asterisk Mask',
    description: 'Masks the exact length of each entity with asterisks',
    example: '*********************',
  },
  {
    id: 'HASH',
    label: 'Cryptographic Hash',
    description: 'Inserts SHA-256 fingerprint for tamper-evident correlation',
    example: '[HASH:8f4c2e1a...]',
  },
  {
    id: 'CUSTOM',
    label: 'Custom Placeholder',
    description: 'Applies user-defined token across all detected items',
    example: '[CONFIDENTIAL]',
  },
  {
    id: 'REMOVE',
    label: 'Clean Removal',
    description: 'Strips sensitive entities completely from the text',
    example: '(Empty space)',
  },
];

const SAMPLE_INCIDENT_TEXT = `Subject: Urgent report on stalking and unconsented data dissemination

I am filing this safety record regarding persistent harassment from an anonymous account on Telegram and Instagram.
The actor sent the following message yesterday:
"I know your real routine and personal contact points. Reach me at harasser99@protonmail.com or call +91 98765 43210 before midnight.
If you block that number, my colleague will follow up on +1 (555) 234-5678.
We have confirmed your home location: Flat 302, Palm Grove Apts, 24th Main, HSR Layout, Sector 2, Bangalore, Karnataka - 560102.
Don't test us."

Please ensure this statement is retained securely. Redact all personal contact details and residential address before forwarding to the platform grievance cell or cyber cell.`;

export function PrivacyScannerView({ user }: PrivacyScannerViewProps) {
  // Input State (Never mutated by scanning or redacting)
  const [inputText, setInputText] = React.useState<string>('');
  const [selectedCategories, setSelectedCategories] = React.useState<
    Set<SensitiveCategory>
  >(new Set(['EMAIL', 'PHONE_INDIAN', 'PHONE_INTERNATIONAL', 'ADDRESS']));
  const [minConfidence, setMinConfidence] =
    React.useState<ConfidenceLevel>('LOW');

  // Scanning State
  const [isScanning, setIsScanning] = React.useState<boolean>(false);
  const [scanResult, setScanResult] =
    React.useState<ScanSensitiveTextResponse | null>(null);

  // Redaction State
  const [isRedacting, setIsRedacting] = React.useState<boolean>(false);
  const [strategy, setStrategy] =
    React.useState<RedactionStrategy>('CATEGORY_LABEL');
  const [customPlaceholder, setCustomPlaceholder] =
    React.useState<string>('[CONFIDENTIAL]');
  const [redactResult, setRedactResult] =
    React.useState<RedactSensitiveTextResponse | null>(null);

  // UI Navigation & Utilities
  const [activeTab, setActiveTab] = React.useState<
    'highlights' | 'redacted' | 'comparison' | 'audit'
  >('highlights');
  const [copied, setCopied] = React.useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(
    null,
  );
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Character limit calculation
  const charCount = inputText.length;
  const isOverLimit = charCount > MAX_CHAR_LIMIT;

  // Toggle category filters
  function toggleCategory(cat: SensitiveCategory) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size === 1) {
          notify.alert(
            'Selection Required',
            'At least one category must remain active for scanning.',
          );
          return prev;
        }
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  // Load sample text
  function handleLoadSample() {
    setInputText(SAMPLE_INCIDENT_TEXT);
    setUploadedFileName(null);
    setScanResult(null);
    setRedactResult(null);
    setActiveTab('highlights');
    notify.info('Sample Loaded', 'Harassment incident sample text loaded.');
  }

  // Clear input and results
  function handleClear() {
    setInputText('');
    setUploadedFileName(null);
    setScanResult(null);
    setRedactResult(null);
    setActiveTab('highlights');
  }

  // Handle .txt file upload
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
      notify.alert(
        'Unsupported File',
        'Please upload a plain text file (.txt). For other formats, use Evidence Vault.',
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      notify.alert('File Too Large', 'Maximum text file size is 2MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (typeof content === 'string') {
        setInputText(content);
        setUploadedFileName(file.name);
        setScanResult(null);
        setRedactResult(null);
        setActiveTab('highlights');
        notify.verified('File Loaded', `Read ${content.length.toLocaleString()} characters from ${file.name}.`);
      }
    };
    reader.onerror = () => {
      notify.alert('Read Error', 'Failed to read text file contents.');
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Run privacy scan
  async function handleScan() {
    if (!inputText.trim()) {
      notify.alert('Input Required', 'Please enter or paste text to scan.');
      return;
    }
    if (isOverLimit) {
      notify.alert(
        'Limit Exceeded',
        `Text exceeds maximum limit of ${MAX_CHAR_LIMIT.toLocaleString()} characters.`,
      );
      return;
    }

    setIsScanning(true);
    try {
      const result = await scanSensitiveText({
        text: inputText,
        categories: Array.from(selectedCategories),
        minConfidence,
      });
      setScanResult(result);
      // If we previously had a redaction, keep or reset
      if (result.hasSensitiveData) {
        notify.verified(
          'Scan Complete',
          `Detected ${result.totalDetections} sensitive entities in ${result.executionTimeMs}ms.`,
        );
      } else {
        notify.info(
          'Clean Scan',
          'No sensitive entities detected under the selected categories and confidence threshold.',
        );
      }
      setActiveTab('highlights');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Privacy scan failed.';
      notify.alert('Scan Failed', msg);
    } finally {
      setIsScanning(false);
    }
  }

  // Run redaction on all detected information
  async function handleRedactAll() {
    if (!inputText.trim()) {
      notify.alert('Input Required', 'Please enter text to redact.');
      return;
    }
    if (isOverLimit) {
      notify.alert(
        'Limit Exceeded',
        `Text exceeds maximum limit of ${MAX_CHAR_LIMIT.toLocaleString()} characters.`,
      );
      return;
    }

    setIsRedacting(true);
    try {
      const result = await redactSensitiveText({
        text: inputText,
        categories: Array.from(selectedCategories),
        strategy,
        customPlaceholder:
          strategy === 'CUSTOM' ? customPlaceholder : undefined,
        minConfidence,
      });
      setRedactResult(result);
      setActiveTab('redacted');
      notify.verified(
        'Redaction Applied',
        `Sanitized ${result.redactionCount} sensitive items in ${result.executionTimeMs}ms.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Redaction failed.';
      notify.alert('Redaction Failed', msg);
    } finally {
      setIsRedacting(false);
    }
  }

  // Copy redacted text to clipboard
  async function handleCopyRedacted() {
    if (!redactResult?.redactedText) return;
    try {
      await navigator.clipboard.writeText(redactResult.redactedText);
      setCopied(true);
      notify.verified('Copied', 'Sanitized text copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.alert('Copy Failed', 'Unable to access clipboard.');
    }
  }

  // Download redacted text as .txt file
  function handleDownloadTxt() {
    if (!redactResult?.redactedText) return;
    try {
      const blob = new Blob([redactResult.redactedText], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `safesignal-redacted-${Date.now()}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      notify.verified(
        'File Downloaded',
        'Sanitized text saved as a plain text file.',
      );
    } catch {
      notify.alert('Download Failed', 'Failed to generate text file download.');
    }
  }

  // Category styling helpers
  function getCategoryHighlightStyle(category: SensitiveCategory) {
    switch (category) {
      case 'EMAIL':
        return {
          badgeClass:
            'bg-amber-100/90 text-amber-950 border border-amber-300 ring-1 ring-amber-400/40',
          tagClass: 'bg-amber-200 text-amber-900',
          label: 'EMAIL',
        };
      case 'PHONE_INDIAN':
        return {
          badgeClass:
            'bg-sky-100/90 text-sky-950 border border-sky-300 ring-1 ring-sky-400/40',
          tagClass: 'bg-sky-200 text-sky-900',
          label: 'PHONE (IN)',
        };
      case 'PHONE_INTERNATIONAL':
        return {
          badgeClass:
            'bg-purple-100/90 text-purple-950 border border-purple-300 ring-1 ring-purple-400/40',
          tagClass: 'bg-purple-200 text-purple-900',
          label: 'PHONE (INTL)',
        };
      case 'ADDRESS':
        return {
          badgeClass:
            'bg-rose-100/90 text-rose-950 border border-rose-300 ring-1 ring-rose-400/40',
          tagClass: 'bg-rose-200 text-rose-900',
          label: 'ADDRESS',
        };
    }
  }

  // Safe Highlighted Text Renderer
  function renderHighlightedText(
    text: string,
    detections: SensitiveDetection[],
  ) {
    if (!text) return null;
    if (!detections || detections.length === 0) {
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
          {text}
        </div>
      );
    }

    // Sort by start position
    const sorted = [...detections].sort((a, b) => a.start - b.start);
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    sorted.forEach((item, index) => {
      // Unflagged preceding text
      if (item.start > lastIndex) {
        elements.push(
          <span key={`plain-${lastIndex}-${index}`} className="text-slate-800">
            {text.slice(lastIndex, item.start)}
          </span>,
        );
      }

      // Safe clamp
      const start = Math.max(lastIndex, item.start);
      const end = Math.min(text.length, item.end);

      if (start < end) {
        const matchText = text.slice(start, end);
        const style = getCategoryHighlightStyle(item.category);

        elements.push(
          <mark
            key={`match-${start}-${end}-${index}`}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs font-medium ${style.badgeClass}`}
            title={`[${item.category}] ${item.detectionType} (${item.confidence} confidence)\nOffset: ${start}..${end}\n${item.explanation}`}
          >
            <span>{matchText}</span>
            <span
              className={`rounded px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider ${style.tagClass}`}
            >
              {style.label}
            </span>
          </mark>,
        );
        lastIndex = end;
      }
    });

    // Trailing unflagged text
    if (lastIndex < text.length) {
      elements.push(
        <span key={`plain-tail-${lastIndex}`} className="text-slate-800">
          {text.slice(lastIndex)}
        </span>,
      );
    }

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text">
        {elements}
      </div>
    );
  }

  return (
    <AppShell
      title="Privacy & Data Protection"
      subtitle="Inspect text for exposed emails, phone numbers, and addresses with deterministic rule verification and configurable masking."
      user={user}
    >
      <div className="space-y-6">
        {/* Header Title & Badges */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Privacy Protection Scanner
              </h1>
              <Badge
                variant="neutral"
                className="gap-1 border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700"
              >
                <Lock className="h-3.5 w-3.5 text-blue-600" />
                Zero-Persistence Scan
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Inspect messages, evidence transcripts, or harassment statements for sensitive personal data before sharing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadSample}
              className="gap-2 text-slate-700"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              Load Sample Text
            </Button>
            {inputText && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="gap-1 text-slate-500 hover:text-slate-800"
              >
                <RotateCcw className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Mandatory User Review & Heuristic Disclaimer Banner */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-xs text-amber-900 shadow-2xs">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="leading-relaxed">
            <span className="font-semibold text-amber-950">
              Mandatory Review Notice:
            </span>{' '}
            Automated detection relies on deterministic regular expressions and address heuristics. It may miss certain sensitive information (false negatives) or flag ordinary text (false positives). Always review both the original and redacted text before submitting to external platforms, grievance officers, or legal entities.
          </div>
        </div>

        {/* Input & Scanner Form Card */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Input Content for Inspection
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Paste text directly or load a plain text file (.txt). Content is processed purely in memory and never stored in the database.
                </CardDescription>
              </div>

              {/* Character Limit and File Indicator */}
              <div className="flex items-center gap-3 text-xs">
                {uploadedFileName && (
                  <Badge variant="neutral" className="gap-1 text-slate-600">
                    <FileText className="h-3 w-3" />
                    {uploadedFileName}
                  </Badge>
                )}
                <span
                  className={`tabular-nums font-mono ${
                    isOverLimit
                      ? 'font-bold text-red-600'
                      : 'text-slate-500'
                  }`}
                >
                  {charCount.toLocaleString()} / {MAX_CHAR_LIMIT.toLocaleString()} chars
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Textarea Input */}
            <div>
              <Textarea
                rows={8}
                placeholder="Paste text, incident drafts, harassment messages, or transcripts here to detect exposed sensitive information..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                error={isOverLimit}
                className="font-mono text-xs leading-relaxed"
              />
              {isOverLimit && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  Content exceeds maximum allowable limit of {MAX_CHAR_LIMIT.toLocaleString()} characters.
                </p>
              )}
            </div>

            {/* Upload or Drop Helper */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".txt,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="privacy-file-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2 text-xs"
                >
                  <Upload className="h-3.5 w-3.5 text-slate-500" />
                  Load .txt file
                </Button>
                <span className="text-[11px] text-slate-400">
                  (Plain text only, max 2MB)
                </span>
              </div>

              {/* Confidence Threshold Selector */}
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Min Confidence:</span>
                <select
                  value={minConfidence}
                  onChange={(e) =>
                    setMinConfidence(e.target.value as ConfidenceLevel)
                  }
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-slate-900 focus:outline-none"
                >
                  <option value="LOW">LOW (Include heuristic patterns)</option>
                  <option value="MEDIUM">MEDIUM (Standard precision)</option>
                  <option value="HIGH">HIGH (Strict matches only)</option>
                </select>
              </div>
            </div>

            {/* Category Filter Checkboxes */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Detection Categories Active:
                </span>
                <span className="text-[11px] text-slate-400">
                  {selectedCategories.size} of {ALL_CATEGORIES.length} selected
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {ALL_CATEGORIES.map((cat) => {
                  const checked = selectedCategories.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`flex flex-col text-left rounded-md border p-2 transition-all cursor-pointer ${
                        checked
                          ? 'border-blue-400 bg-blue-50/50 text-blue-950 shadow-2xs'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">
                          {cat.label}
                        </span>
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            checked
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                      </div>
                      <span className="mt-0.5 text-[10px] leading-tight text-slate-500">
                        {cat.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scan Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-500">
                Original input is strictly preserved and never mutated.
              </div>
              <Button
                type="button"
                onClick={handleScan}
                loading={isScanning}
                disabled={isScanning || !inputText.trim() || isOverLimit}
                className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
              >
                <ScanSearch className="h-4 w-4" />
                Scan for Sensitive Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Scan Results Section */}
        {scanResult && (
          <div className="space-y-4">
            {/* KPI Metrics Summary */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total Detected
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span
                      className={`text-2xl font-bold ${
                        scanResult.totalDetections > 0
                          ? 'text-red-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {scanResult.totalDetections}
                    </span>
                    <span className="text-xs text-slate-400">
                      entities in text
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Emails
                  </div>
                  <div className="mt-1 text-2xl font-bold text-amber-600">
                    {scanResult.categoryBreakdown.EMAIL ?? 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Indian Phones
                  </div>
                  <div className="mt-1 text-2xl font-bold text-sky-600">
                    {scanResult.categoryBreakdown.PHONE_INDIAN ?? 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Int&apos;l Phones
                  </div>
                  <div className="mt-1 text-2xl font-bold text-purple-600">
                    {scanResult.categoryBreakdown.PHONE_INTERNATIONAL ?? 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Addresses
                  </div>
                  <div className="mt-1 text-2xl font-bold text-rose-600">
                    {scanResult.categoryBreakdown.ADDRESS ?? 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Redaction Controls Box */}
            <Card className="border-slate-200 bg-linear-to-r from-slate-50 to-white">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Redaction Configuration
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Choose masking strategy to sanitize detected entities while preserving the original input.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Masking Strategy:
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {STRATEGY_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setStrategy(opt.id)}
                          className={`flex flex-col text-left rounded-lg border p-2.5 transition-all cursor-pointer ${
                            strategy === opt.id
                              ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-2xs'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">
                              {opt.label}
                            </span>
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                strategy === opt.id
                                  ? 'bg-emerald-600 ring-2 ring-emerald-200'
                                  : 'border border-slate-300'
                              }`}
                            />
                          </div>
                          <span className="mt-1 font-mono text-[10px] text-slate-500">
                            {opt.example}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {strategy === 'CUSTOM' && (
                      <div>
                        <label className="text-xs font-medium text-slate-700 block mb-1">
                          Custom Placeholder:
                        </label>
                        <Input
                          value={customPlaceholder}
                          onChange={(e) => setCustomPlaceholder(e.target.value)}
                          placeholder="e.g. [CONFIDENTIAL]"
                          maxLength={50}
                          className="font-mono text-xs"
                        />
                      </div>
                    )}

                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 space-y-2">
                      <div className="font-semibold text-slate-800">
                        Redaction Guarantee
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Redaction operates in memory. Your original input is untouched and can be re-sanitized with another strategy at any time.
                      </p>
                      <Button
                        type="button"
                        onClick={handleRedactAll}
                        loading={isRedacting}
                        disabled={
                          isRedacting || scanResult.totalDetections === 0
                        }
                        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white mt-1"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Redact All Detected Data
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results Navigation Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('highlights')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                    activeTab === 'highlights'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5 text-blue-600" />
                  Highlighted Text ({scanResult.totalDetections})
                </button>

                {redactResult && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('redacted')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                      activeTab === 'redacted'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Redacted Result ({redactResult.redactionCount})
                  </button>
                )}

                {redactResult && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('comparison')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                      activeTab === 'comparison'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5 text-indigo-600" />
                    Side-by-Side Comparison
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                    activeTab === 'audit'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Info className="h-3.5 w-3.5 text-slate-600" />
                  Detection Breakdown
                </button>
              </div>

              {/* Action Buttons for Redacted Preview */}
              {redactResult && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyRedacted}
                    className="gap-1.5 text-xs text-slate-700"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-slate-500" />
                    )}
                    {copied ? 'Copied!' : 'Copy Redacted Text'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTxt}
                    className="gap-1.5 text-xs text-slate-700"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    Download as TXT
                  </Button>
                </div>
              )}
            </div>

            {/* Tab 1: Highlighted Original Text */}
            {activeTab === 'highlights' && (
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold text-slate-900">
                        Highlighted Text with Detected Sensitive Entities
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Each detected entity is rendered with its category tag and position. Hover over any match to inspect detection rationale.
                      </CardDescription>
                    </div>
                    <Badge variant="neutral" className="font-mono text-xs">
                      {scanResult.detections.length} matches flagged
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {renderHighlightedText(inputText, scanResult.detections)}
                </CardContent>
              </Card>
            )}

            {/* Tab 2: Redacted Output Preview */}
            {activeTab === 'redacted' && redactResult && (
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Sanitized Redacted Content
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Ready for safe export. Strategy applied:{' '}
                        <span className="font-semibold text-slate-800">
                          {redactResult.appliedStrategy}
                        </span>{' '}
                        ({redactResult.redactionCount} replacements made)
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCopyRedacted}
                        className="gap-1.5 text-xs bg-slate-900 text-white hover:bg-slate-800"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copied ? 'Copied to Clipboard' : 'Copy Text'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadTxt}
                        className="gap-1.5 text-xs"
                      >
                        <Download className="h-3.5 w-3.5 text-slate-600" />
                        Download .TXT
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/20 p-4 font-mono text-xs leading-relaxed text-slate-900 whitespace-pre-wrap select-text">
                    {redactResult.redactedText}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
                    <div>
                      Original Length: {redactResult.originalLength} chars → Redacted Length: {redactResult.redactedLength} chars
                    </div>
                    <div>
                      Execution time: {redactResult.executionTimeMs}ms
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tab 3: Side-by-Side Comparison */}
            {activeTab === 'comparison' && redactResult && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>Original with Highlights</span>
                      <Badge variant="alert" className="text-[10px]">
                        Unredacted
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderHighlightedText(inputText, scanResult.detections)}
                  </CardContent>
                </Card>

                <Card className="border-emerald-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Redacted Output ({redactResult.appliedStrategy})</span>
                      <Badge variant="verified" className="text-[10px]">
                        Sanitized
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 font-mono text-xs leading-relaxed text-slate-900 whitespace-pre-wrap select-text">
                      {redactResult.redactedText}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 4: Detection Breakdown Table */}
            {activeTab === 'audit' && (
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Detailed Detection Breakdown
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Comprehensive audit log of flagged entities, offset intervals, and pattern rules.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {scanResult.detections.length === 0 ? (
                    <EmptyState
                      title="No sensitive items detected"
                      description="No entities matching the active criteria were identified in the scanned text."
                    />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Matched Entity</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Offsets</TableHead>
                          <TableHead>Detection Type</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Pattern Explanation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scanResult.detections.map((item, idx) => {
                          const style = getCategoryHighlightStyle(item.category);
                          return (
                            <TableRow key={`audit-${idx}`}>
                              <TableCell className="font-mono text-xs font-medium text-slate-900">
                                <span
                                  className={`rounded px-1.5 py-0.5 ${style.badgeClass}`}
                                >
                                  {item.text}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${style.tagClass}`}
                                >
                                  {item.category}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-slate-500 tabular-nums">
                                {item.start}..{item.end}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-slate-600">
                                {item.detectionType}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    item.confidence === 'HIGH'
                                      ? 'verified'
                                      : item.confidence === 'MEDIUM'
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                  className="text-[10px]"
                                >
                                  {item.confidence}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-slate-600">
                                {item.explanation}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
