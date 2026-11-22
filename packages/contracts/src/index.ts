import { z } from 'zod';

/**
 * Contrats d'API partagés (API ⇄ web ⇄ admin). Préfixe : /v1.
 * Règle d'or : AUCUN schéma d'entrée n'accepte de montant, de statut de paiement, de commission,
 * de statut de vérification ou de destination de versement (cahier §12).
 * Les schémas sont `.strict()` : un champ inattendu est rejeté (anti mass-assignment).
 */

// ─── Communs ───────────────────────────────────────────────────────────────────
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string(), details: z.record(z.unknown()).optional() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const CITY_CODES = ['DLA', 'YDE', 'KRI', 'BFS', 'LIM', 'BUE', 'EDE', 'BAM'] as const;
export const CityCode = z.enum(CITY_CODES);
export type CityCode = z.infer<typeof CityCode>;

export const PaymentChannel = z.enum(['MTN_MOMO', 'ORANGE_MONEY']);
export const Phone = z.string().min(9).max(20);
export const IsoDateTime = z.string().datetime({ offset: true });
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Locale = z.enum(['fr', 'en']);

/** En-tête requis sur les créations sensibles (réservation, paiement). UUID v4 généré par le client. */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
/** En-tête anti-CSRF requis sur toutes les requêtes mutantes (forcé par l'API). */
export const CSRF_HEADER = 'X-Waka-Request';

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const OtpStartInput = z.object({ phone: Phone }).strict();
export const OtpStartOutput = z.object({
  challengeId: z.string(),
  expiresAt: IsoDateTime,
  maskedPhone: z.string(),
  /** Présent UNIQUEMENT en environnement de développement (SMS mocké). */
  devCode: z.string().optional(),
});
export const OtpVerifyInput = z.object({
  challengeId: z.string(),
  code: z.string().regex(/^\d{6}$/),
  acceptedTermsVersion: z.string().min(1),
  displayName: z.string().min(2).max(60).optional(),
}).strict();

export const Role = z.enum(['PASSENGER', 'DRIVER', 'SUPPORT_AGENT', 'DISPUTE_MANAGER', 'FINANCE', 'SUPERADMIN']);
export const DriverStatus = z.enum(['NONE', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED']);

export const MeOutput = z.object({
  id: z.string(),
  displayName: z.string(),
  maskedPhone: z.string(),
  locale: Locale,
  roles: z.array(Role),
  driverStatus: DriverStatus,
  canPublishTrips: z.boolean(),
  vehicles: z.array(z.object({ id: z.string(), label: z.string(), seatsTotal: z.number(), reviewStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']), insuranceExpiry: IsoDate })),
});
export type Me = z.infer<typeof MeOutput>;

export const AdminLoginInput = z.object({ email: z.string().email(), password: z.string().min(8) }).strict();
export const AdminMfaInput = z.object({ challengeId: z.string(), totp: z.string().regex(/^\d{6}$/) }).strict();

// ─── Villes ────────────────────────────────────────────────────────────────────
export const CityOutput = z.object({ code: CityCode, name: z.string(), meetingPoints: z.array(z.string()) });
export type City = z.infer<typeof CityOutput>;

// ─── Trajets ───────────────────────────────────────────────────────────────────
export const TripSearchQuery = z.object({
  from: CityCode.optional(),
  to: CityCode.optional(),
  date: IsoDate.optional(),
  seats: z.coerce.number().int().min(1).max(4).default(1),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const PriceBreakdown = z.object({
  policyVersion: z.string(),
  seats: z.number(),
  seatPrice: z.number(),
  driverAmount: z.number(),
  serviceFee: z.number(),
  total: z.number(),
  currency: z.literal('XAF'),
});
export type PriceBreakdown = z.infer<typeof PriceBreakdown>;

export const TripSummary = z.object({
  id: z.string(),
  origin: CityOutput.pick({ code: true, name: true }),
  destination: CityOutput.pick({ code: true, name: true }),
  departureAt: IsoDateTime,
  estimatedDurationMin: z.number().nullable(),
  meetingPoint: z.string(),
  dropoffPoint: z.string(),
  seatsAvailable: z.number(),
  seatPrice: z.number(),
  totalPerSeat: z.number(),
  driver: z.object({ displayName: z.string(), verified: z.boolean(), completedTrips: z.number(), rating: z.number().nullable(), isDemo: z.boolean() }),
  vehicle: z.object({ label: z.string(), airConditioning: z.boolean(), luggage: z.enum(['NONE', 'SMALL', 'MEDIUM', 'LARGE']) }),
  status: z.enum(['PUBLISHED', 'FULL', 'DEPARTED', 'ARRIVED', 'CANCELLED']),
});
export type TripSummary = z.infer<typeof TripSummary>;

export const TripDetail = TripSummary.extend({
  rules: z.array(z.string()),
  cancellationPolicySummary: z.string(),
  quoteForOneSeat: PriceBreakdown,
});
export type TripDetail = z.infer<typeof TripDetail>;

export const Paginated = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const CreateTripInput = z.object({
  vehicleId: z.string(),
  originCity: CityCode,
  destinationCity: CityCode,
  departureAt: IsoDateTime,
  meetingPoint: z.string().min(3).max(120),
  dropoffPoint: z.string().min(3).max(120),
  seats: z.number().int().min(1).max(8),
  seatPrice: z.number().int().min(500).max(50_000),
  luggage: z.enum(['NONE', 'SMALL', 'MEDIUM', 'LARGE']),
  airConditioning: z.boolean(),
  rules: z.array(z.string().max(80)).max(6).default([]),
}).strict().refine((v) => v.originCity !== v.destinationCity, { message: 'Départ et destination doivent différer', path: ['destinationCity'] });
export type CreateTripInput = z.infer<typeof CreateTripInput>;

// ─── Conducteur ────────────────────────────────────────────────────────────────
export const DriverOnboardingInput = z.object({
  fullName: z.string().min(3).max(80),
  licenseNumber: z.string().min(4).max(30),
  licenseExpiry: IsoDate,
  idDocumentType: z.enum(['CNI', 'PASSPORT', 'RESIDENCE_PERMIT']),
  /** Référence d'un document téléversé dans le stockage privé (jamais une URL publique). */
  idDocumentUploadRef: z.string().min(4),
  declaresPrivateCarpoolOnly: z.literal(true),
}).strict();

export const VehicleInput = z.object({
  make: z.string().min(2).max(40),
  model: z.string().min(1).max(40),
  color: z.string().min(3).max(30),
  plate: z.string().min(5).max(15),
  year: z.number().int().min(1995).max(2027),
  seatsTotal: z.number().int().min(2).max(8),
  insuranceExpiry: IsoDate,
  inspectionExpiry: IsoDate,
}).strict();

export const DriverEarningsOutput = z.object({
  currency: z.literal('XAF'),
  heldByPartner: z.number(),
  releaseRequested: z.number(),
  paid: z.number(),
  frozenByDispute: z.number(),
  items: z.array(z.object({ bookingId: z.string(), tripLabel: z.string(), amount: z.number(), paymentState: z.string(), label: z.string(), updatedAt: IsoDateTime })),
});

// ─── Demandes passager & matching ─────────────────────────────────────────────
export const CreateTravelRequestInput = z.object({
  originCity: CityCode,
  destinationCity: CityCode,
  windowStart: IsoDateTime,
  windowEnd: IsoDateTime,
  seats: z.number().int().min(1).max(4),
  maxBudgetPerSeat: z.number().int().min(500).max(60_000).nullable(),
  preferredPickup: z.string().max(120).nullable(),
  needsLuggage: z.boolean(),
  wantsAirConditioning: z.boolean(),
  notifyOnNewMatch: z.boolean().default(true),
}).strict().refine((v) => v.originCity !== v.destinationCity, { message: 'Départ et destination doivent différer', path: ['destinationCity'] })
  .refine((v) => new Date(v.windowEnd) > new Date(v.windowStart), { message: 'Fenêtre horaire invalide', path: ['windowEnd'] });

export const TravelRequestOutput = z.object({
  id: z.string(),
  originCity: CityCode,
  destinationCity: CityCode,
  windowStart: IsoDateTime,
  windowEnd: IsoDateTime,
  seats: z.number(),
  maxBudgetPerSeat: z.number().nullable(),
  preferredPickup: z.string().nullable(),
  status: z.enum(['ACTIVE', 'FULFILLED', 'EXPIRED', 'CANCELLED']),
  matchCount: z.number(),
});

export const MatchOutput = z.object({
  trip: TripSummary,
  score: z.number(),
  version: z.string(),
  explanations: z.array(z.object({ factor: z.string(), score: z.number(), weight: z.number(), reason: z.string() })),
});
export type MatchOutput = z.infer<typeof MatchOutput>;

// ─── Réservations & paiement ──────────────────────────────────────────────────
export const BookingState = z.enum(['DRAFT', 'SEAT_HELD', 'PAYMENT_PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'COMPLETED', 'DISPUTED', 'CANCELLED']);
export const PaymentState = z.enum(['CREATED', 'PSP_PENDING', 'PSP_CONFIRMED_HELD', 'RELEASE_ELIGIBLE', 'RELEASE_REQUESTED', 'PAYOUT_PROCESSING', 'PAID', 'FAILED', 'FROZEN_DISPUTE', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'MANUAL_REVIEW']);
export const DisputeState = z.enum(['OPENED', 'TRIAGED', 'EVIDENCE_REQUESTED', 'UNDER_REVIEW', 'DECISION_PROPOSED', 'APPROVED', 'EXECUTION_PENDING', 'RESOLVED', 'APPEALED', 'CLOSED']);

export const CreateBookingInput = z.object({ tripId: z.string(), seats: z.number().int().min(1).max(4) }).strict();

export const PaymentOutput = z.object({
  id: z.string(),
  state: PaymentState,
  stateLabel: z.string(),
  channel: PaymentChannel,
  amount: z.number(),
  currency: z.literal('XAF'),
  providerMode: z.enum(['MOCK', 'SANDBOX', 'LIVE']),
  customerInstruction: z.string().nullable(),
  /** Uniquement en MOCK : référence à passer au simulateur de téléphone. */
  mockProviderRef: z.string().optional(),
});
export type PaymentOutput = z.infer<typeof PaymentOutput>;

export const BookingOutput = z.object({
  id: z.string(),
  state: BookingState,
  trip: TripSummary,
  seats: z.number(),
  price: PriceBreakdown,
  holdExpiresAt: IsoDateTime.nullable(),
  payment: PaymentOutput.nullable(),
  /** Visible par le passager uniquement une fois CONFIRMED ; à montrer au conducteur à l'embarquement. */
  boardingPin: z.string().nullable(),
  passengerConfirmedAt: IsoDateTime.nullable(),
  dispute: z.object({ id: z.string(), state: DisputeState }).nullable(),
  canReview: z.boolean(),
  role: z.enum(['PASSENGER', 'DRIVER']),
  passenger: z.object({ displayName: z.string() }).optional(),
});
export type BookingOutput = z.infer<typeof BookingOutput>;

export const InitiatePaymentInput = z.object({ channel: PaymentChannel, payerPhone: Phone }).strict();
export const CheckInInput = z.object({ pin: z.string().regex(/^\d{4}$/) }).strict();

export const DisputeCategory = z.enum([
  'DRIVER_NO_SHOW', 'PASSENGER_NO_SHOW', 'WRONG_IDENTITY_OR_VEHICLE', 'CANCELLATION', 'PAYMENT_ISSUE', 'EXCESSIVE_DELAY',
  'DROPOFF_NOT_RESPECTED', 'TRIP_QUALITY', 'LUGGAGE', 'DANGEROUS_BEHAVIOUR', 'THEFT_ASSAULT_HARASSMENT', 'ACCIDENT', 'PAYOUT_ISSUE',
]);
export const OpenDisputeInput = z.object({
  category: DisputeCategory,
  description: z.string().min(20).max(2000),
  requestedOutcome: z.enum(['FULL_REFUND', 'PARTIAL_REFUND', 'RELEASE', 'OTHER']),
  urgentSafety: z.boolean(),
}).strict();
export const EvidenceInput = z.object({ text: z.string().min(5).max(2000), attachmentRef: z.string().optional() }).strict();
export const ReviewInput = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }).strict();

export const DisputeOutput = z.object({
  id: z.string(),
  bookingId: z.string(),
  state: DisputeState,
  category: DisputeCategory,
  priority: z.enum(['SAFETY', 'HIGH', 'NORMAL']),
  openedAt: IsoDateTime,
  dueAt: IsoDateTime.nullable(),
  timeline: z.array(z.object({ at: IsoDateTime, actor: z.enum(['PASSENGER', 'DRIVER', 'WAKA_TEAM', 'SYSTEM', 'PSP']), label: z.string() })),
  evidence: z.array(z.object({ id: z.string(), from: z.enum(['PASSENGER', 'DRIVER', 'WAKA_TEAM']), text: z.string(), at: IsoDateTime })),
  decision: z.object({ refundToPassenger: z.number(), releaseToDriver: z.number(), reason: z.string(), state: z.enum(['PROPOSED', 'APPROVED', 'REJECTED']) }).nullable(),
  /** Ajout API : consignes de sécurité (priorité SAFETY), sinon null. */
  safetyGuidance: z.string().nullable().optional(),
  /** Ajout API : situation des fonds à l'ouverture (FROZEN = gelés chez le PSP). */
  fundsStatus: z.enum(['FROZEN', 'ALREADY_RELEASED', 'RELEASE_IN_FLIGHT', 'NOT_HELD']).optional(),
  /** Ajout API : rôle de l'utilisateur courant dans le litige. */
  role: z.enum(['PASSENGER', 'DRIVER']).optional(),
  /** Ajout API : date limite d'appel (7 jours après résolution), sinon null. */
  appealDeadline: IsoDateTime.nullable().optional(),
});
export type DisputeOutput = z.infer<typeof DisputeOutput>;

// ─── Ajouts API (rétro-compatibles) : entrées optionnelles ─────────────────────
export const CancelInput = z.object({ reason: z.string().min(3).max(300).optional() }).strict();
export const AppealInput = z.object({ reason: z.string().min(10).max(2000).optional() }).strict();
export const MockPspCompleteInput = z.object({ outcome: z.enum(['SUCCEEDED', 'FAILED']) }).strict();
export const TriageInput = z.object({ priority: z.enum(['SAFETY', 'HIGH', 'NORMAL']).optional() }).strict();
export const CloseDisputeInput = z.object({ reason: z.string().min(5).max(500).optional() }).strict();
export const RunReconciliationInput = z.object({ day: IsoDate.optional() }).strict();

// ─── Ajouts API : sorties ─────────────────────────────────────────────────────
export const HealthOutput = z.object({ status: z.enum(['ok', 'degraded']), db: z.enum(['up', 'down']), provider: z.object({ id: z.string(), mode: z.enum(['MOCK', 'SANDBOX', 'LIVE']) }), time: IsoDateTime });
export const OtpVerifyOutput = z.object({ user: MeOutput, isNewUser: z.boolean() });
export const MyTripsOutput = z.object({ items: z.array(TripSummary.extend({ seatsTotal: z.number() })), nextCursor: z.string().nullable() });
export const TripLifecycleOutput = z.object({ trip: TripSummary, bookings: z.array(BookingOutput) });
export const VehicleOutput = MeOutput.shape.vehicles.element;
export const ReviewOutput = z.object({ id: z.string(), bookingId: z.string(), rating: z.number(), comment: z.string().nullable(), createdAt: IsoDateTime });
export const MockPspCompleteOutput = z.object({ providerRef: z.string(), status: z.string(), eventId: z.string(), received: z.literal(true), duplicate: z.boolean(), outcome: z.string().nullable() });

export const AdminLoginOutput = z.object({ challengeId: z.string(), mfaRequired: z.literal(true), expiresAt: IsoDateTime, /** DÉVELOPPEMENT UNIQUEMENT */ devTotp: z.string().optional() });
export const AdminMeOutput = z.object({ id: z.string(), email: z.string(), displayName: z.string(), roles: z.array(Role), permissions: z.array(z.string()), mfaVerified: z.boolean() });
export const StaffOutput = z.object({ items: z.array(z.object({ id: z.string(), email: z.string(), displayName: z.string(), roles: z.array(Role), status: z.string() })) });

export const AdminDashboardOutput = z.object({
  generatedAt: IsoDateTime,
  upcomingTrips: z.number(),
  bookingsByState: z.record(z.number()),
  paymentsByState: z.record(z.number()),
  /** Fonds DÉTENUS PAR LE PARTENAIRE PSP pour le compte des bénéficiaires — ce n'est PAS un chiffre d'affaires. */
  funds: z.object({ heldByPartner: z.number(), driverPayable: z.number(), feesDeferred: z.number(), feesRecognized: z.number(), currency: z.literal('XAF'), disclaimer: z.string() }),
  openDisputesByPriority: z.object({ SAFETY: z.number(), HIGH: z.number(), NORMAL: z.number() }),
  pendingKyc: z.object({ drivers: z.number(), vehicles: z.number() }),
  openAnomalies: z.number(),
  lastReconciliation: z.object({ day: IsoDate, status: z.string(), ranAt: IsoDateTime }).nullable(),
});

export const AdminDisputeListItem = z.object({
  id: z.string(), bookingId: z.string(), state: DisputeState, category: DisputeCategory, priority: z.enum(['SAFETY', 'HIGH', 'NORMAL']),
  openedAt: IsoDateTime, dueAt: IsoDateTime.nullable(), assignedTo: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  fundsStatus: z.string(), amount: z.number(), route: z.string(), openerRole: z.enum(['PASSENGER', 'DRIVER']),
});
export const AdminDisputeListOutput = z.object({ items: z.array(AdminDisputeListItem), nextCursor: z.string().nullable() });
export const AdminDisputeDetail = DisputeOutput.extend({
  description: z.string(),
  requestedOutcome: z.string(),
  urgentSafety: z.boolean(),
  openerRole: z.enum(['PASSENGER', 'DRIVER']),
  assignedTo: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  booking: z.object({ id: z.string(), state: BookingState, seats: z.number(), total: z.number(), driverAmount: z.number(), serviceFee: z.number(), route: z.string(), departureAt: IsoDateTime }),
  payment: z.object({ id: z.string(), state: PaymentState, stateLabel: z.string(), amount: z.number(), providerRef: z.string().nullable() }).nullable(),
  participants: z.object({ passenger: z.object({ id: z.string(), displayName: z.string() }), driver: z.object({ id: z.string(), displayName: z.string() }) }),
  decisions: z.array(z.object({
    id: z.string(), refundToPassenger: z.number(), releaseToDriver: z.number(), feeRetained: z.number(), reason: z.string(), sensitive: z.boolean(),
    state: z.enum(['PROPOSED', 'APPROVED', 'REJECTED']), proposedBy: z.object({ id: z.string(), displayName: z.string() }),
    approvedBy: z.object({ id: z.string(), displayName: z.string() }).nullable(), rejectedBy: z.object({ id: z.string(), displayName: z.string() }).nullable(),
    rejectReason: z.string().nullable(), createdAt: IsoDateTime, decidedAt: IsoDateTime.nullable(),
  })),
  /** Statut d'exécution PSP, distinct du statut de décision. */
  execution: z.object({
    status: z.enum(['NOT_STARTED', 'PENDING', 'CONFIRMED', 'FAILED']),
    refunds: z.array(z.object({ id: z.string(), amount: z.number(), status: z.string(), providerRef: z.string().nullable() })),
    payouts: z.array(z.object({ id: z.string(), amount: z.number(), status: z.string(), providerRef: z.string().nullable() })),
  }),
  allowedActions: z.array(z.string()),
});

export const KycQueueOutput = z.object({
  drivers: z.array(z.object({ userId: z.string(), fullName: z.string(), displayName: z.string(), maskedPhone: z.string(), kycStatus: DriverStatus, licenseExpiry: IsoDate, idDocumentType: z.string(), submittedAt: IsoDateTime, isDemo: z.boolean() })),
  vehicles: z.array(z.object({ id: z.string(), ownerId: z.string(), ownerName: z.string(), label: z.string(), plateMasked: z.string(), year: z.number(), seatsTotal: z.number(), insuranceExpiry: IsoDate, inspectionExpiry: IsoDate, reviewStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']), createdAt: IsoDateTime })),
});
export const KycDecisionOutput = z.object({ id: z.string(), status: z.string(), reviewedAt: IsoDateTime });

export const AdminPaymentsOutput = z.object({
  items: z.array(z.object({ id: z.string(), bookingId: z.string(), state: PaymentState, stateLabel: z.string(), amount: z.number(), currency: z.literal('XAF'), channel: PaymentChannel, provider: z.string(), providerRef: z.string().nullable(), payerPhoneMasked: z.string(), route: z.string(), createdAt: IsoDateTime, updatedAt: IsoDateTime })),
  anomalies: z.array(z.object({ id: z.string(), kind: z.string(), paymentId: z.string().nullable(), bookingId: z.string().nullable(), status: z.string(), details: z.record(z.unknown()), createdAt: IsoDateTime })),
});
export const LedgerOutput = z.object({
  balances: z.record(z.number()),
  journals: z.array(z.object({ id: z.string(), kind: z.string(), bookingId: z.string().nullable(), idempotencyKey: z.string(), providerRef: z.string().nullable(), memo: z.string(), createdAt: IsoDateTime, lines: z.array(z.object({ account: z.string(), debit: z.number(), credit: z.number() })) })),
});
export const AuditOutput = z.object({
  chain: z.object({ valid: z.boolean(), brokenAt: z.number().nullable(), count: z.number() }),
  items: z.array(z.object({ id: z.number(), at: IsoDateTime, actorType: z.string(), actorId: z.string().nullable(), action: z.string(), entityType: z.string(), entityId: z.string().nullable(), reason: z.string().nullable(), ip: z.string().nullable(), hash: z.string(), prevHash: z.string() })),
});
export const PoliciesOutput = z.object({
  feePolicy: z.record(z.unknown()),
  noResponsePolicy: z.record(z.unknown()),
  holdTtlSeconds: z.number(),
  matchingVersion: z.string(),
  doubleApprovalThresholdXaf: z.number(),
  termsVersion: z.string(),
  paymentProvider: z.object({ id: z.string(), mode: z.string(), capabilities: z.record(z.unknown()) }),
});

// ─── Messagerie et notifications ──────────────────────────────────────────────
export const SendMessageInput = z.object({ text: z.string().trim().min(1).max(500) }).strict();
export const MessageOutput = z.object({ id: z.string(), text: z.string(), mine: z.boolean(), createdAt: IsoDateTime });
export type MessageOutput = z.infer<typeof MessageOutput>;
export const MessageThreadOutput = z.object({
  items: z.array(MessageOutput),
  canSend: z.boolean(),
  otherParty: z.object({ displayName: z.string() }),
});
export type MessageThreadOutput = z.infer<typeof MessageThreadOutput>;
export const NotificationOutput = z.object({
  id: z.string(),
  template: z.string(),
  text: z.string(),
  route: z.string().nullable(),
  amount: z.number().nullable(),
  bookingId: z.string().nullable(),
  readAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type NotificationOutput = z.infer<typeof NotificationOutput>;
export const NotificationsOutput = z.object({ items: z.array(NotificationOutput), unread: z.number() });
export type NotificationsOutput = z.infer<typeof NotificationsOutput>;

// ─── Admin ─────────────────────────────────────────────────────────────────────
export const DisputeDecisionInput = z.object({
  refundToPassenger: z.number().int().min(0),
  releaseToDriver: z.number().int().min(0),
  reason: z.string().min(20).max(2000),
  sensitive: z.boolean(),
}).strict();
export const KycDecisionInput = z.object({ approve: z.boolean(), reason: z.string().min(5).max(500) }).strict();
export const RequestEvidenceInput = z.object({ from: z.enum(['PASSENGER', 'DRIVER', 'BOTH']), message: z.string().min(10).max(1000), dueInHours: z.number().int().min(12).max(168) }).strict();
export const AssignInput = z.object({ assigneeId: z.string() }).strict();
export const RejectDecisionInput = z.object({ reason: z.string().min(10).max(1000) }).strict();

export const ReconciliationOutput = z.object({
  day: IsoDate,
  ranAt: IsoDateTime.nullable(),
  providerTotals: z.object({ collections: z.number(), payouts: z.number(), refunds: z.number() }),
  ledgerTotals: z.object({ collections: z.number(), payouts: z.number(), refunds: z.number() }),
  discrepancies: z.array(z.object({ providerRef: z.string(), kind: z.string(), providerAmount: z.number().nullable(), ledgerAmount: z.number().nullable(), issue: z.string() })),
  status: z.enum(['MATCHED', 'DISCREPANCY', 'NOT_RUN']),
});

/** Catalogue des routes — sert de documentation vivante (docs/API.md) et de garde-fou de tests. */
export const ROUTES = {
  auth: { otpStart: 'POST /v1/auth/otp/start', otpVerify: 'POST /v1/auth/otp/verify', logout: 'POST /v1/auth/logout', me: 'GET /v1/me' },
  cities: 'GET /v1/cities',
  trips: { search: 'GET /v1/trips', detail: 'GET /v1/trips/:id', create: 'POST /v1/trips', cancel: 'POST /v1/trips/:id/cancel', mine: 'GET /v1/me/trips', start: 'POST /v1/trips/:id/start', arrival: 'POST /v1/trips/:id/arrival', bookings: 'GET /v1/trips/:id/bookings' },
  driver: { onboarding: 'POST /v1/driver/onboarding', vehicles: 'POST /v1/driver/vehicles', earnings: 'GET /v1/driver/earnings' },
  requests: { create: 'POST /v1/travel-requests', mine: 'GET /v1/me/travel-requests', matches: 'GET /v1/travel-requests/:id/matches', cancel: 'DELETE /v1/travel-requests/:id' },
  bookings: {
    create: 'POST /v1/bookings', mine: 'GET /v1/me/bookings', detail: 'GET /v1/bookings/:id', pay: 'POST /v1/bookings/:id/payments',
    cancel: 'POST /v1/bookings/:id/cancel', checkIn: 'POST /v1/bookings/:id/check-in', confirm: 'POST /v1/bookings/:id/confirm-completion',
    dispute: 'POST /v1/bookings/:id/disputes', review: 'POST /v1/bookings/:id/reviews',
  },
  disputes: { detail: 'GET /v1/disputes/:id', evidence: 'POST /v1/disputes/:id/evidence', appeal: 'POST /v1/disputes/:id/appeal' },
  messages: { thread: 'GET /v1/bookings/:id/messages', send: 'POST /v1/bookings/:id/messages' },
  notifications: { list: 'GET /v1/me/notifications', markRead: 'POST /v1/me/notifications/read' },
  webhooks: { payments: 'POST /v1/webhooks/payments/:provider' },
  dev: { mockPspComplete: 'POST /v1/dev/mock-psp/:providerRef/complete' },
  admin: {
    login: 'POST /v1/admin/auth/login', mfa: 'POST /v1/admin/auth/mfa', me: 'GET /v1/admin/me', logout: 'POST /v1/admin/auth/logout',
    dashboard: 'GET /v1/admin/dashboard',
    kycQueue: 'GET /v1/admin/kyc', kycDecision: 'POST /v1/admin/kyc/drivers/:id/decision', vehicleDecision: 'POST /v1/admin/kyc/vehicles/:id/decision',
    disputes: 'GET /v1/admin/disputes', dispute: 'GET /v1/admin/disputes/:id', assign: 'POST /v1/admin/disputes/:id/assign',
    triage: 'POST /v1/admin/disputes/:id/triage', requestEvidence: 'POST /v1/admin/disputes/:id/request-evidence', review: 'POST /v1/admin/disputes/:id/start-review',
    propose: 'POST /v1/admin/disputes/:id/decision', approve: 'POST /v1/admin/disputes/:id/approve', reject: 'POST /v1/admin/disputes/:id/reject',
    close: 'POST /v1/admin/disputes/:id/close',
    payments: 'GET /v1/admin/payments', ledger: 'GET /v1/admin/finance/ledger', reconciliation: 'GET /v1/admin/finance/reconciliation',
    runReconciliation: 'POST /v1/admin/finance/reconciliation/run', audit: 'GET /v1/admin/audit', policies: 'GET /v1/admin/policies', staff: 'GET /v1/admin/staff',
  },
} as const;
