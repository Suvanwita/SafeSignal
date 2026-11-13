import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AbuseCategory, IncidentStatus, Severity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IncidentReportPdfService,
  sanitizePdfText,
} from './incident-report-pdf.service';

describe('IncidentReportPdfService', () => {
  let service: IncidentReportPdfService;
  let prisma: {
    incident: {
      findUnique: jest.Mock;
    };
  };

  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const incidentId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    prisma = {
      incident: {
        findUnique: jest.fn(),
      },
    };

    service = new IncidentReportPdfService(prisma as unknown as PrismaService);
  });

  describe('sanitizePdfText', () => {
    it('normalizes curly quotes, em-dashes, bullets, and removes emojis', () => {
      const input = '“Threat detected” — suspect alert: 🚨 “target” • arrow →';
      const output = sanitizePdfText(input);

      expect(output).not.toContain('🚨');
      expect(output).toContain('"Threat detected"');
      expect(output).toContain('-');
      expect(output).toContain('*');
      expect(output).toContain('->');
    });

    it('handles null and undefined safely', () => {
      expect(sanitizePdfText(null)).toBe('');
      expect(sanitizePdfText(undefined)).toBe('');
      expect(sanitizePdfText('')).toBe('');
    });
  });

  describe('generateIncidentPdfForUser', () => {
    it('generates a valid binary PDF document for the incident owner', async () => {
      const mockIncident = {
        id: incidentId,
        userId,
        title: 'Targeted Doxxing & Threats Campaign “Urgent” 🚨',
        description: 'Comprehensive case tracking unauthorized personal disclosure.',
        category: AbuseCategory.DOXXING,
        severity: Severity.CRITICAL,
        status: IncidentStatus.OPEN,
        occurredAt: new Date('2026-11-01T10:00:00Z'),
        resolvedAt: null,
        createdAt: new Date('2026-11-01T11:00:00Z'),
        updatedAt: new Date('2026-11-02T12:00:00Z'),
        officialAccount: {
          id: 'acc-1',
          platform: 'X',
          handle: 'official_brand',
          displayName: 'Official Brand',
          isPrimary: true,
        },
        suspiciousProfiles: [
          {
            id: 'isp-1',
            notes: 'Primary threat actor handle spreading leaked files',
            suspiciousProfile: {
              id: 'prof-1',
              platform: 'TELEGRAM',
              handle: 'threat_actor_99',
              displayName: 'Shadow Leaks',
              reviewStatus: 'ESCALATED',
              profileUrl: 'https://t.me/threat_actor_99',
            },
          },
        ],
        abuseReports: [
          {
            id: 'rep-1',
            title: 'Doxxing channel report on Telegram',
            description: 'Offending group channel publishing home addresses.',
            platform: 'TELEGRAM',
            category: AbuseCategory.DOXXING,
            severity: Severity.CRITICAL,
            incidentDate: new Date('2026-11-01T10:00:00Z'),
            targetUrl: 'https://t.me/threat_actor_99/123',
            referenceNumber: 'TG-REPORT-9941',
            reportStatus: 'SUBMITTED',
            createdAt: new Date('2026-11-01T11:30:00Z'),
          },
        ],
        evidence: [
          {
            id: 'ev-1',
            title: 'Telegram Doxxing Chat Log Screenshot',
            fileName: 'doxxing_proof.png',
            mimeType: 'image/png',
            fileSize: 1048576,
            sha256:
              'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            capturedAt: new Date('2026-11-01T10:15:00Z'),
            createdAt: new Date('2026-11-01T12:00:00Z'),
            auditLogs: [
              {
                id: 'audit-1',
                action: 'VERIFY',
                status: 'SUCCESS',
                createdAt: new Date('2026-11-01T12:05:00Z'),
              },
            ],
          },
        ],
        timelineEvents: [
          {
            id: 'evt-1',
            eventType: 'INCIDENT_CREATED',
            title: 'Incident created: Targeted Doxxing',
            description: 'Case opened with CRITICAL severity.',
            occurredAt: new Date('2026-11-01T11:00:00Z'),
            createdAt: new Date('2026-11-01T11:00:00Z'),
          },
          {
            id: 'evt-2',
            eventType: 'EVIDENCE_ATTACHED',
            title: 'Evidence attached: doxxing_proof.png',
            description: 'Cryptographic hash recorded.',
            occurredAt: new Date('2026-11-01T12:00:00Z'),
            createdAt: new Date('2026-11-01T12:00:00Z'),
          },
          {
            id: 'evt-3',
            eventType: 'EVIDENCE_VERIFIED',
            title: 'Evidence integrity verified: doxxing_proof.png',
            description: 'SHA-256 integrity match confirmed.',
            occurredAt: new Date('2026-11-01T12:05:00Z'),
            createdAt: new Date('2026-11-01T12:05:00Z'),
          },
        ],
        analyses: [
          {
            id: 'analysis-1',
            type: 'SAFETY_INTELLIGENCE',
            summary:
              'Elevated risk of severe doxxing and physical intimidation.',
            createdAt: new Date('2026-11-01T12:10:00Z'),
            result: {
              category: 'DOXXING',
              riskLevel: 'HIGH',
              overallScore: 85,
              summary: 'Elevated risk of severe doxxing.',
              indicators: [
                {
                  id: 'ind-1',
                  category: 'THREATS',
                  level: 'HIGH',
                  title: 'Physical Address Disclosure',
                  explanation: 'Detected physical residence publication.',
                },
              ],
              suggestedActions: [
                'Request emergency platform takedown',
                'Notify local emergency dispatch of potential swatting',
              ],
            },
          },
        ],
      };

      prisma.incident.findUnique.mockResolvedValueOnce(mockIncident);

      const result = await service.generateIncidentPdfForUser(
        userId,
        incidentId,
      );

      expect(result).toBeDefined();
      expect(result.filename).toBe(`SafeSignal-Incident-${incidentId.slice(0, 8)}.pdf`);
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer.length).toBeGreaterThan(1000);

      // Verify PDF Magic Bytes (%PDF-)
      const pdfHeader = result.buffer.subarray(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });

    it('generates a clean PDF when optional incident sections are empty', async () => {
      const minimalIncident = {
        id: incidentId,
        userId,
        title: 'Minimal Case',
        description: null,
        category: AbuseCategory.HARASSMENT,
        severity: Severity.LOW,
        status: IncidentStatus.OPEN,
        occurredAt: null,
        resolvedAt: null,
        createdAt: new Date('2026-11-01T11:00:00Z'),
        updatedAt: new Date('2026-11-01T11:00:00Z'),
        officialAccount: null,
        suspiciousProfiles: [],
        abuseReports: [],
        evidence: [],
        timelineEvents: [],
        analyses: [],
      };

      prisma.incident.findUnique.mockResolvedValueOnce(minimalIncident);

      const result = await service.generateIncidentPdfForUser(
        userId,
        incidentId,
      );

      expect(result.buffer.length).toBeGreaterThan(500);
      expect(result.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('throws ForbiddenException when user does not own the incident', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId: otherUserId,
      });

      await expect(
        service.generateIncidentPdfForUser(userId, incidentId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when incident does not exist', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.generateIncidentPdfForUser(userId, incidentId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
