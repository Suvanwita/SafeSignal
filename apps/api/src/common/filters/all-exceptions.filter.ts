import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { AppLoggerService } from '../logging/app-logger.service';
import type {
  ApiErrorResponse,
  RequestWithContext,
} from '../types/api-response.type';

const STATUS_CODE_MAP: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();

    const normalized = this.normalizeException(exception);

    if (normalized.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${normalized.statusCode}: ${normalized.message}`,
        exception instanceof Error ? exception.stack : undefined,
        'ExceptionFilter',
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.originalUrl} -> ${normalized.statusCode} (${normalized.code}): ${normalized.message}`,
        'ExceptionFilter',
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details !== undefined
          ? { details: normalized.details }
          : {}),
      },
      meta: {
        statusCode: normalized.statusCode,
        timestamp: new Date().toISOString(),
        path: request.originalUrl,
        ...(request.requestId ? { requestId: request.requestId } : {}),
      },
    };

    response.status(normalized.statusCode).json(body);
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const rawResponse = exception.getResponse();

      if (typeof rawResponse === 'string') {
        return {
          statusCode,
          code: STATUS_CODE_MAP[statusCode] ?? 'HTTP_EXCEPTION',
          message: rawResponse,
        };
      }

      if (typeof rawResponse === 'object' && rawResponse !== null) {
        const payload = rawResponse as Record<string, unknown>;
        const rawMessage = payload.message;
        const message = Array.isArray(rawMessage)
          ? rawMessage.join('; ')
          : typeof rawMessage === 'string'
            ? rawMessage
            : exception.message;

        return {
          statusCode,
          code:
            typeof payload.code === 'string'
              ? payload.code
              : (STATUS_CODE_MAP[statusCode] ?? 'HTTP_EXCEPTION'),
          message,
          details: payload.details,
        };
      }
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
    };
  }

  private mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    code: string;
    message: string;
  } {
    switch (error.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: 'A record with the provided unique value already exists',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'FOREIGN_KEY_CONSTRAINT_VIOLATION',
          message: 'Referenced resource does not exist',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'RECORD_NOT_FOUND',
          message: 'Requested record was not found',
        };
      default:
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'DATABASE_ERROR',
          message: 'Database operation failed',
        };
    }
  }
}
