-- Messagerie limitée aux participants d'une réservation (FR-19) et lecture des notifications.
ALTER TABLE notifications ADD COLUMN read_at timestamptz;
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

CREATE TABLE booking_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings (id),
  sender_id uuid NOT NULL REFERENCES users (id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_messages_booking_idx ON booking_messages (booking_id, created_at);
