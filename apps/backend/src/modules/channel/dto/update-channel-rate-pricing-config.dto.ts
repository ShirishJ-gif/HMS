import { IsObject } from 'class-validator';

export class UpdateChannelRatePricingConfigDto {
  @IsObject()
  pricing_config: Record<string, unknown>;
}
