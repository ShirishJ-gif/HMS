import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateGuestDto {
  @IsUUID()
  property_id: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsString()
  @MaxLength(120)
  id_proof: string;

  @IsString()
  @MaxLength(1000)
  address: string;
}
