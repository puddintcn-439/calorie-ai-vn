# Sprint 01 Two-Week Implementation Plan

## Sprint Goal
Reduce logging friction and make core value loop measurable.

## Timebox
- Duration: 10 working days
- Scope: P0 only

## Success Criteria
1. User can log meal from voice or receipt in <= 10 seconds median.
2. Core funnel has telemetry and QA coverage.
3. No blocking runtime errors on auth, scan, dashboard, insights, reminders, subscriptions.

## Dependency Order
1. Contracts first (API schema + telemetry schema)
2. Backend endpoints
3. Mobile integrations
4. QA automation and acceptance

## Day-by-Day Plan

### Day 1
- Finalize contracts:
  - voice scan request/response
  - receipt scan request/response
  - telemetry event schema
- Output:
  - Approved API contract
  - Approved event dictionary

### Day 2
- Backend:
  - Implement POST /ai/scan/voice (base parser path)
  - DTO + validation + error mapping
- Output:
  - Endpoint callable from Postman

### Day 3
- Backend:
  - Implement POST /ai/scan/receipt (MVP OCR + normalize)
  - unresolved_items for low confidence lines
- Output:
  - Receipt endpoint returns structured items

### Day 4
- Backend:
  - Implement telemetry ingestion/events for logging funnel
  - Add query snippets for KPI dashboard
- Output:
  - Event data visible in DB

### Day 5
- Mobile:
  - Add voice capture mode in scan UI
  - Integrate /ai/scan/voice
- Output:
  - End-to-end voice logging (manual QA)

### Day 6
- Mobile:
  - Add receipt capture mode in scan UI
  - Integrate /ai/scan/receipt
- Output:
  - End-to-end receipt logging (manual QA)

### Day 7
- Mobile:
  - Standardize retry/error UX for scan and coach
  - Ensure no dead-end user paths
- Output:
  - Unified error cards and retry actions

### Day 8
- AI/Data:
  - Globalize prompt assumptions (locale-aware, not VN-only)
  - Golden test cases for 3 cuisine groups
- Output:
  - Prompt revisions with regression checks

### Day 9
- QA:
  - E2E suite for core flow
  - Smoke regression across key APIs
- Output:
  - Green suite and defect report

### Day 10
- Hardening and close:
  - Fix critical defects
  - Validate sprint metrics
  - Demo and handoff
- Output:
  - Sprint closure note + next sprint intake

## Risk Register

1. OCR quality too low
- Mitigation: unresolved_items fallback + edit-first UX

2. Voice transcript quality varies by accent
- Mitigation: transcript correction step before parse

3. Metric event drift between client and server
- Mitigation: schema versioning and contract tests

## In/Out Scope

In scope:
- voice logging MVP
- receipt logging MVP
- telemetry and error UX stabilization

Out of scope:
- biomarker integration
- body transformation AI
- full global ontology

## Required Artifacts at Sprint End
1. API docs for new endpoints
2. E2E report
3. KPI baseline snapshot (D1 logging funnel)
4. Updated production-readiness notes
