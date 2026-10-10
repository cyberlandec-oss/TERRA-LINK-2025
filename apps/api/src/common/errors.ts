import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

// Error de dominio con código estable (docs/09_CONTRATOS_API.md, error normalizado).
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Array<{ field?: string; reason: string }> = [],
  ) {
    super(message);
  }
}

export const unauthenticated = () =>
  new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
export const forbidden = (code = 'PERMISSION_DENIED', message = 'No tienes permiso para esta acción.') =>
  new AppError(HttpStatus.FORBIDDEN, code, message);
export const notFound = (message = 'El recurso no existe o no está disponible para ti.') =>
  new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) => new AppError(HttpStatus.CONFLICT, code, message);

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? null;

    if (exception instanceof AppError) {
      res.status(exception.status).json({
        error: { code: exception.code, message: exception.message, request_id: requestId, details: exception.details },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as { message?: string | string[] };
      const messages = Array.isArray(body?.message) ? body.message : [];
      res.status(status).json({
        error: {
          code: status === 400 ? 'VALIDATION_FAILED' : `HTTP_${status}`,
          message: status === 400 ? 'Revisa los datos enviados.' : exception.message,
          request_id: requestId,
          details: messages.map((reason) => ({ reason })),
        },
      });
      return;
    }
    this.logger.error(`request_id=${requestId} ${exception instanceof Error ? exception.stack : String(exception)}`);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno. Reintenta o contacta soporte.', request_id: requestId, details: [] },
    });
  }
}
