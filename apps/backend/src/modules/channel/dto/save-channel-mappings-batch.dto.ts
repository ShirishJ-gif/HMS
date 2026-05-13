import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { CreateChannelRateMappingDto } from './create-channel-rate-mapping.dto';
import { CreateChannelRoomMappingDto } from './create-channel-room-mapping.dto';

export class SaveChannelMappingsBatchDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateChannelRoomMappingDto)
  room_mappings?: CreateChannelRoomMappingDto[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateChannelRateMappingDto)
  rate_mappings?: CreateChannelRateMappingDto[];
}
