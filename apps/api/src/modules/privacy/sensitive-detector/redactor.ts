import crypto from 'node:crypto';
import {
  AppliedRedactionItemDto,
  RedactSensitiveTextResponseDto,
} from '../dto/redact-text-response.dto';
import {
  ConfidenceLevel,
  RedactionStrategy,
  SensitiveCategory,
  SensitiveDetectionMatch,
} from '../dto/sensitive-category.enum';

export interface RedactionOptions {
  strategy?: RedactionStrategy;
  customPlaceholder?: string;
  customCategoryPlaceholders?: Partial<Record<SensitiveCategory, string>>;
}

const DEFAULT_CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  [SensitiveCategory.EMAIL]: '[REDACTED_EMAIL]',
  [SensitiveCategory.PHONE_INDIAN]: '[REDACTED_PHONE]',
  [SensitiveCategory.PHONE_INTERNATIONAL]: '[REDACTED_PHONE]',
  [SensitiveCategory.ADDRESS]: '[REDACTED_ADDRESS]',
};

/**
 * Creates partial masking for emails:
 * e.g. "john.doe@example.com" -> "j***e@example.com"
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) {
    return '***@***.***';
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);

  if (local.length <= 2) {
    return `${local[0]}***${domain}`;
  }

  return `${local[0]}***${local[local.length - 1]}${domain}`;
}

/**
 * Creates partial masking for phone numbers:
 * Preserves country prefix and last 3-4 digits, masking the middle.
 * e.g. "+91 98765 43210" -> "+91 ******3210"
 * e.g. "+1 (555) 234-5678" -> "+1 (***) ***-5678"
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) {
    return '***-****';
  }

  const lastFour = digits.slice(-4);

  if (phone.startsWith('+')) {
    const prefixMatch = phone.match(/^\+[0-9]{1,3}/);
    const prefix = prefixMatch ? prefixMatch[0] : '+';
    return `${prefix} ******${lastFour}`;
  }

  return `******${lastFour}`;
}

/**
 * Computes replacement string for a detected sensitive match based on strategy.
 */
function computeReplacement(
  match: SensitiveDetectionMatch,
  options: RedactionOptions,
): string {
  const strategy = options.strategy ?? RedactionStrategy.CATEGORY_LABEL;

  // 1. Custom category overrides take precedence if provided
  if (
    options.customCategoryPlaceholders &&
    options.customCategoryPlaceholders[match.category]
  ) {
    return options.customCategoryPlaceholders[match.category]!;
  }

  switch (strategy) {
    case RedactionStrategy.CATEGORY_LABEL:
      return DEFAULT_CATEGORY_LABELS[match.category];

    case RedactionStrategy.PARTIAL_MASK:
      if (match.category === SensitiveCategory.EMAIL) {
        return maskEmail(match.text);
      }
      if (
        match.category === SensitiveCategory.PHONE_INDIAN ||
        match.category === SensitiveCategory.PHONE_INTERNATIONAL
      ) {
        return maskPhone(match.text);
      }
      return '[REDACTED_ADDRESS]';

    case RedactionStrategy.FULL_MASK:
      return '*'.repeat(Math.max(1, match.text.length));

    case RedactionStrategy.HASH: {
      const hash = crypto
        .createHash('sha256')
        .update(match.text)
        .digest('hex')
        .slice(0, 8);
      return `[HASH:${hash}]`;
    }

    case RedactionStrategy.CUSTOM:
      return options.customPlaceholder || '[REDACTED]';

    case RedactionStrategy.REMOVE:
      return '';

    default:
      return DEFAULT_CATEGORY_LABELS[match.category];
  }
}

/**
 * Applies deterministic redaction rules over matched sensitive regions.
 * Replaces substrings from right-to-left (descending start index) to preserve string integrity.
 */
export function redactSensitiveData(
  text: string,
  detections: SensitiveDetectionMatch[],
  options: RedactionOptions = {},
): {
  redactedText: string;
  appliedRedactions: AppliedRedactionItemDto[];
} {
  if (!text || detections.length === 0) {
    return {
      redactedText: text,
      appliedRedactions: [],
    };
  }

  // Sort detections in descending order of start position for right-to-left replacement
  const descendingDetections = [...detections].sort((a, b) => b.start - a.start);

  let currentText = text;
  const appliedRedactions: AppliedRedactionItemDto[] = [];

  for (const detection of descendingDetections) {
    const replacement = computeReplacement(detection, options);

    // Splice replacement into the string
    currentText =
      currentText.slice(0, detection.start) +
      replacement +
      currentText.slice(detection.end);

    appliedRedactions.unshift({
      category: detection.category,
      originalText: detection.text,
      replacement,
      start: detection.start,
      end: detection.end,
      confidence: detection.confidence,
    });
  }

  return {
    redactedText: currentText,
    appliedRedactions,
  };
}
