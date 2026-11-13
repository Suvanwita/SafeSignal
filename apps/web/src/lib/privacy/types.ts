export type SensitiveCategory =
  | 'EMAIL'
  | 'PHONE_INDIAN'
  | 'PHONE_INTERNATIONAL'
  | 'ADDRESS';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type RedactionStrategy =
  | 'CATEGORY_LABEL'
  | 'PARTIAL_MASK'
  | 'FULL_MASK'
  | 'HASH'
  | 'CUSTOM'
  | 'REMOVE';

export interface SensitiveDetection {
  category: SensitiveCategory;
  detectionType: string;
  text: string;
  start: number;
  end: number;
  confidence: ConfidenceLevel;
  explanation: string;
}

export interface ScanSensitiveTextResponse {
  hasSensitiveData: boolean;
  totalDetections: number;
  detections: SensitiveDetection[];
  categoryBreakdown: Record<SensitiveCategory, number>;
  scannedLength: number;
  executionTimeMs: number;
}

export interface AppliedRedactionItem {
  category: SensitiveCategory;
  originalText: string;
  replacement: string;
  start: number;
  end: number;
  confidence: ConfidenceLevel;
}

export interface RedactSensitiveTextResponse {
  redactedText: string;
  originalLength: number;
  redactedLength: number;
  redactionCount: number;
  appliedStrategy: RedactionStrategy;
  redactions: AppliedRedactionItem[];
  executionTimeMs: number;
}

export interface ScanSensitiveTextPayload {
  text: string;
  categories?: SensitiveCategory[];
  minConfidence?: ConfidenceLevel;
  incidentId?: string;
}

export interface RedactSensitiveTextPayload {
  text: string;
  categories?: SensitiveCategory[];
  strategy?: RedactionStrategy;
  customPlaceholder?: string;
  customCategoryPlaceholders?: Partial<Record<SensitiveCategory, string>>;
  minConfidence?: ConfidenceLevel;
}
