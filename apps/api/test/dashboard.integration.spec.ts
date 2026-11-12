import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createGlobalValidationPipe } from '../src/common';
import { PrismaService } from '../src/prisma/prisma.service';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

describe('Dashboard Integration (/api/v1/dashboard)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    await app.init();
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

  it('rejects unauthenticated requests to /api/v1/dashboard', async () => {
    await request(app.getHttpServer()).get('/api/v1/dashboard').expect(401);
  });

  it('returns user-scoped statistics, recent incidents, and recent activity without cross-user leakage', async () => {
    const emailA = `dash-a-${randomUUID()}@safesignal.org`;
    const emailB = `dash-b-${randomUUID()}@safesignal.org`;

    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailA, password: 'StrongPassword123!' })
      .expect(201);
    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailB, password: 'StrongPassword123!' })
      .expect(201);

    const userIdA = regA.body.data.user.id as string;
    const tokenA = regA.body.data.accessToken as string;
    const userIdB = regB.body.data.user.id as string;
    const tokenB = regB.body.data.accessToken as string;
    createdUserIds.push(userIdA, userIdB);

    const profileA = await prisma.suspiciousProfile.create({
      data: {
        userId: userIdA,
        platform: 'X',
        handle: '@impersonator_a',
      },
    });

    const incidentA = await prisma.incident.create({
      data: {
        userId: userIdA,
        suspiciousProfileId: profileA.id,
        title: 'Phishing handle on X',
        status: 'ESCALATED',
        severity: 'HIGH',
        category: 'IMPERSONATION',
      },
    });

    await prisma.evidence.create({
      data: {
        userId: userIdA,
        incidentId: incidentA.id,
        title: 'Profile screenshot',
      },
    });

    await prisma.timelineEvent.create({
      data: {
        userId: userIdA,
        incidentId: incidentA.id,
        eventType: 'INCIDENT_CREATED',
        title: 'Incident logged for @impersonator_a',
      },
    });

    const dashARes = await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(dashARes.body.success).toBe(true);
    expect(dashARes.body.data.summary).toEqual({
      totalIncidents: 1,
      openIncidents: 1,
      escalatedIncidents: 1,
      evidenceRecords: 1,
      suspiciousProfiles: 1,
      officialAccounts: 0,
    });
    expect(dashARes.body.data.recentIncidents).toHaveLength(1);
    expect(dashARes.body.data.recentActivity).toHaveLength(1);
    expect(dashARes.body.data.recommendations.length).toBeGreaterThan(0);

    // User B remains isolated with empty counts
    const dashBRes = await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(dashBRes.body.data.summary).toEqual({
      totalIncidents: 0,
      openIncidents: 0,
      escalatedIncidents: 0,
      evidenceRecords: 0,
      suspiciousProfiles: 0,
      officialAccounts: 0,
    });
    expect(dashBRes.body.data.recentIncidents).toEqual([]);
    expect(dashBRes.body.data.recentActivity).toEqual([]);
  });
});
