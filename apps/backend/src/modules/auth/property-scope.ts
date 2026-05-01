import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from './auth.guard';

export function assertCanAccessProperty(user: AuthenticatedUser | undefined, propertyId: string) {
  if (!user || user.role === UserRole.SUPER_ADMIN) {
    return;
  }

  if (!user.property_id || user.property_id !== propertyId) {
    throw new ForbiddenException('You do not have access to this property');
  }
}

export function propertyIdFilter(user: AuthenticatedUser | undefined) {
  if (!user || user.role === UserRole.SUPER_ADMIN) {
    return undefined;
  }

  if (!user.property_id) {
    throw new ForbiddenException('User is not assigned to a property');
  }

  return user.property_id;
}

export function assertCanCreateUser(
  currentUser: AuthenticatedUser | undefined,
  target: { property_id?: string; role: UserRole },
) {
  if (target.role !== UserRole.SUPER_ADMIN && !target.property_id) {
    throw new ForbiddenException('Property is required for admin and staff users');
  }

  if (!currentUser || currentUser.role === UserRole.SUPER_ADMIN) {
    return;
  }

  if (target.role === UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('Only super admins can create super admins');
  }

  if (!currentUser.property_id || target.property_id !== currentUser.property_id) {
    throw new ForbiddenException('Admins can only create users for their assigned property');
  }
}
