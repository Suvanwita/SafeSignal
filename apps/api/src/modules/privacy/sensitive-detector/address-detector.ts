import {
  ConfidenceLevel,
  SensitiveCategory,
  SensitiveDetectionMatch,
} from '../dto/sensitive-category.enum';

/**
 * Common street keywords in English and Indian address conventions.
 */
const STREET_KEYWORDS =
  'street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|terrace|ter|circle|cir|square|sq|highway|hwy|parkway|pkwy|marg|nagar|colony|layout|enclave|vihar|bagh|galli|chowk|bazaar|phase|cross|main|puram|wadi|mohalla';

/**
 * Premise or unit indicators (flat, plot, building, suite, etc.).
 */
const PREMISE_KEYWORDS =
  'flat|apartment|apt|suite|ste|unit|plot|house|villa|building|bldg|floor|block|sector|door|no\\.?|#';

/**
 * Address labels (Address:, Residence:, Location:, Ship to:).
 */
const ADDRESS_LABEL_REGEX =
  /(?:(?:address|residence|location|lives at|shipping to|ship to|home address|office address)\s*[:=-]\s*)([A-Za-z0-9#][A-Za-z0-9\s,./#\-]{6,120})(?=[.\n\r]|$)/gi;

/**
 * Pattern 1: Number + Street Name + optional City / Postal Code.
 * E.g. "123 Main Street, Springfield, IL 62701", "742 Evergreen Terrace", "45 MG Road, Bangalore 560001"
 */
const NUMBERED_STREET_ADDRESS_REGEX = new RegExp(
  `\\b(\\d{1,5}(?:[/-]\\d{1,5})?\\s+[A-Za-z0-9.\\s]{1,40}\\s+(?:${STREET_KEYWORDS})\\b(?:\\s*[,.]?\\s*(?:suite|ste|apt|flat|floor|unit|#)\\s*[A-Za-z0-9-]+)?(?:\\s*[,.]?\\s*[A-Za-z\\s]{2,30})?(?:\\s*[,.]?\\s*(?:[A-Z]{2}\\s+)?(?:[1-8]\\d{5}|\\d{5}(?:-\\d{4})?))?)`,
  'gi',
);

/**
 * Pattern 2: Premise identifier + Name + Locality/Street + optional City/PIN.
 * E.g. "Flat 402, Sunshine Apartments, 5th Cross Road, Indiranagar, Bangalore 560038"
 * E.g. "Plot No. 12, Sector 18, Gurgaon 122001"
 */
const PREMISE_ADDRESS_REGEX = new RegExp(
  `\\b((?:${PREMISE_KEYWORDS})\\s*[A-Za-z0-9/-]+(?:\\s*[,.]?\\s*[A-Za-z0-9.\\s]{1,40}\\s+(?:${STREET_KEYWORDS}|apartments?|residency|heights|towers?|society|complex)\\b)+(?:\\s*[,.]?\\s*[A-Za-z\\s]{2,30})*(?:\\s*[,.]?\\s*(?:[1-8]\\d{5}|\\d{5}(?:-\\d{4})?))?)`,
  'gi',
);

/**
 * Pattern 3: Locality + City + 6-digit Indian PIN Code.
 * E.g. "Indiranagar, Bangalore - 560038", "Connaught Place, New Delhi 110001"
 */
const INDIAN_LOCALITY_PIN_REGEX =
  /\b([A-Za-z\s]{3,30},\s*[A-Za-z\s]{3,25}(?:\s*[-–,]\s*|\s+)(?:[1-8]\d{5}))\b/g;

/**
 * Pattern 4: Explicit labeled Postal / PIN Code.
 * E.g. "PIN: 560038", "Pincode: 110001", "ZIP: 90210", "Postal Code: 62701"
 */
const LABELED_POSTAL_CODE_REGEX =
  /\b((?:PIN(?:\s*CODE)?|POSTAL\s*CODE|ZIP(?:\s*CODE)?)\s*[:=-]?\s*([1-8]\d{5}|\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}))\b/gi;

/**
 * Clean matched string by removing trailing punctuation and extra whitespace.
 */
function cleanMatch(
  raw: string,
  start: number,
): { text: string; start: number; end: number } {
  let text = raw.trim();
  let end = start + text.length;

  while (text.length > 0 && /[.,;:!?-]/.test(text[text.length - 1])) {
    text = text.slice(0, -1).trim();
    end = start + text.length;
  }

  return { text, start, end };
}

export function detectAddresses(text: string): SensitiveDetectionMatch[] {
  if (!text || text.length === 0) {
    return [];
  }

  const detections: SensitiveDetectionMatch[] = [];

  function addIfNoOverlap(match: SensitiveDetectionMatch) {
    // Avoid short false positives
    if (match.text.length < 8) {
      return;
    }

    // Exclude if entirely contains common false positive phrases
    const lower = match.text.toLowerCase();
    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.includes('error in line')
    ) {
      return;
    }

    // Check for overlap with already added detections
    const existingIndex = detections.findIndex(
      (d) => Math.max(d.start, match.start) < Math.min(d.end, match.end),
    );

    if (existingIndex === -1) {
      detections.push(match);
    } else {
      // If the new match is longer and higher confidence, replace it
      const existing = detections[existingIndex];
      if (
        match.text.length > existing.text.length ||
        (match.confidence === ConfidenceLevel.HIGH &&
          existing.confidence !== ConfidenceLevel.HIGH)
      ) {
        detections[existingIndex] = match;
      }
    }
  }

  // 1. Labeled Address Blocks (e.g. "Address: 12 Baker Street, London")
  ADDRESS_LABEL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ADDRESS_LABEL_REGEX.exec(text)) !== null) {
    const rawMatch = match[1];
    const prefixLength = match[0].indexOf(rawMatch);
    const start = match.index + prefixLength;
    const cleaned = cleanMatch(rawMatch, start);

    if (cleaned.text.length >= 8) {
      const hasPin = /\b([1-8]\d{5}|\d{5})\b/.test(cleaned.text);
      const hasStreet = new RegExp(`\\b(?:${STREET_KEYWORDS})\\b`, 'i').test(
        cleaned.text,
      );

      const confidence =
        hasPin || hasStreet ? ConfidenceLevel.HIGH : ConfidenceLevel.MEDIUM;

      addIfNoOverlap({
        category: SensitiveCategory.ADDRESS,
        detectionType: 'ADDRESS_LABEL_BLOCK',
        text: cleaned.text,
        start: cleaned.start,
        end: cleaned.end,
        confidence,
        explanation: 'Physical address identified via explicit address label',
      });
    }
  }

  // 2. Multi-token premise address (e.g. "Flat 402, Sunshine Apartments, 5th Cross Road, Bangalore 560038")
  PREMISE_ADDRESS_REGEX.lastIndex = 0;
  while ((match = PREMISE_ADDRESS_REGEX.exec(text)) !== null) {
    const rawMatch = match[1];
    const cleaned = cleanMatch(rawMatch, match.index);

    const hasPin = /\b([1-8]\d{5}|\d{5})\b/.test(cleaned.text);
    const confidence = hasPin ? ConfidenceLevel.HIGH : ConfidenceLevel.MEDIUM;

    addIfNoOverlap({
      category: SensitiveCategory.ADDRESS,
      detectionType: 'ADDRESS_PREMISE_STRUCTURED',
      text: cleaned.text,
      start: cleaned.start,
      end: cleaned.end,
      confidence,
      explanation:
        'Structured premise and locality address with building/street indicators',
    });
  }

  // 3. Numbered Street Address (e.g. "123 Main Street, Springfield, IL 62701")
  NUMBERED_STREET_ADDRESS_REGEX.lastIndex = 0;
  while ((match = NUMBERED_STREET_ADDRESS_REGEX.exec(text)) !== null) {
    const rawMatch = match[1];
    const cleaned = cleanMatch(rawMatch, match.index);

    const hasPin = /\b([1-8]\d{5}|\d{5})\b/.test(cleaned.text);
    const confidence = hasPin ? ConfidenceLevel.HIGH : ConfidenceLevel.MEDIUM;

    addIfNoOverlap({
      category: SensitiveCategory.ADDRESS,
      detectionType: 'ADDRESS_STREET_NUMBERED',
      text: cleaned.text,
      start: cleaned.start,
      end: cleaned.end,
      confidence,
      explanation: 'Numbered street address matching geographic road pattern',
    });
  }

  // 4. Indian Locality + City + 6-digit PIN Code (e.g. "Indiranagar, Bangalore - 560038")
  INDIAN_LOCALITY_PIN_REGEX.lastIndex = 0;
  while ((match = INDIAN_LOCALITY_PIN_REGEX.exec(text)) !== null) {
    const rawMatch = match[1];
    const cleaned = cleanMatch(rawMatch, match.index);

    addIfNoOverlap({
      category: SensitiveCategory.ADDRESS,
      detectionType: 'ADDRESS_LOCALITY_PIN',
      text: cleaned.text,
      start: cleaned.start,
      end: cleaned.end,
      confidence: ConfidenceLevel.HIGH,
      explanation: 'Indian locality and city associated with 6-digit PIN code',
    });
  }

  // 5. Explicit Labeled Postal Code (e.g. "PIN Code: 560038", "ZIP: 90210")
  LABELED_POSTAL_CODE_REGEX.lastIndex = 0;
  while ((match = LABELED_POSTAL_CODE_REGEX.exec(text)) !== null) {
    const rawMatch = match[1];
    const cleaned = cleanMatch(rawMatch, match.index);

    addIfNoOverlap({
      category: SensitiveCategory.ADDRESS,
      detectionType: 'ADDRESS_POSTAL_CODE_LABELED',
      text: cleaned.text,
      start: cleaned.start,
      end: cleaned.end,
      confidence: ConfidenceLevel.MEDIUM,
      explanation: 'Postal or PIN code with explicit postal label',
    });
  }

  return detections;
}
