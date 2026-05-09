import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CorrectionEventType } from '@calorie-ai/types';

class CreateCorrectionEventDto {
  @ApiProperty({ enum: ['item_mismatch', 'portion_adjusted', 'confidence_low', 'ai_result_corrected'] })
  @IsEnum(['item_mismatch', 'portion_adjusted', 'confidence_low', 'ai_result_corrected'])
  event_type: CorrectionEventType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  food_id?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  food_name?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  original_calories?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  corrected_calories?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  original_portion?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  corrected_portion?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  original_portion_unit?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  ai_confidence?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  scan_image_url?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

@ApiTags('Telemetry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('telemetry')
export class TelemetryController {
  constructor(private telemetry: TelemetryService) {}

  @Post('corrections')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a user correction event for AI prediction quality tracking' })
  async createCorrectionEvent(@Request() req: any, @Body() dto: CreateCorrectionEventDto) {
    return this.telemetry.createCorrectionEvent(req.user.id ?? req.user.sub, dto);
  }

  @Get('corrections')
  @ApiOperation({ summary: 'Get user correction events' })
  async getCorrectionEvents(
    @Request() req: any,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.telemetry.getUserCorrectionEvents(req.user.id ?? req.user.sub, limit, offset);
  }

  @Get('corrections/stats')
  @ApiOperation({ summary: 'Get correction statistics for KPI tracking' })
  async getCorrectionStats(
    @Request() req: any,
    @Query('days') days: number = 30,
  ) {
    return this.telemetry.getUserCorrectionStats(req.user.id ?? req.user.sub, days);
  }
}
