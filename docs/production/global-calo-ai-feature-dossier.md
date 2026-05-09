# Global Calorie AI Feature Dossier

## Metadata
- Date: 2026-05-08
- Scope: Calorie AI VN product strategy for production scale
- Purpose: Consolidate market scan, product patterns, data strategy, AI pipeline, and go-to-market decisions

## Executive Summary
- Global winners in calorie tracking are converging on AI-assisted logging (photo + barcode + voice), but retention is driven by habit loops, meal planning, coaching, and ecosystem sync rather than image recognition alone.
- A scalable product stack should combine open/public nutrition data (for coverage and speed) with curated local food intelligence (for trust and relevance).
- The fastest path to strong growth is a staged product strategy:
  1. Frictionless logging and trustworthy nutrition output
  2. Personalized meal/workout planning that updates weekly
  3. Behavior and retention engine with social proof and premium upsell

## Market Scan Snapshot

### Leading Product Patterns
- MyFitnessPal: large global food DB, fast logging, barcode, voice, meal scan, meal planner tiering.
- Lifesum: AI-assisted multimodal logging, diets and meal plans, recipe-led guidance, strong UX simplicity.
- Yazio: AI photo logging, fasting + fitness integration, strong habit and progress narrative.
- Lose It: simple daily flow with "Say It. Snap It. Scan It." and long-term social proof.
- Cal AI / SnapCalorie: photo-first growth loop, influencer-heavy acquisition, fast perceived value.
- Noom: behavior-change and psychology-based differentiation.

### Product Positioning Trend
- Utility moat: logging speed + data coverage.
- Trust moat: correction loop, transparent nutrition estimation, user control.
- Retention moat: weekly plans, adaptive coaching, streaks, progress insights.
- Revenue moat: premium plan bundling (meal planner, recipes, deep analytics, integrations).

## Food Database Strategy (Scale + Accuracy)

### Why Single-Source Fails
- Food diversity, regional dishes, homemade recipes, and variable portion sizes make one DB insufficient.
- Barcode coverage and local dish coverage often have inverse strengths.

### Recommended Hybrid Architecture
1. Core Public Sources
- USDA FoodData Central API and datasets (public domain, structured nutrient data, rate-limit governance).
- Open Food Facts (open global product DB, nightly full exports, delta exports, live API).

2. Commercial Layer (Optional by Budget)
- Nutritionix or equivalent for high barcode/brand/menu coverage and enterprise API reliability.

3. Internal Canonical Layer
- Unified food entity model:
  - canonical_food_id
  - aliases (multilingual)
  - nutrient profile per 100g
  - source lineage and confidence
  - version history

4. Localization Layer
- Vietnam-first curated dish set (street food, regional variants, homemade recipes).
- Portion defaults by local serving style (bowl, plate, spoon, cup, piece).

5. UGC + Moderation Layer
- User-submitted foods and recipes.
- AI pre-normalization + reviewer approval queue.
- Auto-dedup by barcode + fuzzy name + nutrient signature.

### Data Governance Rules
- Keep immutable source snapshots for traceability.
- Track confidence and last_verified_at per record.
- Keep nightly ETL + delta refresh pipeline.
- Hard validation for impossible nutrition values.

## Image-to-Calorie Pipeline (Production-Ready)

### End-to-End Flow
1. Input Capture
- One or more meal images, optional voice/text context, optional geotime metadata.

2. Food Recognition
- Detection + segmentation + classification.
- Multi-item scene handling as first-class requirement.

3. Portion Estimation
- Use depth signal when available.
- Fallback to monocular estimation + priors + user quick-adjust controls.

4. Nutrition Mapping
- Match recognized food to canonical DB entity.
- Compute calories/macros and optional micros with uncertainty bounds.

5. Human-in-the-loop Confirmation
- One-tap corrections for item mismatch and portion adjustment.
- Store correction feedback for model retraining and ranking.

6. Log and Insight
- Persist final verified meal entry.
- Update daily budget, macro distribution, and recommendation engine.

### Accuracy Reality and Guardrails
- Food image calorie estimation remains an active research area with persistent portion-estimation difficulty.
- Production design should prioritize "correctable quickly" over "pretend perfect".
- Always expose editable result and confidence-aware messaging.

## Personalized Nutrition and Training Planning

### User Inputs
- Age, sex, height, weight, body goal, activity level, dietary constraints, schedule preference.

### Energy Model
- Basal energy estimate with Mifflin-St Jeor:

For male:
BMR = 10W + 6.25H - 5A + 5

For female:
BMR = 10W + 6.25H - 5A - 161

Where:
- W = weight (kg)
- H = height (cm)
- A = age (years)

- Daily expenditure estimate:
TDEE = BMR x activity_factor

### Calorie Targeting
- Fat loss: TDEE minus 10% to 20%
- Maintenance: near TDEE
- Lean gain: TDEE plus 5% to 15%

### Macro Initialization (practical)
- Protein: 1.6 to 2.2 g per kg body weight
- Fat: 0.6 to 1.0 g per kg body weight
- Carbs: remaining calories

### Workout Planning Baseline
- Follow public health baseline:
  - At least 150 min/week moderate aerobic activity (or equivalent)
  - At least 2 strength sessions/week
- Adapt by adherence, recovery signal, and user constraints.

### Recommendation Loop
- Weekly re-plan based on:
  - adherence score
  - weight trend
  - hunger/energy feedback
  - activity completion

## Growth Strategy (User Acquisition + Retention)

### Acquisition
- Creator-led short-form content (fitness, weight loss, meal prep).
- SEO for local food calorie intent pages (example: calorie per local dish).
- Challenge campaigns (7-day, 14-day, 30-day).

### Activation
- Onboarding under 90 seconds.
- Immediate value in first session:
  - photo scan
  - instant calories/macros
  - first personalized target

### Retention
- Daily streak + reminders tied to mealtime context.
- Weekly review card with actionable next steps.
- Progressive personalization (plan improves after each log correction).

### Monetization
- Free tier: core logging.
- Premium tier:
  - adaptive meal plans
  - workout plan integration
  - advanced insights
  - export/reporting
  - coach AI mode

## UX/UI Principles for Adoption
- Keep one dominant primary action on each screen (scan/log).
- Make correction workflow extremely short (one to three taps).
- Show progress in plain language, not only charts.
- Build trust with stable visual hierarchy and readable contrast.
- Mobile-first interaction zones (thumb-friendly controls).

## Feature Prioritization For Strong Production Growth

### P0 (Must Build)
- Fast multimodal logging: photo + barcode + text/voice fallback.
- Canonical food DB with confidence and correction pipeline.
- Daily target, macro tracking, and progress dashboard.
- Robust auth, profile setup, and baseline personalization.

### P1 (Growth Multipliers)
- Weekly adaptive meal plan.
- Activity/workout recommendation linked to calorie budget.
- Retention loops: streaks, weekly reports, reminders.
- Basic premium paywall and trial flow.

### P2 (Scale and Defensibility)
- Advanced coach AI and behavior interventions.
- Social/community modules and challenge programs.
- Enterprise integrations (wearables, grocery sync, partner APIs).

## Production Risks and Mitigations
- Risk: inaccurate portion estimation.
  - Mitigation: editable output + confidence + correction-first UX.
- Risk: incomplete local food coverage.
  - Mitigation: localized curation queue + user submission workflow.
- Risk: high churn after first week.
  - Mitigation: weekly adaptive plan + reminder strategy + visible progress wins.
- Risk: expensive data/API dependencies.
  - Mitigation: hybrid source architecture and progressive fallback.

## KPI Framework
- Activation: first-day successful log completion rate.
- Retention: D7, D30 retention.
- Product quality: correction rate after AI scan, nutrition confidence acceptance rate.
- Behavior outcome: average weekly adherence to calorie target.
- Monetization: free-to-trial conversion, trial-to-paid conversion, paid retention.

## 90-Day Execution Roadmap

### Phase 1 (Weeks 1-4)
- Stabilize logging flows and food entity canonical model.
- Launch baseline profile-based calorie and macro targeting.
- Implement correction telemetry.

### Phase 2 (Weeks 5-8)
- Release adaptive weekly meal plans and exercise baseline recommendations.
- Add retention loops and progress reports.
- Start SEO landing pages for local dishes.

### Phase 3 (Weeks 9-12)
- Introduce premium features and trial funnel.
- Tighten model quality from correction feedback.
- Run creator campaigns and measure CAC to retention efficiency.

## Decision Recommendations
1. Commit to hybrid food-data architecture from day one.
2. Treat AI scan as assisted logging, not autonomous truth.
3. Prioritize correction UX and weekly plan adaptation for retention.
4. Tie roadmap and go-live gate to measurable KPI targets, not feature count.

## Source Notes (Public Web Scan)
- MyFitnessPal website and premium pages.
- Lifesum website and premium page.
- Yazio website.
- Lose It website.
- Cal AI website.
- SnapCalorie website.
- Open Food Facts data and API pages.
- USDA FoodData Central API guide.
- Nutritionix database and API pages.
- WHO physical activity fact sheet.
- Additional academic scan references from arXiv on food-image calorie estimation.
