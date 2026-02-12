import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateTransactionDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  totalAmount?: number | null;

  @IsOptional()
  @IsInt()
  installmentCurrent?: number | null;

  @IsOptional()
  @IsInt()
  installmentTotal?: number | null;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}
