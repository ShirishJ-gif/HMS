import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NextFunction, Response } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http/http-exception.filter';
import { requestIdHeader, RequestWithContext } from './common/http/request-context';
import { MetricsService } from './modules/metrics/metrics.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const httpLogger = new Logger('HTTP');
  const metricsService = app.get(MetricsService);
  const uploadsPath = join(process.cwd(), 'uploads');
  mkdirSync(uploadsPath, { recursive: true });
  mkdirSync(join(uploadsPath, 'properties'), { recursive: true });
  mkdirSync(join(uploadsPath, 'room-categories'), { recursive: true });

  app.use((request: RequestWithContext, response: Response, next: NextFunction) => {
    const incomingRequestId = request.header(requestIdHeader);
    const requestId = incomingRequestId?.trim() || randomUUID();
    const startedAt = Date.now();

    request.requestId = requestId;
    response.setHeader(requestIdHeader, requestId);

    response.on('finish', () => {
      const durationMs = Date.now() - startedAt;
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

  app.enableCors();
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
