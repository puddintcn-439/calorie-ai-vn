import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiUsageService } from './ai-usage.service';

class AiUsageSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  days?: number;
}

@ApiTags('AI Usage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/usage')
export class AiUsageController {
  constructor(private readonly aiUsageService: AiUsageService) {}

  @Get('quota')
  @ApiOperation({ summary: 'Get current user AI quota remaining by feature' })
  getQuota(@Request() req: any) {
    const userId = req?.user?.id ?? req?.user?.sub;
    return this.aiUsageService.getQuotaRemaining(userId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get admin-only AI usage and estimated spend summary' })
  @ApiQuery({ name: 'days', required: false, example: 30, description: 'Rolling window in days, from 1 to 180.' })
  getSummary(@Request() req: any, @Query() query: AiUsageSummaryQueryDto) {
    const email = req?.user?.email;
    return this.aiUsageService.getUsageSummary(email, query.days ?? 30);
  }
}
