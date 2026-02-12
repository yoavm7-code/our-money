import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { TaxService } from './tax.service';

@Controller('api/tax')
@UseGuards(JwtAuthGuard)
export class TaxController {
  constructor(private taxService: TaxService) {}

  @Get('periods')
  findAllPeriods(
    @HouseholdId() businessId: string,
    @Query('year') year?: string,
    @Query('type') type?: string,
  ) {
    return this.taxService.findAllPeriods(businessId, {
      year: year ? parseInt(year, 10) : undefined,
      type,
    });
  }

  @Post('periods')
  createPeriod(
    @HouseholdId() businessId: string,
    @Body()
    dto: {
      type: string;
      periodStart: string;
      periodEnd: string;
      notes?: string;
    },
  ) {
    return this.taxService.createPeriod(businessId, dto);
  }

  @Put('periods/:id')
  updatePeriod(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
    @Body()
    dto: {
      notes?: string;
      taxAdvance?: number;
    },
  ) {
    return this.taxService.updatePeriod(businessId, id, dto);
  }

  @Post('periods/:id/calculate')
  calculatePeriod(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
  ) {
    return this.taxService.calculatePeriod(businessId, id);
  }

  @Post('periods/:id/mark-filed')
  markAsFiled(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
    @Body() dto: { filedDate?: string },
  ) {
    return this.taxService.markAsFiled(businessId, id, dto);
  }

  @Get('summary')
  getYearlySummary(
    @HouseholdId() businessId: string,
    @Query('year') year?: string,
  ) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.taxService.getYearlySummary(businessId, y);
  }

  @Get('vat-report')
  getVatReport(
    @HouseholdId() businessId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.taxService.getVatReport(businessId, from, to);
  }
}
