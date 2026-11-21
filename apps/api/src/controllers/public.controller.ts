import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AppealInput,
  CancelInput,
  CheckInInput,
  CreateBookingInput,
  CreateTravelRequestInput,
  CreateTripInput,
  DriverOnboardingInput,
  EvidenceInput,
  InitiatePaymentInput,
  OpenDisputeInput,
  OtpStartInput,
  OtpVerifyInput,
  ReviewInput,
  TripSearchQuery,
  VehicleInput,
} from '@waka/contracts';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/client.js';
import { AuthService, USER_COOKIE } from '../auth/auth.service.js';
import { UserGuard } from '../auth/guards.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { type AuthUser, CurrentUser, parse, requireIdempotencyKey } from '../common/http.js';
import { CONFIG, DATABASE } from '../common/tokens.js';
import { DisputesService } from '../disputes/disputes.service.js';
import { DriverService } from '../driver/driver.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { TripsService } from '../trips/trips.service.js';

export function cookieOptions(config: AppConfig, maxAgeMs: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: config.isProduction, path: '/', maxAge: maxAgeMs };
}
const ip = (req: Request) => req.ip ?? 'unknown';

@ApiTags('système')
@Controller('v1')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'État de santé (base de données, prestataire de paiement)' })
  async health(@Res({ passthrough: true }) res: Response) {
    let db: 'up' | 'down' = 'up';
    try {
      await this.database.db.execute(sql`SELECT 1`);
    } catch {
      db = 'down';
      res.status(503);
    }
    const p = this.payments.provider;
    return { status: db === 'up' ? 'ok' : 'degraded', db, provider: { id: p.id, mode: p.mode }, time: new Date().toISOString() };
  }
}

@ApiTags('authentification')
@Controller('v1')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DriverService) private readonly driver: DriverService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('auth/otp/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Démarre une vérification OTP (SMS simulé ; devCode hors production)' })
  start(@Body() body: unknown, @Req() req: Request) {
    const input = parse(OtpStartInput, body);
    return this.auth.startOtp(input.phone, ip(req));
  }

  @Post('auth/otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vérifie le code OTP, crée la session (cookie waka_session)' })
  async verify(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(OtpVerifyInput, body);
    const r = await this.auth.verifyOtp(input, ip(req));
    res.cookie(USER_COOKIE, r.token, cookieOptions(this.config, r.expiresAt.getTime() - Date.now()));
    const user = await this.auth.resolveUserSession(r.token);
    return { user: await this.driver.me(user!), isNewUser: r.created };
  }

  @Post('auth/logout')
  @HttpCode(200)
  @UseGuards(UserGuard)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeSession(user.sessionId);
    res.clearCookie(USER_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(UserGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.driver.me(user);
  }
}

@ApiTags('trajets')
@Controller('v1')
export class TripsController {
  constructor(
    @Inject(TripsService) private readonly trips: TripsService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
  ) {}

  @Get('cities')
  cities() {
    return this.trips.cities();
  }

  @Get('trips')
  @ApiOperation({ summary: 'Recherche de trajets publiés à venir (pagination par curseur ; prix frais inclus calculé serveur)' })
  search(@Query() query: Record<string, unknown>) {
    return this.trips.search(parse(TripSearchQuery, query));
  }

  @Get('trips/:id')
  detail(@Param('id') id: string) {
    return this.trips.detail(id);
  }

  @Post('trips')
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Publication d’un trajet (conducteur vérifié + véhicule approuvé et en règle)' })
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.trips.create(user, parse(CreateTripInput, body));
  }

  @Post('trips/:id/cancel')
  @HttpCode(200)
  @UseGuards(UserGuard)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.bookings.cancelTrip(id, user, parse(CancelInput, body).reason);
  }

  @Get('me/trips')
  @UseGuards(UserGuard)
  mine(@CurrentUser() user: AuthUser) {
    return this.trips.mine(user.id);
  }

  @Post('trips/:id/start')
  @HttpCode(200)
  @UseGuards(UserGuard)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.startTrip(id, user);
  }

  @Post('trips/:id/arrival')
  @HttpCode(200)
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Arrivée déclarée par le conducteur — ne libère JAMAIS les fonds' })
  arrival(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.reportArrival(id, user);
  }

  @Get('trips/:id/bookings')
  @UseGuards(UserGuard)
  tripBookings(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.tripBookings(id, user.id);
  }
}

@ApiTags('conducteur')
@Controller('v1')
@UseGuards(UserGuard)
export class DriverController {
  constructor(@Inject(DriverService) private readonly driver: DriverService) {}

  @Post('driver/onboarding')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soumission du dossier conducteur (statut PENDING_REVIEW, revue humaine obligatoire)' })
  onboarding(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.driver.onboarding(user, parse(DriverOnboardingInput, body));
  }

  @Post('driver/vehicles')
  vehicles(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.driver.addVehicle(user, parse(VehicleInput, body));
  }

  @Get('driver/earnings')
  earnings(@CurrentUser() user: AuthUser) {
    return this.driver.earnings(user);
  }

  @Post('travel-requests')
  createRequest(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.driver.createRequest(user, parse(CreateTravelRequestInput, body));
  }

  @Get('me/travel-requests')
  myRequests(@CurrentUser() user: AuthUser) {
    return this.driver.myRequests(user);
  }

  @Get('travel-requests/:id/matches')
  matches(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.driver.requestMatches(user, id);
  }

  @Delete('travel-requests/:id')
  cancelRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.driver.cancelRequest(user, id);
  }
}

@ApiTags('réservations')
@Controller('v1')
@UseGuards(UserGuard)
export class BookingsController {
  constructor(
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(DisputesService) private readonly disputes: DisputesService,
  ) {}

  @Post('bookings')
  @ApiOperation({ summary: 'Réserve des places (hold atomique). En-tête Idempotency-Key obligatoire. Prix calculé serveur.' })
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const key = requireIdempotencyKey(req);
    const r = await this.bookings.create(user, parse(CreateBookingInput, body), key);
    res.status(r.status);
    return r.body;
  }

  @Get('me/bookings')
  mine(@CurrentUser() user: AuthUser) {
    return this.bookings.mine(user.id);
  }

  @Get('bookings/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.detail(id, user.id);
  }

  @Post('bookings/:id/payments')
  @ApiOperation({ summary: 'Initie l’encaissement chez le PSP (Idempotency-Key obligatoire). Confirmation uniquement par webhook vérifié.' })
  async pay(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const key = requireIdempotencyKey(req);
    await this.bookings.loadForParticipant(id, user.id);
    return this.payments.initiate(user.id, id, parse(InitiatePaymentInput, body), key);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.bookings.cancelByPassenger(id, user, parse(CancelInput, body).reason);
  }

  @Post('bookings/:id/check-in')
  @HttpCode(200)
  checkIn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.bookings.checkIn(id, user, parse(CheckInInput, body).pin);
  }

  @Post('bookings/:id/confirm-completion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmation explicite du passager ⇒ demande de versement unique au PSP' })
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.confirmCompletion(id, user);
  }

  @Post('bookings/:id/disputes')
  openDispute(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.open(user, id, parse(OpenDisputeInput, body));
  }

  @Post('bookings/:id/reviews')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.bookings.review(id, user, parse(ReviewInput, body));
  }

  @Get('disputes/:id')
  dispute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disputes.detail(user, id);
  }

  @Post('disputes/:id/evidence')
  evidence(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.addEvidence(user, id, parse(EvidenceInput, body));
  }

  @Post('disputes/:id/appeal')
  @HttpCode(200)
  appeal(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.appeal(user, id, parse(AppealInput, body).reason);
  }
}
