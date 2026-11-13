import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createGlobalValidationPipe } from '../src/common';
import { SAFETY_INTELLIGENCE_DISCLAIMER } from '../src/modules/intelligence/safety-engine/safety-rule-engine.types';
import { PrismaService } from '../src/prisma/prisma.service';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (!process.env.DATABASE_URL && fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

describe('Safety Intelligence Integration (/api/v1/intelligence/safety)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  let userA: { id: string; token: string; email: string };
  let userB: { id: string; token: string; email: string };

  const registerUser = async (label: string) => {
    const email = `safety-${label}-${randomUUID()}@safesignal.test`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Password123!',
        displayName: `Safety ${label}`,
      })
      .expect(201);

    createdUserIds.push(res.body.data.user.id);
    return {
      id: res.body.data.user.id,
      token: res.body.data.accessToken,
      email,
    };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);

    userA = await registerUser('alice');
    userB = await registerUser('bob');
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await app.close();
  });

  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests to analyze-text with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/intelligence/safety/analyze-text')
        .send({ text: 'Some text' })
        .expect(401);
    });

    it('rejects unauthenticated requests to analyses listing with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/intelligence/safety/analyses')
        .expect(401);
    });
  });

  describe('Rule-Based Analysis on Text Content', () => {
    it('analyzes abusive language and classifies as ABUSIVE_LANGUAGE with medium risk', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/intelligence/safety/analyze-text')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          text: 'Shut the fuck up you worthless scum and get lost!',
        })
        .expect(200);

      const data = res.body.data;
      expect(data.category).toBe('ABUSIVE_LANGUAGE');
      expect(data.riskLevel).toBe('MEDIUM');
      expect(data.indicators.length).toBeGreaterThanOrEqual(1);
      expect(data.explanations.length).toBeGreaterThanOrEqual(1);
      expect(data.suggestedActions.length).toBeGreaterThanOrEqual(2);
      expect(data.disclaimer).toBe(SAFETY_INTELLIGENCE_DISCLAIMER);
      expect(data.id).toBeDefined(); // Persisted in PostgreSQL
    });

    it('analyzes threat keywords (violence + extortion + stalking) and flags HIGH risk', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/intelligence/safety/analyze-text')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          text: 'I know where you live. Outside your house right now. Pay me or I will slit your throat and leak your nudes!',
        })
        .expect(200);

      const data = res.body.data;
      expect(data.riskLevel).toBe('HIGH');
      expect(['THREATS', 'MULTI_VECTOR']).toContain(data.category);
      expect(data.overallScore).toBeGreaterThanOrEqual(75);
      expect(
        data.indicators.some((i: { id: string }) =>
          i.id.startsWith('THREAT_'),
        ),
      ).toBe(true);
      expect(
        data.suggestedActions.some((a: string) =>
          a.includes('Emergency Services') || a.includes('112 / 911'),
        ),
      ).toBe(true);
    });

    it('analyzes sensitive personal information (email, phone, Indian address)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/intelligence/safety/analyze-text')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          text: 'Reach me at victim@example.org or 9876543210. Address: Flat 402, 5th Cross Road, Indiranagar, Bangalore 560038.',
        })
        .expect(200);

      const data = res.body.data;
      expect(data.indicators.some((i: { id: string }) => i.id === 'SPI_EMAIL_ADDRESS')).toBe(true);
      expect(data.indicators.some((i: { id: string }) => i.id === 'SPI_PHONE_INDIAN')).toBe(true);
      expect(data.indicators.some((i: { id: string }) => i.id === 'SPI_PHYSICAL_ADDRESS')).toBe(true);
      expect(data.suggestedActions.some((a: string) => a.includes('Privacy') || a.includes('redact'))).toBe(true);
    });

    it('analyzes repeated suspicious activity (duplicate flood statements)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/intelligence/safety/analyze-text')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          text: 'You cannot escape me ever. You cannot escape me ever. You cannot escape me ever.',
        })
        .expect(200);

      const data = res.body.data;
      expect(
        data.indicators.some(
          (i: { id: string }) => i.id === 'ACTIVITY_REPEATED_SUSPICIOUS',
        ),
      ).toBe(true);
      expect(data.metrics.repeatedActivity.duplicateSentences.length).toBeGreaterThan(0);
    });

    it('supports custom keywords in analysis request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/intelligence/safety/analyze-text')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          text: 'We are going to obliterate your network tomorrow.',
          customThreatKeywords: ['obliterate your network'],
        })
        .expect(200);

      const data = res.body.data;
      expect(data.riskLevel).toBe('HIGH');
      expect(
        data.indicators.some((i: { id: string }) => i.id === 'THREAT_CUSTOM_KEYWORDS'),
      ).toBe(true);
    });

    it('honors persist=false by returning result without storing in PostgreSQL', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/intelligence/safety/analyze-text')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          text: 'Just testing without saving',
          persist: false,
        })
        .expect(200);

      expect(res.body.data.id).toBeUndefined();
    });
  });

  describe('Incident Case & Evidence Association', () => {
    let incidentAId: string;
    let evidenceAId: string;
    let abuseReportAId: string;

    beforeAll(async () => {
      // 1. Create an incident for User A
      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          title: 'Cyberbullying and Stalking Campaign',
          description: 'Repeated harassment messages targeting my account',
          category: 'STALKING',
          severity: 'HIGH',
        })
        .expect(201);
      incidentAId = incRes.body.data.id;

      // 2. Submit an abuse report into the incident
      const repRes = await request(app.getHttpServer())
        .post('/api/v1/abuse/reports')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          incidentId: incidentAId,
          title: 'Threatening Instagram DMs',
          description:
            'The perpetrator messaged: I know where you live and I am outside your door right now! Stop ignoring me!',
          category: 'THREATS',
          platform: 'INSTAGRAM',
          severity: 'HIGH',
          incidentDate: new Date().toISOString(),
        })
        .expect(201);
      abuseReportAId = repRes.body.data.id;

      // 3. Upload text evidence into the incident
      const sampleText = Buffer.from(
        'Evidence note: I will slit your throat and leak your nudes to everyone!',
      );
      const evRes = await request(app.getHttpServer())
        .post('/api/v1/evidence/upload')
        .set('Authorization', `Bearer ${userA.token}`)
        .field('incidentId', incidentAId)
        .field('title', 'Threatening chat note')
        .field('description', 'Exported text note')
        .attach('file', sampleText, 'threat-note.txt')
        .expect(201);
      evidenceAId = evRes.body.data.id;
    });

    it('analyzes abuse report descriptions and creates timeline event', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-report/${abuseReportAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({})
        .expect(200);

      const data = res.body.data;
      expect(data.abuseReportId).toBe(abuseReportAId);
      expect(data.incidentId).toBe(incidentAId);
      expect(data.riskLevel).toBe('HIGH');
      expect(
        data.indicators.some(
          (i: { id: string }) => i.id === 'THREAT_STALKING_SURVEILLANCE',
        ),
      ).toBe(true);

      // Verify timeline event
      const timelineEvents = await prisma.timelineEvent.findMany({
        where: {
          incidentId: incidentAId,
          eventType: 'REPORT_SAFETY_ANALYZED',
        },
      });
      expect(timelineEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('detects repeated indicators across multiple reports in the same incident', async () => {
      // Create a second report in the same incident with matching stalking pattern
      const rep2Res = await request(app.getHttpServer())
        .post('/api/v1/abuse/reports')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          incidentId: incidentAId,
          title: 'Second Stalking Message',
          description:
            'Another message: I know where you live and I see you through the window. Stop ignoring me!',
          category: 'THREATS',
          platform: 'INSTAGRAM',
          severity: 'HIGH',
          incidentDate: new Date().toISOString(),
        })
        .expect(201);
      const report2Id = rep2Res.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-report/${report2Id}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({})
        .expect(200);

      const data = res.body.data;
      expect(
        data.indicators.some(
          (i: { id: string }) => i.id === 'INCIDENT_CROSS_REPORT_REPETITION',
        ),
      ).toBe(true);
    });

    it('avoids duplicate analysis records when the same report is submitted repeatedly', async () => {
      // Count analysis records before re-submission
      const countBefore = await prisma.analysis.count({
        where: { abuseReportId: abuseReportAId },
      });
      const timelineCountBefore = await prisma.timelineEvent.count({
        where: {
          incidentId: incidentAId,
          eventType: 'REPORT_SAFETY_ANALYZED',
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-report/${abuseReportAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({})
        .expect(200);

      const countAfter = await prisma.analysis.count({
        where: { abuseReportId: abuseReportAId },
      });
      const timelineCountAfter = await prisma.timelineEvent.count({
        where: {
          incidentId: incidentAId,
          eventType: 'REPORT_SAFETY_ANALYZED',
        },
      });

      // Assert no duplicate record or timeline event was created
      expect(countAfter).toBe(countBefore);
      expect(timelineCountAfter).toBe(timelineCountBefore);
      expect(res.body.data.id).toBeDefined();
    });

    it('analyzes text extracted from supported evidence files (decrypted TXT via vault storage)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-evidence/${evidenceAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({})
        .expect(200);

      const data = res.body.data;
      expect(data.evidenceId).toBe(evidenceAId);
      expect(data.incidentId).toBe(incidentAId);
      expect(data.riskLevel).toBe('HIGH');
      // Verify violence threat keywords from file content were detected
      expect(
        data.indicators.some(
          (i: { id: string }) => i.id === 'THREAT_VIOLENCE_EXPLICIT',
        ),
      ).toBe(true);
    });

    it('avoids duplicate analysis records when the same evidence is analyzed repeatedly', async () => {
      const countBefore = await prisma.analysis.count({
        where: { evidenceId: evidenceAId },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-evidence/${evidenceAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({})
        .expect(200);

      const countAfter = await prisma.analysis.count({
        where: { evidenceId: evidenceAId },
      });

      expect(countAfter).toBe(countBefore);
    });

    it('runs analyze-incident on entire case and stores analysis with timeline event', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-incident/${incidentAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({})
        .expect(200);

      const data = res.body.data;
      expect(data.incidentId).toBe(incidentAId);
      expect(data.riskLevel).toBe('HIGH');
      expect(data.indicators.length).toBeGreaterThanOrEqual(1);

      // Verify PostgreSQL record in analyses table
      const storedAnalysis = await prisma.analysis.findUnique({
        where: { id: data.id },
      });
      expect(storedAnalysis).toBeDefined();
      expect(storedAnalysis?.incidentId).toBe(incidentAId);
      expect(storedAnalysis?.userId).toBe(userA.id);

      // Verify TimelineEvent was logged
      const timelineEvents = await prisma.timelineEvent.findMany({
        where: { incidentId: incidentAId, eventType: 'SAFETY_ANALYSIS_COMPLETED' },
      });
      expect(timelineEvents.length).toBeGreaterThanOrEqual(1);
      expect(timelineEvents[0].title).toContain('Safety Intelligence');
    });

    it('runs analyze-evidence on evidence record and links to evidence and incident', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-evidence/${evidenceAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({})
        .expect(200);

      const data = res.body.data;
      expect(data.evidenceId).toBe(evidenceAId);
      expect(data.incidentId).toBe(incidentAId);

      const stored = await prisma.analysis.findUnique({
        where: { id: data.id },
      });
      expect(stored?.evidenceId).toBe(evidenceAId);
      expect(stored?.incidentId).toBe(incidentAId);
    });

    it('lists stored analyses filtered by incidentId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/intelligence/safety/analyses?incidentId=${incidentAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(200);

      const items = res.body.data;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.every((it: { incidentId: string }) => it.incidentId === incidentAId)).toBe(true);
    });
  });

  describe('IDOR & Access Control Protections', () => {
    let incidentAId: string;
    let analysisAId: string;

    beforeAll(async () => {
      const incRes = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          title: 'Alice Private Incident',
          category: 'HARASSMENT',
        })
        .expect(201);
      incidentAId = incRes.body.data.id;

      const anaRes = await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-incident/${incidentAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({})
        .expect(200);
      analysisAId = anaRes.body.data.id;
    });

    it('prevents User B from running safety analysis on User A incident (403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-incident/${incidentAId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({})
        .expect(403);
    });

    it('prevents User B from running safety analysis on User A abuse report (403)', async () => {
      // Create an abuse report owned by User A
      const repRes = await request(app.getHttpServer())
        .post('/api/v1/abuse/reports')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          title: 'Alice Private Abuse Report',
          description: 'Private threatening message received from an unknown sender',
          category: 'THREATS',
          platform: 'X',
          severity: 'HIGH',
          incidentDate: new Date().toISOString(),
        })
        .expect(201);
      const reportId = repRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/intelligence/safety/analyze-report/${reportId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({})
        .expect(403);
    });

    it('prevents User B from retrieving User A analysis record (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/intelligence/safety/analyses/${analysisAId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(403);
    });

    it('prevents User B from deleting User A analysis record (403)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/intelligence/safety/analyses/${analysisAId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(403);
    });

    it('allows User A to delete their own analysis record', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/intelligence/safety/analyses/${analysisAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/intelligence/safety/analyses/${analysisAId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(404);
    });
  });
});
