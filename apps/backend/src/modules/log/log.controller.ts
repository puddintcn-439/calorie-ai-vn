import {
  Controller, Get, Post, Delete,
  Body, Param, Query, Request, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsOptional, Min, IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { LogService } from './log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MealType, LogSource, SavedMealItem, ActivityType, CreateActivityLogDto } from '@calorie-ai/types';

class CreateLogDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsEnum(['breakfast','lunch','dinner','snack']) meal_type: MealType;
  @ApiProperty() @IsNumber() @Min(0) calories: number;
  @ApiProperty() @IsNumber() @Min(0) protein_g: number;
  @ApiProperty() @IsNumber() @Min(0) carbs_g: number;
  @ApiProperty() @IsNumber() @Min(0) fat_g: number;
  @ApiProperty() @IsNumber() @Min(0) estimated_grams: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() scan_id?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() image_url?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() notes?: string;
}

class SavedMealItemDto implements SavedMealItem {
  @IsString() name: string;
  @IsString() @IsOptional() name_vi?: string;
  @IsNumber() @Min(0) calories: number;
  @IsNumber() @Min(0) protein_g: number;
  @IsNumber() @Min(0) carbs_g: number;
  @IsNumber() @Min(0) fat_g: number;
  @IsNumber() @Min(0) estimated_grams: number;
}

class CreateSavedMealDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ type: [SavedMealItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavedMealItemDto)
  items: SavedMealItemDto[];
}

class LogSavedMealDto {
  @ApiProperty() @IsEnum(['breakfast','lunch','dinner','snack']) meal_type: MealType;
}

class ActivityLogDto {
  @ApiProperty() @IsEnum(['running','walking','cycling','swimming','gym','yoga','football','basketball','other']) activity_type: ActivityType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() activity_name?: string;
  @ApiProperty() @IsInt() @Min(1) duration_min: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() calories_burned?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() logged_at?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

@ApiTags('Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('log')
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Post()
  create(@Body() dto: CreateLogDto, @Request() req: any) {
    return this.logService.createLog({
      ...dto,
      user_id: req.user.id,
      source: dto.scan_id ? 'ai_scan' : 'manual_entry' as LogSource,
      unit: 'gram',
      logged_at: new Date().toISOString(),
    });
  }

  @Get('daily')
  getDaily(@Query('date') date: string, @Request() req: any) {
    const d = date ?? new Date().toISOString().split('T')[0];
    return this.logService.getDailyLog(req.user.id, d);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.logService.deleteLog(id, req.user.id);
  }

  // ---- Saved Meals ----

  @Get('saved-meals')
  getSavedMeals(@Request() req: any) {
    return this.logService.getSavedMeals(req.user.id);
  }

  @Post('saved-meals')
  createSavedMeal(@Body() dto: CreateSavedMealDto, @Request() req: any) {
    return this.logService.createSavedMeal(req.user.id, dto.name, dto.items);
  }

  @Post('saved-meals/:id/log')
  @HttpCode(HttpStatus.OK)
  logSavedMeal(@Param('id') id: string, @Body() dto: LogSavedMealDto, @Request() req: any) {
    return this.logService.logSavedMeal(req.user.id, id, dto.meal_type);
  }

  @Delete('saved-meals/:id')
  @HttpCode(HttpStatus.OK)
  deleteSavedMeal(@Param('id') id: string, @Request() req: any) {
    return this.logService.deleteSavedMeal(id, req.user.id);
  }

  // ─────────────────────── Activity ───────────────────────

  @Post('activity')
  createActivity(@Body() dto: ActivityLogDto, @Request() req: any) {
    return this.logService.createActivityLog(req.user.id, dto as CreateActivityLogDto);
  }

  @Get('activity')
  getActivities(@Query('date') date: string, @Request() req: any) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return this.logService.getActivityLogs(req.user.id, d);
  }

  @Delete('activity/:id')
  @HttpCode(HttpStatus.OK)
  deleteActivity(@Param('id') id: string, @Request() req: any) {
    return this.logService.deleteActivityLog(id, req.user.id);
  }
}
