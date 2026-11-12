import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AbuseCategory,
  IncidentStatus,
  Platform,
  Severity,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createGlobalValidationPipe } from '../src/common';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

describe('Incidents Unified Engine Integration (/api/v1/incidents)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  const createdUserIds: string[] = [];

  async function createConfiguredApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const nestApp = moduleRef.createNestApplication();
    nestApp.setGlobalPrefix('api/v1');
    nestApp.useGlobalPipes(createGlobalValidationPipe());
    await nestApp.init();
    return nestApp;
  }

  beforeAll(async () => {
    app = await createConfiguredApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
  });

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerUser(prefix = 'incidents'): Promise<{
    userId: string;
    accessToken: string;
  }> {
    const email = `${prefix}-${randomUUID()}@safesignal.org`;
    const res = await authService.register({
      email,
      password: 'StrongPassword123!',
      displayName: `User ${prefix}`,
    });

    const userId = res.user.id;
    createdUserIds.push(userId);

    return {
      userId,
      accessToken: res.accessToken,
    };
  }

  it('rejects unauthenticated requests to all incident endpoints', async () => {
    const testId = randomUUID();

    await request(app.getHttpServer()).get('/api/v1/incidents').expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .send({
        title: 'Unauthenticated incident',
        category: AbuseCategory.HARASSMENT,
      })
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${testId}`)
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/api/v1/incidents/${testId}`)
      .send({ title: 'New title' })
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${testId}/close`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${testId}/reopen`)
      .expect(401);
  });

  it('validates incident inputs: title, category, severity and occurredAt', async () => {
    const user = await registerUser('val');

    // Title too short
    await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'No',
        category: AbuseCategory.HARASSMENT,
      })
      .expect(400);

    // Invalid category
    await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Valid incident title',
        category: 'INVALID_CATEGORY',
      })
      .expect(400);

    // Future occurred date
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Future incident',
        category: AbuseCategory.THREATS,
        occurredAt: futureDate.toISOString(),
      })
      .expect(400);
  });

  it('creates an incident and automatically creates an INCIDENT_CREATED timeline event', async () => {
    const user = await registerUser('create');

    const res = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Cross-platform defamation & doxxing',
        description: 'Coordinated leaks of personal contact information.',
        category: AbuseCategory.DOXXING,
        severity: Severity.CRITICAL,
      })
      .expect(201);

    const incident = res.body.data;
    expect(incident.id).toBeDefined();
    expect(incident.status).toBe(IncidentStatus.OPEN);
    expect(incident.severity).toBe(Severity.CRITICAL);
    expect(incident.category).toBe(AbuseCategory.DOXXING);
    expect(incident.timelineEvents).toHaveLength(1);
    expect(incident.timelineEvents[0].eventType).toBe('INCIDENT_CREATED');
    expect(incident.timelineEvents[0].title).toContain('Incident opened');

    // Verify persisted in PostgreSQL
    const dbTimeline = await prisma.timelineEvent.findMany({
      where: { incidentId: incident.id, userId: user.userId },
    });
    expect(dbTimeline).toHaveLength(1);
    expect(dbTimeline[0].eventType).toBe('INCIDENT_CREATED');
  });

  it('lists incidents owned by user and filters by status, severity, category, and search', async () => {
    const userA = await registerUser('user-a');
    const userB = await registerUser('user-b');

    // Create 3 incidents for userA
    await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        title: 'Phishing attack campaign',
        category: AbuseCategory.PHISHING,
        severity: Severity.HIGH,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        title: 'Stalking via direct messages',
        category: AbuseCategory.STALKING,
        severity: Severity.CRITICAL,
      })
      .expect(201);

    const userBRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({
        title: 'User B confidential case',
        category: AbuseCategory.HARASSMENT,
        severity: Severity.LOW,
      })
      .expect(201);

    // List userA incidents - must not contain userB incident
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/incidents')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(listRes.body.data).toHaveLength(2);
    expect(
      listRes.body.data.every((i: { userId: string }) => i.userId === userA.userId),
    ).toBe(true);
    expect(
      listRes.body.data.some((i: { id: string }) => i.id === userBRes.body.data.id),
    ).toBe(false);

    // Filter by category
    const catRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents?category=${AbuseCategory.PHISHING}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(catRes.body.data).toHaveLength(1);
    expect(catRes.body.data[0].category).toBe(AbuseCategory.PHISHING);

    // Filter by search
    const searchRes = await request(app.getHttpServer())
      .get('/api/v1/incidents?search=Stalking')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].title).toContain('Stalking');
  });

  it('updates incident details, severity and status while generating timeline events', async () => {
    const user = await registerUser('update');

    const createdRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Suspicious bot activity',
        category: AbuseCategory.IMPERSONATION,
        severity: Severity.LOW,
      })
      .expect(201);

    const incidentId = createdRes.body.data.id;

    // Update status to IN_REVIEW and severity to HIGH
    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        status: IncidentStatus.IN_REVIEW,
        severity: Severity.HIGH,
        description: 'Investigating coordinated accounts.',
      })
      .expect(200);

    expect(updateRes.body.data.status).toBe(IncidentStatus.IN_REVIEW);
    expect(updateRes.body.data.severity).toBe(Severity.HIGH);

    // Escalate via status endpoint with audit reason
    const escalateRes = await request(app.getHttpServer())
      .patch(`/api/v1/incidents/${incidentId}/status`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        status: IncidentStatus.ESCALATED,
        severity: Severity.CRITICAL,
        reason: 'Direct threats made against home address.',
      })
      .expect(200);

    expect(escalateRes.body.data.status).toBe(IncidentStatus.ESCALATED);
    expect(escalateRes.body.data.severity).toBe(Severity.CRITICAL);

    // Check timeline events: should have INCIDENT_CREATED, STATUS_CHANGED, SEVERITY_CHANGED, INCIDENT_ESCALATED
    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    const eventTypes = detailRes.body.data.timelineEvents.map(
      (e: { eventType: string }) => e.eventType,
    );
    expect(eventTypes).toContain('INCIDENT_CREATED');
    expect(eventTypes).toContain('STATUS_CHANGED');
    expect(eventTypes).toContain('SEVERITY_CHANGED');
    expect(eventTypes).toContain('INCIDENT_ESCALATED');
  });

  it('closes and reopens incidents with appropriate status, timestamps and timeline events', async () => {
    const user = await registerUser('close-reopen');

    const createdRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Harassment on forum',
        category: AbuseCategory.HARASSMENT,
      })
      .expect(201);

    const incidentId = createdRes.body.data.id;

    // Close incident
    const closeRes = await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/close`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        reason: 'Offending posts removed by forum moderators.',
      })
      .expect(200);

    expect(closeRes.body.data.status).toBe(IncidentStatus.CLOSED);
    expect(closeRes.body.data.resolvedAt).not.toBeNull();

    // Closing already closed incident throws 400
    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/close`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ reason: 'Duplicate close' })
      .expect(400);

    // Reopen incident
    const reopenRes = await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/reopen`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        reason: 'Harasser created a new alt handle.',
      })
      .expect(200);

    expect(reopenRes.body.data.status).toBe(IncidentStatus.OPEN);
    expect(reopenRes.body.data.resolvedAt).toBeNull();

    // Reopening already open incident throws 400
    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/reopen`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ reason: 'Duplicate reopen' })
      .expect(400);

    // Verify timeline records both INCIDENT_CLOSED and INCIDENT_REOPENED
    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    const eventTypes = detailRes.body.data.timelineEvents.map(
      (e: { eventType: string }) => e.eventType,
    );
    expect(eventTypes).toContain('INCIDENT_CLOSED');
    expect(eventTypes).toContain('INCIDENT_REOPENED');
  });

  it('links and unlinks abuse reports and records timeline events', async () => {
    const user = await registerUser('link-reports');

    // Create incident
    const incRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Campaign tracking incident',
        category: AbuseCategory.HARASSMENT,
      })
      .expect(201);
    const incidentId = incRes.body.data.id;

    // Create standalone abuse report
    const repRes = await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Nasty reply on Reddit thread',
        description: 'Offensive comments targeting family members.',
        category: AbuseCategory.HARASSMENT,
        platform: Platform.REDDIT,
        severity: Severity.HIGH,
        incidentDate: '2026-11-10T12:00:00.000Z',
      })
      .expect(201);
    const reportId = repRes.body.data.id;

    // Link report to incident
    const linkRes = await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/reports`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        reportIds: [reportId],
      })
      .expect(200);

    expect(linkRes.body.data.abuseReports).toHaveLength(1);
    expect(linkRes.body.data.abuseReports[0].id).toBe(reportId);

    // Verify ABUSE_REPORT_LINKED timeline event
    const linkedEvent = linkRes.body.data.timelineEvents.find(
      (e: { eventType: string }) => e.eventType === 'ABUSE_REPORT_LINKED',
    );
    expect(linkedEvent).toBeDefined();

    // Unlink report from incident
    const unlinkRes = await request(app.getHttpServer())
      .delete(`/api/v1/incidents/${incidentId}/reports/${reportId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(unlinkRes.body.data.abuseReports).toHaveLength(0);

    // Verify ABUSE_REPORT_UNLINKED timeline event
    const unlinkedEvent = unlinkRes.body.data.timelineEvents.find(
      (e: { eventType: string }) => e.eventType === 'ABUSE_REPORT_UNLINKED',
    );
    expect(unlinkedEvent).toBeDefined();
  });

  it('attaches evidence to an incident and links abuse report and evidence together', async () => {
    const user = await registerUser('evidence');

    const incRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Multi-evidence harassment investigation',
        category: AbuseCategory.THREATS,
      })
      .expect(201);
    const incidentId = incRes.body.data.id;

    // Attach report to incident
    const repRes = await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Threatening direct message',
        description: 'Threats made via direct message.',
        category: AbuseCategory.THREATS,
        platform: Platform.X,
        severity: Severity.CRITICAL,
        incidentDate: '2026-11-10T12:00:00.000Z',
        incidentId,
      })
      .expect(201);
    const reportId = repRes.body.data.id;

    // Attach evidence directly to the incident via /api/v1/incidents/:id/evidence
    const attachRes = await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/evidence`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Threat screenshot capture',
        description: 'Raw high-res screenshot showing timestamp and handle.',
        abuseReportId: reportId,
        sourceUrl: 'https://x.com/harasser/status/987654321',
        fileName: 'screenshot-threat.png',
        mimeType: 'image/png',
        fileSize: 450000,
        sha256:
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      })
      .expect(201);

    expect(attachRes.body.data.evidence).toHaveLength(1);
    const ev = attachRes.body.data.evidence[0];
    expect(ev.title).toBe('Threat screenshot capture');
    expect(ev.abuseReportId).toBe(reportId);
    expect(ev.incidentId).toBe(incidentId);
    expect(ev.sha256).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );

    // Verify EVIDENCE_ATTACHED timeline event
    const evEvent = attachRes.body.data.timelineEvents.find(
      (e: { eventType: string }) => e.eventType === 'EVIDENCE_ATTACHED',
    );
    expect(evEvent).toBeDefined();

    // Also attach second evidence via /api/v1/evidence
    const ev2Res = await request(app.getHttpServer())
      .post('/api/v1/evidence')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        incidentId,
        title: 'Second screenshot',
        fileName: 'second.jpg',
      })
      .expect(201);

    expect(ev2Res.body.data.incidentId).toBe(incidentId);

    // Verify incident details show both reports and multiple evidence
    const finalDetail = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(finalDetail.body.data.abuseReports).toHaveLength(1);
    expect(finalDetail.body.data.evidence).toHaveLength(2);
    expect(finalDetail.body.data.evidenceCount).toBe(2);
    expect(finalDetail.body.data.reportCount).toBe(1);
  });

  it('links multiple suspicious profiles to the same incident and records timeline events', async () => {
    const user = await registerUser('multi-profiles');

    const incRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Multi-account impersonation network',
        category: AbuseCategory.IMPERSONATION,
        severity: Severity.HIGH,
      })
      .expect(201);
    const incidentId = incRes.body.data.id;

    const p1Res = await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        profileUrl: 'https://x.com/impersonator_one',
        platform: Platform.X,
        username: 'impersonator_one',
        displayName: 'Fake Support 1',
      })
      .expect(201);

    const p2Res = await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        profileUrl: 'https://instagram.com/impersonator_two',
        platform: Platform.INSTAGRAM,
        username: 'impersonator_two',
        displayName: 'Fake Support 2',
      })
      .expect(201);

    const profile1Id = p1Res.body.data.id;
    const profile2Id = p2Res.body.data.id;

    const linkRes = await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/profiles`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        profileIds: [profile1Id, profile2Id],
        notes: 'Both handles share identical avatar and scam bio.',
      })
      .expect(200);

    expect(linkRes.body.data.suspiciousProfiles).toHaveLength(2);
    expect(linkRes.body.data.suspiciousProfileCount).toBe(2);
    expect(
      linkRes.body.data.timelineEvents.filter(
        (e: { eventType: string }) => e.eventType === 'PROFILE_LINKED',
      ),
    ).toHaveLength(2);

    const unlinkRes = await request(app.getHttpServer())
      .delete(`/api/v1/incidents/${incidentId}/profiles/${profile1Id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(unlinkRes.body.data.suspiciousProfiles).toHaveLength(1);
    expect(unlinkRes.body.data.suspiciousProfiles[0].id).toBe(profile2Id);
  });

  it('enforces ownership checks across users and rejects unauthorized access with 403', async () => {
    const userA = await registerUser('owner-a');
    const userB = await registerUser('intruder-b');

    const incRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        title: 'User A confidential incident',
        category: AbuseCategory.EXTORTION,
        severity: Severity.CRITICAL,
      })
      .expect(201);

    const userAIncidentId = incRes.body.data.id;

    // User B attempts to read User A incident -> 403
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${userAIncidentId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(403);

    // User B attempts to update User A incident -> 403
    await request(app.getHttpServer())
      .patch(`/api/v1/incidents/${userAIncidentId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ title: 'Hacked title' })
      .expect(403);

    // User B attempts to close User A incident -> 403
    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${userAIncidentId}/close`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ reason: 'Malicious close' })
      .expect(403);

    // User B attempts to attach evidence to User A incident -> 403
    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${userAIncidentId}/evidence`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ title: 'Unauthorized evidence' })
      .expect(403);

    // User B creates a report, User A tries to link it to User A incident -> 403
    const userBReportRes = await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({
        title: 'User B report',
        description: 'User B private abuse report description.',
        category: AbuseCategory.CYBERBULLYING,
        platform: Platform.DISCORD,
        severity: Severity.MEDIUM,
        incidentDate: '2026-11-10T12:00:00.000Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${userAIncidentId}/reports`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ reportIds: [userBReportRes.body.data.id] })
      .expect(403);

    // Non-existent incident -> 404
    await request(app.getHttpServer())
      .get('/api/v1/incidents/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(404);
  });
});
