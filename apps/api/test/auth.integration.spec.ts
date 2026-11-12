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

describe('Auth Integration (/api/v1/auth)', () => {
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

  function uniqueEmail(prefix = 'auth'): string {
    return `${prefix}-${randomUUID()}@safesignal.org`;
  }

  it('rejects invalid email and weak password on registration', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'not-an-email',
        password: 'weak',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('registers a user, stores Argon2id hash, never returns passwordHash, and prevents duplicates', async () => {
    const email = uniqueEmail('register');

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `  ${email.toUpperCase()}  `,
        password: 'StrongPassword123!',
        displayName: 'Grace Hopper',
      })
      .expect(201);

    expect(registerRes.body.success).toBe(true);
    expect(registerRes.body.data.accessToken).toEqual(expect.any(String));
    expect(registerRes.body.data.tokenType).toBe('Bearer');
    expect(registerRes.body.data.user.email).toBe(email);
    expect(registerRes.body.data.user.displayName).toBe('Grace Hopper');
    expect(registerRes.body.data.user.passwordHash).toBeUndefined();

    createdUserIds.push(registerRes.body.data.user.id);

    const dbUser = await prisma.user.findUnique({
      where: { id: registerRes.body.data.user.id },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.passwordHash).toMatch(/^\$argon2id\$/);

    const duplicateRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: email.toUpperCase(),
        password: 'StrongPassword123!',
      })
      .expect(409);

    expect(duplicateRes.body.success).toBe(false);
    expect(duplicateRes.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('logs in with valid credentials, rejects invalid credentials safely, fetches /me, and revokes session on logout', async () => {
    const email = uniqueEmail('session');
    const password = 'StrongPassword123!';

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, displayName: 'Ada' })
      .expect(201);

    createdUserIds.push(regRes.body.data.user.id);

    // Unauthenticated /me is blocked
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

    // Malformed / invalid token is rejected
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token')
      .expect(401);

    // Wrong password and unknown email return identical generic error
    const wrongPassRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassword123!' })
      .expect(401);

    const unknownEmailRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('unknown'), password: 'WrongPassword123!' })
      .expect(401);

    expect(wrongPassRes.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmailRes.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassRes.body.error.message).toBe(
      unknownEmailRes.body.error.message,
    );

    // Valid login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const token = loginRes.body.data.accessToken as string;
    expect(loginRes.body.data.user.passwordHash).toBeUndefined();

    // Authenticated /me succeeds without passwordHash
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meRes.body.data.id).toBe(regRes.body.data.user.id);
    expect(meRes.body.data.email).toBe(email);
    expect(meRes.body.data.passwordHash).toBeUndefined();

    // Logout revokes the session
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(logoutRes.body.data).toEqual({ loggedOut: true });

    // Token from logged-out session is rejected
    const afterLogoutRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(afterLogoutRes.body.error.code).toBe('INVALID_SESSION');
  });

  it('enforces rate limiting on authentication endpoints', async () => {
    const throttledApp = await createConfiguredApp();
    try {
      const email = uniqueEmail('ratelimit');

      for (let i = 0; i < 5; i += 1) {
        await request(throttledApp.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'WrongPassword123!' })
          .expect(401);
      }

      const throttledRes = await request(throttledApp.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword123!' })
        .expect(429);

      expect(throttledRes.body.success).toBe(false);
      expect(throttledRes.body.error.code).toBe('TOO_MANY_REQUESTS');
    } finally {
      await throttledApp.close();
    }
  });
});
