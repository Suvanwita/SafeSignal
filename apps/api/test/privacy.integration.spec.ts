import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createGlobalValidationPipe } from '../src/common';
import {
  RedactionStrategy,
  SensitiveCategory,
} from '../src/modules/privacy/dto/sensitive-category.enum';
import { PrismaService } from '../src/prisma/prisma.service';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

describe('Privacy Protection Integration (/api/v1/privacy)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  let authToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);

    // Register a test user once for test suite
    const email = `privacy-master-${randomUUID()}@safesignal.org`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'StrongPassword123!',
        displayName: 'Privacy Master',
      })
      .expect(201);

    createdUserIds.push(res.body.data.user.id);
    authToken = res.body.data.accessToken;
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await app.close();
  });

  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests to /api/v1/privacy/scan with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/privacy/scan')
        .send({ text: 'sample text' })
        .expect(401);
    });

    it('rejects unauthenticated requests to /api/v1/privacy/redact with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/privacy/redact')
        .send({ text: 'sample text' })
        .expect(401);
    });
  });

  describe('Input Validation & Constraints', () => {
    it('rejects empty input text with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: '' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects input text exceeding maximum character limit (50,000 characters) with 400', async () => {
      const largeText = 'a'.repeat(50_001);

      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: largeText })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Text Scanning Endpoint (/api/v1/privacy/scan)', () => {
    it('scans text and returns accurate detections for email, Indian phone, international phone, and physical address', async () => {
      const sampleText =
        'Please forward harassment evidence to investigator.jane@safesignal.org or call Indian mobile +91 98765 43210. US partner: +1 (555) 234-5678. Residence: Flat 402, Sunshine Apartments, 5th Cross Road, Indiranagar, Bangalore 560038.';

      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: sampleText })
        .expect(200);

      const data = res.body.data;
      expect(data.hasSensitiveData).toBe(true);
      expect(data.totalDetections).toBe(4);
      expect(data.scannedLength).toBe(sampleText.length);
      expect(data.executionTimeMs).toBeGreaterThanOrEqual(0);

      // Verify category breakdown
      expect(data.categoryBreakdown[SensitiveCategory.EMAIL]).toBe(1);
      expect(data.categoryBreakdown[SensitiveCategory.PHONE_INDIAN]).toBe(1);
      expect(data.categoryBreakdown[SensitiveCategory.PHONE_INTERNATIONAL]).toBe(1);
      expect(data.categoryBreakdown[SensitiveCategory.ADDRESS]).toBe(1);

      // Verify match positions slice back to original detected text
      for (const d of data.detections) {
        expect(sampleText.slice(d.start, d.end)).toBe(d.text);
        expect(d.confidence).toBeDefined();
        expect(d.explanation).toBeDefined();
      }
    });

    it('returns empty detections when scanning benign public text', async () => {
      const cleanText =
        'This is a public documentation guide explaining cybersecurity best practices for modern web applications.';

      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: cleanText })
        .expect(200);

      expect(res.body.data.hasSensitiveData).toBe(false);
      expect(res.body.data.totalDetections).toBe(0);
      expect(res.body.data.detections).toEqual([]);
    });

    it('filters scan to requested category only', async () => {
      const text =
        'Contact bob@example.com or call +91 98765 43210 at 123 Main Street.';

      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text,
          categories: [SensitiveCategory.EMAIL],
        })
        .expect(200);

      expect(res.body.data.totalDetections).toBe(1);
      expect(res.body.data.detections[0].category).toBe(SensitiveCategory.EMAIL);
      expect(res.body.data.categoryBreakdown[SensitiveCategory.EMAIL]).toBe(1);
      expect(res.body.data.categoryBreakdown[SensitiveCategory.PHONE_INDIAN]).toBe(0);
    });
  });

  describe('Redaction Endpoint (/api/v1/privacy/redact)', () => {
    const sensitiveSample =
      'Victim email is victim.safety@example.org. Call +91 98765 43210. Location: Flat 204, Sector 14, Gurgaon 122001.';

    it('redacts sensitive data with CATEGORY_LABEL strategy', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/redact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: sensitiveSample,
          strategy: RedactionStrategy.CATEGORY_LABEL,
        })
        .expect(200);

      const data = res.body.data;
      expect(data.redactionCount).toBe(3);
      expect(data.appliedStrategy).toBe(RedactionStrategy.CATEGORY_LABEL);
      expect(data.redactedText).toContain('[REDACTED_EMAIL]');
      expect(data.redactedText).toContain('[REDACTED_PHONE]');
      expect(data.redactedText).toContain('[REDACTED_ADDRESS]');
      expect(data.redactedText).not.toContain('victim.safety@example.org');
      expect(data.redactedText).not.toContain('98765 43210');
    });

    it('redacts sensitive data with PARTIAL_MASK strategy preserving structure', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/redact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Notify target at user@safesignal.org or +91 98765 43210.',
          strategy: RedactionStrategy.PARTIAL_MASK,
        })
        .expect(200);

      expect(res.body.data.redactedText).toContain('u***r@safesignal.org');
      expect(res.body.data.redactedText).toContain('+91 ******3210');
      expect(res.body.data.redactedText).not.toContain('user@safesignal.org');
    });

    it('redacts with FULL_MASK strategy (asterisks)', async () => {
      const email = 'target@test.com';

      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/redact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: `Email: ${email}`,
          strategy: RedactionStrategy.FULL_MASK,
        })
        .expect(200);

      expect(res.body.data.redactedText).toBe(`Email: ${'*'.repeat(email.length)}`);
    });

    it('redacts with CUSTOM placeholder', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/redact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Reach out to confidential@domain.com immediately.',
          strategy: RedactionStrategy.CUSTOM,
          customPlaceholder: '[SECRET_DATA]',
        })
        .expect(200);

      expect(res.body.data.redactedText).toBe(
        'Reach out to [SECRET_DATA] immediately.',
      );
    });

    it('supports custom category placeholders', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/redact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Send message to support@victim.org or call +91 98765 43210.',
          customCategoryPlaceholders: {
            [SensitiveCategory.EMAIL]: '<ANONYMOUS_INBOX>',
            [SensitiveCategory.PHONE_INDIAN]: '<ANONYMOUS_HOTLINE>',
          },
        })
        .expect(200);

      expect(res.body.data.redactedText).toContain('<ANONYMOUS_INBOX>');
      expect(res.body.data.redactedText).toContain('<ANONYMOUS_HOTLINE>');
    });

    it('redacts only targeted category when categories array is specified', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/redact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Email: alert@test.com, Phone: +91 98765 43210',
          categories: [SensitiveCategory.EMAIL],
        })
        .expect(200);

      expect(res.body.data.redactionCount).toBe(1);
      expect(res.body.data.redactedText).toContain('[REDACTED_EMAIL]');
      // Phone is preserved intact
      expect(res.body.data.redactedText).toContain('+91 98765 43210');
    });
  });

  describe('Privacy & Ephemerality Guarantee', () => {
    it('confirms scanned or redacted text is never persisted to database tables', async () => {
      const evidenceCountBefore = await prisma.evidence.count();
      const reportsCountBefore = await prisma.abuseReport.count();
      const incidentsCountBefore = await prisma.incident.count();

      // Run multiple scan and redact operations
      await request(app.getHttpServer())
        .post('/api/v1/privacy/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Super confidential text with victim@secret.org and +91 98765 43210',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/privacy/redact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Super confidential text with victim@secret.org and +91 98765 43210',
        })
        .expect(200);

      const evidenceCountAfter = await prisma.evidence.count();
      const reportsCountAfter = await prisma.abuseReport.count();
      const incidentsCountAfter = await prisma.incident.count();

      // Assert zero database mutations
      expect(evidenceCountAfter).toBe(evidenceCountBefore);
      expect(reportsCountAfter).toBe(reportsCountBefore);
      expect(incidentsCountAfter).toBe(incidentsCountBefore);
    });
  });
});
