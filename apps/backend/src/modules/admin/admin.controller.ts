import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminRoleGuard } from './admin-role.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminService } from './admin.service';
import { AdminRevenueService } from './admin-revenue.service';

class AdminAiUsageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  days?: number;
}

class AdminActionReasonDto {
  @IsString()
  @MinLength(5)
  reason!: string;
}

class AdminResetAiQuotaDto extends AdminActionReasonDto {
  @IsOptional()
  @IsString()
  @IsIn(['daily', 'monthly'])
  scope?: 'daily' | 'monthly';
}

class AdminAuditLogQueryDto {
  @IsOptional()
  @IsString()
  actorEmail?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number;
}

class AdminPaymentIssuesQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['open', 'in_review', 'resolved', 'rejected'])
  status?: 'open' | 'in_review' | 'resolved' | 'rejected';

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

class AdminUpdatePaymentIssueDto {
  @IsOptional()
  @IsString()
  @IsIn(['open', 'in_review', 'resolved', 'rejected'])
  status?: 'open' | 'in_review' | 'resolved' | 'rejected';

  @IsOptional()
  @IsString()
  admin_note?: string;

  @IsOptional()
  @IsString()
  resolution?: string;
}

function assertUuid(value: string): string {
  const normalized = String(value ?? '').trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(normalized)) {
    throw new BadRequestException('Invalid user id. Expected UUID.');
  }
  return normalized;
}

function getAdminActor(req: any) {
  return {
    email: req?.admin?.email ?? req?.user?.email,
    role: req?.admin?.role,
    source: req?.admin?.source,
    user_id: req?.user?.id ?? req?.user?.sub ?? null,
  };
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard, AdminRoleGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminRevenueService: AdminRevenueService,
  ) {}

  @Get('overview')
  @AdminRoles('viewer')
  @ApiOperation({ summary: 'Get read-only admin overview metrics' })
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('ai-usage')
  @AdminRoles('viewer')
  @ApiOperation({ summary: 'Get aggregate AI usage summary for admin console' })
  @ApiQuery({ name: 'days', required: false, example: 30, description: 'Rolling window in days, from 1 to 180.' })
  getAiUsage(@Request() req: any, @Query() query: AdminAiUsageQueryDto) {
    const email = req?.user?.email;
    return this.adminService.getAiUsage(email, query.days ?? 30);
  }

  @Get('revenue')
  @AdminRoles('admin')
  @ApiOperation({ summary: 'Get subscription revenue, AI cost, margin, and conversion metrics' })
  getRevenue() {
    return this.adminRevenueService.getRevenue();
  }

  @Get('audit-log')
  @AdminRoles('viewer')
  @ApiOperation({ summary: 'Get admin audit log entries' })
  getAuditLog(@Query() query: AdminAuditLogQueryDto) {
    return this.adminService.getAuditLog(query);
  }

  @Get('subscriptions')
  @AdminRoles('admin')
  @ApiOperation({ summary: 'Get subscription aggregates by tier and status for admin console' })
  getSubscriptions() {
    return this.adminService.getSubscriptions();
  }

  @Get('system-health')
  @AdminRoles('admin')
  @ApiOperation({ summary: 'Get read-only system health signals for admin console' })
  getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  @Get('users')
  @AdminRoles('viewer')
  @ApiOperation({ summary: 'List users with admin filters and read-only activity aggregates' })
  getUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('payment-issues')
  @AdminRoles('support')
  @ApiOperation({ summary: 'List billing payment issue support cases' })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'in_review', 'resolved', 'rejected'] })
  @ApiQuery({ name: 'provider', required: false, example: 'payos' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user UUID' })
  getPaymentIssues(@Query() query: AdminPaymentIssuesQueryDto) {
    return this.adminService.getPaymentIssues(query);
  }

  @Patch('payment-issues/:id')
  @AdminRoles('support')
  @ApiOperation({ summary: 'Update billing payment issue support status and notes' })
  @ApiParam({ name: 'id', description: 'Payment issue UUID' })
  @ApiBody({ schema: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'in_review', 'resolved', 'rejected'] }, admin_note: { type: 'string' }, resolution: { type: 'string' } } } })
  updatePaymentIssue(@Request() req: any, @Param('id') issueId: string, @Body() body: AdminUpdatePaymentIssueDto) {
    return this.adminService.updatePaymentIssue(assertUuid(issueId), getAdminActor(req), body);
  }

  @Get('users/:id')
  @AdminRoles('support')
  @ApiOperation({ summary: 'Get read-only admin detail for one user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  getUserDetail(@Param('id') userId: string) {
    return this.adminService.getUserDetail(assertUuid(userId));
  }

  @Post('users/:id/grant-premium')
  @AdminRoles('admin')
  @ApiOperation({ summary: 'Grant premium trial to a user and write admin audit log' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiBody({ schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 5, example: 'Manual support compensation' } } } })
  grantPremium(@Request() req: any, @Param('id') userId: string, @Body() body: AdminActionReasonDto) {
    return this.adminService.grantPremium(assertUuid(userId), getAdminActor(req), body.reason);
  }

  @Post('users/:id/revoke-premium')
  @AdminRoles('admin')
  @ApiOperation({ summary: 'Revoke premium access from a user and write admin audit log' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiBody({ schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 5, example: 'User requested downgrade' } } } })
  revokePremium(@Request() req: any, @Param('id') userId: string, @Body() body: AdminActionReasonDto) {
    return this.adminService.revokePremium(assertUuid(userId), getAdminActor(req), body.reason);
  }

  @Post('users/:id/reset-ai-quota')
  @AdminRoles('admin')
  @ApiOperation({ summary: 'Reset AI quota by adding an audited quota adjustment' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiBody({ schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 5, example: 'Support quota compensation' }, scope: { type: 'string', enum: ['daily', 'monthly'], example: 'daily' } } } })
  resetAiQuota(@Request() req: any, @Param('id') userId: string, @Body() body: AdminResetAiQuotaDto) {
    return this.adminService.resetAiQuota(assertUuid(userId), getAdminActor(req), body.reason, body.scope ?? 'daily');
  }
}
