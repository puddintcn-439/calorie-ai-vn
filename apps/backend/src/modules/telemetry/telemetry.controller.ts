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
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CorrectionEventType, LoggingEventType, LoggingInputMode, ContextMode } from '@calorie-ai/types';

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

class CreateLoggingEventDto {
  @ApiProperty({ enum: ['log_attempted', 'log_parsed', 'log_failed'] })
  @IsEnum(['log_attempted', 'log_parsed', 'log_failed'])
  event_type: LoggingEventType;

  @ApiProperty({ enum: ['image', 'text', 'voice', 'receipt', 'barcode', 'search'] })
  @IsEnum(['image', 'text', 'voice', 'receipt', 'barcode', 'search'])
  input_mode: LoggingInputMode;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  elapsed_ms?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  correction_count?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  item_count?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  ai_confidence?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason_code?: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class CreateContextEventDto {
  @ApiProperty({ enum: Object.values(ContextMode) })
  @IsEnum(ContextMode)
  context_mode: ContextMode;

  @ApiProperty({ enum: ['activated', 'deactivated'] })
  @IsEnum(['activated', 'deactivated'])
  action: 'activated' | 'deactivated';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  timestamp?: string;
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

  @Post('logging-events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record logging funnel telemetry event (attempted/parsed/failed)' })
  async createLoggingEvent(@Request() req: any, @Body() dto: CreateLoggingEventDto) {
    return this.telemetry.createLoggingEvent(req.user.id ?? req.user.sub, dto);
  }

  @Post('context-events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record life context activation/deactivation (stress, period, travel, etc)' })
  async createContextEvent(@Request() req: any, @Body() dto: CreateContextEventDto) {
    return this.telemetry.createContextEvent(req.user.id ?? req.user.sub, dto);
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
