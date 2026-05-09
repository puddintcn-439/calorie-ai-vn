import {
  Controller, Get, Post, Delete, Param, Body, Request,
  UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BodyProgressService } from './body-progress.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateBodyProgressDto, BodyProgressEntry, BodyProgressTrend } from '@calorie-ai/types';

@ApiTags('Body Progress')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('body-progress')
export class BodyProgressController {
  constructor(private bodyProgress: BodyProgressService) {}

  @Post()
  @ApiOperation({ summary: "Log or update today's body progress (weight, measurements)" })
  async upsert(
    @Request() req: any,
    @Body() dto: CreateBodyProgressDto,
  ): Promise<BodyProgressEntry> {
    const userId = req.user.id ?? req.user.sub;
    return this.bodyProgress.upsertEntry(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get body progress history (90 days)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEntries(
    @Request() req: any,
    @Query('limit') limit?: string,
  ): Promise<BodyProgressEntry[]> {
    const userId = req.user.id ?? req.user.sub;
    return this.bodyProgress.getEntries(userId, limit ? parseInt(limit) : 90);
  }

  @Get('trend')
  @ApiOperation({ summary: 'Get body progress trend and summary stats' })
  async getTrend(@Request() req: any): Promise<BodyProgressTrend> {
    const userId = req.user.id ?? req.user.sub;
    return this.bodyProgress.getTrend(userId);
  }

  @Get(':date')
  @ApiOperation({ summary: 'Get body progress for a specific date (YYYY-MM-DD)' })
  async getEntry(
    @Request() req: any,
    @Param('date') date: string,
  ): Promise<BodyProgressEntry | null> {
    const userId = req.user.id ?? req.user.sub;
    return this.bodyProgress.getEntry(userId, date);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a body progress entry' })
  async deleteEntry(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<{ deleted: boolean }> {
    const userId = req.user.id ?? req.user.sub;
    await this.bodyProgress.deleteEntry(userId, parseInt(id));
    return { deleted: true };
  }
}
