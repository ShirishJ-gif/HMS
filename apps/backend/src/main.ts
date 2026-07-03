import './common/env/load-env';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NextFunction, Response } from 'express';
import { AppModule } from './app.module';
import { ApiCallTraceService } from './common/api-call-trace/api-call-trace.service';
import { HttpExceptionFilter } from './common/http/http-exception.filter';
import { createRateLimitMiddleware } from './common/http/rate-limit.middleware';
import { requestIdHeader, RequestWithContext } from './common/http/request-context';
import { MetricsService } from './modules/metrics/metrics.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const httpLogger = new Logger('HTTP');
  const apiCallTraceService = app.get(ApiCallTraceService);
  const metricsService = app.get(MetricsService);
  const uploadsPath = join(process.cwd(), 'uploads');
  mkdirSync(uploadsPath, { recursive: true });
  mkdirSync(join(uploadsPath, 'properties'), { recursive: true });
  mkdirSync(join(uploadsPath, 'room-categories'), { recursive: true });

  app.enableCors();

  app.use((request: RequestWithContext, response: Response, next: NextFunction) => {
    const incomingRequestId = request.header(requestIdHeader);
    const requestId = incomingRequestId?.trim() || randomUUID();
    const screenName = request.header('x-hms-screen')?.trim() || null;
    const startedAt = Date.now();

    apiCallTraceService.runWithContext({ requestId, screenName }, () => {
      const shouldTraceApiCall =
        !request.originalUrl.startsWith('/api-call-traces') &&
        !request.originalUrl.startsWith('/platform-admin');
      const traceCallId = shouldTraceApiCall
          ? apiCallTraceService.startSystemRequest({
              method: request.method,
              path: request.originalUrl,
              screenName,
            })
        : null;

      request.requestId = requestId;
      response.setHeader(requestIdHeader, requestId);

      response.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        const status = response.statusCode >= 400 ? 'FAILED' : 'SUCCEEDED';
        if (traceCallId) {
          apiCallTraceService.finishCall(traceCallId, {
            status,
            statusCode: response.statusCode,
            errorMessage: status === 'FAILED' ? `HTTP ${response.statusCode}` : null,
          });
        }
        metricsService.recordHttpRequest({
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs,
        });

        httpLogger.log(
          JSON.stringify({
            request_id: requestId,
            method: request.method,
            path: request.originalUrl,
            status_code: response.statusCode,
            duration_ms: durationMs,
            content_length: response.getHeader('content-length') ?? null,
            user_agent: request.get('user-agent') ?? null,
          }),
        );
      });

      next();
    });
  });

  app.use(createRateLimitMiddleware());
  app.use('/uploads', express.static(uploadsPath));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
