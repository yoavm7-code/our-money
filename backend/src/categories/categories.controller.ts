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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

interface RequestUser {
  userId: string;
  email: string;
  businessId: string;
  isAdmin: boolean;
}

@Controller('api/categories')
@UseGuards(AuthGuard('jwt'))
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /** GET /api/categories - list categories with optional ?income=true/false filter */
  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('income') income?: string,
  ) {
    const isIncome =
      income === 'true' ? true : income === 'false' ? false : undefined;
    return this.categoriesService.findAll(user.businessId, isIncome);
  }

  /** POST /api/categories - create custom category */
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user.businessId, dto);
  }

  /** PUT /api/categories/:id - update category */
  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.businessId, id, dto);
  }

  /** DELETE /api/categories/:id - delete (only non-default) */
  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.categoriesService.remove(user.businessId, id);
  }
}
