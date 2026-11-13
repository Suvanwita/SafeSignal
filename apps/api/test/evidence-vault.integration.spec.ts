import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AbuseCategory, Severity } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createGlobalValidationPipe, EncryptionService } from '../src/common';
import { AuthService } from '../src/modules/auth/auth.service';
import { VaultStorageService } from '../src/modules/evidence/vault-storage.service';
import { PrismaService } from '../src/prisma/prisma.service';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

describe('Evidence Vault Integration (/api/v1/evidence)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  let vaultStorage: VaultStorageService;
  let encryptionService: EncryptionService;
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
    vaultStorage = app.get(VaultStorageService);
    encryptionService = app.get(EncryptionService);
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

  async function registerUser(prefix = 'vault'): Promise<{
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

  it('rejects unauthenticated requests to evidence endpoints', async () => {
    const fakeId = randomUUID();

    await request(app.getHttpServer()).get('/api/v1/evidence').expect(401);
    await request(app.getHttpServer()).get(`/api/v1/evidence/${fakeId}`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/evidence/${fakeId}/download`).expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .expect(401);
    await request(app.getHttpServer()).delete(`/api/v1/evidence/${fakeId}`).expect(401);
  });

  it('uploads, validates, stores in private vault, and associates multiple evidence formats (PNG, JPG, PDF, TXT, DOCX) with an incident', async () => {
    const userA = await registerUser('owner-evidence');

    // Create target incident
    const incRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        title: 'Harassment & Doxxing Campaign Case',
        category: AbuseCategory.HARASSMENT,
        severity: Severity.HIGH,
      })
      .expect(201);
    const incidentId = incRes.body.data.id;

    // 1. Upload PNG evidence
    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('IHDR-SAMPLE-SCREENSHOT-PIXELS'),
    ]);
    const expectedPngSha256 = crypto
      .createHash('sha256')
      .update(pngBuffer)
      .digest('hex');

    const pngRes = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Direct Message Extortion Screenshot')
      .field('description', 'High-resolution capture of extortion demands')
      .attach('file', pngBuffer, 'screenshot.png')
      .expect(201);

    const pngEvidence = pngRes.body.data;
    expect(pngEvidence.id).toBeDefined();
    expect(pngEvidence.incidentId).toBe(incidentId);
    expect(pngEvidence.title).toBe('Direct Message Extortion Screenshot');
    expect(pngEvidence.fileName).toBe('screenshot.png');
    expect(pngEvidence.mimeType).toBe('image/png');
    expect(pngEvidence.fileSize).toBe(pngBuffer.length);
    expect(pngEvidence.sha256).toBe(expectedPngSha256);
    // Ensure filesystem paths or public upload URLs are NOT exposed
    expect(pngEvidence.storageKey).toBeNull();
    expect(pngEvidence.storagePath).toBeUndefined();
    expect(pngEvidence.publicUrl).toBeUndefined();

    // Verify file actually exists on private filesystem in vault
    const dbPng = await prisma.evidence.findUniqueOrThrow({
      where: { id: pngEvidence.id },
    });
    expect(dbPng.storageKey).toBeDefined();
    expect(dbPng.storageKey).toContain(incidentId);
    const absolutePath = vaultStorage.resolveAndValidatePath(dbPng.storageKey!);
    expect(fs.existsSync(absolutePath)).toBe(true);
    const rawVaultBytes = fs.readFileSync(absolutePath);
    expect(rawVaultBytes).not.toEqual(pngBuffer); // Encrypted at rest
    expect(encryptionService.isVaultEncrypted(rawVaultBytes)).toBe(true);
    expect(encryptionService.decryptBuffer(rawVaultBytes)).toEqual(pngBuffer);

    // 2. Upload JPG evidence
    const jpgBuffer = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('JFIF-SAMPLE-JPEG-DATA'),
    ]);
    const jpgRes = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Threatening Profile Photo')
      .attach('file', jpgBuffer, 'avatar.jpg')
      .expect(201);

    expect(jpgRes.body.data.mimeType).toBe('image/jpeg');
    expect(jpgRes.body.data.fileName).toBe('avatar.jpg');

    // 3. Upload PDF evidence
    const pdfBuffer = Buffer.from(
      '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
    );
    const pdfRes = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Police Report Filing')
      .attach('file', pdfBuffer, 'police_report.pdf')
      .expect(201);

    expect(pdfRes.body.data.mimeType).toBe('application/pdf');
    expect(pdfRes.body.data.fileName).toBe('police_report.pdf');

    // 4. Upload TXT evidence
    const txtBuffer = Buffer.from(
      '2026-11-12 21:00:00 UTC - Threat received on forum thread #9281.\nIP: 198.51.100.4',
      'utf-8',
    );
    const txtRes = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .field('incidentId', incidentId)
      .attach('file', txtBuffer, 'audit_logs.txt')
      .expect(201);

    expect(txtRes.body.data.mimeType).toBe('text/plain');
    expect(txtRes.body.data.fileName).toBe('audit_logs.txt');
    // Title defaults to filename if omitted
    expect(txtRes.body.data.title).toBe('audit_logs.txt');

    // 5. Upload DOCX evidence
    const docxBuffer = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('openxml-container-[Content_Types].xml-word/document.xml-package'),
    ]);
    const docxRes = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .field('incidentId', incidentId)
      .field('title', 'Legal Affidavit Statement')
      .attach('file', docxBuffer, 'affidavit.docx')
      .expect(201);

    expect(docxRes.body.data.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(docxRes.body.data.fileName).toBe('affidavit.docx');

    // 6. Verify multiple evidence records are associated with the incident
    const incidentRes = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(incidentRes.body.data.evidence).toHaveLength(5);
    expect(incidentRes.body.data.evidenceCount).toBe(5);

    // Verify timeline events recorded for each attachment
    const attachedEvents = incidentRes.body.data.timelineEvents.filter(
      (e: { eventType: string }) => e.eventType === 'EVIDENCE_ATTACHED',
    );
    expect(attachedEvents).toHaveLength(5);

    // 7. Secure Authenticated Download
    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/evidence/${pngEvidence.id}/download`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(downloadRes.headers['content-type']).toContain('image/png');
    expect(downloadRes.headers['x-content-type-options']).toBe('nosniff');
    expect(downloadRes.headers['content-disposition']).toContain('attachment');
    expect(downloadRes.headers['content-disposition']).toContain('screenshot.png');
    expect(downloadRes.body).toEqual(pngBuffer);

    // 8. Delete evidence and verify cleanup from disk and database
    await request(app.getHttpServer())
      .delete(`/api/v1/evidence/${pngEvidence.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    // Verify row deleted from PostgreSQL
    const deletedRow = await prisma.evidence.findUnique({
      where: { id: pngEvidence.id },
    });
    expect(deletedRow).toBeNull();

    // Verify physical file was removed from disk
    expect(fs.existsSync(absolutePath)).toBe(false);

    // Verify EVIDENCE_REMOVED timeline event logged
    const finalIncident = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(finalIncident.body.data.evidence).toHaveLength(4);
    expect(
      finalIncident.body.data.timelineEvents.some(
        (e: { eventType: string }) => e.eventType === 'EVIDENCE_REMOVED',
      ),
    ).toBe(true);
  });

  it('enforces strict ownership checks: prevents uploading, downloading, or deleting other user evidence', async () => {
    const userA = await registerUser('owner-alice');
    const userB = await registerUser('intruder-bob');

    // User A creates incident and uploads evidence
    const incRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        title: 'Alice Private Investigation',
        category: AbuseCategory.STALKING,
        severity: Severity.HIGH,
      })
      .expect(201);
    const aliceIncidentId = incRes.body.data.id;

    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('ALICE_CONFIDENTIAL_EVIDENCE'),
    ]);

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .field('incidentId', aliceIncidentId)
      .attach('file', pngBuffer, 'alice_capture.png')
      .expect(201);
    const aliceEvidenceId = uploadRes.body.data.id;

    // User B attempts to upload evidence to Alice incident -> 403 Forbidden
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .field('incidentId', aliceIncidentId)
      .attach('file', pngBuffer, 'bob_plant.png')
      .expect(403);

    // User B attempts to view Alice evidence -> 403 Forbidden
    await request(app.getHttpServer())
      .get(`/api/v1/evidence/${aliceEvidenceId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(403);

    // User B attempts to download Alice evidence -> 403 Forbidden
    await request(app.getHttpServer())
      .get(`/api/v1/evidence/${aliceEvidenceId}/download`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(403);

    // User B attempts to delete Alice evidence -> 403 Forbidden
    await request(app.getHttpServer())
      .delete(`/api/v1/evidence/${aliceEvidenceId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(403);
  });

  it('validates file signatures and rejects mismatched, corrupted, or executable uploads with 400', async () => {
    const user = await registerUser('validator-user');

    const incRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Security Validation Case',
        category: AbuseCategory.PHISHING,
        severity: Severity.MEDIUM,
      })
      .expect(201);
    const incidentId = incRes.body.data.id;

    // 1. Rejected: file extension is .png but bytes are plain text / shell script
    const fakePng = Buffer.from('#!/bin/bash\necho "Malicious script"');
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .field('incidentId', incidentId)
      .attach('file', fakePng, 'fake.png')
      .expect(400);

    // 2. Rejected: file extension is .pdf but content is HTML
    const fakePdf = Buffer.from('<html><body>Phishing page</body></html>');
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .field('incidentId', incidentId)
      .attach('file', fakePdf, 'phish.pdf')
      .expect(400);

    // 3. Rejected: file extension is .txt but contains binary null bytes
    const badTxt = Buffer.from('Safe text\x00Binary payload', 'latin1');
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .field('incidentId', incidentId)
      .attach('file', badTxt, 'payload.txt')
      .expect(400);

    // 4. Rejected: unsupported file format (.exe)
    const exeBuffer = Buffer.from('MZ-windows-binary');
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .field('incidentId', incidentId)
      .attach('file', exeBuffer, 'trojan.exe')
      .expect(400);

    // 5. Rejected: empty file (0 bytes)
    await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .field('incidentId', incidentId)
      .attach('file', Buffer.alloc(0), 'empty.png')
      .expect(400);
  });

  it('prevents path traversal in filenames and generates random storage filenames safely within vault', async () => {
    const user = await registerUser('traversal-test');

    const incRes = await request(app.getHttpServer())
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Path Traversal Prevention Test',
        category: AbuseCategory.OTHER,
        severity: Severity.LOW,
      })
      .expect(201);
    const incidentId = incRes.body.data.id;

    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('PNG_CONTENT_TRAVERSAL_TEST'),
    ]);

    // Attempt path traversal via original filename: ../../../../etc/shadow.png
    const res = await request(app.getHttpServer())
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .field('incidentId', incidentId)
      .attach('file', pngBuffer, '../../../../etc/shadow.png')
      .expect(201);

    expect(res.body.data.fileName).toBe('shadow.png'); // Traversal stripped
    expect(res.body.data.storageKey).toBeNull(); // Filesystem path not exposed

    // Verify storage on disk is randomized and located inside vault root
    const dbRecord = await prisma.evidence.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });
    expect(dbRecord.storageKey).toMatch(new RegExp(`^${incidentId}/[a-f0-9-]+\\.png$`));

    const absolutePath = vaultStorage.resolveAndValidatePath(dbRecord.storageKey!);
    expect(absolutePath.startsWith(vaultStorage.getVaultRoot())).toBe(true);
    expect(fs.existsSync(absolutePath)).toBe(true);
  });

  describe('Cryptographic Evidence Integrity Verification (/api/v1/evidence/:id/verify)', () => {
    it('successfully verifies integrity when file is unmodified, recording timestamps, hashes, size, and timeline event', async () => {
      const user = await registerUser('integrity-success');

      // Create incident
      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          title: 'Integrity Verification Case',
          category: AbuseCategory.HARASSMENT,
          severity: Severity.HIGH,
        })
        .expect(201);
      const incidentId = incRes.body.data.id;

      // Prepare PNG
      const pngBuffer = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('IMMUTABLE_INTEGRITY_EVIDENCE_BUFFER_2026'),
      ]);
      const expectedSha256 = crypto
        .createHash('sha256')
        .update(pngBuffer)
        .digest('hex');

      // 1. Upload evidence file
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('incidentId', incidentId)
        .field('title', 'Direct Message Harassment Capture')
        .attach('file', pngBuffer, 'threat.png')
        .expect(201);

      const evidenceId = uploadRes.body.data.id;

      // 2. Verify stored attributes in PostgreSQL: hash, upload timestamp, size, MIME type
      const record = await prisma.evidence.findUniqueOrThrow({
        where: { id: evidenceId },
      });
      expect(record.sha256).toBe(expectedSha256);
      expect(record.fileSize).toBe(pngBuffer.length);
      expect(record.mimeType).toBe('image/png');
      expect(record.createdAt).toBeInstanceOf(Date);

      // 3. Call evidence verification endpoint
      const verifyRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/verify`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(verifyRes.body.data.status).toBe('VERIFIED');
      expect(verifyRes.body.data.verified).toBe(true);
      expect(verifyRes.body.data.evidenceId).toBe(evidenceId);
      expect(verifyRes.body.data.algorithm).toBe('SHA-256');
      expect(verifyRes.body.data.originalHash).toBe(expectedSha256);
      expect(verifyRes.body.data.recalculatedHash).toBe(expectedSha256);
      expect(verifyRes.body.data.originalFileSize).toBe(pngBuffer.length);
      expect(verifyRes.body.data.currentFileSize).toBe(pngBuffer.length);
      expect(verifyRes.body.data.mimeType).toBe('image/png');
      expect(verifyRes.body.data.uploadedAt).toBeDefined();
      expect(verifyRes.body.data.verifiedAt).toBeDefined();
      expect(verifyRes.body.data.disclaimer).toContain(
        'relative to the recorded upload',
      );
      expect(verifyRes.body.data.disclaimer).toContain(
        'not the authenticity',
      );

      // 4. Also verify GET alias returns the same result
      const getVerifyRes = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/verify`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(getVerifyRes.body.data.status).toBe('VERIFIED');

      // 5. Verify timeline event was created
      const events = await prisma.timelineEvent.findMany({
        where: { incidentId, eventType: 'EVIDENCE_VERIFIED' },
      });
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].title).toContain('VERIFIED');
    });

    it('detects modified files and returns INTEGRITY_MISMATCH when vault file bytes are altered', async () => {
      const user = await registerUser('tamper-detect');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          title: 'Tamper Detection Incident',
          category: AbuseCategory.THREATS,
          severity: Severity.CRITICAL,
        })
        .expect(201);
      const incidentId = incRes.body.data.id;

      const txtBuffer = Buffer.from(
        'Incident Log: Genuine original text capture recorded on server.',
        'utf-8',
      );
      const originalHash = crypto
        .createHash('sha256')
        .update(txtBuffer)
        .digest('hex');

      // Upload file
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('incidentId', incidentId)
        .attach('file', txtBuffer, 'chat-log.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      // Locate physical file on disk in vault storage
      const dbRecord = await prisma.evidence.findUniqueOrThrow({
        where: { id: evidenceId },
      });
      const absolutePath = vaultStorage.resolveAndValidatePath(dbRecord.storageKey!);

      // Tamper with the file on disk (corrupt 1 or more bytes)
      const corruptedBytes = Buffer.from(
        'Incident Log: [TAMPERED BY ATTACKER] Altered text content.',
        'utf-8',
      );
      fs.writeFileSync(absolutePath, corruptedBytes);

      const tamperedHash = crypto
        .createHash('sha256')
        .update(corruptedBytes)
        .digest('hex');

      // Call verification endpoint
      const verifyRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/verify`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(verifyRes.body.data.status).toBe('INTEGRITY_MISMATCH');
      expect(verifyRes.body.data.verified).toBe(false);
      expect(verifyRes.body.data.originalHash).toBe(originalHash);
      expect(verifyRes.body.data.recalculatedHash).toBe(tamperedHash);
      expect(verifyRes.body.data.recalculatedHash).not.toBe(originalHash);
      expect(verifyRes.body.data.currentFileSize).toBe(corruptedBytes.length);
      expect(verifyRes.body.data.disclaimer).toBeDefined();

      // Verify timeline event recorded the integrity mismatch
      const events = await prisma.timelineEvent.findMany({
        where: { incidentId, eventType: 'EVIDENCE_VERIFIED' },
      });
      const mismatchEvent = events.find((e) =>
        e.title.includes('INTEGRITY_MISMATCH'),
      );
      expect(mismatchEvent).toBeDefined();
    });

    it('handles missing files cleanly and returns 404 EVIDENCE_FILE_NOT_FOUND', async () => {
      const user = await registerUser('missing-file-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          title: 'Missing File Test Incident',
          category: AbuseCategory.OTHER,
          severity: Severity.LOW,
        })
        .expect(201);
      const incidentId = incRes.body.data.id;

      const pdfBuffer = Buffer.from('%PDF-1.4\n%Missing File Test PDF Document');

      // Upload file
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('incidentId', incidentId)
        .attach('file', pdfBuffer, 'document.pdf')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      // Locate physical file on disk and delete it
      const dbRecord = await prisma.evidence.findUniqueOrThrow({
        where: { id: evidenceId },
      });
      const absolutePath = vaultStorage.resolveAndValidatePath(dbRecord.storageKey!);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }

      // Call verification endpoint -> 404 EVIDENCE_FILE_NOT_FOUND
      const verifyRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/verify`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(404);

      expect(verifyRes.body.error.code).toBe('EVIDENCE_FILE_NOT_FOUND');
      expect(verifyRes.body.error.message).toContain('not found in vault storage');
    });

    it('prohibits users from editing the original hash and custody properties', async () => {
      const user = await registerUser('immutable-hash-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          title: 'Immutability Test Incident',
          category: AbuseCategory.STALKING,
          severity: Severity.HIGH,
        })
        .expect(201);
      const incidentId = incRes.body.data.id;

      const txtBuffer = Buffer.from('Immutable hash baseline test');
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('incidentId', incidentId)
        .attach('file', txtBuffer, 'baseline.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;
      const initialHash = uploadRes.body.data.sha256;

      // 1. Attempt to PATCH sha256 -> rejected with 400 validation error
      await request(app.getHttpServer())
        .patch(`/api/v1/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          sha256:
            '0000000000000000000000000000000000000000000000000000000000000000',
        })
        .expect(400);

      // 2. Attempt to PATCH storageKey -> rejected with 400 validation error
      await request(app.getHttpServer())
        .patch(`/api/v1/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          storageKey: 'fake/path.txt',
        })
        .expect(400);

      // Verify DB hash is completely unchanged
      const dbRecord = await prisma.evidence.findUniqueOrThrow({
        where: { id: evidenceId },
      });
      expect(dbRecord.sha256).toBe(initialHash);

      // 3. Updating allowed metadata works fine
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          title: 'Updated Safe Title for Legal Discovery',
          description: 'Updated custody notes without touching hash',
        })
        .expect(200);

      expect(patchRes.body.data.title).toBe(
        'Updated Safe Title for Legal Discovery',
      );
      expect(patchRes.body.data.sha256).toBe(initialHash);
    });

    it('enforces ownership checks on verification (403 for other users)', async () => {
      const userAlice = await registerUser('alice-verify-owner');
      const userBob = await registerUser('bob-verify-attacker');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${userAlice.accessToken}`)
        .send({
          title: 'Alice Confidential Incident',
          category: AbuseCategory.PRIVACY_VIOLATION,
          severity: Severity.MEDIUM,
        })
        .expect(201);

      const txtBuffer = Buffer.from('Alice private evidence');
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${userAlice.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', txtBuffer, 'alice.txt')
        .expect(201);
      const aliceEvidenceId = uploadRes.body.data.id;

      // Bob tries to verify Alice's evidence -> 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/evidence/${aliceEvidenceId}/verify`)
        .set('Authorization', `Bearer ${userBob.accessToken}`)
        .expect(403);
    });
  });

  describe('Evidence Metadata Extraction & Privacy Protection', () => {
    it('extracts PNG dimensions, bit depth, aspect ratio and exposes it via GET /metadata and GET /:id', async () => {
      const user = await registerUser('png-meta-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          title: 'Metadata PNG Incident',
          category: AbuseCategory.HARASSMENT,
          severity: Severity.MEDIUM,
        })
        .expect(201);
      const incidentId = incRes.body.data.id;

      // Construct valid PNG with 1920x1080 dimensions in IHDR
      const ihdrPayload = Buffer.alloc(13);
      ihdrPayload.writeUInt32BE(1920, 0); // width
      ihdrPayload.writeUInt32BE(1080, 4); // height
      ihdrPayload.writeUInt8(8, 8); // bit depth 8
      ihdrPayload.writeUInt8(6, 9); // RGBA

      const pngBuffer = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from([0x00, 0x00, 0x00, 0x0d]),
        Buffer.from('IHDR', 'ascii'),
        ihdrPayload,
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
      ]);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('incidentId', incidentId)
        .field('title', 'High-res screenshot')
        .attach('file', pngBuffer, 'screenshot.png')
        .expect(201);

      const evidenceId = uploadRes.body.data.id;
      expect(uploadRes.body.data.metadata).toBeDefined();
      expect(uploadRes.body.data.metadata.image.width).toBe(1920);
      expect(uploadRes.body.data.metadata.image.height).toBe(1080);
      expect(uploadRes.body.data.metadata.image.aspectRatio).toBe('16:9');
      expect(uploadRes.body.data.metadata.image.bitDepth).toBe(8);

      // Verify dedicated /metadata endpoint
      const metaRes = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/metadata`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(metaRes.body.data.file.fileName).toBe('screenshot.png');
      expect(metaRes.body.data.file.mimeType).toBe('image/png');
      expect(metaRes.body.data.image.width).toBe(1920);
      expect(metaRes.body.data.image.height).toBe(1080);

      // Verify PostgreSQL persistence in Json column
      const dbRecord = await prisma.evidence.findUniqueOrThrow({
        where: { id: evidenceId },
      });
      expect(dbRecord.metadata).toBeDefined();
      expect((dbRecord.metadata as any).image.width).toBe(1920);
    });

    it('extracts PDF metadata (title, author, pageCount) and text properties', async () => {
      const user = await registerUser('pdf-meta-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          title: 'PDF Legal Evidence Incident',
          category: AbuseCategory.THREATS,
          severity: Severity.HIGH,
        })
        .expect(201);
      const incidentId = incRes.body.data.id;

      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle('Affidavit of Threat Evidence');
      pdfDoc.setAuthor('Detective Safety');
      pdfDoc.setSubject('Criminal Extortion Investigation');
      pdfDoc.addPage([612, 792]);
      pdfDoc.addPage([612, 792]);
      pdfDoc.addPage([612, 792]);
      const pdfBytes = Buffer.from(await pdfDoc.save());

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('incidentId', incidentId)
        .field('title', 'Sworn Affidavit')
        .attach('file', pdfBytes, 'affidavit.pdf')
        .expect(201);

      const evidenceId = uploadRes.body.data.id;
      expect(uploadRes.body.data.metadata.pdf.title).toBe(
        'Affidavit of Threat Evidence',
      );
      expect(uploadRes.body.data.metadata.pdf.author).toBe('Detective Safety');
      expect(uploadRes.body.data.metadata.pdf.pageCount).toBe(3);

      const metaRes = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/metadata`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(metaRes.body.data.pdf.title).toBe('Affidavit of Threat Evidence');
      expect(metaRes.body.data.pdf.pageCount).toBe(3);
    });

    it('extracts text file metrics (lineCount, wordCount, characterCount)', async () => {
      const user = await registerUser('txt-meta-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          title: 'Text Audit Incident',
          category: AbuseCategory.UNWANTED_CONTACT,
          severity: Severity.LOW,
        })
        .expect(201);
      const incidentId = incRes.body.data.id;

      const txt = 'Line one threat note\nLine two persistent unwanted contact\nLine three evidence cataloged';
      const txtBuffer = Buffer.from(txt, 'utf-8');

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('incidentId', incidentId)
        .field('title', 'Unwanted contact transcript')
        .attach('file', txtBuffer, 'chat_log.txt')
        .expect(201);

      expect(uploadRes.body.data.metadata.text.lineCount).toBe(3);
      expect(uploadRes.body.data.metadata.text.wordCount).toBe(13);
      expect(uploadRes.body.data.metadata.text.characterCount).toBe(txt.length);
    });

    it('enforces ownership restrictions on GET /api/v1/evidence/:id/metadata (403 for non-owners)', async () => {
      const alice = await registerUser('alice-meta-owner');
      const bob = await registerUser('bob-meta-intruder');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({
          title: 'Alice Private Incident',
          category: AbuseCategory.PRIVACY_VIOLATION,
          severity: Severity.MEDIUM,
        })
        .expect(201);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', Buffer.from('Confidential log bytes'), 'confidential.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      // Bob attempts to read metadata of Alice's evidence
      const forbiddenRes = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/metadata`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(403);

      expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');
    });

    it('guarantees metadata extraction does not modify original file bytes or tamper with SHA-256 integrity', async () => {
      const user = await registerUser('integrity-check-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          title: 'Tamper-free Extraction Incident',
          category: AbuseCategory.HARASSMENT,
          severity: Severity.HIGH,
        })
        .expect(201);

      const sampleJpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8]), // SOI
        Buffer.from([
          0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x80, 0x03, 0xc0, 0x03, 0x01,
          0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
        ]), // SOF0: 640x960
        Buffer.from([0xff, 0xd9]), // EOI
      ]);

      const expectedSha256 = crypto.createHash('sha256').update(sampleJpeg).digest('hex');

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', sampleJpeg, 'photo.jpg')
        .expect(201);

      const evidenceId = uploadRes.body.data.id;
      expect(uploadRes.body.data.sha256).toBe(expectedSha256);

      // Verify that verifying integrity returns VERIFIED
      const verifyRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/verify`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(verifyRes.body.data.status).toBe('VERIFIED');
      expect(verifyRes.body.data.verified).toBe(true);

      // Verify metadata extracted safely without GPS coordinates
      const meta = uploadRes.body.data.metadata;
      expect(meta.image.width).toBe(960);
      expect(meta.image.height).toBe(640);
      expect(meta.exif?.hasRedactedGps ?? false).toBe(false);
      expect(JSON.stringify(meta)).not.toContain('GPSLatitude');
      expect(JSON.stringify(meta)).not.toContain('GPSLongitude');
    });
  });

  describe('Hardened Evidence Access & Privacy Controls', () => {
    it('enforces owner-only downloads: non-owners cannot download evidence directly (403 Forbidden IDOR prevention)', async () => {
      const owner = await registerUser('alice-owner');
      const intruder = await registerUser('mallory-intruder');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: 'Owner-Only Custody Incident',
          category: AbuseCategory.HARASSMENT,
          severity: Severity.HIGH,
        })
        .expect(201);

      const buffer = Buffer.from('Private chat log content #101', 'utf-8');
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', buffer, 'private-chat.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      // Intruder attempts to download Alice evidence via Bearer token -> 403 Forbidden
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/download`)
        .set('Authorization', `Bearer ${intruder.accessToken}`)
        .expect(403);

      // Intruder attempts to request download token for Alice evidence -> 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/download-token`)
        .set('Authorization', `Bearer ${intruder.accessToken}`)
        .expect(403);
    });

    it('issues short-lived, single-purpose download authorization token and enables secure download', async () => {
      const owner = await registerUser('token-download-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: 'Download Token Incident',
          category: AbuseCategory.CYBERBULLYING,
          severity: Severity.MEDIUM,
        })
        .expect(201);

      const content = 'Confidential extortion audio transcript text.';
      const buffer = Buffer.from(content, 'utf-8');
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', buffer, 'transcript.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      // 1. Request short-lived single-purpose token
      const tokenRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/download-token`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(201);

      expect(tokenRes.body.data.token).toBeDefined();
      expect(tokenRes.body.data.expiresInSeconds).toBe(60);
      expect(tokenRes.body.data.evidenceId).toBe(evidenceId);
      expect(tokenRes.body.data.downloadUrl).toContain(encodeURIComponent(tokenRes.body.data.token));

      const downloadToken = tokenRes.body.data.token;

      // 2. Perform download using short-lived token via query param (without Bearer header!)
      const downloadRes = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/download?token=${encodeURIComponent(downloadToken)}`)
        .expect(200);

      expect(downloadRes.text).toBe(content);
      expect(downloadRes.headers['content-type']).toContain('text/plain');
    });

    it('rejects expired download authorization tokens with 401 Unauthorized', async () => {
      const owner = await registerUser('expired-token-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: 'Expired Token Test',
          category: AbuseCategory.DOXXING,
          severity: Severity.HIGH,
        })
        .expect(201);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', Buffer.from('Sensitive doxxing records', 'utf-8'), 'doxx.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      // Create artificially expired token using encryptionService
      const expiredToken = encryptionService.encryptDownloadToken({
        evidenceId,
        userId: owner.userId,
        jti: randomUUID(),
        exp: Date.now() - 5000, // expired 5 seconds ago
        purpose: 'EVIDENCE_DOWNLOAD',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/download?token=${encodeURIComponent(expiredToken)}`)
        .expect(401);

      expect(res.body.error.code).toBe('DOWNLOAD_TOKEN_EXPIRED');
    });

    it('rejects forged or corrupted download authorization tokens with 401 Unauthorized', async () => {
      const owner = await registerUser('tampered-token-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: 'Tampered Token Incident',
          category: AbuseCategory.THREATS,
          severity: Severity.HIGH,
        })
        .expect(201);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', Buffer.from('Evidence text', 'utf-8'), 'threat.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      const tokenRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/download-token`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(201);

      const validToken = tokenRes.body.data.token;
      // Corrupt the token characters
      const tamperedToken =
        validToken.slice(0, 15) +
        (validToken[15] === 'A' ? 'B' : 'A') +
        validToken.slice(16);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/download?token=${encodeURIComponent(tamperedToken)}`)
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_DOWNLOAD_TOKEN');
    });

    it('prevents IDOR: rejects download token issued for evidence A when used to download evidence B (403 Forbidden)', async () => {
      const owner = await registerUser('token-idor-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: 'IDOR Prevention Incident',
          category: AbuseCategory.HARASSMENT,
          severity: Severity.HIGH,
        })
        .expect(201);

      // Evidence A
      const uploadA = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', Buffer.from('File A content', 'utf-8'), 'fileA.txt')
        .expect(201);
      const evidenceA = uploadA.body.data.id;

      // Evidence B
      const uploadB = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', Buffer.from('File B content', 'utf-8'), 'fileB.txt')
        .expect(201);
      const evidenceB = uploadB.body.data.id;

      // Token issued for Evidence A
      const tokenRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceA}/download-token`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(201);
      const tokenA = tokenRes.body.data.token;

      // Attempt to download Evidence B using Token A -> 403 Forbidden (mismatch)
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceB}/download?token=${encodeURIComponent(tokenA)}`)
        .expect(403);

      expect(res.body.error.code).toBe('DOWNLOAD_TOKEN_MISMATCH');
    });

    it('prevents token replay: rejects already-consumed single-purpose download tokens with 401 Unauthorized', async () => {
      const owner = await registerUser('replay-prevention-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: 'Replay Prevention Incident',
          category: AbuseCategory.STALKING,
          severity: Severity.HIGH,
        })
        .expect(201);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', Buffer.from('Single-use file bytes', 'utf-8'), 'single.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      const tokenRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/download-token`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(201);
      const token = tokenRes.body.data.token;

      // First download succeeds
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/download?token=${encodeURIComponent(token)}`)
        .expect(200);

      // Replay attempt must be rejected with 401 DOWNLOAD_TOKEN_ALREADY_USED
      const replayRes = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/download?token=${encodeURIComponent(token)}`)
        .expect(401);

      expect(replayRes.body.error.code).toBe('DOWNLOAD_TOKEN_ALREADY_USED');
    });

    it('persists audit records for upload, token issuance, download, and verification in evidence_audit_logs', async () => {
      const owner = await registerUser('audit-trail-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: 'Forensic Audit Incident',
          category: AbuseCategory.UNWANTED_CONTACT,
          severity: Severity.MEDIUM,
        })
        .expect(201);

      // 1. Upload
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', Buffer.from('Forensic audit record test', 'utf-8'), 'audit.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      // 2. Token Issuance
      const tokenRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/download-token`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(201);

      // 3. Download via token
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/download?token=${encodeURIComponent(tokenRes.body.data.token)}`)
        .expect(200);

      // 4. Verify integrity
      await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/verify`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      // 5. Query audit logs via GET /api/v1/evidence/:id/audit
      const auditRes = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/audit`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      const logs = auditRes.body.data;
      expect(Array.isArray(logs)).toBe(true);
      const actions = logs.map((l: { action: string }) => l.action);
      expect(actions).toContain('UPLOAD');
      expect(actions).toContain('TOKEN_ISSUED');
      expect(actions).toContain('DOWNLOAD');
      expect(actions).toContain('VERIFY');

      // Check timeline events also recorded
      const timelineRes = await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incRes.body.data.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const eventTypes = timelineRes.body.data.timelineEvents.map((e: { eventType: string }) => e.eventType);
      expect(eventTypes).toContain('EVIDENCE_ATTACHED');
      expect(eventTypes).toContain('EVIDENCE_DOWNLOADED');
      expect(eventTypes).toContain('EVIDENCE_VERIFIED');
    });

    it('detects corrupted encrypted vault data: authenticated decryption fails safely without leaking internals', async () => {
      const owner = await registerUser('corrupted-encrypted-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: 'Corrupted Ciphertext Incident',
          category: AbuseCategory.EXTORTION,
          severity: Severity.CRITICAL,
        })
        .expect(201);

      const originalBytes = Buffer.from('Original confidential extortion communication', 'utf-8');
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', originalBytes, 'extortion.txt')
        .expect(201);
      const evidenceId = uploadRes.body.data.id;

      // Locate physical file on disk (which is encrypted with AES-256-GCM)
      const dbRecord = await prisma.evidence.findUniqueOrThrow({
        where: { id: evidenceId },
      });
      const absolutePath = vaultStorage.resolveAndValidatePath(dbRecord.storageKey!);

      // Tamper with the encrypted ciphertext bytes on disk (keep SSENC01 prefix and IV, but corrupt ciphertext)
      const diskBytes = fs.readFileSync(absolutePath);
      expect(diskBytes.subarray(0, 7).toString('ascii')).toBe('SSENC01');
      const corruptedBytes = Buffer.from(diskBytes);
      corruptedBytes[corruptedBytes.length - 1] ^= 0x55; // flip byte in ciphertext
      fs.writeFileSync(absolutePath, corruptedBytes);

      // Attempt download: must fail authenticated decryption safely with 400 EVIDENCE_FILE_CORRUPTED
      const downloadRes = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${evidenceId}/download`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(400);

      expect(downloadRes.body.error.code).toBe('EVIDENCE_FILE_CORRUPTED');
      expect(downloadRes.body.error.message).toContain('cryptographic authentication');

      // Attempt verify: must catch authenticated decryption failure and return INTEGRITY_MISMATCH
      const verifyRes = await request(app.getHttpServer())
        .post(`/api/v1/evidence/${evidenceId}/verify`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(verifyRes.body.data.status).toBe('INTEGRITY_MISMATCH');
      expect(verifyRes.body.data.verified).toBe(false);
    });

    it('verifies AES-256-GCM encryption generates unique nonces across identical file uploads', async () => {
      const owner = await registerUser('nonce-uniqueness-user');

      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          title: 'Nonce Uniqueness Incident',
          category: AbuseCategory.HARASSMENT,
          severity: Severity.LOW,
        })
        .expect(201);

      const sampleBytes = Buffer.from('IDENTICAL_PLAINTEXT_BYTES_ACROSS_UPLOADS', 'utf-8');

      // Upload 1
      const upload1 = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', sampleBytes, 'file1.txt')
        .expect(201);

      // Upload 2
      const upload2 = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('incidentId', incRes.body.data.id)
        .attach('file', sampleBytes, 'file2.txt')
        .expect(201);

      const db1 = await prisma.evidence.findUniqueOrThrow({ where: { id: upload1.body.data.id } });
      const db2 = await prisma.evidence.findUniqueOrThrow({ where: { id: upload2.body.data.id } });

      const file1Bytes = fs.readFileSync(vaultStorage.resolveAndValidatePath(db1.storageKey!));
      const file2Bytes = fs.readFileSync(vaultStorage.resolveAndValidatePath(db2.storageKey!));

      // Both must start with SSENC01
      expect(file1Bytes.subarray(0, 7).toString('ascii')).toBe('SSENC01');
      expect(file2Bytes.subarray(0, 7).toString('ascii')).toBe('SSENC01');

      // Nonces (bytes 7..19) must be completely unique
      const nonce1 = file1Bytes.subarray(7, 19);
      const nonce2 = file2Bytes.subarray(7, 19);
      expect(nonce1.equals(nonce2)).toBe(false);

      // Ciphertexts must differ
      expect(file1Bytes.equals(file2Bytes)).toBe(false);

      // Both decrypt back to identical original bytes
      expect(encryptionService.decryptBuffer(file1Bytes)).toEqual(sampleBytes);
      expect(encryptionService.decryptBuffer(file2Bytes)).toEqual(sampleBytes);
    });
  });
});
