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

describe('Comprehensive Chronological Incident Timeline (/api/v1/incidents/:id/timeline)', () => {
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

  async function registerUser(prefix = 'timeline'): Promise<{
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

  it('records chronological timeline events for full incident lifecycle and supports pagination', async () => {
    const user = await registerUser('timeline-full');

    const clientPastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const beforeCreateTime = new Date(Date.now() - 5000);

    // 1. INCIDENT CREATED
    const incidentRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Comprehensive Stalking & Harassment Case',
        category: AbuseCategory.HARASSMENT,
        severity: Severity.HIGH,
        description: 'Perpetrator is sending repeated threats across multiple channels.',
        occurredAt: clientPastDate,
      })
      .expect(201);

    const incidentId = incidentRes.body.data.id;
    expect(incidentId).toBeDefined();

    // Verify database timestamp: the system timeline event occurredAt must be >= beforeCreateTime (database timestamp, not clientPastDate)
    const initialTimeline = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/timeline`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    const initialEvents = initialTimeline.body.data.events;
    expect(initialEvents).toHaveLength(1);
    expect(initialEvents[0].eventType).toBe('INCIDENT_CREATED');
    const createdEventOccurred = new Date(initialEvents[0].occurredAt);
    expect(createdEventOccurred.getTime()).toBeGreaterThanOrEqual(beforeCreateTime.getTime());

    // 2. ABUSE REPORT SUBMITTED
    const reportRes = await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Direct Harassment on Discord',
        description: 'User sent threatening messages to flat 402 demanding payment.',
        category: AbuseCategory.HARASSMENT,
        platform: Platform.DISCORD,
        severity: Severity.HIGH,
        incidentDate: new Date(Date.now() - 3600 * 1000).toISOString(),
        incidentId,
      })
      .expect(201);

    const reportId = reportRes.body.data.id;
    expect(reportId).toBeDefined();

    // 3. SUSPICIOUS PROFILE ASSOCIATED
    const profileRes = await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'malicious_stalker_99',
        profileUrl: 'https://x.com/malicious_stalker_99',
        displayName: 'Impersonator',
        incidentId,
      })
      .expect(201);

    expect(profileRes.body.data.id).toBeDefined();

    // 4. EVIDENCE UPLOADED
    const dummyFileContent = Buffer.from(
      'Case evidence transcript:\nThreatening message: I will find you at your home and leak your files.',
    );

    const evidenceRes = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Discord Threat Chat Log')
      .field('description', 'Exported text chat transcript containing direct threats.')
      .attach('file', dummyFileContent, 'discord_chat_log.txt')
      .expect(201);

    const evidenceId = evidenceRes.body.data.id;
    expect(evidenceId).toBeDefined();

    // 5. EVIDENCE INTEGRITY VERIFIED
    const verifyRes = await request(app.getHttpServer())
      .post(`/api/v1/evidence/${evidenceId}/verify`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(verifyRes.body.data.status).toBe('VERIFIED');

    // 6. PRIVACY SCAN COMPLETED
    await request(app.getHttpServer())
      .post('/api/v1/privacy/scan')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        text: 'Contact john.victim@safesignal.org or call +91 98765 43210. Address: Flat 402, Bangalore.',
        incidentId,
      })
      .expect(200);

    // Also test scan-incident route
    await request(app.getHttpServer())
      .post(`/api/v1/privacy/scan-incident/${incidentId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    // 7. SAFETY ANALYSIS COMPLETED
    await request(app.getHttpServer())
      .post(`/api/v1/intelligence/safety/analyze-incident/${incidentId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    // 8. INCIDENT STATUS CHANGED
    await request(app.getHttpServer())
      .patch(`/api/v1/incidents/${incidentId}/status`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        status: IncidentStatus.IN_REVIEW,
        reason: 'Investigator reviewing evidence and threat vectors.',
      })
      .expect(200);

    // 9. INCIDENT CLOSED OR REOPENED
    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/close`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        reason: 'Case resolved and archived after reporting perpetrator account.',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/reopen`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        reason: 'Perpetrator created a new handle, reopening case.',
      })
      .expect(200);

    // VERIFY ALL TIMELINE EVENTS EXIST
    const fullTimelineRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/timeline?limit=50&order=asc`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    const events = fullTimelineRes.body.data.events;
    const eventTypes = events.map((e: any) => e.eventType);

    expect(eventTypes).toContain('INCIDENT_CREATED');
    expect(eventTypes).toContain('ABUSE_REPORT_CREATED');
    expect(eventTypes).toContain('PROFILE_LINKED');
    expect(eventTypes).toContain('EVIDENCE_ATTACHED');
    expect(eventTypes).toContain('EVIDENCE_VERIFIED');
    expect(eventTypes).toContain('PRIVACY_SCAN_COMPLETED');
    expect(eventTypes).toContain('SAFETY_ANALYSIS_COMPLETED');
    expect(eventTypes).toContain('STATUS_CHANGED');
    expect(eventTypes).toContain('INCIDENT_CLOSED');
    expect(eventTypes).toContain('INCIDENT_REOPENED');

    // VERIFY RESOURCE REFERENCES
    const evidenceAttachedEvent = events.find((e: any) => e.eventType === 'EVIDENCE_ATTACHED');
    expect(evidenceAttachedEvent.metadata.evidenceId).toBe(evidenceId);
    expect(evidenceAttachedEvent.metadata.fileName).toBe('discord_chat_log.txt');

    const verifiedEvent = events.find((e: any) => e.eventType === 'EVIDENCE_VERIFIED');
    expect(verifiedEvent.metadata.status).toBe('VERIFIED');
    expect(verifiedEvent.metadata.evidenceId).toBe(evidenceId);

    const safetyEvent = events.find((e: any) => e.eventType === 'SAFETY_ANALYSIS_COMPLETED');
    expect(safetyEvent.metadata.riskLevel).toBeDefined();

    const privacyEvent = events.find((e: any) => e.eventType === 'PRIVACY_SCAN_COMPLETED');
    expect(privacyEvent.metadata.hasSensitiveData).toBe(true);

    // VERIFY CHRONOLOGICAL ORDERING
    // 1. Ascending order (oldest first)
    const ascTimes = events.map((e: any) => new Date(e.occurredAt).getTime());
    for (let i = 1; i < ascTimes.length; i++) {
      expect(ascTimes[i]).toBeGreaterThanOrEqual(ascTimes[i - 1]);
    }

    // 2. Descending order (newest first)
    const descTimelineRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/timeline?limit=50&order=desc`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    const descEvents = descTimelineRes.body.data.events;
    const descTimes = descEvents.map((e: any) => new Date(e.occurredAt).getTime());
    for (let i = 1; i < descTimes.length; i++) {
      expect(descTimes[i]).toBeLessThanOrEqual(descTimes[i - 1]);
    }

    // VERIFY PAGINATION
    const page1Res = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/timeline?page=1&limit=4`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(page1Res.body.data.events).toHaveLength(4);
    expect(page1Res.body.data.pagination).toMatchObject({
      page: 1,
      limit: 4,
      total: expect.any(Number),
      totalPages: expect.any(Number),
      hasMore: true,
    });
    expect(page1Res.body.data.pagination.total).toBeGreaterThanOrEqual(10);

    const page2Res = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/timeline?page=2&limit=4`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(page2Res.body.data.events).toHaveLength(4);
    expect(page2Res.body.data.pagination.page).toBe(2);
    // Page 1 and Page 2 should have distinct events
    expect(page1Res.body.data.events[0].id).not.toBe(page2Res.body.data.events[0].id);

    // VERIFY IMMUTABILITY: Ordinary users cannot edit or delete historical events
    const firstEventId = events[0].id;

    await request(app.getHttpServer())
      .patch(`/api/v1/incidents/${incidentId}/timeline/${firstEventId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Tampered title' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/incidents/${incidentId}/timeline/${firstEventId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);

    // VERIFY IDOR RESTRICTION: Another user cannot view this incident's timeline
    const otherUser = await registerUser('timeline-other');

    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/timeline`)
      .set('Authorization', `Bearer ${otherUser.accessToken}`)
      .expect(403);
  });
});
