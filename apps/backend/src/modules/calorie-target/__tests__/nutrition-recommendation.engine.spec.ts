import { NutritionRecommendationEngine } from '../nutrition-recommendation.engine';

describe('NutritionRecommendationEngine', () => {
  const engine = new NutritionRecommendationEngine();

  it('returns one coherent adult target with rationale and factors', () => {
    const target = engine.calculate({
      age: 35,
      gender: 'male',
      weight_kg: 80,
      height_cm: 178,
      activity_level: 'moderate',
      goal: 'lose_weight',
      health_flags: [],
    }, '2026-06-28', 2200);

    expect(target.status).toBe('ready');
    expect(target.protein_g).toBe(112);
    expect(target.factors.protein_g_per_kg).toBe(1.4);
    expect(target.calories_kcal).toBe(2200);
    expect(target.fat_g).toBe(61);
    expect(target.carbs_g).toBe(301);
    expect(target.fiber_g).toBe(31);
    expect(target.water_ml).toBe(2800);
    expect(target.rationale.protein).toContain('lose_weight');
    expect(target.algorithm_version).toBe('daily-nutrition-v1');
  });

  it.each([
    { age: 16, health_flags: [] },
    { age: 30, health_flags: ['pregnant'] },
    { age: 45, health_flags: ['kidney_disease'] },
  ] as const)('does not apply the general adult formula to special profiles', ({ age, health_flags }) => {
    const target = engine.calculate({
      age,
      gender: 'female',
      weight_kg: 60,
      height_cm: 165,
      activity_level: 'light',
      goal: 'maintain',
      health_flags: [...health_flags],
    }, '2026-06-28', 1900);

    expect(target.status).toBe('clinician_guidance');
    expect(target.protein_g).toBeUndefined();
    expect(target.water_ml).toBeUndefined();
    expect(target.warnings[0]).toContain('clinical guidance');
  });

  it('reports missing profile fields instead of inventing defaults', () => {
    const target = engine.calculate({ age: 30 }, '2026-06-28');

    expect(target.status).toBe('needs_profile');
    expect(target.missing_fields).toEqual(expect.arrayContaining([
      'gender',
      'weight_kg',
      'activity_level',
      'goal',
      'daily_calorie_target',
    ]));
    expect(target.protein_g).toBeUndefined();
  });
});
