import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  DEFAULT_FEE_POLICY,
  DEFAULT_NO_RESPONSE_POLICY,
  DomainError,
  DOUBLE_APPROVAL_THRESHOLD_XAF,
  maskPhone,
  MATCHING_VERSION,
  PAYMENT_STATE_LABEL_FR,
  type PaymentState,
  requirePermission,
} from '@waka/domain';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import { type Database, rows } from '../db/client.js';
import { anomalies, auditLogs, driverProfiles, ledgerJournals, ledgerLines, payments, reconciliationRuns, staffUsers, users, vehicles } from '../db/schema.js';
import { AuditService } from '../common/audit.service.js';
import { type AuthStaff, doualaDay, doualaDayStart } from '../common/http.js';
import { CONFIG, DATABASE } from '../common/tokens.js';
import { CURRENT_TERMS_VERSION } from '../auth/auth.service.js';
import { DisputesService } from '../disputes/disputes.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PaymentsService } from '../payments/payments.service.js';

type Totals = { collections: number; payouts: number; refunds: number };
type Discrepancy = { providerRef: string; kind: string; providerAmount: number | null; ledgerAmount: number | null; issue: string };

const JOURNAL_KIND: Record<string, 'COLLECTION' | 'PAYOUT' | 'REFUND'> = {
  COLLECTION_CONFIRMED: 'COLLECTION',
  PAYOUT_CONFIRMED: 'PAYOUT',
  REFUND_CONFIRMED: 'REFUND',
};
const TOTAL_KEY = { COLLECTION: 'collections', PAYOUT: 'payouts', REFUND: 'refunds' } as const;

@Injectable()
export class AdminService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(DisputesService) private readonly disputes: DisputesService,
  ) {}

  private get db() {
    return this.database.db;
  }
  private actor(s: AuthStaff): Actor {
    return { userId: s.id, roles: s.roles, mfaVerified: s.mfaVerified };
  }

  // ─── Tableau de bord ────────────────────────────────────────────────────────
  async dashboard(staff: AuthStaff) {
    requirePermission(this.actor(staff), 'admin:access');
    const [upcoming] = await rows<{ n: number }>(this.db, sql`SELECT COUNT(*)::int AS n FROM trips WHERE status = 'PUBLISHED' AND departure_at > now()`);
    const bookingsByState = Object.fromEntries((await rows<{ state: string; n: number }>(this.db, sql`SELECT state, COUNT(*)::int AS n FROM bookings GROUP BY state`)).map((r) => [r.state, Number(r.n)]));
    const paymentsByState = Object.fromEntries((await rows<{ state: string; n: number }>(this.db, sql`SELECT state, COUNT(*)::int AS n FROM payments GROUP BY state`)).map((r) => [r.state, Number(r.n)]));
    const bal = await this.ledger.balances(this.db);
    const [kycD] = await rows<{ n: number }>(this.db, sql`SELECT COUNT(*)::int AS n FROM driver_profiles WHERE kyc_status = 'PENDING_REVIEW'`);
    const [kycV] = await rows<{ n: number }>(this.db, sql`SELECT COUNT(*)::int AS n FROM vehicles WHERE review_status = 'PENDING'`);
    const [anom] = await rows<{ n: number }>(this.db, sql`SELECT COUNT(*)::int AS n FROM anomalies WHERE status = 'OPEN'`);
    const [lastRec] = await this.db.select().from(reconciliationRuns).orderBy(desc(reconciliationRuns.ranAt)).limit(1);
    return {
      generatedAt: new Date().toISOString(),
      upcomingTrips: Number(upcoming?.n ?? 0),
      bookingsByState,
      paymentsByState,
      funds: {
        heldByPartner: bal.psp_held,
        driverPayable: -bal.driver_payable,
        feesDeferred: -bal.platform_fee_deferred,
        feesRecognized: -bal.platform_fee_revenue,
        currency: 'XAF' as const,
        disclaimer: 'Les fonds détenus par le partenaire de paiement appartiennent aux passagers et conducteurs : ce n’est pas un chiffre d’affaires. Seuls les frais acquis constituent un revenu.',
      },
      openDisputesByPriority: await this.disputes.openByPriority(),
      pendingKyc: { drivers: Number(kycD?.n ?? 0), vehicles: Number(kycV?.n ?? 0) },
      openAnomalies: Number(anom?.n ?? 0),
      lastReconciliation: lastRec ? { day: lastRec.day, status: lastRec.status, ranAt: lastRec.ranAt.toISOString() } : null,
    };
  }

  // ─── KYC ────────────────────────────────────────────────────────────────────
  async kycQueue(staff: AuthStaff) {
    requirePermission(this.actor(staff), 'kyc:review');
    const drivers = await this.db
      .select({ p: driverProfiles, displayName: users.displayName, phone: users.phoneE164, isDemo: users.isDemo })
      .from(driverProfiles)
      .innerJoin(users, eq(users.id, driverProfiles.userId))
      .where(eq(driverProfiles.kycStatus, 'PENDING_REVIEW'))
      .orderBy(asc(driverProfiles.submittedAt));
    const vs = await this.db
      .select({ v: vehicles, ownerName: users.displayName })
      .from(vehicles)
      .innerJoin(users, eq(users.id, vehicles.ownerId))
      .where(eq(vehicles.reviewStatus, 'PENDING'))
      .orderBy(asc(vehicles.createdAt));
    await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'kyc.queue_view', entityType: 'kyc', entityId: null });
    return {
      // La référence du document d'identité n'est JAMAIS exposée.
      drivers: drivers.map(({ p, displayName, phone, isDemo }) => ({
        userId: p.userId,
        fullName: p.fullName,
        displayName,
        maskedPhone: maskPhone(phone),
        kycStatus: p.kycStatus as 'PENDING_REVIEW',
        licenseExpiry: p.licenseExpiry,
        idDocumentType: p.idDocumentType,
        submittedAt: p.submittedAt.toISOString(),
        isDemo,
      })),
      vehicles: vs.map(({ v, ownerName }) => ({
        id: v.id,
        ownerId: v.ownerId,
        ownerName,
        label: `${v.make} ${v.model} · ${v.color}`,
        plateMasked: v.plateMasked,
        year: v.year,
        seatsTotal: v.seatsTotal,
        insuranceExpiry: v.insuranceExpiry,
        inspectionExpiry: v.inspectionExpiry,
        reviewStatus: v.reviewStatus as 'PENDING',
        createdAt: v.createdAt.toISOString(),
      })),
    };
  }

  async decideDriver(staff: AuthStaff, userId: string, input: { approve: boolean; reason: string }) {
    requirePermission(this.actor(staff), 'kyc:review');
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new DomainError('NOT_FOUND', 'Dossier introuvable.');
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(driverProfiles).where(eq(driverProfiles.userId, userId)).for('update');
      if (!p) throw new DomainError('NOT_FOUND', 'Dossier introuvable.');
      if (p.kycStatus !== 'PENDING_REVIEW') throw new DomainError('INVALID_TRANSITION', 'Ce dossier n’est pas en attente de revue.');
      if (input.approve && p.licenseExpiry <= doualaDay(new Date())) throw new DomainError('VALIDATION_ERROR', 'Permis expiré : approbation impossible.');
      const status = input.approve ? 'VERIFIED' : 'REJECTED';
      const reviewedAt = new Date();
      await tx.update(driverProfiles).set({ kycStatus: status, reviewedAt, reviewedBy: staff.id, reviewReason: input.reason }).where(eq(driverProfiles.userId, userId));
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'kyc.driver_decision', entityType: 'driver_profile', entityId: userId, before: { kycStatus: p.kycStatus }, after: { kycStatus: status }, reason: input.reason }, tx);
      return { id: userId, status, reviewedAt: reviewedAt.toISOString() };
    });
  }

  async decideVehicle(staff: AuthStaff, vehicleId: string, input: { approve: boolean; reason: string }) {
    requirePermission(this.actor(staff), 'kyc:review');
    if (!/^[0-9a-f-]{36}$/i.test(vehicleId)) throw new DomainError('NOT_FOUND', 'Véhicule introuvable.');
    return this.db.transaction(async (tx) => {
      const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update');
      if (!v) throw new DomainError('NOT_FOUND', 'Véhicule introuvable.');
      if (v.reviewStatus !== 'PENDING') throw new DomainError('INVALID_TRANSITION', 'Ce véhicule n’est pas en attente de revue.');
      const today = doualaDay(new Date());
      if (input.approve && (v.insuranceExpiry <= today || v.inspectionExpiry <= today)) throw new DomainError('VALIDATION_ERROR', 'Assurance ou visite technique expirée : approbation impossible.');
      const status = input.approve ? 'APPROVED' : 'REJECTED';
      const reviewedAt = new Date();
      await tx.update(vehicles).set({ reviewStatus: status, reviewedAt, reviewedBy: staff.id, reviewReason: input.reason }).where(eq(vehicles.id, vehicleId));
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'kyc.vehicle_decision', entityType: 'vehicle', entityId: vehicleId, before: { reviewStatus: v.reviewStatus }, after: { reviewStatus: status }, reason: input.reason }, tx);
      return { id: vehicleId, status, reviewedAt: reviewedAt.toISOString() };
    });
  }

  // ─── Finance (lecture seule : aucune route n'écrit au grand livre) ──────────
  async paymentsList(staff: AuthStaff, filter: { state?: string | undefined }) {
    requirePermission(this.actor(staff), 'finance:view');
    const list = await rows<{ id: string; booking_id: string; state: PaymentState; amount: number; channel: string; provider: string; provider_ref: string | null; payer_phone_masked: string; route: string; created_at: Date; updated_at: Date }>(
      this.db,
      sql`SELECT p.id, p.booking_id, p.state, p.amount, p.channel, p.provider, p.provider_ref, p.payer_phone_masked,
                 (t.origin_city || ' → ' || t.destination_city) AS route, p.created_at, p.updated_at
          FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN trips t ON t.id = b.trip_id
          ${filter.state ? sql`WHERE p.state = ${filter.state}` : sql``}
          ORDER BY p.updated_at DESC LIMIT 200`,
    );
    const anoms = await this.db.select().from(anomalies).orderBy(desc(anomalies.createdAt)).limit(100);
    await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'finance.payments_view', entityType: 'payment', entityId: null });
    return {
      items: list.map((p) => ({
        id: p.id,
        bookingId: p.booking_id,
        state: p.state,
        stateLabel: PAYMENT_STATE_LABEL_FR[p.state],
        amount: p.amount,
        currency: 'XAF' as const,
        channel: p.channel as 'MTN_MOMO' | 'ORANGE_MONEY',
        provider: p.provider,
        providerRef: p.provider_ref,
        payerPhoneMasked: p.payer_phone_masked,
        route: p.route,
        createdAt: new Date(p.created_at).toISOString(),
        updatedAt: new Date(p.updated_at).toISOString(),
      })),
      anomalies: anoms.map((a) => ({ id: a.id, kind: a.kind, paymentId: a.paymentId, bookingId: a.bookingId, status: a.status, details: a.details, createdAt: a.createdAt.toISOString() })),
    };
  }

  async ledgerView(staff: AuthStaff) {
    requirePermission(this.actor(staff), 'finance:view');
    const journals = await this.db.select().from(ledgerJournals).orderBy(desc(ledgerJournals.createdAt)).limit(200);
    const ids = journals.map((j) => j.id);
    const lines = ids.length ? await this.db.select().from(ledgerLines).where(inArray(ledgerLines.journalId, ids)).orderBy(asc(ledgerLines.id)) : [];
    await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'finance.ledger_view', entityType: 'ledger', entityId: null });
    return {
      balances: await this.ledger.balances(this.db),
      journals: journals.map((j) => ({
        id: j.id,
        kind: j.kind,
        bookingId: j.bookingId,
        idempotencyKey: j.idempotencyKey,
        providerRef: j.providerRef,
        memo: j.memo,
        createdAt: j.createdAt.toISOString(),
        lines: lines.filter((l) => l.journalId === j.id).map((l) => ({ account: l.account, debit: l.debit, credit: l.credit })),
      })),
    };
  }

  private runView(r: typeof reconciliationRuns.$inferSelect) {
    return { day: r.day, ranAt: r.ranAt.toISOString(), providerTotals: r.providerTotals, ledgerTotals: r.ledgerTotals, discrepancies: r.discrepancies, status: r.status as 'MATCHED' | 'DISCREPANCY' };
  }

  async reconciliation(staff: AuthStaff, day?: string) {
    requirePermission(this.actor(staff), 'finance:view');
    const d = day ?? doualaDay(new Date());
    const [r] = await this.db.select().from(reconciliationRuns).where(eq(reconciliationRuns.day, d)).orderBy(desc(reconciliationRuns.ranAt)).limit(1);
    if (!r) return { day: d, ranAt: null, providerTotals: { collections: 0, payouts: 0, refunds: 0 }, ledgerTotals: { collections: 0, payouts: 0, refunds: 0 }, discrepancies: [], status: 'NOT_RUN' as const };
    return this.runView(r);
  }

  /** Rapprochement PSP ⇄ grand livre pour un jour (fuseau Africa/Douala). Écart ⇒ anomalie à investiguer. */
  async runReconciliation(staff: AuthStaff, day?: string) {
    requirePermission(this.actor(staff), 'finance:reconcile');
    const d = day ?? doualaDay(new Date());
    if (Number.isNaN(doualaDayStart(d).getTime())) throw new DomainError('VALIDATION_ERROR', 'Jour invalide.');
    const providerLines = await this.payments.provider.reconcile(d);
    const start = doualaDayStart(d);
    const end = new Date(start.getTime() + 86_400_000);
    const ledgerRows = await rows<{ kind: string; provider_ref: string | null; amount: number }>(
      this.db,
      sql`SELECT j.kind, j.provider_ref,
                 (CASE WHEN j.kind = 'COLLECTION_CONFIRMED' THEN SUM(l.debit) ELSE SUM(l.credit) END)::int AS amount
          FROM ledger_journals j JOIN ledger_lines l ON l.journal_id = j.id AND l.account = 'psp_held'
          WHERE j.kind IN ('COLLECTION_CONFIRMED', 'PAYOUT_CONFIRMED', 'REFUND_CONFIRMED') AND j.created_at >= ${start} AND j.created_at < ${end}
          GROUP BY j.id, j.kind, j.provider_ref`,
    );
    const providerTotals: Totals = { collections: 0, payouts: 0, refunds: 0 };
    const ledgerTotals: Totals = { collections: 0, payouts: 0, refunds: 0 };
    const ledgerByRef = new Map<string, { kind: string; amount: number }>();
    for (const l of ledgerRows) {
      const kind = JOURNAL_KIND[l.kind]!;
      ledgerTotals[TOTAL_KEY[kind]] += Number(l.amount);
      if (l.provider_ref) ledgerByRef.set(l.provider_ref, { kind, amount: Number(l.amount) });
    }
    const discrepancies: Discrepancy[] = [];
    const seen = new Set<string>();
    for (const p of providerLines) {
      if (p.status !== 'SUCCEEDED') continue;
      providerTotals[TOTAL_KEY[p.kind]] += p.amountXaf;
      seen.add(p.providerRef);
      const l = ledgerByRef.get(p.providerRef);
      if (!l) discrepancies.push({ providerRef: p.providerRef, kind: p.kind, providerAmount: p.amountXaf, ledgerAmount: null, issue: 'MISSING_IN_LEDGER' });
      else if (l.amount !== p.amountXaf) discrepancies.push({ providerRef: p.providerRef, kind: p.kind, providerAmount: p.amountXaf, ledgerAmount: l.amount, issue: 'AMOUNT_MISMATCH' });
    }
    for (const [ref, l] of ledgerByRef) {
      if (!seen.has(ref)) discrepancies.push({ providerRef: ref, kind: l.kind, providerAmount: null, ledgerAmount: l.amount, issue: 'MISSING_AT_PROVIDER' });
    }
    const status = discrepancies.length ? 'DISCREPANCY' : 'MATCHED';
    const run = await this.db.transaction(async (tx) => {
      const [r] = await tx.insert(reconciliationRuns).values({ day: d, ranBy: staff.id, status, providerTotals, ledgerTotals, discrepancies }).returning();
      for (const x of discrepancies) await tx.insert(anomalies).values({ kind: 'RECONCILIATION_DISCREPANCY', details: { day: d, ...x } });
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'finance.reconciliation_run', entityType: 'reconciliation', entityId: r!.id, after: { day: d, status, discrepancies: discrepancies.length } }, tx);
      return r!;
    });
    return this.runView(run);
  }

  // ─── Audit, politiques, équipe ─────────────────────────────────────────────
  async auditList(staff: AuthStaff, q: { entityType?: string | undefined; entityId?: string | undefined; limit?: number }) {
    requirePermission(this.actor(staff), 'audit:view');
    const conds = [];
    if (q.entityType) conds.push(eq(auditLogs.entityType, q.entityType));
    if (q.entityId) conds.push(eq(auditLogs.entityId, q.entityId));
    const list = await this.db.select().from(auditLogs).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLogs.id)).limit(Math.min(q.limit ?? 200, 500));
    const chain = await this.audit.verifyChain();
    await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'audit.view', entityType: 'audit', entityId: null });
    return {
      chain,
      items: list.map((a) => ({ id: a.id, at: a.at.toISOString(), actorType: a.actorType, actorId: a.actorId, action: a.action, entityType: a.entityType, entityId: a.entityId, reason: a.reason, ip: a.ip, hash: a.hash, prevHash: a.prevHash })),
    };
  }

  policies(staff: AuthStaff) {
    requirePermission(this.actor(staff), 'admin:access');
    const p = this.payments.provider;
    return {
      feePolicy: { ...DEFAULT_FEE_POLICY },
      noResponsePolicy: { ...DEFAULT_NO_RESPONSE_POLICY },
      holdTtlSeconds: this.config.holdTtlSeconds,
      matchingVersion: MATCHING_VERSION,
      doubleApprovalThresholdXaf: DOUBLE_APPROVAL_THRESHOLD_XAF,
      termsVersion: CURRENT_TERMS_VERSION,
      paymentProvider: { id: p.id, mode: p.mode, capabilities: { ...p.capabilities } },
    };
  }

  async staffList(staff: AuthStaff) {
    requirePermission(this.actor(staff), 'admin:access');
    const list = await this.db.select().from(staffUsers).orderBy(asc(staffUsers.email));
    return { items: list.map((s) => ({ id: s.id, email: s.email, displayName: s.displayName, roles: s.roles as never, status: s.status })) };
  }
}
