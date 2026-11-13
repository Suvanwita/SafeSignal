import {
  ConfidenceLevel,
  SensitiveCategory,
  SensitiveDetectionMatch,
} from '../dto/sensitive-category.enum';

/**
 * Standard RFC 5322 compliant email regex with bounded local and domain parts.
 * Prevents catastrophic backtracking by using non-overlapping bounded quantifiers.
 */
const EMAIL_REGEX =
  /(?<![a-zA-Z0-9._%+-])([a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63})(?![a-zA-Z0-9@])/g;

// Common valid top-level domains for high-confidence scoring
const COMMON_TLDS = new Set([
  'com',
  'org',
  'net',
  'edu',
  'gov',
  'mil',
  'io',
  'co',
  'in',
  'uk',
  'ca',
  'de',
  'jp',
  'fr',
  'au',
  'me',
  'info',
  'biz',
  'dev',
  'app',
  'ai',
]);

/**
 * Detects email addresses in raw text.
 */
export function detectEmails(text: string): SensitiveDetectionMatch[] {
  if (!text || text.length === 0) {
    return [];
  }

  const detections: SensitiveDetectionMatch[] = [];
  EMAIL_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = EMAIL_REGEX.exec(text)) !== null) {
    let rawMatchedText = match[1];
    let start = match.index;
    let end = start + rawMatchedText.length;

    // Trim trailing punctuation that might have attached to end of sentence
    while (
      rawMatchedText.length > 0 &&
      /[.,;:!?)]/.test(rawMatchedText[rawMatchedText.length - 1])
    ) {
      rawMatchedText = rawMatchedText.slice(0, -1);
      end -= 1;
    }

    if (!rawMatchedText.includes('@')) {
      continue;
    }

    const [localPart, domainPart] = rawMatchedText.split('@');
    if (!localPart || !domainPart) {
      continue;
    }

    // Reject consecutive dots in local or domain
    if (localPart.includes('..') || domainPart.includes('..')) {
      continue;
    }

    const domainLabels = domainPart.split('.');
    const tld = domainLabels[domainLabels.length - 1]?.toLowerCase();

    if (!tld || tld.length < 2) {
      continue;
    }

    // Determine confidence: standard common TLD or valid 2-4 letter TLD -> HIGH
    const isCommonTld = COMMON_TLDS.has(tld);
    const confidence = isCommonTld
      ? ConfidenceLevel.HIGH
      : /^[a-z]{2,10}$/i.test(tld)
        ? ConfidenceLevel.HIGH
        : ConfidenceLevel.MEDIUM;

    detections.push({
      category: SensitiveCategory.EMAIL,
      detectionType: 'EMAIL_STANDARD',
      text: rawMatchedText,
      start,
      end,
      confidence,
      explanation: `Valid email address (${domainPart})`,
    });
  }

  return detections;
}
