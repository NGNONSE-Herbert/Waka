import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATES, DISPUTE_STATES, DomainError, Journals, PAYMENT_STATES, assertBalanced, assertDistinctApprover,
  balances, bookingMachine, canViewDispute, checkCollectionMatches, disputeMachine, evaluateRelease, exclusionReason,
  hasPermission, maskPhone, noResponseOutcome, normalizeCmPhone, paymentMachine, quote, rankMatches, requirePermission,
  validateAllocation, xaf, DEFAULT_NO_RESPONSE_POLICY, type MatchRequest, type MatchTrip,
} from '../src/index.js';

const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as DomainError).code; }
  return 'NO_ERROR';
};

describe('money & pricing', () => {
  it('refuse décimaux, négatifs, zéro et plafond', () => {
    expect(code(() => xaf(10.5))).toBe('INVALID_AMOUNT');
    expect(code(() => xaf(-1))).toBe('INVALID_AMOUNT');
    expect(code(() => xaf(0))).toBe('INVALID_AMOUNT');
    expect(code(() => xaf(20_000_000))).toBe('INVALID_AMOUNT');
  });
  it('exemple du cahier : 5 000 + 500 = 5 500 FCFA', () => {
    const q = quote(5000, 1);
    expect([q.driverAmount, q.serviceFee, q.total]).toEqual([5000, 500, 5500]);
    expect(q.policyVersion).toBe('fees-2026-11-v1');
  });
  it('multi-places et bornes', () => {
    expect(quote(4500, 3).total).toBe(15000);
    expect(code(() => quote(5000, 0))).toBe('VALIDATION_ERROR');
    expect(code(() => quote(5000, 9))).toBe('VALIDATION_ERROR');
    expect(code(() => quote(100, 1))).toBe('INVALID_AMOUNT');
    expect(code(() => quote(5025, 1))).toBe('INVALID_AMOUNT');
  });
});

describe('machines d’états', () => {
  const all = [
    [bookingMachine, BOOKING_STATES],
    [paymentMachine, PAYMENT_STATES],
    [disputeMachine, DISPUTE_STATES],
  ] as const;

  it('chaque transition non déclarée est refusée (exhaustif)', () => {
    for (const [m, states] of all) {
      for (const from of states as readonly string[]) {
        for (const to of states as readonly string[]) {
          const allowed = (m.transitions as Record<string, readonly string[]>)[from]!.includes(to);
          const r = code(() => (m.assert as (a: string, b: string) => void)(from, to));
          expect(r, `${m.name} ${from}->${to}`).toBe(allowed ? 'NO_ERROR' : 'INVALID_TRANSITION');
        }
      }
    }
  });
  it('les états terminaux n’ont aucune sortie', () => {
    for (const [m] of all) for (const t of m.terminal as readonly string[]) expect((m.next as (s: string) => readonly string[])(t)).toEqual([]);
  });
  it('une réservation ne peut pas passer à CONFIRMED sans PAYMENT_PENDING', () => {
    expect(bookingMachine.can('SEAT_HELD', 'CONFIRMED')).toBe(false);
    expect(bookingMachine.can('PAYMENT_PENDING', 'CONFIRMED')).toBe(true);
  });
  it('un paiement payé ne peut plus être remboursé ni repayé', () => {
    expect(paymentMachine.next('PAID')).toEqual([]);
    expect(paymentMachine.can('REFUNDED', 'REFUND_PENDING')).toBe(false);
  });
  it('un litige ne peut pas être RESOLVED sans EXECUTION_PENDING', () => {
    expect(disputeMachine.can('APPROVED', 'RESOLVED')).toBe(false);
    expect(disputeMachine.can('DECISION_PROPOSED', 'EXECUTION_PENDING')).toBe(false);
  });
});

describe('ledger en partie double', () => {
  it('cycle complet sans litige : solde PSP nul après versement', () => {
    const js = [
      Journals.collectionConfirmed('b1', 'psp-1', 5000, 500),
      Journals.feeRecognized('b1', 500),
      Journals.payoutConfirmed('b1', 'po-1', 5000),
    ];
    const b = balances(js);
    expect(b.driver_payable).toBe(0);
    expect(b.platform_fee_deferred).toBe(0);
    expect(b.platform_fee_revenue).toBe(-500); // crédit = revenu
    expect(b.psp_held).toBe(500); // les frais restent chez le PSP jusqu'au règlement marchand
    expect(Object.values(b).reduce((a, c) => a + c, 0)).toBe(0);
  });
  it('remboursement total : tout revient au passager', () => {
    const js = [Journals.collectionConfirmed('b1', 'psp-1', 5000, 500), Journals.refundConfirmed('b1', 'rf-1', 5000, 500)];
    expect(balances(js)).toMatchObject({ psp_held: 0, driver_payable: 0, platform_fee_deferred: 0 });
  });
  it('refuse journaux déséquilibrés et lignes à double sens', () => {
    expect(code(() => assertBalanced([{ account: 'psp_held', debit: 10, credit: 0 }, { account: 'driver_payable', debit: 0, credit: 9 }]))).toBe('LEDGER_UNBALANCED');
    expect(code(() => assertBalanced([{ account: 'psp_held', debit: 10, credit: 10 }, { account: 'driver_payable', debit: 0, credit: 0 }]))).toBe('LEDGER_UNBALANCED');
  });
  it('la contre-écriture annule exactement', () => {
    const j = Journals.collectionConfirmed('b1', 'psp-1', 5000, 500);
    const b = balances([j, Journals.reverse(j, 'erreur de test')]);
    expect(Object.values(b).every((v) => v === 0)).toBe(true);
  });
  it('clés d’idempotence déterministes par événement', () => {
    expect(Journals.payoutConfirmed('b1', 'po-1', 1).idempotencyKey).toBe('payout:po-1');
  });
});

describe('libération et allocations', () => {
  const ok = { bookingState: 'ARRIVAL_REPORTED', paymentState: 'PSP_CONFIRMED_HELD', hasOpenDispute: false, passengerConfirmed: true, payoutAlreadyRequested: false } as const;
  it('conducteur « arrivé » seul ne suffit pas', () => {
    expect(evaluateRelease({ ...ok, passengerConfirmed: false })).toEqual({ allowed: false, reason: 'NOT_CONFIRMED_BY_PASSENGER' });
  });
  it('un litige ouvert bloque la libération', () => {
    expect(evaluateRelease({ ...ok, hasOpenDispute: true })).toEqual({ allowed: false, reason: 'DISPUTE_OPEN' });
    expect(evaluateRelease({ ...ok, paymentState: 'FROZEN_DISPUTE' }).allowed).toBe(false);
  });
  it('double confirmation : un seul ordre', () => {
    expect(evaluateRelease(ok)).toEqual({ allowed: true });
    expect(evaluateRelease({ ...ok, payoutAlreadyRequested: true })).toEqual({ allowed: false, reason: 'ALREADY_REQUESTED' });
  });
  it('paiement non confirmé par le PSP : pas de libération', () => {
    expect(evaluateRelease({ ...ok, paymentState: 'PSP_PENDING' })).toEqual({ allowed: false, reason: 'PAYMENT_NOT_HELD' });
  });
  const pos = { captured: 5500, driverAmount: 5000, serviceFee: 500, refunded: 0, released: 0 };
  it('remboursement partiel cohérent', () => {
    expect(validateAllocation(pos, { refundToPassenger: 2500, releaseToDriver: 3000 })).toMatchObject({ refundFromDriverShare: 2000, refundFromFee: 500, feeRetained: 0 });
    expect(validateAllocation(pos, { refundToPassenger: 2000, releaseToDriver: 3000 }).feeRetained).toBe(500);
  });
  it('refuse remboursement > payé, négatif, double allocation, rétention de part conducteur', () => {
    expect(code(() => validateAllocation(pos, { refundToPassenger: 6000, releaseToDriver: 0 }))).toBe('ALLOCATION_EXCEEDED');
    expect(code(() => validateAllocation(pos, { refundToPassenger: -1, releaseToDriver: 0 }))).toBe('INVALID_AMOUNT');
    expect(code(() => validateAllocation({ ...pos, refunded: 100 }, { refundToPassenger: 100, releaseToDriver: 0 }))).toBe('ALREADY_EXECUTED');
    expect(code(() => validateAllocation(pos, { refundToPassenger: 0, releaseToDriver: 3000 }))).toBe('ALLOCATION_EXCEEDED');
    expect(code(() => validateAllocation(pos, { refundToPassenger: 0, releaseToDriver: 5500 }))).toBe('ALLOCATION_EXCEEDED');
  });
  it('non-réponse : revue manuelle par défaut, jamais de libération auto non validée', () => {
    const t0 = new Date('2026-11-28T10:00:00Z');
    const later = new Date('2026-12-01T10:00:00Z');
    expect(noResponseOutcome(DEFAULT_NO_RESPONSE_POLICY, t0, new Date('2026-11-28T20:00:00Z'), false)).toBe('WAIT');
    expect(noResponseOutcome(DEFAULT_NO_RESPONSE_POLICY, t0, later, false)).toBe('MANUAL_REVIEW');
    expect(noResponseOutcome({ ...DEFAULT_NO_RESPONSE_POLICY, autoReleaseEnabled: true }, t0, later, false)).toBe('MANUAL_REVIEW');
    expect(noResponseOutcome({ ...DEFAULT_NO_RESPONSE_POLICY, autoReleaseEnabled: true, legallyValidatedRef: 'AVIS-JUR-001' }, t0, later, false)).toBe('AUTO_RELEASE_ELIGIBLE');
    expect(noResponseOutcome({ ...DEFAULT_NO_RESPONSE_POLICY, autoReleaseEnabled: true, legallyValidatedRef: 'X' }, t0, later, true)).toBe('WAIT');
  });
});

describe('vérification PSP', () => {
  const exp = { amountXaf: 5500, merchantRef: 'm-1' };
  it('mauvais montant ou devise = anomalie, jamais confirmation', () => {
    expect(checkCollectionMatches(exp, { providerRef: 'p', status: 'SUCCEEDED', amountXaf: 5000, currency: 'XAF', merchantRef: 'm-1' })).toBe('ANOMALY');
    expect(checkCollectionMatches(exp, { providerRef: 'p', status: 'SUCCEEDED', amountXaf: 5500, currency: 'EUR', merchantRef: 'm-1' })).toBe('ANOMALY');
    expect(checkCollectionMatches(exp, { providerRef: 'p', status: 'SUCCEEDED', amountXaf: 5500, currency: 'XAF', merchantRef: 'm-2' })).toBe('ANOMALY');
    expect(checkCollectionMatches(exp, { providerRef: 'p', status: 'PENDING', amountXaf: 5500, currency: 'XAF', merchantRef: 'm-1' })).toBe('PENDING');
    expect(checkCollectionMatches(exp, { providerRef: 'p', status: 'SUCCEEDED', amountXaf: 5500, currency: 'XAF', merchantRef: 'm-1' })).toBe('CONFIRMED');
  });
});

describe('RBAC / ABAC', () => {
  const support = { userId: 's1', roles: ['SUPPORT_AGENT'] as const, mfaVerified: true };
  const manager = { userId: 'm1', roles: ['DISPUTE_MANAGER'] as const, mfaVerified: true };
  it('le support ne peut ni proposer ni approuver une décision financière', () => {
    expect(hasPermission(support, 'dispute:propose_decision')).toBe(false);
    expect(hasPermission(support, 'dispute:approve_decision')).toBe(false);
  });
  it('MFA exigée pour les actions sensibles', () => {
    expect(code(() => requirePermission({ ...manager, mfaVerified: false }, 'dispute:propose_decision'))).toBe('FORBIDDEN');
    expect(code(() => requirePermission(manager, 'dispute:propose_decision'))).toBe('NO_ERROR');
  });
  it('superadmin sans droit financier implicite', () => {
    expect(hasPermission({ userId: 'a', roles: ['SUPERADMIN'] }, 'dispute:approve_decision')).toBe(false);
  });
  it('support limité aux dossiers attribués', () => {
    const d = { assignedTo: 'other', openerId: 'p1', counterpartyId: 'd1' };
    expect(canViewDispute(support, d)).toBe(false);
    expect(canViewDispute(support, { ...d, assignedTo: 's1' })).toBe(true);
    expect(canViewDispute({ userId: 'x', roles: ['PASSENGER'] }, d)).toBe(false);
  });
  it('séparation des tâches', () => {
    expect(code(() => assertDistinctApprover('m1', 'm1'))).toBe('SEPARATION_OF_DUTIES');
  });
});

describe('matching', () => {
  const base: MatchTrip = {
    id: 't1', originCity: 'Douala', destinationCity: 'Yaoundé', departureAt: new Date('2026-11-28T08:00:00+01:00'),
    seatsAvailable: 3, seatPrice: 5000, totalPerSeat: 5500, meetingPoint: 'Carrefour Ndokoti', driverEligible: true,
    status: 'PUBLISHED', driverCompletedTrips: 0, driverRating: null, driverCancellationRate: 0, luggageAllowed: true, airConditioning: true,
  };
  const req: MatchRequest = {
    originCity: 'douala', destinationCity: 'Yaounde', windowStart: new Date('2026-11-28T07:00:00+01:00'),
    windowEnd: new Date('2026-11-28T10:00:00+01:00'), seats: 2, maxBudgetPerSeat: 6000, preferredPickup: 'Ndokoti', needsLuggage: false, wantsAirConditioning: false,
  };
  it('filtres obligatoires', () => {
    expect(exclusionReason(base, req)).toBeNull();
    expect(exclusionReason({ ...base, driverEligible: false }, req)).toBe('DRIVER');
    expect(exclusionReason({ ...base, seatsAvailable: 1 }, req)).toBe('CAPACITY');
    expect(exclusionReason({ ...base, destinationCity: 'Kribi' }, req)).toBe('CORRIDOR');
  });
  it('score explicable et nouveau conducteur non disqualifié', () => {
    const [m] = rankMatches([base], req);
    expect(m!.score).toBeGreaterThan(80);
    expect(m!.explanations.map((e) => e.factor)).toEqual(['time', 'pickup', 'reliability', 'budget', 'preferences']);
    expect(m!.explanations.find((e) => e.factor === 'reliability')!.score).toBe(0.6);
  });
  it('classement déterministe', () => {
    const late = { ...base, id: 't2', departureAt: new Date('2026-11-28T11:30:00+01:00') };
    expect(rankMatches([late, base], req).map((m) => m.tripId)).toEqual(['t1', 't2']);
  });
});

describe('téléphone +237', () => {
  it('normalise et masque', () => {
    expect(normalizeCmPhone('6 77 12 34 56')).toBe('+237677123456');
    expect(normalizeCmPhone('00237 699-00-11-22')).toBe('+237699001122');
    expect(code(() => normalizeCmPhone('+33612345678'))).toBe('VALIDATION_ERROR');
    expect(code(() => normalizeCmPhone('222123456'))).toBe('VALIDATION_ERROR');
    expect(maskPhone('+237677123456')).toBe('+237 6•• •• •• 56');
  });
});
