import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ChannelService } from './channel.service';
import { ActivateChannelPropertyDto } from './dto/activate-channel-property.dto';
import { CreateTestReservationDto } from './dto/create-test-reservation.dto';
import { CreateChannelConnectionDto } from './dto/create-channel-connection.dto';
import { CreateChannelRateMappingDto } from './dto/create-channel-rate-mapping.dto';
import { CreateChannelRoomMappingDto } from './dto/create-channel-room-mapping.dto';
import { SaveChannelMappingsBatchDto } from './dto/save-channel-mappings-batch.dto';
import { SetupZodomusChannelDto } from './dto/setup-zodomus-channel.dto';
import { SyncChannelDto } from './dto/sync-channel.dto';
import { UpdateChannelAutomationDto } from './dto/update-channel-automation.dto';

@Controller('channels')
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createConnection(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateChannelConnectionDto) {
    return this.channelService.createConnection(dto, user);
  }

  @Get()
  findConnections(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.channelService.findConnections(query, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  deleteConnection(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.deleteConnection(id, user);
  }

  @Post('zodomus/setup')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  setupZodomusConnection(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetupZodomusChannelDto) {
    return this.channelService.setupZodomusConnection(dto, user);
  }

  @Post(':id/pause')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  pauseConnection(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.pauseConnection(id, user);
  }

  @Post(':id/resume')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  resumeConnection(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.resumeConnection(id, user);
  }

  @Post(':id/disconnect')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  disconnectConnection(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.disconnectConnection(id, user);
  }

  @Post(':id/automation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateAutomation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChannelAutomationDto,
  ) {
    return this.channelService.updateAutomation(id, dto, user);
  }

  @Get(':id/provider-catalog')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  fetchProviderCatalog(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.fetchProviderCatalog(id, user);
  }

  @Get(':id/provider-account')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getProviderAccount(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.getProviderAccount(id, user);
  }

  @Get(':id/provider-channels')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getProviderChannels(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.getProviderChannels(id, user);
  }

  @Get(':id/provider-currencies')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getProviderCurrencies(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.getProviderCurrencies(id, user);
  }

  @Get(':id/provider-price-models')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getProviderPriceModels(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.getProviderPriceModels(id, user);
  }

  @Post(':id/property-check')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  checkProviderProperty(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.checkProviderProperty(id, user);
  }

  @Post(':id/property-activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  activateProviderProperty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivateChannelPropertyDto,
  ) {
    return this.channelService.activateProviderProperty(id, dto.price_model_id, user);
  }

  @Post(':id/rooms-activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  activateProviderRooms(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.activateProviderRooms(id, user);
  }

  @Get(':id/provider-reservations-queue')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getProviderReservationsQueue(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.getProviderReservationsQueue(id, user);
  }

  @Get(':id/provider-reservations-summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getProviderReservationsSummary(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.getProviderReservationsSummary(id, user);
  }

  @Get(':id/provider-reservations/:reservationId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getProviderReservation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reservationId') reservationId: string,
  ) {
    return this.channelService.getProviderReservation(id, reservationId, user);
  }

  @Post(':id/provider-reservations-create-test')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createProviderTestReservation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTestReservationDto,
  ) {
    return this.channelService.createProviderTestReservation(id, dto.status, dto.reservation_id, user);
  }

  @Post(':id/room-mappings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createRoomMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChannelRoomMappingDto,
  ) {
    return this.channelService.createRoomMapping(id, dto, user);
  }

  @Post(':id/rate-mappings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createRateMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChannelRateMappingDto,
  ) {
    return this.channelService.createRateMapping(id, dto, user);
  }

  @Post(':id/mappings/batch')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  saveMappingsBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveChannelMappingsBatchDto,
  ) {
    return this.channelService.saveMappingsBatch(id, dto, user);
  }

  @Post(':id/sync')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SyncChannelDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.channelService.sync(id, dto, user, idempotencyKey);
  }

  @Post(':id/reservations-summary-backfill')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  backfillReservationsSummary(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.backfillReservationsSummary(id, user);
  }

  @Get(':id/sync-logs')
  findSyncLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.channelService.findSyncLogs(id, query, user);
  }

  @Get(':id/inventory-reconciliation')
  findInventoryReconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.channelService.findInventoryReconciliation(id, user);
  }

  @Get(':id/inventory-row-results')
  findInventoryRowResults(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.channelService.findInventoryRowResults(id, user);
  }

  @Post(':id/sync-logs/:syncLogId/retry-failed-rows')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  retryFailedInventoryRows(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('syncLogId', ParseUUIDPipe) syncLogId: string,
  ) {
    return this.channelService.retryFailedInventoryRows(id, syncLogId, user);
  }
}
