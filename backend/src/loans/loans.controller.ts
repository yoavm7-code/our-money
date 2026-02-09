import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';

@Controller('api/loans')
@UseGuards(JwtAuthGuard)
export class LoansController {
  constructor(private loansService: LoansService) {}

  @Post()
  create(@HouseholdId() householdId: string, @Body() dto: CreateLoanDto) {
    return this.loansService.create(householdId, dto);
  }

  @Get()
  findAll(@HouseholdId() householdId: string) {
    return this.loansService.findAll(householdId);
  }

  @Get(':id')
  findOne(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.loansService.findOne(householdId, id);
  }

  @Put(':id')
  update(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLoanDto,
  ) {
    return this.loansService.update(householdId, id, dto);
  }

  @Delete(':id')
  remove(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.loansService.remove(householdId, id);
  }
}
