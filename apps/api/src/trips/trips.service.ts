import { Inject, Injectable } from '@nestjs/common';
import type { CreateTripInput, MatchOutput, TripDetail, TripSummary } from '@waka/contracts';
import { DEFAULT_FEE_POLICY, DomainError, type MatchRequest, type MatchTrip, quote, rankMatches, validateSeatPrice } from '@waka/domain';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { type Database, type DbOrTx } from '../db/client.js';
import { cities, driverProfiles, meetingPoints, travelRequests, trips, vehicles } from '../db/schema.js';
import { AuditService } from '../common/audit.service.js';
import { type AuthUser, doualaDay, doualaDayStart } from '../common/http.js';
import { DATABASE } from '../common/tokens.js';
import { type TripRow, toTripSummary, ViewsService } from '../common/views.service.js';
import { NotificationsService } from '../outbox/notifications.service.js';
import { CANCELLATION_POLICY_SUMMARY, estimatedDurationMin } from './reference-data.js';

const totalPerSeat = (seatPrice: number) => quote(seatPrice, 1, DEFAULT_FEE_POLICY).total;
export const summarize = (r: TripRow): TripSummary => toTripSummary(r, totalPerSeat(r.seat_price));

function encodeCursor(d: Date, id: string): string {
  return Buffer.from(JSON.stringify({ d: d.toISOString(), i: id })).toString('base64url');
}
function decodeCursor(c: string): { d: Date; i: string } {
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as { d: string; i: string };
    const d = new Date(v.d);
    if (Number.isNaN(d.getTime()) || !/^[0-9a-f-]{36}$/i.test(v.i)) throw new Error('bad');
    return { d, i: v.i };
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Curseur de pagination invalide.');
  }
}

@Injectable()
export class TripsService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(ViewsService) private readonly views: ViewsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.database.db;
  }

  async cities() {
    const cs = await this.db.select().from(cities).orderBy(asc(cities.sort));
    const mps = await this.db.select().from(meetingPoints).orderBy(asc(meetingPoints.sort));
    return cs.map((c) => ({ code: c.code, name: c.name, meetingPoints: mps.filter((m) => m.cityCode === c.code).map((m) => m.name) }));
  }

  /** Recherche paginée par curseur stable (departure_at, id). Uniquement trajets publiés, à venir, conducteurs vérifiés. */
  async search(q: { from?: string | undefined; to?: string | undefined; date?: string | undefined; seats: number; cursor?: string | undefined; limit: number }) {
    const conds: SQL[] = [sql`t.status = 'PUBLISHED'`, sql`t.departure_at > now()`, sql`t.seats_available >= ${q.seats}`, sql`dp.kyc_status = 'VERIFIED'`];
    if (q.from) conds.push(sql`t.origin_city = ${q.from}`);
    if (q.to) conds.push(sql`t.destination_city = ${q.to}`);
    if (q.date) {
      const start = doualaDayStart(q.date);
      if (Number.isNaN(start.getTime())) throw new DomainError('VALIDATION_ERROR', 'Date invalide.');
      conds.push(sql`t.departure_at >= ${start} AND t.departure_at < ${new Date(start.getTime() + 86_400_000)}`);
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      conds.push(sql`(t.departure_at, t.id) > (${c.d}, ${c.i}::uuid)`);
    }
    const list = await this.views.tripRows(this.db, sql.join(conds, sql` AND `), sql`ORDER BY t.departure_at ASC, t.id ASC LIMIT ${q.limit + 1}`);
    const page = list.slice(0, q.limit);
    const last = page.at(-1);
    return { items: page.map(summarize), nextCursor: list.length > q.limit && last ? encodeCursor(new Date(last.departure_at), last.id) : null };
  }

  async detail(id: string): Promise<TripDetail> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError('NOT_FOUND', 'Trajet introuvable.');
    const [r] = await this.views.tripRows(this.db, sql`t.id = ${id}`);
    if (!r) throw new DomainError('NOT_FOUND', 'Trajet introuvable.');
    const q1 = quote(r.seat_price, 1, DEFAULT_FEE_POLICY);
    return {
      ...summarize(r),
      rules: r.rules ?? [],
      cancellationPolicySummary: CANCELLATION_POLICY_SUMMARY,
      quoteForOneSeat: { policyVersion: q1.policyVersion, seats: 1, seatPrice: q1.seatPrice, driverAmount: q1.driverAmount, serviceFee: q1.serviceFee, total: q1.total, currency: 'XAF' },
    };
  }

  async create(user: AuthUser, input: CreateTripInput): Promise<TripDetail> {
    const departureAt = new Date(input.departureAt);
    const now = Date.now();
    if (departureAt.getTime() < now + 30 * 60_000) throw new DomainError('VALIDATION_ERROR', 'Le départ doit être au moins 30 minutes dans le futur.');
    if (departureAt.getTime() > now + 60 * 86_400_000) throw new DomainError('VALIDATION_ERROR', 'Le départ ne peut pas dépasser 60 jours.');
    const tripDay = doualaDay(departureAt);
    const [dp] = await this.db.select().from(driverProfiles).where(eq(driverProfiles.userId, user.id));
    if (!user.roles.includes('DRIVER') || !dp || dp.kycStatus !== 'VERIFIED') {
      throw new DomainError('DRIVER_NOT_ELIGIBLE', 'Votre profil conducteur doit être vérifié par l’équipe Waka avant de publier un trajet.', { driverStatus: dp?.kycStatus ?? 'NONE' });
    }
    if (dp.licenseExpiry < tripDay) throw new DomainError('DRIVER_NOT_ELIGIBLE', 'Votre permis de conduire est expiré à la date du trajet.');
    if (!/^[0-9a-f-]{36}$/i.test(input.vehicleId)) throw new DomainError('NOT_FOUND', 'Véhicule introuvable.');
    const [v] = await this.db.select().from(vehicles).where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.ownerId, user.id)));
    if (!v) throw new DomainError('NOT_FOUND', 'Véhicule introuvable.');
    if (v.reviewStatus !== 'APPROVED') throw new DomainError('VEHICLE_NOT_ELIGIBLE', 'Ce véhicule n’est pas encore approuvé.');
    if (v.insuranceExpiry < tripDay) throw new DomainError('VEHICLE_NOT_ELIGIBLE', 'L’assurance du véhicule est expirée à la date du trajet.', { field: 'insuranceExpiry' });
    if (v.inspectionExpiry < tripDay) throw new DomainError('VEHICLE_NOT_ELIGIBLE', 'La visite technique du véhicule est expirée à la date du trajet.', { field: 'inspectionExpiry' });
    if (input.seats > v.seatsTotal - 1) throw new DomainError('VALIDATION_ERROR', `Au plus ${v.seatsTotal - 1} places passagers pour ce véhicule.`, { max: v.seatsTotal - 1 });
    validateSeatPrice(input.seatPrice, DEFAULT_FEE_POLICY);

    const id = await this.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(trips)
        .values({
          driverId: user.id,
          vehicleId: v.id,
          originCity: input.originCity,
          destinationCity: input.destinationCity,
          departureAt,
          estimatedDurationMin: estimatedDurationMin(input.originCity, input.destinationCity),
          meetingPoint: input.meetingPoint,
          dropoffPoint: input.dropoffPoint,
          seatsTotal: input.seats,
          seatsAvailable: input.seats,
          seatPrice: input.seatPrice,
          luggage: input.luggage,
          airConditioning: input.airConditioning,
          rules: input.rules ?? [],
          status: 'PUBLISHED',
        })
        .returning({ id: trips.id });
      await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'trip.publish', entityType: 'trip', entityId: t!.id, after: { ...input } }, tx);
      // Notifie les demandes de trajet compatibles (corridor + fenêtre).
      const reqs = await tx
        .select({ id: travelRequests.id, userId: travelRequests.userId })
        .from(travelRequests)
        .where(
          and(
            eq(travelRequests.status, 'ACTIVE'),
            eq(travelRequests.notifyOnNewMatch, true),
            eq(travelRequests.originCity, input.originCity),
            eq(travelRequests.destinationCity, input.destinationCity),
            sql`${travelRequests.windowStart} - interval '2 hours' <= ${departureAt} AND ${travelRequests.windowEnd} + interval '2 hours' >= ${departureAt}`,
          ),
        );
      for (const r of reqs) {
        if (r.userId !== user.id) await this.notifications.notify(tx, r.userId, 'trip.match', { route: `${input.originCity} → ${input.destinationCity}`, tripId: t!.id }, `match:${r.id}:${t!.id}`);
      }
      return t!.id;
    });
    return this.detail(id);
  }

  async mine(userId: string) {
    const list = await this.views.tripRows(this.db, sql`t.driver_id = ${userId}`, sql`ORDER BY t.departure_at DESC LIMIT 100`);
    return { items: list.map((r) => ({ ...summarize(r), seatsTotal: r.seats_total })), nextCursor: null };
  }

  // ─── Matching des demandes passagers ───────────────────────────────────────
  async matchesFor(dbx: DbOrTx, req: typeof travelRequests.$inferSelect): Promise<MatchOutput[]> {
    const rowsList = await this.views.tripRows(
      dbx,
      sql`t.origin_city = ${req.originCity} AND t.destination_city = ${req.destinationCity} AND t.status = 'PUBLISHED' AND t.departure_at > now()
          AND t.departure_at BETWEEN ${new Date(req.windowStart.getTime() - 3 * 3_600_000)} AND ${new Date(req.windowEnd.getTime() + 3 * 3_600_000)}
          AND t.driver_id <> ${req.userId}`,
      sql`ORDER BY t.departure_at LIMIT 100`,
    );
    const byId = new Map(rowsList.map((r) => [r.id, r]));
    const candidates: MatchTrip[] = rowsList.map((r) => ({
      id: r.id,
      originCity: r.origin_city,
      destinationCity: r.destination_city,
      departureAt: new Date(r.departure_at),
      seatsAvailable: r.seats_available,
      seatPrice: r.seat_price,
      totalPerSeat: totalPerSeat(r.seat_price),
      meetingPoint: r.meeting_point,
      driverEligible: r.kyc_status === 'VERIFIED',
      status: r.status,
      driverCompletedTrips: Number(r.completed_trips),
      driverRating: r.rating === null ? null : Number(r.rating),
      driverCancellationRate: 0,
      luggageAllowed: r.luggage !== 'NONE',
      airConditioning: r.air_conditioning,
    }));
    const mr: MatchRequest = {
      originCity: req.originCity,
      destinationCity: req.destinationCity,
      windowStart: req.windowStart,
      windowEnd: req.windowEnd,
      seats: req.seats,
      maxBudgetPerSeat: req.maxBudgetPerSeat,
      preferredPickup: req.preferredPickup,
      needsLuggage: req.needsLuggage,
      wantsAirConditioning: req.wantsAirConditioning,
    };
    return rankMatches(candidates, mr).map((m) => ({ trip: summarize(byId.get(m.tripId)!), score: m.score, version: m.version, explanations: [...m.explanations] }));
  }
}
