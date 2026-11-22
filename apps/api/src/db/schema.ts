/**
 * Schéma Drizzle — miroir typé de migrations/*.sql (source de vérité : le SQL, qui porte
 * les CHECK, index partiels et triggers). Le test `schema.test.ts` vérifie la cohérence.
 */
import { bigserial, boolean, date, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () => uuid('id').primaryKey().defaultRandom();

export const users = pgTable('users', {
  id: id(),
  phoneE164: text('phone_e164').notNull().unique(),
  displayName: text('display_name').notNull(),
  locale: text('locale').notNull().default('fr'),
  isDemo: boolean('is_demo').notNull().default(false),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.role] })]);

export const staffUsers = pgTable('staff_users', {
  id: id(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  totpSecretEnc: text('totp_secret_enc').notNull(),
  roles: text('roles').array().notNull(),
  status: text('status').notNull().default('ACTIVE'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: id(),
  tokenSha256: text('token_sha256').notNull().unique(),
  kind: text('kind').notNull(),
  userId: uuid('user_id'),
  staffId: uuid('staff_id'),
  mfaVerified: boolean('mfa_verified').notNull().default(false),
  ip: text('ip'),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const otpChallenges = pgTable('otp_challenges', {
  id: id(),
  phoneE164: text('phone_e164').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  ip: text('ip'),
  expiresAt: ts('expires_at').notNull(),
  consumedAt: ts('consumed_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const adminChallenges = pgTable('admin_challenges', {
  id: id(),
  staffId: uuid('staff_id').notNull(),
  attempts: integer('attempts').notNull().default(0),
  ip: text('ip'),
  expiresAt: ts('expires_at').notNull(),
  consumedAt: ts('consumed_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const consents = pgTable('consents', {
  id: id(),
  userId: uuid('user_id').notNull(),
  termsVersion: text('terms_version').notNull(),
  at: ts('at').notNull().defaultNow(),
});

export const driverProfiles = pgTable('driver_profiles', {
  userId: uuid('user_id').primaryKey(),
  kycStatus: text('kyc_status').notNull().default('NONE'),
  fullName: text('full_name').notNull(),
  licenseNumberHash: text('license_number_hash').notNull(),
  licenseExpiry: date('license_expiry', { mode: 'string' }).notNull(),
  idDocumentType: text('id_document_type').notNull(),
  idDocumentRef: text('id_document_ref').notNull(),
  declaresPrivateCarpoolOnly: boolean('declares_private_carpool_only').notNull(),
  submittedAt: ts('submitted_at').notNull().defaultNow(),
  reviewedAt: ts('reviewed_at'),
  reviewedBy: uuid('reviewed_by'),
  reviewReason: text('review_reason'),
});

export const vehicles = pgTable('vehicles', {
  id: id(),
  ownerId: uuid('owner_id').notNull(),
  plateHash: text('plate_hash').notNull().unique(),
  plateMasked: text('plate_masked').notNull(),
  make: text('make').notNull(),
  model: text('model').notNull(),
  color: text('color').notNull(),
  year: integer('year').notNull(),
  seatsTotal: integer('seats_total').notNull(),
  insuranceExpiry: date('insurance_expiry', { mode: 'string' }).notNull(),
  inspectionExpiry: date('inspection_expiry', { mode: 'string' }).notNull(),
  reviewStatus: text('review_status').notNull().default('PENDING'),
  reviewedAt: ts('reviewed_at'),
  reviewedBy: uuid('reviewed_by'),
  reviewReason: text('review_reason'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const cities = pgTable('cities', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
});

export const meetingPoints = pgTable('meeting_points', {
  id: serial('id').primaryKey(),
  cityCode: text('city_code').notNull(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
});

export const trips = pgTable('trips', {
  id: id(),
  driverId: uuid('driver_id').notNull(),
  vehicleId: uuid('vehicle_id').notNull(),
  originCity: text('origin_city').notNull(),
  destinationCity: text('destination_city').notNull(),
  departureAt: ts('departure_at').notNull(),
  estimatedDurationMin: integer('estimated_duration_min'),
  meetingPoint: text('meeting_point').notNull(),
  dropoffPoint: text('dropoff_point').notNull(),
  seatsTotal: integer('seats_total').notNull(),
  seatsAvailable: integer('seats_available').notNull(),
  seatPrice: integer('seat_price').notNull(),
  luggage: text('luggage').notNull(),
  airConditioning: boolean('air_conditioning').notNull().default(false),
  rules: jsonb('rules').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('PUBLISHED'),
  version: integer('version').notNull().default(1),
  isDemo: boolean('is_demo').notNull().default(false),
  departedAt: ts('departed_at'),
  arrivedAt: ts('arrived_at'),
  cancelledAt: ts('cancelled_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const travelRequests = pgTable('travel_requests', {
  id: id(),
  userId: uuid('user_id').notNull(),
  originCity: text('origin_city').notNull(),
  destinationCity: text('destination_city').notNull(),
  windowStart: ts('window_start').notNull(),
  windowEnd: ts('window_end').notNull(),
  seats: integer('seats').notNull(),
  maxBudgetPerSeat: integer('max_budget_per_seat'),
  preferredPickup: text('preferred_pickup'),
  needsLuggage: boolean('needs_luggage').notNull().default(false),
  wantsAirConditioning: boolean('wants_air_conditioning').notNull().default(false),
  notifyOnNewMatch: boolean('notify_on_new_match').notNull().default(true),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const bookings = pgTable('bookings', {
  id: id(),
  tripId: uuid('trip_id').notNull(),
  passengerId: uuid('passenger_id').notNull(),
  seats: integer('seats').notNull(),
  seatPrice: integer('seat_price').notNull(),
  driverAmount: integer('driver_amount').notNull(),
  serviceFee: integer('service_fee').notNull(),
  total: integer('total').notNull(),
  policyVersion: text('policy_version').notNull(),
  state: text('state').notNull(),
  holdExpiresAt: ts('hold_expires_at'),
  boardingPinHash: text('boarding_pin_hash'),
  boardingPinEnc: text('boarding_pin_enc'),
  pinAttempts: integer('pin_attempts').notNull().default(0),
  passengerConfirmedAt: ts('passenger_confirmed_at'),
  checkedInAt: ts('checked_in_at'),
  arrivalReportedAt: ts('arrival_reported_at'),
  cancelReason: text('cancel_reason'),
  seatsReleased: boolean('seats_released').notNull().default(false),
  idempotencyKey: text('idempotency_key').notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const payments = pgTable('payments', {
  id: id(),
  bookingId: uuid('booking_id').notNull().unique(),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref').unique(),
  channel: text('channel').notNull(),
  payerPhoneMasked: text('payer_phone_masked').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('XAF'),
  state: text('state').notNull(),
  merchantRef: text('merchant_ref').notNull(),
  customerInstruction: text('customer_instruction'),
  capturedAt: ts('captured_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const paymentEvents = pgTable('payment_events', {
  id: id(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  type: text('type').notNull(),
  providerRef: text('provider_ref'),
  payload: text('payload').notNull(),
  receivedAt: ts('received_at').notNull().defaultNow(),
  processedAt: ts('processed_at'),
  outcome: text('outcome'),
});

export const payouts = pgTable('payouts', {
  id: id(),
  bookingId: uuid('booking_id').notNull().unique(),
  paymentId: uuid('payment_id').notNull(),
  beneficiaryUserId: uuid('beneficiary_user_id').notNull(),
  amount: integer('amount').notNull(),
  providerRef: text('provider_ref').unique(),
  status: text('status').notNull().default('REQUESTED'),
  reason: text('reason').notNull(),
  disputeId: uuid('dispute_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const refunds = pgTable('refunds', {
  id: id(),
  bookingId: uuid('booking_id').notNull(),
  paymentId: uuid('payment_id').notNull(),
  amount: integer('amount').notNull(),
  fromDriverShare: integer('from_driver_share').notNull(),
  fromFee: integer('from_fee').notNull(),
  providerRef: text('provider_ref').unique(),
  status: text('status').notNull().default('REQUESTED'),
  reason: text('reason').notNull(),
  disputeId: uuid('dispute_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const ledgerJournals = pgTable('ledger_journals', {
  id: id(),
  kind: text('kind').notNull(),
  bookingId: uuid('booking_id'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  providerRef: text('provider_ref'),
  memo: text('memo').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const ledgerLines = pgTable('ledger_lines', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  journalId: uuid('journal_id').notNull(),
  account: text('account').notNull(),
  debit: integer('debit').notNull().default(0),
  credit: integer('credit').notNull().default(0),
});

export const anomalies = pgTable('anomalies', {
  id: id(),
  kind: text('kind').notNull(),
  paymentId: uuid('payment_id'),
  bookingId: uuid('booking_id'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('OPEN'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const disputes = pgTable('disputes', {
  id: id(),
  bookingId: uuid('booking_id').notNull(),
  openerId: uuid('opener_id').notNull(),
  counterpartyId: uuid('counterparty_id').notNull(),
  openerRole: text('opener_role').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  requestedOutcome: text('requested_outcome').notNull(),
  urgentSafety: boolean('urgent_safety').notNull().default(false),
  priority: text('priority').notNull(),
  state: text('state').notNull(),
  fundsStatus: text('funds_status').notNull(),
  assignedTo: uuid('assigned_to'),
  dueAt: ts('due_at'),
  resolvedAt: ts('resolved_at'),
  closedAt: ts('closed_at'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const disputeEvents = pgTable('dispute_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  disputeId: uuid('dispute_id').notNull(),
  at: ts('at').notNull().defaultNow(),
  actorKind: text('actor_kind').notNull(),
  actorId: uuid('actor_id'),
  label: text('label').notNull(),
});

export const disputeEvidence = pgTable('dispute_evidence', {
  id: id(),
  disputeId: uuid('dispute_id').notNull(),
  fromKind: text('from_kind').notNull(),
  authorId: uuid('author_id').notNull(),
  text: text('text').notNull(),
  attachmentRef: text('attachment_ref'),
  at: ts('at').notNull().defaultNow(),
});

export const disputeDecisions = pgTable('dispute_decisions', {
  id: id(),
  disputeId: uuid('dispute_id').notNull(),
  refundToPassenger: integer('refund_to_passenger').notNull(),
  releaseToDriver: integer('release_to_driver').notNull(),
  refundFromDriverShare: integer('refund_from_driver_share').notNull(),
  refundFromFee: integer('refund_from_fee').notNull(),
  feeRetained: integer('fee_retained').notNull(),
  reason: text('reason').notNull(),
  sensitive: boolean('sensitive').notNull().default(false),
  status: text('status').notNull().default('PROPOSED'),
  proposedBy: uuid('proposed_by').notNull(),
  approvedBy: uuid('approved_by'),
  rejectedBy: uuid('rejected_by'),
  rejectReason: text('reject_reason'),
  createdAt: ts('created_at').notNull().defaultNow(),
  decidedAt: ts('decided_at'),
});

export const reviews = pgTable('reviews', {
  id: id(),
  bookingId: uuid('booking_id').notNull(),
  authorId: uuid('author_id').notNull(),
  subjectId: uuid('subject_id').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  beforeHash: text('before_hash'),
  afterHash: text('after_hash'),
  ip: text('ip'),
  reason: text('reason'),
  requestId: text('request_id'),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull().unique(),
});

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id'),
  channel: text('channel').notNull().default('SMS_MOCK'),
  template: text('template').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('SENT'),
  readAt: ts('read_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const bookingMessages = pgTable('booking_messages', {
  id: id(),
  bookingId: uuid('booking_id').notNull(),
  senderId: uuid('sender_id').notNull(),
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const outboxJobs = pgTable('outbox_jobs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  runAt: ts('run_at').notNull().defaultNow(),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  status: text('status').notNull().default('PENDING'),
  lastError: text('last_error'),
  lockedAt: ts('locked_at'),
  dedupeKey: text('dedupe_key').unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
  doneAt: ts('done_at'),
});

export const reconciliationRuns = pgTable('reconciliation_runs', {
  id: id(),
  day: date('day', { mode: 'string' }).notNull(),
  ranAt: ts('ran_at').notNull().defaultNow(),
  ranBy: uuid('ran_by'),
  status: text('status').notNull(),
  providerTotals: jsonb('provider_totals').$type<{ collections: number; payouts: number; refunds: number }>().notNull(),
  ledgerTotals: jsonb('ledger_totals').$type<{ collections: number; payouts: number; refunds: number }>().notNull(),
  discrepancies: jsonb('discrepancies').$type<Array<{ providerRef: string; kind: string; providerAmount: number | null; ledgerAmount: number | null; issue: string }>>().notNull().default([]),
});

export const idempotencyRecords = pgTable('idempotency_records', {
  userId: uuid('user_id').notNull(),
  route: text('route').notNull(),
  key: text('key').notNull(),
  requestHash: text('request_hash').notNull(),
  statusCode: integer('status_code').notNull(),
  responseBody: jsonb('response_body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.route, t.key] })]);

export const mockPspTransactions = pgTable('mock_psp_transactions', {
  ref: text('ref').primaryKey(),
  kind: text('kind').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  merchantRef: text('merchant_ref').notNull(),
  status: text('status').notNull(),
  relatedRef: text('related_ref'),
  payerMasked: text('payer_masked'),
  createdAt: ts('created_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
});
