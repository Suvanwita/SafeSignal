import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AbuseCategory, Severity } from '@prisma/client';
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

describe('Evidence Vault Integration (/api/v1/evidence)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  let vaultStorage: VaultStorageService;
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
    expect(fs.readFileSync(absolutePath)).toEqual(pngBuffer);

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
});
