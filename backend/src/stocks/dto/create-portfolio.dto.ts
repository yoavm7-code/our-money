import { IsOptional, IsString } from 'class-validator';

export class CreatePortfolioDto {
  @IsString()
  name: string;

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
}
