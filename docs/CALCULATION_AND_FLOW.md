# Calculation and UX Flow — Calorie AI VN

This document specifies the core calculations, clamps, and recommended UX flows for calorie targeting, adaptive adjustments, and coaching recommendations.

## 1. Inputs (required)
- `weight_kg`, `height_cm`, `age`, `sex` (male|female)
- optional: `body_fat_pct`
- `activity_level` (sedentary, lightly_active, moderately_active, active, very_active)
- `goal` (lose_weight, maintain, gain_weight, gain_muscle, recomp)
- `desired_change_kg` and `target_timeline_weeks` (optional)

## 2. Basal Metabolic Rate (BMR)
- Use Katch–McArdle when `body_fat_pct` is present: $\mathrm{BMR} = 370 + 21.6 \times \mathrm{lean\_mass\_kg}$ where $\mathrm{lean\_mass\_kg} = weight\_kg \times (1 - body\_fat\_pct/100)$. 
- Fallback Mifflin–St Jeor: $\mathrm{BMR} = 10 \times weight + 6.25 \times height - 5 \times age + (5\text{ if male }\,|\,-161\text{ if female})$.

## 3. TDEE
Activity factors:
- sedentary: $1.2$  
- lightly_active: $1.375$  
- moderately_active: $1.55$  
- active: $1.725$  
- very_active: $1.9$

Compute: $\mathrm{TDEE} = \mathrm{BMR} \times activityFactor$.

## 4. Goal factor (nominal)
- lose_weight: $0.8$  
- maintain: $1.0$  
- gain_weight / gain_muscle: $1.1$  
- recomp: $0.92$ (approx)

Raw target: $\mathrm{rawTarget} = \mathrm{TDEE} \times goalFactor$.

## 5. Adaptive ActualTDEE (primary)
Primary adaptive estimate: 
$$\mathrm{ActualTDEE} = \overline{Calories}_{period} - \frac{7700 \times \Delta weight_{period}}{period\_days}$$

Notes:
- Use a smoothing window: $14$ days. Require at least `MIN_DAYS_FOR_ADAPTIVE = 14` days of logged calories/weights before applying adaptive change.

## 6. Safety clamps
- `MAX_DEFICIT_PCT = 0.20` → minimum allowed target: $\max(1200, TDEE \times (1 - 0.20))$.
- `WEEKLY_CHANGE_CAP = 150` kcal/week change in target (prevents large swings).
- `MIN_CALORIES ≈ 1200` for adults unless clinical override.

When computing new target from ActualTDEE: apply weekly cap and min_allowed clamp, and persist `clamp_reason` when hit.

## 7. Protein & Macros (recommendations)
- Protein per goal (g/kg):
  - lose: $1.6$–$2.2$ g/kg (use 1.6 as baseline)
  - maintain: $1.6$ g/kg
  - gain_muscle: $1.8$–$2.2$ g/kg
  - gain_weight: $1.6$–$2.0$ g/kg
  - recomp: $1.8$–$2.2$ g/kg
- Fat: 20–35% of kcal. Carbs: remainder.

## 8. Exercise calories
- Use MET formula: $\mathrm{kcal} \approx MET \times weight\_{kg} \times duration\_{hours}$.
- Steps heuristic: ~0.04 kcal/step (baseline at 65 kg); scale by weight where appropriate and expose per-user override.

## 9. Recomposition and training model (UI & simulation)
- Track strength sessions (sets/reps/weight) and training adherence (sessions completed / planned). 
- Combine training adherence and protein adherence to estimate lean mass gains in simulation and to inform conservative/aggressive target suggestions.

## 10. API contract (example)
`GET /api/calorie-target/weekly-adaptive` → returns:
```json
{
  "algorithm_version": "v1.1",
  "actual_tdee": 2100,
  "prev_target": 2300,
  "new_target": 2150,
  "clamp_reason": "weekly_change_cap",
  "days_logged": 14,
  "weight_logs": [{"date":"2026-05-01","weight_kg":95}]
}
```

## 11. UX flows (high level)
- Onboarding collects inputs and sets realistic timeline. Show expected weekly Δ and probability band.
- Dashboard shows `Why this target?` panel with `actual_tdee`, `clamp_reason`, `algorithm_version`, and a short explanation and links to details.
- Adherence view: show week-by-week logged calories vs target, adherence %, and suggestions (add snacks, increase protein, completed training sessions).
- Advanced: show raw vs clamped target with toggle and audit trail.

## 12. Monitoring & Instrumentation
- Log all adaptive decisions with `algorithm_version`, inputs, days_logged, and clamp_reason into `body_progress` / audit table. Use this to allow replays and simulations.

## 13. Simulation harness
- See `scripts/simulate_personas.js` for a 12-week simulator (used for QA). Expand to model protein and training adherence.

---
Document created for dev + product reference. Adjust numbers after clinical review.
