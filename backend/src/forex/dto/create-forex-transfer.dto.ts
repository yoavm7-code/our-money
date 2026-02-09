import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateForexTransferDto {
  @IsOptional()
  @IsString()
  forexAccountId?: string;

  @IsEnum(['BUY', 'SELL', 'TRANSFER'])
  type: 'BUY' | 'SELL' | 'TRANSFER';

  @IsString()
  fromCurrency: string;

  @IsString()
  toCurrency: string;

  @IsNumber()
  fromAmount: number;

  @IsNumber()
  toAmount: number;

  @IsNumber()
  exchangeRate: number;

  @IsOptional()
  @IsNumber()
  fee?: number;

  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
