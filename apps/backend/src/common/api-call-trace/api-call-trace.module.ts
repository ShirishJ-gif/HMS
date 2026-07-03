import { Module } from '@nestjs/common';
import { ApiCallTraceController } from './api-call-trace.controller';
import { ApiCallTraceService } from './api-call-trace.service';

@Module({
  controllers: [ApiCallTraceController],
  providers: [ApiCallTraceService],
  exports: [ApiCallTraceService],
})
export class ApiCallTraceModule {}
