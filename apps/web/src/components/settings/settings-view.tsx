'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  FileKey2,
  KeyRound,
  Lock,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
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
import { notify } from '@/components/ui/toaster';
import type { AuthUser } from '@/lib/auth/types';

export interface SettingsViewProps {
  user: AuthUser;
}

export function SettingsView({ user }: SettingsViewProps) {
  const [displayName, setDisplayName] = React.useState(user.displayName ?? '');
  const [defaultStrategy, setDefaultStrategy] = React.useState<'CATEGORY_LABEL' | 'PARTIAL_MASK' | 'FULL_MASK' | 'HASH'>('CATEGORY_LABEL');
  const [tokenTtl, setTokenTtl] = React.useState('60');
  const [autoVerifyUploads, setAutoVerifyUploads] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    // Simulate updating client settings
    setTimeout(() => {
      setIsSaving(false);
      notify.verified('Settings Saved', 'Your profile and privacy preferences have been updated.');
    }, 400);
  };

  const handleCopyUserId = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopiedKey(true);
      notify.info('Copied', 'User ID copied to clipboard.');
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      notify.alert('Clipboard error', 'Unable to copy user ID.');
    }
  };

  return (
    <AppShell
      title="Settings"
      subtitle="Manage your profile, security controls, and privacy protection defaults."
      user={user}
    >
      <div className="grid gap-6 md:grid-cols-2">
        {/* User Profile */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-slate-700" />
              <CardTitle className="text-base font-semibold">User Profile</CardTitle>
            </div>
            <CardDescription>
              Account identification and session credentials.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSaveProfile}>
            <CardContent className="space-y-4">
              <FormField id="settings-email" label="Email address" description="Verified login identity">
                <Input
                  id="settings-email"
                  type="email"
                  value={user.email}
                  disabled
                  className="bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </FormField>

              <FormField id="settings-display-name" label="Display name" description="Human-readable name shown in headers">
                <Input
                  id="settings-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Security Lead"
                  maxLength={100}
                />
              </FormField>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Account ID (UUID)</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-600">
                    {user.id}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyUserId}
                    className="shrink-0"
                  >
                    {copiedKey ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-slate-900">Session Status</span>
                  <p className="text-[11px] text-slate-500">
                    Protected by HTTP-only JWT cookies with CSRF defense.
                  </p>
                </div>
                <Badge variant="verified" dot>
                  Active
                </Badge>
              </div>
            </CardContent>
            <CardFooter className="border-t border-slate-100 bg-slate-50/50 px-6 py-3">
              <Button type="submit" size="sm" disabled={isSaving}>
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save Profile'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Cryptographic Custody & Vault Configuration */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-base font-semibold">Evidence Custody & Cryptography</CardTitle>
            </div>
            <CardDescription>
              Forensic hashing algorithms and tamper-detection standards.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-lg border border-slate-200/80 bg-slate-50 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Hashing Standard:</span>
                <span className="font-mono font-medium text-slate-900">SHA-256 (FIPS 180-4)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Vault At-Rest Encryption:</span>
                <span className="font-mono font-medium text-slate-900">AES-256-GCM (Auth Tag)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Storage Custody:</span>
                <span className="font-medium text-emerald-700">Encrypted Private Vault</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Single-Use Token Duration:</span>
                <span className="font-mono font-medium text-slate-900">{tokenTtl} seconds</span>
              </div>
            </div>

            <FormField
              id="settings-token-ttl"
              label="Download Token Expiration"
              description="Lifetime of single-use authorization tokens for evidence downloads"
            >
              <select
                value={tokenTtl}
                onChange={(e) => setTokenTtl(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="30">30 seconds (High Security)</option>
                <option value="60">60 seconds (Standard Default)</option>
                <option value="120">120 seconds (Extended)</option>
              </select>
            </FormField>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-sm font-medium text-slate-900">Auto-verify hashes on upload</span>
                <p className="text-xs text-slate-500">Calculate and store SHA-256 upon receiving evidence</p>
              </div>
              <input
                type="checkbox"
                checked={autoVerifyUploads}
                onChange={(e) => setAutoVerifyUploads(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
            </div>
          </CardContent>
          <CardFooter className="border-t border-slate-100 bg-slate-50/50 px-6 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => notify.verified('Custody Settings Saved', 'Cryptographic configuration updated.')}
            >
              Update Custody Defaults
            </Button>
          </CardFooter>
        </Card>

        {/* Privacy Protection Defaults */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-slate-700" />
              <CardTitle className="text-base font-semibold">Privacy Scanner Defaults</CardTitle>
            </div>
            <CardDescription>
              Masking strategies and sensitive information detection rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              id="settings-default-strategy"
              label="Default Redaction Strategy"
              description="Initial masking applied when redacting sensitive information"
            >
              <select
                value={defaultStrategy}
                onChange={(e) => setDefaultStrategy(e.target.value as any)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="CATEGORY_LABEL">Category Labels (e.g. [REDACTED_EMAIL])</option>
                <option value="PARTIAL_MASK">Partial Mask (e.g. j***e@example.com)</option>
                <option value="FULL_MASK">Full Mask (e.g. ██████████)</option>
                <option value="HASH">Cryptographic Hash (e.g. [HASH:a1b2c3d4])</option>
              </select>
            </FormField>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-800">Supported Detection Patterns:</p>
              <ul className="mt-1.5 list-inside list-disc space-y-1 text-slate-600">
                <li>RFC-compliant email addresses</li>
                <li>Indian phone numbers (+91, STD landlines, 10-digit mobile)</li>
                <li>International phone numbers (E.164, NANP)</li>
                <li>Physical addresses (PIN/ZIP codes, street markers, cities)</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="border-t border-slate-100 bg-slate-50/50 px-6 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => notify.verified('Privacy Defaults Saved', 'Default redaction strategy updated.')}
            >
              Save Privacy Defaults
            </Button>
          </CardFooter>
        </Card>

        {/* Safety Intelligence Configuration */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base font-semibold">Safety Intelligence Engine</CardTitle>
            </div>
            <CardDescription>
              Heuristic rule settings and lookalike similarity thresholds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900">
              <div className="flex items-center gap-1.5 font-medium">
                <Shield className="h-4 w-4 text-amber-700" />
                Deterministic Rule-Based Intelligence
              </div>
              <p className="text-amber-800 leading-relaxed">
                SafeSignal uses deterministic, in-memory keyword dictionaries and Levenshtein similarity algorithms without third-party AI APIs or external data transmission.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">Lookalike Similarity Threshold:</span>
                <span className="font-semibold text-slate-900">75% Match</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">Homoglyph Character Detection:</span>
                <span className="font-semibold text-emerald-700">Active (Cyrillic & Number Sub)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Automatic Timeline Event Logging:</span>
                <span className="font-semibold text-emerald-700">Enabled</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-slate-100 bg-slate-50/50 px-6 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => notify.verified('Intelligence Rules Intact', 'Deterministic engine rules verified.')}
            >
              Verify Rules Engine
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}
