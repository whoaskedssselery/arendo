import { applyDecorators, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';
import type { Role } from './auth.types';
import { AllowedRoles, RolesGuard } from './roles.guard';

export function RequireRoles(...roles: [Role, ...Role[]]) {
  return applyDecorators(AllowedRoles(roles), UseGuards(AccessTokenGuard, RolesGuard));
}
