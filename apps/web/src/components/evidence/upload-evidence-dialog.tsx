'use client';

import * as React from 'react';
import {
  AlertCircle,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react';
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
        `Unsupported file type. Please upload a PNG, JPG, PDF, TXT, or DOCX document.`,
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
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
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
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSelectFile(file);
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
    try {
      const record = await uploadEvidence({
        file: selectedFile,
        incidentId,
        title: title.trim() || selectedFile.name,
        description: description.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        capturedAt: capturedAt || undefined,
      });

      notify.verified(
        'Evidence vaulted securely',
        `File "${record.fileName}" has been verified and stored in the Evidence Vault.`,
      );
      onSuccess(record);
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to upload evidence file to vault.';
      setErrorMsg(msg);
      notify.alert('Vault upload failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <CardTitle className="text-lg font-bold text-slate-900">
              Upload Vault Evidence
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Files are cryptographically hashed (SHA-256) and stored in private vault storage.
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

            {/* Drag & Drop File Zone */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Evidence Document / Image <span className="text-red-500">*</span>
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/50'
                    : selectedFile
                      ? 'border-emerald-300 bg-emerald-50/30'
                      : 'border-slate-300 bg-slate-50/50 hover:bg-slate-100/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,.txt,.docx"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <FileCheck className="h-6 w-6" />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(selectedFile.size)} • Click or drop another to replace
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      Click to browse or drag and drop file here
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      PNG, JPG, PDF, TXT, DOCX (Max {MAX_EVIDENCE_SIZE_MB}MB)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Incident Selection */}
            {preselectedIncidentId ? (
              <input type="hidden" value={preselectedIncidentId} />
            ) : (
              <FormField id="evidence-incident" label="Associated Incident" required>
                {incidents.length > 0 ? (
                  <select
                    id="evidence-incident"
                    value={incidentId}
                    onChange={(e) => setIncidentId(e.target.value)}
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
                  <Input
                    id="evidence-incident"
                    placeholder="Enter Incident UUID"
                    value={incidentId}
                    onChange={(e) => setIncidentId(e.target.value)}
                    required
                  />
                )}
              </FormField>
            )}

            {/* Title */}
            <FormField
              id="evidence-title"
              label="Evidence Title / Label"
              description="Descriptive name for audit and legal records"
            >
              <Input
                id="evidence-title"
                placeholder="e.g., Harassment DM Screenshot, Defamation Thread Export"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </FormField>

            {/* Description */}
            <FormField
              id="evidence-desc"
              label="Description / Context"
              description="Describe where, when, and how this evidence was collected"
            >
              <Textarea
                id="evidence-desc"
                placeholder="Provide contextual details, timestamps or relevant background notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Source URL */}
              <FormField id="evidence-url" label="Source URL" description="Optional web link">
                <Input
                  id="evidence-url"
                  placeholder="https://..."
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  type="url"
                />
              </FormField>

              {/* Captured At */}
              <FormField
                id="evidence-captured"
                label="Date Captured"
                description="Original timestamp of capture"
              >
                <Input
                  id="evidence-captured"
                  type="datetime-local"
                  value={capturedAt}
                  onChange={(e) => setCapturedAt(e.target.value)}
                />
              </FormField>
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
                  Storing & Verifying...
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" />
                  Vault Evidence
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
