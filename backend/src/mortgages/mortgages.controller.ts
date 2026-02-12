import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MortgagesService } from './mortgages.service';
import { CreateMortgageDto } from './dto/create-mortgage.dto';
import { UpdateMortgageDto } from './dto/update-mortgage.dto';
import { CreateMortgageTrackDto } from './dto/create-mortgage-track.dto';

@Controller('api/mortgages')
@UseGuards(JwtAuthGuard)
export class MortgagesController {
  constructor(private mortgagesService: MortgagesService) {}

  @Post()
  create(@CurrentUser() user: { businessId: string }, @Body() dto: CreateMortgageDto) {
    return this.mortgagesService.create(user.businessId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { businessId: string }) {
    return this.mortgagesService.findAll(user.businessId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.mortgagesService.findOne(user.businessId, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Body() dto: UpdateMortgageDto,
  ) {
    return this.mortgagesService.update(user.businessId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.mortgagesService.remove(user.businessId, id);
  }

  @Post(':id/tracks')
  addTrack(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Body() dto: CreateMortgageTrackDto,
  ) {
    return this.mortgagesService.addTrack(user.businessId, id, dto);
  }

  @Put(':id/tracks/:trackId')
  updateTrack(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Param('trackId') trackId: string,
    @Body() dto: CreateMortgageTrackDto,
  ) {
    return this.mortgagesService.updateTrack(user.businessId, id, trackId, dto);
  }

  @Delete(':id/tracks/:trackId')
  removeTrack(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Param('trackId') trackId: string,
  ) {
    return this.mortgagesService.removeTrack(user.businessId, id, trackId);
  }
}
