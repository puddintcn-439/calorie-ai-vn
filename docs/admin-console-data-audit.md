# Admin Console Data Audit

Audit date: 2026-06-15

Scope:

- `/admin`
- `/admin/users`
- `/admin/users/:id`
- `/admin/revenue`
- `/admin/payment-issues`
- `/admin/ai-usage`
- `/admin/audit-log`

This audit focuses on endpoint mapping, query correctness, response shape, filtering, pagination, safety, and test coverage. It does not cover visual polish.

## Frontend To Backend Mapping

| Admin tab | Frontend route | Service method | Backend endpoint | Query params | Expected response fields | Fields rendered |
| --- | --- | --- | --- | --- | --- | --- |
| Overview | `/admin` | `adminService.fetchOverview()` | `GET /admin/overview` | none | `generated_at`, `active_users_today`, `active_users_7d`, `new_users_today`, `new_users_7d`, `food_logs_today`, `ai_requests_today`, `estimated_ai_cost_today_usd`, `ai_credits_used_today`, `quota_blocked_today`, `failed_ai_requests_today`, plus backend `ai_failure_rate_today`, `alerts` | active users today/7d, new users 7d, AI requests today, AI cost today, quota blocked today, engagement/AI bars |
| Users | `/admin/users` | `adminService.fetchUsers({ search, plan, page, pageSize })` | `GET /admin/users` | `search`, `plan`, `page`, `pageSize` | `generated_at`, `page`, `page_size`, `total`, `users[]` with `id`, `email`, `plan_tier`, `subscription_status`, `created_at`, `last_active_at`, `total_ai_requests_month`, `credits_used_month`, `food_logs_count` | email, id, plan, subscription status, AI requests, credits, food logs, created, last active, total/page |
| User detail | `/admin/users/:id` | `adminService.fetchUserDetail(userId)` plus optional mutation helpers | `GET /admin/users/:id` | path `id` | `profile`, `subscription`, `billing_entitlement`, `latest_billing_subscription`, `latest_billing_invoice`, `latest_renewal_reminder`, `ai_quota`, `recent_food_logs`, `recent_ai_usage`, `recent_telemetry` | profile, subscription/entitlement, Billing & PayOS card, AI quota/usage, recent food logs, telemetry |
| Revenue | `/admin/revenue` | `adminService.fetchRevenue()` | `GET /admin/revenue` | none | `pricing`, `subscriptions`, `revenue`, `ai_cost`, `margin`, `conversion`, `confirmed_revenue`, currency fields | confirmed revenue, estimated MRR/ARR, AI cost, margin, conversion, ARPPU, subscription mix, PayOS notes |
| Payment issues | `/admin/payment-issues` | `adminService.fetchPaymentIssues({ status, provider: 'payos' })`, `adminService.updatePaymentIssue(id, patch)` | `GET /admin/payment-issues`, `PATCH /admin/payment-issues/:id` | list: `status`, `provider`, optional service `userId`; patch: path `id` and body `status`, `admin_note`, `resolution` | list: `generated_at`, `total`, `issues[]`; patch: `ok`, `issue`, `audited` | support queue counts, case user/provider/order/amount/status/message, admin note, resolution |
| AI Usage | `/admin/ai-usage` | `adminService.fetchAiUsage(days)` | `GET /admin/ai-usage` | `days` | usage summary from `AiUsageService`: total counts/cost, success/fallback/failed/blocked, top features/users/providers/models | total requests, cost, status mix, top features/users/provider/model tables |
| Audit log | `/admin/audit-log` | `adminService.fetchAuditLog({ actorEmail, action, targetType, page, pageSize })` | `GET /admin/audit-log` | `actorEmail`, `action`, `targetType`, `targetId`, `page`, `pageSize` | `generated_at`, `page`, `page_size`, `total`, `entries[]` with actor/action/target/reason/metadata/ip/user_agent/created_at | filters, entries, target id, reason, IP, metadata, pagination |

## Backend Endpoint Audit

All audited admin endpoints are under `AdminController`, guarded by:

- `JwtAuthGuard`
- `AdminGuard`
- `AdminRoleGuard`

Role requirements:

- Overview: `viewer`
- Users list: `viewer`
- User detail: `support`
- Revenue: `admin`
- Payment issues list/update: `support`
- AI usage: `viewer`
- Audit log: `viewer`

### `/admin/users`

Data sources:

- `users`
- `user_subscriptions`
- `ai_usage_events`
- `food_logs`
- `telemetry_events`

Correctness:

- Email search uses DB-level `ilike`.
- Plan filter is now based on active subscription state:
  - empty/all: no plan filter
  - free: users without active premium/pro subscriptions
  - premium: users with active premium subscription
  - pro: users with active pro subscription
- Search and plan combine before range pagination.
- `total` comes from the filtered Supabase count.
- `page` and `pageSize` are bounded in controller DTO and service.
- Invalid plan now throws `BadRequestException`.
- List query selects only list fields from `users`; detail data is fetched only for the current page.

Fix made:

- Before this audit, inactive premium/pro subscriptions could still affect the users list plan filter. Users with an inactive premium subscription could be excluded from `free` or appear in `premium`.
- Fixed by applying `is_active = true` to plan filter lookups and current-plan aggregation.

Performance notes:

- Current implementation avoids per-user detail calls and fetches page aggregate data in four batched queries.
- `free` filter still needs an exclude-id list from `user_subscriptions`; acceptable for current scale, but a DB view/RPC would be better at larger scale.

Index recommendations:

- `users (lower(email))` or trigram index for email search.
- `users (created_at desc)`.
- `user_subscriptions (is_active, tier, user_id, updated_at desc)`.
- `ai_usage_events (user_id, created_at desc, status)`.
- `food_logs (user_id)`.
- `telemetry_events (user_id, created_at desc)`.

Automated coverage:

- `AdminService users list filters` covers search, free/premium/pro, search + plan, total count, pagination, page_size alias, invalid plan.
- Added coverage for inactive premium users being treated as free for list/filter purposes.

### `/admin/overview`

Data sources:

- `telemetry_events`
- `users`
- `food_logs`
- `ai_usage_events`

Definitions:

- `active_users_today`: distinct `telemetry_events.user_id` since local server-day start.
- `active_users_7d`: distinct `telemetry_events.user_id` since now minus 7 days.
- `new_users_today`: `users` rows since local server-day start.
- `new_users_7d`: `users` rows since now minus 7 days.
- `food_logs_today`: `food_logs` rows since local server-day start.
- `ai_requests_today`: `ai_usage_events` rows loaded since local server-day start, capped by current query limit.
- `estimated_ai_cost_today_usd`: sum of `estimated_cost_usd`.
- `ai_credits_used_today`: sum of `credits_consumed`, defaulting to 1.
- `quota_blocked_today`: count where status is `blocked`.
- `failed_ai_requests_today`: count where status is `failed`.

Known gaps/manual QA:

- Date boundaries use backend server local day, not user timezone or configurable admin timezone.
- `countDistinct` and AI rows use query limits. For large production volume, replace with SQL aggregate/RPC.
- Overview API returns more fields than the current UI displays.

Index recommendations:

- `telemetry_events (created_at, user_id)`.
- `users (created_at)`.
- `food_logs (created_at)`.
- `ai_usage_events (created_at, status)`.

### `/admin/revenue`

Data sources:

- `user_subscriptions`
- `users`
- `ai_usage_events`
- BillingService confirmed revenue:
  - `billing_subscriptions`
  - `billing_invoices`
  - `billing_refunds`

Correctness:

- Confirmed revenue is delegated to `BillingService.getConfirmedRevenueSummary`.
- Confirmed paid revenue only counts `billing_invoices.status = paid` with `paid_at >= monthStart`.
- Open/pending invoices are excluded by the paid status filter.
- Refunds are subtracted via `billing_refunds`.
- Active paid subscriptions require `is_paid = true`, status `active/trialing`, and `cancelled_at IS NULL`.
- User plan distribution is based on all registered users, not subscription record count:
  - Premium: registered users whose current/latest active paid access is premium.
  - Pro: registered users whose current/latest active paid access is pro.
  - Free: registered users without active premium/pro access, including users with no subscription rows and inactive paid rows without cancellation.
  - Cancelled: registered users whose latest subscription row has `cancelled_at` and who do not have active premium/pro access.
  - Each registered user is counted once; `plan_distribution_total` should equal `total_users`.
- Estimated subscription revenue still uses active `user_subscriptions`; confirmed revenue should be preferred for PayOS reconciliation.
- Currency conversion uses configured `USD_TO_VND_RATE`, fallback `26000`.

Automated coverage:

- `billing.service.spec.ts` covers paid invoices, refund subtraction, VND/USD conversion, empty/unavailable billing tables.
- `admin-revenue.service.spec.ts` covers confirmed revenue passthrough, trial/manual grant separation, and all-user plan distribution without double counting.

Known gaps/manual QA:

- Estimated MRR is intentionally separate from confirmed ledger revenue and may include trial/manual grants in the legacy estimate.
- User plan distribution ignores subscription rows for deleted/unregistered users.
- Validate real PayOS paid/open/refund states on staging with actual webhook data.

Index recommendations:

- `billing_invoices (status, paid_at)`.
- `billing_refunds (refunded_at)`.
- `billing_subscriptions (is_paid, status, cancelled_at, user_id)`.
- `user_subscriptions (is_active, tier, payment_provider)`.

### `/admin/users/:id`

Data sources:

- `users`
- `user_subscriptions`
- `billing_subscriptions`
- `billing_invoices`
- BillingService entitlement/reminder helpers
- `ai_usage_events`
- `food_logs`
- `telemetry_events`

Correctness:

- User id is UUID-validated in the controller.
- Detail starts from the requested user row and throws 404 if missing.
- Recent activity queries all filter by requested `user_id`.
- Latest invoice/subscription order by newest timestamp and filter by requested `user_id`.
- Billing fields are explicitly selected/sanitized. Raw provider payloads, webhook payloads, internal entitlement IDs and PayOS checksums are not returned.

Automated coverage:

- Safe billing detail with no raw payload leakage.
- Null billing fields when absent.
- Latest invoice/subscription belongs to requested user only.
- Missing user returns `NotFoundException`.

Known gaps/manual QA:

- Latest invoice uses newest `created_at`, not newest `paid_at`; this is acceptable for support history but should be revisited if support wants latest paid invoice specifically.

### `/admin/payment-issues`

Data sources:

- `billing_payment_issues`
- `users`
- `billing_invoices`
- `admin_audit_log`
- NotificationsService for user-facing status changes

Correctness:

- Status filter is DTO-validated and service-validated against `open/in_review/resolved/rejected`.
- Provider and userId filters are applied at DB query level.
- List returns safe user email and safe invoice summary only.
- `admin_note` is returned to admin UI but is internal for user-facing notifications.
- `resolution` is user-facing.
- Patch validates status, trims note/resolution, writes audit log, and notifies only when status changes to `in_review`, `resolved`, or `rejected`.
- Payment issue resolution does not automatically refund, revoke entitlement, or mutate subscriptions.

Automated coverage:

- Safe issue list with invoice summary and no raw payload leakage.
- Status update writes audit log and does not mutate subscription state.
- Notifications fire on status changes and not unchanged status.

Known gaps/manual QA:

- List is capped at 100 and has no page/pageSize. Add pagination if support queue grows.
- `userId` is not UUID-validated in DTO; it is only used as an equality filter. This is safe but less strict than user detail.

Index recommendations:

- `billing_payment_issues (status, provider, created_at desc)`.
- `billing_payment_issues (user_id, created_at desc)`.
- `billing_payment_issues (invoice_id)`.
- `billing_invoices (id)`.

### `/admin/ai-usage`

Data sources:

- `ai_usage_events`
- `AiUsageService.getUsageSummary`

Correctness:

- `days` is DTO-bounded from 1 to 180.
- Service clamps/rounds `days` again.
- Data range starts at now minus `windowDays - 1` days.
- Summary uses request/cost/status/source rows from `ai_usage_events`.
- Admin assertion is performed in `AiUsageService` using requester email.

Known gaps/manual QA:

- Top users may expose admin-safe user identifiers from AI usage data; review exact output in staging if emails are later joined.
- Date window is rolling time based, not calendar-day bucketed.

Index recommendations:

- `ai_usage_events (created_at desc)`.
- `ai_usage_events (status, created_at desc)`.
- `ai_usage_events (user_id, created_at desc)`.
- `ai_usage_events (feature, created_at desc)`.

### `/admin/audit-log`

Data sources:

- `admin_audit_log`

Correctness:

- Filters supported: `actorEmail`, `action`, `targetType`, `targetId`, `page`, `pageSize`.
- Actor email uses DB-level `ilike`.
- Action, target type, and target id use exact match.
- Newest entries are returned first.
- Pagination total is based on filtered count.
- Page size is bounded to 100.
- Important actions currently logged:
  - `billing.payment_issue.update`
  - `grant_premium`
  - `revoke_premium`
  - `reset_ai_quota`

Known gaps/manual QA:

- Metadata is visible to admin UI. Current writers use safe metadata, but future audit writers should avoid secrets/raw webhook payloads.

Index recommendations:

- `admin_audit_log (created_at desc)`.
- `admin_audit_log (actor_email)`.
- `admin_audit_log (action, created_at desc)`.
- `admin_audit_log (target_type, target_id, created_at desc)`.

## Summary Table

| Admin tab | Backend endpoint | Data source tables | Filters/pagination | Automated coverage | Manual QA needed | Known gaps/index recommendations |
| --- | --- | --- | --- | --- | --- | --- |
| Overview | `GET /admin/overview` | `telemetry_events`, `users`, `food_logs`, `ai_usage_events` | none | Partial via service/controller coverage | Verify staging timezone and high-volume counts | Add aggregate RPC/indexes for large data; configurable timezone |
| Users | `GET /admin/users` | `users`, `user_subscriptions`, `ai_usage_events`, `food_logs`, `telemetry_events` | `search`, `plan`, `page`, `pageSize/page_size` | Strong focused service coverage | Verify slow search against real dataset | Add email/search and subscription indexes; consider RPC/view for plan filter |
| User detail | `GET /admin/users/:id` | user, subscription, billing, AI usage, food logs, telemetry | path UUID | Safe billing/no leakage tests | Verify real PayOS latest invoice support expectation | Consider latest paid invoice separate from latest invoice |
| Revenue | `GET /admin/revenue` | users, subscriptions, AI usage, billing ledger | none | Billing and admin revenue tests, including all-user plan distribution | Reconcile real PayOS paid/open/refund staging invoices | Index billing invoice/refund/subscription date/status fields |
| Payment issues | `GET/PATCH /admin/payment-issues` | payment issues, users, invoices, audit log, notifications | `status`, `provider`, `userId`; no pagination | Safe list/update/notification tests | Verify support queue with real cases | Add pagination and stricter userId UUID DTO; indexes by status/provider/date |
| AI Usage | `GET /admin/ai-usage` | `ai_usage_events` | `days` 1-180 | AI usage service coverage | Verify top-users output remains admin-safe | Add AI usage compound indexes; consider calendar buckets |
| Audit Log | `GET /admin/audit-log` | `admin_audit_log` | actor/action/target filters, page/pageSize | Controller access and service indirect coverage | Verify key admin actions appear after staging workflows | Add audit indexes and keep metadata secret-free |

## Bugs Found And Fixed

1. Admin Users plan filter treated inactive premium/pro subscription rows as paid-plan evidence.
   - Impact: inactive paid users could appear under `premium/pro` or be excluded from `free`.
   - Fix: plan filter now only uses `user_subscriptions.is_active = true` for premium/pro membership and free exclusion.
   - Fix: current list plan aggregation now reads active subscriptions only.
   - Test: added inactive premium fixture to users list filter tests.

## No Fix Needed In This Pass

- Confirmed revenue paid/open/refund behavior is already implemented in BillingService and covered by tests.
- User detail already selects safe billing fields and avoids raw payload/provider metadata.
- Payment issue update already writes audit log, notifies only on status changes, and does not mutate entitlement/refund/subscription state.
