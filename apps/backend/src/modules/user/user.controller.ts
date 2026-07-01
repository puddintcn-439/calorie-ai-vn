import { Controller, Get, Patch, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsNumber, IsEnum, IsString, IsOptional, Min, Max, IsArray, IsIn, IsObject, IsDateString, IsBoolean, MaxLength } from 'class-validator';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGoal, HealthFlag, HEALTH_FLAGS, GoalPlanDirection, WorkActivityLevel, SweatLevel, ClimateExposure, User } from '@calorie-ai/types';

class GoalPlanDto {
  @IsNumber() @Min(0) @Max(100) @IsOptional() target_kg?: number;
  @IsNumber() @Min(1) @Max(260) @IsOptional() duration_weeks?: number;
  @IsString() @IsOptional() start_date?: string;
  @IsString() @IsOptional() end_date?: string;
  @IsEnum(['loss', 'maintain', 'gain']) @IsOptional() direction?: GoalPlanDirection;
  @IsString() @MaxLength(240) @IsOptional() note?: string;
}

class UpdateProfileDto {
  @IsString() @MaxLength(100) @IsOptional() full_name?: string;
  @IsNumber() @Min(20) @Max(300) @IsOptional() weight_kg?: number;
  @IsNumber() @Min(50) @Max(250) @IsOptional() height_cm?: number;
  @IsNumber() @Min(3) @Max(70) @IsOptional() body_fat_pct?: number;
  @IsDateString() @IsOptional() date_of_birth?: string;
  @IsNumber() @Min(13) @Max(120) @IsOptional() age?: number;
  @IsEnum(['male', 'female']) @IsOptional() gender?: 'male' | 'female';
  @IsEnum(['sedentary','light','moderate','heavy']) @IsOptional() work_activity_level?: WorkActivityLevel;
  @IsNumber() @Min(0) @Max(21) @IsOptional() exercise_sessions_per_week?: number;
  @IsNumber() @Min(0) @Max(600) @IsOptional() exercise_minutes_per_session?: number;
  @IsEnum(['low','moderate','high']) @IsOptional() sweat_level?: SweatLevel;
  @IsEnum(['cool_controlled','temperate','hot_humid','extreme_heat']) @IsOptional() climate_exposure?: ClimateExposure;
  @IsObject() @IsOptional() hydration_schedule?: User['hydration_schedule'];
  @IsEnum([1, 2, 3]) @IsOptional() pregnancy_trimester?: 1 | 2 | 3;
  @IsEnum(['exclusive','partial']) @IsOptional() breastfeeding_level?: 'exclusive' | 'partial';
  @IsEnum(['type_1','type_2','gestational']) @IsOptional() diabetes_type?: 'type_1' | 'type_2' | 'gestational';
  @IsEnum(['not_on_dialysis','hemodialysis','peritoneal_dialysis','unknown']) @IsOptional() kidney_care_status?: 'not_on_dialysis' | 'hemodialysis' | 'peritoneal_dialysis' | 'unknown';
  @IsEnum(['recreational','competitive','elite']) @IsOptional() athlete_level?: 'recreational' | 'competitive' | 'elite';
  @IsObject() @IsOptional() clinician_nutrition_targets?: User['clinician_nutrition_targets'];
  @IsBoolean() @IsOptional() sensitive_nutrition_mode?: boolean;
  @IsEnum(['lose_weight','maintain','gain_muscle']) @IsOptional() goal?: UserGoal;
  @IsArray() @IsIn(HEALTH_FLAGS, { each: true }) @IsOptional() health_flags?: HealthFlag[];
  @IsObject() @IsOptional() goal_plan?: GoalPlanDto | null;
}

@ApiTags('User')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  getProfile(@Request() req: any) {
    return this.userService.getProfile(req.user.id, req.user.email);
  }

  @Patch('profile')
  updateProfile(@Body() dto: UpdateProfileDto, @Request() req: any) {
    return this.userService.updateProfile(req.user.id, dto, req.user.email);
  }
}
