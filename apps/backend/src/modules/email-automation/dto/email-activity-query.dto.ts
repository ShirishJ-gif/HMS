import { IncomingEmailStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class EmailActivityQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(IncomingEmailStatus)
  status?: IncomingEmailStatus;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  from_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsDateString()
  received_after?: string;

  @IsOptional()
  @IsUUID()
  connection_id?: string;
}
