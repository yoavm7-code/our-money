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
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountType } from '@prisma/client';

interface RequestUser {
  userId: string;
  email: string;
  businessId: string;
  isAdmin: boolean;
}

@Controller('api/accounts')
@UseGuards(AuthGuard('jwt'))
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  /** GET /api/accounts - list accounts, optional ?type= filter, scoped by businessId */
  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('type') type?: AccountType,
  ) {
    return this.accountsService.findAll(user.businessId, type);
  }

  /** POST /api/accounts - create account */
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountsService.create(user.businessId, dto);
  }

  /** PUT /api/accounts/:id - update account */
  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(user.businessId, id, dto);
  }

  /** DELETE /api/accounts/:id - soft delete (isActive=false) */
  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.accountsService.remove(user.businessId, id);
  }
}
