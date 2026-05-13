import { CalorieTargetService } from '../calorie-target.service';

describe('CalorieTargetService - Katch & clamps', () => {
  let service: CalorieTargetService;

  beforeEach(() => {
    service = new CalorieTargetService();
  });

  it('uses Katch–McArdle when body_fat_pct provided', () => {
    const dto: any = {
      weight_kg: 80,
      height_cm: 180,
      age: 30,
      gender: 'male',
      activity_level: 'sedentary',
      goal: 'maintain',
      body_fat_pct: 20,
    };

    const res = service.calculateTarget(dto);

    // LBM = 80 * (1 - 0.2) = 64
    // BMR = 370 + 21.6 * 64 = 370 + 1382.4 = 1752.4 -> ~1752
    expect(res.bmr).toBeGreaterThanOrEqual(1750);
    expect(res.bmr).toBeLessThanOrEqual(1760);
  });

  it('ensures daily target respects min_allowed and max_deficit_pct', () => {
    const cases: any[] = [
      { weight_kg: 50, height_cm: 160, age: 22, gender: 'female', activity_level: 'sedentary', goal: 'lose_weight' },
      { weight_kg: 90, height_cm: 185, age: 40, gender: 'male', activity_level: 'light', goal: 'lose_weight' },
    ];

    for (const c of cases) {
      const dto: any = { ...c };
      const res = service.calculateTarget(dto);
      const minAllowed = Math.max(c.gender === 'female' ? 1200 : 1500, Math.round(res.bmr * 1.1));
      const minByDeficit = Math.round(res.tdee * (1 - 0.2));
      expect(res.daily_calorie_target).toBeGreaterThanOrEqual(minAllowed);
      expect(res.daily_calorie_target).toBeGreaterThanOrEqual(minByDeficit);
    }
  });
});
