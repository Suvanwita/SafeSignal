import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AbuseCategory,
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

describe('Incident PDF Report Generation (/api/v1/incidents/:id/report/pdf)', () => {
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

  async function registerUser(prefix = 'pdf-user'): Promise<{
    userId: string;
    accessToken: string;
  }> {
    const email = `${prefix}-${randomUUID()}@safesignal.org`;
    const res = await authService.register({
      email,
      password: 'StrongPassword123!',
      displayName: `User ${prefix}`,
    });

    createdUserIds.push(res.user.id);
    return {
      userId: res.user.id,
      accessToken: res.accessToken,
    };
  }

  it('generates a valid, authenticated PDF incident report and enforces owner-only access', async () => {
    const owner = await registerUser('owner');
    const attacker = await registerUser('attacker');

    // 1. Create an incident
    const createIncRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        title: 'High Risk Harassment & Extortion Dossier 🚨',
        description: 'Comprehensive evidence of coordinated extortion and doxxing across platforms.',
        category: AbuseCategory.EXTORTION,
        severity: Severity.HIGH,
      })
      .expect(201);

    const incidentId = createIncRes.body.data.id;
    expect(incidentId).toBeDefined();

    // 2. Attach an abuse report
    await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        incidentId,
        title: 'Extortion message on Telegram',
        description: 'Blackmail demand received for cryptocoin transfer.',
        category: AbuseCategory.EXTORTION,
        platform: Platform.TELEGRAM,
        severity: Severity.HIGH,
        incidentDate: new Date().toISOString(),
      })
      .expect(201);

    // 3. Attach a suspicious profile
    await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        incidentId,
        platform: Platform.X,
        username: 'extortionist_prime',
        profileUrl: 'https://x.com/extortionist_prime',
        displayName: 'Prime Extortion',
        notes: 'Primary threat account demanding ransom',
      })
      .expect(201);

    // 4. Attach an evidence file
    const sampleBytes = Buffer.from('Official extortion note evidence file content');
    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Extortion Message Proof')
      .field('description', 'Raw screenshot text proof')
      .attach('file', sampleBytes, 'extortion_demand.txt')
      .expect(201);

    const evidenceId = uploadRes.body.data.id;

    // 5. Verify evidence integrity
    await request(app.getHttpServer())
      .post(`/api/v1/evidence/${evidenceId}/verify`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    // 6. Run case safety analysis
    await request(app.getHttpServer())
      .post(`/api/v1/intelligence/safety/analyze-incident/${incidentId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    // 7. Download PDF Report as owner
    const pdfResponse = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/report/pdf`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(pdfResponse.headers['content-type']).toBe('application/pdf');
    expect(pdfResponse.headers['content-disposition']).toContain(
      `attachment; filename="SafeSignal-Incident-${incidentId.slice(0, 8)}.pdf"`,
    );

    // Ensure response body is binary PDF starting with %PDF-
    const bodyBuffer = Buffer.isBuffer(pdfResponse.body)
      ? pdfResponse.body
      : Buffer.from(pdfResponse.text);

    expect(bodyBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bodyBuffer.length).toBeGreaterThan(1500);

    // 8. IDOR Protection: Attacker cannot access report (403 Forbidden)
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/report/pdf`)
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .expect(403);

    // 9. Unauthenticated request rejected (401 Unauthorized)
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/report/pdf`)
      .expect(401);
  });
});
