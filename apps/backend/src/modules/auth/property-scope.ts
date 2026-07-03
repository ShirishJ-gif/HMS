import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from './auth.guard';

export function assertCanAccessProperty(user: AuthenticatedUser | undefined, propertyId: string) {
  if (!user || user.role === UserRole.PLATFORM_OWNER) {
    return;
  }

  if (user.role === UserRole.ORG_OWNER && user.property_ids?.includes(propertyId)) {
    return;
  }

  if (!user.property_id || user.property_id !== propertyId) {
    throw new ForbiddenException('You do not have access to this property');
  }
}

export function propertyIdFilter(user: AuthenticatedUser | undefined) {
  if (!user || user.role === UserRole.PLATFORM_OWNER) {
    return undefined;
  }

  if (user.role === UserRole.ORG_OWNER) {
    const propertyIds = user.property_ids ?? [];
    if (propertyIds.length === 0) {
      throw new ForbiddenException('User is not assigned to any organization properties');
    }

    return { in: propertyIds };
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
  if (target.role === UserRole.PLATFORM_OWNER || target.role === UserRole.ORG_OWNER) {
    if (!currentUser || currentUser.role !== UserRole.PLATFORM_OWNER) {
      throw new ForbiddenException('Only platform owners can create platform or organization owner users');
    }

    if (target.role === UserRole.PLATFORM_OWNER && target.property_id) {
      throw new ForbiddenException('Platform owner users cannot be assigned to a property');
    }

    return;
  }

  if (target.role !== UserRole.SUPER_ADMIN && !target.property_id) {
    throw new ForbiddenException('Property is required for admin and staff users');
  }

  if (!currentUser || currentUser.role === UserRole.PLATFORM_OWNER) {
    return;
  }

  if (currentUser.role === UserRole.ORG_OWNER) {
    if (!target.property_id || !currentUser.property_ids?.includes(target.property_id)) {
      throw new ForbiddenException('Organization owners can only create users for their organization properties');
    }

    return;
  }

  if (target.role === UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('Only platform or organization owners can create super admins');
  }

  if (!currentUser.property_id || target.property_id !== currentUser.property_id) {
    throw new ForbiddenException('Admins can only create users for their assigned property');
  }
}
