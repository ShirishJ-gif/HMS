import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { PrismaService } from '../../prisma/prisma.service';
import { BootstrapUserDto } from './dto/bootstrap-user.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { PasswordService } from './password.service';
import { AuthenticatedUser } from './auth.guard';
import { assertCanCreateUser, propertyIdFilter } from './property-scope';

const refreshTokenDays = 30;
const passwordResetMinutes = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
  ) {}

  async bootstrap(dto: BootstrapUserDto) {
    const userCount = await this.prisma.user.count();

    if (userCount > 0) {
      throw new ConflictException('System already has users');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash: await this.passwordService.hash(dto.password),
        role: UserRole.SUPER_ADMIN,
      },
    });

    return this.issueToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await this.passwordService.verify(dto.password, user.passwordHash);

    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueToken(user);
  }

  async createUser(dto: CreateUserDto, currentUser?: AuthenticatedUser) {
    assertCanCreateUser(currentUser, dto);

    try {
      const user = await this.prisma.user.create({
        data: {
          propertyId: dto.property_id,
          name: dto.name,
          email: dto.email.toLowerCase(),
          passwordHash: await this.passwordService.hash(dto.password),
          role: dto.role,
        },
      });

      return this.toUserResponse(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User email already exists');
      }

      throw error;
    }
  }

  async findUsers(query: PaginationQueryDto, currentUser?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(currentUser);
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginatedResponse(users.map((user) => this.toUserResponse(user)), total, page, limit);
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueToken(session.user);
  }

  async revokeSession(user: AuthenticatedUser, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshSession.updateMany({
        where: {
          userId: user.sub,
          tokenHash: this.hashToken(refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshSession.updateMany({
        where: {
          userId: user.sub,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }

    return { revoked: true };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    if (!user || !user.isActive) {
      return { reset_requested: true };
    }

    const token = this.randomToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: this.minutesFromNow(passwordResetMinutes),
      },
    });

    return {
      reset_requested: true,
      reset_token: token,
      expires_in_minutes: passwordResetMinutes,
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    const tokenHash = this.hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid password reset token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: await this.passwordService.hash(dto.password) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { password_reset: true };
  }

  private async issueToken(user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    propertyId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      property_id: user.propertyId,
    });
    const refreshToken = this.randomToken();
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: this.daysFromNow(refreshTokenDays),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: this.toUserResponse(user),
    };
  }

  private randomToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private daysFromNow(days: number) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private minutesFromNow(minutes: number) {
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  private toUserResponse(user: {
    id: string;
    propertyId: string | null;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      property_id: user.propertyId,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.isActive,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  }
}
