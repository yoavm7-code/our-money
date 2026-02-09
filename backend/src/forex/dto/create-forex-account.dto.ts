import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateForexAccountDto {
  @IsString()
  name: string;

  @IsString()
  currency: string;

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  accountNum?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
