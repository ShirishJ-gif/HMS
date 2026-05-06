import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { CollectReservationGroupPaymentDto } from './dto/collect-reservation-group-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.paymentService.findAll(query, user);
  }

  @Post('collect')
  collect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CollectPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentService.collect(dto, user, idempotencyKey);
  }

  @Post('collect-reservation-group')
  collectReservationGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CollectReservationGroupPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentService.collectReservationGroup(dto, user, idempotencyKey);
  }

  @Post(':id/refund')
  refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentService.refund(id, dto, user, idempotencyKey);
  }
}
