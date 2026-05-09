# P0 Issues Ready

## Usage
- Copy each issue item into GitHub Issues, Jira, or Linear.
- Keep IDs stable to maintain readiness and sprint traceability.

## Issue List

### P0-001
- Title: Define canonical food entity and lineage schema
- Priority: P0
- Estimate: 3 days
- Owner Role: Backend Lead
- Sprint: Sprint 1
- Dependencies: None
- Description: Create canonical food model with source lineage, confidence, versioning fields, and migration.
- Acceptance Criteria:
  - Canonical schema exists in DB migration.
  - Food lookup can return canonical entity with source metadata.
  - Schema reviewed by Backend Lead and AI Engineer.

### P0-002
- Title: Build USDA and Open Food Facts ingestion jobs
- Priority: P0
- Estimate: 4 days
- Owner Role: AI Engineer
- Sprint: Sprint 1
- Dependencies: P0-001
- Description: Implement initial and delta ingestion pipelines from USDA and Open Food Facts.
- Acceptance Criteria:
  - Initial import executes successfully on staging.
  - Delta job updates changed records without duplicates.
  - Ingestion summary metrics are persisted.

### P0-003
- Title: Add nutrition validation and confidence scoring
- Priority: P0
- Estimate: 2 days
- Owner Role: Backend Lead
- Sprint: Sprint 1
- Dependencies: P0-002
- Description: Validate impossible nutrient values and attach confidence score to nutrition records.
- Acceptance Criteria:
  - Invalid records are rejected or quarantined.
  - Confidence score exists in API response model.
  - Validation coverage tests pass.

### P0-004
- Title: Complete multimodal logging and correction-first UX
- Priority: P0
- Estimate: 4 days
- Owner Role: Mobile Lead
- Sprint: Sprint 1
- Dependencies: P0-003
- Description: Ensure photo, barcode, text paths are stable and allow item/portion correction within three taps.
- Acceptance Criteria:
  - User can edit recognized item and portion pre-save.
  - Low-confidence outputs show warning and correction hint.
  - Log save persists corrected values.

### P0-005
- Title: Instrument KPI events for activation and correction quality
- Priority: P0
- Estimate: 3 days
- Owner Role: Backend Lead
- Sprint: Sprint 1
- Dependencies: P0-004
- Description: Add event schema and pipeline for activation, D7 retention signal, and scan correction quality metrics.
- Acceptance Criteria:
  - Event schema documented and versioned.
  - Events emitted from mobile and received by backend.
  - Dashboard query can compute baseline metrics.

### P0-006
- Title: Implement baseline calorie target engine
- Priority: P0
- Estimate: 3 days
- Owner Role: Backend Lead
- Sprint: Sprint 2
- Dependencies: P0-005
- Description: Compute daily target from profile, goal, and activity level.
- Acceptance Criteria:
  - Target API returns deterministic value for same input.
  - Unit tests cover core formulas and boundaries.
  - Profile updates trigger recalculation.

### P0-007
- Title: Add weekly adaptive planning service
- Priority: P0
- Estimate: 4 days
- Owner Role: AI Engineer
- Sprint: Sprint 2
- Dependencies: P0-006
- Description: Re-plan weekly recommendations from adherence, trend, and activity completion.
- Acceptance Criteria:
  - Weekly adjustment logic returns explainable changes.
  - Recommendation endpoint available for mobile.
  - Integration tests cover success and fallback paths.

### P0-008
- Title: Build weekly review and retention surfaces
- Priority: P0
- Estimate: 4 days
- Owner Role: Mobile Lead
- Sprint: Sprint 2
- Dependencies: P0-007
- Description: Add weekly review UI, progress card, and reminder preferences.
- Acceptance Criteria:
  - Weekly review screen renders trends and next actions.
  - Reminder preference can be configured and persisted.
  - User sees weekly plan changes with clear reason.

### P0-009
- Title: Stand up observability dashboard and alerts
- Priority: P0
- Estimate: 3 days
- Owner Role: Platform Engineer
- Sprint: Sprint 3
- Dependencies: P0-005
- Description: Add metrics dashboard and alert rules for API health, AI scan success, and sync failures.
- Acceptance Criteria:
  - Dashboard includes latency, error rate, auth failure, scan success.
  - Alert rules trigger on predefined thresholds.
  - Runbook links embedded in alerts.

### P0-010
- Title: Finalize runbook and rollback release checklist
- Priority: P0
- Estimate: 2 days
- Owner Role: Platform Engineer
- Sprint: Sprint 3
- Dependencies: P0-009
- Description: Prepare operational runbook and rollback checklist for launch-critical incidents.
- Acceptance Criteria:
  - Runbook contains auth outage, AI degradation, sync failure playbooks.
  - Rollback checklist is reviewed and signed off.
  - Smoke and regression gates are mapped to release process.

## Definition Of Done For P0
- All P0 issues completed with verified acceptance criteria.
- Readiness report updated with objective evidence links.
- Gate status in production report can move from NO-GO to conditional GO.
