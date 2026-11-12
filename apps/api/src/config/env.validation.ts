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

  return validated;
}
