import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Platform } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createGlobalValidationPipe } from '../src/common';
import { PrismaService } from '../src/prisma/prisma.service';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

describe('Identity Integration (/api/v1/identity/accounts)', () => {
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

  async function registerUser(prefix = 'identity'): Promise<{
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
      .get('/api/v1/identity/accounts')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .send({ platform: Platform.X, username: 'alice' })
      .expect(401);
  });

  it('validates platform enum and HTTP(S) profile URLs', async () => {
    const owner = await registerUser('validate');

    const badPlatformRes = await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: 'MYSPACE',
        username: 'alice',
        profileUrl: 'https://example.com/alice',
      })
      .expect(400);

    expect(badPlatformRes.body.error.code).toBe('VALIDATION_ERROR');

    const badUrlRes = await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'alice',
        profileUrl: 'javascript:alert(1)',
      })
      .expect(400);

    expect(badUrlRes.body.error.code).toBe('VALIDATION_ERROR');

    const missingProtocolRes = await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'alice',
        profileUrl: 'x.com/alice',
      })
      .expect(400);

    expect(missingProtocolRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates, lists, updates, promotes primary, and deletes user-declared accounts with verified=false', async () => {
    const owner = await registerUser('crud');

    const firstRes = await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.X,
        username: '@SafeSignalHQ',
        profileUrl: 'https://x.com/SafeSignalHQ',
        displayName: 'SafeSignal HQ',
        notes: 'Primary announcement handle',
        isPrimary: true,
      })
      .expect(201);

    expect(firstRes.body.success).toBe(true);
    expect(firstRes.body.data.username).toBe('SafeSignalHQ');
    expect(firstRes.body.data.isPrimary).toBe(true);
    expect(firstRes.body.data.declarationStatus).toBe('USER_DECLARED');
    expect(firstRes.body.data.verified).toBeUndefined();

    const firstDbRecord = await prisma.officialAccount.findUnique({
      where: { id: firstRes.body.data.id },
    });
    expect(firstDbRecord?.verified).toBe(false);
    expect(firstDbRecord?.isPrimary).toBe(true);

    // Duplicate handle case-insensitively on same platform is rejected.
    await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.X,
        username: 'safesignalhq',
      })
      .expect(409);

    const secondRes = await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.INSTAGRAM,
        username: 'safesignal.official',
        profileUrl: 'https://instagram.com/safesignal.official',
        displayName: 'SafeSignal IG',
      })
      .expect(201);

    expect(secondRes.body.data.isPrimary).toBe(false);

    // Promote second account to primary and verify exclusivity.
    const promoteRes = await request(app.getHttpServer())
      .patch(`/api/v1/identity/accounts/${secondRes.body.data.id}/primary`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(promoteRes.body.data.isPrimary).toBe(true);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(listRes.body.data).toHaveLength(2);
    expect(listRes.body.data[0].id).toBe(secondRes.body.data.id);
    expect(listRes.body.data[0].isPrimary).toBe(true);
    expect(listRes.body.data[1].id).toBe(firstRes.body.data.id);
    expect(listRes.body.data[1].isPrimary).toBe(false);

    // Edit display name and clear notes.
    const editRes = await request(app.getHttpServer())
      .patch(`/api/v1/identity/accounts/${firstRes.body.data.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        displayName: 'SafeSignal Newsroom',
        notes: null,
      })
      .expect(200);

    expect(editRes.body.data.displayName).toBe('SafeSignal Newsroom');
    expect(editRes.body.data.notes).toBeNull();

    // Delete first account.
    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/identity/accounts/${firstRes.body.data.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(deleteRes.body.data).toEqual({
      deleted: true,
      id: firstRes.body.data.id,
    });

    const remainingList = await request(app.getHttpServer())
      .get('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(remainingList.body.data).toHaveLength(1);
    expect(remainingList.body.data[0].id).toBe(secondRes.body.data.id);
  });

  it('enforces strict user ownership across read, update, primary, and delete', async () => {
    const owner = await registerUser('owner');
    const intruder = await registerUser('intruder');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        platform: Platform.YOUTUBE,
        username: 'SafeSignalChannel',
        profileUrl: 'https://youtube.com/@SafeSignalChannel',
      })
      .expect(201);

    const accountId = createRes.body.data.id as string;

    const intruderList = await request(app.getHttpServer())
      .get('/api/v1/identity/accounts')
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(200);
    expect(intruderList.body.data).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/api/v1/identity/accounts/${accountId}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/identity/accounts/${accountId}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({ displayName: 'Hijacked' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/identity/accounts/${accountId}/primary`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/identity/accounts/${accountId}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);
  });
});
