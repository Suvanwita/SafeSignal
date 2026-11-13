export enum SensitiveCategory {
  EMAIL = 'EMAIL',
  PHONE_INDIAN = 'PHONE_INDIAN',
  PHONE_INTERNATIONAL = 'PHONE_INTERNATIONAL',
  ADDRESS = 'ADDRESS',
}

export enum ConfidenceLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum RedactionStrategy {
  CATEGORY_LABEL = 'CATEGORY_LABEL',
  PARTIAL_MASK = 'PARTIAL_MASK',
  FULL_MASK = 'FULL_MASK',
  HASH = 'HASH',
  CUSTOM = 'CUSTOM',
  REMOVE = 'REMOVE',
}

export interface SensitiveDetectionMatch {
  category: SensitiveCategory;
  detectionType: string;
  text: string;
  start: number;
  end: number;
  confidence: ConfidenceLevel;
  explanation: string;
}
