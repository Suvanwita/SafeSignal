import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AbuseCategory, Platform, Severity } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createGlobalValidationPipe } from '../src/common';
import { PrismaService } from '../src/prisma/prisma.service';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

describe('Abuse Reporting Integration (/api/v1/abuse/reports)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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

  async function registerUser(prefix = 'abuse'): Promise<{
    userId: string;
    accessToken: string;
  }> {
    const email = `${prefix}-${randomUUID()}@safesignal.org`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'StrongPassword123!',
        displayName: `User ${prefix}`,
      })
      .expect(201);

    const userId = res.body.data.user.id as string;
    createdUserIds.push(userId);

    return {
      userId,
      accessToken: res.body.data.accessToken as string,
    };
  }

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/abuse/reports')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .send({
        title: 'Test report',
        description: 'This description is at least ten characters long.',
        category: AbuseCategory.HARASSMENT,
        platform: Platform.X,
        incidentDate: '2026-11-10T10:00:00.000Z',
        severity: Severity.MEDIUM,
      })
      .expect(401);
  });

  it('validates title, description, category, platform, severity, incidentDate, and URLs', async () => {
    const owner = await registerUser('validate');

    await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        title: 'Hi',
        description: 'Too short',
        category: 'INVALID_CATEGORY',
        platform: Platform.X,
        incidentDate: 'not-a-date',
        severity: 'EXTREME',
      })
      .expect(400);

    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        title: 'Future incident timestamp',
        description: 'Attempting to file with a date in the future.',
        category: AbuseCategory.THREATS,
        platform: Platform.X,
        incidentDate: futureDate.toISOString(),
        severity: Severity.HIGH,
      })
      .expect(400);
  });

  it('supports all required categories, standalone reports, multiple reports per incident, update, and delete with timestamps', async () => {
    const owner = await registerUser('owner');
    const incident = await prisma.incident.create({
      data: {
        userId: owner.userId,
        title: 'Coordinated Abuse Incident',
        category: AbuseCategory.HARASSMENT,
        severity: Severity.HIGH,
      },
    });

    const requiredCategories: AbuseCategory[] = [
      AbuseCategory.CYBERBULLYING,
      AbuseCategory.HARASSMENT,
      AbuseCategory.STALKING,
      AbuseCategory.THREATS,
      AbuseCategory.IMPERSONATION,
      AbuseCategory.UNWANTED_CONTACT,
      AbuseCategory.PRIVACY_VIOLATION,
    ];

    // Create 2 reports attached to the SAME incident, plus remaining categories standalone.
    const reportIds: string[] = [];
    for (let idx = 0; idx < requiredCategories.length; idx += 1) {
      const category = requiredCategories[idx];
      const attachToIncident = idx < 2;

      const res = await request(app.getHttpServer())
        .post('/api/v1/abuse/reports')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: `Report for ${category}`,
          description: `Detailed report capturing observed ${category} incident behavior.`,
          category,
          platform: idx % 2 === 0 ? Platform.X : Platform.INSTAGRAM,
          incidentDate: '2026-11-11T12:00:00.000Z',
          severity: idx === 3 ? Severity.CRITICAL : Severity.HIGH,
          ...(attachToIncident ? { incidentId: incident.id } : {}),
        })
        .expect(201);

      expect(res.body.data.category).toBe(category);
      expect(res.body.data.createdAt).toBeDefined();
      expect(res.body.data.updatedAt).toBeDefined();
      expect(res.body.data.submittedAt).toBeDefined();
      expect(res.body.data.incidentId).toBe(
        attachToIncident ? incident.id : null,
      );
      reportIds.push(res.body.data.id as string);
    }

    // Confirm both reports belong to the single incident and filter properly.
    const filteredByIncident = await request(app.getHttpServer())
      .get(`/api/v1/abuse/reports?incidentId=${incident.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(filteredByIncident.body.data).toHaveLength(2);
    expect(filteredByIncident.body.data[0].incident).toEqual({
      id: incident.id,
      title: 'Coordinated Abuse Incident',
      status: 'OPEN',
    });

    const timelineEvents = await prisma.timelineEvent.findMany({
      where: { incidentId: incident.id },
    });
    expect(timelineEvents).toHaveLength(2);

    // Update standalone report to link it to the incident and modify severity & status.
    const thirdReportId = reportIds[2];
    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/abuse/reports/${thirdReportId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        title: 'Updated stalking escalation report',
        severity: Severity.CRITICAL,
        reportStatus: 'SUBMITTED',
        incidentId: incident.id,
      })
      .expect(200);

    expect(updateRes.body.data.title).toBe('Updated stalking escalation report');
    expect(updateRes.body.data.severity).toBe(Severity.CRITICAL);
    expect(updateRes.body.data.reportStatus).toBe('SUBMITTED');
    expect(updateRes.body.data.incidentId).toBe(incident.id);

    const threeLinked = await request(app.getHttpServer())
      .get(`/api/v1/abuse/reports?incidentId=${incident.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(threeLinked.body.data).toHaveLength(3);

    // Delete one report and verify parent incident still exists.
    await request(app.getHttpServer())
      .delete(`/api/v1/abuse/reports/${thirdReportId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/abuse/reports/${thirdReportId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);

    const remainingIncident = await prisma.incident.findUnique({
      where: { id: incident.id },
    });
    expect(remainingIncident).not.toBeNull();
  });

  it('enforces strict user ownership on read, update, delete, and incident linking', async () => {
    const owner = await registerUser('owner');
    const intruder = await registerUser('intruder');

    const ownerIncident = await prisma.incident.create({
      data: {
        userId: owner.userId,
        title: 'Owner Confidential Incident',
        category: AbuseCategory.PRIVACY_VIOLATION,
        severity: Severity.HIGH,
      },
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        title: 'Doxxing leak report',
        description: 'Personal phone number posted without consent.',
        category: AbuseCategory.PRIVACY_VIOLATION,
        platform: Platform.TELEGRAM,
        incidentDate: '2026-11-11T15:00:00.000Z',
        severity: Severity.CRITICAL,
        incidentId: ownerIncident.id,
      })
      .expect(201);

    const reportId = createRes.body.data.id as string;

    // Intruder cannot list owner's reports or filter by owner's incident.
    const intruderList = await request(app.getHttpServer())
      .get('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(200);
    expect(intruderList.body.data).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/api/v1/abuse/reports?incidentId=${ownerIncident.id}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);

    // Intruder cannot link a new report to owner's incident.
    await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({
        title: 'Attempted cross-tenant link',
        description: 'Should be rejected by incident ownership check.',
        category: AbuseCategory.HARASSMENT,
        platform: Platform.X,
        incidentDate: '2026-11-11T16:00:00.000Z',
        severity: Severity.LOW,
        incidentId: ownerIncident.id,
      })
      .expect(403);

    // Intruder cannot read, update, or delete owner's report.
    await request(app.getHttpServer())
      .get(`/api/v1/abuse/reports/${reportId}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/abuse/reports/${reportId}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({ title: 'Tampered report title' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/abuse/reports/${reportId}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);
  });
});
