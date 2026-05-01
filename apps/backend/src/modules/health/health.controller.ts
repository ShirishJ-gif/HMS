import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'hms-backend',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
