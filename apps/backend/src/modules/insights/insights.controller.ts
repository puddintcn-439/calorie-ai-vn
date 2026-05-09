import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class GetWeeklyInsightsQueryDto {
  @ApiProperty({ required: false, description: 'Week start date in YYYY-MM-DD format. If omitted, returns current week.' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'week_start_date must be in YYYY-MM-DD format' })
  week_start_date?: string;
}

@ApiTags('Insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(private insights: InsightsService) {}

  @Get('weekly')
  @ApiOperation({ summary: 'Get weekly insights (calories, macros, adherence, trends)' })
  async getWeeklyInsights(
    @Request() req: any,
    @Query() query: GetWeeklyInsightsQueryDto,
  ) {
    return this.insights.getWeeklyInsights(req.user.id ?? req.user.sub, query.week_start_date);
  }
}
