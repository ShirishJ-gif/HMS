import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { AddExtraChargeDto } from './dto/add-extra-charge.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@Controller('billings')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post()
  createInvoice(@CurrentUser() user: AuthenticatedUser, @Body() createInvoiceDto: CreateInvoiceDto) {
    return this.billingService.createInvoice(createInvoiceDto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.billingService.findAll(query, user);
  }

  @Get('reservation-groups/:id/folio')
  findReservationGroupFolio(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billingService.findReservationGroupFolio(id, user);
  }

  @Post('reservation-groups/:id/generate-missing-invoices')
  generateMissingInvoicesForReservationGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.billingService.generateMissingInvoicesForReservationGroup(id, user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billingService.findOne(id, user);
  }

  @Post(':id/extra-charges')
  addExtraCharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() addExtraChargeDto: AddExtraChargeDto,
  ) {
    return this.billingService.addExtraCharge(id, addExtraChargeDto, user);
  }

  @Put(':id/payment-status')
  updatePaymentStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePaymentStatusDto: UpdatePaymentStatusDto,
  ) {
    return this.billingService.updatePaymentStatus(id, updatePaymentStatusDto, user);
  }
}
