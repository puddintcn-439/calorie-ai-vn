import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ROLES_KEY } from './admin-roles.decorator';
import type { AdminRole } from './admin.guard';

const ROLE_WEIGHT: Record<AdminRole, number> = {
  viewer: 1,
  support: 2,
  admin: 3,
  owner: 4,
};

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role = request?.admin?.role as AdminRole | undefined;

    if (!role) {
      throw new ForbiddenException('Admin role not resolved');
    }

    const currentWeight = ROLE_WEIGHT[role] ?? 0;
    const allowed = requiredRoles.some((requiredRole) => currentWeight >= (ROLE_WEIGHT[requiredRole] ?? 999));

    if (!allowed) {
      throw new ForbiddenException('Insufficient admin permissions');
    }

    return true;
  }
}
