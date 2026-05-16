import { Controller, Get, Patch, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsNumber, IsEnum, IsString, IsOptional, Min, Max, IsArray, IsIn } from 'class-validator';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActivityLevel, UserGoal, HealthFlag, HEALTH_FLAGS } from '@calorie-ai/types';

class UpdateProfileDto {
  @IsString() @IsOptional() full_name?: string;
  @IsNumber() @Min(20) @Max(300) @IsOptional() weight_kg?: number;
  @IsNumber() @Min(50) @Max(250) @IsOptional() height_cm?: number;
  @IsNumber() @Min(13) @Max(120) @IsOptional() age?: number;
  @IsEnum(['male', 'female']) @IsOptional() gender?: 'male' | 'female';
  @IsEnum(['sedentary','light','moderate','active','very_active']) @IsOptional() activity_level?: ActivityLevel;
  @IsEnum(['lose_weight','maintain','gain_muscle']) @IsOptional() goal?: UserGoal;
  @IsNumber() @Min(500) @IsOptional() daily_calorie_target?: number;
  @IsNumber() @Min(0) @IsOptional() target_breakfast_cal?: number;
  @IsNumber() @Min(0) @IsOptional() target_lunch_cal?: number;
  @IsNumber() @Min(0) @IsOptional() target_dinner_cal?: number;
  @IsNumber() @Min(0) @IsOptional() target_snack_cal?: number;
  @IsArray() @IsIn(HEALTH_FLAGS, { each: true }) @IsOptional() health_flags?: HealthFlag[];
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
