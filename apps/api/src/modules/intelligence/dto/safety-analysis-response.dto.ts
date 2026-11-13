import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SafetyIndicatorDto {
  @ApiProperty({ example: 'THREAT_VIOLENCE_EXPLICIT' })
  id!: string;

  @ApiProperty({
    example: 'THREATS',
    enum: [
      'THREATS',
      'HARASSMENT',
      'ABUSIVE_LANGUAGE',
      'SENSITIVE_INFO',
      'REPEATED_ACTIVITY',
    ],
  })
  category!: string;

  @ApiProperty({ example: 'HIGH', enum: ['LOW', 'MEDIUM', 'HIGH'] })
  severity!: string;

  @ApiProperty({ example: 'Explicit Threat of Violence or Physical Harm' })
  title!: string;

  @ApiProperty({
    example:
      'Contains statements expressing an intention to commit physical violence, bodily harm, or severe assault.',
  })
  explanation!: string;

  @ApiProperty({ example: ['kill you', 'hunt you down'], type: [String] })
  matchedTerms!: string[];

  @ApiProperty({ example: 2 })
  occurrences!: number;

  @ApiPropertyOptional({ example: '...hunt you down and kill you...' })
  snippet?: string;
}

export class SafetyAnalysisMetricsDto {
  @ApiProperty({ example: 120 })
  textLength!: number;

  @ApiProperty({ example: 22 })
  wordCount!: number;

  @ApiProperty({
    example: {
      repeatedPhrasesCount: 0,
      duplicateSentences: [],
      highCapsRatio: false,
      capsRatio: 0.12,
      punctuationAggression: false,
    },
  })
  repeatedActivity!: Record<string, unknown>;
}

export class SafetyAnalysisResponseDto {
  @ApiPropertyOptional({
    description: 'PostgreSQL analysis record UUID (if persisted)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id?: string;

  @ApiProperty({
    description: 'Primary safety classification category',
    example: 'THREATS',
    enum: [
      'THREATS',
      'HARASSMENT',
      'ABUSIVE_LANGUAGE',
      'SENSITIVE_INFO',
      'REPEATED_ACTIVITY',
      'MULTI_VECTOR',
      'BENIGN',
    ],
  })
  category!: string;

  @ApiProperty({
    description: 'Secondary categories detected across content',
    example: ['ABUSIVE_LANGUAGE'],
    type: [String],
  })
  secondaryCategories!: string[];

  @ApiProperty({
    description: 'Deterministic risk tier',
    example: 'HIGH',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
  })
  riskLevel!: string;

  @ApiProperty({
    description: 'Overall heuristic risk score (0 to 100)',
    example: 85,
  })
  overallScore!: number;

  @ApiProperty({
    description: 'Executive triage summary',
    example:
      'High safety risk identified (THREATS). Detected 2 indicator(s) including high-severity patterns.',
  })
  summary!: string;

  @ApiProperty({
    description: 'Detected safety indicators with matched evidence cues',
    type: [SafetyIndicatorDto],
  })
  indicators!: SafetyIndicatorDto[];

  @ApiProperty({
    description: 'Plain-language explanation for every detected indicator',
    type: [String],
    example: [
      '[THREATS / HIGH] Explicit Threat of Violence: Contains statements expressing an intention to commit physical violence.',
    ],
  })
  explanations!: string[];

  @ApiProperty({
    description: 'Actionable safety recommendations tailored to risk level and category',
    type: [String],
    example: [
      'Immediate Safety Check: If you believe you are in immediate danger, contact emergency services (112 / 911).',
      'Preserve Evidentiary Integrity: Do not delete messages. Store in Evidence Vault.',
    ],
  })
  suggestedActions!: string[];

  @ApiProperty({
    description:
      'Mandatory legal disclaimer clarifying that automated heuristic detection does not establish criminal intent or determine allegation veracity',
    example:
      'SafeSignal Safety Intelligence provides automated heuristic pattern matching and rule-based risk classification to assist users with case documentation and triage. This analysis does not establish criminal intent, legal liability, or evidentiary proof of guilt, nor does it determine whether an allegation is true or false.',
  })
  disclaimer!: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  incidentId?: string | null;

  @ApiPropertyOptional({ example: '8fa85f64-5717-4562-b3fc-2c963f66afa6' })
  evidenceId?: string | null;

  @ApiProperty({ type: SafetyAnalysisMetricsDto })
  metrics!: SafetyAnalysisMetricsDto;

  @ApiProperty({ example: '2026-11-13T12:00:00.000Z' })
  analyzedAt!: string;

  @ApiPropertyOptional({ example: '2026-11-13T12:00:00.000Z' })
  createdAt?: string;
}
