import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTransactionDto {
  @IsString()
  accountId: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsDateString()
  date: string;

  @IsString()
  description: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  vatAmount?: number;

  @IsOptional()
  @IsBoolean()
  isVatIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  isTaxDeductible?: boolean;

  @IsOptional()
  @IsString()
  rawText?: string;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsInt()
  installmentCurrent?: number;

  @IsOptional()
  @IsInt()
  installmentTotal?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}
