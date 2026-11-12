import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class LinkReportsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray({ message: 'reportIds must be an array' })
  @ArrayMinSize(1, { message: 'At least one report ID must be provided' })
  @IsUUID('4', {
    each: true,
    message: 'Each report ID must be a valid UUID',
  })
  reportIds!: string[];
}
