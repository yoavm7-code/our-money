import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountType } from '@prisma/client';

@Controller('api/accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  @Post()
  create(@HouseholdId() householdId: string, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(householdId, dto);
  }

  @Get()
  findAll(@HouseholdId() householdId: string, @Query('type') type?: AccountType) {
    return this.accountsService.findAll(householdId, type);
  }

  @Get(':id')
  findOne(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.accountsService.findOne(householdId, id);
  }

  @Put(':id')
  update(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(householdId, id, dto);
  }

  @Delete(':id')
  remove(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.accountsService.remove(householdId, id);
  }
}
