# Emotional Fit-Gap and Direction

## Why this note
Capture product direction so implementation stays aligned with real user psychology, not only feature delivery.

## User truth
Users usually do not open a weight-loss app because they want AI, macros, or dashboards.
They open it because they want to feel attractive, confident, and in control again without suffering.

## Current fit (what is already strong)
1. Low-friction logging: image, text, voice, receipt, barcode, search.
2. Daily feedback loop: dashboard, recommendations, reminders, streak/badges.
3. Editability and recovery: users can correct scan results before saving.

## Current gaps (what still needs direction)
1. Emotional entry point is weak on auth screens and app positioning.
2. Some copy can still feel technical or judgmental.
3. Real-life contexts are not explicit enough (stress, period, overtime, social events, travel).
4. Progress storytelling is still data-first, not confidence-first.

## Product direction
Reposition from calorie tracker to confidence companion.

Core promise:
- Help users become more confident and look better while keeping life realistic and sustainable.

## UX writing guardrails
1. Avoid guilt language.
- Avoid: "Bạn vượt calo" as a standalone warning.
- Prefer: "Hơi dư một chút, vẫn có thể điều chỉnh ở bữa sau."
2. Lead with reassurance, then action.
3. Keep language warm, short, non-judgmental.

## Immediate implementation checklist
1. Auth messaging pass (emotional-first framing).
2. Dashboard reassurance-first card and supportive delta copy.
3. Anti-guilt copy audit for scan, reminder, and recommendation surfaces.
4. Add real-life context quick switches in next iteration.

## KPI alignment
1. D1 activation: first successful log within first session.
2. Median time-to-log <= 10s.
3. D7 retention lift after emotional copy and reassurance UX pass.
4. Reduced churn after high-calorie days (anti-guilt effectiveness).

## Related files
- apps/mobile/app/(auth)/login.tsx
- apps/mobile/app/(auth)/register.tsx
- apps/mobile/app/(tabs)/index.tsx
- docs/delivery/global-ai-health-companion-execution-plan.md
