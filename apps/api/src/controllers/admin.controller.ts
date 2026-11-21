import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AdminLoginInput,
  AdminMfaInput,
  AssignInput,
  CloseDisputeInput,
  DisputeDecisionInput,
  KycDecisionInput,
  MockPspCompleteInput,
  RejectDecisionInput,
  RequestEvidenceInput,
  RunReconciliationInput,
  TriageInput,
} from '@waka/contracts';
import { DomainError } from '@waka/domain';
import type { Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import { AdminService } from '../admin/admin.service.js';
import { ADMIN_COOKIE, AuthService } from '../auth/auth.service.js';
import { StaffGuard } from '../auth/guards.js';
import { type AuthStaff, CurrentStaff, parse, RateLimiter } from '../common/http.js';
import { CONFIG } from '../common/tokens.js';
import { DisputesService } from '../disputes/disputes.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { cookieOptions } from './public.controller.js';

const ip = (req: Request) => req.ip ?? 'unknown';

@ApiTags('webhooks')
@Controller('v1/webhooks')
export class WebhooksController {
  private readonly limiter = new RateLimiter();
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post('payments/:provider')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook PSP : signature HMAC sur le corps brut, anti-rejeu, re-vérification du statut chez le PSP' })
  async receive(@Param('provider') provider: string, @Req() req: Request) {
    this.limiter.hit(`webhook:${ip(req)}`, 600, 60_000);
    const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
    return this.payments.handleWebhook(provider, raw, headers);
  }
}

/** Simulateur de PSP — MOCK et hors production uniquement (le module n'est pas monté sinon). */
@ApiTags('développement (MOCK)')
@Controller('v1/dev')
export class DevController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post('mock-psp/:providerRef/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'MOCK : fait aboutir (ou échouer) une transaction simulée et livre le webhook signé' })
  complete(@Param('providerRef') ref: string, @Body() body: unknown) {
    if (!/^MOCK-[A-Z]{3}-[0-9A-F]{12}$/.test(ref)) throw new DomainError('NOT_FOUND', 'Transaction simulée introuvable.');
    return this.payments.mockComplete(ref, parse(MockPspCompleteInput, body).outcome);
  }
}

@ApiTags('admin — authentification')
@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Étape 1 : e-mail + mot de passe ⇒ défi MFA (devTotp hors production uniquement)' })
  login(@Body() body: unknown, @Req() req: Request) {
    const input = parse(AdminLoginInput, body);
    return this.auth.adminLogin(input.email, input.password, ip(req));
  }

  @Post('mfa')
  @HttpCode(200)
  @ApiOperation({ summary: 'Étape 2 : code TOTP ⇒ session waka_admin (MFA vérifiée)' })
  async mfa(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(AdminMfaInput, body);
    const r = await this.auth.adminMfa(input.challengeId, input.totp, ip(req));
    res.cookie(ADMIN_COOKIE, r.token, cookieOptions(this.config, r.expiresAt.getTime() - Date.now()));
    return { id: r.staff.id, email: r.staff.email, displayName: r.staff.displayName, roles: r.staff.roles, permissions: this.auth.staffPermissions(r.staff.roles as never), mfaVerified: true };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  async logout(@CurrentStaff() staff: AuthStaff, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeSession(staff.sessionId);
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    return { ok: true };
  }
}

@ApiTags('admin')
@Controller('v1/admin')
@UseGuards(StaffGuard)
export class AdminController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject(DisputesService) private readonly disputes: DisputesService,
  ) {}

  @Get('me')
  me(@CurrentStaff() s: AuthStaff) {
    return { id: s.id, email: s.email, displayName: s.displayName, roles: s.roles, permissions: this.auth.staffPermissions(s.roles), mfaVerified: s.mfaVerified };
  }

  @Get('dashboard')
  dashboard(@CurrentStaff() s: AuthStaff) {
    return this.admin.dashboard(s);
  }

  @Get('kyc')
  kyc(@CurrentStaff() s: AuthStaff) {
    return this.admin.kycQueue(s);
  }

  @Post('kyc/drivers/:id/decision')
  @HttpCode(200)
  driverDecision(@CurrentStaff() s: AuthStaff, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.decideDriver(s, id, parse(KycDecisionInput, body));
  }

  @Post('kyc/vehicles/:id/decision')
  @HttpCode(200)
  vehicleDecision(@CurrentStaff() s: AuthStaff, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.decideVehicle(s, id, parse(KycDecisionInput, body));
  }

  @Get('disputes')
  disputesList(@CurrentStaff() s: AuthStaff, @Query('state') state?: string, @Query('priority') priority?: string) {
    return this.disputes.adminList(s, { state, priority });
  }

  @Get('disputes/:id')
  dispute(@CurrentStaff() s: AuthStaff, @Param('id') id: string) {
    return this.disputes.adminDetail(s, id);
  }

  @Post('disputes/:id/assign')
  @HttpCode(200)
  assign(@CurrentStaff() s: AuthStaff, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.assign(s, id, parse(AssignInput, body).assigneeId);
  }

  @Post('disputes/:id/triage')
  @HttpCode(200)
  triage(@CurrentStaff() s: AuthStaff, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.triage(s, id, parse(TriageInput, body).priority);
  }

  @Post('disputes/:id/request-evidence')
  @HttpCode(200)
  requestEvidence(@CurrentStaff() s: AuthStaff, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.requestEvidence(s, id, parse(RequestEvidenceInput, body));
  }

  @Post('disputes/:id/start-review')
  @HttpCode(200)
  startReview(@CurrentStaff() s: AuthStaff, @Param('id') id: string) {
    return this.disputes.startReview(s, id);
  }

  @Post('disputes/:id/decision')
  @HttpCode(200)
  @ApiOperation({ summary: 'Proposition de décision (DISPUTE_MANAGER) — allocation validée par le domaine' })
  propose(@CurrentStaff() s: AuthStaff, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.propose(s, id, parse(DisputeDecisionInput, body));
  }

  @Post('disputes/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approbation par une AUTRE personne (DISPUTE_MANAGER ou FINANCE) puis instruction PSP' })
  approve(@CurrentStaff() s: AuthStaff, @Param('id') id: string) {
    return this.disputes.approve(s, id);
  }

  @Post('disputes/:id/reject')
  @HttpCode(200)
  reject(@CurrentStaff() s: AuthStaff, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.reject(s, id, parse(RejectDecisionInput, body).reason);
  }

  @Post('disputes/:id/close')
  @HttpCode(200)
  close(@CurrentStaff() s: AuthStaff, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.close(s, id, parse(CloseDisputeInput, body).reason);
  }

  @Get('payments')
  payments(@CurrentStaff() s: AuthStaff, @Query('state') state?: string) {
    return this.admin.paymentsList(s, { state });
  }

  @Get('finance/ledger')
  ledger(@CurrentStaff() s: AuthStaff) {
    return this.admin.ledgerView(s);
  }

  @Get('finance/reconciliation')
  reconciliation(@CurrentStaff() s: AuthStaff, @Query('day') day?: string) {
    if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new DomainError('VALIDATION_ERROR', 'Jour invalide (AAAA-MM-JJ).');
    return this.admin.reconciliation(s, day);
  }

  @Post('finance/reconciliation/run')
  @HttpCode(200)
  runReconciliation(@CurrentStaff() s: AuthStaff, @Body() body: unknown) {
    return this.admin.runReconciliation(s, parse(RunReconciliationInput, body).day);
  }

  @Get('audit')
  audit(@CurrentStaff() s: AuthStaff, @Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    return this.admin.auditList(s, { entityType, entityId });
  }

  @Get('policies')
  policies(@CurrentStaff() s: AuthStaff) {
    return this.admin.policies(s);
  }

  @Get('staff')
  staff(@CurrentStaff() s: AuthStaff) {
    return this.admin.staffList(s);
  }
}
