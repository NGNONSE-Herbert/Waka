-- Waka — schéma initial (PostgreSQL ≥ 15 / PGlite).
-- Les invariants critiques sont portés par la base elle-même (CHECK, UNIQUE, index partiels, triggers)
-- en plus des contrôles applicatifs : défense en profondeur.

-- ─── Identité & sessions ──────────────────────────────────────────────────────
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164    text NOT NULL UNIQUE CHECK (phone_e164 ~ '^\+2376[0-9]{8}$'),
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  locale        text NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en')),
  is_demo       boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('PASSENGER', 'DRIVER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE staff_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name    text NOT NULL,
  password_hash   text NOT NULL,
  totp_secret_enc text NOT NULL,
  roles           text[] NOT NULL CHECK (cardinality(roles) > 0 AND roles <@ ARRAY['SUPPORT_AGENT', 'DISPUTE_MANAGER', 'FINANCE', 'SUPERADMIN']::text[]),
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  is_demo         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_sha256  text NOT NULL UNIQUE,
  kind          text NOT NULL CHECK (kind IN ('user', 'admin')),
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  staff_id      uuid REFERENCES staff_users(id) ON DELETE CASCADE,
  mfa_verified  boolean NOT NULL DEFAULT false,
  ip            text,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'user' AND user_id IS NOT NULL AND staff_id IS NULL) OR (kind = 'admin' AND staff_id IS NOT NULL AND user_id IS NULL))
);

CREATE TABLE otp_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164   text NOT NULL,
  code_hash    text NOT NULL,
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  ip           text,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenges_phone_idx ON otp_challenges (phone_e164, created_at);
CREATE INDEX otp_challenges_ip_idx ON otp_challenges (ip, created_at);

CREATE TABLE admin_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  ip           text,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_version  text NOT NULL,
  at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, terms_version)
);

-- ─── Conducteurs & véhicules ──────────────────────────────────────────────────
CREATE TABLE driver_profiles (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kyc_status            text NOT NULL DEFAULT 'NONE' CHECK (kyc_status IN ('NONE', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
  full_name             text NOT NULL,
  license_number_hash   text NOT NULL,
  license_expiry        date NOT NULL,
  id_document_type      text NOT NULL CHECK (id_document_type IN ('CNI', 'PASSPORT', 'RESIDENCE_PERMIT')),
  -- Référence opaque vers le stockage privé chiffré : JAMAIS exposée par l'API.
  id_document_ref       text NOT NULL,
  declares_private_carpool_only boolean NOT NULL CHECK (declares_private_carpool_only),
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_at           timestamptz,
  reviewed_by           uuid REFERENCES staff_users(id),
  review_reason         text
);

CREATE TABLE vehicles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- La plaque n'est jamais stockée en clair : empreinte SHA-256 (unicité) + version masquée (affichage).
  plate_hash         text NOT NULL UNIQUE,
  plate_masked       text NOT NULL,
  make               text NOT NULL,
  model              text NOT NULL,
  color              text NOT NULL,
  year               integer NOT NULL CHECK (year BETWEEN 1995 AND 2100),
  seats_total        integer NOT NULL CHECK (seats_total BETWEEN 2 AND 8),
  insurance_expiry   date NOT NULL,
  inspection_expiry  date NOT NULL,
  review_status      text NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_at        timestamptz,
  reviewed_by        uuid REFERENCES staff_users(id),
  review_reason      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicles_owner_idx ON vehicles (owner_id);

-- ─── Référentiel géographique ─────────────────────────────────────────────────
CREATE TABLE cities (
  code  text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name  text NOT NULL,
  sort  integer NOT NULL DEFAULT 0
);

CREATE TABLE meeting_points (
  id         serial PRIMARY KEY,
  city_code  text NOT NULL REFERENCES cities(code),
  name       text NOT NULL,
  sort       integer NOT NULL DEFAULT 0,
  UNIQUE (city_code, name)
);

-- ─── Trajets ──────────────────────────────────────────────────────────────────
CREATE TABLE trips (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id              uuid NOT NULL REFERENCES users(id),
  vehicle_id             uuid NOT NULL REFERENCES vehicles(id),
  origin_city            text NOT NULL REFERENCES cities(code),
  destination_city       text NOT NULL REFERENCES cities(code),
  departure_at           timestamptz NOT NULL,
  estimated_duration_min integer CHECK (estimated_duration_min IS NULL OR estimated_duration_min > 0),
  meeting_point          text NOT NULL,
  dropoff_point          text NOT NULL,
  seats_total            integer NOT NULL CHECK (seats_total BETWEEN 1 AND 8),
  seats_available        integer NOT NULL,
  seat_price             integer NOT NULL CHECK (seat_price > 0),
  luggage                text NOT NULL CHECK (luggage IN ('NONE', 'SMALL', 'MEDIUM', 'LARGE')),
  air_conditioning       boolean NOT NULL DEFAULT false,
  rules                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                 text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'DEPARTED', 'ARRIVED', 'CANCELLED')),
  version                integer NOT NULL DEFAULT 1,
  is_demo                boolean NOT NULL DEFAULT false,
  departed_at            timestamptz,
  arrived_at             timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (seats_available >= 0 AND seats_available <= seats_total),
  CHECK (origin_city <> destination_city)
);
CREATE INDEX trips_search_idx ON trips (origin_city, destination_city, departure_at, id) WHERE status = 'PUBLISHED';
CREATE INDEX trips_driver_idx ON trips (driver_id, departure_at);

CREATE TABLE travel_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin_city           text NOT NULL REFERENCES cities(code),
  destination_city      text NOT NULL REFERENCES cities(code),
  window_start          timestamptz NOT NULL,
  window_end            timestamptz NOT NULL,
  seats                 integer NOT NULL CHECK (seats BETWEEN 1 AND 4),
  max_budget_per_seat   integer CHECK (max_budget_per_seat IS NULL OR max_budget_per_seat > 0),
  preferred_pickup      text,
  needs_luggage         boolean NOT NULL DEFAULT false,
  wants_air_conditioning boolean NOT NULL DEFAULT false,
  notify_on_new_match   boolean NOT NULL DEFAULT true,
  status                text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FULFILLED', 'EXPIRED', 'CANCELLED')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start),
  CHECK (origin_city <> destination_city)
);

-- ─── Réservations ─────────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id                 uuid NOT NULL REFERENCES trips(id),
  passenger_id            uuid NOT NULL REFERENCES users(id),
  seats                   integer NOT NULL CHECK (seats BETWEEN 1 AND 4),
  -- Snapshot tarifaire (jamais recalculé) :
  seat_price              integer NOT NULL CHECK (seat_price > 0),
  driver_amount           integer NOT NULL CHECK (driver_amount > 0),
  service_fee             integer NOT NULL CHECK (service_fee >= 0),
  total                   integer NOT NULL CHECK (total > 0),
  policy_version          text NOT NULL,
  state                   text NOT NULL CHECK (state IN ('DRAFT', 'SEAT_HELD', 'PAYMENT_PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'COMPLETED', 'DISPUTED', 'CANCELLED')),
  hold_expires_at         timestamptz,
  boarding_pin_hash       text,
  boarding_pin_enc        text,
  pin_attempts            integer NOT NULL DEFAULT 0 CHECK (pin_attempts BETWEEN 0 AND 5),
  passenger_confirmed_at  timestamptz,
  checked_in_at           timestamptz,
  arrival_reported_at     timestamptz,
  cancel_reason           text,
  seats_released          boolean NOT NULL DEFAULT false,
  idempotency_key         text NOT NULL,
  is_demo                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (total = driver_amount + service_fee),
  CHECK (driver_amount = seat_price * seats),
  UNIQUE (passenger_id, idempotency_key)
);
CREATE INDEX bookings_trip_idx ON bookings (trip_id);
CREATE INDEX bookings_passenger_idx ON bookings (passenger_id, created_at);
CREATE INDEX bookings_hold_idx ON bookings (hold_expires_at) WHERE state IN ('SEAT_HELD', 'PAYMENT_PENDING');

-- ─── Paiements (fonds détenus par le PSP — ces tables sont des miroirs) ───────
CREATE TABLE payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            uuid NOT NULL UNIQUE REFERENCES bookings(id),
  provider              text NOT NULL,
  provider_ref          text UNIQUE,
  channel               text NOT NULL CHECK (channel IN ('MTN_MOMO', 'ORANGE_MONEY')),
  payer_phone_masked    text NOT NULL,
  amount                integer NOT NULL CHECK (amount > 0),
  currency              text NOT NULL DEFAULT 'XAF' CHECK (currency = 'XAF'),
  state                 text NOT NULL CHECK (state IN ('CREATED', 'PSP_PENDING', 'PSP_CONFIRMED_HELD', 'RELEASE_ELIGIBLE', 'RELEASE_REQUESTED', 'PAYOUT_PROCESSING', 'PAID', 'FAILED', 'FROZEN_DISPUTE', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'MANUAL_REVIEW')),
  merchant_ref          text NOT NULL,
  customer_instruction  text,
  captured_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,
  event_id      text NOT NULL,
  type          text NOT NULL,
  provider_ref  text,
  payload       text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  outcome       text,
  UNIQUE (provider, event_id)
);

CREATE TABLE payouts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           uuid NOT NULL UNIQUE REFERENCES bookings(id), -- MVP : un seul versement par réservation
  payment_id           uuid NOT NULL REFERENCES payments(id),
  beneficiary_user_id  uuid NOT NULL REFERENCES users(id),
  amount               integer NOT NULL CHECK (amount > 0),
  provider_ref         text UNIQUE,
  status               text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  reason               text NOT NULL CHECK (reason IN ('COMPLETION', 'DISPUTE_DECISION')),
  dispute_id           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refunds (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES bookings(id),
  payment_id          uuid NOT NULL REFERENCES payments(id),
  amount              integer NOT NULL CHECK (amount > 0),
  from_driver_share   integer NOT NULL CHECK (from_driver_share >= 0),
  from_fee            integer NOT NULL CHECK (from_fee >= 0),
  provider_ref        text UNIQUE,
  status              text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  reason              text NOT NULL,
  dispute_id          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (from_driver_share + from_fee = amount)
);

-- Garde-fou base : la somme des remboursements non échoués ne dépasse jamais le montant payé.
CREATE FUNCTION refunds_within_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total_refunds integer; paid integer;
BEGIN
  SELECT amount INTO paid FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO total_refunds FROM refunds WHERE payment_id = NEW.payment_id AND status <> 'FAILED';
  IF total_refunds > paid THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_PAYMENT: % > %', total_refunds, paid USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refunds_within_payment_trg AFTER INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION refunds_within_payment();

-- ─── Grand livre (append-only, partie double) ─────────────────────────────────
CREATE TABLE ledger_journals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL CHECK (kind IN ('COLLECTION_CONFIRMED', 'FEE_RECOGNIZED', 'PAYOUT_CONFIRMED', 'REFUND_CONFIRMED', 'REVERSAL', 'RECONCILIATION_ADJUSTMENT')),
  booking_id       uuid REFERENCES bookings(id),
  idempotency_key  text NOT NULL UNIQUE,
  provider_ref     text,
  memo             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_lines (
  id          bigserial PRIMARY KEY,
  journal_id  uuid NOT NULL REFERENCES ledger_journals(id),
  account     text NOT NULL CHECK (account IN ('psp_held', 'driver_payable', 'platform_fee_deferred', 'platform_fee_revenue', 'adjustments')),
  debit       integer NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit      integer NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK ((debit > 0) <> (credit > 0))
);
CREATE INDEX ledger_lines_journal_idx ON ledger_lines (journal_id);

CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY: % sur % interdit', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER ledger_journals_append_only BEFORE UPDATE OR DELETE ON ledger_journals FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_lines_append_only BEFORE UPDATE OR DELETE ON ledger_lines FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_journals_no_truncate BEFORE TRUNCATE ON ledger_journals FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_lines_no_truncate BEFORE TRUNCATE ON ledger_lines FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Équilibre débit = crédit vérifié à la validation de la transaction (contrainte différée).
CREATE FUNCTION ledger_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d bigint; c bigint; n integer;
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*) INTO d, c, n FROM ledger_lines WHERE journal_id = NEW.journal_id;
  IF d <> c OR n < 2 THEN
    RAISE EXCEPTION 'LEDGER_UNBALANCED: journal % débit % crédit % lignes %', NEW.journal_id, d, c, n USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_lines_balanced AFTER INSERT ON ledger_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_journal_balanced();

-- ─── Anomalies (revue manuelle) ───────────────────────────────────────────────
CREATE TABLE anomalies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  payment_id  uuid REFERENCES payments(id),
  booking_id  uuid REFERENCES bookings(id),
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Litiges ──────────────────────────────────────────────────────────────────
CREATE TABLE disputes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         uuid NOT NULL REFERENCES bookings(id),
  opener_id          uuid NOT NULL REFERENCES users(id),
  counterparty_id    uuid NOT NULL REFERENCES users(id),
  opener_role        text NOT NULL CHECK (opener_role IN ('PASSENGER', 'DRIVER')),
  category           text NOT NULL,
  description        text NOT NULL,
  requested_outcome  text NOT NULL CHECK (requested_outcome IN ('FULL_REFUND', 'PARTIAL_REFUND', 'RELEASE', 'OTHER')),
  urgent_safety      boolean NOT NULL DEFAULT false,
  priority           text NOT NULL CHECK (priority IN ('SAFETY', 'HIGH', 'NORMAL')),
  state              text NOT NULL CHECK (state IN ('OPENED', 'TRIAGED', 'EVIDENCE_REQUESTED', 'UNDER_REVIEW', 'DECISION_PROPOSED', 'APPROVED', 'EXECUTION_PENDING', 'RESOLVED', 'APPEALED', 'CLOSED')),
  funds_status       text NOT NULL CHECK (funds_status IN ('FROZEN', 'ALREADY_RELEASED', 'RELEASE_IN_FLIGHT', 'NOT_HELD')),
  assigned_to        uuid REFERENCES staff_users(id),
  due_at             timestamptz,
  resolved_at        timestamptz,
  closed_at          timestamptz,
  is_demo            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (opener_id <> counterparty_id)
);
-- Un seul litige non clos par réservation.
CREATE UNIQUE INDEX disputes_one_open_per_booking ON disputes (booking_id) WHERE state <> 'CLOSED';

CREATE TABLE dispute_events (
  id          bigserial PRIMARY KEY,
  dispute_id  uuid NOT NULL REFERENCES disputes(id),
  at          timestamptz NOT NULL DEFAULT now(),
  actor_kind  text NOT NULL CHECK (actor_kind IN ('PASSENGER', 'DRIVER', 'WAKA_TEAM', 'SYSTEM', 'PSP')),
  actor_id    uuid,
  label       text NOT NULL
);

CREATE TABLE dispute_evidence (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id      uuid NOT NULL REFERENCES disputes(id),
  from_kind       text NOT NULL CHECK (from_kind IN ('PASSENGER', 'DRIVER', 'WAKA_TEAM')),
  author_id       uuid NOT NULL,
  text            text NOT NULL,
  attachment_ref  text,
  at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dispute_decisions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id               uuid NOT NULL REFERENCES disputes(id),
  refund_to_passenger      integer NOT NULL CHECK (refund_to_passenger >= 0),
  release_to_driver        integer NOT NULL CHECK (release_to_driver >= 0),
  refund_from_driver_share integer NOT NULL CHECK (refund_from_driver_share >= 0),
  refund_from_fee          integer NOT NULL CHECK (refund_from_fee >= 0),
  fee_retained             integer NOT NULL CHECK (fee_retained >= 0),
  reason                   text NOT NULL,
  sensitive                boolean NOT NULL DEFAULT false,
  status                   text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED')),
  proposed_by              uuid NOT NULL REFERENCES staff_users(id),
  approved_by              uuid REFERENCES staff_users(id),
  rejected_by              uuid REFERENCES staff_users(id),
  reject_reason            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  decided_at               timestamptz,
  CHECK (approved_by IS NULL OR approved_by <> proposed_by)
);
CREATE UNIQUE INDEX dispute_decisions_one_pending ON dispute_decisions (dispute_id) WHERE status = 'PROPOSED';

-- ─── Avis ─────────────────────────────────────────────────────────────────────
CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  author_id   uuid NOT NULL REFERENCES users(id),
  subject_id  uuid NOT NULL REFERENCES users(id),
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, author_id),
  CHECK (author_id <> subject_id)
);

-- ─── Journal d'audit (append-only, chaîné par hachage) ────────────────────────
CREATE TABLE audit_logs (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  actor_type   text NOT NULL CHECK (actor_type IN ('STAFF', 'USER', 'SYSTEM', 'PSP')),
  actor_id     text,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text,
  before_hash  text,
  after_hash   text,
  ip           text,
  reason       text,
  request_id   text,
  prev_hash    text NOT NULL,
  hash         text NOT NULL UNIQUE
);
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- ─── Notifications & outbox transactionnelle ──────────────────────────────────
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  channel     text NOT NULL DEFAULT 'SMS_MOCK',
  template    text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT', 'FAILED')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_jobs (
  id            bigserial PRIMARY KEY,
  type          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at        timestamptz NOT NULL DEFAULT now(),
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 5,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'DONE', 'DEAD')),
  last_error    text,
  locked_at     timestamptz,
  dedupe_key    text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz
);
CREATE INDEX outbox_jobs_due_idx ON outbox_jobs (run_at) WHERE status = 'PENDING';

-- ─── Rapprochement & idempotence ──────────────────────────────────────────────
CREATE TABLE reconciliation_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day              date NOT NULL,
  ran_at           timestamptz NOT NULL DEFAULT now(),
  ran_by           uuid REFERENCES staff_users(id),
  status           text NOT NULL CHECK (status IN ('MATCHED', 'DISCREPANCY')),
  provider_totals  jsonb NOT NULL,
  ledger_totals    jsonb NOT NULL,
  discrepancies    jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX reconciliation_runs_day_idx ON reconciliation_runs (day, ran_at);

CREATE TABLE idempotency_records (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route         text NOT NULL,
  key           text NOT NULL,
  request_hash  text NOT NULL,
  status_code   integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, route, key)
);

-- ─── PSP simulé (MOCK uniquement — état « côté prestataire ») ─────────────────
CREATE TABLE mock_psp_transactions (
  ref              text PRIMARY KEY,
  kind             text NOT NULL CHECK (kind IN ('COLLECTION', 'PAYOUT', 'REFUND')),
  idempotency_key  text NOT NULL UNIQUE,
  amount           integer NOT NULL CHECK (amount > 0),
  currency         text NOT NULL,
  merchant_ref     text NOT NULL,
  status           text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  related_ref      text,
  payer_masked     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);
