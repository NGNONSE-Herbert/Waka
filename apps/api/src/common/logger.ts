import { AsyncLocalStorage } from 'node:async_hooks';
import type { LoggerService } from '@nestjs/common';

export interface RequestContext {
  requestId: string;
  ip?: string | undefined;
}

/** Contexte de requête propagé (requestId) jusque dans les services et les journaux. */
export const requestContext = new AsyncLocalStorage<RequestContext>();
export const currentRequestId = (): string | undefined => requestContext.getStore()?.requestId;

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * Journal JSON structuré (une ligne par événement). Règles :
 * - jamais de numéro de téléphone en clair (utiliser maskPhone) ;
 * - jamais de code OTP / PIN / secret hors développement.
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly level: Level | 'silent' = 'info') {}

  private write(level: Level, msg: unknown, fields?: Record<string, unknown>, context?: string): void {
    if (ORDER[level] < ORDER[this.level]) return;
    const entry: Record<string, unknown> = {
      t: new Date().toISOString(),
      level,
      msg: typeof msg === 'string' ? msg : msg instanceof Error ? msg.message : JSON.stringify(msg),
    };
    const rid = currentRequestId();
    if (rid) entry.requestId = rid;
    if (context) entry.context = context;
    if (fields) Object.assign(entry, fields);
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.write('info', msg, fields);
  }
  debug(msg: unknown, ...rest: unknown[]): void {
    this.write('debug', msg, undefined, typeof rest.at(-1) === 'string' ? (rest.at(-1) as string) : undefined);
  }
  warnFields(msg: string, fields?: Record<string, unknown>): void {
    this.write('warn', msg, fields);
  }
  errorFields(msg: string, fields?: Record<string, unknown>): void {
    this.write('error', msg, fields);
  }

  // LoggerService (Nest)
  log(message: unknown, ...optional: unknown[]): void {
    this.write('info', message, undefined, typeof optional.at(-1) === 'string' ? (optional.at(-1) as string) : undefined);
  }
  error(message: unknown, ...optional: unknown[]): void {
    this.write('error', message, undefined, typeof optional.at(-1) === 'string' ? (optional.at(-1) as string) : undefined);
  }
  warn(message: unknown, ...optional: unknown[]): void {
    this.write('warn', message, undefined, typeof optional.at(-1) === 'string' ? (optional.at(-1) as string) : undefined);
  }
  verbose(message: unknown, ...optional: unknown[]): void {
    this.debug(message, ...optional);
  }
}
