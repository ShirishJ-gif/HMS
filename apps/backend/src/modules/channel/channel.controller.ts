import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ChannelService } from './channel.service';
import { ActivateChannelPropertyDto } from './dto/activate-channel-property.dto';
import { AirbnbHostCancellationDto } from './dto/airbnb-host-cancellation.dto';
import { AirbnbOauthTestDto } from './dto/airbnb-oauth-test.dto';
import { CancelChannelRoomsDto } from './dto/cancel-channel-rooms.dto';
import { CreateTestReservationDto } from './dto/create-test-reservation.dto';
import { CreateChannelConnectionDto } from './dto/create-channel-connection.dto';
import { CreateChannelRateMappingDto } from './dto/create-channel-rate-mapping.dto';
import { CreateChannelRoomMappingDto } from './dto/create-channel-room-mapping.dto';
import { GetProviderAvailabilityQueryDto } from './dto/get-provider-availability-query.dto';
import { SaveChannelMappingsBatchDto } from './dto/save-channel-mappings-batch.dto';
import { SetupZodomusChannelDto } from './dto/setup-zodomus-channel.dto';
import { SyncChannelDto } from './dto/sync-channel.dto';
import { UpdateChannelAutomationDto } from './dto/update-channel-automation.dto';
import { UpdateChannelMappingActivationDto } from './dto/update-channel-mapping-activation.dto';
import { UpdateChannelRatePricingConfigDto } from './dto/update-channel-rate-pricing-config.dto';
import { UpdateChannelRateMappingDto } from './dto/update-channel-rate-mapping.dto';
import { UpdateChannelRoomMappingDto } from './dto/update-channel-room-mapping.dto';

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

  @Post(':id/airbnb-host-activation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  activateAirbnbHost(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.activateAirbnbHost(id, user);
  }

  @Post(':id/airbnb-oauth2-tests')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  activateAirbnbOauthTest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AirbnbOauthTestDto,
  ) {
    return this.channelService.activateAirbnbOauthTest(id, dto, user);
  }

  @Get(':id/airbnb-host-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getAirbnbHostStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token?: string,
  ) {
    return this.channelService.getAirbnbHostStatus(id, token, user);
  }

  @Post(':id/airbnb-host-cancellation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  cancelAirbnbHost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AirbnbHostCancellationDto,
  ) {
    return this.channelService.cancelAirbnbHost(id, dto.token, user);
  }

  @Get(':id/airbnb-host-info')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getAirbnbHostInfo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token?: string,
  ) {
    return this.channelService.getAirbnbHostInfo(id, token, user);
  }

  @Get(':id/airbnb-listings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getAirbnbListings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token?: string,
  ) {
    return this.channelService.getAirbnbListingsWithToken(id, token, user);
  }

  @Get(':id/provider-availability')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getProviderAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetProviderAvailabilityQueryDto,
  ) {
    return this.channelService.getProviderAvailability(id, query, user);
  }

  @Post(':id/availability-multiple')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  pushProviderAvailabilityMultiple(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SyncChannelDto,
  ) {
    return this.channelService.pushProviderAvailabilityMultiple(id, dto, user);
  }

  @Post(':id/rates-multiple')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  pushProviderRatesMultiple(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SyncChannelDto,
  ) {
    return this.channelService.pushProviderRatesMultiple(id, dto, user);
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
    return this.channelService.activateProviderProperty(id, dto.price_model_id, user, dto.token);
  }

  @Post(':id/rooms-activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  activateProviderRooms(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.activateProviderRooms(id, user);
  }

  @Post(':id/rooms-cancellation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  cancelProviderRooms(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelChannelRoomsDto,
  ) {
    return this.channelService.cancelProviderRooms(id, dto, user);
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

  @Get(':id/provider-reservations/:reservationId/card')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getProviderReservationCC(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reservationId') reservationId: string,
  ) {
    return this.channelService.getProviderReservationCC(id, reservationId, user);
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

  @Patch(':id/room-mappings/:mappingId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateRoomMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
    @Body() dto: UpdateChannelRoomMappingDto,
  ) {
    return this.channelService.updateRoomMapping(id, mappingId, dto, user);
  }

  @Delete(':id/room-mappings/:mappingId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  deleteRoomMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
  ) {
    return this.channelService.deleteRoomMapping(id, mappingId, user);
  }

  @Patch(':id/rate-mappings/:mappingId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateRateMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
    @Body() dto: UpdateChannelRateMappingDto,
  ) {
    return this.channelService.updateRateMapping(id, mappingId, dto, user);
  }

  @Delete(':id/rate-mappings/:mappingId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  deleteRateMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
  ) {
    return this.channelService.deleteRateMapping(id, mappingId, user);
  }

  @Patch(':id/rate-mappings/:mappingId/pricing-config')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateRateMappingPricingConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
    @Body() dto: UpdateChannelRatePricingConfigDto,
  ) {
    return this.channelService.updateRateMappingPricingConfig(id, mappingId, dto.pricing_config, user);
  }

  @Patch(':id/room-mappings/:mappingId/activation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateRoomMappingActivation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
    @Body() dto: UpdateChannelMappingActivationDto,
  ) {
    return this.channelService.updateRoomMappingActivation(id, mappingId, dto.is_activation_enabled, user);
  }

  @Patch(':id/rate-mappings/:mappingId/activation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateRateMappingActivation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
    @Body() dto: UpdateChannelMappingActivationDto,
  ) {
    return this.channelService.updateRateMappingActivation(id, mappingId, dto.is_activation_enabled, user);
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
