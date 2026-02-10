import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BudgetsService } from './budgets.service';

@Controller('api/budgets')
@UseGuards(AuthGuard('jwt'))
export class BudgetsController {
  constructor(private service: BudgetsService) {}

  @Get()
  async list(@Req() req: any) {
    return this.service.list(req.user.householdId);
  }

  @Post()
  async upsert(@Req() req: any, @Body() body: { categoryId: string; amount: number }) {
    return this.service.upsert(req.user.householdId, body);
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.householdId, id);
  }

  @Get('summary')
  async summary(@Req() req: any, @Query('month') month?: string) {
    return this.service.getSummary(req.user.householdId, month);
  }
}
