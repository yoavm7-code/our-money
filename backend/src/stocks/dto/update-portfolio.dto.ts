import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  broker?: string;

  @IsOptional()
  @IsString()
  accountNum?: string;

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
