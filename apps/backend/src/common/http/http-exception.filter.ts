import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequestWithContext } from './request-context';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = this.resolveMessage(exceptionResponse, exception);

    this.logger.error(
      JSON.stringify({
        request_id: request.requestId,
        method: request.method,
        path: request.originalUrl,
        status_code: status,
        message,
      }),
    );

    response.status(status).json({
      statusCode: status,
      message,
      path: request.originalUrl,
      request_id: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private resolveMessage(exceptionResponse: unknown, exception: unknown) {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const message = (exceptionResponse as { message?: unknown }).message;
      return Array.isArray(message) ? message.join(', ') : message ?? 'Request failed';
    }

    return exception instanceof Error ? exception.message : 'Internal server error';
  }
}
