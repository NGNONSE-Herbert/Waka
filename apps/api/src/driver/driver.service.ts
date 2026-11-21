import { Inject, Injectable } from '@nestjs/common';
import type { Me } from '@waka/contracts';
import { DomainError, maskPhone, PAYMENT_STATE_LABEL_FR, type PaymentState } from '@waka/domain';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import { type Database, rows } from '../db/client.js';
import { driverProfiles, travelRequests, userRoles, users, vehicles } from '../db/schema.js';
import { AuditService } from '../common/audit.service.js';
import { hmacSha256, sha256 } from '../common/crypto.js';
import { type AuthUser, doualaDay } from '../common/http.js';
import { CONFIG, DATABASE } from '../common/tokens.js';
import { TripsService } from '../trips/trips.service.js';

export const normalizePlate = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const maskPlate = (p: string) => `${p.slice(0, 2)} ••• ${p.slice(-2)}`;
export const plateHash = (p: string) => sha256(`plate:${normalizePlate(p)}`);

@Injectable()
export class DriverService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TripsService) private readonly trips: TripsService,
  ) {}

  private get db() {
    return this.database.db;
  }

  async me(user: AuthUser): Promise<Me> {
    const [u] = await this.db.select().from(users).where(eq(users.id, user.id));
    const [dp] = await this.db.select({ kycStatus: driverProfiles.kycStatus }).from(driverProfiles).where(eq(driverProfiles.userId, user.id));
    const vs = await this.db.select().from(vehicles).where(eq(vehicles.ownerId, user.id)).orderBy(desc(vehicles.createdAt));
    const driverStatus = (dp?.kycStatus ?? 'NONE') as Me['driverStatus'];
    const today = doualaDay(new Date());
    const eligibleVehicle = vs.some((v) => v.reviewStatus === 'APPROVED' && v.insuranceExpiry >= today && v.inspectionExpiry >= today);
    return {
      id: user.id,
      displayName: u?.displayName ?? user.displayName,
      maskedPhone: maskPhone(user.phoneE164),
      locale: (u?.locale ?? 'fr') as Me['locale'],
      roles: user.roles,
      driverStatus,
      canPublishTrips: user.roles.includes('DRIVER') && driverStatus === 'VERIFIED' && eligibleVehicle,
      vehicles: vs.map((v) => this.vehicleView(v)),
    };
  }

  vehicleView(v: typeof vehicles.$inferSelect) {
    return {
      id: v.id,
      label: `${v.make} ${v.model} · ${v.color} · ${v.plateMasked}`,
      seatsTotal: v.seatsTotal,
      reviewStatus: v.reviewStatus as 'PENDING' | 'APPROVED' | 'REJECTED',
      insuranceExpiry: v.insuranceExpiry,
    };
  }

  /** Soumission du dossier conducteur : statut PENDING_REVIEW. Le client ne peut jamais se déclarer vérifié. */
  async onboarding(user: AuthUser, input: { fullName: string; licenseNumber: string; licenseExpiry: string; idDocumentType: string; idDocumentUploadRef: string }): Promise<Me> {
    if (input.licenseExpiry <= doualaDay(new Date())) throw new DomainError('VALIDATION_ERROR', 'Le permis de conduire est expiré.');
    await this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(driverProfiles).where(eq(driverProfiles.userId, user.id)).for('update');
      if (existing && ['VERIFIED', 'SUSPENDED'].includes(existing.kycStatus)) {
        throw new DomainError('INVALID_TRANSITION', existing.kycStatus === 'VERIFIED' ? 'Votre profil conducteur est déjà vérifié.' : 'Profil suspendu : contactez le support.');
      }
      const values = {
        kycStatus: 'PENDING_REVIEW',
        fullName: input.fullName,
        licenseNumberHash: hmacSha256(this.config.appSecret, `license:${input.licenseNumber.toUpperCase()}`),
        licenseExpiry: input.licenseExpiry,
        idDocumentType: input.idDocumentType,
        idDocumentRef: input.idDocumentUploadRef,
        declaresPrivateCarpoolOnly: true,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
        reviewReason: null,
      };
      if (existing) await tx.update(driverProfiles).set(values).where(eq(driverProfiles.userId, user.id));
      else await tx.insert(driverProfiles).values({ userId: user.id, ...values });
      await tx.insert(userRoles).values({ userId: user.id, role: 'DRIVER' }).onConflictDoNothing();
      await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'driver.onboarding_submitted', entityType: 'driver_profile', entityId: user.id, after: { kycStatus: 'PENDING_REVIEW' } }, tx);
    });
    return this.me({ ...user, roles: user.roles.includes('DRIVER') ? user.roles : [...user.roles, 'DRIVER'] });
  }

  async addVehicle(user: AuthUser, input: { make: string; model: string; color: string; plate: string; year: number; seatsTotal: number; insuranceExpiry: string; inspectionExpiry: string }) {
    const [dp] = await this.db.select().from(driverProfiles).where(eq(driverProfiles.userId, user.id));
    if (!dp) throw new DomainError('DRIVER_NOT_ELIGIBLE', 'Complétez d’abord votre profil conducteur.');
    const plate = normalizePlate(input.plate);
    if (plate.length < 5) throw new DomainError('VALIDATION_ERROR', 'Immatriculation invalide.');
    const inserted = await this.db
      .insert(vehicles)
      .values({
        ownerId: user.id,
        plateHash: plateHash(plate),
        plateMasked: maskPlate(plate),
        make: input.make,
        model: input.model,
        color: input.color,
        year: input.year,
        seatsTotal: input.seatsTotal,
        insuranceExpiry: input.insuranceExpiry,
        inspectionExpiry: input.inspectionExpiry,
        reviewStatus: 'PENDING',
      })
      .onConflictDoNothing({ target: vehicles.plateHash })
      .returning();
    if (!inserted[0]) throw new DomainError('VALIDATION_ERROR', 'Ce véhicule est déjà enregistré.');
    await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'vehicle.submitted', entityType: 'vehicle', entityId: inserted[0].id });
    return this.vehicleView(inserted[0]);
  }

  /** Gains : montants par état PSP — jamais présentés comme « versés » avant confirmation PSP. */
  async earnings(user: AuthUser) {
    const list = await rows<{ booking_id: string; origin: string; destination: string; departure_at: Date; amount: number; state: PaymentState; updated_at: Date; paid: number }>(
      this.db,
      sql`SELECT b.id AS booking_id, t.origin_city AS origin, t.destination_city AS destination, t.departure_at, b.driver_amount AS amount, p.state, p.updated_at,
                 COALESCE((SELECT SUM(po.amount) FROM payouts po WHERE po.booking_id = b.id AND po.status = 'SUCCEEDED'), 0)::int AS paid
          FROM bookings b JOIN trips t ON t.id = b.trip_id JOIN payments p ON p.booking_id = b.id
          WHERE t.driver_id = ${user.id} AND p.state NOT IN ('CREATED', 'PSP_PENDING', 'FAILED')
          ORDER BY p.updated_at DESC LIMIT 200`,
    );
    const sum = (states: PaymentState[]) => list.filter((x) => states.includes(x.state)).reduce((s, x) => s + x.amount, 0);
    return {
      currency: 'XAF' as const,
      heldByPartner: sum(['PSP_CONFIRMED_HELD', 'RELEASE_ELIGIBLE']),
      releaseRequested: sum(['RELEASE_REQUESTED', 'PAYOUT_PROCESSING']),
      paid: list.reduce((s, x) => s + Number(x.paid), 0),
      frozenByDispute: sum(['FROZEN_DISPUTE']),
      items: list.map((x) => ({
        bookingId: x.booking_id,
        tripLabel: `${x.origin} → ${x.destination} · ${doualaDay(new Date(x.departure_at))}`,
        amount: x.state === 'PAID' ? Number(x.paid) : x.amount,
        paymentState: x.state,
        label: PAYMENT_STATE_LABEL_FR[x.state],
        updatedAt: new Date(x.updated_at).toISOString(),
      })),
    };
  }

  // ─── Demandes de trajet passager ────────────────────────────────────────────
  private async requestView(r: typeof travelRequests.$inferSelect) {
    const matches = r.status === 'ACTIVE' ? await this.trips.matchesFor(this.db, r) : [];
    return {
      id: r.id,
      originCity: r.originCity as never,
      destinationCity: r.destinationCity as never,
      windowStart: r.windowStart.toISOString(),
      windowEnd: r.windowEnd.toISOString(),
      seats: r.seats,
      maxBudgetPerSeat: r.maxBudgetPerSeat,
      preferredPickup: r.preferredPickup,
      status: (r.status === 'ACTIVE' && r.windowEnd < new Date() ? 'EXPIRED' : r.status) as 'ACTIVE' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED',
      matchCount: matches.length,
    };
  }

  async createRequest(user: AuthUser, input: { originCity: string; destinationCity: string; windowStart: string; windowEnd: string; seats: number; maxBudgetPerSeat: number | null; preferredPickup: string | null; needsLuggage: boolean; wantsAirConditioning: boolean; notifyOnNewMatch: boolean }) {
    const windowEnd = new Date(input.windowEnd);
    if (windowEnd.getTime() <= Date.now()) throw new DomainError('VALIDATION_ERROR', 'La fenêtre horaire est déjà passée.');
    const [r] = await this.db
      .insert(travelRequests)
      .values({ ...input, userId: user.id, windowStart: new Date(input.windowStart), windowEnd })
      .returning();
    return this.requestView(r!);
  }

  async myRequests(user: AuthUser) {
    const list = await this.db.select().from(travelRequests).where(eq(travelRequests.userId, user.id)).orderBy(desc(travelRequests.createdAt)).limit(50);
    const items = [];
    for (const r of list) items.push(await this.requestView(r));
    return { items, nextCursor: null };
  }

  private async ownRequest(user: AuthUser, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError('NOT_FOUND', 'Demande introuvable.');
    const [r] = await this.db.select().from(travelRequests).where(and(eq(travelRequests.id, id), eq(travelRequests.userId, user.id)));
    if (!r) throw new DomainError('NOT_FOUND', 'Demande introuvable.');
    return r;
  }

  async requestMatches(user: AuthUser, id: string) {
    const r = await this.ownRequest(user, id);
    return { items: await this.trips.matchesFor(this.db, r), nextCursor: null };
  }

  async cancelRequest(user: AuthUser, id: string) {
    const r = await this.ownRequest(user, id);
    const [u] = await this.db.update(travelRequests).set({ status: 'CANCELLED' }).where(eq(travelRequests.id, r.id)).returning();
    return this.requestView(u!);
  }
}
