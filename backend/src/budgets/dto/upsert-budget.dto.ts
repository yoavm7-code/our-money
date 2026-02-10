import { IsString, IsNumber, Min } from 'class-validator';

export class UpsertBudgetDto {
  @IsString()
  categoryId: string;

  @IsNumber()
  @Min(0)
  amount: number;
}
