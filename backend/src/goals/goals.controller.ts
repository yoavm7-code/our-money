import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GoalsService } from './goals.service';

@Controller('api/goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private goalsService: GoalsService) {}

  /**
   * POST /api/goals
   * Create a new financial goal.
   */
  @Post()
  create(
    @CurrentUser() user: { businessId: string },
    @Body() dto: {
      name: string;
      targetAmount: number;
      currentAmount?: number;
      targetDate?: string;
      icon?: string;
      color?: string;
      priority?: number;
      monthlyTarget?: number;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.goalsService.create(user.businessId, dto);
  }

  /**
   * GET /api/goals
   * List all active goals with progress calculations.
   */
  @Get()
  findAll(@CurrentUser() user: { businessId: string }) {
    return this.goalsService.findAll(user.businessId);
  }

  /**
   * GET /api/goals/:id
   * Get a specific goal by ID.
   */
  @Get(':id')
  findOne(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.goalsService.findOne(user.businessId, id);
  }

  /**
   * PUT /api/goals/:id
   * Update a goal.
   */
  @Put(':id')
  update(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Body() dto: {
      name?: string;
      targetAmount?: number;
      currentAmount?: number;
      targetDate?: string;
      icon?: string;
      color?: string;
      priority?: number;
      monthlyTarget?: number;
      currency?: string;
      notes?: string;
      isActive?: boolean;
    },
  ) {
    return this.goalsService.update(user.businessId, id, dto);
  }

  /**
   * DELETE /api/goals/:id
   * Soft-delete a goal.
   */
  @Delete(':id')
  remove(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.goalsService.remove(user.businessId, id);
  }

  /**
   * POST /api/goals/:id/ai-tips
   * Generate AI-powered tips for reaching the goal.
   * Returns cached tips if they are less than 24 hours old.
   */
  @Post(':id/ai-tips')
  async generateAiTips(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
  ) {
    const goal = await this.goalsService.findOne(user.businessId, id);
    if (!goal) return { tips: '' };

    // Return cached tips if fresh (less than 24h)
    if (goal.aiTips && goal.aiTipsUpdatedAt) {
      const age = Date.now() - new Date(goal.aiTipsUpdatedAt).getTime();
      if (age < 24 * 60 * 60 * 1000) return { tips: goal.aiTips };
    }

    // Generate tips based on goal data
    const remaining = Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount));
    const monthsLeft = goal.targetDate
      ? Math.max(1, Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000)))
      : null;
    const perMonth = monthsLeft ? Math.ceil(remaining / monthsLeft) : null;

    let tips = '';
    if (perMonth) {
      tips = `To reach your goal of ${Number(goal.targetAmount).toLocaleString()}, you need to save ${perMonth.toLocaleString()} per month for ${monthsLeft} months.`;
      if (perMonth > Number(goal.targetAmount) * 0.3) {
        tips += ' Consider extending your deadline or breaking this into smaller sub-goals.';
      }
    } else {
      tips = `You have ${remaining.toLocaleString()} remaining to reach your goal of ${Number(goal.targetAmount).toLocaleString()}.`;
    }

    // Check progress pace
    const progress = Number(goal.targetAmount) > 0
      ? (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100
      : 0;
    if (progress >= 75) {
      tips += ' Great progress! You are more than 75% of the way there.';
    } else if (progress >= 50) {
      tips += ' You are halfway there. Keep up the consistent savings.';
    }

    await this.goalsService.updateAiTips(user.businessId, id, tips);
    return { tips };
  }
}
