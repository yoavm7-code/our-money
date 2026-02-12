import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { MortgagesService } from './mortgages.service';
import { CreateMortgageDto } from './dto/create-mortgage.dto';
import { UpdateMortgageDto } from './dto/update-mortgage.dto';
import { CreateMortgageTrackDto } from './dto/create-mortgage-track.dto';

@Controller('api/mortgages')
@UseGuards(JwtAuthGuard)
export class MortgagesController {
  constructor(private mortgagesService: MortgagesService) {}

  @Post()
  create(@HouseholdId() householdId: string, @Body() dto: CreateMortgageDto) {
    return this.mortgagesService.create(householdId, dto);
  }

  @Get()
  findAll(@HouseholdId() householdId: string) {
    return this.mortgagesService.findAll(householdId);
  }

  @Get(':id')
  findOne(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.mortgagesService.findOne(householdId, id);
  }

  @Put(':id')
  update(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMortgageDto,
  ) {
    return this.mortgagesService.update(householdId, id, dto);
  }

  @Delete(':id')
  remove(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.mortgagesService.remove(householdId, id);
  }

  @Post(':id/tracks')
  addTrack(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() dto: CreateMortgageTrackDto,
  ) {
    return this.mortgagesService.addTrack(householdId, id, dto);
  }

  @Put(':id/tracks/:trackId')
  updateTrack(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Param('trackId') trackId: string,
    @Body() dto: CreateMortgageTrackDto,
  ) {
    return this.mortgagesService.updateTrack(householdId, id, trackId, dto);
  }

  @Delete(':id/tracks/:trackId')
  removeTrack(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Param('trackId') trackId: string,
  ) {
    return this.mortgagesService.removeTrack(householdId, id, trackId);
  }
}
