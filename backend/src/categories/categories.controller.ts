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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('api/categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  create(@HouseholdId() householdId: string, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(householdId, dto);
  }

  @Get()
  findAll(
    @HouseholdId() householdId: string,
    @Query('incomeOnly') incomeOnly?: string,
  ) {
    const income = incomeOnly === 'true' ? true : incomeOnly === 'false' ? false : undefined;
    return this.categoriesService.findAll(householdId, income);
  }

  @Get(':id')
  findOne(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.categoriesService.findById(householdId, id);
  }

  @Put(':id')
  update(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(householdId, id, dto);
  }

  @Delete(':id')
  remove(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.categoriesService.remove(householdId, id);
  }
}
