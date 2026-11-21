/**
 * Données de démonstration — CLAIREMENT FICTIVES (is_demo = true, noms suffixés « (démo) »).
 * Les trajets sont générés relativement à la date du seed (J+1 à J+10) pour rester à venir.
 * Les scénarios financiers sont cohérents de bout en bout (PSP simulé ⇄ grand livre).
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_FEE_POLICY, Journals, type JournalDraft, quote } from '@waka/domain';
import { sql } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import { generateTotpSecret, hashPassword, randomDigits, Sealer, sha256 } from '../common/crypto.js';
import { maskPlate, plateHash } from '../driver/driver.service.js';
import { CITIES, estimatedDurationMin } from '../trips/reference-data.js';
import { type Database, one, type Tx } from './client.js';
import {
  bookings,
  cities,
  consents,
  disputeDecisions,
  disputeEvents,
  disputeEvidence,
  disputes,
  driverProfiles,
  ledgerJournals,
  ledgerLines,
  meetingPoints,
  mockPspTransactions,
  payments,
  payouts,
  refunds,
  staffUsers,
  travelRequests,
  trips,
  userRoles,
  users,
  vehicles,
} from './schema.js';

export const DEMO_STAFF_PASSWORD = 'Waka-Demo-2026!';
export const DEMO_PHONES = {
  aicha: '+237690000001',
  junior: '+237690000004',
  serge: '+237677000002',
  nadege: '+237650000003',
  paul: '+237699000011',
  brice: '+237699000012',
  mireille: '+237699000013',
  fadimatou: '+237699000014',
} as const;
export const DEMO_ORPHAN_REF = 'MOCK-COL-0RPHAN000001';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Date à J+offset, heure locale Douala (UTC+1). */
function doualaAt(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const local = new Date(base.getTime() + HOUR); // horloge Douala
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  return new Date(Date.UTC(y, m, d + dayOffset, hour - 1, minute));
}
const isoDay = (d: Date) => new Date(d.getTime() + HOUR).toISOString().slice(0, 10);

export async function isSeeded(database: Database): Promise<boolean> {
  const r = await one<{ n: number }>(database.db, sql`SELECT COUNT(*)::int AS n FROM cities`);
  return Number(r?.n ?? 0) > 0;
}

export async function seed(database: Database, config: Pick<AppConfig, 'appSecret' | 'mockPspMerchantRef'>, now = new Date()): Promise<{ trips: number }> {
  if (await isSeeded(database)) return { trips: 0 };
  const sealer = new Sealer(config.appSecret);
  const merchantRef = config.mockPspMerchantRef;
  const pwd = await hashPassword(DEMO_STAFF_PASSWORD);

  return database.db.transaction(async (tx) => {
    // ─── Référentiel ──────────────────────────────────────────────────────────
    await tx.insert(cities).values(CITIES.map((c, i) => ({ code: c.code, name: c.name, sort: i })));
    await tx.insert(meetingPoints).values(CITIES.flatMap((c) => c.meetingPoints.map((name, i) => ({ cityCode: c.code, name, sort: i }))));

    // ─── Équipe (MFA TOTP obligatoire) ──────────────────────────────────────────
    const staffDefs = [
      { email: 'support@waka.test', displayName: 'Agent support (démo)', roles: ['SUPPORT_AGENT'] },
      { email: 'litiges@waka.test', displayName: 'Responsable litiges (démo)', roles: ['DISPUTE_MANAGER'] },
      { email: 'litiges2@waka.test', displayName: 'Responsable litiges 2 (démo)', roles: ['DISPUTE_MANAGER'] },
      { email: 'finance@waka.test', displayName: 'Finance (démo)', roles: ['FINANCE'] },
      { email: 'admin@waka.test', displayName: 'Super-admin (démo)', roles: ['SUPERADMIN'] },
    ];
    const staff: Record<string, string> = {};
    for (const s of staffDefs) {
      const [row] = await tx
        .insert(staffUsers)
        .values({ ...s, passwordHash: pwd, totpSecretEnc: sealer.seal(generateTotpSecret()), isDemo: true })
        .returning({ id: staffUsers.id });
      staff[s.email] = row!.id;
    }

    // ─── Utilisateurs ───────────────────────────────────────────────────────────
    const userDefs: Array<{ key: keyof typeof DEMO_PHONES; name: string; driver: boolean }> = [
      { key: 'aicha', name: 'Aïcha (démo)', driver: false },
      { key: 'junior', name: 'Junior (démo)', driver: false },
      { key: 'serge', name: 'Serge (démo)', driver: true },
      { key: 'nadege', name: 'Nadège (démo)', driver: true },
      { key: 'paul', name: 'Paul (démo)', driver: true },
      { key: 'brice', name: 'Brice (démo)', driver: true },
      { key: 'mireille', name: 'Mireille (démo)', driver: true },
      { key: 'fadimatou', name: 'Fadimatou (démo)', driver: true },
    ];
    const uid: Record<string, string> = {};
    for (const u of userDefs) {
      const [row] = await tx.insert(users).values({ phoneE164: DEMO_PHONES[u.key], displayName: u.name, isDemo: true }).returning({ id: users.id });
      uid[u.key] = row!.id;
      await tx.insert(userRoles).values({ userId: row!.id, role: 'PASSENGER' });
      if (u.driver) await tx.insert(userRoles).values({ userId: row!.id, role: 'DRIVER' });
      await tx.insert(consents).values({ userId: row!.id, termsVersion: 'cgu-2026-11-v1', at: new Date(now.getTime() - 30 * DAY) });
    }

    // ─── Conducteurs & véhicules ────────────────────────────────────────────────
    const inOneYear = isoDay(new Date(now.getTime() + 365 * DAY));
    const inTwoYears = isoDay(new Date(now.getTime() + 730 * DAY));
    const vehicleDefs: Record<string, { make: string; model: string; color: string; plate: string; seats: number; year: number }> = {
      serge: { make: 'Toyota', model: 'Corolla', color: 'Grise', plate: 'LT123AB', seats: 5, year: 2016 },
      paul: { make: 'Toyota', model: 'Prado', color: 'Blanche', plate: 'CE456CD', seats: 7, year: 2014 },
      brice: { make: 'Hyundai', model: 'Elantra', color: 'Noire', plate: 'LT789EF', seats: 5, year: 2018 },
      mireille: { make: 'Kia', model: 'Rio', color: 'Rouge', plate: 'OU321GH', seats: 5, year: 2019 },
      fadimatou: { make: 'Toyota', model: 'Avensis', color: 'Bleue', plate: 'CE654IJ', seats: 5, year: 2015 },
      nadege: { make: 'Peugeot', model: '301', color: 'Blanche', plate: 'LT987KL', seats: 5, year: 2017 },
    };
    const vid: Record<string, string> = {};
    for (const [key, v] of Object.entries(vehicleDefs)) {
      const verified = key !== 'nadege';
      await tx.insert(driverProfiles).values({
        userId: uid[key]!,
        kycStatus: verified ? 'VERIFIED' : 'PENDING_REVIEW',
        fullName: `${userDefs.find((u) => u.key === key)!.name.replace(' (démo)', '')} Démo`,
        licenseNumberHash: sha256(`demo-license-${key}`),
        licenseExpiry: inTwoYears,
        idDocumentType: 'CNI',
        idDocumentRef: `demo-private-doc-${key}`, // référence factice — aucun document réel
        declaresPrivateCarpoolOnly: true,
        submittedAt: new Date(now.getTime() - (verified ? 40 : 1) * DAY),
        reviewedAt: verified ? new Date(now.getTime() - 35 * DAY) : null,
        reviewedBy: verified ? staff['litiges@waka.test']! : null,
        reviewReason: verified ? 'Dossier de démonstration' : null,
      });
      const [row] = await tx
        .insert(vehicles)
        .values({
          ownerId: uid[key]!,
          plateHash: plateHash(v.plate),
          plateMasked: maskPlate(v.plate),
          make: v.make,
          model: v.model,
          color: v.color,
          year: v.year,
          seatsTotal: v.seats,
          insuranceExpiry: inOneYear,
          inspectionExpiry: inOneYear,
          reviewStatus: verified ? 'APPROVED' : 'PENDING',
          reviewedAt: verified ? new Date(now.getTime() - 35 * DAY) : null,
        })
        .returning({ id: vehicles.id });
      vid[key] = row!.id;
    }

    // ─── Trajets à venir (J+1 … J+10) ───────────────────────────────────────────
    const mp = (code: string, i = 0) => CITIES.find((c) => c.code === code)!.meetingPoints[i % CITIES.find((c) => c.code === code)!.meetingPoints.length]!;
    const PRICES: Record<string, number> = { 'DLA-YDE': 5000, 'DLA-KRI': 4000, 'DLA-BFS': 6000, 'YDE-BFS': 6500, 'DLA-LIM': 2500, 'DLA-BUE': 2500, 'YDE-KRI': 5500 };
    const price = (o: string, d: string) => PRICES[`${o}-${d}`] ?? PRICES[`${d}-${o}`] ?? 4000;
    const plan: Array<[string, string, number, number, string, number]> = [
      // [origine, destination, J+, heure, conducteur, places]
      ['DLA', 'YDE', 1, 6, 'serge', 3], ['DLA', 'YDE', 1, 14, 'brice', 4], ['YDE', 'DLA', 1, 7, 'paul', 6],
      ['DLA', 'KRI', 2, 8, 'mireille', 4], ['DLA', 'YDE', 3, 7, 'fadimatou', 4], ['YDE', 'DLA', 3, 15, 'serge', 4],
      ['DLA', 'BFS', 3, 6, 'paul', 6], ['BFS', 'DLA', 4, 13, 'paul', 6], ['YDE', 'BFS', 4, 7, 'brice', 4],
      ['BFS', 'YDE', 5, 8, 'brice', 4], ['DLA', 'LIM', 2, 9, 'mireille', 4], ['LIM', 'DLA', 2, 17, 'mireille', 4],
      ['DLA', 'BUE', 5, 10, 'fadimatou', 4], ['BUE', 'DLA', 6, 16, 'fadimatou', 4], ['YDE', 'KRI', 6, 7, 'serge', 4],
      ['KRI', 'YDE', 7, 14, 'serge', 4], ['DLA', 'YDE', 5, 6, 'brice', 4], ['YDE', 'DLA', 6, 8, 'mireille', 4],
      ['KRI', 'DLA', 8, 9, 'mireille', 4], ['DLA', 'YDE', 7, 17, 'paul', 6], ['DLA', 'YDE', 9, 7, 'serge', 4],
      ['YDE', 'DLA', 9, 13, 'fadimatou', 4], ['DLA', 'BFS', 10, 6, 'brice', 4], ['YDE', 'KRI', 10, 8, 'paul', 6],
      ['DLA', 'KRI', 8, 15, 'fadimatou', 4],
    ];
    const tripIds: string[] = [];
    const tripsByIdx: Array<{ id: string; seatPrice: number }> = [];
    for (const [i, [o, d, day, hour, drv, seats]] of plan.entries()) {
      const [row] = await tx
        .insert(trips)
        .values({
          driverId: uid[drv]!,
          vehicleId: vid[drv]!,
          originCity: o,
          destinationCity: d,
          departureAt: doualaAt(now, day, hour, i % 2 ? 30 : 0),
          estimatedDurationMin: estimatedDurationMin(o, d),
          meetingPoint: mp(o, i),
          dropoffPoint: mp(d, i + 1),
          seatsTotal: seats,
          seatsAvailable: seats,
          seatPrice: price(o, d),
          luggage: i % 3 === 0 ? 'MEDIUM' : 'SMALL',
          airConditioning: i % 2 === 0,
          rules: ['Ponctualité au point de rendez-vous', 'Pas de fumée à bord'],
          isDemo: true,
          createdAt: new Date(now.getTime() - 2 * DAY),
        })
        .returning({ id: trips.id });
      tripIds.push(row!.id);
      tripsByIdx.push({ id: row!.id, seatPrice: price(o, d) });
    }

    // Helpers de scénarios financiers cohérents (PSP simulé + grand livre).
    const journal = async (draft: JournalDraft, providerRef: string | null, at: Date) => {
      const [j] = await tx
        .insert(ledgerJournals)
        .values({ kind: draft.kind, bookingId: draft.bookingId, idempotencyKey: draft.idempotencyKey, providerRef, memo: draft.memo, createdAt: at })
        .returning({ id: ledgerJournals.id });
      await tx.insert(ledgerLines).values(draft.lines.map((l) => ({ journalId: j!.id, account: l.account, debit: l.debit, credit: l.credit })));
    };
    const mockTx = async (kind: 'COLLECTION' | 'PAYOUT' | 'REFUND', amount: number, at: Date, relatedRef: string | null = null) => {
      const ref = `MOCK-${kind.slice(0, 3)}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
      await tx.insert(mockPspTransactions).values({ ref, kind, idempotencyKey: `seed:${ref}`, amount, currency: 'XAF', merchantRef, status: 'SUCCEEDED', relatedRef, payerMasked: '+237 •••• 01', createdAt: at, completedAt: at });
      return ref;
    };
    const paidBooking = async (t: { id: string; seatPrice: number }, passenger: string, seats: number, state: string, paymentState: string, paidAt: Date) => {
      const q = quote(t.seatPrice, seats, DEFAULT_FEE_POLICY);
      const pin = randomDigits(4);
      const [b] = await tx
        .insert(bookings)
        .values({
          tripId: t.id,
          passengerId: uid[passenger]!,
          seats,
          seatPrice: q.seatPrice,
          driverAmount: q.driverAmount,
          serviceFee: q.serviceFee,
          total: q.total,
          policyVersion: q.policyVersion,
          state,
          idempotencyKey: randomUUID(),
          isDemo: true,
          createdAt: paidAt,
          updatedAt: paidAt,
          boardingPinHash: null,
          boardingPinEnc: null,
        })
        .returning();
      await tx.update(bookings).set({ boardingPinHash: sha256(`${b!.id}:${pin}`), boardingPinEnc: sealer.seal(pin) }).where(sql`id = ${b!.id}`);
      const ref = await mockTx('COLLECTION', q.total, paidAt);
      const [p] = await tx
        .insert(payments)
        .values({ bookingId: b!.id, provider: 'mock', providerRef: ref, channel: 'MTN_MOMO', payerPhoneMasked: '+237 6•• •• •• 01', amount: q.total, currency: 'XAF', state: paymentState, merchantRef, customerInstruction: null, capturedAt: paidAt, createdAt: paidAt, updatedAt: paidAt })
        .returning();
      await journal(Journals.collectionConfirmed(b!.id, ref, q.driverAmount, q.serviceFee), ref, paidAt);
      return { booking: b!, payment: p!, ref, q };
    };

    // Trajet avec exactement 1 place restante (DLA → YDE J+1, Serge, 3 places dont 2 réservées par Junior).
    const lastSeatTrip = tripsByIdx[0]!;
    await paidBooking(lastSeatTrip, 'junior', 2, 'CONFIRMED', 'PSP_CONFIRMED_HELD', new Date(now.getTime() - 6 * HOUR));
    await tx.execute(sql`UPDATE trips SET seats_available = 1 WHERE id = ${lastSeatTrip.id}`);

    // Trajets passés (historique).
    const pastTrip = async (o: string, d: string, daysAgo: number, drv: string) => {
      const dep = doualaAt(now, -daysAgo, 7);
      const [row] = await tx
        .insert(trips)
        .values({
          driverId: uid[drv]!, vehicleId: vid[drv]!, originCity: o, destinationCity: d, departureAt: dep,
          estimatedDurationMin: estimatedDurationMin(o, d), meetingPoint: mp(o), dropoffPoint: mp(d), seatsTotal: 4, seatsAvailable: 3,
          seatPrice: price(o, d), luggage: 'SMALL', airConditioning: true, status: 'ARRIVED', isDemo: true,
          departedAt: dep, arrivedAt: new Date(dep.getTime() + 4 * HOUR), createdAt: new Date(dep.getTime() - 3 * DAY),
        })
        .returning({ id: trips.id });
      return { id: row!.id, seatPrice: price(o, d), dep };
    };

    // (a) Trajet accompli normalement : versement confirmé, frais acquis.
    const tC = await pastTrip('YDE', 'DLA', 3, 'serge');
    const c = await paidBooking(tC, 'aicha', 1, 'COMPLETED', 'PAID', new Date(tC.dep.getTime() - DAY));
    const cDone = new Date(tC.dep.getTime() + 6 * HOUR);
    await tx.update(bookings).set({ passengerConfirmedAt: cDone, checkedInAt: tC.dep, arrivalReportedAt: new Date(tC.dep.getTime() + 4 * HOUR) }).where(sql`id = ${c.booking.id}`);
    const cPayRef = await mockTx('PAYOUT', c.q.driverAmount, cDone, c.ref);
    await tx.insert(payouts).values({ bookingId: c.booking.id, paymentId: c.payment.id, beneficiaryUserId: uid.serge!, amount: c.q.driverAmount, providerRef: cPayRef, status: 'SUCCEEDED', reason: 'COMPLETION', createdAt: cDone, updatedAt: cDone });
    await journal(Journals.payoutConfirmed(c.booking.id, cPayRef, c.q.driverAmount), cPayRef, cDone);
    await journal(Journals.feeRecognized(c.booking.id, c.q.serviceFee), null, cDone);

    // (b) Trajet arrivé avec LITIGE OUVERT : fonds gelés chez le PSP, dossier trié.
    const tA = await pastTrip('DLA', 'YDE', 2, 'serge');
    const a = await paidBooking(tA, 'aicha', 1, 'DISPUTED', 'FROZEN_DISPUTE', new Date(tA.dep.getTime() - DAY));
    await tx.update(bookings).set({ checkedInAt: tA.dep, arrivalReportedAt: new Date(tA.dep.getTime() + 5 * HOUR) }).where(sql`id = ${a.booking.id}`);
    const openedAt = new Date(tA.dep.getTime() + 7 * HOUR);
    const [dA] = await tx
      .insert(disputes)
      .values({
        bookingId: a.booking.id, openerId: uid.aicha!, counterpartyId: uid.serge!, openerRole: 'PASSENGER', category: 'EXCESSIVE_DELAY',
        description: 'Départ avec plus de deux heures de retard sans prévenir, arrivée tardive à Yaoundé (scénario de démonstration).',
        requestedOutcome: 'PARTIAL_REFUND', urgentSafety: false, priority: 'NORMAL', state: 'TRIAGED', fundsStatus: 'FROZEN',
        dueAt: new Date(openedAt.getTime() + 72 * HOUR), isDemo: true, createdAt: openedAt, updatedAt: openedAt,
      })
      .returning({ id: disputes.id });
    await tx.insert(disputeEvents).values([
      { disputeId: dA!.id, actorKind: 'PASSENGER', actorId: uid.aicha!, label: 'Litige ouvert par le passager', at: openedAt },
      { disputeId: dA!.id, actorKind: 'SYSTEM', label: 'Règlement suspendu : fonds gelés chez le partenaire de paiement', at: openedAt },
      { disputeId: dA!.id, actorKind: 'SYSTEM', label: 'Dossier trié automatiquement — priorité NORMAL', at: openedAt },
    ]);
    await tx.insert(disputeEvidence).values([
      { disputeId: dA!.id, fromKind: 'PASSENGER', authorId: uid.aicha!, text: 'Départ avec plus de deux heures de retard sans prévenir, arrivée tardive à Yaoundé (scénario de démonstration).', at: openedAt },
      { disputeId: dA!.id, fromKind: 'DRIVER', authorId: uid.serge!, text: 'Contrôle routier prolongé à la sortie de Douala (scénario de démonstration).', at: new Date(openedAt.getTime() + 2 * HOUR) },
    ]);

    // (c) Historique de litige RÉSOLU : remboursement partiel + versement du reliquat, confirmés par le PSP.
    const tB = await pastTrip('YDE', 'DLA', 6, 'paul');
    const bB = await paidBooking(tB, 'junior', 1, 'COMPLETED', 'PAID', new Date(tB.dep.getTime() - DAY));
    const bOpened = new Date(tB.dep.getTime() + 6 * HOUR);
    const decided = new Date(bOpened.getTime() + DAY);
    const resolved = new Date(decided.getTime() + HOUR);
    const [dB] = await tx
      .insert(disputes)
      .values({
        bookingId: bB.booking.id, openerId: uid.junior!, counterpartyId: uid.paul!, openerRole: 'PASSENGER', category: 'DROPOFF_NOT_RESPECTED',
        description: 'Dépose effectuée à Mvan au lieu de la Poste centrale comme convenu (scénario de démonstration).',
        requestedOutcome: 'PARTIAL_REFUND', urgentSafety: false, priority: 'NORMAL', state: 'RESOLVED', fundsStatus: 'FROZEN',
        assignedTo: staff['litiges@waka.test']!, dueAt: new Date(bOpened.getTime() + 72 * HOUR), resolvedAt: resolved, isDemo: true, createdAt: bOpened, updatedAt: resolved,
      })
      .returning({ id: disputes.id });
    const refundAmount = 2000;
    const releaseAmount = bB.q.driverAmount - refundAmount; // 3000
    await tx.insert(disputeDecisions).values({
      disputeId: dB!.id, refundToPassenger: refundAmount, releaseToDriver: releaseAmount, refundFromDriverShare: refundAmount, refundFromFee: 0,
      feeRetained: bB.q.serviceFee, reason: 'Dépose non conforme établie par les deux parties ; remboursement partiel de la contribution (démo).',
      sensitive: false, status: 'APPROVED', proposedBy: staff['litiges@waka.test']!, approvedBy: staff['finance@waka.test']!, createdAt: decided, decidedAt: decided,
    });
    await tx.insert(disputeEvents).values([
      { disputeId: dB!.id, actorKind: 'PASSENGER', actorId: uid.junior!, label: 'Litige ouvert par le passager', at: bOpened },
      { disputeId: dB!.id, actorKind: 'SYSTEM', label: 'Dossier trié automatiquement — priorité NORMAL', at: bOpened },
      { disputeId: dB!.id, actorKind: 'WAKA_TEAM', label: 'Instruction du dossier en cours', at: new Date(bOpened.getTime() + 2 * HOUR) },
      { disputeId: dB!.id, actorKind: 'WAKA_TEAM', label: 'Décision proposée — en attente d’une seconde approbation', at: decided },
      { disputeId: dB!.id, actorKind: 'WAKA_TEAM', label: 'Décision approuvée par une seconde personne habilitée', at: decided },
      { disputeId: dB!.id, actorKind: 'PSP', label: 'Exécution confirmée par le partenaire de paiement — litige résolu', at: resolved },
    ]);
    await tx.insert(disputeEvidence).values({ disputeId: dB!.id, fromKind: 'PASSENGER', authorId: uid.junior!, text: 'Dépose effectuée à Mvan au lieu de la Poste centrale comme convenu (scénario de démonstration).', at: bOpened });
    const rRef = await mockTx('REFUND', refundAmount, resolved, bB.ref);
    await tx.insert(refunds).values({ bookingId: bB.booking.id, paymentId: bB.payment.id, amount: refundAmount, fromDriverShare: refundAmount, fromFee: 0, providerRef: rRef, status: 'SUCCEEDED', reason: 'DISPUTE_DECISION', disputeId: dB!.id, createdAt: decided, updatedAt: resolved });
    await journal(Journals.refundConfirmed(bB.booking.id, rRef, refundAmount, 0), rRef, resolved);
    const pRef = await mockTx('PAYOUT', releaseAmount, resolved, bB.ref);
    await tx.insert(payouts).values({ bookingId: bB.booking.id, paymentId: bB.payment.id, beneficiaryUserId: uid.paul!, amount: releaseAmount, providerRef: pRef, status: 'SUCCEEDED', reason: 'DISPUTE_DECISION', disputeId: dB!.id, createdAt: decided, updatedAt: resolved });
    await journal(Journals.payoutConfirmed(bB.booking.id, pRef, releaseAmount), pRef, resolved);
    await journal(Journals.feeRecognized(bB.booking.id, bB.q.serviceFee), null, resolved);

    // (d) Écart de rapprochement DÉLIBÉRÉ : encaissement présent chez le PSP simulé, absent du grand livre (J-1).
    const orphanAt = doualaAt(now, -1, 12);
    await tx.insert(mockPspTransactions).values({ ref: DEMO_ORPHAN_REF, kind: 'COLLECTION', idempotencyKey: `seed:${DEMO_ORPHAN_REF}`, amount: 5500, currency: 'XAF', merchantRef, status: 'SUCCEEDED', payerMasked: '+237 •••• 99', createdAt: orphanAt, completedAt: orphanAt });

    // Demande de trajet active (matching).
    await tx.insert(travelRequests).values({
      userId: uid.aicha!, originCity: 'DLA', destinationCity: 'YDE', windowStart: doualaAt(now, 3, 5), windowEnd: doualaAt(now, 3, 12),
      seats: 1, maxBudgetPerSeat: 6000, preferredPickup: 'Carrefour Ndokoti', needsLuggage: true, wantsAirConditioning: false,
    });

    return { trips: tripIds.length };
  });
}

/** Utilitaire de tests : identifiants des comptes de démo. */
export async function demoIds(tx: Tx | Database['db']) {
  const us = await tx.select({ id: users.id, phone: users.phoneE164 }).from(users);
  const byPhone = Object.fromEntries(us.map((u) => [u.phone, u.id]));
  const st = await tx.select({ id: staffUsers.id, email: staffUsers.email }).from(staffUsers);
  return { users: byPhone as Record<string, string>, staff: Object.fromEntries(st.map((s) => [s.email, s.id])) as Record<string, string> };
}
