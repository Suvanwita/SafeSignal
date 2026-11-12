import { parseDurationToSeconds } from './auth.config';

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const validated = { ...config };

  const rawPort = validated.API_PORT;
  if (rawPort !== undefined && rawPort !== '') {
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid API_PORT value: "${String(rawPort)}"`);
    }
  }

  const databaseUrl = validated.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim().length === 0) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const jwtSecret = validated.JWT_SECRET;
  if (typeof jwtSecret !== 'string' || jwtSecret.trim().length < 16) {
    throw new Error(
      'JWT_SECRET environment variable is required and must be at least 16 characters',
    );
  }

  const jwtExpiresIn = validated.JWT_EXPIRES_IN;
  if (typeof jwtExpiresIn === 'string' && jwtExpiresIn.trim().length > 0) {
    parseDurationToSeconds(jwtExpiresIn);
  }

  return validated;
}
