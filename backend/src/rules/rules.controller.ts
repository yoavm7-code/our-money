import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RulesService } from './rules.service';

interface RequestUser {
  userId: string;
  email: string;
  businessId: string;
  isAdmin: boolean;
}

@Controller('api/rules')
@UseGuards(AuthGuard('jwt'))
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  /** GET /api/rules - list all rules for the business */
  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.rulesService.findAll(user.businessId);
  }

  /** POST /api/rules - create a new categorization rule */
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body()
    dto: {
      categoryId: string;
      pattern: string;
      patternType?: string;
      priority?: number;
    },
  ) {
    return this.rulesService.create(user.businessId, dto);
  }

  /** DELETE /api/rules/:id - delete a rule */
  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.rulesService.remove(user.businessId, id);
  }
}
