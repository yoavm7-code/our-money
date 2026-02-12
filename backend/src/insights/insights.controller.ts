import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HouseholdId } from '../common/decorators/household.decorator';
import { INSIGHT_SECTIONS, InsightSection } from './insights.service';
import { InsightsService } from './insights.service';

@Controller('api/insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private insightsService: InsightsService) {}

  @Get()
  getInsights(
    @HouseholdId() businessId: string,
    @Query('lang') lang?: string,
    @CurrentUser() user?: { countryCode?: string | null },
  ) {
    return this.insightsService.getInsights(businessId, lang, user?.countryCode ?? undefined);
  }

  @Get(':section')
  getInsightSection(
    @HouseholdId() businessId: string,
    @Param('section') section: string,
    @Query('lang') lang?: string,
    @CurrentUser() user?: { countryCode?: string | null },
  ) {
    if (!INSIGHT_SECTIONS.includes(section as InsightSection)) {
      throw new BadRequestException(`Invalid section: ${section}. Valid sections: ${INSIGHT_SECTIONS.join(', ')}`);
    }
    return this.insightsService.getInsightSection(businessId, section as InsightSection, lang, user?.countryCode ?? undefined);
  }
}
