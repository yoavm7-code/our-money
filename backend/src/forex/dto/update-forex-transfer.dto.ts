import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateForexTransferDto {
  @IsOptional()
  @IsString()
  forexAccountId?: string;

  @IsOptional()
  @IsEnum(['BUY', 'SELL', 'TRANSFER'])
  type?: 'BUY' | 'SELL' | 'TRANSFER';

  @IsOptional()
  @IsString()
  fromCurrency?: string;

  @IsOptional()
  @IsString()
  toCurrency?: string;

  @IsOptional()
  @IsNumber()
  fromAmount?: number;

  @IsOptional()
  @IsNumber()
  toAmount?: number;

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  fee?: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
