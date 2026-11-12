import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_DOCS_PATH = 'api/docs';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('SafeSignal API')
    .setDescription(
      'Open-source digital safety and accountability platform REST API.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token',
      },
      'bearer',
    )
    .addTag('Health', 'Service and database health checks')
    .addTag('Auth', 'Authentication and session lifecycle')
    .addTag('Users', 'User profile and account management')
    .addTag('Identity', 'Official accounts and protected identities')
    .addTag('Abuse', 'Suspicious profiles and abuse report tracking')
    .addTag('Evidence', 'Evidence uploads, checksums, and storage metadata')
    .addTag('Privacy', 'Data privacy, exports, and retention controls')
    .addTag('Incidents', 'Incident case management and timelines')
    .addTag('Intelligence', 'Automated risk, similarity, and content analysis')
    .addTag('Reports', 'Accountability summaries and report exports')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_DOCS_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
