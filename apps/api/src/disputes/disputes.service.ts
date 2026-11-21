import { Inject, Injectable } from '@nestjs/common';
import type { DisputeOutput } from '@waka/contracts';
import {
  type Actor,
  assertDistinctApprover,
  bookingMachine,
  type BookingState,
  canViewDispute,
  disputeMachine,
  type DisputeState,
  DomainError,
  hasPermission,
  PAYMENT_STATE_LABEL_FR,
  type PaymentState,
  requirePermission,
  validateAllocation,
} from '@waka/domain';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { type Database, type Tx } from '../db/client.js';
import { anomalies, bookings, disputeDecisions, disputeEvents, disputeEvidence, disputes, payments, payouts, refunds, staffUsers, trips, users } from '../db/schema.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthStaff, AuthUser } from '../common/http.js';
import { DATABASE } from '../common/tokens.js';
import { NotificationsService } from '../outbox/notifications.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { lockBooking, lockPaymentByBooking, setBookingState, setPaymentState, walkPayment } from '../bookings/booking-ops.js';

type DisputeRow = typeof disputes.$inferSelect;

const SAFETY_CATEGORIES = ['DANGEROUS_BEHAVIOUR', 'THEFT_ASSAULT_HARASSMENT', 'ACCIDENT'];
const HIGH_CATEGORIES = ['DRIVER_NO_SHOW', 'PAYMENT_ISSUE', 'PAYOUT_ISSUE', 'WRONG_IDENTITY_OR_VEHICLE'];
const SLA_HOURS = { SAFETY: 4, HIGH: 24, NORMAL: 72 } as const;
export const APPEAL_WINDOW_DAYS = 7;

/**
 * Consignes affichées pour tout litige de priorité SAFETY.
 * Numéros d'urgence camerounais usuels — À VÉRIFIER auprès des autorités avant lancement :
 * 117 (police), 118 (sapeurs-pompiers), 119 (SAMU / urgences médicales).
 */
export const SAFETY_GUIDANCE_FR =
  'Si vous êtes en danger, mettez-vous en sécurité et contactez immédiatement les secours : Police 117, Sapeurs-pompiers 118, SAMU 119. ' +
  'Waka n’est pas un service d’urgence : notre équipe traite votre signalement en priorité, mais ne remplace pas les autorités.';

const ACTOR_LABEL = { PASSENGER: 'le passager', DRIVER: 'le conducteur' } as const;

@Injectable()
export class DisputesService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.database.db;
  }

  private async event(tx: Tx, disputeId: string, actorKind: 'PASSENGER' | 'DRIVER' | 'WAKA_TEAM' | 'SYSTEM' | 'PSP', actorId: string | null, label: string) {
    await tx.insert(disputeEvents).values({ disputeId, actorKind, actorId, label });
  }

  private async transition(tx: Tx, d: DisputeRow, to: DisputeState, extra: Partial<DisputeRow> = {}): Promise<DisputeRow> {
    disputeMachine.assert(d.state as DisputeState, to);
    const [u] = await tx.update(disputes).set({ ...extra, state: to, updatedAt: new Date() }).where(and(eq(disputes.id, d.id), eq(disputes.state, d.state))).returning();
    if (!u) throw new DomainError('INVALID_TRANSITION', 'Le dossier a changé entre-temps ; rechargez-le.');
    return u;
  }

  // ─── Participants ───────────────────────────────────────────────────────────
  async open(user: AuthUser, bookingId: string, input: { category: string; description: string; requestedOutcome: string; urgentSafety: boolean }): Promise<DisputeOutput> {
    if (!hasPermission({ userId: user.id, roles: user.roles }, 'dispute:open')) throw new DomainError('FORBIDDEN', 'Permission manquante : dispute:open');
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) throw new DomainError('NOT_FOUND', 'Réservation introuvable.');
    let disputeId: string;
    try {
      disputeId = await this.db.transaction(async (tx) => {
        const b = await lockBooking(tx, bookingId);
        const [trip] = b ? await tx.select().from(trips).where(eq(trips.id, b.tripId)) : [];
        if (!b || !trip || (b.passengerId !== user.id && trip.driverId !== user.id)) throw new DomainError('NOT_FOUND', 'Réservation introuvable.');
        const openerRole = b.passengerId === user.id ? 'PASSENGER' : 'DRIVER';
        const counterpartyId = openerRole === 'PASSENGER' ? trip.driverId : b.passengerId;
        const disputable = bookingMachine.can(b.state as BookingState, 'DISPUTED') || b.state === 'COMPLETED';
        if (!disputable) throw new DomainError('INVALID_TRANSITION', 'Un litige ne peut pas être ouvert sur cette réservation.');

        const p = await lockPaymentByBooking(tx, b.id);
        let fundsStatus: 'FROZEN' | 'ALREADY_RELEASED' | 'RELEASE_IN_FLIGHT' | 'NOT_HELD' = 'NOT_HELD';
        if (p && (p.state === 'PSP_CONFIRMED_HELD' || p.state === 'RELEASE_ELIGIBLE')) {
          await setPaymentState(tx, p, 'FROZEN_DISPUTE'); // blocage de la libération
          fundsStatus = 'FROZEN';
        } else if (p && ['RELEASE_REQUESTED', 'PAYOUT_PROCESSING'].includes(p.state)) fundsStatus = 'RELEASE_IN_FLIGHT';
        else if (p && ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.state)) fundsStatus = 'ALREADY_RELEASED';
        if (fundsStatus === 'RELEASE_IN_FLIGHT' || fundsStatus === 'ALREADY_RELEASED') {
          // Fonds déjà engagés : traitement manuel par la finance (aucune reprise automatique).
          await tx.insert(anomalies).values({ kind: 'DISPUTE_AFTER_RELEASE', paymentId: p!.id, bookingId: b.id, details: { paymentState: p!.state } });
        }
        if (b.state !== 'COMPLETED') await setBookingState(tx, b, 'DISPUTED');

        const priority = input.urgentSafety || SAFETY_CATEGORIES.includes(input.category) ? 'SAFETY' : HIGH_CATEGORIES.includes(input.category) ? 'HIGH' : 'NORMAL';
        const [d] = await tx
          .insert(disputes)
          .values({
            bookingId: b.id,
            openerId: user.id,
            counterpartyId,
            openerRole,
            category: input.category,
            description: input.description,
            requestedOutcome: input.requestedOutcome,
            urgentSafety: input.urgentSafety,
            priority,
            state: 'OPENED',
            fundsStatus,
            dueAt: new Date(Date.now() + SLA_HOURS[priority] * 3_600_000),
          })
          .returning();
        await this.event(tx, d!.id, openerRole, user.id, `Litige ouvert par ${ACTOR_LABEL[openerRole]}`);
        await tx.insert(disputeEvidence).values({ disputeId: d!.id, fromKind: openerRole, authorId: user.id, text: input.description });
        if (fundsStatus === 'FROZEN') await this.event(tx, d!.id, 'SYSTEM', null, 'Règlement suspendu : fonds gelés chez le partenaire de paiement');
        if (fundsStatus === 'ALREADY_RELEASED' || fundsStatus === 'RELEASE_IN_FLIGHT') await this.event(tx, d!.id, 'SYSTEM', null, 'Fonds déjà versés ou en cours de versement : revue manuelle par la finance');
        // Tri automatique par le système.
        await this.transition(tx, d!, 'TRIAGED');
        await this.event(tx, d!.id, 'SYSTEM', null, `Dossier trié automatiquement — priorité ${priority}`);
        await this.notifications.notify(tx, counterpartyId, 'dispute.opened', { disputeId: d!.id }, `dispute-opened:${d!.id}`);
        await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'dispute.open', entityType: 'dispute', entityId: d!.id, after: { priority, fundsStatus, category: input.category } }, tx);
        return d!.id;
      });
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
      if (code === '23505') throw new DomainError('ALREADY_EXECUTED', 'Un litige est déjà en cours pour cette réservation.');
      throw e;
    }
    return this.participantView(disputeId, user.id);
  }

  private async participantDispute(user: AuthUser, id: string): Promise<DisputeRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError('NOT_FOUND', 'Litige introuvable.');
    const [d] = await this.db.select().from(disputes).where(eq(disputes.id, id));
    if (!d || !canViewDispute({ userId: user.id, roles: user.roles }, { assignedTo: d.assignedTo, openerId: d.openerId, counterpartyId: d.counterpartyId })) {
      throw new DomainError('NOT_FOUND', 'Litige introuvable.');
    }
    return d;
  }

  async detail(user: AuthUser, id: string): Promise<DisputeOutput> {
    await this.participantDispute(user, id);
    return this.participantView(id, user.id);
  }

  async addEvidence(user: AuthUser, id: string, input: { text: string; attachmentRef?: string | undefined }): Promise<DisputeOutput> {
    const d = await this.participantDispute(user, id);
    if (['APPROVED', 'EXECUTION_PENDING', 'RESOLVED', 'CLOSED'].includes(d.state)) throw new DomainError('INVALID_TRANSITION', 'Le dossier n’accepte plus de nouveaux éléments.');
    const from = d.openerId === user.id ? d.openerRole : d.openerRole === 'PASSENGER' ? 'DRIVER' : 'PASSENGER';
    await this.db.transaction(async (tx) => {
      await tx.insert(disputeEvidence).values({ disputeId: d.id, fromKind: from, authorId: user.id, text: input.text, attachmentRef: input.attachmentRef ?? null });
      await this.event(tx, d.id, from as 'PASSENGER' | 'DRIVER', user.id, `Nouvel élément déposé par ${ACTOR_LABEL[from as 'PASSENGER' | 'DRIVER']}`);
    });
    return this.participantView(d.id, user.id);
  }

  async appeal(user: AuthUser, id: string, reason?: string): Promise<DisputeOutput> {
    const d = await this.participantDispute(user, id);
    if (d.state !== 'RESOLVED' || !d.resolvedAt) throw new DomainError('INVALID_TRANSITION', 'Un recours n’est possible que sur un litige résolu.');
    if (Date.now() - d.resolvedAt.getTime() > APPEAL_WINDOW_DAYS * 86_400_000) throw new DomainError('INVALID_TRANSITION', 'Le délai de recours de 7 jours est dépassé.');
    const role = d.openerId === user.id ? d.openerRole : d.openerRole === 'PASSENGER' ? 'DRIVER' : 'PASSENGER';
    await this.db.transaction(async (tx) => {
      const appealed = await this.transition(tx, d, 'APPEALED');
      await this.event(tx, d.id, role as 'PASSENGER' | 'DRIVER', user.id, `Recours demandé par ${ACTOR_LABEL[role as 'PASSENGER' | 'DRIVER']}`);
      if (reason) await tx.insert(disputeEvidence).values({ disputeId: d.id, fromKind: role, authorId: user.id, text: reason });
      await this.transition(tx, appealed, 'UNDER_REVIEW');
      await this.event(tx, d.id, 'SYSTEM', null, 'Recours en cours de réexamen par l’équipe Waka');
      await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'dispute.appeal', entityType: 'dispute', entityId: d.id, before: { state: 'RESOLVED' }, after: { state: 'UNDER_REVIEW' } }, tx);
    });
    return this.participantView(d.id, user.id);
  }

  async baseView(d: DisputeRow, includeProposed: boolean): Promise<DisputeOutput> {
    const timeline = await this.db.select().from(disputeEvents).where(eq(disputeEvents.disputeId, d.id)).orderBy(asc(disputeEvents.id));
    const evidence = await this.db.select().from(disputeEvidence).where(eq(disputeEvidence.disputeId, d.id)).orderBy(asc(disputeEvidence.at));
    const decs = await this.db.select().from(disputeDecisions).where(eq(disputeDecisions.disputeId, d.id)).orderBy(desc(disputeDecisions.createdAt));
    const dec = includeProposed ? decs[0] : decs.find((x) => x.status === 'APPROVED');
    return {
      id: d.id,
      bookingId: d.bookingId,
      state: d.state as DisputeOutput['state'],
      category: d.category as DisputeOutput['category'],
      priority: d.priority as DisputeOutput['priority'],
      openedAt: d.createdAt.toISOString(),
      dueAt: d.dueAt ? d.dueAt.toISOString() : null,
      timeline: timeline.map((t) => ({ at: t.at.toISOString(), actor: t.actorKind as DisputeOutput['timeline'][number]['actor'], label: t.label })),
      evidence: evidence.map((e) => ({ id: e.id, from: e.fromKind as 'PASSENGER' | 'DRIVER' | 'WAKA_TEAM', text: e.text, at: e.at.toISOString() })),
      decision: dec ? { refundToPassenger: dec.refundToPassenger, releaseToDriver: dec.releaseToDriver, reason: dec.reason, state: dec.status as 'PROPOSED' | 'APPROVED' | 'REJECTED' } : null,
      safetyGuidance: d.priority === 'SAFETY' ? SAFETY_GUIDANCE_FR : null,
      fundsStatus: d.fundsStatus as NonNullable<DisputeOutput['fundsStatus']>,
      appealDeadline: d.state === 'RESOLVED' && d.resolvedAt ? new Date(d.resolvedAt.getTime() + APPEAL_WINDOW_DAYS * 86_400_000).toISOString() : null,
    };
  }

  private async participantView(id: string, userId: string): Promise<DisputeOutput> {
    const [d] = await this.db.select().from(disputes).where(eq(disputes.id, id));
    if (!d) throw new DomainError('NOT_FOUND', 'Litige introuvable.');
    const role = d.openerId === userId ? d.openerRole : d.openerRole === 'PASSENGER' ? 'DRIVER' : 'PASSENGER';
    return { ...(await this.baseView(d, false)), role: role as 'PASSENGER' | 'DRIVER' };
  }

  // ─── Console d'administration ───────────────────────────────────────────────
  private actor(staff: AuthStaff): Actor {
    return { userId: staff.id, roles: staff.roles, mfaVerified: staff.mfaVerified };
  }

  /** Accès au dossier : ABAC du domaine (support = dossiers attribués) + approbateurs financiers. */
  private canView(staff: AuthStaff, d: DisputeRow): boolean {
    const a = this.actor(staff);
    return canViewDispute(a, { assignedTo: d.assignedTo, openerId: d.openerId, counterpartyId: d.counterpartyId }) || hasPermission(a, 'dispute:approve_decision');
  }

  private async staffDispute(staff: AuthStaff, id: string): Promise<DisputeRow> {
    requirePermission(this.actor(staff), 'admin:access');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError('NOT_FOUND', 'Litige introuvable.');
    const [d] = await this.db.select().from(disputes).where(eq(disputes.id, id));
    if (!d || !this.canView(staff, d)) throw new DomainError('NOT_FOUND', 'Litige introuvable.');
    return d;
  }

  async adminList(staff: AuthStaff, filters: { state?: string | undefined; priority?: string | undefined }) {
    const a = this.actor(staff);
    requirePermission(a, 'admin:access');
    const all = hasPermission(a, 'dispute:view_all') || hasPermission(a, 'dispute:approve_decision');
    if (!all && !hasPermission(a, 'dispute:view_assigned')) throw new DomainError('FORBIDDEN', 'Permission manquante : dispute:view_assigned');
    const conds = [];
    if (!all) conds.push(eq(disputes.assignedTo, staff.id));
    if (filters.state) conds.push(eq(disputes.state, filters.state));
    if (filters.priority) conds.push(eq(disputes.priority, filters.priority));
    const list = await this.db
      .select({ d: disputes, total: bookings.total, o: trips.originCity, dest: trips.destinationCity, assigneeName: staffUsers.displayName })
      .from(disputes)
      .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .leftJoin(staffUsers, eq(staffUsers.id, disputes.assignedTo))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(sql`CASE ${disputes.priority} WHEN 'SAFETY' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END`, asc(disputes.dueAt))
      .limit(200);
    await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.list', entityType: 'dispute', entityId: null });
    return {
      items: list.map(({ d, total, o, dest, assigneeName }) => ({
        id: d.id,
        bookingId: d.bookingId,
        state: d.state,
        category: d.category,
        priority: d.priority,
        openedAt: d.createdAt.toISOString(),
        dueAt: d.dueAt ? d.dueAt.toISOString() : null,
        assignedTo: d.assignedTo ? { id: d.assignedTo, displayName: assigneeName ?? '—' } : null,
        fundsStatus: d.fundsStatus,
        amount: total,
        route: `${o} → ${dest}`,
        openerRole: d.openerRole,
      })),
      nextCursor: null,
    };
  }

  async adminDetail(staff: AuthStaff, id: string, audit = true) {
    const d = await this.staffDispute(staff, id);
    if (audit) await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.view', entityType: 'dispute', entityId: d.id });
    const base = await this.baseView(d, true);
    const [b] = await this.db.select().from(bookings).where(eq(bookings.id, d.bookingId));
    const [t] = await this.db.select().from(trips).where(eq(trips.id, b!.tripId));
    const [p] = await this.db.select().from(payments).where(eq(payments.bookingId, d.bookingId));
    const [pass] = await this.db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.id, b!.passengerId));
    const [drv] = await this.db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.id, t!.driverId));
    const staffNames = new Map((await this.db.select({ id: staffUsers.id, n: staffUsers.displayName }).from(staffUsers)).map((s) => [s.id, s.n]));
    const who = (sid: string | null) => (sid ? { id: sid, displayName: staffNames.get(sid) ?? '—' } : null);
    const decs = await this.db.select().from(disputeDecisions).where(eq(disputeDecisions.disputeId, d.id)).orderBy(desc(disputeDecisions.createdAt));
    const rs = await this.db.select().from(refunds).where(eq(refunds.bookingId, d.bookingId));
    const ps = await this.db.select().from(payouts).where(eq(payouts.bookingId, d.bookingId));
    const items = [...rs, ...ps].filter((x) => !x.disputeId || x.disputeId === d.id);
    const execStatus = items.length === 0 ? 'NOT_STARTED' : items.some((x) => x.status === 'FAILED') ? 'FAILED' : items.every((x) => x.status === 'SUCCEEDED') ? 'CONFIRMED' : 'PENDING';
    return {
      ...base,
      description: d.description,
      requestedOutcome: d.requestedOutcome,
      urgentSafety: d.urgentSafety,
      openerRole: d.openerRole as 'PASSENGER' | 'DRIVER',
      assignedTo: who(d.assignedTo),
      booking: { id: b!.id, state: b!.state, seats: b!.seats, total: b!.total, driverAmount: b!.driverAmount, serviceFee: b!.serviceFee, route: `${t!.originCity} → ${t!.destinationCity}`, departureAt: t!.departureAt.toISOString() },
      payment: p ? { id: p.id, state: p.state, stateLabel: PAYMENT_STATE_LABEL_FR[p.state as PaymentState], amount: p.amount, providerRef: p.providerRef } : null,
      participants: { passenger: pass!, driver: drv! },
      decisions: decs.map((x) => ({
        id: x.id,
        refundToPassenger: x.refundToPassenger,
        releaseToDriver: x.releaseToDriver,
        feeRetained: x.feeRetained,
        reason: x.reason,
        sensitive: x.sensitive,
        state: x.status as 'PROPOSED' | 'APPROVED' | 'REJECTED',
        proposedBy: who(x.proposedBy)!,
        approvedBy: who(x.approvedBy),
        rejectedBy: who(x.rejectedBy),
        rejectReason: x.rejectReason,
        createdAt: x.createdAt.toISOString(),
        decidedAt: x.decidedAt ? x.decidedAt.toISOString() : null,
      })),
      execution: {
        status: execStatus as 'NOT_STARTED' | 'PENDING' | 'CONFIRMED' | 'FAILED',
        refunds: rs.map((r) => ({ id: r.id, amount: r.amount, status: r.status, providerRef: r.providerRef })),
        payouts: ps.map((r) => ({ id: r.id, amount: r.amount, status: r.status, providerRef: r.providerRef })),
      },
      allowedActions: this.allowedActions(staff, d),
    };
  }

  private allowedActions(staff: AuthStaff, d: DisputeRow): string[] {
    const a = this.actor(staff);
    const out: string[] = [];
    const next = disputeMachine.next(d.state as DisputeState);
    if (hasPermission(a, 'dispute:view_all')) out.push('assign');
    if (hasPermission(a, 'dispute:request_evidence')) {
      if (d.state === 'OPENED' || d.state === 'TRIAGED') out.push('triage');
      if (next.includes('EVIDENCE_REQUESTED')) out.push('request-evidence');
      if (next.includes('UNDER_REVIEW') && d.state !== 'DECISION_PROPOSED') out.push('start-review');
    }
    if (hasPermission(a, 'dispute:propose_decision') && d.state === 'UNDER_REVIEW') out.push('decision');
    if (hasPermission(a, 'dispute:approve_decision') && d.state === 'DECISION_PROPOSED') out.push('approve', 'reject');
    if (hasPermission(a, 'dispute:propose_decision') && d.state === 'RESOLVED') out.push('close');
    return out;
  }

  private async staffAction<T>(staff: AuthStaff, id: string, perm: Parameters<typeof requirePermission>[1] | null, fn: (tx: Tx, d: DisputeRow) => Promise<T>): Promise<T> {
    const d0 = await this.staffDispute(staff, id);
    if (perm) requirePermission(this.actor(staff), perm);
    return this.db.transaction(async (tx) => {
      const [d] = await tx.select().from(disputes).where(eq(disputes.id, d0.id)).for('update');
      return fn(tx, d!);
    });
  }

  async assign(staff: AuthStaff, id: string, assigneeId: string) {
    requirePermission(this.actor(staff), 'dispute:view_all');
    if (!/^[0-9a-f-]{36}$/i.test(assigneeId)) throw new DomainError('VALIDATION_ERROR', 'Agent inconnu.');
    const [assignee] = await this.db.select().from(staffUsers).where(eq(staffUsers.id, assigneeId));
    if (!assignee || assignee.status !== 'ACTIVE' || !assignee.roles.some((r) => ['SUPPORT_AGENT', 'DISPUTE_MANAGER'].includes(r))) {
      throw new DomainError('VALIDATION_ERROR', 'Cet agent ne peut pas instruire de litige.');
    }
    await this.staffAction(staff, id, 'dispute:view_all', async (tx, d) => {
      if (d.state === 'CLOSED') throw new DomainError('INVALID_TRANSITION', 'Dossier clos.');
      await tx.update(disputes).set({ assignedTo: assignee.id, updatedAt: new Date() }).where(eq(disputes.id, d.id));
      await this.event(tx, d.id, 'WAKA_TEAM', staff.id, `Dossier attribué à ${assignee.displayName}`);
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.assign', entityType: 'dispute', entityId: d.id, before: { assignedTo: d.assignedTo }, after: { assignedTo: assignee.id } }, tx);
    });
    return this.adminDetail(staff, id, false);
  }

  async triage(staff: AuthStaff, id: string, priority?: 'SAFETY' | 'HIGH' | 'NORMAL') {
    await this.staffAction(staff, id, 'dispute:request_evidence', async (tx, d) => {
      let cur = d;
      if (cur.state === 'OPENED') cur = await this.transition(tx, cur, 'TRIAGED');
      else if (cur.state !== 'TRIAGED') throw new DomainError('INVALID_TRANSITION', 'Le dossier a déjà été trié.');
      if (priority && priority !== d.priority) {
        await tx.update(disputes).set({ priority, dueAt: new Date(d.createdAt.getTime() + SLA_HOURS[priority] * 3_600_000) }).where(eq(disputes.id, d.id));
      }
      await this.event(tx, d.id, 'WAKA_TEAM', staff.id, `Tri confirmé — priorité ${priority ?? d.priority}`);
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.triage', entityType: 'dispute', entityId: d.id, before: { priority: d.priority }, after: { priority: priority ?? d.priority } }, tx);
    });
    return this.adminDetail(staff, id, false);
  }

  async requestEvidence(staff: AuthStaff, id: string, input: { from: 'PASSENGER' | 'DRIVER' | 'BOTH'; message: string; dueInHours: number }) {
    await this.staffAction(staff, id, 'dispute:request_evidence', async (tx, d) => {
      const dueAt = new Date(Date.now() + input.dueInHours * 3_600_000);
      await this.transition(tx, d, 'EVIDENCE_REQUESTED', { dueAt });
      await tx.insert(disputeEvidence).values({ disputeId: d.id, fromKind: 'WAKA_TEAM', authorId: staff.id, text: input.message });
      const who = input.from === 'BOTH' ? 'des deux parties' : input.from === 'PASSENGER' ? 'du passager' : 'du conducteur';
      await this.event(tx, d.id, 'WAKA_TEAM', staff.id, `Éléments demandés ${who} avant le ${dueAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
      const [b] = await tx.select({ passengerId: bookings.passengerId }).from(bookings).where(eq(bookings.id, d.bookingId));
      const passengerId = b!.passengerId;
      const driverId = passengerId === d.openerId ? d.counterpartyId : d.openerId;
      const targets = input.from === 'BOTH' ? [passengerId, driverId] : input.from === 'PASSENGER' ? [passengerId] : [driverId];
      for (const t of targets) await this.notifications.notify(tx, t, 'dispute.evidence_requested', { disputeId: d.id, dueAt: dueAt.toISOString() });
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.request_evidence', entityType: 'dispute', entityId: d.id, before: { state: d.state }, after: { state: 'EVIDENCE_REQUESTED', dueAt } }, tx);
    });
    return this.adminDetail(staff, id, false);
  }

  async startReview(staff: AuthStaff, id: string) {
    await this.staffAction(staff, id, 'dispute:request_evidence', async (tx, d) => {
      await this.transition(tx, d, 'UNDER_REVIEW');
      await this.event(tx, d.id, 'WAKA_TEAM', staff.id, 'Instruction du dossier en cours');
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.start_review', entityType: 'dispute', entityId: d.id, before: { state: d.state }, after: { state: 'UNDER_REVIEW' } }, tx);
    });
    return this.adminDetail(staff, id, false);
  }

  async propose(staff: AuthStaff, id: string, input: { refundToPassenger: number; releaseToDriver: number; reason: string; sensitive: boolean }) {
    await this.staffAction(staff, id, 'dispute:propose_decision', async (tx, d) => {
      if (d.state !== 'UNDER_REVIEW') throw new DomainError('INVALID_TRANSITION', 'Une décision se propose sur un dossier en instruction.');
      const [b] = await tx.select().from(bookings).where(eq(bookings.id, d.bookingId));
      const [p] = await tx.select().from(payments).where(eq(payments.bookingId, d.bookingId));
      if (!b || !p) throw new DomainError('INVALID_TRANSITION', 'Aucun paiement à répartir pour ce dossier.');
      const priorApproved = (await tx.select({ id: disputeDecisions.id }).from(disputeDecisions).where(and(eq(disputeDecisions.disputeId, d.id), eq(disputeDecisions.status, 'APPROVED')))).length > 0;
      let breakdown = { refundFromDriverShare: 0, refundFromFee: 0, feeRetained: 0 };
      if (priorApproved && input.refundToPassenger === 0 && input.releaseToDriver === 0) {
        // Recours : maintien de la décision exécutée (aucun mouvement de fonds).
      } else {
        if (p.state !== 'FROZEN_DISPUTE') {
          throw new DomainError('ALREADY_EXECUTED', 'Les fonds ne sont plus détenus pour ce dossier : ajustement manuel par la finance requis.', { paymentState: p.state });
        }
        const committed = await this.payments.committedAmounts(tx, p.id);
        breakdown = validateAllocation(
          { captured: p.amount, driverAmount: b.driverAmount, serviceFee: b.serviceFee, refunded: committed.refunded, released: committed.released },
          { refundToPassenger: input.refundToPassenger, releaseToDriver: input.releaseToDriver },
        );
      }
      await tx.insert(disputeDecisions).values({
        disputeId: d.id,
        refundToPassenger: input.refundToPassenger,
        releaseToDriver: input.releaseToDriver,
        refundFromDriverShare: breakdown.refundFromDriverShare,
        refundFromFee: breakdown.refundFromFee,
        feeRetained: breakdown.feeRetained,
        reason: input.reason,
        sensitive: input.sensitive,
        proposedBy: staff.id,
      });
      await this.transition(tx, d, 'DECISION_PROPOSED');
      await this.event(tx, d.id, 'WAKA_TEAM', staff.id, 'Décision proposée — en attente d’une seconde approbation');
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.propose_decision', entityType: 'dispute', entityId: d.id, after: { ...input } }, tx);
    });
    return this.adminDetail(staff, id, false);
  }

  /**
   * Approbation par une AUTRE personne habilitée, puis instruction PSP (remboursement et/ou versement).
   * Le litige passe EXECUTION_PENDING ; il ne sera RESOLVED qu'à la confirmation PSP (webhooks).
   */
  async approve(staff: AuthStaff, id: string) {
    const toExecute: { refunds: string[]; payouts: string[] } = { refunds: [], payouts: [] };
    await this.staffAction(staff, id, 'dispute:approve_decision', async (tx, d) => {
      if (d.state !== 'DECISION_PROPOSED') throw new DomainError('INVALID_TRANSITION', 'Aucune décision en attente d’approbation.');
      const [dec] = await tx.select().from(disputeDecisions).where(and(eq(disputeDecisions.disputeId, d.id), eq(disputeDecisions.status, 'PROPOSED'))).for('update');
      if (!dec) throw new DomainError('INVALID_TRANSITION', 'Aucune décision en attente d’approbation.');
      assertDistinctApprover(dec.proposedBy, staff.id);
      await tx.update(disputeDecisions).set({ status: 'APPROVED', approvedBy: staff.id, decidedAt: new Date() }).where(eq(disputeDecisions.id, dec.id));
      const approved = await this.transition(tx, d, 'APPROVED');
      await this.event(tx, d.id, 'WAKA_TEAM', staff.id, 'Décision approuvée par une seconde personne habilitée');
      const executing = await this.transition(tx, approved, 'EXECUTION_PENDING');

      const b = await lockBooking(tx, d.bookingId);
      const p = await lockPaymentByBooking(tx, d.bookingId);
      if (dec.refundToPassenger === 0 && dec.releaseToDriver === 0) {
        // Maintien après recours : rien à exécuter chez le PSP.
        await this.transition(tx, executing, 'RESOLVED', { resolvedAt: new Date() });
        await this.event(tx, d.id, 'SYSTEM', null, 'Décision maintenue — aucun mouvement de fonds');
      } else {
        if (!b || !p || p.state !== 'FROZEN_DISPUTE') throw new DomainError('ALREADY_EXECUTED', 'Les fonds ne sont plus détenus : exécution impossible.');
        if (dec.refundToPassenger > 0) {
          await setPaymentState(tx, p, 'REFUND_PENDING');
          toExecute.refunds.push(await this.payments.createRefundTx(tx, p, dec.refundToPassenger, dec.refundFromDriverShare, dec.refundFromFee, 'DISPUTE_DECISION', d.id));
        }
        if (dec.releaseToDriver > 0) {
          const [trip] = await tx.select({ driverId: trips.driverId }).from(trips).where(eq(trips.id, b.tripId));
          const [po] = await tx
            .insert(payouts)
            .values({ bookingId: b.id, paymentId: p.id, beneficiaryUserId: trip!.driverId, amount: dec.releaseToDriver, reason: 'DISPUTE_DECISION', disputeId: d.id })
            .returning({ id: payouts.id });
          if (dec.refundToPassenger === 0) await walkPayment(tx, p, ['RELEASE_ELIGIBLE', 'RELEASE_REQUESTED']);
          toExecute.payouts.push(po!.id);
        }
        await this.event(tx, d.id, 'SYSTEM', null, 'Instruction transmise au partenaire de paiement — en attente de confirmation');
      }
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.approve_decision', entityType: 'dispute', entityId: d.id, before: { state: 'DECISION_PROPOSED' }, after: { decisionId: dec.id, refund: dec.refundToPassenger, release: dec.releaseToDriver } }, tx);
    });
    for (const r of toExecute.refunds) await this.payments.executeRefund(r).catch(() => undefined);
    for (const p of toExecute.payouts) await this.payments.executePayout(p).catch(() => undefined);
    return this.adminDetail(staff, id, false);
  }

  async reject(staff: AuthStaff, id: string, reason: string) {
    await this.staffAction(staff, id, 'dispute:approve_decision', async (tx, d) => {
      if (d.state !== 'DECISION_PROPOSED') throw new DomainError('INVALID_TRANSITION', 'Aucune décision en attente.');
      const [dec] = await tx.select().from(disputeDecisions).where(and(eq(disputeDecisions.disputeId, d.id), eq(disputeDecisions.status, 'PROPOSED'))).for('update');
      if (!dec) throw new DomainError('INVALID_TRANSITION', 'Aucune décision en attente.');
      assertDistinctApprover(dec.proposedBy, staff.id);
      await tx.update(disputeDecisions).set({ status: 'REJECTED', rejectedBy: staff.id, rejectReason: reason, decidedAt: new Date() }).where(eq(disputeDecisions.id, dec.id));
      await this.transition(tx, d, 'UNDER_REVIEW');
      await this.event(tx, d.id, 'WAKA_TEAM', staff.id, 'Proposition rejetée — retour en instruction');
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.reject_decision', entityType: 'dispute', entityId: d.id, reason }, tx);
    });
    return this.adminDetail(staff, id, false);
  }

  async close(staff: AuthStaff, id: string, reason?: string) {
    await this.staffAction(staff, id, 'dispute:propose_decision', async (tx, d) => {
      await this.transition(tx, d, 'CLOSED', { closedAt: new Date() });
      await this.event(tx, d.id, 'WAKA_TEAM', staff.id, 'Dossier clos');
      await this.audit.append({ actorType: 'STAFF', actorId: staff.id, action: 'dispute.close', entityType: 'dispute', entityId: d.id, reason: reason ?? null }, tx);
    });
    return this.adminDetail(staff, id, false);
  }

  /** Nombre de litiges ouverts par priorité (tableau de bord). */
  async openByPriority() {
    const r = await this.db
      .select({ priority: disputes.priority, n: sql<number>`COUNT(*)::int` })
      .from(disputes)
      .where(and(ne(disputes.state, 'CLOSED'), ne(disputes.state, 'RESOLVED')))
      .groupBy(disputes.priority);
    const out = { SAFETY: 0, HIGH: 0, NORMAL: 0 };
    for (const x of r) out[x.priority as keyof typeof out] = Number(x.n);
    return out;
  }
}


