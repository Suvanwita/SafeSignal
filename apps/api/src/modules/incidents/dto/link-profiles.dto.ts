import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class LinkProfilesDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray({ message: 'profileIds must be an array' })
  @ArrayMinSize(1, { message: 'At least one profile ID must be provided' })
  @IsUUID('4', {
    each: true,
    message: 'Each profile ID must be a valid UUID',
  })
  profileIds!: string[];

  @ApiProperty({ required: false, example: 'Associated coordinated bot network' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
