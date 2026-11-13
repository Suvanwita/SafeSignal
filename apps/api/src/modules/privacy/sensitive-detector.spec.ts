import {
  ConfidenceLevel,
  RedactionStrategy,
  SensitiveCategory,
} from './dto/sensitive-category.enum';
import { detectAddresses } from './sensitive-detector/address-detector';
import { detectEmails } from './sensitive-detector/email-detector';
import {
  detectIndianPhones,
  detectInternationalPhones,
} from './sensitive-detector/phone-detector';
import { redactSensitiveData } from './sensitive-detector/redactor';
import { scanSensitiveData } from './sensitive-detector/sensitive-data-detector';

describe('Sensitive Information Detection Engine', () => {
  describe('Email Detection', () => {
    it('detects standard emails with high confidence', () => {
      const text =
        'Contact support at support@safesignal.org or security@company.co.in.';
      const matches = detectEmails(text);

      expect(matches).toHaveLength(2);
      expect(matches[0].category).toBe(SensitiveCategory.EMAIL);
      expect(matches[0].text).toBe('support@safesignal.org');
      expect(matches[0].confidence).toBe(ConfidenceLevel.HIGH);
      // Ensures trailing dot was stripped
      expect(matches[1].text).toBe('security@company.co.in');
      expect(matches[1].confidence).toBe(ConfidenceLevel.HIGH);
    });

    it('handles email with plus-tags and numbers', () => {
      const text = 'Send invoice to user.name+billing123@sub.domain.com immediately';
      const matches = detectEmails(text);

      expect(matches).toHaveLength(1);
      expect(matches[0].text).toBe('user.name+billing123@sub.domain.com');
      expect(text.slice(matches[0].start, matches[0].end)).toBe(
        'user.name+billing123@sub.domain.com',
      );
    });

    it('rejects invalid email formats and edge cases', () => {
      const text =
        'Fake items: user..name@domain.com, missingtld@localhost, @nodomain.com, plainword';
      const matches = detectEmails(text);

      expect(matches).toHaveLength(0);
    });
  });

  describe('Indian Phone Number Detection', () => {
    it('detects 10-digit Indian mobile numbers with prefixes (+91, 91, 0, none)', () => {
      const samples = [
        '+91 98765 43210',
        '+91-98765-43210',
        '+919876543210',
        '919876543210',
        '09876543210',
        '98765 43210',
        '98765-43210',
        '9876543210',
        '8876543210',
        '7876543210',
        '6876543210',
      ];

      for (const sample of samples) {
        const text = `Call victim at ${sample} for verification`;
        const matches = detectIndianPhones(text);
        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches[0].category).toBe(SensitiveCategory.PHONE_INDIAN);
        expect(text.slice(matches[0].start, matches[0].end)).toBe(sample);
      }
    });

    it('detects Indian landlines with STD codes', () => {
      const text = 'Delhi office: 011-23456789, Bangalore office: 080-23456789';
      const matches = detectIndianPhones(text);

      expect(matches.length).toBe(2);
      expect(matches[0].category).toBe(SensitiveCategory.PHONE_INDIAN);
      expect(matches[0].detectionType).toBe('PHONE_INDIAN_LANDLINE');
    });

    it('does not falsely trigger on 10-digit numbers starting with 1-5 or dates', () => {
      const falsePositives = [
        'Order ID: 1234567890',
        'Reference: 5551234567',
        'Date timestamp: 2026-11-13',
        'Numeric code: 12345',
        'Long serial: 98765432109876',
      ];

      for (const sample of falsePositives) {
        const matches = detectIndianPhones(sample);
        expect(matches).toHaveLength(0);
      }
    });
  });

  describe('International Phone Number Detection', () => {
    it('detects international phone numbers matching E.164 and country formats', () => {
      const samples = [
        '+1 (555) 234-5678',
        '+1-800-555-0199',
        '+44 20 7946 0958',
        '+44 7911 123456',
        '+61 412 345 678',
        '+49 30 123456',
        '+971 50 123 4567',
      ];

      for (const sample of samples) {
        const text = `Contact foreign office at ${sample} right away`;
        const matches = detectInternationalPhones(text);
        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches[0].category).toBe(SensitiveCategory.PHONE_INTERNATIONAL);
        expect(text.slice(matches[0].start, matches[0].end)).toBe(sample);
      }
    });

    it('ignores mathematical expressions, diffs, and non-phones', () => {
      const nonPhones = [
        'Calculation: +1 - 2 + 3 = 2',
        'Diff: + 123456',
        'Version: v1.2.3',
        'IP: 192.168.1.1',
      ];

      for (const sample of nonPhones) {
        const matches = detectInternationalPhones(sample);
        expect(matches).toHaveLength(0);
      }
    });
  });

  describe('Address Heuristics Detection', () => {
    it('detects multi-part premise and locality addresses with PIN code', () => {
      const text =
        'Victim resides at Flat 402, Sunshine Apartments, 5th Cross Road, Indiranagar, Bangalore 560038.';
      const matches = detectAddresses(text);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].category).toBe(SensitiveCategory.ADDRESS);
      expect(matches[0].confidence).toBe(ConfidenceLevel.HIGH);
      expect(matches[0].text).toContain('Sunshine Apartments');
      expect(matches[0].text).toContain('560038');
    });

    it('detects standard US numbered street address with ZIP code', () => {
      const text =
        'Dispatch package to 123 Main Street, Suite 400, Springfield, IL 62701 before noon.';
      const matches = detectAddresses(text);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].category).toBe(SensitiveCategory.ADDRESS);
      expect(matches[0].text).toContain('123 Main Street');
      expect(matches[0].text).toContain('62701');
    });

    it('detects labeled address blocks', () => {
      const text =
        'Address: Plot 45, Sector 18, Gurgaon, Haryana 122001.\nStatus: Active';
      const matches = detectAddresses(text);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].category).toBe(SensitiveCategory.ADDRESS);
      expect(matches[0].text).toContain('Plot 45, Sector 18');
    });

    it('detects Indian locality with 6-digit PIN code', () => {
      const text =
        'Office located in Connaught Place, New Delhi - 110001 near metro.';
      const matches = detectAddresses(text);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].category).toBe(SensitiveCategory.ADDRESS);
      expect(matches[0].text).toContain('110001');
    });

    it('does not trigger on plain sentences with generic road words', () => {
      const text =
        'We were walking down the road when we decided to cross the street.';
      const matches = detectAddresses(text);

      expect(matches).toHaveLength(0);
    });
  });

  describe('Integrated Sensitive Data Detector & Overlap Resolution', () => {
    it('scans mixed text and resolves overlapping entities cleanly', () => {
      const mixedText =
        'Send harassment report to analyst@safesignal.org or call +91 98765 43210. Offender target: Flat 101, Palm Grove, MG Road, Bangalore 560001. International contact: +1 (555) 234-5678.';

      const matches = scanSensitiveData(mixedText);

      expect(matches.length).toBe(4);
      expect(matches.map((m) => m.category)).toEqual([
        SensitiveCategory.EMAIL,
        SensitiveCategory.PHONE_INDIAN,
        SensitiveCategory.ADDRESS,
        SensitiveCategory.PHONE_INTERNATIONAL,
      ]);

      // Verify no overlaps exist in matches
      for (let i = 0; i < matches.length - 1; i++) {
        expect(matches[i].end).toBeLessThanOrEqual(matches[i + 1].start);
      }
    });

    it('filters by category when specified', () => {
      const text =
        'Contact test@example.com or +91 98765 43210 at 123 Main Street.';
      const emailOnly = scanSensitiveData(text, {
        categories: [SensitiveCategory.EMAIL],
      });

      expect(emailOnly).toHaveLength(1);
      expect(emailOnly[0].category).toBe(SensitiveCategory.EMAIL);
    });

    it('filters by minimum confidence threshold', () => {
      const text = 'PIN Code: 560001';
      const lowMatches = scanSensitiveData(text, {
        minConfidence: ConfidenceLevel.LOW,
      });
      const highMatches = scanSensitiveData(text, {
        minConfidence: ConfidenceLevel.HIGH,
      });

      expect(lowMatches.length).toBeGreaterThanOrEqual(1);
      expect(highMatches).toHaveLength(0);
    });
  });

  describe('Redaction Engine', () => {
    const sampleText =
      'Please email victim@safesignal.org or call +91 98765 43210. Location: 123 Main Street, Bangalore 560001.';

    it('applies CATEGORY_LABEL strategy', () => {
      const matches = scanSensitiveData(sampleText);
      const { redactedText, appliedRedactions } = redactSensitiveData(
        sampleText,
        matches,
        { strategy: RedactionStrategy.CATEGORY_LABEL },
      );

      expect(redactedText).toContain('[REDACTED_EMAIL]');
      expect(redactedText).toContain('[REDACTED_PHONE]');
      expect(redactedText).toContain('[REDACTED_ADDRESS]');
      expect(redactedText).not.toContain('victim@safesignal.org');
      expect(redactedText).not.toContain('98765 43210');
      expect(appliedRedactions).toHaveLength(3);
    });

    it('applies PARTIAL_MASK strategy preserving structure', () => {
      const matches = scanSensitiveData(sampleText);
      const { redactedText } = redactSensitiveData(sampleText, matches, {
        strategy: RedactionStrategy.PARTIAL_MASK,
      });

      expect(redactedText).toContain('v***m@safesignal.org');
      expect(redactedText).toContain('+91 ******3210');
      expect(redactedText).not.toContain('victim@safesignal.org');
    });

    it('applies FULL_MASK strategy with asterisks', () => {
      const text = 'Email: test@example.com';
      const matches = scanSensitiveData(text);
      const { redactedText } = redactSensitiveData(text, matches, {
        strategy: RedactionStrategy.FULL_MASK,
      });

      expect(redactedText).toBe(`Email: ${'*'.repeat('test@example.com'.length)}`);
    });

    it('applies HASH strategy', () => {
      const text = 'Phone: +91 98765 43210';
      const matches = scanSensitiveData(text);
      const { redactedText } = redactSensitiveData(text, matches, {
        strategy: RedactionStrategy.HASH,
      });

      expect(redactedText).toMatch(/Phone: \[HASH:[a-f0-9]{8}\]/);
    });

    it('applies CUSTOM strategy and custom category placeholders', () => {
      const matches = scanSensitiveData(sampleText);
      const { redactedText } = redactSensitiveData(sampleText, matches, {
        strategy: RedactionStrategy.CATEGORY_LABEL,
        customCategoryPlaceholders: {
          [SensitiveCategory.EMAIL]: '<HIDDEN_EMAIL>',
          [SensitiveCategory.PHONE_INDIAN]: '<HIDDEN_PHONE>',
        },
      });

      expect(redactedText).toContain('<HIDDEN_EMAIL>');
      expect(redactedText).toContain('<HIDDEN_PHONE>');
      expect(redactedText).toContain('[REDACTED_ADDRESS]');
    });

    it('applies REMOVE strategy', () => {
      const text = 'Send to test@example.com now';
      const matches = scanSensitiveData(text);
      const { redactedText } = redactSensitiveData(text, matches, {
        strategy: RedactionStrategy.REMOVE,
      });

      expect(redactedText).toBe('Send to  now');
    });
  });
});
