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
    expect(target.water_ml).toBe(2600);
    expect(target.rationale.protein).toContain('lose_weight');
    expect(target.algorithm_version).toBe('daily-nutrition-v4');
    expect(target.methodology.protein_g).toMatchObject({
      evidence_level: 'evidence_informed_heuristic',
      is_user_adjustable: false,
    });
    expect(target.methodology.fat_g).toMatchObject({
      evidence_level: 'guideline_range_with_product_default',
      reference_range: { min: 20, max: 35, unit: '% energy' },
    });
    expect(target.methodology.water_ml).toMatchObject({
      evidence_level: 'evidence_informed_heuristic',
      is_product_guardrail: true,
    });
    expect(target.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'who-healthy-diet', evidence_level: 'guideline' }),
    ]));
  });

  it.each([
    { age: 16, health_flags: [] },
    { age: 30, health_flags: ['pregnant'] },
    { age: 30, health_flags: ['breastfeeding'] },
    { age: 45, health_flags: ['kidney_disease'] },
    { age: 28, health_flags: ['eating_disorder_history'] },
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

  it('keeps diabetes in wellness mode but warns that carbohydrate targets are not treatment', () => {
    const target = engine.calculate({
      age: 42,
      gender: 'male',
      weight_kg: 78,
      activity_level: 'light',
      goal: 'maintain',
      health_flags: ['diabetes'],
    }, '2026-06-28', 2100);

    expect(target.status).toBe('ready');
    expect(target.warnings.join(' ')).toContain('not a treatment plan');
    expect(target.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'ada-standards-care' }),
    ]));
  });

  it('does not use an expired clinician target', () => {
    const target = engine.calculate({
      age: 45,
      gender: 'female',
      weight_kg: 60,
      activity_level: 'light',
      goal: 'maintain',
      health_flags: ['kidney_disease'],
      clinician_nutrition_targets: {
        protein_g: 55,
        source: 'Renal dietitian',
        confirmed_at: '2025-01-01T00:00:00.000Z',
        expires_at: '2025-12-31T00:00:00.000Z',
        status: 'active',
      },
    }, '2026-06-28', 1800);

    expect(target.status).toBe('clinician_guidance');
    expect(target.protein_g).toBeUndefined();
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

  it('adjusts water for reported sweat without changing the protein formula', () => {
    const target = engine.calculate({
      age: 35,
      gender: 'male',
      weight_kg: 80,
      activity_level: 'moderate',
      work_activity_level: 'sedentary',
      exercise_sessions_per_week: 4,
      exercise_minutes_per_session: 45,
      sweat_level: 'high',
      goal: 'maintain',
      health_flags: [],
    }, '2026-06-28', 2200);

    expect(target.status).toBe('ready');
    expect(target.water_ml).toBe(3100);
    expect(target.factors.sweat_level).toBe('high');
  });

  it('uses the midpoint water estimate for a 74 kg low-activity adult', () => {
    const target = engine.calculate({
      age: 30,
      gender: 'male',
      weight_kg: 74,
      activity_level: 'light',
      goal: 'maintain',
      health_flags: [],
    }, '2026-07-01', 2100);

    expect(target.status).toBe('ready');
    expect(target.water_ml).toBe(2400);
  });

  it('adds a conservative climate adjustment for hot and extreme heat exposure', () => {
    const base = {
      age: 30,
      gender: 'male' as const,
      weight_kg: 74,
      activity_level: 'light' as const,
      goal: 'maintain' as const,
      health_flags: [],
    };

    expect(engine.calculate({ ...base, climate_exposure: 'hot_humid' }, '2026-07-01', 2100).water_ml).toBe(2650);
    expect(engine.calculate({ ...base, climate_exposure: 'extreme_heat' }, '2026-07-01', 2100).water_ml).toBe(2900);
  });

  it('uses an active clinician plan for a kidney profile without applying the adult formula', () => {
    const target = engine.calculate({
      age: 45,
      health_flags: ['kidney_disease'],
      clinician_nutrition_targets: {
        protein_g: 55,
        water_ml: 1800,
        sodium_mg_max: 1500,
        source: 'Renal dietitian',
        reason: 'Individual CKD care plan',
        confirmed_at: '2026-06-28T00:00:00.000Z',
        status: 'active',
        plan_version: 1,
      },
    }, '2026-06-28');

    expect(target.status).toBe('clinician_target');
    expect(target.protein_g).toBe(55);
    expect(target.water_ml).toBe(1800);
    expect(target.sodium_mg_max).toBe(1500);
    expect(target.rationale.protein).toContain('CKD');
    expect(target.methodology.protein_g?.evidence_level).toBe('clinician_target');
    expect(target.warnings).toContainEqual(expect.stringMatching(/reported and confirmed by the user/i));
  });

  it('labels a trusted provider plan as verified without a self-attestation warning', () => {
    const target = engine.calculate({
      age: 45,
      health_flags: ['kidney_disease'],
      clinician_nutrition_targets: {
        protein_g: 55,
        source: 'Hospital renal team',
        confirmed_at: '2026-06-28T00:00:00.000Z',
        provenance: 'provider_verified',
        verification_status: 'verified',
        verified_at: '2026-06-28T00:00:00.000Z',
        verified_by: 'provider-123',
        status: 'active',
        plan_version: 1,
      },
    }, '2026-06-28');

    expect(target.rationale.protein).toContain('verified provider plan');
    expect(target.warnings).not.toContainEqual(expect.stringMatching(/not independently verified/i));
  });

  it('recognizes competitive athletes without exceeding the athlete protein cap', () => {
    const target = engine.calculate({
      age: 26,
      gender: 'female',
      weight_kg: 60,
      activity_level: 'active',
      athlete_level: 'competitive',
      goal: 'maintain',
      health_flags: [],
    }, '2026-06-28', 2400);

    expect(target.status).toBe('ready');
    expect(target.protein_g).toBe(84);
    expect(target.rationale.protein).toContain('competitive athlete');
  });
});
