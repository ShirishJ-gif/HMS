import { IsDateString, IsUUID } from 'class-validator';

export class ZodomusSyncAliasDto {
  @IsUUID()
  connection_id: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
