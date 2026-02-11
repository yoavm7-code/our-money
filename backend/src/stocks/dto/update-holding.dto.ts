import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateHoldingDto {
  @IsOptional()
  @IsString()
  ticker?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  exchange?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsNumber()
  shares?: number;

  @IsOptional()
  @IsNumber()
  avgBuyPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  buyDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
