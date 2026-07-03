import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiCallTraceService } from '../../common/api-call-trace/api-call-trace.service';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.constants';

export type AuthenticatedUser = {
  sub: string;
  email: string;
  role: UserRole;
  organization_id: string | null;
  property_id: string | null;
  property_ids?: string[] | null;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly apiCallTraceService: ApiCallTraceService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = await this.jwtService.verifyAsync<AuthenticatedUser>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (request.user.role === UserRole.ORG_OWNER && request.user.organization_id) {
      const properties = await this.prisma.property.findMany({
        where: { organizationId: request.user.organization_id },
        select: { id: true },
      });
      request.user.property_ids = properties.map((property) => property.id);
    }

    this.apiCallTraceService.attachAuthenticatedUser({
      userId: request.user.sub,
      userEmail: request.user.email,
      userRole: request.user.role,
      propertyId: request.user.property_id,
      propertyIds: request.user.property_ids,
    });

    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const hasRole = allowedRoles?.includes(request.user.role);
    const hasPlatformOwnerOverride =
      request.user.role === UserRole.PLATFORM_OWNER && allowedRoles?.includes(UserRole.SUPER_ADMIN);
    const hasOrgOwnerOverride =
      request.user.role === UserRole.ORG_OWNER && allowedRoles?.includes(UserRole.SUPER_ADMIN);

    if (allowedRoles?.length && !hasRole && !hasPlatformOwnerOverride && !hasOrgOwnerOverride) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }

  private extractToken(request: Request) {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
