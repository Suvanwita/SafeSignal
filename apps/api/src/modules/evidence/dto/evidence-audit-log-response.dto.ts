import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvidenceAuditLogResponseDto {
  @ApiProperty({
    description: 'Unique audit log entry identifier (UUID)',
    example: 'd9b7f23a-5942-4f30-84a1-30df4d412345',
  })
  id!: string;

  @ApiProperty({
    description: 'User ID associated with the operation',
    example: 'c11e3b52-2350-442e-b12b-de4910df882a',
  })
  userId!: string;

  @ApiProperty({
    description: 'Evidence record ID (UUID)',
    example: '8b9d7a22-3490-4c8d-b387-9c50f3dd13eb',
  })
  evidenceId!: string;

  @ApiProperty({
    description: 'Audited action type (UPLOAD, DOWNLOAD, VERIFY, METADATA_READ, TOKEN_ISSUED)',
    example: 'DOWNLOAD',
  })
  action!: string;

  @ApiProperty({
    description: 'Outcome status (SUCCESS, FAILED, MISMATCH)',
    example: 'SUCCESS',
  })
  status!: string;

  @ApiPropertyOptional({
    description: 'Client IP address where available',
    example: '127.0.0.1',
  })
  ipAddress?: string | null;

  @ApiPropertyOptional({
    description: 'Client user-agent string where available',
    example: 'Mozilla/5.0 ...',
  })
  userAgent?: string | null;

  @ApiPropertyOptional({
    description: 'Detailed operation context and metadata',
  })
  details?: unknown;

  @ApiProperty({
    description: 'Timestamp when the audit record was created',
    example: '2026-11-13T06:30:15.000Z',
  })
  createdAt!: Date;
}
