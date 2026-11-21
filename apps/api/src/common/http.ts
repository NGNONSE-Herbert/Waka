import { randomUUID } from 'node:crypto';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { DomainError, type Role } from '@waka/domain';
import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { HttpError, unauthenticated, zodToDomain } from './errors.js';
import { type JsonLogger, requestContext } from './logger.js';

export interface AuthUser {
  id: string;
  displayName: string;
  phoneE164: string;
  roles: Role[];
  isDemo: boolean;
  sessionId: string;
}
export interface AuthStaff {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  mfaVerified: boolean;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      staff?: AuthStaff;
      rawBody?: Buffer;
      requestId?: string;
    }
  }
}

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** Attribue un requestId (en-tête X-Request-Id), l'expose et le propage via AsyncLocalStorage. */
export function requestIdMiddleware(logger: JsonLogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      requestContext.run({ requestId }, () =>
        logger.info('http', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
        }),
      );
    });
    requestContext.run({ requestId, ip: req.ip }, () => next());
  };
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Anti-CSRF : toute requête mutante porte `X-Waka-Request: 1`, sauf les webhooks (signés). */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method) || req.path.startsWith('/v1/webhooks/')) return next();
  if (req.header('x-waka-request') !== '1') {
    return next(new DomainError('FORBIDDEN', 'En-tête anti-CSRF X-Waka-Request manquant.'));
  }
  next();
}

/** Valide une entrée avec un schéma Zod du paquet contracts ; lève VALIDATION_ERROR (400). */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw zodToDomain(r.error);
  return r.data;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.user) throw unauthenticated();
  return req.user;
});

export const CurrentStaff = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthStaff => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.staff) throw unauthenticated();
  return req.staff;
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | undefined): s is string => !!s && UUID_RE.test(s);

/** Les identifiants de chemin malformés sont traités comme introuvables (pas d'erreur SQL). */
export function assertUuidOr404(id: string, what = 'Ressource'): string {
  if (!isUuid(id)) throw new DomainError('NOT_FOUND', `${what} introuvable.`);
  return id;
}

export function requireIdempotencyKey(req: Request): string {
  const key = req.header('idempotency-key');
  if (!key) throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'En-tête Idempotency-Key (UUID) requis.');
  if (!isUuid(key)) throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key doit être un UUID.');
  return key.toLowerCase();
}

/** Limiteur en mémoire à fenêtre fixe (une instance d'API). À remplacer par Redis en multi-instance. */
export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  hit(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    if (now - this.lastSweep > 60_000) {
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
      this.lastSweep = now;
    }
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    b.count += 1;
    if (b.count > limit) {
      throw new DomainError('RATE_LIMITED', 'Trop de tentatives. Réessayez dans quelques minutes.', {
        retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000),
      });
    }
  }
  reset(): void {
    this.buckets.clear();
  }
}

// ─── Dates (fuseau Africa/Douala = UTC+1, sans heure d'été) ────────────────────
const DOUALA_OFFSET_MS = 60 * 60 * 1000;
export const doualaDay = (d: Date): string => new Date(d.getTime() + DOUALA_OFFSET_MS).toISOString().slice(0, 10);
export const doualaDayStart = (day: string): Date => new Date(`${day}T00:00:00+01:00`);
export const addDays = (day: string, n: number): string => doualaDay(new Date(doualaDayStart(day).getTime() + n * 86_400_000 + 1));
export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
