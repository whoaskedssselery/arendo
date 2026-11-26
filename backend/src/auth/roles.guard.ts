import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthRequest, Role } from './auth.types';

export const AllowedRoles = Reflector.createDecorator<readonly Role[]>();

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride(AllowedRoles, [context.getHandler(), context.getClass()]);
    if (!roles) return true;

    const session = context.switchToHttp().getRequest<AuthRequest>().auth;
    if (!session) throw new UnauthorizedException('A bearer access token is required.');
    return roles.includes(session.user.role);
  }
}
