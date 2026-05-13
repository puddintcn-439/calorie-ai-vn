import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CalorieTargetService } from './calorie-target.service';
import { CalculateTargetDto, CalorieTargetResponse } from './dto/calorie-target.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserService } from '../user/user.service';
import { WeeklyAdaptiveService, WeeklyAdaptiveResult } from './weekly-adaptive.service';
import { RecommendationService, WeeklyRecommendations } from './recommendation.service';

@Controller('calorie-target')
export class CalorieTargetController {
  constructor(
    private readonly calorieTargetService: CalorieTargetService,
    private readonly userService: UserService,
    private readonly weeklyAdaptiveService: WeeklyAdaptiveService,
    private readonly recommendationService: RecommendationService,
  ) {}

  /**
   * Calculate calorie target for given user profile
   * POST /calorie-target/calculate
   */
  @Post('calculate')
  @UseGuards(JwtAuthGuard)
  async calculateTarget(
    @Body() dto: CalculateTargetDto,
  ): Promise<CalorieTargetResponse> {
    try {
      return this.calorieTargetService.calculateTarget(dto);
    } catch (error) {
      throw new BadRequestException('Invalid user profile parameters');
    }
  }

  /**
   * Get calorie target for authenticated user
   * GET /calorie-target/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyTarget(@Request() req: any): Promise<CalorieTargetResponse | null> {
    const profile = await this.userService.getProfile(req.user.id, req.user.email);

    if (!profile) {
      throw new BadRequestException('User profile not found');
    }

    if (
      !profile.weight_kg ||
      !profile.height_cm ||
      !profile.age ||
      !profile.gender ||
      !profile.activity_level ||
      !profile.goal
    ) {
      throw new BadRequestException('Incomplete user profile for calorie calculation');
    }

    return this.calorieTargetService.calculateTarget({
      weight_kg: profile.weight_kg,
      height_cm: profile.height_cm,
      age: profile.age,
      gender: profile.gender,
      activity_level: profile.activity_level,
      goal: profile.goal,
    });
  }

  /**
   * Get calorie target for specific user
   * GET /calorie-target/:userId
   */
  @Get(':userId')
  @UseGuards(JwtAuthGuard)
  async getTargetForUser(@Param('userId') userId: string): Promise<CalorieTargetResponse | null> {
    const profile = await this.userService.getProfile(userId);

    if (!profile) {
      throw new BadRequestException('User profile not found');
    }

    if (
      !profile.weight_kg ||
      !profile.height_cm ||
      !profile.age ||
      !profile.gender ||
      !profile.activity_level ||
      !profile.goal
    ) {
      throw new BadRequestException('Incomplete user profile for calorie calculation');
    }

    return this.calorieTargetService.calculateTarget({
      weight_kg: profile.weight_kg,
      height_cm: profile.height_cm,
      age: profile.age,
      gender: profile.gender,
      activity_level: profile.activity_level,
      goal: profile.goal,
    });
  }

  @Post('weekly-adjustment')
  @UseGuards(JwtAuthGuard)
  async applyMyWeeklyAdjustment(@Request() req: any): Promise<WeeklyAdaptiveResult> {
    const profile = await this.userService.getProfile(req.user.id, req.user.email);

    if (!profile) {
      throw new BadRequestException('User profile not found');
    }

    return this.weeklyAdaptiveService.applyWeeklyAdjustment(req.user.id, profile as any);
  }

  /**
   * Preview weekly adjustment without persisting changes
   * GET /calorie-target/weekly-adjustment/preview
   */
  @Get('weekly-adjustment/preview')
  @UseGuards(JwtAuthGuard)
  async previewMyWeeklyAdjustment(@Request() req: any): Promise<WeeklyAdaptiveResult> {
    const profile = await this.userService.getProfile(req.user.id, req.user.email);

    if (!profile) {
      throw new BadRequestException('User profile not found');
    }

    return this.weeklyAdaptiveService.calculateWeeklyAdjustment(req.user.id, profile as any);
  }

  @Get('recommendations/me')
  @UseGuards(JwtAuthGuard)
  async getMyRecommendations(@Request() req: any): Promise<WeeklyRecommendations> {
    const profile = await this.userService.getProfile(req.user.id, req.user.email);

    if (!profile) {
      throw new BadRequestException('User profile not found');
    }

    return this.recommendationService.getWeeklyRecommendations(req.user.id, profile as any);
  }

  @Get('meal-plan/me')
  @UseGuards(JwtAuthGuard)
  async getMyWeeklyMealPlan(@Request() req: any) {
    const profile = await this.userService.getProfile(req.user.id, req.user.email);

    if (!profile) {
      throw new BadRequestException('User profile not found');
    }

    return this.recommendationService.getWeeklyMealPlan(req.user.id, profile as any);
  }
}
