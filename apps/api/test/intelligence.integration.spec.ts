import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AnalysisType,
  Platform,
  SuspiciousProfileStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createGlobalValidationPipe } from '../src/common';
import { PrismaService } from '../src/prisma/prisma.service';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

describe('Intelligence Integration (/api/v1/intelligence/suspicious-profiles)', () => {
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

  async function registerUser(prefix = 'intel'): Promise<{
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

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/intelligence/suspicious-profiles')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .send({
        platform: Platform.X,
        username: 'lookalike',
        profileUrl: 'https://x.com/lookalike',
      })
      .expect(401);
  });

  it('validates profile URL, optional profileImageUrl, platform, and username', async () => {
    const owner = await registerUser('validate');

    await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'lookalike',
        profileUrl: 'not-a-valid-url',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'lookalike',
        profileUrl: 'https://x.com/lookalike',
        profileImageUrl: 'ftp://invalid.example.org/img.png',
      })
      .expect(400);
  });

  it('stores suspicious profiles and explainable similarity analyses in PostgreSQL, supports re-analysis, manual review updates, and ownership isolation', async () => {
    const owner = await registerUser('owner');
    const intruder = await registerUser('intruder');

    // Register a user-declared official account first.
    const officialRes = await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'safesignal_hq',
        displayName: 'SafeSignal Official',
        profileUrl: 'https://x.com/safesignal_hq',
        notes: 'Official security updates and community helpdesk',
        isPrimary: true,
      })
      .expect(201);

    const officialId = officialRes.body.data.id as string;

    // Submit suspicious profile mimicking the official account.
    const submitRes = await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.X,
        username: '@safes1gnal_hq_support',
        displayName: 'SafeSignal Official Support',
        profileUrl: 'https://x.com/safes1gnal_hq_support',
        bio: 'Official customer helpdesk for SafeSignal (@safesignal_hq). DM for security assistance.',
        profileImageUrl: 'https://cdn.example.org/avatars/impostor.jpg',
      })
      .expect(201);

    const created = submitRes.body.data;
    expect(created.username).toBe('safes1gnal_hq_support');
    expect(created.reviewStatus).toBe(SuspiciousProfileStatus.PENDING_REVIEW);
    expect(created.profileImageUrl).toBe(
      'https://cdn.example.org/avatars/impostor.jpg',
    );
    expect(created.latestAnalysis).not.toBeNull();
    expect(created.latestAnalysis.overallScore).toBeGreaterThanOrEqual(70);
    expect(created.latestAnalysis.level).toBe('HIGH_SIMILARITY');
    expect(created.latestAnalysis.matchedOfficialAccountId).toBe(officialId);
    expect(created.latestAnalysis.disclaimer).toContain('not proof');

    const bestMatch = created.latestAnalysis.bestMatch;
    expect(bestMatch.dimensions.username.score).toBeGreaterThanOrEqual(80);
    expect(bestMatch.dimensions.displayName.score).toBeGreaterThanOrEqual(65);
    expect(bestMatch.dimensions.bio.score).toBeGreaterThanOrEqual(65);
    expect(bestMatch.dimensions.profileUrl.score).toBeGreaterThanOrEqual(70);

    // Verify database persistence directly.
    const dbAnalyses = await prisma.analysis.findMany({
      where: { suspiciousProfileId: created.id },
    });
    expect(dbAnalyses).toHaveLength(1);
    expect(dbAnalyses[0]?.type).toBe(AnalysisType.SIMILARITY_CHECK);
    expect(dbAnalyses[0]?.incidentId).toBeNull();

    // Manually update review status.
    const statusRes = await request(app.getHttpServer())
      .patch(
        `/api/v1/intelligence/suspicious-profiles/${created.id}/status`,
      )
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        reviewStatus: SuspiciousProfileStatus.UNDER_REVIEW,
        notes: 'Assigned for manual review; awaiting user verification.',
      })
      .expect(200);

    expect(statusRes.body.data.reviewStatus).toBe(
      SuspiciousProfileStatus.UNDER_REVIEW,
    );
    expect(statusRes.body.data.reviewedAt).not.toBeNull();
    expect(statusRes.body.data.notes).toBe(
      'Assigned for manual review; awaiting user verification.',
    );

    // Re-run similarity analysis and verify new Analysis row appended.
    await request(app.getHttpServer())
      .post(
        `/api/v1/intelligence/suspicious-profiles/${created.id}/analyze`,
      )
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/intelligence/suspicious-profiles/${created.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(detailRes.body.data.analyses).toHaveLength(2);

    // Ownership isolation for intruder user.
    const intruderList = await request(app.getHttpServer())
      .get('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(200);
    expect(intruderList.body.data).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/api/v1/intelligence/suspicious-profiles/${created.id}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(
        `/api/v1/intelligence/suspicious-profiles/${created.id}/status`,
      )
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({ reviewStatus: SuspiciousProfileStatus.DISMISSED })
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `/api/v1/intelligence/suspicious-profiles/${created.id}/analyze`,
      )
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/intelligence/suspicious-profiles/${created.id}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);

    // Owner deletes profile.
    await request(app.getHttpServer())
      .delete(`/api/v1/intelligence/suspicious-profiles/${created.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const remainingAnalyses = await prisma.analysis.findMany({
      where: { suspiciousProfileId: created.id },
    });
    expect(remainingAnalyses).toHaveLength(0);
  });
});
