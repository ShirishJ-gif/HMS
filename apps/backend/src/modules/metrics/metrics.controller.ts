import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Res() response: Response) {
    response.send(await this.metricsService.renderPrometheus());
  }

  @Public()
  @Get('summary')
  summary() {
    return this.metricsService.getSummary();
  }
}
