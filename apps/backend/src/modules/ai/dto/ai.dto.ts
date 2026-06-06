import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  MinLength,
  MaxLength,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { BehaviorMemory, DynamicIntervention, InterventionAnalytics, ReminderEffectivenessSummary, SuccessForecast, TodaySummary } from '@calorie-ai/types';

export enum MealHint {
  BREAKFAST = 'breakfast',
  LUNCH = 'lunch',
  DINNER = 'dinner',
  SNACK = 'snack',
}

export class ScanTextDto {
  @ApiProperty({ example: '1 tô phở bò đặc biệt' })
  @IsString()
  @IsNotEmpty()
  text: string;
}

class ScanVoiceContextDto {
  @ApiProperty({ required: false, example: 'mobile_voice' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @ApiProperty({ required: false, example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  device_language?: string;
}

export class ScanVoiceDto {
  @ApiProperty({ example: 'I had one chicken salad and a latte this morning' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(1500)
  transcript: string;

  @ApiProperty({ required: false, example: 'en-US' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @ApiProperty({ required: false, example: 'America/Los_Angeles' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiProperty({ required: false, enum: MealHint })
  @IsOptional()
  @IsEnum(MealHint)
  meal_hint?: MealHint;

  @ApiProperty({ required: false, type: ScanVoiceContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScanVoiceContextDto)
  context?: ScanVoiceContextDto;
}

export class ScanImageDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  image: Express.Multer.File;
}

export class ScanReceiptDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  receipt_image: Express.Multer.File;

  @ApiProperty({ required: false, example: 'en-US' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @ApiProperty({ required: false, example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiProperty({ required: false, example: 'Target' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant_hint?: string;

  @ApiProperty({ required: false, enum: MealHint })
  @IsOptional()
  @IsEnum(MealHint)
  meal_hint?: MealHint;
}

export class RefineScanDto {
  @ApiProperty({ description: 'Original scan_id to refine' })
  @IsString()
  @IsNotEmpty()
  scan_id: string;

  @ApiProperty({ example: 'Thực ra là 2 tô, thêm 1 quả trứng' })
  @IsString()
  @IsNotEmpty()
  context: string;

  @ApiProperty({ description: 'Tên các món đã detect lần đầu', type: [String] })
  @IsString()
  @IsOptional()
  original_items_summary?: string;
}

export class CoachMessageDto {
  @ApiProperty({ example: 'Tối nay tôi nên ăn gì?' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ example: 1200 })
  @IsNumber()
  @Min(0)
  today_calories: number;

  @ApiProperty({ example: 1800 })
  @IsNumber()
  @Min(500)
  target_calories: number;

  @ApiProperty({
    required: false,
    type: Object,
    example: {
      overall: 78,
      label: 'steady',
      nutrition: 82,
      activity: 75,
      consistency: 85,
      recovery: 70,
      next_action: 'complete_plan',
      signals: ['2/3 meals logged', '20 activity minutes logged'],
    },
  })
  @IsOptional()
  health_score?: TodaySummary['health_score'];

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  reminder_effectiveness?: ReminderEffectivenessSummary;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  success_forecast?: SuccessForecast;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  behavior_memory?: BehaviorMemory;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  intervention_analytics?: InterventionAnalytics;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  dynamic_intervention?: DynamicIntervention;
}
