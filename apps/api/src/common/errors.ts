import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Inject } from '@nestjs/common';
import { DomainError, type DomainErrorCode } from '@waka/domain';
import type { Request, Response } from 'express';
import type { ZodError } from 'zod';
import { currentRequestId, JsonLogger } from './logger.js';
import { LOGGER } from './tokens.js';

/** Correspondance stable code métier → statut HTTP. */
export const HTTP_STATUS: Record<DomainErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_SIGNATURE: 401,
  FORBIDDEN: 403,
  DRIVER_NOT_ELIGIBLE: 403,
  VEHICLE_NOT_ELIGIBLE: 403,
  SEPARATION_OF_DUTIES: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  ALREADY_EXECUTED: 409,
  SEATS_UNAVAILABLE: 409,
  HOLD_EXPIRED: 409,
  DISPUTE_BLOCKS_RELEASE: 409,
  REPLAYED_EVENT: 409,
  INVALID_AMOUNT: 422,
  CURRENCY_MISMATCH: 422,
  AMOUNT_MISMATCH: 422,
  ALLOCATION_EXCEEDED: 422,
  MESSAGE_BLOCKED: 422,
  RATE_LIMITED: 429,
  LEDGER_UNBALANCED: 500,
  FEATURE_NOT_SUPPORTED: 501,
  BLOCKED_BY_PROVIDER_CONTRACT: 503,
};

/** Codes supplémentaires propres à la couche HTTP. */
type HttpOnlyCode = 'UNAUTHENTICATED' | 'PAYLOAD_TOO_LARGE' | 'INTERNAL_ERROR' | 'IDEMPOTENCY_KEY_REQUIRED' | 'IDEMPOTENCY_CONFLICT';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: HttpOnlyCode | DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const unauthenticated = () => new HttpError(401, 'UNAUTHENTICATED', 'Connexion requise.');
export const notFound = (what = 'Ressource') => new DomainError('NOT_FOUND', `${what} introuvable.`);
export const forbidden = (msg = 'Action non autorisée.') => new DomainError('FORBIDDEN', msg);

export function zodToDomain(err: ZodError): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Données invalides.', {
    issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
  });
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = currentRequestId() ?? (res.getHeader('x-request-id') as string | undefined) ?? 'unknown';
    let status = 500;
    let code: string = 'INTERNAL_ERROR';
    let message = 'Une erreur interne est survenue. Réessayez plus tard.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof DomainError) {
      status = HTTP_STATUS[exception.code] ?? 400;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status === 404) {
        code = 'NOT_FOUND';
        message = 'Route introuvable.';
      } else if (status === 413) {
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Requête trop volumineuse.';
      } else if (status === 400) {
        code = 'VALIDATION_ERROR';
        message = 'Requête invalide.';
      } else if (status === 429) {
        code = 'RATE_LIMITED';
        message = 'Trop de requêtes. Réessayez plus tard.';
      } else {
        code = status === 403 ? 'FORBIDDEN' : status === 401 ? 'UNAUTHENTICATED' : 'HTTP_ERROR';
        message = status === 403 ? 'Action non autorisée.' : status === 401 ? 'Connexion requise.' : 'Erreur de requête.';
      }
    } else if (isBodyParserError(exception)) {
      status = exception.status;
      code = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR';
      message = status === 413 ? 'Requête trop volumineuse.' : 'Corps de requête JSON invalide.';
    }

    if (status >= 500) {
      this.logger.errorFields('Erreur non gérée', {
        method: req.method,
        path: req.path,
        err: exception instanceof Error ? { name: exception.name, message: exception.message, stack: exception.stack } : String(exception),
      });
    }
    res.status(status).json({ error: { code, message, requestId, ...(details ? { details } : {}) } });
  }
}

function isBodyParserError(e: unknown): e is { status: number; type: string } {
  return typeof e === 'object' && e !== null && 'type' in e && typeof (e as { status?: unknown }).status === 'number';
}
