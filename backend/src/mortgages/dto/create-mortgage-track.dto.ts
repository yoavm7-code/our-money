import { IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateMortgageTrackDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  trackType: string;

  @IsOptional()
  @IsString()
  indexType?: string;

  @IsNumber()
  amount: number;

  @IsNumber()
  interestRate: number;

  @IsOptional()
  @IsNumber()
  monthlyPayment?: number;

  @IsOptional()
  @IsInt()
  totalPayments?: number;

  @IsOptional()
  @IsInt()
  remainingPayments?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
