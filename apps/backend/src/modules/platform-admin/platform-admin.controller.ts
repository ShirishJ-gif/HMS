import { Controller, Delete, Get, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformAdminService } from './platform-admin.service';

@Roles(UserRole.PLATFORM_OWNER)
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Get('health')
  getHealth() {
    return this.platformAdminService.getHealth();
  }

  @Get('properties')
  getProperties() {
    return this.platformAdminService.getProperties();
  }

  @Get('integrations')
  getIntegrations() {
    return this.platformAdminService.getIntegrations();
  }

  @Get('users')
  getUsers() {
    return this.platformAdminService.getUsers();
  }

  @Get('system-logs')
  getSystemLogs() {
    return this.platformAdminService.getSystemLogs();
  }

  @Get('properties/:id')
  getProperty(@Param('id') id: string) {
    return this.platformAdminService.getProperty(id);
  }

  @Delete('properties/:id')
  deleteProperty(@Param('id') id: string) {
    return this.platformAdminService.deleteProperty(id);
  }

  @Delete('users/:id')
  deleteUser(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.platformAdminService.deleteUser(id, user);
  }
}
