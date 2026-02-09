import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Controller('api/goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private goalsService: GoalsService) {}

  @Post()
  create(@HouseholdId() householdId: string, @Body() dto: CreateGoalDto) {
    return this.goalsService.create(householdId, dto);
  }

  @Get()
  findAll(@HouseholdId() householdId: string) {
    return this.goalsService.findAll(householdId);
  }

  @Get(':id')
  findOne(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.goalsService.findOne(householdId, id);
  }

  @Put(':id')
  update(@HouseholdId() householdId: string, @Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.goalsService.update(householdId, id, dto);
  }

  @Delete(':id')
  remove(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.goalsService.remove(householdId, id);
  }

  @Post(':id/ai-tips')
  async generateAiTips(@HouseholdId() householdId: string, @Param('id') id: string) {
    const goal = await this.goalsService.findOne(householdId, id);
    if (!goal) return { tips: '' };
    // Return cached tips if fresh (less than 24h)
    if (goal.aiTips && goal.aiTipsUpdatedAt) {
      const age = Date.now() - new Date(goal.aiTipsUpdatedAt).getTime();
      if (age < 24 * 60 * 60 * 1000) return { tips: goal.aiTips };
    }
    // Generate tips placeholder - will be enhanced with OpenAI
    const remaining = Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount));
    const monthsLeft = goal.targetDate ? Math.max(1, Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000))) : null;
    const perMonth = monthsLeft ? Math.ceil(remaining / monthsLeft) : null;
    let tips = '';
    if (perMonth) {
      tips = `To reach your goal of ₪${Number(goal.targetAmount).toLocaleString()}, you need to save ₪${perMonth.toLocaleString()} per month for ${monthsLeft} months.`;
    } else {
      tips = `You have ₪${remaining.toLocaleString()} remaining to reach your goal of ₪${Number(goal.targetAmount).toLocaleString()}.`;
    }
    await this.goalsService.updateAiTips(householdId, id, tips);
    return { tips };
  }
}
