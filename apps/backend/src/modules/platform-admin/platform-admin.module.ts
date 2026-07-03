import { Module } from '@nestjs/common';
import { ApiCallTraceModule } from '../../common/api-call-trace/api-call-trace.module';
import { PropertyModule } from '../property/property.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [ApiCallTraceModule, PropertyModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}
