import {
  ConfidenceLevel,
  SensitiveCategory,
  SensitiveDetectionMatch,
} from '../dto/sensitive-category.enum';
import { detectAddresses } from './address-detector';
import { detectEmails } from './email-detector';
import {
  detectIndianPhones,
  detectInternationalPhones,
} from './phone-detector';

const CONFIDENCE_RANKS: Record<ConfidenceLevel, number> = {
  [ConfidenceLevel.HIGH]: 3,
  [ConfidenceLevel.MEDIUM]: 2,
  [ConfidenceLevel.LOW]: 1,
};

export interface DetectorOptions {
  categories?: SensitiveCategory[];
  minConfidence?: ConfidenceLevel;
}

/**
 * Resolves overlapping sensitive entity detections cleanly:
 * - Prioritizes higher confidence matches.
 * - Prioritizes Indian Phone over International Phone when overlapping.
 * - Prioritizes Emails and Phones over generic Address heuristic wrappers.
 * - Prioritizes longer matches if confidence and category priority are equal.
 */
function resolveOverlaps(
  detections: SensitiveDetectionMatch[],
): SensitiveDetectionMatch[] {
  if (detections.length <= 1) {
    return detections;
  }

  // Sort primarily by start position ascending, then by confidence descending, then by length descending
  const sorted = [...detections].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    const confDiff =
      CONFIDENCE_RANKS[b.confidence] - CONFIDENCE_RANKS[a.confidence];
    if (confDiff !== 0) {
      return confDiff;
    }
    return b.text.length - a.text.length;
  });

  const resolved: SensitiveDetectionMatch[] = [];

  for (const current of sorted) {
    const overlappingIndex = resolved.findIndex(
      (existing) =>
        Math.max(existing.start, current.start) <
        Math.min(existing.end, current.end),
    );

    if (overlappingIndex === -1) {
      resolved.push(current);
    } else {
      const existing = resolved[overlappingIndex];

      // Rule: PHONE_INDIAN takes precedence over PHONE_INTERNATIONAL
      if (
        current.category === SensitiveCategory.PHONE_INDIAN &&
        existing.category === SensitiveCategory.PHONE_INTERNATIONAL
      ) {
        resolved[overlappingIndex] = current;
        continue;
      }
      if (
        existing.category === SensitiveCategory.PHONE_INDIAN &&
        current.category === SensitiveCategory.PHONE_INTERNATIONAL
      ) {
        continue;
      }

      // Rule: Highly-structured entities (Email/Phone) take precedence over address heuristics if equal/higher confidence
      if (
        (current.category === SensitiveCategory.EMAIL ||
          current.category === SensitiveCategory.PHONE_INDIAN ||
          current.category === SensitiveCategory.PHONE_INTERNATIONAL) &&
        existing.category === SensitiveCategory.ADDRESS &&
        CONFIDENCE_RANKS[current.confidence] >=
          CONFIDENCE_RANKS[existing.confidence]
      ) {
        resolved[overlappingIndex] = current;
        continue;
      }

      // If current has strictly higher confidence, replace
      if (
        CONFIDENCE_RANKS[current.confidence] >
        CONFIDENCE_RANKS[existing.confidence]
      ) {
        resolved[overlappingIndex] = current;
      }
    }
  }

  // Final re-sort by start position ascending
  return resolved.sort((a, b) => a.start - b.start);
}

/**
 * Scans input text and identifies sensitive personal data.
 * Pure in-memory deterministic rule engine without external network dependencies.
 */
export function scanSensitiveData(
  text: string,
  options: DetectorOptions = {},
): SensitiveDetectionMatch[] {
  if (!text || text.length === 0) {
    return [];
  }

  const categories = options.categories ?? [
    SensitiveCategory.EMAIL,
    SensitiveCategory.PHONE_INDIAN,
    SensitiveCategory.PHONE_INTERNATIONAL,
    SensitiveCategory.ADDRESS,
  ];

  const minConfidence = options.minConfidence ?? ConfidenceLevel.LOW;
  const minRank = CONFIDENCE_RANKS[minConfidence];

  const candidateDetections: SensitiveDetectionMatch[] = [];

  if (categories.includes(SensitiveCategory.EMAIL)) {
    candidateDetections.push(...detectEmails(text));
  }

  if (categories.includes(SensitiveCategory.PHONE_INDIAN)) {
    candidateDetections.push(...detectIndianPhones(text));
  }

  if (categories.includes(SensitiveCategory.PHONE_INTERNATIONAL)) {
    candidateDetections.push(...detectInternationalPhones(text));
  }

  if (categories.includes(SensitiveCategory.ADDRESS)) {
    candidateDetections.push(...detectAddresses(text));
  }

  // Filter by minimum confidence threshold
  const filtered = candidateDetections.filter(
    (d) => CONFIDENCE_RANKS[d.confidence] >= minRank,
  );

  // Resolve overlaps cleanly
  return resolveOverlaps(filtered);
}
