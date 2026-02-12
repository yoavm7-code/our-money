import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { ProjectsService } from './projects.service';

@Controller('api/projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  findAll(
    @HouseholdId() businessId: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
  ) {
    return this.projectsService.findAll(businessId, { clientId, status });
  }

  @Get(':id')
  findOne(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.projectsService.findOne(businessId, id);
  }

  @Post()
  create(
    @HouseholdId() businessId: string,
    @Body()
    dto: {
      name: string;
      clientId?: string;
      description?: string;
      status?: string;
      budgetAmount?: number;
      hourlyRate?: number;
      currency?: string;
      startDate?: string;
      endDate?: string;
      color?: string;
      notes?: string;
    },
  ) {
    return this.projectsService.create(businessId, dto);
  }

  @Put(':id')
  update(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      clientId?: string;
      description?: string;
      status?: string;
      budgetAmount?: number;
      hourlyRate?: number;
      currency?: string;
      startDate?: string;
      endDate?: string;
      color?: string;
      notes?: string;
    },
  ) {
    return this.projectsService.update(businessId, id, dto);
  }

  @Delete(':id')
  remove(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.projectsService.remove(businessId, id);
  }
}
