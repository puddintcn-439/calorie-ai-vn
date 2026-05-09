import { BadRequestException } from '@nestjs/common';
import { CalorieTargetController } from '../calorie-target.controller';
import { CalorieTargetService } from '../calorie-target.service';
import { UserService } from '../../user/user.service';
import { WeeklyAdaptiveService } from '../weekly-adaptive.service';
import { RecommendationService } from '../recommendation.service';
import { CalculateTargetDto } from '../dto/calorie-target.dto';

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    weight_kg: 70,
    height_cm: 170,
    age: 30,
    gender: 'male',
    activity_level: 'moderate',
    goal: 'maintain',
    ...overrides,
  };
}

describe('CalorieTargetController', () => {
  let controller: CalorieTargetController;

  let calorieTargetService: jest.Mocked<CalorieTargetService>;
  let userService: jest.Mocked<UserService>;
  let weeklyAdaptiveService: jest.Mocked<WeeklyAdaptiveService>;
  let recommendationService: jest.Mocked<RecommendationService>;

  beforeEach(() => {
    calorieTargetService = {
      calculateTarget: jest.fn(),
      calculateAndUpdateProfile: jest.fn(),
    } as unknown as jest.Mocked<CalorieTargetService>;

    userService = {
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    weeklyAdaptiveService = {
      calculateWeeklyAdjustment: jest.fn(),
      applyWeeklyAdjustment: jest.fn(),
    } as unknown as jest.Mocked<WeeklyAdaptiveService>;

    recommendationService = {
      getWeeklyRecommendations: jest.fn(),
      getWeeklyMealPlan: jest.fn(),
    } as unknown as jest.Mocked<RecommendationService>;

    controller = new CalorieTargetController(
      calorieTargetService,
      userService,
      weeklyAdaptiveService,
      recommendationService,
    );
  });

  describe('calculateTarget', () => {
    it('returns calculated target for valid dto', async () => {
      const dto: CalculateTargetDto = {
        weight_kg: 70,
        height_cm: 170,
        age: 30,
        gender: 'male',
        activity_level: 'moderate',
        goal: 'maintain',
      };

      const expected = {
        daily_calorie_target: 2200,
        bmr: 1600,
        tdee: 2200,
        target_breakfast_cal: 550,
        target_lunch_cal: 770,
        target_dinner_cal: 660,
        target_snack_cal: 220,
        calculation_date: new Date().toISOString(),
      };

      calorieTargetService.calculateTarget.mockReturnValue(expected);

      await expect(controller.calculateTarget(dto)).resolves.toEqual(expected);
      expect(calorieTargetService.calculateTarget).toHaveBeenCalledWith(dto);
    });

    it('throws BadRequestException when service fails', async () => {
      calorieTargetService.calculateTarget.mockImplementation(() => {
        throw new Error('invalid profile');
      });

      await expect(
        controller.calculateTarget({} as CalculateTargetDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyTarget', () => {
    it('loads profile from req.user and returns target', async () => {
      const req = { user: { id: 'user-1', email: 'user@example.com' } };
      const profile = makeProfile();
      const expected = {
        daily_calorie_target: 2000,
        bmr: 1600,
        tdee: 2000,
        target_breakfast_cal: 500,
        target_lunch_cal: 700,
        target_dinner_cal: 600,
        target_snack_cal: 200,
        calculation_date: new Date().toISOString(),
      };

      userService.getProfile.mockResolvedValue(profile as any);
      calorieTargetService.calculateTarget.mockReturnValue(expected);

      await expect(controller.getMyTarget(req)).resolves.toEqual(expected);
      expect(userService.getProfile).toHaveBeenCalledWith('user-1', 'user@example.com');
    });

    it('throws when profile is not found', async () => {
      userService.getProfile.mockResolvedValue(null as any);

      await expect(
        controller.getMyTarget({ user: { id: 'missing', email: 'missing@example.com' } }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when profile is incomplete', async () => {
      userService.getProfile.mockResolvedValue(makeProfile({ height_cm: undefined }) as any);

      await expect(
        controller.getMyTarget({ user: { id: 'user-1', email: 'user@example.com' } }),
      ).rejects.toThrow('Incomplete user profile for calorie calculation');
    });
  });

  describe('getTargetForUser', () => {
    it('returns target for target user id', async () => {
      const profile = makeProfile({ id: 'user-2' });
      const expected = {
        daily_calorie_target: 2100,
        bmr: 1600,
        tdee: 2100,
        target_breakfast_cal: 525,
        target_lunch_cal: 735,
        target_dinner_cal: 630,
        target_snack_cal: 210,
        calculation_date: new Date().toISOString(),
      };

      userService.getProfile.mockResolvedValue(profile as any);
      calorieTargetService.calculateTarget.mockReturnValue(expected);

      await expect(controller.getTargetForUser('user-2')).resolves.toEqual(expected);
      expect(userService.getProfile).toHaveBeenCalledWith('user-2');
    });

    it('throws when target user profile is missing', async () => {
      userService.getProfile.mockResolvedValue(null as any);

      await expect(controller.getTargetForUser('missing')).rejects.toThrow(
        'User profile not found',
      );
    });
  });

  describe('applyMyWeeklyAdjustment', () => {
    it('applies weekly adjustment for authenticated user', async () => {
      const req = { user: { id: 'user-1', email: 'user@example.com' } };
      const profile = makeProfile();
      const expected = {
        user_id: 'user-1',
        original_daily_target: 2000,
        adjusted_daily_target: 1940,
        adjustment_percentage: -3,
        adherence_last_week: 120,
        recommendation: 'You are eating slightly above target.',
        last_updated: new Date().toISOString(),
      };

      userService.getProfile.mockResolvedValue(profile as any);
      weeklyAdaptiveService.applyWeeklyAdjustment.mockResolvedValue(expected as any);

      await expect(controller.applyMyWeeklyAdjustment(req)).resolves.toEqual(expected);
      expect(weeklyAdaptiveService.applyWeeklyAdjustment).toHaveBeenCalledWith(
        'user-1',
        profile,
      );
    });

    it('throws when profile not found for weekly adjustment', async () => {
      userService.getProfile.mockResolvedValue(null as any);

      await expect(
        controller.applyMyWeeklyAdjustment({ user: { id: 'user-1', email: 'user@example.com' } }),
      ).rejects.toThrow('User profile not found');
    });
  });

  describe('getMyRecommendations', () => {
    it('returns recommendations for authenticated user', async () => {
      const req = { user: { id: 'user-1', email: 'user@example.com' } };
      const profile = makeProfile();
      const expected = {
        user_id: 'user-1',
        date: '2026-05-09',
        daily_target: 2000,
        remaining_calories: 800,
        meals: [],
        weekly_insights: {
          average_adherence: 100,
          trend: 'stable',
          suggestion: 'Keep up your consistent eating habits.',
        },
      };

      userService.getProfile.mockResolvedValue(profile as any);
      recommendationService.getWeeklyRecommendations.mockResolvedValue(expected as any);

      await expect(controller.getMyRecommendations(req)).resolves.toEqual(expected);
      expect(recommendationService.getWeeklyRecommendations).toHaveBeenCalledWith(
        'user-1',
        profile,
      );
    });

    it('throws when profile not found for recommendations', async () => {
      userService.getProfile.mockResolvedValue(null as any);

      await expect(
        controller.getMyRecommendations({ user: { id: 'user-1', email: 'user@example.com' } }),
      ).rejects.toThrow('User profile not found');
    });
  });
});
