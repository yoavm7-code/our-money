import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { SavingsService } from './savings.service';
import { CreateSavingDto } from './dto/create-saving.dto';
import { UpdateSavingDto } from './dto/update-saving.dto';

@Controller('api/savings')
@UseGuards(JwtAuthGuard)
export class SavingsController {
  constructor(private savingsService: SavingsService) {}

  @Post()
  create(@HouseholdId() householdId: string, @Body() dto: CreateSavingDto) {
    return this.savingsService.create(householdId, dto);
  }

  @Get()
  findAll(@HouseholdId() householdId: string) {
    return this.savingsService.findAll(householdId);
  }

  @Get(':id')
  findOne(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.savingsService.findOne(householdId, id);
  }

  @Put(':id')
  update(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSavingDto,
  ) {
    return this.savingsService.update(householdId, id, dto);
  }

  @Delete(':id')
  remove(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.savingsService.remove(householdId, id);
  }
}
