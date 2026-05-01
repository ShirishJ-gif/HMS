import { HousekeepingPriority, HousekeepingStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateHousekeepingTaskDto {
  @IsUUID()
  property_id: string;

  @IsUUID()
  room_id: string;

  @IsOptional()
  @IsEnum(HousekeepingStatus)
  status?: HousekeepingStatus;

  @IsOptional()
  @IsEnum(HousekeepingPriority)
  priority?: HousekeepingPriority;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;
}
