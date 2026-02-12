import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Public: Admin Setup (no auth, protected by ADMIN_SETUP_KEY) ──

  @Post('setup')
  async setupAdmin(@Body() body: { email: string; setupKey: string }) {
    const expectedKey = process.env.ADMIN_SETUP_KEY;
    if (!expectedKey) {
      throw new BadRequestException(
        'ADMIN_SETUP_KEY is not configured. Set it in environment variables.',
      );
    }
    if (!body.setupKey || body.setupKey !== expectedKey) {
      throw new UnauthorizedException('Invalid setup key');
    }
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    return this.adminService.promoteToAdmin(body.email);
  }

  // ─── All routes below require JWT + Admin ─────────────────────────

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('stats')
  getStats() {
    return this.adminService.getSystemStats();
  }

  // ─── User Management ────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('users')
  listUsers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listUsers(
      search,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('users/:id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.adminService.resetPassword(id, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('users/:id/backup')
  backupUserData(@Param('id') id: string) {
    return this.adminService.backupUserData(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('users/:id/data/:type')
  getUserData(
    @Param('id') id: string,
    @Param('type') type: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getUserData(
      id,
      type,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // ─── Record Management ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('records/:table/:id')
  deleteRecord(@Param('table') table: string, @Param('id') id: string) {
    return this.adminService.deleteRecord(table, id);
  }
}
