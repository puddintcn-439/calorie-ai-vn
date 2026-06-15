# Admin Console Visual Polish V2

## Purpose

Admin Console V2 keeps the Stripe/Supabase-style shell from V1.1 and adds a shared visual language so every admin tab is easier to scan without changing backend behavior, API contracts, Billing, PayOS, or authorization.

## Visual Tone System

Shared admin tones live in `apps/mobile/components/admin/AdminShell.tsx`:

- `neutral`: default and low-emphasis information.
- `info`: users, search, account signals.
- `success`: healthy states, growth, successful operations.
- `warning`: costs, fallback paths, refunds, stale activity.
- `danger`: failures, blocked quota, high-risk support states.
- `premium`: premium plan and paid subscription emphasis.
- `pro`: pro plan and high-value account emphasis.
- `support`: support queues and intervention-style admin work.
- `ai`: AI usage, quota, model/provider operations.
- `billing`: revenue, PayOS, ledger and subscription finance.

Reusable helpers added or extended:

- `AdminMetricCard`
- `AdminQuickActionCard`
- `AdminToneCard`
- richer `AdminStatusBadge`
- `AdminChip`

## Screen-Level Changes

### Overview

- KPI cards now use distinct soft tones for users, growth, AI, cost and quota.
- Quick actions use colorful, compact cards.
- Needs attention uses a support tone instead of a flat generic card.
- Existing overview bar charts remain data-driven and unchanged.

### Users

- Plan filters use chips:
  - all: info
  - free: neutral
  - premium: premium
  - pro: pro
- User cards use plan-colored left accents and subtle backgrounds.
- Subscription status, AI requests, credits and food logs use separate visual tones.
- Last active now has a cue:
  - recent: success
  - inactive: warning
  - unknown/cold: neutral

### Revenue

- Confirmed revenue and PayOS ledger areas use billing tone.
- AI cost uses warning.
- Margin uses success/warning/danger based on value.
- Refund metrics become warning when non-zero.
- Existing revenue logic and calculations are unchanged.

### Payment Issues

- The queue now uses support-oriented visuals.
- Status badges:
  - open: warning
  - in_review: info
  - resolved: success
  - rejected: danger
- Issue type chips differentiate refund, duplicate payment, activation failures, wrong plan and other issues.
- `admin_note` is visually marked internal.
- `resolution` is visually marked user-facing.

### AI Usage

- AI requests use AI tone.
- Cost and fallback use warning.
- Failures and blocked quota use danger when non-zero.
- Status mix keeps the existing bar chart but sits inside an AI tone card.

### Audit Log

- Audit entries use action-based tone:
  - billing/payment/PayOS/subscription: billing
  - admin/security/revoke: danger
  - user/profile: info
  - AI/quota: AI
  - notification/email/push: success
- Entries now have a subtle timeline-style left rail.

## Future Improvements

- Richer charts for revenue, AI cost and user growth.
- Table mode for dense admin lists.
- Webhook health cards.
- Notification delivery health.
- Open payment issue counts in Overview.
- Revenue and LTV per user.
