import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePropertyDto } from './dto/create-property.dto';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { CreateRatePlanDto } from './dto/create-rate-plan.dto';
import { CreateRoomCategoryDto } from './dto/create-room-category.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { PropertyService } from './property.service';

@Controller()
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Post('properties')
  @Roles(UserRole.SUPER_ADMIN)
  createProperty(@Body() createPropertyDto: CreatePropertyDto) {
    return this.propertyService.createProperty(createPropertyDto);
  }

  @Get('properties')
  findProperties(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.propertyService.findProperties(query, user);
  }

  @Post('properties/:id/images')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', { dest: 'uploads/properties' }))
  uploadPropertyImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
    @Body() body: { caption?: string; sort_order?: string; is_primary?: string },
  ) {
    return this.propertyService.addPropertyImage(id, file, body, user);
  }

  @Post('room-categories')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createRoomCategory(@CurrentUser() user: AuthenticatedUser, @Body() createRoomCategoryDto: CreateRoomCategoryDto) {
    return this.propertyService.createRoomCategory(createRoomCategoryDto, user);
  }

  @Get('room-categories')
  findRoomCategories(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.propertyService.findRoomCategories(query, user);
  }

  @Post('room-categories/:id/images')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', { dest: 'uploads/room-categories' }))
  uploadRoomCategoryImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
    @Body() body: { caption?: string; sort_order?: string; is_primary?: string },
  ) {
    return this.propertyService.addRoomCategoryImage(id, file, body, user);
  }

  @Post('rate-plans')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createRatePlan(@CurrentUser() user: AuthenticatedUser, @Body() createRatePlanDto: CreateRatePlanDto) {
    return this.propertyService.createRatePlan(createRatePlanDto, user);
  }

  @Get('rate-plans')
  findRatePlans(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.propertyService.findRatePlans(query, user);
  }

  @Post('pricing-rules')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createPricingRule(@CurrentUser() user: AuthenticatedUser, @Body() createPricingRuleDto: CreatePricingRuleDto) {
    return this.propertyService.createPricingRule(createPricingRuleDto, user);
  }

  @Get('pricing-rules')
  findPricingRules(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.propertyService.findPricingRules(query, user);
  }

  @Put('pricing-rules/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updatePricingRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePricingRuleDto: UpdatePricingRuleDto,
  ) {
    return this.propertyService.updatePricingRule(id, updatePricingRuleDto, user);
  }

  @Delete('pricing-rules/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  removePricingRule(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.propertyService.removePricingRule(id, user);
  }
}
