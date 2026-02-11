import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateHoldingDto {
  @IsString()
  ticker: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  exchange?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsNumber()
  shares: number;

  @IsNumber()
  avgBuyPrice: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  buyDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
