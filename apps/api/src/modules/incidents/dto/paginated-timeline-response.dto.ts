import { ApiProperty } from '@nestjs/swagger';
import { IncidentTimelineEventDto } from './incident-response.dto';

export class TimelinePaginationMetaDto {
  @ApiProperty({ description: 'Current page number', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit!: number;

  @ApiProperty({ description: 'Total matching events', example: 25 })
  total!: number;

  @ApiProperty({ description: 'Total calculated pages', example: 3 })
  totalPages!: number;

  @ApiProperty({ description: 'Whether subsequent pages exist', example: true })
  hasMore!: boolean;
}

export class PaginatedTimelineResponseDto {
  @ApiProperty({
    type: [IncidentTimelineEventDto],
    description: 'Chronologically ordered timeline events for the incident',
  })
  events!: IncidentTimelineEventDto[];

  @ApiProperty({
    type: TimelinePaginationMetaDto,
    description: 'Pagination metadata',
  })
  pagination!: TimelinePaginationMetaDto;
}
