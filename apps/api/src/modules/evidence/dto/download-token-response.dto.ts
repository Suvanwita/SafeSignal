import { ApiProperty } from '@nestjs/swagger';

export class DownloadTokenResponseDto {
  @ApiProperty({
    description: 'Short-lived, single-purpose AES-256-GCM encrypted download authorization token',
    example: 'dGhpcy1pcy1hLXNob3J0LWxpdmVkLWF1dGhvcml6YXRpb24tdG9rZW4...',
  })
  token!: string;

  @ApiProperty({
    description: 'Token expiration timestamp (ISO 8601)',
    example: '2026-11-13T06:31:00.000Z',
  })
  expiresAt!: string;

  @ApiProperty({
    description: 'Token validity lifetime in seconds',
    example: 60,
  })
  expiresInSeconds!: number;

  @ApiProperty({
    description: 'Identifier of the authorized evidence record',
    example: '8b9d7a22-3490-4c8d-b387-9c50f3dd13eb',
  })
  evidenceId!: string;

  @ApiProperty({
    description: 'Direct download URL with embedded authorization token',
    example: '/api/v1/evidence/8b9d7a22-3490-4c8d-b387-9c50f3dd13eb/download?token=dGhpcy1pcy1h...',
  })
  downloadUrl!: string;
}
