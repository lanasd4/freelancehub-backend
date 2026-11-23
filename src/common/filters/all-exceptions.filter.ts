import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Every error leaves the API in ONE shape, so the frontend team can rely on it:
 *   { statusCode, error, message, path, timestamp }
 * `message` is a string, or an array of strings for validation errors.
 * Unexpected errors never leak internals: they are logged and answered with 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          statusCode = HttpStatus.CONFLICT;
          message = 'A record with this value already exists';
          break;
        case 'P2025':
          statusCode = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          break;
        case 'P2003':
          statusCode = HttpStatus.CONFLICT;
          message = 'The record is referenced by other records';
          break;
        default:
          this.logger.error(exception);
      }
    } else {
      this.logger.error(exception);
    }

    res.status(statusCode).json({
      statusCode,
      error: HttpStatus[statusCode] ?? 'Error',
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
