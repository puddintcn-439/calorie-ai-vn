# Calculation and UX Flow

This document describes the current calorie target, macro target, safety guardrail, and adaptive adjustment behavior.

## Inputs

Required:
- `weight_kg`, `height_cm`, `age`, `gender`
- `activity_level`: `sedentary`, `light`, `moderate`, `active`, `very_active`
- `goal`: `lose_weight`, `maintain`, `gain_muscle`

Optional:
- `body_fat_pct`
- `health_flags`: `pregnant`, `breastfeeding`, `kidney_disease`, `diabetes`, `eating_disorder_history`, `weight_affecting_medication`
- `goal_plan`: JSON object for planned weight change, e.g. `{ "direction": "loss", "target_kg": 3, "duration_weeks": 8 }`

## BMI

- Use adult global BMI cutoffs for users 18+.
- Display BMI as screening/risk, not diagnosis.
- For users under 18, show a warning that adult BMI cutoffs are not diagnostic and clinician/growth-chart review is needed.

## BMR

- Prefer Katch-McArdle only when `body_fat_pct` is in a realistic range: 3-70%.
- Otherwise use Mifflin-St Jeor.

Mifflin-St Jeor:
- Male: `10 * weight_kg + 6.25 * height_cm - 5 * age + 5`
- Female: `10 * weight_kg + 6.25 * height_cm - 5 * age - 161`

Katch-McArdle:
- `lean_mass_kg = weight_kg * (1 - body_fat_pct / 100)`
- `BMR = 370 + 21.6 * lean_mass_kg`

## TDEE

Activity factors:
- `sedentary`: 1.2
- `light`: 1.375
- `moderate`: 1.55
- `active`: 1.725
- `very_active`: 1.9

`TDEE = BMR * activity_factor`

## Goal Adjustment

Default goal factors:
- `lose_weight`: 0.8
- `maintain`: 1.0
- `gain_muscle`: 1.1

Safety floors:
- Do not allow deficit greater than 20% of TDEE.
- Do not go below max of sex floor and `BMR * 1.1`.
- Sex floors: female 1200 kcal/day, male 1500 kcal/day.

Maintenance-only overrides:
- Age under 18
- Pregnancy
- Breastfeeding
- Eating-disorder history/risk
- Underweight user requesting weight loss

## Goal Plan

`users.goal_plan` stores a user-facing weight-change plan. `target_kg` means total planned kg change, not destination body weight.

Server-side rules:
- Sanitize direction, target kg, duration, dates, and note before saving.
- Recalculate calorie target on the backend from profile TDEE, not from the previous daily target.
- Loss plans are capped by the same 20% TDEE deficit and calorie floors as base target calculation.
- Gain plans are capped by the conservative `gain_muscle` target.
- Under-18, pregnancy/breastfeeding, eating-disorder history/risk, and underweight-loss profiles are changed to maintenance-only.
- The persisted plan includes `computed_daily_calorie_target`, `daily_calorie_delta`, `weekly_rate_kg`, `safety_status`, and `warnings`.

## Health Guardrails

The app remains a wellness tool, not a medical treatment planner.

Medical-review warnings are shown for:
- Age under 18
- Pregnancy or breastfeeding
- Kidney disease
- Diabetes
- Eating-disorder history/risk
- Medication that may affect weight

Automatic weekly target changes are paused when medical review is recommended.

## Macros

Protein:
- `lose_weight`: 1.6 g/kg
- `maintain`: 1.6 g/kg
- `gain_muscle`: 1.9 g/kg

Fat:
- Baseline 25% of calories.

Carbs:
- Remaining calories after protein and fat.
- Warn if carbs are below 45% of calories or below 130 g/day.

Kidney disease and diabetes flags add warnings that protein, sodium, carb, and sugar targets are not individualized.

## General Nutrition Quality Targets

Computed from daily calorie target:
- Fiber minimum: `14 g per 1000 kcal`
- Sodium maximum: `2300 mg/day`
- Free sugar maximum: `<10% kcal`
- Added sugar maximum: `<10% kcal`
- Saturated fat maximum: `<10% kcal`

The app may receive only total sugar from barcode data, so UI must explain that free sugar/added sugar may not always be distinguishable.

Daily log responses now return actual totals for:
- `total_fiber_g`
- `total_sugar_g`
- `total_saturated_fat_g`
- `total_sodium_mg`

They also return `nutrition_quality_coverage` so the UI can avoid overclaiming precision when logged items do not include these nutrients. Barcode and food-database logs provide the strongest coverage; AI scan items only store these fields when the model/source supplies them.

## Weekly Adaptive Adjustment

Primary adaptive estimate:

`ActualTDEE = average_calories - (7700 * weight_change_kg / period_days)`

Current rules:
- Smoothing window: 14 days.
- Require enough calorie and weight logs before using ActualTDEE.
- Weekly change cap: 150 kcal/week.
- Apply the same floors and deficit limits as the base target.
- Pause automatic adjustment when medical review is recommended.

## UX Rules

- Show "screening/risk", not diagnosis.
- Explain when app changes the requested goal to maintenance.
- Keep medical copy short and action-oriented.
- Link future disease-specific plans to clinical review, not generic AI advice.
- Surface profile safety setup on Today when age, body metrics, or health flags are missing.
