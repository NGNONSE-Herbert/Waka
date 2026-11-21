import 'reflect-metadata';
import { type CanActivate, type DynamicModule, type ExecutionContext, type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BRAND, DomainError } from '@waka/domain';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import type { Database } from './db/client.js';
import { AdminService } from './admin/admin.service.js';
import { AuthService } from './auth/auth.service.js';
import { StaffGuard, UserGuard } from './auth/guards.js';
import { BookingsService } from './bookings/bookings.service.js';
import { AuditService } from './common/audit.service.js';
import { GlobalExceptionFilter } from './common/errors.js';
import { requestIdMiddleware } from './common/http.js';
import { currentRequestId, JsonLogger } from './common/logger.js';
import { CONFIG, DATABASE, JOB_QUEUE, LOGGER, PAYMENT_PROVIDERS } from './common/tokens.js';
import { ViewsService } from './common/views.service.js';
import { AdminAuthController, AdminController, DevController, WebhooksController } from './controllers/admin.controller.js';
import { AuthController, BookingsController, DriverController, HealthController, TripsController } from './controllers/public.controller.js';
import { DisputesService } from './disputes/disputes.service.js';
import { DriverService } from './driver/driver.service.js';
import { LedgerService } from './ledger/ledger.service.js';
import { NotificationsService } from './outbox/notifications.service.js';
import { OutboxQueue, OutboxWorker } from './outbox/outbox.js';
import { createProviderRegistry, type ProviderRegistry } from './payments/providers.js';
import { PaymentsService } from './payments/payments.service.js';
import { TripsService } from './trips/trips.service.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Anti-CSRF : en-tête `X-Waka-Request: 1` requis sur toute requête mutante, sauf webhooks signés. */
class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(req.method) || req.path.startsWith('/v1/webhooks/')) return true;
    if (req.header('x-waka-request') !== '1') throw new DomainError('FORBIDDEN', 'En-tête anti-CSRF X-Waka-Request manquant.');
    return true;
  }
}

function buildModule(config: AppConfig, database: Database, logger: JsonLogger, providers: ProviderRegistry): DynamicModule {
  @Module({})
  class WakaModule {}
  const devControllers = !config.isProduction && providers.mock ? [DevController] : [];
  return {
    module: WakaModule,
    controllers: [HealthController, AuthController, TripsController, DriverController, BookingsController, WebhooksController, AdminAuthController, AdminController, ...devControllers],
    providers: [
      { provide: CONFIG, useValue: config },
      { provide: DATABASE, useValue: database },
      { provide: LOGGER, useValue: logger },
      { provide: PAYMENT_PROVIDERS, useValue: providers },
      OutboxQueue,
      { provide: JOB_QUEUE, useExisting: OutboxQueue },
      OutboxWorker,
      AuditService,
      LedgerService,
      ViewsService,
      NotificationsService,
      AuthService,
      UserGuard,
      StaffGuard,
      PaymentsService,
      BookingsService,
      TripsService,
      DriverService,
      DisputesService,
      AdminService,
    ],
  };
}

export interface WakaApp {
  app: INestApplication;
  worker: OutboxWorker;
  get<T>(token: new (...args: never[]) => T): T;
  close(): Promise<void>;
}

/** Construit l'application Nest complète (utilisée par main.ts ET par les tests). */
export async function createApp(config: AppConfig, database: Database, logger = new JsonLogger(config.logLevel)): Promise<WakaApp> {
  const providers = createProviderRegistry(database, config); // lève si MOCK en production
  const app = await NestFactory.create<NestExpressApplication>(buildModule(config, database, logger, providers), {
    rawBody: true,
    logger,
    abortOnError: false,
  });
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '20kb', extended: false });
  app.use(requestIdMiddleware(logger));
  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.enableCors({
    origin: [config.webOrigin, config.adminOrigin],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Waka-Request', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.use(cookieParser());
  app.useGlobalGuards(new CsrfGuard());
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.enableShutdownHooks();

  if (!config.isProduction) {
    const doc = new DocumentBuilder()
      .setTitle(`${BRAND.name} API`)
      .setDescription('API REST Waka (MVP). Paiements MOCK uniquement. Sessions par cookie HttpOnly ; en-tête X-Waka-Request: 1 requis sur les requêtes mutantes.')
      .setVersion('0.1.0')
      .addCookieAuth('waka_session')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  await app.init();
  // Erreurs survenues avant le routage Nest (JSON invalide, corps trop volumineux).
  app.use((err: { status?: number; type?: string } & Error, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const status = typeof err.status === 'number' ? err.status : 500;
    const code = status === 413 ? 'PAYLOAD_TOO_LARGE' : status < 500 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    const message = status === 413 ? 'Requête trop volumineuse.' : status < 500 ? 'Corps de requête invalide.' : 'Une erreur interne est survenue.';
    res.status(status).json({ error: { code, message, requestId: currentRequestId() ?? String(res.getHeader('x-request-id') ?? 'unknown') } });
  });

  const worker = app.get(OutboxWorker);
  worker.start();
  for (const w of config.warnings) logger.warnFields(w);

  return {
    app,
    worker,
    get: <T>(token: new (...args: never[]) => T) => app.get(token),
    close: async () => {
      await app.close();
    },
  };
}
