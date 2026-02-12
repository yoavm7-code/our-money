import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RulesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Extract the core merchant/pattern from a transaction description.
   * Strips noise (dates, amounts, branch numbers, legal suffixes) and keeps
   * the meaningful business/merchant name for reuse as a matching pattern.
   */
  private extractPattern(description: string): string {
    let s = description.trim();
    // Remove dates (DD/MM/YYYY, DD.MM.YY, etc.)
    s = s.replace(/\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}/g, ' ');
    // Remove standalone numbers (amounts, branch numbers, IDs)
    s = s.replace(/\b\d{1,3}(?:[,\.]\d{3})*(?:[,\.]\d{2})?\b/g, ' ');
    s = s.replace(/\b\d+\b/g, ' ');
    // Remove common legal/business suffixes
    s = s.replace(/בע["\u05F4]?מ/g, ' ');
    s = s.replace(/\bבע\s+מ\b/g, ' ');
    s = s.replace(/\bLTD\.?\b/gi, ' ');
    s = s.replace(/\bINC\.?\b/gi, ' ');
    s = s.replace(/\bCO\.?\b/gi, ' ');
    // Remove branch/location indicators
    s = s.replace(/סניף\s*/g, ' ');
    // Clean up punctuation and whitespace
    s = s.replace(/[*#_=;"'()]+/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    // Remove trailing/leading dashes and colons
    s = s.replace(/^[\s\-:.,]+/, '').replace(/[\s\-:.,]+$/, '').trim();
    // Take meaningful words (2+ chars), up to first 4
    const words = s.split(/\s+/).filter((w) => w.length >= 2);
    const pattern = words.slice(0, 4).join(' ');
    if (pattern.length < 2) return description.trim().slice(0, 50);
    return pattern.slice(0, 50);
  }

  /** Suggest category for a description using learned rules. */
  async suggestCategory(householdId: string, description: string): Promise<string | null> {
    const rules = await this.prisma.categoryRule.findMany({
      where: { householdId, isActive: true },
      orderBy: { priority: 'desc' },
      include: { category: true },
    });
    const normalized = description.toUpperCase().trim();
    for (const rule of rules) {
      const pattern = rule.pattern.toUpperCase();
      let match = false;
      if (rule.patternType === 'contains') match = normalized.includes(pattern);
      else if (rule.patternType === 'startsWith') match = normalized.startsWith(pattern);
      else if (rule.patternType === 'regex') {
        try {
          match = new RegExp(pattern, 'i').test(description);
        } catch {
          match = false;
        }
      }
      if (match) return rule.categoryId;
    }
    // Second pass: try matching the extracted pattern of the description against rules
    const descPattern = this.extractPattern(description).toUpperCase();
    if (descPattern.length >= 2) {
      for (const rule of rules) {
        const rulePattern = rule.pattern.toUpperCase();
        if (rule.patternType === 'contains') {
          // Check if the extracted pattern contains the rule pattern, or vice versa
          if (descPattern.includes(rulePattern) || rulePattern.includes(descPattern)) {
            return rule.categoryId;
          }
        }
      }
    }
    return null;
  }

  /** Learn from user correction: create or strengthen a rule.
   *  Extracts the core merchant/keyword from the description for better reuse. */
  async learnFromCorrection(
    householdId: string,
    description: string,
    categoryId: string,
  ): Promise<void> {
    const pattern = this.extractPattern(description);
    if (!pattern || pattern.length < 2) return;

    // Check for existing rule with same pattern (case-insensitive)
    const existing = await this.prisma.categoryRule.findFirst({
      where: {
        householdId,
        pattern: { equals: pattern, mode: 'insensitive' },
      },
    });

    if (existing) {
      if (existing.categoryId === categoryId) {
        // Same category – reinforce by bumping priority
        await this.prisma.categoryRule.update({
          where: { id: existing.id },
          data: { priority: existing.priority + 5 },
        });
      } else {
        // Different category – user is correcting; update the rule
        await this.prisma.categoryRule.update({
          where: { id: existing.id },
          data: { categoryId, priority: existing.priority + 5 },
        });
      }
      return;
    }

    await this.prisma.categoryRule.create({
      data: {
        householdId,
        categoryId,
        pattern,
        patternType: 'contains',
        priority: 10,
      },
    });
  }

  async findAll(householdId: string) {
    return this.prisma.categoryRule.findMany({
      where: { householdId },
      orderBy: { priority: 'desc' },
      include: { category: true },
    });
  }

  async create(
    householdId: string,
    dto: { categoryId: string; pattern: string; patternType?: string; priority?: number },
  ) {
    return this.prisma.categoryRule.create({
      data: {
        householdId,
        categoryId: dto.categoryId,
        pattern: dto.pattern,
        patternType: dto.patternType ?? 'contains',
        priority: dto.priority ?? 0,
      },
      include: { category: true },
    });
  }

  async remove(householdId: string, id: string) {
    return this.prisma.categoryRule.deleteMany({
      where: { id, householdId },
    });
  }
}
