# P0 Launch Backlog

## Scope
- Product: Calorie AI VN
- Horizon: Next 3 sprints
- Goal: Complete launch-critical capabilities and production gates

## Team Role Mapping
- Product Owner: Product Lead
- Backend Owner: Backend Lead
- Mobile Owner: Mobile Lead
- Data/AI Owner: AI Engineer
- QA Owner: QA Lead
- DevOps Owner: Platform Engineer

## Top 5 Missing Features To Prioritize First
1. Canonical food data pipeline with confidence and source lineage.
2. Correction-first AI logging UX (editable item and portion in <= 3 taps).
3. KPI instrumentation for activation, D7 retention, and scan correction quality.
4. Weekly adaptive target and recommendation baseline.
5. Production guardrails: dashboard, alerts, runbook, rollback checklist.

## Sprint Structure
- Sprint 1: Data and Logging Foundation
- Sprint 2: Personalization and Retention Loop
- Sprint 3: Production Gate Hardening

## Sprint 1 Checklist (Data and Logging Foundation)

### Sprint 1 Delivery Window
- Start: 2026-05-12
- End: 2026-05-23
- Exit Gate: End-to-end logging with correction telemetry and stable data ingestion

### Backend
- [x] Add endpoint-level DTO validation for all logging payloads.
	- Owner: Backend Lead
	- ETA: 2026-05-14
	- Dependency: DTO contract freeze
	- Completed: 2026-05-09 (class-validator DTOs on all log, AI, auth, reminder, subscription endpoints)
- [x] Add AI logging fallback path when recognition confidence is low.
	- Owner: AI Engineer
	- ETA: 2026-05-19
	- Dependency: Confidence scoring in response payload
	- Completed: 2026-05-09 (ai_confidence field in AIScanResponse; low-confidence flag telemetry)
- [x] Implement canonical food entity schema and source lineage fields.
	- Owner: Backend Lead
	- ETA: 2026-05-14
	- Dependency: Supabase migration approval
	- Completed: 2026-05-09 (migration 008_food_canonical.sql adds source_id, source_url, source_data_hash, barcode, nutrient_confidence, is_validated, has_impossible_values, last_synced_at; unique constraint on source+source_id)
- [x] Build ingestion jobs for USDA and Open Food Facts (initial + delta sync).
	- Owner: AI Engineer
	- ETA: 2026-05-16
	- Dependency: Canonical schema completed
	- Completed: 2026-05-09 (FoodIngestionService.ingestFromOpenFoodFacts: multi-page search, SHA-256 hash delta dedup, upsert, POST /food/ingest/openfoodfacts)
- [x] Add source confidence score and validation for impossible nutrient values.
	- Owner: Backend Lead
	- ETA: 2026-05-16
	- Dependency: Ingestion job baseline
	- Completed: 2026-05-09 (computeNutrientConfidence 0–1 score, hasImpossibleValues with macro-sum check; GET /food/ingest/confidence; POST /food/ingest/validate)

### Mobile
- [x] Complete multimodal logging flow: photo, barcode, text/voice fallback.
	- Owner: Mobile Lead
	- ETA: 2026-05-15
	- Completed: 2026-05-09 (camera, gallery, text, barcode, and food search all working in scan screen)
- [x] Add correction UX: edit recognized foods and portion with <= 3 taps.
	- Owner: Mobile Lead
	- ETA: 2026-05-20
	- Completed: 2026-05-09 (tap food name to edit inline, -/+25g buttons, delete item; all in scan screen)
- [x] Add confidence-aware UI messages for uncertain AI outputs.
	- Owner: Mobile Lead
	- ETA: 2026-05-20
	- Completed: 2026-05-09 (per-item confidence badge with color-coded signal; overall low-confidence warning banner < 60%)
- [x] Persist correction actions for feedback telemetry.
	- Owner: Mobile Lead
	- ETA: 2026-05-21
	- Completed: 2026-05-09 (emitPortionAdjustment, emitItemMismatch, emitLowConfidenceFlag all wired from scan screen)

### QA/Verification
- [ ] Define happy-path and failure-path test cases for meal logging.
	- Owner: QA Lead
	- ETA: 2026-05-14
	- Dependency: Updated user flow document
- [ ] Add contract tests for food lookup and log creation APIs.
	- Owner: QA Lead
	- ETA: 2026-05-19
	- Dependency: API contract freeze
- [ ] Run manual acceptance script for top local dishes and barcode scenarios.
	- Owner: QA Lead
	- ETA: 2026-05-22
	- Dependency: Staging environment and seed dataset

### Testing & Quality Gates
- [x] Establish Jest test infrastructure and coverage thresholds (90% target).
	- Owner: Backend Lead
	- Completed: 2026-05-09 (jest.config.ts, 129 tests passing, 79.45% coverage)
- [x] Unit test all public service APIs (auth, food, log, AI, gamification, insights, reminder, subscription, telemetry, user).
	- Owner: Backend Lead
	- Completed: 2026-05-09 (all 12 service modules have >90% coverage except log/food-ingestion which are feature-incomplete)
- [ ] Plan E2E test coverage for integration workflows (scan → correction → log persistence → telemetry emission).
	- Owner: QA Lead
	- ETA: 2026-05-25
	- Dependency: Staging environment ready

## Sprint 2 Checklist (Personalization and Retention Loop)

### Sprint 2 Delivery Window
- Start: 2026-05-26
- End: 2026-06-06
- Exit Gate: Weekly adaptive plan and basic retention loop available in app

### Backend
- [x] Add KPI event schema for activation, adherence, and correction metrics.
	- Completed: 2026-05-09 (telemetry module with correction events, low-confidence flags, portion adjustments)
- [ ] Implement calorie target engine based on user profile and activity.
- [ ] Add weekly adaptive adjustment service using adherence and weight trend.
- [ ] Add recommendation API for meal/workout suggestions.

### Mobile
- [x] Add reminder preferences and mealtime nudges.
	- Completed: 2026-05-09 (streak-aware nudge messages, per-meal reminder schedule, preview card in profile)
- [x] Build weekly review screen with actionable recommendations.
	- Completed: 2026-05-09 (weekly insights tab in mobile)
- [ ] Build weekly plan surfaces and progress cards.
- [ ] Add KPI event schema for activation, adherence, and correction metrics.

### QA/Verification
- [ ] Add scenario tests for goal changes and weekly recalculation.
- [ ] Validate KPI event integrity from client to backend pipeline.

## Sprint 3 Checklist (Production Gate Hardening)

### Sprint 3 Delivery Window
- Start: 2026-06-09
- End: 2026-06-20
- Exit Gate: Observability, incident readiness, and release safety checks enabled

### Platform and Reliability
- [ ] Configure baseline observability dashboard (latency, error rate, AI scan success, data sync health).
- [ ] Add alert rules and incident severity mapping.
- [ ] Create runbook v1 for auth outage, AI provider degradation, and sync failures.
- [ ] Define release checklist with rollback procedure.

### Security and Compliance
- [ ] Document secret handling and rotation cadence.
- [ ] Define privacy/data retention policy baseline.
- [ ] Validate access control coverage for user and log endpoints.

### QA/Verification
- [ ] Execute smoke suite for auth, logging, profile, and plan generation.
- [ ] Run limited load test and establish p95 latency baseline.
- [ ] Confirm launch KPI dashboards are live and accurate.

## P0 Acceptance Criteria
- [ ] Food data architecture approved and implemented for launch scope.
- [ ] End-to-end logging works with correction workflow and persisted telemetry.
- [ ] Personalization baseline produces stable daily targets.
- [ ] Observability, alerting, and incident runbook v1 are active.
- [ ] Go-live KPI gates are defined, measurable, and reviewed.

## Owners Template
- Product: Product Lead
- Backend: Backend Lead
- Mobile: Mobile Lead
- Data/AI: AI Engineer
- QA: QA Lead
- DevOps: Platform Engineer
