import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { IncidentDetailView } from '@/components/incidents/incident-detail-view';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getServerAbuseReports } from '@/lib/abuse/server-abuse';
import { requireServerSession } from '@/lib/auth/server-api';
import { getServerIncidentById } from '@/lib/incidents/server-incidents';
import { getServerSuspiciousProfiles } from '@/lib/intelligence/server-intelligence';

export const dynamic = 'force-dynamic';

interface IncidentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function IncidentDetailPage({
  params,
}: IncidentDetailPageProps) {
  const { id } = await params;
  const user = await requireServerSession(`/incidents/${encodeURIComponent(id)}`);

  const [{ incident, status }, reports, profiles] = await Promise.all([
    getServerIncidentById(id),
    getServerAbuseReports(),
    getServerSuspiciousProfiles(),
  ]);

  if (!incident) {
    const errorTitle =
      status === 403
        ? 'Access restricted'
        : status === 404
          ? 'Incident case not found'
          : 'Incident temporarily unavailable';
    const errorDescription =
      status === 403
        ? 'You do not have permission to view this safety incident.'
        : status === 404
          ? 'This incident case does not exist or may have been removed.'
          : 'We could not load this incident right now. Please try again from your incidents list.';

    return (
      <AppShell
        title="Incident unavailable"
        subtitle={errorDescription}
        user={user}
        topBarActions={
          <Button asChild variant="outline" size="sm">
            <Link href="/incidents">
              <ArrowLeft className="h-4 w-4" />
              Back to incidents
            </Link>
          </Button>
        }
      >
        <Card className="mx-auto max-w-2xl border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-700">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{errorTitle}</CardTitle>
                <CardDescription>{errorDescription}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button asChild variant="default" size="sm">
              <Link href="/incidents">Return to Incidents</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Return to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <IncidentDetailView
      user={user}
      initialIncident={incident}
      availableReports={reports ?? []}
      availableProfiles={profiles ?? []}
    />
  );
}
