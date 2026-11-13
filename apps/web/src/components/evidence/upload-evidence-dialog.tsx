'use client';

import * as React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileCheck,
  FileCode,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  UploadCloud,
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
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/components/ui/toaster';
import { uploadEvidence } from '@/lib/evidence/client-evidence';
import {
  ALLOWED_EVIDENCE_EXTENSIONS,
  formatBytes,
  getFileFormatCategory,
  MAX_EVIDENCE_SIZE_BYTES,
  MAX_EVIDENCE_SIZE_MB,
  type EvidenceRecord,
} from '@/lib/evidence/types';

interface IncidentOption {
  id: string;
  title: string;
}

interface UploadEvidenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newEvidence: EvidenceRecord) => void;
  preselectedIncidentId?: string;
  incidents?: IncidentOption[];
}

export function UploadEvidenceDialog({
  isOpen,
  onClose,
  onSuccess,
  preselectedIncidentId,
  incidents = [],
}: UploadEvidenceDialogProps) {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [incidentId, setIncidentId] = React.useState<string>(
    preselectedIncidentId ?? (incidents[0]?.id || ''),
  );
  const [title, setTitle] = React.useState<string>('');
  const [description, setDescription] = React.useState<string>('');
  const [sourceUrl, setSourceUrl] = React.useState<string>('');
  const [capturedAt, setCapturedAt] = React.useState<string>('');
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = React.useState<string>('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (preselectedIncidentId) {
      setIncidentId(preselectedIncidentId);
    } else if (!incidentId && incidents.length > 0) {
      setIncidentId(incidents[0].id);
    }
  }, [preselectedIncidentId, incidents, incidentId]);

  if (!isOpen) return null;

  function validateAndSelectFile(file: File) {
    setErrorMsg(null);
    const lowerName = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EVIDENCE_EXTENSIONS.some((ext) =>
      lowerName.endsWith(ext),
    );

    if (!hasValidExt) {
      setErrorMsg(
        `Unsupported file type "${file.name}". Please upload a PNG, JPG, PDF, TXT, or DOCX document.`,
      );
      return;
    }

    if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
      setErrorMsg(
        `File size exceeds limit (${formatBytes(file.size)}). Maximum allowed size is ${MAX_EVIDENCE_SIZE_MB}MB.`,
      );
      return;
    }

    if (file.size === 0) {
      setErrorMsg('The selected file is empty (0 bytes).');
      return;
    }

    setSelectedFile(file);
    if (!title) {
      // Auto-populate title from clean filename
      const defaultTitle = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      setTitle(defaultTitle);
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSelectFile(file);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSelectFile(file);
    }
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedFile) {
      setErrorMsg('Please select an evidence file to upload.');
      return;
    }

    if (!incidentId) {
      setErrorMsg('Please select or specify an incident to link this evidence.');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(5);
    setUploadStatusText('Initializing secure upload...');

    try {
      const record = await uploadEvidence(
        {
          file: selectedFile,
          incidentId,
          title: title.trim() || selectedFile.name,
          description: description.trim() || undefined,
          sourceUrl: sourceUrl.trim() || undefined,
          capturedAt: capturedAt || undefined,
        },
        (progress, status) => {
          setUploadProgress(progress);
          setUploadStatusText(status);
        },
      );

      setUploadProgress(100);
      setUploadStatusText('Evidence secured in private vault!');

      notify.verified(
        'Evidence vaulted securely',
        `File "${record.fileName}" has been fingerprinted (SHA-256) and safely encrypted.`,
      );

      setTimeout(() => {
        onSuccess(record);
        onClose();
      }, 500);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to upload evidence file to vault.';
      setErrorMsg(msg);
      notify.alert('Vault upload failed', msg);
      setUploadProgress(null);
      setUploadStatusText('');
    } finally {
      setIsSubmitting(false);
    }
  }

  const detectedFormat = selectedFile
    ? getFileFormatCategory(selectedFile.name, selectedFile.type)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <Card className="max-h-[92vh] w-full max-w-xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-lg font-bold text-slate-900">
                Upload Evidence to Vault
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Files are hashed with SHA-256 upon arrival and stored in private
              vault storage outside the web directory.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* DRAG & DROP FILE ZONE */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Evidence File <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  Max size: {MAX_EVIDENCE_SIZE_MB}MB
                </span>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/70 scale-[1.01]'
                    : selectedFile
                      ? 'border-emerald-300 bg-emerald-50/30'
                      : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-100/60 cursor-pointer'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,.txt,.docx"
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={isSubmitting}
                />

                {selectedFile ? (
                  <div className="flex w-full items-center justify-between gap-4">
                    <div className="flex items-center gap-3 truncate">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-100 text-emerald-700">
                        {detectedFormat === 'PNG' || detectedFormat === 'JPG' ? (
                          <ImageIcon className="h-5 w-5" />
                        ) : detectedFormat === 'PDF' ? (
                          <FileText className="h-5 w-5" />
                        ) : (
                          <FileCode className="h-5 w-5" />
                        )}
                      </div>
                      <div className="text-left truncate">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {selectedFile.name}
                          </p>
                          <Badge
                            variant="neutral"
                            className="text-[10px] font-bold py-0 px-1.5"
                          >
                            {detectedFormat}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatBytes(selectedFile.size)} • Ready for custody sealing
                        </p>
                      </div>
                    </div>

                    {!isSubmitting && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveFile}
                        className="h-8 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50"
                        title="Remove file"
                      >
                        Change
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                        isDragging
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <p className="mt-2.5 text-sm font-semibold text-slate-800">
                      Drag & drop your evidence file here, or{' '}
                      <span className="text-blue-600 underline">browse</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Supports PNG, JPG, PDF, TXT, and DOCX documents
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* REAL-TIME UPLOAD PROGRESS BAR */}
            {isSubmitting && uploadProgress !== null && (
              <div className="space-y-1.5 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    <span className="truncate">{uploadStatusText}</span>
                  </div>
                  <span className="font-mono">{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200/80">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* INCIDENT ASSOCIATION SELECTOR */}
            {preselectedIncidentId ? (
              <input type="hidden" value={preselectedIncidentId} />
            ) : (
              <FormField
                id="evidence-incident"
                label="Associated Incident Case"
                description="Link this evidence to an active safety case for correlation and custody tracking"
                required
              >
                {incidents.length > 0 ? (
                  <select
                    id="evidence-incident"
                    value={incidentId}
                    onChange={(e) => setIncidentId(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    required
                  >
                    {incidents.map((inc) => (
                      <option key={inc.id} value={inc.id}>
                        {inc.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                    <p className="font-semibold">No incidents found</p>
                    <p className="mt-0.5">
                      Please enter a target Incident UUID below or create an incident first.
                    </p>
                    <Input
                      id="evidence-incident"
                      placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                      value={incidentId}
                      onChange={(e) => setIncidentId(e.target.value)}
                      disabled={isSubmitting}
                      className="mt-2 bg-white"
                      required
                    />
                  </div>
                )}
              </FormField>
            )}

            {/* TITLE */}
            <FormField
              id="evidence-title"
              label="Evidence Title / Label"
              description="A clear human-readable title for audit records and legal discovery"
            >
              <Input
                id="evidence-title"
                placeholder="e.g., Harassment DM Screenshot, Defamation Thread Export"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                disabled={isSubmitting}
              />
            </FormField>

            {/* DESCRIPTION */}
            <FormField
              id="evidence-desc"
              label="Description & Custody Notes"
              description="Document context, account handles, chat platform, or preservation details"
            >
              <Textarea
                id="evidence-desc"
                placeholder="Captured from victim's direct inbox on X / Twitter following persistent threats..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={500}
                disabled={isSubmitting}
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* SOURCE URL */}
              <FormField
                id="evidence-url"
                label="Source URL"
                description="Link to original post, profile, or web page"
              >
                <Input
                  id="evidence-url"
                  placeholder="https://..."
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  type="url"
                  disabled={isSubmitting}
                />
              </FormField>

              {/* CAPTURED AT */}
              <FormField
                id="evidence-captured"
                label="Date of Incident / Capture"
                description="When the incident or screenshot occurred"
              >
                <Input
                  id="evidence-captured"
                  type="datetime-local"
                  value={capturedAt}
                  onChange={(e) => setCapturedAt(e.target.value)}
                  disabled={isSubmitting}
                />
              </FormField>
            </div>

            {/* PRIVACY & SECURITY ASSURANCE */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Safe Custody Guarantee:</strong> Evidence is never rendered
                  as raw untrusted HTML or stored in public web paths. Technical metadata
                  is extracted safely with precise GPS coordinates redacted for privacy.
                </p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedFile || !incidentId}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Securing Evidence...
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" />
                  Upload & Seal Evidence
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
