import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateMortgageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  bank?: string;

  @IsOptional()
  @IsNumber()
  propertyValue?: number;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsNumber()
  remainingAmount?: number;

  @IsOptional()
  @IsNumber()
  totalMonthly?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
