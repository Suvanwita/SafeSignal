import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  AppLoggerService,
  SWAGGER_DOCS_PATH,
  createGlobalValidationPipe,
  setupSwagger,
} from './common';
import type { AppConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(AppLoggerService);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const appCfg = configService.getOrThrow<AppConfig>('app');

  app.setGlobalPrefix(appCfg.apiPrefix);
  app.enableCors({
    origin: appCfg.corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(createGlobalValidationPipe());

  if (appCfg.swaggerEnabled) {
    setupSwagger(app);
  }

  app.enableShutdownHooks();

  await app.listen(appCfg.port);

  logger.log(
    `SafeSignal API listening on http://localhost:${appCfg.port}/${appCfg.apiPrefix}`,
    'Bootstrap',
  );
  if (appCfg.swaggerEnabled) {
    logger.log(
      `Swagger documentation available at http://localhost:${appCfg.port}/${SWAGGER_DOCS_PATH}`,
      'Bootstrap',
    );
  }
}

void bootstrap();
