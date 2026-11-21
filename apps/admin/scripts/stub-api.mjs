#!/usr/bin/env node
/**
 * STUB D'API ADMIN — DÉVELOPPEMENT UNIQUEMENT. Données 100 % fictives, en mémoire.
 * Sert à exercer la console tant que les contrôleurs admin de `apps/api` ne sont pas disponibles,
 * et à produire les captures d'écran. NE REMPLACE PAS l'API : les formes de réponse sont des hypothèses
 * documentées (voir README). Port par défaut 4010 → lancer la console avec API_URL=http://localhost:4010.
 *
 * Règles reproduites (à partir de @waka/domain) : RBAC par rôle, MFA, CSRF `X-Waka-Request: 1`,
 * machine d'états des litiges, validateAllocation, séparation des tâches (proposant ≠ approbateur),
 * journal d'audit chaîné SHA-256.
 */
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { DisputeDecisionInput, RejectDecisionInput, RequestEvidenceInput, KycDecisionInput, AdminLoginInput, AdminMfaInput, AssignInput } from '@waka/contracts';
import { disputeMachine, hasPermission, validateAllocation, isDomainError, PAYMENT_STATE_LABEL_FR, DEFAULT_FEE_POLICY, DEFAULT_NO_RESPONSE_POLICY } from '@waka/domain';

if (process.env.NODE_ENV === 'production') {
  console.error('stub-api: refus de démarrer en production');
  process.exit(1);
}
const PORT = Number(process.env.STUB_PORT ?? 4010);
const H = 3_600_000;
const now = () => new Date();
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const day = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

// ─── Staff ─────────────────────────────────────────────────────────────────────
const PASSWORD = 'Waka-Demo-2026!';
const STAFF = [
  { id: 's-support', email: 'support@waka.test', displayName: 'Brice — Support (démo)', roles: ['SUPPORT_AGENT'] },
  { id: 's-litiges', email: 'litiges@waka.test', displayName: 'Mireille — Litiges (démo)', roles: ['DISPUTE_MANAGER'] },
  { id: 's-litiges2', email: 'litiges2@waka.test', displayName: 'Paul — Litiges (démo)', roles: ['DISPUTE_MANAGER'] },
  { id: 's-finance', email: 'finance@waka.test', displayName: 'Estelle — Finance (démo)', roles: ['FINANCE'] },
  { id: 's-admin', email: 'admin@waka.test', displayName: 'Admin (démo)', roles: ['SUPERADMIN'] },
];
const staffById = (id) => STAFF.find((s) => s.id === id) ?? null;
const challenges = new Map();
const sessions = new Map();

// ─── Données fictives ──────────────────────────────────────────────────────────
const PAX = { aicha: { id: 'u-aicha', displayName: 'Aïcha (démo)', maskedPhone: '+237 6•• ••• 001' }, junior: { id: 'u-junior', displayName: 'Junior (démo)', maskedPhone: '+237 6•• ••• 004' } };
const DRV = { serge: { id: 'u-serge', displayName: 'Serge (démo)', maskedPhone: '+237 6•• ••• 002' } };
const trip = (o, d, at, mp, dp) => ({ origin: { code: o[0], name: o[1] }, destination: { code: d[0], name: d[1] }, departureAt: at, meetingPoint: mp, dropoffPoint: dp, driver: DRV.serge });
const DLA = ['DLA', 'Douala'], YDE = ['YDE', 'Yaoundé'], KRI = ['KRI', 'Kribi'], BFS = ['BFS', 'Bafoussam'];

function mkBooking(id, t, seats, seatPrice, state, payState, passenger, extra = {}) {
  const driverAmount = seats * seatPrice;
  const serviceFee = seats * DEFAULT_FEE_POLICY.serviceFeePerSeat;
  return {
    id, trip: t, seats, state, passenger,
    price: { policyVersion: DEFAULT_FEE_POLICY.version, seats, seatPrice, driverAmount, serviceFee, total: driverAmount + serviceFee, currency: 'XAF' },
    payment: { id: `p-${id}`, state: payState, amount: driverAmount + serviceFee, channel: seats % 2 ? 'MTN_MOMO' : 'ORANGE_MONEY', providerMode: 'MOCK', providerRef: `mock_${id.slice(-4)}${seats}x`, createdAt: iso(-50 * H), updatedAt: iso(-20 * H) },
    ...extra,
  };
}
const bookings = [
  mkBooking('b-1001', trip(DLA, YDE, iso(-30 * H), 'Carrefour Ndokoti', 'Mvan'), 1, 6000, 'DISPUTED', 'FROZEN_DISPUTE', PAX.aicha, { checkedInAt: iso(-30 * H), arrivalReportedAt: iso(-26 * H) }),
  mkBooking('b-1002', trip(YDE, DLA, iso(-20 * H), 'Poste centrale', 'Akwa – Rond-point Deïdo'), 2, 6000, 'DISPUTED', 'FROZEN_DISPUTE', PAX.junior, {}),
  mkBooking('b-1003', trip(DLA, KRI, iso(-44 * H), 'Bonabéri – Rond-point', 'Kribi centre'), 1, 5000, 'DISPUTED', 'FROZEN_DISPUTE', PAX.aicha, { checkedInAt: iso(-44 * H), arrivalReportedAt: iso(-38 * H) }),
  mkBooking('b-1004', trip(DLA, BFS, iso(-60 * H), 'Carrefour Ndokoti', 'Bafoussam gare'), 1, 7000, 'DISPUTED', 'FROZEN_DISPUTE', PAX.junior, { checkedInAt: iso(-60 * H), arrivalReportedAt: iso(-54 * H) }),
  mkBooking('b-1005', trip(YDE, DLA, iso(-70 * H), 'Carrefour Warda', 'Akwa – Rond-point Deïdo'), 2, 6500, 'DISPUTED', 'FROZEN_DISPUTE', PAX.aicha, { checkedInAt: iso(-70 * H) }),
  mkBooking('b-1006', trip(DLA, YDE, iso(-90 * H), 'Carrefour Ndokoti', 'Mvan'), 1, 6000, 'DISPUTED', 'REFUND_PENDING', PAX.junior, { checkedInAt: iso(-90 * H), arrivalReportedAt: iso(-86 * H) }),
  mkBooking('b-1007', trip(DLA, YDE, iso(30 * H), 'Carrefour Ndokoti', 'Mvan'), 2, 6000, 'CONFIRMED', 'PSP_CONFIRMED_HELD', PAX.aicha),
  mkBooking('b-1008', trip(YDE, KRI, iso(54 * H), 'Mvan', 'Kribi centre'), 1, 7500, 'CONFIRMED', 'PSP_CONFIRMED_HELD', PAX.junior),
  mkBooking('b-1009', trip(DLA, YDE, iso(-120 * H), 'Akwa', 'Mvan'), 1, 6000, 'COMPLETED', 'PAID', PAX.aicha, { passengerConfirmedAt: iso(-114 * H) }),
  mkBooking('b-1010', trip(DLA, YDE, iso(2 * H), 'Akwa', 'Mvan'), 1, 6000, 'PAYMENT_PENDING', 'PSP_PENDING', PAX.junior),
  mkBooking('b-1011', trip(BFS, DLA, iso(-150 * H), 'Bafoussam gare', 'Ndokoti'), 1, 7000, 'CANCELLED', 'REFUNDED', PAX.aicha),
  mkBooking('b-1012', trip(DLA, YDE, iso(-6 * H), 'Akwa', 'Mvan'), 1, 6000, 'ARRIVAL_REPORTED', 'MANUAL_REVIEW', PAX.junior, { arrivalReportedAt: iso(-2 * H) }),
];
const bookingById = (id) => bookings.find((b) => b.id === id);

// Grand livre : encaissement confirmé pour chaque paiement détenu / traité.
const journals = [];
function addJournal(kind, bookingId, memo, lines, at) {
  journals.push({ id: randomUUID(), kind, bookingId, idempotencyKey: `${kind}:${bookingId}:${journals.length}`, memo, createdAt: at ?? iso(-40 * H), lines });
}
for (const b of bookings) {
  if (['PSP_PENDING', 'CREATED', 'FAILED'].includes(b.payment.state)) continue;
  addJournal('COLLECTION_CONFIRMED', b.id, 'Encaissement confirmé par le PSP', [
    { account: 'psp_held', debit: b.price.total, credit: 0 },
    { account: 'driver_payable', debit: 0, credit: b.price.driverAmount },
    { account: 'platform_fee_deferred', debit: 0, credit: b.price.serviceFee },
  ], b.payment.createdAt);
}
const b9 = bookingById('b-1009');
addJournal('FEE_RECOGNIZED', b9.id, 'Frais de service acquis', [{ account: 'platform_fee_deferred', debit: b9.price.serviceFee, credit: 0 }, { account: 'platform_fee_revenue', debit: 0, credit: b9.price.serviceFee }], iso(-113 * H));
addJournal('PAYOUT_CONFIRMED', b9.id, 'Versement conducteur confirmé par le PSP', [{ account: 'driver_payable', debit: b9.price.driverAmount, credit: 0 }, { account: 'psp_held', debit: 0, credit: b9.price.driverAmount }], iso(-110 * H));
const b11 = bookingById('b-1011');
addJournal('REFUND_CONFIRMED', b11.id, 'Remboursement passager confirmé par le PSP', [{ account: 'driver_payable', debit: b11.price.driverAmount, credit: 0 }, { account: 'platform_fee_deferred', debit: b11.price.serviceFee, credit: 0 }, { account: 'psp_held', debit: 0, credit: b11.price.total }], iso(-140 * H));

function mkDispute(id, bookingId, o) {
  const b = bookingById(bookingId);
  return {
    id, bookingId, category: o.category, priority: o.priority, state: o.state, description: o.description, requestedOutcome: o.requestedOutcome, urgentSafety: o.priority === 'SAFETY',
    openerRole: o.openerRole ?? 'PASSENGER', fundsStatus: 'FROZEN', assignedTo: o.assignedTo ?? null, openedAt: iso(o.openedAgoH * -H), dueAt: o.dueInH === null ? null : iso(o.dueInH * H),
    timeline: [
      { at: iso(o.openedAgoH * -H), actor: o.openerRole ?? 'PASSENGER', label: 'Litige ouvert' },
      { at: iso(o.openedAgoH * -H + 60_000), actor: 'SYSTEM', label: 'Fonds de la réservation gelés (règlement suspendu)' },
      ...(o.timeline ?? []),
    ],
    evidence: o.evidence ?? [],
    decision: o.decision ?? null,
    _b: b,
  };
}
const disputes = [
  mkDispute('d-7c41a9e2', 'b-1001', { category: 'DANGEROUS_BEHAVIOUR', priority: 'SAFETY', state: 'UNDER_REVIEW', assignedTo: 's-litiges', openedAgoH: 20, dueInH: 3, requestedOutcome: 'PARTIAL_REFUND',
    description: 'Conduite à très grande vitesse sur l’axe Douala–Yaoundé malgré mes demandes répétées de ralentir. Dépassements dangereux près d’Édéa.',
    timeline: [{ at: iso(-19 * H), actor: 'WAKA_TEAM', label: 'Dossier trié — priorité sécurité' }, { at: iso(-18 * H), actor: 'WAKA_TEAM', label: 'Instruction démarrée' }],
    evidence: [
      { id: 'e1', from: 'PASSENGER', text: 'Deux autres passagers peuvent confirmer. Nous avons demandé trois fois de ralentir.', at: iso(-19.5 * H) },
      { id: 'e2', from: 'DRIVER', text: 'La route était dégagée, je suis resté dans les limites. Aucun passager ne s’est plaint pendant le trajet.', at: iso(-12 * H) },
    ] }),
  mkDispute('d-3b90f114', 'b-1002', { category: 'DRIVER_NO_SHOW', priority: 'HIGH', state: 'UNDER_REVIEW', assignedTo: null, openedAgoH: 30, dueInH: -2, requestedOutcome: 'FULL_REFUND',
    description: 'Le conducteur ne s’est pas présenté à la Poste centrale. Nous avons attendu 45 minutes, appels sans réponse.',
    timeline: [{ at: iso(-28 * H), actor: 'WAKA_TEAM', label: 'Dossier trié' }, { at: iso(-26 * H), actor: 'WAKA_TEAM', label: 'Pièces demandées aux deux parties (48 h)' }, { at: iso(-6 * H), actor: 'WAKA_TEAM', label: 'Instruction démarrée' }],
    evidence: [
      { id: 'e3', from: 'PASSENGER', text: 'Capture du journal d’appels : 4 appels entre 07:50 et 08:30.', at: iso(-25 * H), attachmentRef: 'priv/ev/3b90-1' },
      { id: 'e4', from: 'DRIVER', text: 'Panne de batterie, je n’ai pas pu prévenir. Je reconnais ne pas être venu.', at: iso(-10 * H) },
    ] }),
  mkDispute('d-91d2c07a', 'b-1003', { category: 'EXCESSIVE_DELAY', priority: 'NORMAL', state: 'OPENED', assignedTo: 's-support', openedAgoH: 4, dueInH: 44, requestedOutcome: 'PARTIAL_REFUND',
    description: 'Départ avec 1 h 40 de retard depuis Bonabéri sans prévenir, rendez-vous manqué à Kribi.' }),
  mkDispute('d-5e6f8a20', 'b-1004', { category: 'LUGGAGE', priority: 'NORMAL', state: 'EVIDENCE_REQUESTED', assignedTo: 's-litiges2', openedAgoH: 50, dueInH: 20, requestedOutcome: 'OTHER',
    description: 'Sac de voyage laissé dans le coffre, le conducteur dit ne pas l’avoir trouvé.',
    timeline: [{ at: iso(-48 * H), actor: 'WAKA_TEAM', label: 'Dossier trié' }, { at: iso(-28 * H), actor: 'WAKA_TEAM', label: 'Pièces demandées au conducteur (48 h)' }] }),
  mkDispute('d-c3a7e5b1', 'b-1005', { category: 'PAYMENT_ISSUE', priority: 'HIGH', state: 'DECISION_PROPOSED', assignedTo: 's-litiges2', openedAgoH: 60, dueInH: 10, requestedOutcome: 'PARTIAL_REFUND',
    description: 'Trajet interrompu à Édéa, le conducteur a demandé de finir en bus.',
    timeline: [{ at: iso(-58 * H), actor: 'WAKA_TEAM', label: 'Dossier trié' }, { at: iso(-40 * H), actor: 'WAKA_TEAM', label: 'Instruction démarrée' }, { at: iso(-3 * H), actor: 'WAKA_TEAM', label: 'Décision proposée — en attente d’approbation' }],
    evidence: [{ id: 'e5', from: 'PASSENGER', text: 'Ticket de bus Édéa–Douala : 2 500 FCFA.', at: iso(-50 * H) }, { id: 'e6', from: 'DRIVER', text: 'Problème mécanique, j’ai proposé de rembourser la moitié.', at: iso(-45 * H) }],
    decision: { id: 'dec-1', status: 'PROPOSED', refundToPassenger: 7_500, releaseToDriver: 6_500, reason: 'Trajet effectué à moitié (Yaoundé–Édéa). Remboursement de la moitié de la contribution et de la totalité des frais ; versement de l’autre moitié au conducteur.', sensitive: false, proposedBy: 's-litiges2', proposedAt: iso(-3 * H) } }),
  mkDispute('d-0f4be862', 'b-1006', { category: 'TRIP_QUALITY', priority: 'NORMAL', state: 'EXECUTION_PENDING', assignedTo: 's-litiges', openedAgoH: 80, dueInH: null, requestedOutcome: 'FULL_REFUND',
    description: 'Véhicule différent de celui annoncé, sans climatisation.',
    timeline: [{ at: iso(-70 * H), actor: 'WAKA_TEAM', label: 'Décision proposée' }, { at: iso(-8 * H), actor: 'WAKA_TEAM', label: 'Décision approuvée par une seconde personne' }, { at: iso(-8 * H + 60_000), actor: 'SYSTEM', label: 'Instruction de remboursement transmise au PSP' }],
    decision: { id: 'dec-0', status: 'APPROVED', refundToPassenger: 6_500, releaseToDriver: 0, reason: 'Véhicule non conforme à l’annonce, constaté par photo. Remboursement intégral.', sensitive: false, proposedBy: 's-litiges', proposedAt: iso(-70 * H), approvedBy: 's-litiges2', decidedAt: iso(-8 * H), execution: { status: 'PENDING' } } }),
];

const kyc = {
  drivers: [
    { userId: 'u-nadege', fullName: 'Nadège (démo)', maskedPhone: '+237 6•• ••• 003', licenseExpiry: day(12), idDocumentType: 'CNI', idDocumentRef: 'priv/kyc/nadege', declaresPrivateCarpoolOnly: true, submittedAt: iso(-26 * H), kycStatus: 'PENDING_REVIEW', isDemo: true },
    { userId: 'u-roland', fullName: 'Roland (démo)', maskedPhone: '+237 6•• ••• 017', licenseExpiry: day(-5), idDocumentType: 'PASSPORT', idDocumentRef: 'priv/kyc/roland', declaresPrivateCarpoolOnly: true, submittedAt: iso(-8 * H), kycStatus: 'PENDING_REVIEW', isDemo: true },
  ],
  vehicles: [
    { id: 'v-301', ownerName: 'Nadège (démo)', make: 'Toyota', model: 'Corolla', color: 'Gris', plateMasked: 'LT •••• AB', year: 2014, seatsTotal: 4, insuranceExpiry: day(140), inspectionExpiry: day(21), createdAt: iso(-25 * H), reviewStatus: 'PENDING', isDemo: true },
    { id: 'v-302', ownerName: 'Roland (démo)', make: 'Hyundai', model: 'Accent', color: 'Blanc', plateMasked: 'CE •••• KD', year: 2011, seatsTotal: 4, insuranceExpiry: day(-12), inspectionExpiry: day(90), createdAt: iso(-7 * H), reviewStatus: 'PENDING', isDemo: true },
  ],
};

// ─── Audit chaîné ──────────────────────────────────────────────────────────────
const audit = [];
function appendAudit(e) {
  const prevHash = audit.length ? audit[audit.length - 1].hash : '0'.repeat(64);
  const entry = { id: audit.length + 1, at: new Date().toISOString(), ip: '127.0.0.1', reason: null, entityId: null, ...e, prevHash };
  entry.hash = createHash('sha256').update(JSON.stringify([entry.at, entry.actorType, entry.actorId, entry.action, entry.entityType, entry.entityId, entry.reason, prevHash])).digest('hex');
  audit.push(entry);
}
appendAudit({ actorType: 'SYSTEM', actorId: null, action: 'seed.loaded', entityType: 'system', reason: 'Données de démonstration fictives' });
appendAudit({ actorType: 'STAFF', actorId: 's-litiges2', action: 'dispute.decision_proposed', entityType: 'dispute', entityId: 'd-c3a7e5b1', reason: 'Trajet effectué à moitié' });

const recoRuns = [
  { id: 'r1', day: day(-3), ranAt: iso(-62 * H), status: 'MATCHED', providerTotals: { collections: 84_500, payouts: 36_000, refunds: 7_500 }, ledgerTotals: { collections: 84_500, payouts: 36_000, refunds: 7_500 }, discrepancies: [] },
  { id: 'r2', day: day(-2), ranAt: iso(-38 * H), status: 'DISCREPANCY', providerTotals: { collections: 52_000, payouts: 18_000, refunds: 0 }, ledgerTotals: { collections: 45_500, payouts: 18_000, refunds: 0 }, discrepancies: [{ providerRef: 'mock_7f21a', kind: 'COLLECTION', providerAmount: 6_500, ledgerAmount: null, issue: 'Encaissement présent chez le PSP, absent du grand livre (webhook non reçu)' }] },
];

// ─── HTTP ──────────────────────────────────────────────────────────────────────
function send(res, status, body, extraHeaders = {}) {
  const requestId = randomUUID();
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Request-Id': requestId, ...extraHeaders });
  res.end(JSON.stringify(body && body.error ? { error: { ...body.error, requestId } } : body));
}
const fail = (res, status, code, message, details) => send(res, status, { error: { code, message, ...(details ? { details } : {}) } });

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
  });
}
function cookieToken(req) {
  const m = /(?:^|;\s*)waka_admin=([^;]+)/.exec(req.headers.cookie ?? '');
  return m ? m[1] : null;
}
const can = (s, p) => hasPermission({ userId: s.id, roles: s.roles }, p);
const name = (id) => (id ? staffById(id)?.displayName ?? id : null);

function canViewDispute(s, d) {
  return can(s, 'dispute:view_all') || (can(s, 'dispute:view_assigned') && d.assignedTo === s.id);
}
function listItem(d) {
  return { id: d.id, bookingId: d.bookingId, state: d.state, category: d.category, priority: d.priority, openedAt: d.openedAt, dueAt: d.dueAt, assignedTo: d.assignedTo ? { id: d.assignedTo, displayName: name(d.assignedTo) } : null, tripLabel: `${d._b.trip.origin.name} → ${d._b.trip.destination.name}`, amount: d._b.price.total };
}
function detail(d) {
  const b = d._b;
  const dec = d.decision ? { ...d.decision, proposedBy: { id: d.decision.proposedBy, displayName: name(d.decision.proposedBy) }, approvedBy: d.decision.approvedBy ? { id: d.decision.approvedBy, displayName: name(d.decision.approvedBy) } : null, rejectedBy: d.decision.rejectedBy ? { id: d.decision.rejectedBy, displayName: name(d.decision.rejectedBy) } : null } : null;
  return {
    ...listItem(d), description: d.description, requestedOutcome: d.requestedOutcome, urgentSafety: d.urgentSafety, openerRole: d.openerRole, fundsStatus: d.fundsStatus,
    parties: { passenger: b.passenger, driver: b.trip.driver },
    booking: { id: b.id, state: b.state, seats: b.seats, trip: b.trip, price: b.price, checkedInAt: b.checkedInAt ?? null, arrivalReportedAt: b.arrivalReportedAt ?? null, passengerConfirmedAt: b.passengerConfirmedAt ?? null },
    payment: { ...b.payment, stateLabel: PAYMENT_STATE_LABEL_FR[b.payment.state] },
    funds: { captured: b.price.total, driverAmount: b.price.driverAmount, serviceFee: b.price.serviceFee, refunded: 0, released: 0 },
    ledger: { journals: journals.filter((j) => j.bookingId === b.id) },
    timeline: d.timeline, evidence: d.evidence, decision: dec,
  };
}

function transition(res, s, d, to, label, action, reason) {
  if (!disputeMachine.can(d.state, to)) { fail(res, 409, 'INVALID_TRANSITION', `Transition interdite ${d.state} → ${to}`); return false; }
  d.state = to;
  d.timeline.push({ at: now().toISOString(), actor: 'WAKA_TEAM', label });
  appendAudit({ actorType: 'STAFF', actorId: s.id, action, entityType: 'dispute', entityId: d.id, reason: reason ?? null });
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const p = url.pathname;
  const method = req.method ?? 'GET';
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && req.headers['x-waka-request'] !== '1') return fail(res, 403, 'FORBIDDEN', 'En-tête anti-CSRF manquant');
  const body = method === 'GET' ? {} : await readBody(req);
  if (body === null) return fail(res, 400, 'VALIDATION_ERROR', 'JSON invalide');

  // Auth
  if (method === 'POST' && p === '/v1/admin/auth/login') {
    const parsed = AdminLoginInput.safeParse(body);
    const s = parsed.success ? STAFF.find((x) => x.email === parsed.data.email.toLowerCase()) : null;
    if (!s || parsed.data.password !== PASSWORD) return fail(res, 401, 'INVALID_CREDENTIALS', 'Identifiants invalides');
    const challengeId = randomUUID();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    challenges.set(challengeId, { staffId: s.id, code, expiresAt: Date.now() + 5 * 60_000 });
    return send(res, 200, { challengeId, mfaRequired: true, expiresAt: iso(5 * 60_000), devTotp: code });
  }
  if (method === 'POST' && p === '/v1/admin/auth/mfa') {
    const parsed = AdminMfaInput.safeParse(body);
    const ch = parsed.success ? challenges.get(parsed.data.challengeId) : null;
    if (!ch || ch.expiresAt < Date.now() || ch.code !== parsed.data.totp) return fail(res, 401, 'INVALID_CREDENTIALS', 'Code invalide');
    challenges.delete(parsed.data.challengeId);
    const token = randomUUID();
    sessions.set(token, ch.staffId);
    appendAudit({ actorType: 'STAFF', actorId: ch.staffId, action: 'admin.login', entityType: 'staff', entityId: ch.staffId });
    return send(res, 200, { ok: true }, { 'Set-Cookie': `waka_admin=${token}; Path=/; HttpOnly; SameSite=Lax` });
  }
  const token = cookieToken(req);
  const s = token ? staffById(sessions.get(token)) : null;
  if (!s) return fail(res, 401, 'UNAUTHENTICATED', 'Session absente ou expirée');
  if (method === 'POST' && p === '/v1/admin/auth/logout') { sessions.delete(token); return send(res, 200, { ok: true }, { 'Set-Cookie': 'waka_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' }); }
  if (method === 'GET' && p === '/v1/admin/me') return send(res, 200, { id: s.id, email: s.email, displayName: s.displayName, roles: s.roles, mfaVerified: true });

  const need = (perm) => { if (!can(s, perm)) { fail(res, 403, 'FORBIDDEN', `Permission manquante : ${perm}`); return false; } return true; };

  if (method === 'GET' && p === '/v1/admin/dashboard') {
    const open = disputes.filter((d) => !['RESOLVED', 'CLOSED'].includes(d.state));
    const byState = {};
    for (const b of bookings) byState[b.state] = (byState[b.state] ?? 0) + 1;
    const bal = { psp_held: 0, platform_fee_revenue: 0, platform_fee_deferred: 0 };
    for (const j of journals) for (const l of j.lines) if (l.account in bal) bal[l.account] += l.account === 'psp_held' ? l.debit - l.credit : l.credit - l.debit;
    return send(res, 200, {
      generatedAt: now().toISOString(),
      upcomingTrips: { total: 23, byDay: Array.from({ length: 7 }, (_, i) => ({ day: day(i + 1), count: [4, 6, 2, 3, 5, 1, 2][i] })) },
      bookingsByState: byState,
      funds: { heldByPsp: bal.psp_held, feesRecognized: bal.platform_fee_revenue, feesDeferred: bal.platform_fee_deferred },
      disputes: { open: open.length, overdue: open.filter((d) => d.dueAt && Date.parse(d.dueAt) < Date.now()).length, byPriority: { SAFETY: open.filter((d) => d.priority === 'SAFETY').length, HIGH: open.filter((d) => d.priority === 'HIGH').length, NORMAL: open.filter((d) => d.priority === 'NORMAL').length } },
      kycPending: { drivers: kyc.drivers.length, vehicles: kyc.vehicles.length },
      reconciliation: { day: recoRuns.at(-1).day, ranAt: recoRuns.at(-1).ranAt, status: recoRuns.at(-1).status },
      anomalies: { open: recoRuns.at(-1).discrepancies.length },
    });
  }
  if (method === 'GET' && p === '/v1/admin/kyc') { if (!need('kyc:review')) return; return send(res, 200, kyc); }
  let m;
  if (method === 'POST' && (m = /^\/v1\/admin\/kyc\/(drivers|vehicles)\/([^/]+)\/decision$/.exec(p))) {
    if (!need('kyc:review')) return;
    const parsed = KycDecisionInput.safeParse(body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Motif requis (5 caractères min.)');
    const listRef = m[1] === 'drivers' ? kyc.drivers : kyc.vehicles;
    const idx = listRef.findIndex((x) => (x.userId ?? x.id) === m[2]);
    if (idx < 0) return fail(res, 404, 'NOT_FOUND', 'Dossier introuvable');
    listRef.splice(idx, 1);
    appendAudit({ actorType: 'STAFF', actorId: s.id, action: `kyc.${m[1] === 'drivers' ? 'driver' : 'vehicle'}_${parsed.data.approve ? 'approved' : 'rejected'}`, entityType: m[1] === 'drivers' ? 'driver' : 'vehicle', entityId: m[2], reason: parsed.data.reason });
    return send(res, 200, { ok: true });
  }
  if (method === 'GET' && p === '/v1/admin/disputes') {
    if (!can(s, 'dispute:view_all') && !can(s, 'dispute:view_assigned')) return fail(res, 403, 'FORBIDDEN', 'Permission manquante');
    return send(res, 200, { items: disputes.filter((d) => canViewDispute(s, d)).map(listItem), nextCursor: null });
  }
  if (method === 'GET' && p === '/v1/admin/staff') {
    if (!need('dispute:view_all')) return;
    return send(res, 200, STAFF.map(({ id, email, displayName, roles }) => ({ id, email, displayName, roles })));
  }
  if ((m = /^\/v1\/admin\/disputes\/([^/]+)(?:\/([a-z-]+))?$/.exec(p))) {
    const d = disputes.find((x) => x.id === m[1]);
    if (!d || !canViewDispute(s, d)) return fail(res, 404, 'NOT_FOUND', 'Litige introuvable');
    const action = m[2];
    if (method === 'GET' && !action) return send(res, 200, detail(d));
    if (method !== 'POST') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Méthode non supportée');
    if (action === 'assign') {
      if (!need('dispute:view_all')) return;
      const parsed = AssignInput.safeParse(body);
      if (!parsed.success || !staffById(parsed.data.assigneeId)) return fail(res, 400, 'VALIDATION_ERROR', 'Agent inconnu');
      d.assignedTo = parsed.data.assigneeId;
      d.timeline.push({ at: now().toISOString(), actor: 'WAKA_TEAM', label: `Dossier attribué à ${name(d.assignedTo)}` });
      appendAudit({ actorType: 'STAFF', actorId: s.id, action: 'dispute.assigned', entityType: 'dispute', entityId: d.id });
      return send(res, 200, detail(d));
    }
    if (action === 'triage') { if (!need('dispute:request_evidence')) return; if (transition(res, s, d, 'TRIAGED', 'Dossier trié', 'dispute.triaged')) send(res, 200, detail(d)); return; }
    if (action === 'start-review') { if (!need('dispute:request_evidence')) return; if (transition(res, s, d, 'UNDER_REVIEW', 'Instruction démarrée', 'dispute.review_started')) send(res, 200, detail(d)); return; }
    if (action === 'request-evidence') {
      if (!need('dispute:request_evidence')) return;
      const parsed = RequestEvidenceInput.safeParse(body);
      if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Demande invalide');
      const who = { PASSENGER: 'au passager', DRIVER: 'au conducteur', BOTH: 'aux deux parties' }[parsed.data.from];
      d.dueAt = iso(parsed.data.dueInHours * H);
      if (transition(res, s, d, 'EVIDENCE_REQUESTED', `Pièces demandées ${who} (${parsed.data.dueInHours} h)`, 'dispute.evidence_requested', parsed.data.message)) send(res, 200, detail(d));
      return;
    }
    if (action === 'decision') {
      if (!need('dispute:propose_decision')) return;
      const parsed = DisputeDecisionInput.safeParse(body);
      if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Décision invalide', { issues: parsed.error.issues.length });
      try {
        const bd = validateAllocation({ captured: d._b.price.total, driverAmount: d._b.price.driverAmount, serviceFee: d._b.price.serviceFee, refunded: 0, released: 0 }, parsed.data);
        if (!disputeMachine.can(d.state, 'DECISION_PROPOSED')) return fail(res, 409, 'INVALID_TRANSITION', `Transition interdite ${d.state} → DECISION_PROPOSED`);
        d.decision = { id: randomUUID(), status: 'PROPOSED', ...parsed.data, refundFromDriverShare: bd.refundFromDriverShare, refundFromFee: bd.refundFromFee, feeRetained: bd.feeRetained, proposedBy: s.id, proposedAt: now().toISOString() };
        transition(res, s, d, 'DECISION_PROPOSED', 'Décision proposée — en attente d’approbation', 'dispute.decision_proposed', parsed.data.reason);
        return send(res, 200, detail(d));
      } catch (e) {
        if (isDomainError(e)) return fail(res, 422, e.code, e.message);
        throw e;
      }
    }
    if (action === 'approve' || action === 'reject') {
      if (!need('dispute:approve_decision')) return;
      if (!d.decision || d.decision.status !== 'PROPOSED') return fail(res, 409, 'INVALID_TRANSITION', 'Aucune proposition en attente');
      if (d.decision.proposedBy === s.id) return fail(res, 403, 'SEPARATION_OF_DUTIES', 'Une décision doit être approuvée par une autre personne que son auteur');
      if (action === 'reject') {
        const parsed = RejectDecisionInput.safeParse(body);
        if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Motif requis (10 caractères min.)');
        Object.assign(d.decision, { status: 'REJECTED', rejectedBy: s.id, rejectReason: parsed.data.reason, decidedAt: now().toISOString() });
        transition(res, s, d, 'UNDER_REVIEW', 'Proposition rejetée — retour en instruction', 'dispute.decision_rejected', parsed.data.reason);
        return send(res, 200, detail(d));
      }
      Object.assign(d.decision, { status: 'APPROVED', approvedBy: s.id, decidedAt: now().toISOString(), execution: { status: 'PENDING' } });
      transition(res, s, d, 'APPROVED', 'Décision approuvée par une seconde personne', 'dispute.decision_approved');
      d.state = 'EXECUTION_PENDING';
      d.timeline.push({ at: now().toISOString(), actor: 'SYSTEM', label: 'Instructions transmises au PSP — exécution en attente de confirmation' });
      d._b.payment.state = d.decision.refundToPassenger > 0 ? 'REFUND_PENDING' : 'RELEASE_ELIGIBLE';
      return send(res, 200, detail(d));
    }
    if (action === 'close') { if (!need('dispute:propose_decision')) return; if (transition(res, s, d, 'CLOSED', 'Dossier clôturé', 'dispute.closed')) send(res, 200, detail(d)); return; }
    return fail(res, 404, 'NOT_FOUND', 'Action inconnue');
  }
  if (method === 'GET' && p === '/v1/admin/payments') {
    if (!need('finance:view')) return;
    const st = url.searchParams.get('state');
    return send(res, 200, { items: bookings.filter((b) => !st || b.payment.state === st).map((b) => ({ ...b.payment, stateLabel: PAYMENT_STATE_LABEL_FR[b.payment.state], bookingId: b.id, trip: b.trip })), nextCursor: null });
  }
  if (method === 'GET' && p === '/v1/admin/finance/ledger') {
    if (!need('finance:view')) return;
    const bid = url.searchParams.get('bookingId');
    return send(res, 200, { journals: journals.filter((j) => !bid || j.bookingId === bid).slice(-40).reverse() });
  }
  if (method === 'GET' && p === '/v1/admin/finance/reconciliation') { if (!need('finance:view')) return; return send(res, 200, { runs: recoRuns }); }
  if (method === 'POST' && p === '/v1/admin/finance/reconciliation/run') {
    if (!need('finance:reconcile')) return;
    const d = typeof body.day === 'string' ? body.day : day(-1);
    const run = { id: randomUUID(), day: d, ranAt: now().toISOString(), status: 'MATCHED', providerTotals: { collections: 61_000, payouts: 12_000, refunds: 6_500 }, ledgerTotals: { collections: 61_000, payouts: 12_000, refunds: 6_500 }, discrepancies: [] };
    recoRuns.push(run);
    appendAudit({ actorType: 'STAFF', actorId: s.id, action: 'finance.reconciliation_run', entityType: 'reconciliation', entityId: run.id, reason: `Journée ${d}` });
    return send(res, 200, run);
  }
  if (method === 'GET' && p === '/v1/admin/audit') {
    if (!need('audit:view')) return;
    return send(res, 200, { items: [...audit].reverse().map((a) => ({ ...a, actor: a.actorId ? { id: a.actorId, displayName: name(a.actorId) } : null })), chainVerified: true });
  }
  if (method === 'GET' && p === '/v1/admin/policies') {
    return send(res, 200, {
      fee: DEFAULT_FEE_POLICY,
      noResponse: DEFAULT_NO_RESPONSE_POLICY,
      cancellation: { status: 'DRAFT_LEGAL_REVIEW', matrix: [
        { case: 'Passager annule', window: '> 24 h avant départ', passenger: 'Remboursement intégral (hors frais)', driver: 'Aucun versement', fee: 'Conservés' },
        { case: 'Passager annule', window: '< 24 h avant départ', passenger: 'Remboursement 50 %', driver: '50 % de la contribution', fee: 'Conservés' },
        { case: 'Conducteur annule', window: 'À tout moment', passenger: 'Remboursement intégral (frais inclus)', driver: 'Aucun versement', fee: 'Remboursés' },
        { case: 'Conducteur absent', window: 'Constaté', passenger: 'Remboursement intégral (frais inclus)', driver: 'Aucun versement', fee: 'Remboursés' },
      ] },
    });
  }
  return fail(res, 404, 'NOT_FOUND', `Route inconnue du stub : ${method} ${p}`);
});

server.listen(PORT, () => console.log(`stub-api (FICTIF, dev) sur http://localhost:${PORT}`));
