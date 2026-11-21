import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Racine du paquet apps/api (fonctionne depuis src/ et dist/). */
export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('.pglite'),
  PAYMENT_PROVIDER: z.enum(['mock', 'mtn_momo', 'orange_money']).default('mock'),
  MOCK_PSP_WEBHOOK_SECRET: z.string().min(16).optional(),
  MOCK_PSP_MERCHANT_REF: z.string().min(3).default('WAKA-MOCK-MERCHANT'),
  APP_SECRET: z.string().min(32).optional(),
  HOLD_TTL_SECONDS: z.coerce.number().int().min(5).max(3600).default(600),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(72),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  ADMIN_ORIGIN: z.string().default('http://localhost:3001'),
  MOCK_PAYOUT_DELAY_MS: z.coerce.number().int().min(0).max(600_000).default(3000),
  OUTBOX_POLL_MS: z.coerce.number().int().min(50).max(60_000).default(1000),
  OUTBOX_WORKER: bool.default(true),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  SEED_ON_EMPTY: bool.default(true),
  OTP_MAX_PER_PHONE: z.coerce.number().int().min(1).default(3),
  OTP_MAX_PER_IP: z.coerce.number().int().min(1).default(3),
  TRUST_PROXY: z.string().default('loopback'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  databaseUrl: string | undefined;
  /** Chemin PGlite absolu, ou 'memory://' pour une base en mémoire. */
  pgliteDir: string;
  paymentProvider: 'mock' | 'mtn_momo' | 'orange_money';
  mockPspWebhookSecret: string;
  mockPspMerchantRef: string;
  appSecret: string;
  holdTtlSeconds: number;
  sessionTtlHours: number;
  adminSessionTtlHours: number;
  webOrigin: string;
  adminOrigin: string;
  mockPayoutDelayMs: number;
  outboxPollMs: number;
  outboxWorker: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  seedOnEmpty: boolean;
  otpMaxPerPhone: number;
  otpMaxPerIp: number;
  trustProxy: string;
  /** Avertissements de configuration à journaliser au démarrage. */
  warnings: string[];
}

const DEV_WEBHOOK_SECRET = 'dev-only-insecure-mock-psp-webhook-secret';
const DEV_APP_SECRET = 'dev-only-insecure-app-secret-change-me-0123456789';

/** Charge apps/api/.env s'il existe (Node ≥ 20.12), sans écraser l'environnement existant. */
export function loadDotEnv(): void {
  const file = join(PACKAGE_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<AppConfig> = {}): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Configuration invalide : ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const warnings: string[] = [];

  if (isProduction && e.PAYMENT_PROVIDER === 'mock') {
    throw new Error('PAYMENT_PROVIDER=mock est interdit en production : démarrage refusé.');
  }
  const secret = (value: string | undefined, name: string, fallback: string): string => {
    if (value) return value;
    if (isProduction) throw new Error(`${name} est obligatoire en production.`);
    warnings.push(`⚠️  ${name} absent : utilisation d'une valeur de DÉVELOPPEMENT non sécurisée. Ne jamais l'utiliser hors poste local.`);
    return fallback;
  };

  const pgliteDir = e.PGLITE_DIR === 'memory://' || isAbsolute(e.PGLITE_DIR) ? e.PGLITE_DIR : join(PACKAGE_ROOT, e.PGLITE_DIR);

  const cfg: AppConfig = {
    nodeEnv: e.NODE_ENV,
    isProduction,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL || undefined,
    pgliteDir,
    paymentProvider: e.PAYMENT_PROVIDER,
    mockPspWebhookSecret: e.PAYMENT_PROVIDER === 'mock' ? secret(e.MOCK_PSP_WEBHOOK_SECRET, 'MOCK_PSP_WEBHOOK_SECRET', DEV_WEBHOOK_SECRET) : '',
    mockPspMerchantRef: e.MOCK_PSP_MERCHANT_REF,
    appSecret: secret(e.APP_SECRET, 'APP_SECRET', DEV_APP_SECRET),
    holdTtlSeconds: e.HOLD_TTL_SECONDS,
    sessionTtlHours: e.SESSION_TTL_HOURS,
    adminSessionTtlHours: e.ADMIN_SESSION_TTL_HOURS,
    webOrigin: e.WEB_ORIGIN,
    adminOrigin: e.ADMIN_ORIGIN,
    mockPayoutDelayMs: e.MOCK_PAYOUT_DELAY_MS,
    outboxPollMs: e.OUTBOX_POLL_MS,
    outboxWorker: e.OUTBOX_WORKER,
    logLevel: e.LOG_LEVEL,
    seedOnEmpty: e.SEED_ON_EMPTY && !isProduction,
    otpMaxPerPhone: e.OTP_MAX_PER_PHONE,
    otpMaxPerIp: e.OTP_MAX_PER_IP,
    trustProxy: e.TRUST_PROXY,
    warnings,
    ...overrides,
  };
  return cfg;
}
