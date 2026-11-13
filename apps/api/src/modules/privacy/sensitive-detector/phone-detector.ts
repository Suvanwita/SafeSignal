import {
  ConfidenceLevel,
  SensitiveCategory,
  SensitiveDetectionMatch,
} from '../dto/sensitive-category.enum';

/**
 * Regex for Indian Mobile Numbers:
 * 10 digits starting with 6, 7, 8, or 9.
 * Optional prefixes: +91, 91, 0, with optional spaces or hyphens.
 *
 * Captures:
 * - +91 98765 43210
 * - +91-98765-43210
 * - +919876543210
 * - 919876543210
 * - 09876543210
 * - 98765 43210
 * - 98765-43210
 * - 9876543210
 */
const INDIAN_PHONE_REGEX =
  /(?<!\d)(?:(?:\+91|91|0)[\s.-]?)?(?:(?:\([0-9]\)[\s.-]?)?)([6-9]\d{4}[\s.-]?\d{5}|[6-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|[6-9]\d{9})(?!\d)/g;

/**
 * Regex for Indian Landlines with STD code:
 * E.g., 011-23456789, 080-23456789, 022 12345678, +91 (11) 23456789
 */
const INDIAN_LANDLINE_REGEX =
  /(?<!\d)(?:(?:\+91|91)[\s.-]?)?(?:\(?0\d{2,4}\)?[\s.-]?)?[1-9]\d{6,7}(?!\d)/g;

/**
 * Regex for International Phone Numbers:
 * Starts with '+' followed by country code (1 to 3 digits),
 * then area code and local number separated by spaces, dots, hyphens, or parentheses.
 * Total digits between 7 and 15 (E.164 standard).
 */
const INTERNATIONAL_PHONE_REGEX =
  /(?<![0-9a-zA-Z])(\+(?!91(?![0-9]))[1-9]\d{0,2}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?(?:[0-9][\s.-]?){6,12}[0-9])(?![0-9a-zA-Z])/g;

/**
 * Validates digit count and strips formatting to verify telephone number rules.
 */
function getDigitCount(val: string): number {
  return val.replace(/\D/g, '').length;
}

export function detectIndianPhones(text: string): SensitiveDetectionMatch[] {
  if (!text || text.length === 0) {
    return [];
  }

  const detections: SensitiveDetectionMatch[] = [];
  INDIAN_PHONE_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = INDIAN_PHONE_REGEX.exec(text)) !== null) {
    const rawMatch = match[0];
    const start = match.index;
    const end = start + rawMatch.length;

    // Extract digits only to inspect number structure
    const digitsOnly = rawMatch.replace(/\D/g, '');

    // Standard 10-digit mobile, or 11/12 with 0/91 prefix
    let mobileDigits = '';
    if (digitsOnly.length === 10) {
      mobileDigits = digitsOnly;
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      mobileDigits = digitsOnly.slice(1);
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      mobileDigits = digitsOnly.slice(2);
    }

    if (mobileDigits.length === 10 && /^[6-9]/.test(mobileDigits)) {
      const hasPrefix =
        rawMatch.startsWith('+91') ||
        rawMatch.startsWith('91') ||
        rawMatch.startsWith('0');

      detections.push({
        category: SensitiveCategory.PHONE_INDIAN,
        detectionType: 'PHONE_INDIAN_MOBILE',
        text: rawMatch,
        start,
        end,
        confidence: hasPrefix ? ConfidenceLevel.HIGH : ConfidenceLevel.HIGH,
        explanation: 'Indian mobile phone number (10 digits starting with 6-9)',
      });
    }
  }

  // Detect landlines if not already covered by mobile regex
  INDIAN_LANDLINE_REGEX.lastIndex = 0;
  while ((match = INDIAN_LANDLINE_REGEX.exec(text)) !== null) {
    const rawMatch = match[0];
    const start = match.index;
    const end = start + rawMatch.length;

    // Check if this region overlaps an existing mobile match
    const overlaps = detections.some(
      (d) => Math.max(d.start, start) < Math.min(d.end, end),
    );
    if (overlaps) {
      continue;
    }

    const digitsOnly = rawMatch.replace(/\D/g, '');
    // Indian landlines with STD code generally have 10-11 digits (e.g. 011-23456789)
    if (
      (digitsOnly.length === 10 || digitsOnly.length === 11) &&
      (rawMatch.includes('011') ||
        rawMatch.includes('080') ||
        rawMatch.includes('022') ||
        rawMatch.includes('044') ||
        rawMatch.includes('033') ||
        rawMatch.startsWith('0') ||
        rawMatch.startsWith('+91'))
    ) {
      detections.push({
        category: SensitiveCategory.PHONE_INDIAN,
        detectionType: 'PHONE_INDIAN_LANDLINE',
        text: rawMatch,
        start,
        end,
        confidence: ConfidenceLevel.MEDIUM,
        explanation: 'Indian landline number with STD code',
      });
    }
  }

  return detections;
}

export function detectInternationalPhones(
  text: string,
): SensitiveDetectionMatch[] {
  if (!text || text.length === 0) {
    return [];
  }

  const detections: SensitiveDetectionMatch[] = [];
  INTERNATIONAL_PHONE_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = INTERNATIONAL_PHONE_REGEX.exec(text)) !== null) {
    const rawMatch = match[1];
    const start = match.index;
    const end = start + rawMatch.length;

    const digits = getDigitCount(rawMatch);

    // E.164 specifies between 7 and 15 digits
    if (digits < 7 || digits > 15) {
      continue;
    }

    // Exclude math expressions e.g. "+1 - 2"
    if (rawMatch.includes(' - ') || rawMatch.includes(' + ')) {
      continue;
    }

    // Extract country code
    const countryCodeMatch = rawMatch.match(/^\+([1-9]\d{0,2})/);
    const countryCode = countryCodeMatch ? countryCodeMatch[1] : '';

    // If it is +91, Indian detector handles it with higher specificity
    if (countryCode === '91') {
      continue;
    }

    // Detect format confidence
    const hasPunctuation = /[\s().-]/.test(rawMatch);
    const confidence =
      hasPunctuation && digits >= 9 && digits <= 14
        ? ConfidenceLevel.HIGH
        : ConfidenceLevel.MEDIUM;

    detections.push({
      category: SensitiveCategory.PHONE_INTERNATIONAL,
      detectionType: 'PHONE_INTERNATIONAL_E164',
      text: rawMatch,
      start,
      end,
      confidence,
      explanation: countryCode
        ? `International phone number with country code (+${countryCode})`
        : 'International phone number (E.164 pattern)',
    });
  }

  return detections;
}
