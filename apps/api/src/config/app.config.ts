import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  storagePath: string;
  swaggerEnabled: boolean;
}

export default registerAs(
  'app',
  (): AppConfig => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.API_PORT ?? 3001),
    apiPrefix: 'api/v1',
    corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    storagePath: process.env.STORAGE_PATH ?? './storage',
    swaggerEnabled: (process.env.SWAGGER_ENABLED ?? 'true') !== 'false',
  }),
);
