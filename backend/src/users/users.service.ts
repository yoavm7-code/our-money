import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from '../auth/dto/register.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const household = await this.prisma.household.create({
      data: { name: `${dto.name || 'User'}'s Household` },
    });
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name ?? null,
        countryCode: dto.countryCode ? dto.countryCode.toUpperCase().slice(0, 2) : null,
        householdId: household.id,
      },
    });
    return { ...user, passwordHash: undefined };
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true, householdId: true, countryCode: true },
    });
  }

  async findById(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, householdId: true, countryCode: true, avatarPath: true },
    });
    if (!u) return null;
    return { ...u, avatarUrl: u.avatarPath ? `/uploads/avatars/${path.basename(u.avatarPath)}?v=${Date.now()}` : null };
  }

  async getDashboardConfig(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { dashboardConfig: true },
    });
    return (u?.dashboardConfig as Record<string, unknown>) ?? null;
  }

  async saveDashboardConfig(id: string, config: unknown) {
    await this.prisma.user.update({
      where: { id },
      data: { dashboardConfig: config as any },
    });
    return { ok: true };
  }

  async update(id: string, dto: { name?: string; email?: string; password?: string; countryCode?: string | null }) {
    const data: { name?: string | null; email?: string; passwordHash?: string; countryCode?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name.trim() || null;
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email) {
        const existing = await this.prisma.user.findUnique({ where: { email } });
        if (existing && existing.id !== id) throw new ConflictException('Email already in use');
        data.email = email;
      }
    }
    if (dto.password != null && dto.password.length >= 6) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.countryCode !== undefined) {
      data.countryCode = dto.countryCode ? dto.countryCode.toUpperCase().slice(0, 2) : null;
    }
    if (Object.keys(data).length === 0) return this.findById(id);
    const u = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, householdId: true, countryCode: true, avatarPath: true },
    });
    return { ...u, avatarUrl: u.avatarPath ? `/uploads/avatars/${path.basename(u.avatarPath)}?v=${Date.now()}` : null };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads', 'avatars');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}.${ext}`;
    const filePath = path.join(uploadDir, fileName);
    // Remove old avatar if different extension
    const existing = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });
    if (existing?.avatarPath && existing.avatarPath !== filePath) {
      try { fs.unlinkSync(existing.avatarPath); } catch { /* ignore if file missing */ }
    }
    try {
      fs.writeFileSync(filePath, file.buffer);
    } catch (err) {
      throw new Error(`Failed to save avatar: ${(err as Error).message}`);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath: filePath },
    });
    return { avatarUrl: `/uploads/avatars/${fileName}?v=${Date.now()}` };
  }

  async getAvatarPath(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });
    if (!u?.avatarPath || !fs.existsSync(u.avatarPath)) return null;
    return u.avatarPath;
  }
}
