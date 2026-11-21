import { Inject, Injectable } from '@nestjs/common';
import type { BookingOutput, PaymentOutput, TripSummary } from '@waka/contracts';
import { PAYMENT_STATE_LABEL_FR, type PaymentState } from '@waka/domain';
import { and, desc, eq, ne, sql, type SQL } from 'drizzle-orm';
import { type Database, type DbOrTx, rows } from '../db/client.js';
import { bookings, disputes, payments, reviews, users } from '../db/schema.js';
import type { AppConfig } from '../config.js';
import { Sealer } from './crypto.js';
import { CONFIG, DATABASE } from './tokens.js';

export interface TripRow {
  id: string;
  driver_id: string;
  vehicle_id: string;
  origin_city: string;
  origin_name: string;
  destination_city: string;
  destination_name: string;
  departure_at: Date;
  estimated_duration_min: number | null;
  meeting_point: string;
  dropoff_point: string;
  seats_total: number;
  seats_available: number;
  seat_price: number;
  luggage: 'NONE' | 'SMALL' | 'MEDIUM' | 'LARGE';
  air_conditioning: boolean;
  rules: string[];
  status: string;
  driver_name: string;
  driver_demo: boolean;
  kyc_status: string | null;
  vehicle_label: string;
  completed_trips: number;
  rating: number | null;
}

/** Projection SQL commune aux listes et détails de trajets (aucune donnée sensible). */
export const TRIP_SELECT = sql`
  SELECT t.id, t.driver_id, t.vehicle_id, t.origin_city, oc.name AS origin_name, t.destination_city, dc.name AS destination_name,
         t.departure_at, t.estimated_duration_min, t.meeting_point, t.dropoff_point, t.seats_total, t.seats_available,
         t.seat_price, t.luggage, t.air_conditioning, t.rules, t.status,
         u.display_name AS driver_name, u.is_demo AS driver_demo, dp.kyc_status,
         (v.make || ' ' || v.model || ' · ' || v.color) AS vehicle_label,
         (SELECT COUNT(*) FROM trips t2 WHERE t2.driver_id = t.driver_id AND t2.status = 'ARRIVED')::int AS completed_trips,
         (SELECT ROUND(AVG(r.rating)::numeric, 1)::float FROM reviews r WHERE r.subject_id = t.driver_id) AS rating
  FROM trips t
  JOIN cities oc ON oc.code = t.origin_city
  JOIN cities dc ON dc.code = t.destination_city
  JOIN users u ON u.id = t.driver_id
  JOIN vehicles v ON v.id = t.vehicle_id
  LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_id`;

export function toTripSummary(r: TripRow, totalPerSeat: number): TripSummary {
  const status = (r.status === 'PUBLISHED' && r.seats_available === 0 ? 'FULL' : r.status) as TripSummary['status'];
  return {
    id: r.id,
    origin: { code: r.origin_city as TripSummary['origin']['code'], name: r.origin_name },
    destination: { code: r.destination_city as TripSummary['destination']['code'], name: r.destination_name },
    departureAt: new Date(r.departure_at).toISOString(),
    estimatedDurationMin: r.estimated_duration_min,
    meetingPoint: r.meeting_point,
    dropoffPoint: r.dropoff_point,
    seatsAvailable: r.seats_available,
    seatPrice: r.seat_price,
    totalPerSeat,
    driver: {
      displayName: r.driver_name,
      verified: r.kyc_status === 'VERIFIED',
      completedTrips: Number(r.completed_trips),
      rating: r.rating === null ? null : Number(r.rating),
      isDemo: r.driver_demo,
    },
    vehicle: { label: r.vehicle_label, airConditioning: r.air_conditioning, luggage: r.luggage },
    status,
  };
}

@Injectable()
export class ViewsService {
  readonly sealer: Sealer;
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {
    this.sealer = new Sealer(config.appSecret);
  }

  async tripRows(dbx: DbOrTx, where: SQL, tail: SQL = sql``): Promise<TripRow[]> {
    return rows<TripRow>(dbx, sql`${TRIP_SELECT} WHERE ${where} ${tail}`);
  }

  paymentOutput(p: typeof payments.$inferSelect): PaymentOutput {
    const mode = p.provider === 'mock' ? 'MOCK' : 'SANDBOX';
    return {
      id: p.id,
      state: p.state as PaymentOutput['state'],
      stateLabel: PAYMENT_STATE_LABEL_FR[p.state as PaymentState],
      channel: p.channel as PaymentOutput['channel'],
      amount: p.amount,
      currency: 'XAF',
      providerMode: mode,
      customerInstruction: p.customerInstruction,
      ...(mode === 'MOCK' && p.providerRef ? { mockProviderRef: p.providerRef } : {}),
    };
  }

  /**
   * Représentation d'une réservation pour un participant. Le PIN d'embarquement n'est rendu
   * qu'au passager, et seulement tant que la réservation est CONFIRMED.
   */
  async bookingOutput(bookingId: string, viewerId: string, dbx: DbOrTx = this.database.db): Promise<BookingOutput> {
    const [b] = await dbx.select().from(bookings).where(eq(bookings.id, bookingId));
    if (!b) throw new Error(`booking ${bookingId} introuvable`);
    const [trip] = await this.tripRows(dbx, sql`t.id = ${b.tripId}`);
    if (!trip) throw new Error(`trip ${b.tripId} introuvable`);
    const role: 'PASSENGER' | 'DRIVER' = b.passengerId === viewerId ? 'PASSENGER' : 'DRIVER';
    const [p] = await dbx.select().from(payments).where(eq(payments.bookingId, b.id));
    const [d] = await dbx
      .select({ id: disputes.id, state: disputes.state })
      .from(disputes)
      .where(and(eq(disputes.bookingId, b.id), ne(disputes.state, 'CLOSED')))
      .orderBy(desc(disputes.createdAt))
      .limit(1);
    const [rev] = await dbx.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.bookingId, b.id), eq(reviews.authorId, viewerId)));
    let passenger: { displayName: string } | undefined;
    if (role === 'DRIVER') {
      const [u] = await dbx.select({ displayName: users.displayName }).from(users).where(eq(users.id, b.passengerId));
      passenger = { displayName: u?.displayName ?? '—' };
    }
    const pin = role === 'PASSENGER' && b.state === 'CONFIRMED' && b.boardingPinEnc ? this.sealer.open(b.boardingPinEnc) : null;
    const reviewable = b.state === 'COMPLETED' || (b.passengerConfirmedAt !== null && b.state !== 'CANCELLED');
    return {
      id: b.id,
      state: b.state as BookingOutput['state'],
      trip: toTripSummary(trip, b.total / b.seats),
      seats: b.seats,
      price: {
        policyVersion: b.policyVersion,
        seats: b.seats,
        seatPrice: b.seatPrice,
        driverAmount: b.driverAmount,
        serviceFee: b.serviceFee,
        total: b.total,
        currency: 'XAF',
      },
      holdExpiresAt: b.holdExpiresAt && ['SEAT_HELD', 'PAYMENT_PENDING'].includes(b.state) ? b.holdExpiresAt.toISOString() : null,
      payment: p ? this.paymentOutput(p) : null,
      boardingPin: pin,
      passengerConfirmedAt: b.passengerConfirmedAt ? b.passengerConfirmedAt.toISOString() : null,
      dispute: d ? { id: d.id, state: d.state as NonNullable<BookingOutput['dispute']>['state'] } : null,
      canReview: reviewable && !rev,
      role,
      ...(passenger ? { passenger } : {}),
    };
  }
}
