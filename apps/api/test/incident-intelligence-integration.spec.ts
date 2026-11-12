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

describe('Incident & Intelligence Integration Workflow', () => {
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

  async function registerUser(prefix = 'workflow'): Promise<{
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

  it('executes complete workflow: suspicious profile submission -> incident association -> abuse report -> timeline events -> ownership protection -> safe unlinking', async () => {
    const userA = await registerUser('owner-workflow');
    const userB = await registerUser('intruder-workflow');

    // 1. User A declares official baseline account
    const officialRes = await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'brand_official',
        displayName: 'Brand Official Support',
        profileUrl: 'https://x.com/brand_official',
        isPrimary: true,
      })
      .expect(201);
    expect(officialRes.body.data.username).toBe('brand_official');

    // 2. User A reports suspicious profile and chooses to create a new incident on the fly
    const profile1Res = await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'brand_officia1',
        displayName: 'Brand Official Support',
        profileUrl: 'https://x.com/brand_officia1',
        bio: 'Official 24/7 help desk and password resets',
        newIncidentTitle: 'Active Brand Impersonation Campaign',
      })
      .expect(201);

    const profile1 = profile1Res.body.data;
    expect(profile1.username).toBe('brand_officia1');
    expect(profile1.latestAnalysis).toBeDefined();
    expect(profile1.latestAnalysis.overallScore).toBeGreaterThanOrEqual(60);
    expect(profile1.incidents).toHaveLength(1);

    const incidentId = profile1.incidents[0].id;
    expect(profile1.incidents[0].title).toBe('Active Brand Impersonation Campaign');

    // Verify incident was created in PostgreSQL with IMPERSONATION category
    const incAfterCreation = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(incAfterCreation.body.data.title).toBe('Active Brand Impersonation Campaign');
    expect(incAfterCreation.body.data.category).toBe(AbuseCategory.IMPERSONATION);
    expect(incAfterCreation.body.data.suspiciousProfiles).toHaveLength(1);
    expect(incAfterCreation.body.data.suspiciousProfiles[0].id).toBe(profile1.id);
    expect(incAfterCreation.body.data.suspiciousProfiles[0].handle).toBe('brand_officia1');

    // Verify timeline events recorded: INCIDENT_CREATED and PROFILE_LINKED
    const initialEvents = incAfterCreation.body.data.timelineEvents;
    expect(
      initialEvents.some((e: { eventType: string }) => e.eventType === 'INCIDENT_CREATED'),
    ).toBe(true);
    expect(
      initialEvents.some((e: { eventType: string }) => e.eventType === 'PROFILE_LINKED'),
    ).toBe(true);

    // 3. User A files an abuse report directly associated with this incident
    const reportRes = await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        title: 'Phishing DMs sent from copycat account',
        description: 'Impersonator is messaging our followers demanding credentials.',
        category: AbuseCategory.IMPERSONATION,
        platform: Platform.X,
        severity: Severity.HIGH,
        incidentDate: '2026-11-12T10:00:00.000Z',
        incidentId,
      })
      .expect(201);

    const reportId = reportRes.body.data.id;
    expect(reportRes.body.data.incidentId).toBe(incidentId);

    // 3b. User A files a standalone abuse report and links it to the incident
    const report2Res = await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        title: 'Secondary harassment report',
        description: 'Impersonator is leaving threatening comments on customer posts.',
        category: AbuseCategory.HARASSMENT,
        platform: Platform.X,
        severity: Severity.MEDIUM,
        incidentDate: '2026-11-12T11:00:00.000Z',
      })
      .expect(201);

    const report2Id = report2Res.body.data.id;
    expect(report2Res.body.data.incidentId).toBeNull();

    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/reports`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ reportIds: [report2Id] })
      .expect(200);

    // 4. User A reports a second suspicious profile independently (standalone)
    const profile2Res = await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        platform: Platform.INSTAGRAM,
        username: 'brand_helpdesk_bot',
        displayName: 'Brand Helpdesk Assistant',
        profileUrl: 'https://instagram.com/brand_helpdesk_bot',
        bio: 'Customer service agent bot',
      })
      .expect(201);

    const profile2 = profile2Res.body.data;
    expect(profile2.incidents).toEqual([]);

    // Now User A links profile2 to the existing incident via intelligence module
    const linkRes = await request(app.getHttpServer())
      .post(`/api/v1/intelligence/suspicious-profiles/${profile2.id}/incident`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        incidentId,
        notes: 'Secondary bot handle discovered in direct messages',
      })
      .expect(200);

    expect(linkRes.body.data.incidents).toHaveLength(1);
    expect(linkRes.body.data.incidents[0].id).toBe(incidentId);

    // 5. Fetch incident details and verify comprehensive relation display
    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    const incidentDetail = detailRes.body.data;
    expect(incidentDetail.suspiciousProfiles).toHaveLength(2);
    expect(incidentDetail.suspiciousProfileCount).toBe(2);
    expect(incidentDetail.abuseReports).toHaveLength(2);
    expect(incidentDetail.reportCount).toBe(2);

    // Verify all relevant timeline events exist
    const timelineTypes = incidentDetail.timelineEvents.map(
      (e: { eventType: string }) => e.eventType,
    );
    expect(timelineTypes).toContain('INCIDENT_CREATED');
    expect(timelineTypes).toContain('PROFILE_LINKED');
    expect(timelineTypes).toContain('ABUSE_REPORT_CREATED');
    expect(timelineTypes).toContain('ABUSE_REPORT_LINKED');

    // 6. Ownership protection: User B cannot access or link User A resources
    // User B creates their own incident
    const userBIncRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({
        title: 'User B private incident',
        category: AbuseCategory.HARASSMENT,
        severity: Severity.LOW,
      })
      .expect(201);
    const userBIncidentId = userBIncRes.body.data.id;

    // User B attempts to link User A's suspicious profile to User B incident -> 403
    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${userBIncidentId}/profiles`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ profileIds: [profile1.id] })
      .expect(403);

    // User B attempts to link User A's abuse report to User B incident -> 403
    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${userBIncidentId}/reports`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ reportIds: [reportId] })
      .expect(403);

    // User B attempts to link User B's profile to User A's incident -> 403
    const userBProfileRes = await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'user_b_sus',
        profileUrl: 'https://x.com/user_b_sus',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/intelligence/suspicious-profiles/${userBProfileRes.body.data.id}/incident`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ incidentId })
      .expect(403);

    // User B attempts to inspect User A's incident -> 403
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(403);

    // 7. Removing associations without deleting original records
    // User A unlinks profile2 from the incident
    const unlinkProfileRes = await request(app.getHttpServer())
      .delete(`/api/v1/intelligence/suspicious-profiles/${profile2.id}/incident/${incidentId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(unlinkProfileRes.body.data.incidents).toEqual([]);

    // Verify profile2 STILL exists in database
    const verifyProfile2 = await request(app.getHttpServer())
      .get(`/api/v1/intelligence/suspicious-profiles/${profile2.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(verifyProfile2.body.data.id).toBe(profile2.id);

    // User A unlinks both abuse reports from the incident
    await request(app.getHttpServer())
      .delete(`/api/v1/incidents/${incidentId}/reports/${reportId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/incidents/${incidentId}/reports/${report2Id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    // Verify both reports STILL exist in database with incidentId null
    const verifyReport = await request(app.getHttpServer())
      .get(`/api/v1/abuse/reports/${reportId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(verifyReport.body.data.id).toBe(reportId);
    expect(verifyReport.body.data.incidentId).toBeNull();

    const verifyReport2 = await request(app.getHttpServer())
      .get(`/api/v1/abuse/reports/${report2Id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(verifyReport2.body.data.id).toBe(report2Id);
    expect(verifyReport2.body.data.incidentId).toBeNull();

    // Verify incident detail now reflects the removals and audit events
    const finalDetailRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(finalDetailRes.body.data.suspiciousProfiles).toHaveLength(1);
    expect(finalDetailRes.body.data.suspiciousProfiles[0].id).toBe(profile1.id);
    expect(finalDetailRes.body.data.abuseReports).toHaveLength(0);

    const finalEvents = finalDetailRes.body.data.timelineEvents.map(
      (e: { eventType: string }) => e.eventType,
    );
    expect(finalEvents).toContain('PROFILE_UNLINKED');
    expect(finalEvents).toContain('ABUSE_REPORT_UNLINKED');
  });
});
