import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  name: string;

  @IsEnum(['BANK', 'CREDIT_CARD', 'INSURANCE', 'PENSION', 'INVESTMENT', 'CASH'])
  type: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  @IsString()
  balanceDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  linkedBankAccountId?: string;
}
