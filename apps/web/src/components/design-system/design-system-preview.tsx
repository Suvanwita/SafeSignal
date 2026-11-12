'use client';

import * as React from 'react';
import {
  AlertTriangle,
  FileCheck2,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { BRAND_NAME, BRAND_TAGLINE } from '@/components/layout/navigation.config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  MetricCard,
} from '@/components/ui/card';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { LoadingState, TableSkeleton } from '@/components/ui/loading-state';
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

const SAMPLE_SIGNALS = [
  {
    id: 'SIG-1042',
    subject: '@safesignal_helpdesk (Impersonation)',
    platform: 'X',
    severity: 'critical' as const,
    status: 'escalated' as const,
    updated: '4 mins ago',
  },
  {
    id: 'SIG-1041',
    subject: 'Official Domain Verification',
    platform: 'Website',
    severity: 'low' as const,
    status: 'verified' as const,
    updated: '22 mins ago',
  },
  {
    id: 'SIG-1039',
    subject: 'Phishing DM Campaign Capture',
    platform: 'Telegram',
    severity: 'high' as const,
    status: 'in_review' as const,
    updated: '1 hr ago',
  },
  {
    id: 'SIG-1034',
    subject: 'Duplicate Handle Takedown',
    platform: 'Instagram',
    severity: 'medium' as const,
    status: 'resolved' as const,
    updated: 'Yesterday',
  },
];

export function DesignSystemPreview() {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [viewState, setViewState] = React.useState<'table' | 'loading' | 'empty'>(
    'table',
  );
  const [handleInput, setHandleInput] = React.useState('');
  const [inputError, setInputError] = React.useState<string | undefined>();

  function handleValidateForm(event: React.FormEvent) {
    event.preventDefault();
    if (!handleInput.trim()) {
      setInputError('Account handle or URL is required.');
      notify.alert('Validation failed', 'Provide a target handle to continue.');
      return;
    }
    setInputError(undefined);
    notify.verified(
      'Signal draft validated',
      `Target "${handleInput.trim()}" is ready for evidence capture.`,
    );
    setModalOpen(false);
    setHandleInput('');
  }

  return (
    <AppShell
      title="Design System & Workspace Shell"
      subtitle={`${BRAND_NAME} — ${BRAND_TAGLINE}`}
      alertCount={2}
      topBarActions={
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New Signal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register Protected Target</DialogTitle>
              <DialogDescription>
                Dialog primitive demonstrating accessible form controls and
                validation states.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleValidateForm} className="space-y-4">
              <FormField
                id="modal-handle"
                label="Account Handle or URL"
                required
                error={inputError}
                description="Normalized lowercase handle used for impersonation checks."
              >
                <Input
                  id="modal-handle"
                  placeholder="@safesignal_official"
                  value={handleInput}
                  error={Boolean(inputError)}
                  onChange={(e) => {
                    setHandleInput(e.target.value);
                    if (inputError) setInputError(undefined);
                  }}
                />
              </FormField>
              <FormField id="modal-notes" label="Context Notes">
                <Textarea
                  id="modal-notes"
                  placeholder="Optional verification or threat context..."
                />
              </FormField>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Validate &amp; Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <section aria-label="Brand Banner">
        <Card className="border-slate-200 bg-white">
          <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="dark">{BRAND_NAME} UI v1</Badge>
                <Badge variant="verified" dot>
                  System Operational
                </Badge>
                <Badge variant="alert" dot>
                  2 Escalated Alerts
                </Badge>
              </div>
              <h2 className="pt-1 text-lg font-semibold tracking-tight text-slate-900">
                {BRAND_TAGLINE}
              </h2>
              <p className="text-sm text-slate-500">
                Foundational cybersecurity workspace components built with
                Next.js App Router, Tailwind CSS, and shadcn/ui primitives.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="verified"
                size="sm"
                onClick={() =>
                  notify.verified(
                    'Checksum verified',
                    'SHA-256 custody hash matches local vault record.',
                  )
                }
              >
                <ShieldCheck className="h-4 w-4" />
                Verified Toast
              </Button>
              <Button
                variant="alertOutline"
                size="sm"
                onClick={() => setConfirmOpen(true)}
              >
                <AlertTriangle className="h-4 w-4" />
                Confirm Alert Modal
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section
        aria-label="Key Security Metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Verified Identities"
          value="12"
          detail="All official channels cryptographically linked"
          tone="verified"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <MetricCard
          label="Active Safety Alerts"
          value="2"
          detail="High-priority impersonation signals"
          tone="alert"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <MetricCard
          label="Preserved Evidence"
          value="48"
          detail="SHA-256 hashed artifacts in private vault"
          icon={<FileCheck2 className="h-4 w-4" />}
        />
        <MetricCard
          label="Intelligence Checks"
          value="99.4%"
          detail="Automated similarity & risk scoring confidence"
          tone="verified"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </section>

      <section
        aria-label="Controls and Form Primitives"
        className="grid gap-6 lg:grid-cols-3"
      >
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Signal Activity Table</CardTitle>
              <CardDescription>
                Tabular status badges alongside loading and empty state
                patterns.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={viewState === 'table' ? 'default' : 'outline'}
                onClick={() => setViewState('table')}
              >
                Data
              </Button>
              <Button
                size="sm"
                variant={viewState === 'loading' ? 'default' : 'outline'}
                onClick={() => setViewState('loading')}
              >
                Loading
              </Button>
              <Button
                size="sm"
                variant={viewState === 'empty' ? 'default' : 'outline'}
                onClick={() => setViewState('empty')}
              >
                Empty
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {viewState === 'table' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Signal ID</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SAMPLE_SIGNALS.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs font-medium text-slate-900">
                        {row.id}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {row.subject}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.platform}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.severity} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-500">
                        {row.updated}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {viewState === 'loading' && (
              <div className="space-y-4">
                <TableSkeleton rows={3} columns={4} />
                <LoadingState label="Synchronizing encrypted incident feed..." />
              </div>
            )}

            {viewState === 'empty' && (
              <EmptyState
                title="No matching signals"
                description="When new impersonation, abuse, or evidence records are logged, they will appear here with chain-of-custody status."
                action={
                  <Button size="sm" onClick={() => setViewState('table')}>
                    Restore Sample Feed
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inputs &amp; Action Tokens</CardTitle>
            <CardDescription>
              Consistent focus rings, error states, and button hierarchy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              id="demo-email"
              label="Account Email"
              required
              description="Used for security notifications and audit trails."
            >
              <Input
                id="demo-email"
                type="email"
                placeholder="security@organization.org"
              />
            </FormField>

            <FormField
              id="demo-error"
              label="Verification URL"
              error="Must use HTTPS for verified evidence capture."
            >
              <Input
                id="demo-error"
                type="url"
                defaultValue="http://unverified.example"
                error
              />
            </FormField>

            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-slate-500 uppercase">
                Button Variants
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Primary</Button>
                <Button size="sm" variant="secondary">
                  Secondary
                </Button>
                <Button size="sm" variant="outline">
                  Outline
                </Button>
                <Button size="sm" variant="ghost">
                  Ghost
                </Button>
                <Button size="sm" variant="destructive">
                  Alert
                </Button>
                <Button size="sm" loading>
                  Saving
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-xs text-slate-500">
            <span>Status badges</span>
            <div className="flex items-center gap-1.5">
              <StatusBadge status="verified" />
              <StatusBadge status="escalated" />
            </div>
          </CardFooter>
        </Card>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Escalate Safety Alert?"
        description="Escalating notifies designated reviewers and locks the current evidence snapshot for accountability reporting."
        confirmLabel="Escalate Alert"
        variant="destructive"
        onConfirm={() => {
          setConfirmOpen(false);
          notify.alert(
            'Alert escalated',
            'Safety escalation confirmation triggered.',
          );
        }}
      />
    </AppShell>
  );
}
