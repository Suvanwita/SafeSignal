import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvidenceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  incidentId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  abuseReportId!: string | null;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  storageKey!: string | null;

  @ApiPropertyOptional({ nullable: true })
  fileName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  mimeType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  fileSize!: number | null;

  @ApiPropertyOptional({ nullable: true })
  sha256!: string | null;

  @ApiPropertyOptional({ nullable: true })
  capturedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class DeleteEvidenceResponseDto {
  @ApiProperty({ example: true })
  deleted!: boolean;

  @ApiProperty({ format: 'uuid' })
  id!: string;
}
