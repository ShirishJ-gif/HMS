import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Roles } from './decorators/roles.decorator';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './auth.guard';
import { AuthService } from './auth.service';
import { BootstrapUserDto } from './dto/bootstrap-user.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { RevokeSessionDto } from './dto/revoke-session.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('bootstrap')
  bootstrap(@Body() bootstrapUserDto: BootstrapUserDto) {
    return this.authService.bootstrap(bootstrapUserDto);
  }

  @Public()
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RevokeSessionDto) {
    return this.authService.revokeSession(user, dto.refresh_token);
  }

  @Public()
  @Post('password-reset/request')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('users')
  createUser(@CurrentUser() user: AuthenticatedUser, @Body() createUserDto: CreateUserDto) {
    return this.authService.createUser(createUserDto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('users')
  findUsers(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.authService.findUsers(query, user);
  }
}
