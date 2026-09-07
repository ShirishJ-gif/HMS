import { IncomingEmailStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class EmailActivityQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(IncomingEmailStatus)
  status?: IncomingEmailStatus;

  @IsOptional()
  @IsUUID()
  connection_id?: string;
}
