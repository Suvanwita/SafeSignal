import { ApiProperty } from '@nestjs/swagger';
import { Platform } from '@prisma/client';

export class OfficialAccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: Platform })
  platform!: Platform;

  @ApiProperty({ example: 'safesignal_hq' })
  username!: string;

  @ApiProperty({ example: 'https://x.com/safesignal_hq', nullable: true })
  profileUrl!: string | null;

  @ApiProperty({ example: 'SafeSignal Official', nullable: true })
  displayName!: string | null;

  @ApiProperty({ example: true })
  isPrimary!: boolean;

  @ApiProperty({
    example: 'USER_DECLARED',
    description:
      'Account records are self-declared by the user and not externally verified.',
  })
  declarationStatus!: 'USER_DECLARED';

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class DeleteOfficialAccountResponseDto {
  @ApiProperty({ example: true })
  deleted!: true;

  @ApiProperty({ format: 'uuid' })
  id!: string;
}
