import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { AbuseDetailView } from '@/components/abuse/abuse-detail-view';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  getServerAbuseReportById,
  getServerIncidents,
} from '@/lib/abuse/server-abuse';
import { requireServerSession } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

interface AbuseReportDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AbuseReportDetailPage({
  params,
}: AbuseReportDetailPageProps) {
  const { id } = await params;
  const user = await requireServerSession(`/abuse/${encodeURIComponent(id)}`);
  const [{ report, status }, incidents] = await Promise.all([
    getServerAbuseReportById(id),
    getServerIncidents(),
  ]);

  if (!report) {
    const errorTitle =
      status === 403
        ? 'Access restricted'
        : status === 404
          ? 'Abuse report not found'
          : 'Abuse report temporarily unavailable';
    const errorDescription =
      status === 403
        ? 'You do not have permission to view this abuse report.'
        : status === 404
          ? 'This abuse report does not exist or may have been removed.'
          : 'We could not load this report right now. Please try again from your report history.';

    return (
      <AppShell
        title="Abuse report unavailable"
        subtitle={errorDescription}
        user={user}
        topBarActions={
          <Button asChild variant="outline" size="sm">
            <Link href="/abuse">
              <ArrowLeft className="h-4 w-4" />
              Back to report history
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
              <Link href="/abuse">Return to Abuse Reports</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/abuse/new">Submit new report</Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AbuseDetailView
      user={user}
      initialReport={report}
      incidents={incidents}
    />
  );
}
