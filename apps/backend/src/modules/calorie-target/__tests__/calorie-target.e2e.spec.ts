import { INestApplication, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { CalorieTargetController } from '../calorie-target.controller';
import { CalorieTargetService } from '../calorie-target.service';
import { UserService } from '../../user/user.service';
import { WeeklyAdaptiveService } from '../weekly-adaptive.service';
import { RecommendationService } from '../recommendation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('CalorieTargetController (e2e)', () => {
  let app: INestApplication;

  const calorieTargetService = {
    calculateTarget: jest.fn(),
  };

  const userService = {
    getProfile: jest.fn(),
  };

  const weeklyAdaptiveService = {
    applyWeeklyAdjustment: jest.fn(),
  };

  const recommendationService = {
    getWeeklyRecommendations: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CalorieTargetController],
      providers: [
        { provide: CalorieTargetService, useValue: calorieTargetService },
        { provide: UserService, useValue: userService },
        { provide: WeeklyAdaptiveService, useValue: weeklyAdaptiveService },
        { provide: RecommendationService, useValue: recommendationService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'user-1', sub: 'user-1', email: 'user@example.com' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /calorie-target/calculate returns calculated target', async () => {
    calorieTargetService.calculateTarget.mockReturnValue({
      daily_calorie_target: 2200,
      bmr: 1600,
      tdee: 2200,
      target_breakfast_cal: 550,
      target_lunch_cal: 770,
      target_dinner_cal: 660,
      target_snack_cal: 220,
      calculation_date: '2026-05-09T00:00:00.000Z',
    });

    const res = await request(app.getHttpServer())
      .post('/calorie-target/calculate')
      .send({
        weight_kg: 70,
        height_cm: 170,
        age: 30,
        gender: 'male',
        activity_level: 'moderate',
        goal: 'maintain',
      })
      .expect(201);

    expect(res.body.daily_calorie_target).toBe(2200);
  });

  it('POST /calorie-target/calculate returns 400 when service throws', async () => {
    calorieTargetService.calculateTarget.mockImplementation(() => {
      throw new Error('invalid');
    });

    await request(app.getHttpServer())
      .post('/calorie-target/calculate')
      .send({
        weight_kg: 70,
        height_cm: 170,
        age: 30,
        gender: 'male',
        activity_level: 'moderate',
        goal: 'maintain',
      })
      .expect(400);
  });

  it('GET /calorie-target/me returns calculated target from authenticated profile', async () => {
    userService.getProfile.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      weight_kg: 70,
      height_cm: 170,
      age: 30,
      gender: 'male',
      activity_level: 'moderate',
      goal: 'maintain',
    });

    calorieTargetService.calculateTarget.mockReturnValue({
      daily_calorie_target: 2200,
      bmr: 1600,
      tdee: 2200,
      target_breakfast_cal: 550,
      target_lunch_cal: 770,
      target_dinner_cal: 660,
      target_snack_cal: 220,
      calculation_date: '2026-05-09T00:00:00.000Z',
    });

    const res = await request(app.getHttpServer())
      .get('/calorie-target/me')
      .expect(200);

    expect(res.body.daily_calorie_target).toBe(2200);
  });

  it('GET /calorie-target/me returns 400 when profile is incomplete', async () => {
    userService.getProfile.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      weight_kg: 70,
      // missing required fields
    });

    await request(app.getHttpServer())
      .get('/calorie-target/me')
      .expect(400);
  });

  it('GET /calorie-target/:userId returns target for requested user', async () => {
    userService.getProfile.mockResolvedValue({
      id: 'user-2',
      email: 'user2@example.com',
      weight_kg: 65,
      height_cm: 165,
      age: 28,
      gender: 'female',
      activity_level: 'light',
      goal: 'maintain',
    });

    calorieTargetService.calculateTarget.mockReturnValue({
      daily_calorie_target: 1900,
      bmr: 1450,
      tdee: 1900,
      target_breakfast_cal: 475,
      target_lunch_cal: 665,
      target_dinner_cal: 570,
      target_snack_cal: 190,
      calculation_date: '2026-05-09T00:00:00.000Z',
    });

    const res = await request(app.getHttpServer())
      .get('/calorie-target/user-2')
      .expect(200);

    expect(res.body.daily_calorie_target).toBe(1900);
  });

  it('POST /calorie-target/weekly-adjustment applies adjustment for authenticated user', async () => {
    userService.getProfile.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      daily_calorie_target: 2000,
    });

    weeklyAdaptiveService.applyWeeklyAdjustment.mockResolvedValue({
      user_id: 'user-1',
      original_daily_target: 2000,
      adjusted_daily_target: 1940,
      adjustment_percentage: -3,
      adherence_last_week: 120,
      recommendation: 'You are eating slightly above target.',
      last_updated: '2026-05-09T00:00:00.000Z',
    });

    const res = await request(app.getHttpServer())
      .post('/calorie-target/weekly-adjustment')
      .expect(201);

    expect(res.body.adjusted_daily_target).toBe(1940);
  });

  it('POST /calorie-target/weekly-adjustment returns 400 when profile not found', async () => {
    userService.getProfile.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/calorie-target/weekly-adjustment')
      .expect(400);
  });

  it('GET /calorie-target/recommendations/me returns recommendations for authenticated user', async () => {
    userService.getProfile.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      daily_calorie_target: 2000,
      target_breakfast_cal: 500,
      target_lunch_cal: 700,
      target_dinner_cal: 600,
      target_snack_cal: 200,
    });

    recommendationService.getWeeklyRecommendations.mockResolvedValue({
      user_id: 'user-1',
      date: '2026-05-09',
      daily_target: 2000,
      remaining_calories: 800,
      meals: [],
      weekly_insights: {
        average_adherence: 95,
        trend: 'stable',
        suggestion: 'Keep up your consistent eating habits.',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/calorie-target/recommendations/me')
      .expect(200);

    expect(res.body.remaining_calories).toBe(800);
  });

  it('GET /calorie-target/recommendations/me returns 400 when profile not found', async () => {
    userService.getProfile.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/calorie-target/recommendations/me')
      .expect(400);
  });
});
