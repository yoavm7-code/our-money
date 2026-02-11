import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateMortgageTrackDto } from './create-mortgage-track.dto';

export class CreateMortgageDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  bank?: string;

  @IsOptional()
  @IsNumber()
  propertyValue?: number;

  @IsNumber()
  totalAmount: number;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMortgageTrackDto)
  tracks?: CreateMortgageTrackDto[];
}
