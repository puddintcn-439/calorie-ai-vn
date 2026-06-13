# Billing/Admin/PayOS V5 Final Audit

Audit date: 2026-06-13

Audited commit: `ed42c96739044054a74c8003c762b553de8193f5`

Status before audit: local `main` was clean and synced with `origin/main` at the audited commit.

## Summary

The Billing/Admin/PayOS V5 milestone is functionally complete for staging QA. The core prepaid PayOS flow is implemented, webhook-confirmed entitlement remains the source of truth, admin support screens expose safe billing context, and user-facing support/notification flows are covered by backend tests plus mobile lint/type validation.

No production code changes were required during this final audit.

## Feature Inventory

| Area | Status | Evidence |
| --- | --- | --- |
| PayOS checkout | Present | `POST /billing/checkout/payos` creates PayOS checkout and pending invoice. |
| PayOS webhook | Present | `POST /billing/webhooks/payos` verifies PayOS webhook and processes successful payments. |
| PayOS return/cancel | Present | `GET /billing/return/payos` and `GET /billing/cancel/payos` are UX-only. |
| Billing entitlement | Present | `GET /billing/entitlement` returns current safe entitlement. |
| Renewal reminder | Present | `GET /billing/renewal-reminder` returns current-user PayOS prepaid renewal reminder. |
| User payment issues | Present | `POST /billing/payment-issues` and `GET /billing/payment-issues` support current-user billing cases. |
| Admin revenue | Present | `GET /admin/revenue` includes confirmed revenue metrics. |
| Admin user detail | Present | `GET /admin/users/:userId` includes safe billing entitlement, invoice, subscription, and reminder data. |
| Admin payment issues | Present | `GET /admin/payment-issues` and `PATCH /admin/payment-issues/:id` support audited admin case triage. |
| Notifications API | Present | `GET /notifications` and `PATCH /notifications/:id/read` expose current-user in-app notifications. |
| Mobile paywall | Present | `/paywall` shows PayOS plans, opens checkout URL, refreshes entitlement, and does not activate locally. |
| Mobile admin auth | Present | `/admin/login`, admin route guard, logout UX, and backend admin guards. |
| Mobile admin support | Present | Admin user detail billing card and payment issue management screen. |
| Mobile notifications | Present | `/notifications` lists in-app notifications and marks them read. |

## Security and Safety Audit

| Check | Result |
| --- | --- |
| PayOS webhook is source of truth | PASS. Return/cancel routes are UX-only and do not mark invoices paid. |
| No local mobile entitlement activation | PASS. Paywall opens checkout and requires entitlement refresh from backend. |
| Payment activation requires verified webhook | PASS. Successful PayOS webhook updates invoice/subscription and syncs entitlement. |
| Duplicate webhook handling | PASS. Duplicate event processing is idempotent and does not duplicate subscriptions. |
| Amount mismatch handling | PASS. Mismatched amount is ignored and does not grant entitlement. |
| Missing invoice handling | PASS. Unknown PayOS order is ignored safely. |
| Secrets in errors | PASS. Tests cover Stripe and PayOS secret-safe error messages. |
| Raw provider payload exposure | PASS. Admin/user support responses exclude raw payloads and sensitive metadata. |
| Admin authorization boundary | PASS. Backend guards remain the security boundary; frontend guard is UX only. |
| Payment issue workflow safety | PASS. Support cases do not mutate entitlement or trigger refunds. |
| Notification safety | PASS. User notifications exclude admin notes and sensitive internals. |

## Automated Coverage Audit

| Area | Coverage | Notes |
| --- | --- | --- |
| A. PayOS checkout | COVERED | Tests cover real client path, production missing config, safe mock/dev behavior, plan pricing, pending invoice creation, and no entitlement activation after checkout. |
| B. PayOS webhook | COVERED | Tests cover verified success, invalid signature, duplicate event, failed payment, missing invoice, amount mismatch, period calculation, entitlement sync, return/cancel UX-only routes, and safe error output. |
| C. Entitlement | COVERED | Tests cover paid PayOS/Stripe-style billing subscriptions, expired/cancelled subscriptions, legacy trial/manual fallback, and free fallback. |
| D. Renewal reminder | COVERED | Tests cover no active PayOS plan, 7-day, 3-day, 1-day, expired windows, non-PayOS exclusions, and authenticated endpoint behavior. |
| E. Admin auth/RBAC | COVERED | Tests cover non-admin 403 and admin access to revenue, user detail, and payment issue routes. Frontend route guard/logout is covered by mobile lint/type checks and requires manual UX QA. |
| F. Admin billing detail | COVERED | Tests cover safe billing fields, null/no-data behavior, latest invoice/subscription selection for requested user only, and exclusion of raw payloads/internal IDs. |
| G. Payment issue workflow | COVERED | Tests cover user-owned issue creation/listing, invalid type rejection, cross-user invoice rejection, admin safe listing, audited admin updates, no subscription mutation, and notification triggers. |
| H. Notifications | COVERED | Tests cover in-app notification creation, own-notification listing/read updates, safe message bodies, push/email skip/failure handling, and no admin note leakage. Real push/email delivery remains manual/provider QA. |
| I. Mobile services and UI | PARTIAL | Mobile lint/type validation covers service method wiring and screens. Runtime UX flows for PayOS browser handoff, admin navigation, notifications, and responsive layout are manual QA items. |

## Manual QA Checklist

### User Billing

- Log in as a normal test user.
- Open the paywall.
- Confirm plan prices:
  - Premium monthly: 59,000 VND
  - Premium annual: 499,000 VND
  - Pro monthly: 129,000 VND
  - Pro annual: 999,000 VND
- Tap buy for a PayOS plan.
- Confirm backend returns `provider=payos`, `checkout_url`, `order_code`, `tier`, `interval`, and expected `amount_vnd`.
- Confirm the app opens the real PayOS checkout URL.
- Confirm no paid entitlement appears before webhook confirmation.
- Complete PayOS payment in sandbox/test flow.
- Confirm webhook request reaches `POST /billing/webhooks/payos`.
- Confirm latest PayOS invoice becomes `paid`.
- Confirm PayOS subscription becomes `active` and `is_paid=true`.
- Confirm `GET /billing/entitlement` returns `source=paid` and `provider=payos`.
- Confirm paywall status refresh shows paid PayOS state.
- Confirm return/cancel URL alone does not activate entitlement.

### Renewal Reminders

- Seed or locate active paid PayOS subscriptions expiring in 7, 3, and 1 day.
- Confirm `GET /billing/renewal-reminder` returns the expected reminder window and message.
- Confirm expired prepaid PayOS subscription returns the expired reminder.
- Confirm free, manual, Stripe, and non-paid subscriptions do not produce PayOS reminders unless explicitly supported later.
- Confirm "Gia han ngay" reuses the existing PayOS checkout flow and does not activate locally.

### Payment Issues and Notifications

- Create a payment issue from the paywall/support area.
- Confirm the case is tied to the current user only.
- Confirm user issue list excludes admin notes.
- Confirm in-app notification is created for the user.
- Confirm notification list shows the item and mark-as-read works.
- Confirm push/email adapters skip safely without configured providers.
- With provider env configured, verify real push/email delivery manually.

### Admin

- Log in via `/admin/login` with an admin account.
- Confirm `/admin` loads and logout clears session/token and returns to `/admin/login`.
- Confirm authenticated non-admin user receives backend 403 for admin endpoints.
- Open admin revenue and verify confirmed revenue includes paid PayOS invoices.
- Open admin user detail and verify the "Billing & PayOS" card shows safe entitlement, latest invoice, latest subscription, and renewal reminder.
- Confirm raw webhook payloads, checksum keys, PayOS API keys, and secrets are not shown.
- Open admin payment issues.
- Update a case status/note/resolution.
- Confirm audit log entry is written and entitlement/subscription is not mutated by the support case update.
- Confirm user notification is generated for relevant status changes.

## Known Limitations

- PayOS is prepaid only; it is not recurring auto-renew billing.
- No auto-renew, proration, or automated refund execution is implemented.
- Payment issue cases are support workflow records only; they do not call provider refund APIs.
- Real PayOS checkout/webhook needs configured runtime credentials and public webhook URL.
- Real email delivery needs provider env and verified sender/domain setup.
- Real push delivery needs registered device tokens and Expo/provider validation.
- App Store / Google Play subscriptions are not implemented in this milestone.
- Frontend runtime UX and responsive layout remain manual QA despite lint/type validation.

## Rollout Readiness

Recommendation: ready for staging QA.

Production rollout should wait until:

- Disabled billing migrations for the milestone are intentionally applied in the target Supabase environment.
- Runtime PayOS credentials and webhook URL are configured outside source control.
- Real PayOS webhook, entitlement, admin revenue, and admin support flows are manually verified in the target environment.
- Post-test secret hygiene is complete, including rotating sensitive PayOS keys when appropriate.

## Validation

Validation commands to run after this audit:

```bash
npm --workspace apps/mobile run lint
npm --workspace apps/backend run build
npm run test
```

Expected baseline from the audited milestone: mobile lint PASS, backend build PASS, full tests PASS with 401 passed and 12 skipped.
