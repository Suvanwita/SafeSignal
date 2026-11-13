import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnalysisType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SafetyIntelligenceService } from './safety-intelligence.service';

describe('SafetyIntelligenceService', () => {
  let service: SafetyIntelligenceService;
  let prisma: jest.Mocked<PrismaService>;

  const userId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const incidentId = '33333333-3333-4333-a333-333333333333';
  const evidenceId = '44444444-4444-4444-a444-444444444444';
  const analysisId = '55555555-5555-4555-a555-555555555555';

  beforeEach(() => {
    prisma = {
      incident: {
        findUnique: jest.fn(),
      },
      evidence: {
        findUnique: jest.fn(),
      },
      analysis: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      timelineEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    service = new SafetyIntelligenceService(prisma);
  });

  describe('analyzeTextForUser', () => {
    it('analyzes text without incident or evidence association and persists analysis', async () => {
      const text = 'Shut up you stupid idiot';
      const createdRecord = {
        id: analysisId,
        userId,
        incidentId: null,
        evidenceId: null,
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
      expect(prisma.analysis.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          incidentId: null,
          evidenceId: null,
          type: AnalysisType.SAFETY_INTELLIGENCE,
        }),
      });
      expect(res.id).toBe(analysisId);
    });

    it('associates analysis with incident and creates timeline event', async () => {
      const text = 'I will hunt you down and kill you!';
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

    it('rejects access if evidence does not belong to specified incident', async () => {
      (prisma.incident.findUnique as jest.Mock).mockResolvedValue({
        id: incidentId,
        userId,
        abuseReports: [],
        suspiciousProfiles: [],
        timelineEvents: [],
      });

      (prisma.evidence.findUnique as jest.Mock).mockResolvedValue({
        id: evidenceId,
        userId,
        incidentId: 'different-incident-id', // mismatch
      });

      await expect(
        service.analyzeTextForUser(userId, {
          text: 'Some evidence text',
          incidentId,
          evidenceId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('skips persistence when persist is false', async () => {
      const res = await service.analyzeTextForUser(userId, {
        text: 'Normal friendly message',
        persist: false,
      });

      expect(res.riskLevel).toBe('LOW');
      expect(res.category).toBe('BENIGN');
      expect(res.id).toBeUndefined();
      expect(prisma.analysis.create).not.toHaveBeenCalled();
    });
  });

  describe('analyzeIncidentForUser', () => {
    it('aggregates reports, profiles, and evidence across incident case', async () => {
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

  describe('analyzeEvidenceForUser', () => {
    it('analyzes evidence record content and creates parent incident timeline event', async () => {
      (prisma.evidence.findUnique as jest.Mock).mockResolvedValue({
        id: evidenceId,
        userId,
        incidentId,
        title: 'Harassing text message export',
        description: 'Stop ignoring me and answer right now or else!',
        sourceUrl: null,
        metadata: {
          text: { sample: 'Why are you running? Answer me right now!' },
        },
      });

      const createdRecord = {
        id: analysisId,
        userId,
        incidentId,
        evidenceId,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        summary: 'Harassment indicators detected',
        confidence: 0.6,
        result: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.analysis.create as jest.Mock).mockResolvedValue(createdRecord);
      (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-3' });

      const res = await service.analyzeEvidenceForUser(userId, evidenceId);

      expect(res.evidenceId).toBe(evidenceId);
      expect(res.incidentId).toBe(incidentId);
      expect(
        res.indicators.some((i) => i.id === 'HARASSMENT_PERSISTENT_PRESSURE'),
      ).toBe(true);
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          incidentId,
          eventType: 'EVIDENCE_SAFETY_ANALYZED',
        }),
      });
    });
  });

  describe('getAnalysesForUser and getAnalysisByIdForUser', () => {
    it('retrieves analysis by ID with ownership enforcement', async () => {
      const mockResult = {
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
      };

      (prisma.analysis.findUnique as jest.Mock).mockResolvedValue({
        id: analysisId,
        userId,
        incidentId,
        evidenceId: null,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        result: mockResult,
        createdAt: new Date(),
      });

      const res = await service.getAnalysisByIdForUser(userId, analysisId);

      expect(res.id).toBe(analysisId);
      expect(res.riskLevel).toBe('HIGH');
    });

    it('rejects retrieval if analysis belongs to another user', async () => {
      (prisma.analysis.findUnique as jest.Mock).mockResolvedValue({
        id: analysisId,
        userId: otherUserId,
        incidentId,
        evidenceId: null,
      });

      await expect(
        service.getAnalysisByIdForUser(userId, analysisId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if analysis does not exist', async () => {
      (prisma.analysis.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getAnalysisByIdForUser(userId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAnalysisForUser', () => {
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
