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

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Public: Admin Setup (no auth, protected by ADMIN_SETUP_KEY) ──

  /**
   * POST /api/admin/setup
   * Promote a user to admin using the ADMIN_SETUP_KEY.
   * This is the only unauthenticated admin endpoint.
   */
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

  /**
   * GET /api/admin/stats
   * Get system-wide statistics (total users, businesses, transactions, etc.).
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('stats')
  getStats() {
    return this.adminService.getSystemStats();
  }

  // ─── User Management ────────────────────────────────────────────────

  /**
   * GET /api/admin/users?search=...&page=1&limit=20
   * List all users with search and pagination.
   */
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

  /**
   * POST /api/admin/users
   * Create a new user (admin-created users are pre-verified).
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('users')
  createUser(
    @Body() dto: {
      email: string;
      password: string;
      name?: string;
      countryCode?: string;
      isAdmin?: boolean;
    },
  ) {
    return this.adminService.createUser(dto);
  }

  /**
   * GET /api/admin/users/:id
   * Get detailed user info including business-level data summary.
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  /**
   * PUT /api/admin/users/:id
   * Update user profile fields.
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: {
      name?: string;
      email?: string;
      countryCode?: string;
      phone?: string;
      isAdmin?: boolean;
      emailVerified?: boolean;
    },
  ) {
    return this.adminService.updateUser(id, dto);
  }

  /**
   * DELETE /api/admin/users/:id
   * Delete a user and their business (cascading delete).
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  /**
   * POST /api/admin/users/:id/reset-password
   * Reset a user's password.
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('users/:id/reset-password')
  resetPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
    return this.adminService.resetPassword(id, body.newPassword);
  }

  /**
   * GET /api/admin/users/:id/backup
   * Export all data for a user (full backup).
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('users/:id/backup')
  backupUserData(@Param('id') id: string) {
    return this.adminService.backupUserData(id);
  }

  /**
   * GET /api/admin/users/:id/data/:type?page=1&limit=50
   * Get paginated user data by type (accounts, transactions, etc.).
   */
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

  /**
   * DELETE /api/admin/records/:table/:id
   * Delete a specific record from any allowed table.
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('records/:table/:id')
  deleteRecord(@Param('table') table: string, @Param('id') id: string) {
    return this.adminService.deleteRecord(table, id);
  }
}
