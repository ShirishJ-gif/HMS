import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateInventoryBlockDto } from './dto/create-inventory-block.dto';
import { GetInventoryCalendarDto } from './dto/get-inventory-calendar.dto';
import { SetInventoryRestrictionsDto } from './dto/set-inventory-restrictions.dto';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('inventory-calendar')
  getInventoryCalendar(@CurrentUser() user: AuthenticatedUser, @Query() query: GetInventoryCalendarDto) {
    return this.inventoryService.getInventoryCalendar(query, user);
  }

  @Post('inventory/block')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createInventoryBlock(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInventoryBlockDto) {
    return this.inventoryService.createInventoryBlock(dto, user);
  }

  @Post('inventory/restrictions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  setInventoryRestrictions(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetInventoryRestrictionsDto) {
    return this.inventoryService.setInventoryRestrictions(dto, user);
  }
}
