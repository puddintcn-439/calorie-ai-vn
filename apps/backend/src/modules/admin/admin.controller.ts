import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class AdminAiUsageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  days?: number;
}

class AdminUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get read-only admin overview metrics' })
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('ai-usage')
  @ApiOperation({ summary: 'Get aggregate AI usage summary for admin console' })
  @ApiQuery({ name: 'days', required: false, example: 30, description: 'Rolling window in days, from 1 to 180.' })
  getAiUsage(@Request() req: any, @Query() query: AdminAiUsageQueryDto) {
    const email = req?.user?.email;
    return this.adminService.getAiUsage(email, query.days ?? 30);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'Get subscription aggregates by tier and status for admin console' })
  getSubscriptions() {
    return this.adminService.getSubscriptions();
  }

  @Get('system-health')
  @ApiOperation({ summary: 'Get read-only system health signals for admin console' })
  getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  @Get('users')
  @ApiOperation({ summary: 'List users with admin filters and read-only activity aggregates' })
  getUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get read-only admin detail for one user' })
  @ApiParam({ name: 'id', description: 'User id' })
  getUserDetail(@Param('id') userId: string) {
    return this.adminService.getUserDetail(userId);
  }
}
