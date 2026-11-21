import { Inject, Injectable } from '@nestjs/common';
import { DomainError, maskPhone, normalizeCmPhone, ROLE_PERMISSIONS, type Role } from '@waka/domain';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import { type Database, one } from '../db/client.js';
import { adminChallenges, consents, otpChallenges, sessions, staffUsers, userRoles, users } from '../db/schema.js';
import { AuditService } from '../common/audit.service.js';
import { hmacSha256, randomDigits, randomToken, Sealer, safeEqual, sha256, totp, verifyPassword, verifyTotp } from '../common/crypto.js';
import { HttpError } from '../common/errors.js';
import { type AuthStaff, type AuthUser, RateLimiter } from '../common/http.js';
import type { JsonLogger } from '../common/logger.js';
import { CONFIG, DATABASE, LOGGER } from '../common/tokens.js';

export const USER_COOKIE = 'waka_session';
export const ADMIN_COOKIE = 'waka_admin';
export const CURRENT_TERMS_VERSION = 'cgu-2026-11-v1';
const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_WINDOW_MS = 10 * 60_000;
const ADMIN_CHALLENGE_TTL_MS = 5 * 60_000;

@Injectable()
export class AuthService {
  readonly limiter = new RateLimiter();
  readonly sealer: Sealer;

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: JsonLogger,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {
    this.sealer = new Sealer(config.appSecret);
  }

  private get db() {
    return this.database.db;
  }

  private otpHash(challengeId: string, code: string): string {
    return hmacSha256(this.config.appSecret, `otp:${challengeId}:${code}`);
  }

  // ─── OTP passagers / conducteurs ────────────────────────────────────────────
  async startOtp(phoneInput: string, ip: string) {
    const phone = normalizeCmPhone(phoneInput);
    const since = new Date(Date.now() - OTP_WINDOW_MS);
    const counts = await one<{ by_phone: number; by_ip: number }>(
      this.db,
      sql`SELECT (SELECT COUNT(*) FROM otp_challenges WHERE phone_e164 = ${phone} AND created_at > ${since})::int AS by_phone,
                 (SELECT COUNT(*) FROM otp_challenges WHERE ip = ${ip} AND created_at > ${since})::int AS by_ip`,
    );
    if ((counts?.by_phone ?? 0) >= this.config.otpMaxPerPhone || (counts?.by_ip ?? 0) >= this.config.otpMaxPerIp) {
      throw new DomainError('RATE_LIMITED', 'Trop de demandes de code. Réessayez dans 10 minutes.', { retryAfterSeconds: 600 });
    }
    const code = randomDigits(6);
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.db.insert(otpChallenges).values({ id, phoneE164: phone, codeHash: this.otpHash(id, code), ip, expiresAt });
    // SMS simulé : le code n'est journalisé qu'en développement.
    this.logger.info('otp.sent', { phone: maskPhone(phone), challengeId: id, ...(this.config.isProduction ? {} : { devCode: code }) });
    return {
      challengeId: id,
      expiresAt: expiresAt.toISOString(),
      maskedPhone: maskPhone(phone),
      ...(this.config.isProduction ? {} : { devCode: code }),
    };
  }

  async verifyOtp(input: { challengeId: string; code: string; acceptedTermsVersion: string; displayName?: string | undefined }, ip: string) {
    if (input.acceptedTermsVersion !== CURRENT_TERMS_VERSION) {
      throw new DomainError('VALIDATION_ERROR', `Veuillez accepter les conditions en vigueur (${CURRENT_TERMS_VERSION}).`, { currentTermsVersion: CURRENT_TERMS_VERSION });
    }
    const invalid = () => new DomainError('VALIDATION_ERROR', 'Code invalide ou expiré.');
    if (!/^[0-9a-f-]{36}$/i.test(input.challengeId)) throw invalid();
    const result = await this.db.transaction(async (tx) => {
      const [ch] = await tx.select().from(otpChallenges).where(eq(otpChallenges.id, input.challengeId)).for('update');
      if (!ch || ch.consumedAt || ch.expiresAt < new Date()) return { error: invalid() };
      if (ch.attempts >= OTP_MAX_ATTEMPTS) return { error: new DomainError('RATE_LIMITED', 'Trop de tentatives : demandez un nouveau code.') };
      if (!safeEqual(this.otpHash(ch.id, input.code), ch.codeHash)) {
        await tx.update(otpChallenges).set({ attempts: ch.attempts + 1 }).where(eq(otpChallenges.id, ch.id));
        return { error: new DomainError('VALIDATION_ERROR', 'Code incorrect.', { remainingAttempts: OTP_MAX_ATTEMPTS - ch.attempts - 1 }) };
      }
      await tx.update(otpChallenges).set({ consumedAt: new Date() }).where(eq(otpChallenges.id, ch.id));
      let [user] = await tx.select().from(users).where(eq(users.phoneE164, ch.phoneE164));
      let created = false;
      if (!user) {
        const displayName = input.displayName?.trim() || `Voyageur ${ch.phoneE164.slice(-2)}`;
        [user] = await tx.insert(users).values({ phoneE164: ch.phoneE164, displayName }).returning();
        await tx.insert(userRoles).values({ userId: user!.id, role: 'PASSENGER' });
        created = true;
      }
      if (!user) throw new Error('Utilisateur non créé');
      if (user.status !== 'ACTIVE') return { error: new DomainError('FORBIDDEN', 'Compte suspendu. Contactez le support.') };
      await tx.insert(consents).values({ userId: user.id, termsVersion: input.acceptedTermsVersion }).onConflictDoNothing();
      const token = randomToken();
      const expiresAt = new Date(Date.now() + this.config.sessionTtlHours * 3_600_000);
      await tx.insert(sessions).values({ tokenSha256: sha256(token), kind: 'user', userId: user.id, ip, expiresAt });
      return { token, expiresAt, userId: user.id, created };
    });
    if ('error' in result) throw result.error;
    return result;
  }

  async resolveUserSession(token: string | undefined): Promise<AuthUser | null> {
    if (!token || token.length > 200) return null;
    const row = await one<{ session_id: string; id: string; display_name: string; phone_e164: string; is_demo: boolean; status: string; roles: string[] | null }>(
      this.db,
      sql`SELECT s.id AS session_id, u.id, u.display_name, u.phone_e164, u.is_demo, u.status,
                 (SELECT array_agg(role ORDER BY role) FROM user_roles r WHERE r.user_id = u.id) AS roles
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_sha256 = ${sha256(token)} AND s.kind = 'user' AND s.revoked_at IS NULL AND s.expires_at > now()`,
    );
    if (!row || row.status !== 'ACTIVE') return null;
    return { id: row.id, displayName: row.display_name, phoneE164: row.phone_e164, isDemo: row.is_demo, roles: (row.roles ?? []) as Role[], sessionId: row.session_id };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  // ─── Staff : mot de passe puis TOTP ─────────────────────────────────────────
  async adminLogin(email: string, password: string, ip: string) {
    this.limiter.hit(`admin-login:ip:${ip}`, 20, 15 * 60_000);
    this.limiter.hit(`admin-login:email:${email.toLowerCase()}`, 10, 15 * 60_000);
    const [staff] = await this.db.select().from(staffUsers).where(eq(staffUsers.email, email.toLowerCase()));
    // Vérification systématique (même sans compte) pour limiter l'énumération par chronométrage.
    const ok = await verifyPassword(password, staff?.passwordHash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    if (!staff || !ok || staff.status !== 'ACTIVE') {
      await this.audit.append({ actorType: 'SYSTEM', actorId: null, action: 'admin.login_failed', entityType: 'staff', entityId: staff?.id ?? null, ip });
      throw new HttpError(401, 'UNAUTHENTICATED', 'Identifiants invalides.');
    }
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ADMIN_CHALLENGE_TTL_MS);
    await this.db.insert(adminChallenges).values({ id, staffId: staff.id, ip, expiresAt });
    const secret = this.sealer.open(staff.totpSecretEnc);
    return {
      challengeId: id,
      mfaRequired: true as const,
      expiresAt: expiresAt.toISOString(),
      // DÉVELOPPEMENT UNIQUEMENT : code TOTP courant pour faciliter la démo. Jamais en production.
      ...(this.config.isProduction ? {} : { devTotp: totp(secret) }),
    };
  }

  async adminMfa(challengeId: string, code: string, ip: string) {
    this.limiter.hit(`admin-mfa:ip:${ip}`, 30, 15 * 60_000);
    const invalid = () => new HttpError(401, 'UNAUTHENTICATED', 'Code de vérification invalide ou expiré.');
    if (!/^[0-9a-f-]{36}$/i.test(challengeId)) throw invalid();
    const res = await this.db.transaction(async (tx) => {
      const [ch] = await tx.select().from(adminChallenges).where(eq(adminChallenges.id, challengeId)).for('update');
      if (!ch || ch.consumedAt || ch.expiresAt < new Date() || ch.attempts >= 5) return { error: invalid() };
      const [staff] = await tx.select().from(staffUsers).where(eq(staffUsers.id, ch.staffId));
      if (!staff || staff.status !== 'ACTIVE') return { error: invalid() };
      if (!verifyTotp(this.sealer.open(staff.totpSecretEnc), code)) {
        await tx.update(adminChallenges).set({ attempts: ch.attempts + 1 }).where(eq(adminChallenges.id, ch.id));
        return { error: invalid() };
      }
      await tx.update(adminChallenges).set({ consumedAt: new Date() }).where(eq(adminChallenges.id, ch.id));
      const token = randomToken();
      const expiresAt = new Date(Date.now() + this.config.adminSessionTtlHours * 3_600_000);
      await tx.insert(sessions).values({ tokenSha256: sha256(token), kind: 'admin', staffId: staff.id, mfaVerified: true, ip, expiresAt });
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'admin.login', entityType: 'staff', entityId: staff.id, ip }, tx);
      return { token, expiresAt, staff };
    });
    if ('error' in res) throw res.error;
    return res;
  }

  async resolveStaffSession(token: string | undefined): Promise<AuthStaff | null> {
    if (!token || token.length > 200) return null;
    const [row] = await this.db
      .select({ sessionId: sessions.id, mfa: sessions.mfaVerified, id: staffUsers.id, email: staffUsers.email, displayName: staffUsers.displayName, roles: staffUsers.roles, status: staffUsers.status })
      .from(sessions)
      .innerJoin(staffUsers, eq(staffUsers.id, sessions.staffId))
      .where(and(eq(sessions.tokenSha256, sha256(token)), eq(sessions.kind, 'admin'), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
    if (!row || row.status !== 'ACTIVE' || !row.mfa) return null;
    return { id: row.id, email: row.email, displayName: row.displayName, roles: row.roles as Role[], mfaVerified: row.mfa, sessionId: row.sessionId };
  }

  staffPermissions(roles: readonly Role[]): string[] {
    return [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]))].sort();
  }
}
