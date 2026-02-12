import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Default categories tailored for freelancers.
 * Income categories cover common freelance revenue streams.
 * Expense categories cover typical deductible business expenses.
 */
const DEFAULT_CATEGORIES = [
  // --- Income ---
  {
    name: 'Project Income',
    slug: 'project-income',
    isIncome: true,
    icon: 'briefcase',
    color: '#22c55e',
    isTaxDeductible: false,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Consulting',
    slug: 'consulting',
    isIncome: true,
    icon: 'users',
    color: '#16a34a',
    isTaxDeductible: false,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Retainer',
    slug: 'retainer',
    isIncome: true,
    icon: 'repeat',
    color: '#15803d',
    isTaxDeductible: false,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Royalties',
    slug: 'royalties',
    isIncome: true,
    icon: 'star',
    color: '#14532d',
    isTaxDeductible: false,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Other Income',
    slug: 'other-income',
    isIncome: true,
    icon: 'plus-circle',
    color: '#86efac',
    isTaxDeductible: false,
    excludeFromExpenseTotal: false,
  },

  // --- Expenses ---
  {
    name: 'Office Supplies',
    slug: 'office-supplies',
    isIncome: false,
    icon: 'paperclip',
    color: '#3b82f6',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Software Subscriptions',
    slug: 'software-subscriptions',
    isIncome: false,
    icon: 'monitor',
    color: '#6366f1',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Equipment',
    slug: 'equipment',
    isIncome: false,
    icon: 'cpu',
    color: '#8b5cf6',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Travel',
    slug: 'travel',
    isIncome: false,
    icon: 'map-pin',
    color: '#f59e0b',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Meals & Entertainment',
    slug: 'meals-entertainment',
    isIncome: false,
    icon: 'coffee',
    color: '#f97316',
    isTaxDeductible: true,
    deductionRate: 75,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Professional Services',
    slug: 'professional-services',
    isIncome: false,
    icon: 'shield',
    color: '#06b6d4',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    isIncome: false,
    icon: 'megaphone',
    color: '#ec4899',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Insurance',
    slug: 'insurance',
    isIncome: false,
    icon: 'shield',
    color: '#14b8a6',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Phone & Internet',
    slug: 'phone-internet',
    isIncome: false,
    icon: 'wifi',
    color: '#a855f7',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Rent',
    slug: 'rent',
    isIncome: false,
    icon: 'home',
    color: '#ef4444',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Vehicle',
    slug: 'vehicle',
    isIncome: false,
    icon: 'truck',
    color: '#eab308',
    isTaxDeductible: true,
    deductionRate: 75,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Bank Fees',
    slug: 'bank-fees',
    isIncome: false,
    icon: 'credit-card',
    color: '#64748b',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Taxes',
    slug: 'taxes',
    isIncome: false,
    icon: 'file-text',
    color: '#dc2626',
    isTaxDeductible: false,
    excludeFromExpenseTotal: true,
  },
  {
    name: 'Education',
    slug: 'education',
    isIncome: false,
    icon: 'book-open',
    color: '#2563eb',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
  {
    name: 'Other Expense',
    slug: 'other-expense',
    isIncome: false,
    icon: 'package',
    color: '#94a3b8',
    isTaxDeductible: true,
    excludeFromExpenseTotal: false,
  },
];

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize default freelancer categories for a new business.
   * Only runs when the business has zero categories.
   */
  async ensureDefaults(businessId: string) {
    const existing = await this.prisma.category.count({
      where: { businessId },
    });
    if (existing > 0) return;

    await this.prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c, i) => ({
        businessId,
        name: c.name,
        slug: c.slug,
        isIncome: c.isIncome,
        icon: c.icon,
        color: c.color,
        isDefault: true,
        isTaxDeductible: c.isTaxDeductible,
        deductionRate: (c as any).deductionRate ?? null,
        sortOrder: i,
        excludeFromExpenseTotal: c.excludeFromExpenseTotal,
      })),
    });
  }

  /** Create a custom (non-default) category. */
  async create(businessId: string, dto: CreateCategoryDto) {
    await this.ensureDefaults(businessId);
    const slug =
      dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return this.prisma.category.create({
      data: {
        businessId,
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

  /** List all categories for a business, optionally filtered by income/expense. */
  async findAll(businessId: string, isIncome?: boolean) {
    await this.ensureDefaults(businessId);
    return this.prisma.category.findMany({
      where: {
        businessId,
        ...(isIncome != null && { isIncome }),
      },
      orderBy: [{ isIncome: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** Find a single category by slug. */
  async findBySlug(businessId: string, slug: string) {
    return this.prisma.category.findFirst({
      where: { businessId, slug },
    });
  }

  /** Find a single category by ID. */
  async findById(businessId: string, id: string) {
    return this.prisma.category.findFirst({
      where: { id, businessId },
    });
  }

  /** Update a category. */
  async update(businessId: string, id: string, dto: UpdateCategoryDto) {
    return this.prisma.category.updateMany({
      where: { id, businessId },
      data: dto as Record<string, unknown>,
    });
  }

  /**
   * Delete a category. Only non-default categories may be deleted.
   * Default categories are protected from removal.
   */
  async remove(businessId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, businessId },
    });
    if (!category) {
      throw new BadRequestException('Category not found');
    }
    if (category.isDefault) {
      throw new BadRequestException('Default categories cannot be deleted');
    }
    return this.prisma.category.deleteMany({
      where: { id, businessId, isDefault: false },
    });
  }
}
