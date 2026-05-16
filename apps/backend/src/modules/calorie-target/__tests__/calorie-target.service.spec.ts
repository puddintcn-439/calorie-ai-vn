import { CalorieTargetService } from '../calorie-target.service';
import { CalculateTargetDto } from '../dto/calorie-target.dto';

describe('CalorieTargetService', () => {
  let service: CalorieTargetService;

  beforeEach(() => {
    service = new CalorieTargetService();
  });

  describe('calculateTarget', () => {
    it('should calculate correct target for male, sedentary, maintain goal', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male',
        activity_level: 'sedentary',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);

      // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
      // TDEE = 1780 * 1.2 = 2136
      // Adjust for goal: 2136 * 1.0 = 2136
      expect(result.bmr).toBe(1780);
      expect(result.tdee).toBe(2136);
      expect(result.daily_calorie_target).toBe(2136);
    });

    it('should calculate correct target for female, moderate, maintain goal', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 65,
        height_cm: 165,
        age: 25,
        gender: 'female',
        activity_level: 'moderate',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);

      // BMR = 10*65 + 6.25*165 - 5*25 - 161 = 650 + 1031.25 - 125 - 161 = 1395.25
      // TDEE = 1395.25 * 1.55 = 2162.64
      expect(result.bmr).toBe(1395);
      expect(result.tdee).toBe(2163);
      expect(result.daily_calorie_target).toBe(2163);
    });

    it('should apply -20% adjustment for lose_weight goal', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male',
        activity_level: 'moderate',
        goal: 'lose_weight',
      };

      const result = service.calculateTarget(dto);

      // BMR = 1780, TDEE = 1780 * 1.55 = 2754
      // Adjust: 2754 * 0.8 = 2203.2
      expect(result.tdee).toBe(2759);
      expect(result.daily_calorie_target).toBe(2207);
    });

    it('should apply +10% adjustment for gain_muscle goal', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 75,
        height_cm: 175,
        age: 28,
        gender: 'male',
        activity_level: 'active',
        goal: 'gain_muscle',
      };

      const result = service.calculateTarget(dto);

      // BMR = 10*75 + 6.25*175 - 5*28 + 5 = 750 + 1093.75 - 140 + 5 = 1708.75
      // TDEE = 1708.75 * 1.725 = 2947.59
      // Adjust: 2947.59 * 1.1 = 3242.35
      expect(result.tdee).toBe(2948);
      expect(result.daily_calorie_target).toBe(3242);
    });

    it('should distribute meal targets correctly', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male',
        activity_level: 'sedentary',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);
      const total = result.daily_calorie_target;

      // Breakfast: 25%, Lunch: 35%, Dinner: 30%, Snack: 10%
      expect(result.target_breakfast_cal).toBe(Math.round(total * 0.25));
      expect(result.target_lunch_cal).toBe(Math.round(total * 0.35));
      expect(result.target_dinner_cal).toBe(Math.round(total * 0.3));
      expect(result.target_snack_cal).toBe(Math.round(total * 0.1));
    });

    it('should include calculation_date in response', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male',
        activity_level: 'sedentary',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);
      expect(result.calculation_date).toBeDefined();
      expect(new Date(result.calculation_date)).toBeInstanceOf(Date);
    });

    it('should handle very_active activity level correctly', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male',
        activity_level: 'very_active',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);

      // BMR = 1780
      // TDEE = 1780 * 1.9 = 3382
      expect(result.tdee).toBe(3382);
    });

    it('should handle light activity level correctly', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male',
        activity_level: 'light',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);

      // BMR = 1780
      // TDEE = 1780 * 1.375 = 2447.5
      expect(result.tdee).toBe(2448);
    });

    it('returns screening copy and general micronutrient targets', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 70,
        height_cm: 170,
        age: 30,
        gender: 'male',
        activity_level: 'moderate',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);

      expect(result.bmi_interpretation).toBe('screening_risk_not_diagnosis');
      expect(result.safety_warnings?.[0]).toContain('screening');
      expect(result.nutrition_targets).toMatchObject({
        sodium_mg_max: 2300,
        free_sugar_pct_max: 10,
        saturated_fat_pct_max: 10,
      });
      expect(result.nutrition_targets?.fiber_g_min).toBe(
        Math.round((result.daily_calorie_target / 1000) * 14),
      );
    });

    it('forces maintenance and medical review for under-18 weight goals', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 60,
        height_cm: 170,
        age: 16,
        gender: 'female',
        activity_level: 'moderate',
        goal: 'lose_weight',
      };

      const result = service.calculateTarget(dto);

      expect(result.effective_goal).toBe('maintain');
      expect(result.medical_review_recommended).toBe(true);
      expect(result.safety_warnings?.join(' ')).toContain('under 18');
    });

    it('forces maintenance for pregnancy, breastfeeding, and eating disorder flags', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 72,
        height_cm: 168,
        age: 32,
        gender: 'female',
        activity_level: 'light',
        goal: 'lose_weight',
        health_flags: ['pregnant', 'breastfeeding', 'eating_disorder_history'],
      };

      const result = service.calculateTarget(dto);

      expect(result.effective_goal).toBe('maintain');
      expect(result.medical_review_recommended).toBe(true);
      expect(result.health_flags).toEqual(['pregnant', 'breastfeeding', 'eating_disorder_history']);
      expect(result.safety_warnings?.join(' ')).toContain('Pregnancy');
      expect(result.safety_warnings?.join(' ')).toContain('disordered eating');
    });

    it('adds medical review warnings for kidney disease, diabetes, and weight-affecting medication', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 82,
        height_cm: 175,
        age: 45,
        gender: 'male',
        activity_level: 'light',
        goal: 'maintain',
        health_flags: ['kidney_disease', 'diabetes', 'weight_affecting_medication'],
      };

      const result = service.calculateTarget(dto);

      expect(result.medical_review_recommended).toBe(true);
      expect(result.safety_warnings?.join(' ')).toContain('Kidney disease');
      expect(result.safety_warnings?.join(' ')).toContain('Diabetes');
      expect(result.safety_warnings?.join(' ')).toContain('medications');
      expect(result.macro_warnings?.join(' ')).toContain('protein');
      expect(result.macro_warnings?.join(' ')).toContain('carb');
    });
  });

  describe('calculateAndUpdateProfile', () => {
    it('should update profile with calculated targets', () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male' as const,
        activity_level: 'sedentary' as const,
        goal: 'maintain' as const,
      };

      const updated = service.calculateAndUpdateProfile(profile);

      expect(updated.daily_calorie_target).toBeDefined();
      expect(updated.target_breakfast_cal).toBeDefined();
      expect(updated.target_lunch_cal).toBeDefined();
      expect(updated.target_dinner_cal).toBeDefined();
      expect(updated.target_snack_cal).toBeDefined();
    });

    it('should return unchanged profile if missing required fields', () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        weight_kg: 80,
        // height_cm missing
      };

      const updated = service.calculateAndUpdateProfile(profile);

      expect(updated).toEqual(profile);
      expect(updated.daily_calorie_target).toBeUndefined();
    });

    it('should handle all required fields present', () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        weight_kg: 65,
        height_cm: 165,
        age: 25,
        gender: 'female' as const,
        activity_level: 'moderate' as const,
        goal: 'maintain' as const,
      };

      const updated = service.calculateAndUpdateProfile(profile);

      expect(updated.daily_calorie_target).toBeGreaterThan(0);
      expect(updated.daily_calorie_target).toBeLessThan(5000);
    });
  });

  describe('BMR edge cases', () => {
    it('should calculate BMR for elderly male correctly', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 75,
        height_cm: 170,
        age: 75,
        gender: 'male',
        activity_level: 'sedentary',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);
      // BMR decreases with age
      expect(result.bmr).toBeLessThan(1600);
    });

    it('should calculate BMR for young female correctly', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 55,
        height_cm: 160,
        age: 20,
        gender: 'female',
        activity_level: 'sedentary',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);
      expect(result.bmr).toBeGreaterThan(1000);
      expect(result.bmr).toBeLessThan(1500);
    });
  });

  describe('meal breakdown distribution', () => {
    it('should sum to 100% of daily target', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male',
        activity_level: 'moderate',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);
      const sum =
        result.target_breakfast_cal +
        result.target_lunch_cal +
        result.target_dinner_cal +
        result.target_snack_cal;

      // Allow for rounding differences (±5 cal)
      expect(Math.abs(sum - result.daily_calorie_target)).toBeLessThanOrEqual(5);
    });

    it('breakfast should be ~25% of total', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male',
        activity_level: 'moderate',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);
      const ratio = result.target_breakfast_cal / result.daily_calorie_target;

      expect(ratio).toBeGreaterThanOrEqual(0.23);
      expect(ratio).toBeLessThanOrEqual(0.27);
    });

    it('lunch should be ~35% of total', () => {
      const dto: CalculateTargetDto = {
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        gender: 'male',
        activity_level: 'moderate',
        goal: 'maintain',
      };

      const result = service.calculateTarget(dto);
      const ratio = result.target_lunch_cal / result.daily_calorie_target;

      expect(ratio).toBeGreaterThanOrEqual(0.33);
      expect(ratio).toBeLessThanOrEqual(0.37);
    });
  });
});
