import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { RequestWithContext } from '../types/api-response.type';
import { AppLoggerService } from './app-logger.service';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startedAt;
          this.logger.log(
            `${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs}ms [${request.requestId ?? '-'}]`,
            'HTTP',
          );
        },
        error: () => {
          const durationMs = Date.now() - startedAt;
          this.logger.warn(
            `${request.method} ${request.originalUrl} ERROR ${durationMs}ms [${request.requestId ?? '-'}]`,
            'HTTP',
          );
        },
      }),
    );
  }
}
