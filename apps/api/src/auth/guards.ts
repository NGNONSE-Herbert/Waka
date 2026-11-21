import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { unauthenticated } from '../common/errors.js';
import { ADMIN_COOKIE, AuthService, USER_COOKIE } from './auth.service.js';

/** Session utilisateur (cookie `waka_session`) obligatoire. */
@Injectable()
export class UserGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = await this.auth.resolveUserSession(req.cookies?.[USER_COOKIE] as string | undefined);
    if (!user) throw unauthenticated();
    req.user = user;
    return true;
  }
}

/** Session staff (cookie `waka_admin`) avec MFA validée obligatoire. Les permissions sont vérifiées par action. */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const staff = await this.auth.resolveStaffSession(req.cookies?.[ADMIN_COOKIE] as string | undefined);
    if (!staff) throw unauthenticated();
    req.staff = staff;
    return true;
  }
}
