import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import type { ApiErrorDetail } from '../types/api-response.type';

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ApiErrorDetail[] {
  const details: ApiErrorDetail[] = [];

  for (const error of errors) {
    const fieldPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      details.push({
        field: fieldPath,
        messages: Object.values(error.constraints),
      });
    }

    if (error.children && error.children.length > 0) {
      details.push(...flattenValidationErrors(error.children, fieldPath));
    }
  }

  return details;
}

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors: ValidationError[]) => {
      const details = flattenValidationErrors(errors);
      return new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      });
    },
  });
}
