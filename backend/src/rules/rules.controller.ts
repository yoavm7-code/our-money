import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { RulesService } from './rules.service';

@Controller('api/rules')
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(private rulesService: RulesService) {}

  @Get()
  findAll(@HouseholdId() householdId: string) {
    return this.rulesService.findAll(householdId);
  }

  @Post()
  create(
    @HouseholdId() householdId: string,
    @Body() dto: { categoryId: string; pattern: string; patternType?: string; priority?: number },
  ) {
    return this.rulesService.create(householdId, dto);
  }

  @Delete(':id')
  remove(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.rulesService.remove(householdId, id);
  }
}
