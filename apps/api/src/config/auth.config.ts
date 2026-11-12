import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtExpiresInSeconds: number;
}

const DURATION_UNITS_IN_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export function parseDurationToSeconds(raw: string): number {
  const trimmed = raw.trim();
  const match = /^(\d+)([smhd])?$/i.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid duration format: "${raw}"`);
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const multiplier = DURATION_UNITS_IN_SECONDS[unit];

  if (!Number.isFinite(amount) || amount <= 0 || !multiplier) {
    throw new Error(`Invalid duration value: "${raw}"`);
  }

  return amount * multiplier;
}

export default registerAs('auth', (): AuthConfig => {
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '15m';
  return {
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtExpiresIn,
    jwtExpiresInSeconds: parseDurationToSeconds(jwtExpiresIn),
  };
});
