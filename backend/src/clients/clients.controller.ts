import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { ClientsService } from './clients.service';

@Controller('api/clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @Get()
  findAll(@HouseholdId() businessId: string) {
    return this.clientsService.findAll(businessId);
  }

  @Get(':id')
  findOne(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.clientsService.findOne(businessId, id);
  }

  @Post()
  create(
    @HouseholdId() businessId: string,
    @Body()
    dto: {
      name: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      taxId?: string;
      notes?: string;
      hourlyRate?: number;
      currency?: string;
      color?: string;
    },
  ) {
    return this.clientsService.create(businessId, dto);
  }

  @Put(':id')
  update(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      taxId?: string;
      notes?: string;
      hourlyRate?: number;
      currency?: string;
      color?: string;
    },
  ) {
    return this.clientsService.update(businessId, id, dto);
  }

  @Delete(':id')
  remove(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.clientsService.remove(businessId, id);
  }
}
