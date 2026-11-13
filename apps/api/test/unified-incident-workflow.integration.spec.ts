import crypto, { randomUUID } from 'node:crypto';
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
import { VaultStorageService } from '../src/modules/evidence/vault-storage.service';
import { PrismaService } from '../src/prisma/prisma.service';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

describe('Complete Unified SafeSignal Incident Workflow (End-to-End)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  let vaultStorage: VaultStorageService;
  const createdUserIds: string[] = [];

  // Standard 1x1 valid transparent PNG
  const validPngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );

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
    vaultStorage = app.get(VaultStorageService);
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

  async function registerUser(emailPrefix: string): Promise<{
    userId: string;
    email: string;
    password: string;
    accessToken: string;
  }> {
    const email = `${emailPrefix}-${randomUUID()}@safesignal.org`;
    const password = 'StrongPassword123!';
    const regRes = await authService.register({
      email,
      password,
      displayName: `User ${emailPrefix}`,
    });

    createdUserIds.push(regRes.user.id);
    return {
      userId: regRes.user.id,
      email,
      password,
      accessToken: regRes.accessToken,
    };
  }

  it('executes the full 12-step unified workflow with successful operations, invalid inputs, unauthorized access, cross-user isolation, modified files, and missing files', async () => {
    // =========================================================================
    // STEP 1: REGISTER AND LOG IN
    // =========================================================================
    const alice = await registerUser('alice');
    const mallory = await registerUser('mallory'); // Attacker user for IDOR checks

    // Test invalid login credentials
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: alice.email,
        password: 'WrongPassword!',
      })
      .expect(401);

    // Test successful login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: alice.email,
        password: alice.password,
      })
      .expect(200);

    const aliceToken = loginRes.body.data.accessToken;
    expect(aliceToken).toBeDefined();

    // Test unauthenticated access rejected
    await request(app.getHttpServer()).get('/api/v1/incidents').expect(401);

    // =========================================================================
    // STEP 2: CREATE AN INCIDENT
    // =========================================================================
    // Test invalid input: title too short (< 3 characters)
    await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        title: 'ab',
        category: AbuseCategory.IMPERSONATION,
      })
      .expect(400);

    // Test successful incident creation
    const createIncidentRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        title: 'Executive Impersonation & Harassment Campaign “Urgent”',
        description: 'Coordinated impersonation and sensitive data leaks targeting our executive profiles across social networks.',
        category: AbuseCategory.IMPERSONATION,
        severity: Severity.HIGH,
      })
      .expect(201);

    const incidentId = createIncidentRes.body.data.id;
    expect(incidentId).toBeDefined();
    expect(createIncidentRes.body.data.title).toContain('Executive Impersonation');
    expect(createIncidentRes.body.data.category).toBe('IMPERSONATION');
    expect(createIncidentRes.body.data.severity).toBe('HIGH');

    // Cross-user test: Mallory cannot view Alice's incident
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .expect(403);

    // =========================================================================
    // STEP 3: SUBMIT AN IMPERSONATION REPORT
    // =========================================================================
    // Test invalid report: missing required fields
    await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        incidentId,
        // missing title, platform, category, incidentDate
      })
      .expect(400);

    // Test successful report creation linked to the incident
    const reportRes = await request(app.getHttpServer())
      .post('/api/v1/abuse/reports')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        incidentId,
        title: 'Fake Executive Profile on X',
        description: 'Lookalike handle copying official executive photos and attempting credential harvesting.',
        category: AbuseCategory.IMPERSONATION,
        platform: Platform.X,
        severity: Severity.HIGH,
        incidentDate: new Date().toISOString(),
        targetUrl: 'https://x.com/fake_exec_support',
      })
      .expect(201);

    const reportId = reportRes.body.data.id;
    expect(reportId).toBeDefined();
    expect(reportRes.body.data.incidentId).toBe(incidentId);

    // Cross-user test: Mallory cannot view or unlink Alice's report
    await request(app.getHttpServer())
      .get(`/api/v1/abuse/reports/${reportId}`)
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/incidents/${incidentId}/reports/${reportId}`)
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .expect(403);

    // =========================================================================
    // STEP 4: ADD A SUSPICIOUS PROFILE
    // =========================================================================
    // Test invalid profile: invalid URL format
    await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        incidentId,
        platform: Platform.X,
        username: 'fake_exec_support',
        profileUrl: 'not-a-valid-url',
      })
      .expect(400);

    // Test successful suspicious profile addition
    const profileRes = await request(app.getHttpServer())
      .post('/api/v1/intelligence/suspicious-profiles')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        incidentId,
        platform: Platform.X,
        username: 'fake_exec_support',
        displayName: 'Executive Support (Official)',
        profileUrl: 'https://x.com/fake_exec_support',
        notes: 'Cloned avatar and biographical details to solicit private keys.',
      })
      .expect(201);

    const profileId = profileRes.body.data.id;
    expect(profileId).toBeDefined();
    expect(profileRes.body.data.username).toBe('fake_exec_support');

    // Cross-user test: Mallory cannot view or unlink Alice's suspicious profile
    await request(app.getHttpServer())
      .get(`/api/v1/intelligence/suspicious-profiles/${profileId}`)
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/incidents/${incidentId}/profiles/${profileId}`)
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .expect(403);

    // =========================================================================
    // STEP 5: UPLOAD A SCREENSHOT
    // =========================================================================
    // Test invalid upload: disallowed file extension (.exe)
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${aliceToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Malicious payload')
      .attach('file', Buffer.from('executable binary code'), 'malware.exe')
      .expect(400);

    // Test invalid upload: signature mismatch (named .png but contains random text)
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${aliceToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Fake png')
      .attach('file', Buffer.from('Not a PNG image header'), 'fake.png')
      .expect(400);

    // Cross-user test: Mallory cannot upload evidence to Alice's incident
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Unauthorized upload')
      .attach('file', validPngBytes, 'screenshot.png')
      .expect(403);

    // Test successful upload of valid PNG screenshot
    const expectedSha256 = crypto
      .createHash('sha256')
      .update(validPngBytes)
      .digest('hex');

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${aliceToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Fake Executive Profile Screenshot')
      .field('description', 'Visual capture of the lookalike profile page and direct message solicitation.')
      .attach('file', validPngBytes, 'profile_capture.png')
      .expect(201);

    const evidenceId = uploadRes.body.data.id;
    expect(evidenceId).toBeDefined();
    // Storage path isolation: internal vault key is never leaked in the client DTO
    expect(uploadRes.body.data.storageKey).toBeNull();

    // Query storage key directly from database to test file modifications on disk
    const dbEvidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    expect(dbEvidence?.storageKey).toBeDefined();
    const storageKey = dbEvidence!.storageKey!;

    // =========================================================================
    // STEP 6: CALCULATE & VERIFY ITS SHA-256 HASH
    // =========================================================================
    expect(uploadRes.body.data.sha256).toBe(expectedSha256);
    expect(uploadRes.body.data.fileName).toBe('profile_capture.png');
    expect(uploadRes.body.data.mimeType).toBe('image/png');

    // =========================================================================
    // STEP 7: VERIFY EVIDENCE INTEGRITY (Intact, Modified, Missing, Cross-user)
    // =========================================================================
    // 7A: Successful integrity verification of intact file
    const verifySuccessRes = await request(app.getHttpServer())
      .post(`/api/v1/evidence/${evidenceId}/verify`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(verifySuccessRes.body.data.status).toBe('VERIFIED');
    expect(verifySuccessRes.body.data.verified).toBe(true);
    expect(verifySuccessRes.body.data.originalHash).toBe(expectedSha256);
    expect(verifySuccessRes.body.data.recalculatedHash).toBe(expectedSha256);

    // 7B: Cross-user test: Mallory cannot verify Alice's evidence
    await request(app.getHttpServer())
      .post(`/api/v1/evidence/${evidenceId}/verify`)
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .expect(403);

    // 7C: Modified evidence file test
    // Locate the vault file on disk and tamper with it
    const vaultFilePath = vaultStorage.resolveAndValidatePath(storageKey);
    expect(fs.existsSync(vaultFilePath)).toBe(true);

    const originalFileBytes = fs.readFileSync(vaultFilePath);
    try {
      // Overwrite with tampered content
      fs.writeFileSync(vaultFilePath, Buffer.from('TAMPERED_CONTENT_IN_VAULT'));

      const verifyMismatchRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/verify`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(verifyMismatchRes.body.data.status).toBe('INTEGRITY_MISMATCH');
      expect(verifyMismatchRes.body.data.verified).toBe(false);
      expect(verifyMismatchRes.body.data.recalculatedHash).not.toBe(expectedSha256);
    } finally {
      // Restore original file bytes for next tests
      fs.writeFileSync(vaultFilePath, originalFileBytes);
    }

    // Confirm it is VERIFIED again once restored
    const reVerifyRes = await request(app.getHttpServer())
      .post(`/api/v1/evidence/${evidenceId}/verify`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(reVerifyRes.body.data.status).toBe('VERIFIED');

    // 7D: Missing file test
    // Temporarily delete file
    fs.unlinkSync(vaultFilePath);
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/verify`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    } finally {
      // Re-create file so subsequent tests (like PDF report) find it
      fs.writeFileSync(vaultFilePath, originalFileBytes);
    }

    // =========================================================================
    // STEP 8: SCAN TEXT FOR SENSITIVE INFORMATION
    // =========================================================================
    // Test invalid scan input: empty text
    await request(app.getHttpServer())
      .post('/api/v1/privacy/scan')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        text: '',
      })
      .expect(400);

    const sensitiveSnippet =
      'Please send the executive payout verification to alice.exec@safesignal.org or call +91 9876543210 at Flat 402, Lotus Residency, 12th Cross, Indiranagar, Bangalore.';

    const scanRes = await request(app.getHttpServer())
      .post('/api/v1/privacy/scan')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        text: sensitiveSnippet,
        incidentId,
      })
      .expect(200);

    const detections = scanRes.body.data.detections;
    expect(detections.length).toBeGreaterThanOrEqual(2);

    const categories = detections.map((f: { category: string }) => f.category);
    expect(categories).toContain('EMAIL');
    expect(categories).toContain('PHONE_INDIAN');

    // =========================================================================
    // STEP 9: GENERATE A REDACTED COPY
    // =========================================================================
    const redactRes = await request(app.getHttpServer())
      .post('/api/v1/privacy/redact')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        text: sensitiveSnippet,
      })
      .expect(200);

    const redactedText = redactRes.body.data.redactedText;
    expect(redactedText).toBeDefined();
    expect(redactedText).not.toContain('alice.exec@safesignal.org');
    expect(redactedText).not.toContain('+91 9876543210');
    expect(redactedText).toContain('[REDACTED_EMAIL]');
    expect(redactedText).toContain('[REDACTED_PHONE]');

    // =========================================================================
    // STEP 10: RUN SAFETY INTELLIGENCE
    // =========================================================================
    // Cross-user test: Mallory cannot run safety analysis on Alice's incident
    await request(app.getHttpServer())
      .post(`/api/v1/intelligence/safety/analyze-incident/${incidentId}`)
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .expect(403);

    // Alice runs Safety Intelligence on her incident
    const safetyRes = await request(app.getHttpServer())
      .post(`/api/v1/intelligence/safety/analyze-incident/${incidentId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(safetyRes.body.data.riskLevel).toBeDefined();
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(safetyRes.body.data.riskLevel);
    expect(safetyRes.body.data.category).toBeDefined();
    expect(Array.isArray(safetyRes.body.data.indicators)).toBe(true);
    expect(Array.isArray(safetyRes.body.data.suggestedActions)).toBe(true);

    // =========================================================================
    // STEP 11: VIEW THE CHRONOLOGICAL TIMELINE
    // =========================================================================
    // Cross-user test: Mallory cannot view Alice's timeline
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/timeline`)
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .expect(403);

    // Alice retrieves timeline in ascending chronological order
    const timelineRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/timeline?order=asc&limit=50`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    const events = timelineRes.body.data.events;
    expect(events.length).toBeGreaterThanOrEqual(6);

    const eventTypes = events.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toContain('INCIDENT_CREATED');
    expect(eventTypes).toContain('ABUSE_REPORT_CREATED');
    expect(eventTypes).toContain('PROFILE_LINKED');
    expect(eventTypes).toContain('EVIDENCE_ATTACHED');
    expect(eventTypes).toContain('EVIDENCE_VERIFIED');
    expect(eventTypes).toContain('PRIVACY_SCAN_COMPLETED');
    expect(eventTypes).toContain('SAFETY_ANALYSIS_COMPLETED');

    // Verify chronological ordering
    for (let i = 0; i < events.length - 1; i++) {
      const t1 = new Date(events[i].occurredAt).getTime();
      const t2 = new Date(events[i + 1].occurredAt).getTime();
      expect(t2).toBeGreaterThanOrEqual(t1);
    }

    // Verify timeline immutability: ordinary users cannot edit or delete historical events
    const firstEventId = events[0].id;
    await request(app.getHttpServer())
      .patch(`/api/v1/incidents/${incidentId}/timeline/${firstEventId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Modified historical record' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/incidents/${incidentId}/timeline/${firstEventId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(403);

    // =========================================================================
    // STEP 12: DOWNLOAD THE INCIDENT PDF REPORT
    // =========================================================================
    // Unauthenticated download rejected
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/report/pdf`)
      .expect(401);

    // Cross-user download rejected (Mallory cannot download Alice's dossier)
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/report/pdf`)
      .set('Authorization', `Bearer ${mallory.accessToken}`)
      .expect(403);

    // Alice successfully downloads her official incident PDF dossier
    const pdfRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}/report/pdf`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect(pdfRes.headers['content-disposition']).toContain(
      `attachment; filename="SafeSignal-Incident-${incidentId.slice(0, 8)}.pdf"`,
    );

    const pdfBuffer = Buffer.isBuffer(pdfRes.body)
      ? pdfRes.body
      : Buffer.from(pdfRes.text);

    // Check %PDF- magic bytes and non-trivial length
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBuffer.length).toBeGreaterThan(2000);
  });
});
