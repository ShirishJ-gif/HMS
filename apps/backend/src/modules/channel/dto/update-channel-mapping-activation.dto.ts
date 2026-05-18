import { IsBoolean } from 'class-validator';

export class UpdateChannelMappingActivationDto {
  @IsBoolean()
  is_activation_enabled: boolean;
}
