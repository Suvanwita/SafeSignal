import {
  ConfidenceLevel,
  RedactionStrategy,
  SensitiveCategory,
} from './dto/sensitive-category.enum';
import { PrivacyService } from './privacy.service';

describe('PrivacyService', () => {
  let service: PrivacyService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      incident: {
        findUnique: jest.fn(),
      },
      timelineEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-priv-1' }),
      },
    };
    service = new PrivacyService(prismaMock);
  });

  describe('scanText', () => {
    it('returns empty detections when text has no sensitive personal data', async () => {
      const res = await service.scanText({
        text: 'This is a public press release about cybersecurity without any private details.',
      });

      expect(res.hasSensitiveData).toBe(false);
      expect(res.totalDetections).toBe(0);
      expect(res.detections).toEqual([]);
      expect(res.categoryBreakdown).toEqual({
        [SensitiveCategory.EMAIL]: 0,
        [SensitiveCategory.PHONE_INDIAN]: 0,
        [SensitiveCategory.PHONE_INTERNATIONAL]: 0,
        [SensitiveCategory.ADDRESS]: 0,
      });
      expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('identifies and categorizes emails, Indian phones, international phones, and addresses', async () => {
      const text =
        'Contact Jane Doe at jane.doe@example.com or mobile +91 98765 43210. Overseas rep: +44 20 7946 0958. Address: 123 Main Street, Suite 400, Springfield, IL 62701.';

      const res = await service.scanText({ text });

      expect(res.hasSensitiveData).toBe(true);
      expect(res.totalDetections).toBe(4);
      expect(res.categoryBreakdown[SensitiveCategory.EMAIL]).toBe(1);
      expect(res.categoryBreakdown[SensitiveCategory.PHONE_INDIAN]).toBe(1);
      expect(res.categoryBreakdown[SensitiveCategory.PHONE_INTERNATIONAL]).toBe(1);
      expect(res.categoryBreakdown[SensitiveCategory.ADDRESS]).toBe(1);

      // Verify detections have accurate match positions
      for (const d of res.detections) {
        expect(text.slice(d.start, d.end)).toBe(d.text);
        expect(d.explanation).toBeDefined();
      }
    });

    it('respects requested category filter', async () => {
      const text =
        'Call +91 98765 43210 or email test@example.com at 10 Downing Street, London.';

      const res = await service.scanText({
        text,
        categories: [SensitiveCategory.EMAIL],
      });

      expect(res.totalDetections).toBe(1);
      expect(res.detections[0].category).toBe(SensitiveCategory.EMAIL);
      expect(res.categoryBreakdown[SensitiveCategory.EMAIL]).toBe(1);
      expect(res.categoryBreakdown[SensitiveCategory.PHONE_INDIAN]).toBe(0);
    });

    it('creates a PRIVACY_SCAN_COMPLETED timeline event when incidentId and userId are provided', async () => {
      prismaMock.incident.findUnique.mockResolvedValue({
        id: 'inc-123',
        userId: 'user-456',
        title: 'Harassment Case',
      });

      const text = 'Send funds to victim@secure.org or call +91 98765 43210';
      const res = await service.scanText(
        { text, incidentId: 'inc-123' },
        'user-456',
      );

      expect(res.totalDetections).toBe(2);
      expect(prismaMock.timelineEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-456',
          incidentId: 'inc-123',
          eventType: 'PRIVACY_SCAN_COMPLETED',
          title: expect.stringContaining('Privacy scan completed (2 sensitive items detected)'),
          occurredAt: expect.any(Date),
        }),
      });
    });
  });

  describe('scanIncidentForUser', () => {
    it('aggregates incident textual content and records PRIVACY_SCAN_COMPLETED', async () => {
      prismaMock.incident.findUnique.mockResolvedValue({
        id: 'inc-case-1',
        userId: 'user-owner',
        title: 'Extortion Investigation',
        description: 'Blackmailer claims to have photos.',
        abuseReports: [
          {
            title: 'Threat on WhatsApp',
            description: 'Perpetrator gave email extortionist@evil.com to pay.',
            platform: 'WHATSAPP',
          },
        ],
        evidence: [
          {
            title: 'Chat Export',
            description: 'Transcript containing phone +91 98765 43210',
          },
        ],
      });

      const res = await service.scanIncidentForUser('user-owner', 'inc-case-1');

      expect(res.hasSensitiveData).toBe(true);
      expect(res.totalDetections).toBeGreaterThan(0);
      expect(prismaMock.timelineEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-owner',
          incidentId: 'inc-case-1',
          eventType: 'PRIVACY_SCAN_COMPLETED',
        }),
      });
    });
  });

  describe('redactText', () => {
    it('redacts sensitive information with default CATEGORY_LABEL strategy', async () => {
      const text =
        'Notify john@safesignal.org at +91 98765 43210. Location: Flat 204, Sector 14, Gurgaon 122001.';

      const res = await service.redactText({ text });

      expect(res.redactedText).toContain('[REDACTED_EMAIL]');
      expect(res.redactedText).toContain('[REDACTED_PHONE]');
      expect(res.redactedText).toContain('[REDACTED_ADDRESS]');
      expect(res.redactionCount).toBe(3);
      expect(res.appliedStrategy).toBe(RedactionStrategy.CATEGORY_LABEL);
    });

    it('redacts sensitive information using PARTIAL_MASK strategy', async () => {
      const text = 'Reach out to alex@company.org or +91 98765 43210.';

      const res = await service.redactText({
        text,
        strategy: RedactionStrategy.PARTIAL_MASK,
      });

      expect(res.redactedText).toContain('a***x@company.org');
      expect(res.redactedText).toContain('+91 ******3210');
      expect(res.redactionCount).toBe(2);
    });

    it('redacts sensitive information using CUSTOM placeholder', async () => {
      const text = 'Email: confidential@victim.com';

      const res = await service.redactText({
        text,
        strategy: RedactionStrategy.CUSTOM,
        customPlaceholder: '[SECRET]',
      });

      expect(res.redactedText).toBe('Email: [SECRET]');
      expect(res.redactionCount).toBe(1);
    });
  });
});
