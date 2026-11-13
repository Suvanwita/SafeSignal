import { Readable } from 'node:stream';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnalysisType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VaultStorageService } from '../evidence/vault-storage.service';
import { SafetyIntelligenceService } from './safety-intelligence.service';

describe('SafetyIntelligenceService', () => {
  let service: SafetyIntelligenceService;
  let prisma: jest.Mocked<PrismaService>;
  let vaultStorageService: jest.Mocked<VaultStorageService>;

  const userId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const incidentId = '33333333-3333-4333-a333-333333333333';
  const evidenceId = '44444444-4444-4444-a444-444444444444';
  const abuseReportId = '77777777-7777-4777-a777-777777777777';
  const analysisId = '55555555-5555-4555-a555-555555555555';

  beforeEach(() => {
    prisma = {
      incident: {
        findUnique: jest.fn(),
      },
      evidence: {
        findUnique: jest.fn(),
      },
      abuseReport: {
        findUnique: jest.fn(),
      },
      analysis: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      timelineEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    vaultStorageService = {
      getReadStream: jest.fn(),
    } as unknown as jest.Mocked<VaultStorageService>;

    service = new SafetyIntelligenceService(prisma, vaultStorageService);
  });

  describe('analyzeTextForUser', () => {
    it('analyzes text without incident or evidence association and persists analysis', async () => {
      const text = 'Shut up you stupid idiot';
      (prisma.analysis.findFirst as jest.Mock).mockResolvedValue(null);

      const createdRecord = {
        id: analysisId,
        userId,
        incidentId: null,
        evidenceId: null,
        abuseReportId: null,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        summary: 'Low safety risk',
        confidence: 0.1,
        result: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.analysis.create as jest.Mock).mockResolvedValue(createdRecord);

      const res = await service.analyzeTextForUser(userId, { text });

      expect(res.riskLevel).toBe('LOW');
      expect(res.category).toBe('ABUSIVE_LANGUAGE');
      expect(prisma.analysis.create).toHaveBeenCalled();
      expect(res.id).toBe(analysisId);
    });

    it('avoids duplicate analysis records when same content is submitted repeatedly', async () => {
      const text = 'Identical threat content submitted twice';
      const existingAnalysis = {
        id: analysisId,
        userId,
        incidentId: null,
        evidenceId: null,
        abuseReportId: null,
        contentHash: 'some-hash',
        type: AnalysisType.SAFETY_INTELLIGENCE,
        result: {
          category: 'THREATS',
          secondaryCategories: [],
          riskLevel: 'HIGH',
          overallScore: 85,
          summary: 'High safety risk identified',
          indicators: [],
          explanations: [],
          suggestedActions: [],
          disclaimer: 'Legal disclaimer',
          metrics: { textLength: 40, wordCount: 5, repeatedActivity: {} },
          analyzedAt: new Date().toISOString(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock that existing record is found on duplicate check
      (prisma.analysis.findFirst as jest.Mock).mockResolvedValue(existingAnalysis);

      const res = await service.analyzeTextForUser(userId, { text, persist: true });

      expect(res.id).toBe(analysisId);
      expect(res.riskLevel).toBe('HIGH');
      // Verify no duplicate creation or timeline insertion occurred
      expect(prisma.analysis.create).not.toHaveBeenCalled();
      expect(prisma.timelineEvent.create).not.toHaveBeenCalled();
    });

    it('associates analysis with incident and creates timeline event', async () => {
      const text = 'I will hunt you down and kill you!';
      (prisma.analysis.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.incident.findUnique as jest.Mock).mockResolvedValue({
        id: incidentId,
        userId,
        abuseReports: [{ severity: 'HIGH' }],
        suspiciousProfiles: [],
        timelineEvents: [],
      });

      const createdRecord = {
        id: analysisId,
        userId,
        incidentId,
        evidenceId: null,
        abuseReportId: null,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        summary: 'High safety risk identified',
        confidence: 0.85,
        result: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.analysis.create as jest.Mock).mockResolvedValue(createdRecord);
      (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-1' });

      const res = await service.analyzeTextForUser(userId, {
        text,
        incidentId,
      });

      expect(res.riskLevel).toBe('HIGH');
      expect(res.category).toBe('THREATS');
      expect(res.incidentId).toBe(incidentId);
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          incidentId,
          eventType: 'SAFETY_ANALYSIS_COMPLETED',
        }),
      });
    });

    it('rejects access if incident belongs to another user (IDOR prevention)', async () => {
      (prisma.incident.findUnique as jest.Mock).mockResolvedValue({
        id: incidentId,
        userId: otherUserId, // Different owner!
        abuseReports: [],
        suspiciousProfiles: [],
        timelineEvents: [],
      });

      await expect(
        service.analyzeTextForUser(userId, {
          text: 'Threatening text',
          incidentId,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.analysis.create).not.toHaveBeenCalled();
    });
  });

  describe('analyzeAbuseReportForUser', () => {
    it('analyzes abuse report description and links to report and incident', async () => {
      (prisma.analysis.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.abuseReport.findUnique as jest.Mock).mockResolvedValue({
        id: abuseReportId,
        userId,
        incidentId,
        title: 'Threatening Instagram Message',
        description: 'Perpetrator messaged: Pay me or I will slit your throat and leak your photos!',
        category: 'THREATS',
        platform: 'INSTAGRAM',
        targetUrl: 'https://instagram.com/p/123',
        incident: {
          title: 'Stalking Case',
          abuseReports: [],
          suspiciousProfiles: [],
          timelineEvents: [],
        },
      });

      const createdRecord = {
        id: analysisId,
        userId,
        incidentId,
        evidenceId: null,
        abuseReportId,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        summary: 'High safety risk',
        confidence: 0.9,
        result: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.analysis.create as jest.Mock).mockResolvedValue(createdRecord);
      (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-rep' });

      const res = await service.analyzeAbuseReportForUser(userId, abuseReportId);

      expect(res.abuseReportId).toBe(abuseReportId);
      expect(res.incidentId).toBe(incidentId);
      expect(res.riskLevel).toBe('HIGH');
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          incidentId,
          eventType: 'REPORT_SAFETY_ANALYZED',
        }),
      });
    });

    it('detects repeated threat indicators across multiple reports in the same incident', async () => {
      (prisma.analysis.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.abuseReport.findUnique as jest.Mock).mockResolvedValue({
        id: abuseReportId,
        userId,
        incidentId,
        title: 'Second Extortion Message',
        description: 'I will slit your throat if you ignore me!',
        category: 'THREATS',
        platform: 'INSTAGRAM',
        targetUrl: null,
        incident: {
          title: 'Ongoing Extortion Case',
          abuseReports: [
            {
              id: 'other-rep-1',
              title: 'First Threat',
              description: 'Sender said I will slit your throat and know where you live.',
              category: 'THREATS',
              severity: 'HIGH',
            },
          ],
          suspiciousProfiles: [],
          timelineEvents: [],
        },
      });

      const createdRecord = {
        id: analysisId,
        userId,
        incidentId,
        evidenceId: null,
        abuseReportId,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        summary: 'High safety risk',
        confidence: 0.9,
        result: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.analysis.create as jest.Mock).mockResolvedValue(createdRecord);
      (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-rep-2' });

      const res = await service.analyzeAbuseReportForUser(userId, abuseReportId);

      expect(res.riskLevel).toBe('HIGH');
      expect(
        res.indicators.some((i) => i.id === 'INCIDENT_CROSS_REPORT_REPETITION'),
      ).toBe(true);
    });

    it('rejects analysis if abuse report belongs to another user (IDOR check)', async () => {
      (prisma.abuseReport.findUnique as jest.Mock).mockResolvedValue({
        id: abuseReportId,
        userId: otherUserId, // other user
      });

      await expect(
        service.analyzeAbuseReportForUser(userId, abuseReportId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('analyzeEvidenceForUser', () => {
    it('analyzes text extracted from supported evidence files (TXT via vault storage)', async () => {
      (prisma.analysis.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.evidence.findUnique as jest.Mock).mockResolvedValue({
        id: evidenceId,
        userId,
        incidentId,
        title: 'Threatening Chat Log Export',
        description: 'Exported text message log',
        sourceUrl: null,
        storageKey: 'incident-1/chat-log.txt',
        mimeType: 'text/plain',
        fileName: 'chat-log.txt',
        metadata: {
          text: { sample: 'Preview line' },
        },
      });

      // Mock decrypted file stream from vault storage
      const rawText = 'I know where you live. Stop ignoring me and answer right now!';
      (vaultStorageService.getReadStream as jest.Mock).mockResolvedValue({
        stream: Readable.from([Buffer.from(rawText)]),
        size: rawText.length,
      });

      const createdRecord = {
        id: analysisId,
        userId,
        incidentId,
        evidenceId,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        summary: 'Threat and harassment indicators detected',
        confidence: 0.85,
        result: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.analysis.create as jest.Mock).mockResolvedValue(createdRecord);
      (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-3' });

      const res = await service.analyzeEvidenceForUser(userId, evidenceId);

      expect(res.evidenceId).toBe(evidenceId);
      expect(res.riskLevel).toBe('HIGH');
      expect(
        res.indicators.some((i) => i.id === 'THREAT_STALKING_SURVEILLANCE'),
      ).toBe(true);
      expect(vaultStorageService.getReadStream).toHaveBeenCalledWith(
        'incident-1/chat-log.txt',
      );
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          incidentId,
          eventType: 'EVIDENCE_SAFETY_ANALYZED',
        }),
      });
    });

    it('avoids duplicate analysis records when evidence text has already been analyzed', async () => {
      (prisma.evidence.findUnique as jest.Mock).mockResolvedValue({
        id: evidenceId,
        userId,
        incidentId,
        title: 'Identical Evidence Note',
        description: 'Previously analyzed',
        storageKey: null,
        metadata: null,
      });

      const existingAnalysis = {
        id: analysisId,
        userId,
        incidentId,
        evidenceId,
        abuseReportId: null,
        contentHash: 'hash',
        type: AnalysisType.SAFETY_INTELLIGENCE,
        result: {
          category: 'HARASSMENT',
          secondaryCategories: [],
          riskLevel: 'MEDIUM',
          overallScore: 50,
          summary: 'Medium harassment risk',
          indicators: [],
          explanations: [],
          suggestedActions: [],
          disclaimer: 'Disclaimer',
          metrics: { textLength: 30, wordCount: 4, repeatedActivity: {} },
          analyzedAt: new Date().toISOString(),
        },
        createdAt: new Date(),
      };

      (prisma.analysis.findFirst as jest.Mock).mockResolvedValue(existingAnalysis);

      const res = await service.analyzeEvidenceForUser(userId, evidenceId);

      expect(res.id).toBe(analysisId);
      expect(prisma.analysis.create).not.toHaveBeenCalled();
      expect(prisma.timelineEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('analyzeIncidentForUser', () => {
    it('aggregates reports, profiles, and evidence across incident case', async () => {
      (prisma.analysis.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.incident.findUnique as jest.Mock).mockResolvedValue({
        id: incidentId,
        userId,
        title: 'Harassment on Social Platform',
        description: 'Persistent unwanted contact',
        abuseReports: [
          {
            title: 'Threatening DMs',
            description: 'Sender said I know where you live and outside your house.',
            platform: 'INSTAGRAM',
            category: 'HARASSMENT',
            severity: 'HIGH',
          },
        ],
        suspiciousProfiles: [
          {
            suspiciousProfile: {
              handle: 'stalker_99',
              platform: 'INSTAGRAM',
              displayName: 'Watching You',
              bio: 'You cannot hide',
              notes: 'Multiple accounts created',
            },
          },
        ],
        evidence: [
          {
            title: 'Screenshot of threat',
            description: 'Contains phone +91 9876543210',
          },
        ],
        timelineEvents: [
          { id: 'te-1', title: 'Case opened' },
          { id: 'te-2', title: 'Second threat received' },
        ],
      });

      const createdRecord = {
        id: analysisId,
        userId,
        incidentId,
        evidenceId: null,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        summary: 'High safety risk',
        confidence: 0.9,
        result: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.analysis.create as jest.Mock).mockResolvedValue(createdRecord);
      (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-2' });

      const res = await service.analyzeIncidentForUser(userId, incidentId);

      expect(res.riskLevel).toBe('HIGH');
      expect(res.indicators.length).toBeGreaterThanOrEqual(2);
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          incidentId,
          eventType: 'SAFETY_ANALYSIS_COMPLETED',
        }),
      });
    });
  });

  describe('getAnalysesForUser, getAnalysisByIdForUser, deleteAnalysisForUser', () => {
    it('filters analyses by abuseReportId', async () => {
      (prisma.analysis.findMany as jest.Mock).mockResolvedValue([
        {
          id: analysisId,
          userId,
          incidentId,
          evidenceId: null,
          abuseReportId,
          type: AnalysisType.SAFETY_INTELLIGENCE,
          result: {
            category: 'THREATS',
            secondaryCategories: [],
            riskLevel: 'HIGH',
            overallScore: 85,
            summary: 'High risk threats',
            indicators: [],
            explanations: ['Explanation 1'],
            suggestedActions: ['Action 1'],
            disclaimer: 'Disclaimer text',
            metrics: { textLength: 50, wordCount: 8, repeatedActivity: {} },
            analyzedAt: new Date().toISOString(),
          },
          createdAt: new Date(),
        },
      ]);

      const list = await service.getAnalysesForUser(userId, { abuseReportId });

      expect(list.length).toBe(1);
      expect(list[0].abuseReportId).toBe(abuseReportId);
      expect(prisma.analysis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            abuseReportId,
          }),
        }),
      );
    });

    it('rejects retrieval if analysis belongs to another user', async () => {
      (prisma.analysis.findUnique as jest.Mock).mockResolvedValue({
        id: analysisId,
        userId: otherUserId,
      });

      await expect(
        service.getAnalysisByIdForUser(userId, analysisId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deletes analysis when owned by user', async () => {
      (prisma.analysis.findUnique as jest.Mock).mockResolvedValue({
        id: analysisId,
        userId,
      });
      (prisma.analysis.delete as jest.Mock).mockResolvedValue({ id: analysisId });

      const res = await service.deleteAnalysisForUser(userId, analysisId);

      expect(res.deleted).toBe(true);
      expect(prisma.analysis.delete).toHaveBeenCalledWith({
        where: { id: analysisId },
      });
    });
  });
});
