import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const DEFAULT_CATEGORIES = [
  { name: 'Salary', slug: 'salary', isIncome: true, icon: '💰', color: '#22c55e', excludeFromExpenseTotal: false },
  { name: 'Groceries', slug: 'groceries', isIncome: false, icon: '🛒', color: '#3b82f6', excludeFromExpenseTotal: false },
  { name: 'Transport', slug: 'transport', isIncome: false, icon: '🚗', color: '#f59e0b', excludeFromExpenseTotal: false },
  { name: 'Utilities', slug: 'utilities', isIncome: false, icon: '💡', color: '#8b5cf6', excludeFromExpenseTotal: false },
  { name: 'Rent', slug: 'rent', isIncome: false, icon: '🏠', color: '#ec4899', excludeFromExpenseTotal: false },
  { name: 'Insurance', slug: 'insurance', isIncome: false, icon: '🛡️', color: '#06b6d4', excludeFromExpenseTotal: false },
  { name: 'Healthcare', slug: 'healthcare', isIncome: false, icon: '⚕️', color: '#ef4444', excludeFromExpenseTotal: false },
  { name: 'Dining', slug: 'dining', isIncome: false, icon: '🍽️', color: '#f97316', excludeFromExpenseTotal: false },
  { name: 'Shopping', slug: 'shopping', isIncome: false, icon: '🛍️', color: '#a855f7', excludeFromExpenseTotal: false },
  { name: 'Entertainment', slug: 'entertainment', isIncome: false, icon: '🎬', color: '#eab308', excludeFromExpenseTotal: false },
  { name: 'Credit charges', slug: 'credit_charges', isIncome: false, icon: '💳', color: '#64748b', excludeFromExpenseTotal: true },
  { name: 'Other', slug: 'other', isIncome: false, icon: '📦', color: '#64748b', excludeFromExpenseTotal: false },
];

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async ensureDefaults(householdId: string) {
    const existing = await this.prisma.category.count({ where: { householdId } });
    if (existing > 0) return;
    await this.prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c, i) => ({
        householdId,
        name: c.name,
        slug: c.slug,
        isIncome: c.isIncome,
        icon: c.icon,
        color: c.color,
        isDefault: true,
        sortOrder: i,
        excludeFromExpenseTotal: c.excludeFromExpenseTotal,
      })),
    });
  }

  async create(householdId: string, dto: CreateCategoryDto) {
    await this.ensureDefaults(householdId);
    const slug = dto.slug || dto.name.toLowerCase().replace(/\s+/g, '-');
    return this.prisma.category.create({
      data: {
        householdId,
        name: dto.name,
        slug,
        icon: dto.icon ?? null,
        color: dto.color ?? null,
        isIncome: dto.isIncome ?? false,
        excludeFromExpenseTotal: dto.excludeFromExpenseTotal ?? false,
        isDefault: false,
      },
    });
  }

  async findAll(householdId: string, incomeOnly?: boolean) {
    await this.ensureDefaults(householdId);
    return this.prisma.category.findMany({
      where: { householdId, ...(incomeOnly != null && { isIncome: incomeOnly }) },
      orderBy: [{ isIncome: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findBySlug(householdId: string, slug: string) {
    return this.prisma.category.findFirst({
      where: { householdId, slug },
    });
  }

  async findById(householdId: string, id: string) {
    return this.prisma.category.findFirst({
      where: { id, householdId },
    });
  }

  async update(householdId: string, id: string, dto: UpdateCategoryDto) {
    return this.prisma.category.updateMany({
      where: { id, householdId },
      data: dto as Record<string, unknown>,
    });
  }

  async remove(householdId: string, id: string) {
    return this.prisma.category.deleteMany({
      where: { id, householdId },
    });
  }
}
