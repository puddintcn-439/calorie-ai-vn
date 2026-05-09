# Global Execution Ticket Backlog

## Purpose
This backlog converts product strategy into implementation-ready tickets for backend, mobile, data/AI, and QA.

## Priority Legend
- P0: Must ship first, blocks product value loop.
- P1: Strong retention and quality multipliers.
- P2: Expansion and moat layers.

## P0 Tickets (Start Now)

### Backend

1. BE-P0-001 Voice Logging Endpoint
- Goal: Add API to parse voice transcript into structured meal candidates.
- Scope:
  - Add POST /ai/scan/voice
  - Reuse scan/refine response contract shape
  - Add confidence and parsing metadata
- Acceptance:
  - Returns items[], totals, ai_confidence
  - Handles empty/invalid transcript with 422
- Estimate: 3 points
- Dependencies: none
- Owner: Backend

2. BE-P0-002 Receipt Parse Endpoint
- Goal: Add API to parse grocery/restaurant receipt image into meal candidates.
- Scope:
  - Add POST /ai/scan/receipt
  - OCR pre-process + AI normalization to food items
- Acceptance:
  - Supports multiple line items
  - Returns unresolved_items list for low confidence rows
- Estimate: 5 points
- Dependencies: OCR provider selection
- Owner: Backend + AI

3. BE-P0-003 Logging Friction Telemetry Schema
- Goal: Add event contracts for friction analytics.
- Scope:
  - Add events: log_attempted, log_succeeded, log_failed
  - Add dimensions: input_mode, elapsed_ms, correction_count
- Acceptance:
  - Events are validated and persisted
  - Dashboard-ready query examples documented
- Estimate: 3 points
- Dependencies: event naming freeze
- Owner: Backend

4. BE-P0-004 Remove Dev Fallback Debt Gate
- Goal: Preserve resilience while enforcing migration health in non-dev env.
- Scope:
  - Keep graceful fallback only under NODE_ENV=development
  - Add startup warning when required tables missing
- Acceptance:
  - Production/staging fails fast if required table missing
  - Development still degrades safely
- Estimate: 2 points
- Dependencies: migration inventory
- Owner: Backend

### Mobile

5. MO-P0-001 Voice Logging UX in Scan Screen
- Goal: Add one-tap voice logging in existing scan flow.
- Scope:
  - Microphone permission flow
  - Record -> transcript -> /ai/scan/voice
  - Review/edit before save
- Acceptance:
  - User can create log from voice in <= 3 taps
  - Error state has retry and manual edit path
- Estimate: 5 points
- Dependencies: BE-P0-001
- Owner: Mobile

6. MO-P0-002 Receipt Capture UX
- Goal: Add receipt mode in scan screen.
- Scope:
  - Camera capture for receipt
  - /ai/scan/receipt integration
  - Candidate merge and per-item correction
- Acceptance:
  - User can convert a receipt to loggable items
  - Low-confidence lines are clearly highlighted
- Estimate: 5 points
- Dependencies: BE-P0-002
- Owner: Mobile

7. MO-P0-003 Unified Error/Retry UX
- Goal: Standardize recoverable errors for scan and coach flows.
- Scope:
  - Add non-blocking error card pattern
  - Retry button and fallback mode CTA
- Acceptance:
  - No dead-end errors on core logging path
- Estimate: 3 points
- Dependencies: none
- Owner: Mobile

### Data/AI

8. AI-P0-001 Prompt Localization Neutralization
- Goal: Make prompts global-first while preserving VN quality.
- Scope:
  - Remove hard Vietnam-only assumptions in core prompts
  - Add locale and cuisine context fields
- Acceptance:
  - Prompt templates accept locale/cuisine_hint
  - Output quality tests pass for 3 cuisines
- Estimate: 3 points
- Dependencies: none
- Owner: AI

### QA

9. QA-P0-001 Core Funnel E2E Suite
- Goal: Lock core loop quality.
- Scope:
  - login -> log meal -> view dashboard update -> weekly insights
  - include voice and receipt once available
- Acceptance:
  - CI green on all P0 flows
- Estimate: 3 points
- Dependencies: BE/MO P0
- Owner: QA

## P1 Tickets

1. BE-P1-001 Behavior Pattern Detector
- Detect binge-risk windows, under-protein streak, late-night overeating clusters.
- Estimate: 5 points

2. BE-P1-002 Intervention Rules Engine
- Trigger nudge templates by behavior state and confidence.
- Estimate: 5 points

3. MO-P1-001 Weekly Story Recap UI
- Add story-like weekly progress cards and action suggestions.
- Estimate: 3 points

4. MO-P1-002 Shopping Health Score Surface
- Barcode result page with score, rationale, and alternatives.
- Estimate: 5 points

5. QA-P1-001 Retention KPI Integrity Tests
- Validate event fidelity D1/D7, coach engagement, streak continuity.
- Estimate: 2 points

## P2 Tickets

1. BE-P2-001 Global Food Ontology Service
- Canonical dish mapping and regional aliases.
- Estimate: 8 points

2. BE-P2-002 Biomarker Connector Interface
- Pluggable adapter contracts for glucose/lab data.
- Estimate: 5 points

3. MO-P2-001 Region and Language Pack Selector
- User-selectable locale + cultural defaults.
- Estimate: 3 points

4. AI-P2-001 Long-Term Coach Memory Planner
- 30/60/90 day memory summarization and intervention planning.
- Estimate: 8 points

## Operational Rules

1. Any ticket touching runtime errors must update error memory log.
2. Any ticket touching core funnel must provide before/after KPI impact hypothesis.
3. Any ticket adding API endpoints must include DTO contract and failure matrix.

## Suggested Initial Sprint Pull
- BE-P0-001, BE-P0-002, BE-P0-003
- MO-P0-001, MO-P0-003
- AI-P0-001
- QA-P0-001
