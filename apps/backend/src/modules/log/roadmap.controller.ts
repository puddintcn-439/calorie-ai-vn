import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoadmapService } from './roadmap.service';
import {
  DailyRoadmapItem,
  CreateDailyRoadmapItemDto,
  UpdateDailyRoadmapItemDto,
  DailyRoadmapSyncDto,
} from '@calorie-ai/types';

@UseGuards(JwtAuthGuard)
@Controller('roadmap')
export class RoadmapController {
  constructor(private roadmapService: RoadmapService) {}

  @Get('/:date')
  async getDailyRoadmap(
    @Request() req: any,
    @Param('date') date: string,
  ): Promise<DailyRoadmapItem[]> {
    try {
      return await this.roadmapService.getDailyRoadmap(req.user.id, date);
    } catch (error: any) {
      if (error?.code === 'PGRST116') {
        // Table doesn't exist yet
        return [];
      }
      throw error;
    }
  }

  @Post()
  async createRoadmapItem(
    @Request() req: any,
    @Body() dto: CreateDailyRoadmapItemDto,
  ): Promise<DailyRoadmapItem> {
    try {
      return await this.roadmapService.createRoadmapItem(req.user.id, dto);
    } catch (error: any) {
      if (error?.code === 'PGRST116') {
        throw new BadRequestException(
          'Roadmap feature is being initialized. Please refresh the app and try again in a moment.',
        );
      }
      throw error;
    }
  }

  @Put('/:itemId')
  async updateRoadmapItem(
    @Request() req: any,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateDailyRoadmapItemDto,
  ): Promise<DailyRoadmapItem> {
    try {
      return await this.roadmapService.updateRoadmapItem(req.user.id, itemId, dto);
    } catch (error: any) {
      if (error?.code === 'PGRST116') {
        throw new BadRequestException(
          'Roadmap feature is being initialized. Please try again shortly.',
        );
      }
      throw error;
    }
  }

  @Delete('/:itemId')
  async deleteRoadmapItem(
    @Request() req: any,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    try {
      return await this.roadmapService.deleteRoadmapItem(req.user.id, itemId);
    } catch (error: any) {
      if (error?.code === 'PGRST116') {
        throw new BadRequestException(
          'Roadmap feature is being initialized. Please try again shortly.',
        );
      }
      throw error;
    }
  }

  @Post('/sync/daily')
  async syncDailyRoadmap(
    @Request() req: any,
    @Body() dto: DailyRoadmapSyncDto,
  ): Promise<DailyRoadmapItem[]> {
    try {
      return await this.roadmapService.syncDailyRoadmap(req.user.id, dto);
    } catch (error: any) {
      if (error?.code === 'PGRST116') {
        throw new BadRequestException(
          'Roadmap feature is being initialized. Please try again shortly.',
        );
      }
      throw error;
    }
  }
}
