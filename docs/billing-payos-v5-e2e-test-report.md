# Billing PayOS V5 E2E Test Report

Status: PASSED.

Billing V5 PayOS backend has passed build, lint, unit tests, and a real prepaid PayOS payment E2E. This document keeps the runtime setup checklist and records the completed E2E result without exposing secrets.

## Required Env Checklist

Set these values only in local, staging, or production environment configuration:

- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- `PAYOS_RETURN_URL`
- `PAYOS_CANCEL_URL`

Do not commit real PayOS credentials. Do not print credentials in logs or test reports.

## Supabase Migration Checklist

Apply this migration before sending real PayOS checkout or webhook traffic:

```text
supabase/migrations.disabled/0063_billing_provider_payos.sql
```

After applying it, verify `provider='payos'` is accepted by:

- `billing_customers`
- `billing_subscriptions`
- `billing_invoices`
- `billing_refunds`
- `billing_events`

Suggested SQL smoke check in a disposable transaction:

```sql
begin;

insert into public.billing_customers (user_id, provider, provider_customer_id, metadata)
values ('00000000-0000-0000-0000-000000000000', 'payos', 'payos_smoke_customer', '{"source":"payos_smoke"}');

insert into public.billing_events (provider, provider_event_id, event_type, status, raw_payload)
values ('payos', 'payos:smoke:event', 'payos.payment.updated', 'received', '{"source":"payos_smoke"}');

rollback;
```

## Backend Local Setup

1. Add PayOS env values to the local backend environment only.
2. Confirm `PAYOS_RETURN_URL` and `PAYOS_CANCEL_URL` point to reachable UX routes.
3. Restart the backend so `ConfigService` reloads the values.
4. Confirm startup logs do not print PayOS secrets.

Production must not use the non-production mock checkout URL.

## Webhook Setup

PayOS requires a public callback URL for webhook delivery.

For local E2E testing, expose the backend with a tunnel such as ngrok or cloudflared:

```text
https://<public-tunnel-host>/billing/webhooks/payos
```

Webhook endpoint:

```http
POST /billing/webhooks/payos
```

The webhook is the only trusted payment confirmation. `returnUrl` and `cancelUrl` are UX-only and must not activate a subscription.

## Checkout Test

1. Login as a test user and capture a JWT.
2. Create a PayOS checkout:

```http
POST /billing/checkout/payos
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "tier": "premium",
  "interval": "monthly"
}
```

3. Verify the response includes:

```json
{
  "ok": true,
  "provider": "payos",
  "checkout_url": "https://...",
  "order_code": 123456789,
  "tier": "premium",
  "interval": "monthly",
  "amount_vnd": 59000
}
```

4. Open `checkout_url`.
5. Pay with the PayOS sandbox/test flow if available.
6. Wait for `POST /billing/webhooks/payos` to arrive and return `ok: true`.

## Database Verification SQL

Replace placeholders before running. Do not paste real user identifiers into shared reports unless needed.

Pending invoice created after checkout:

```sql
select id, user_id, provider, provider_invoice_id, tier, status, amount_vnd, currency_original, metadata, created_at, updated_at
from public.billing_invoices
where provider = 'payos'
  and provider_invoice_id = '<order_code>';
```

Billing event recorded after webhook:

```sql
select id, provider, provider_event_id, event_type, status, processed_at, error_message, created_at
from public.billing_events
where provider = 'payos'
  and provider_event_id like 'payos:%'
order by created_at desc
limit 10;
```

Invoice becomes paid after verified successful webhook:

```sql
select id, provider_invoice_id, status, paid_at, amount_vnd, billing_period_start, billing_period_end
from public.billing_invoices
where provider = 'payos'
  and provider_invoice_id = '<order_code>';
```

Active PayOS subscription exists:

```sql
select id, user_id, provider, provider_subscription_id, tier, status, is_paid, billing_period_start, billing_period_end, cancelled_at
from public.billing_subscriptions
where provider = 'payos'
  and provider_subscription_id = 'payos_<order_code>';
```

Entitlement returns paid PayOS access:

```http
GET /billing/entitlement
Authorization: Bearer <JWT>
```

Expected response shape:

```json
{
  "tier": "premium",
  "source": "paid",
  "provider": "payos",
  "active_until": "..."
}
```

Admin revenue includes PayOS confirmed revenue:

```http
GET /admin/revenue
Authorization: Bearer <ADMIN_JWT>
```

Expected fields:

- `confirmed_revenue.active_paid_by_provider.payos >= 1`
- `confirmed_revenue.month_to_date.paid_invoice_count >= 1`
- `confirmed_revenue.month_to_date.gross_revenue_vnd` includes the paid PayOS invoice amount

## Negative Tests

Duplicate webhook idempotency:

- Replay the same verified PayOS webhook payload.
- Expected: response indicates duplicate or no second processing.
- Verify no duplicate `billing_subscriptions` row and no second grant.

Amount mismatch:

- Send or simulate a webhook where `data.amount` does not match the pending invoice `amount_vnd`.
- Expected: event is recorded as ignored, invoice remains not paid, and no entitlement is granted.

Missing pending invoice:

- Send or simulate a valid webhook for an unknown `orderCode`.
- Expected: event is recorded as ignored, no user is guessed, and no entitlement is granted.

Return/cancel URL safety:

- Visit `GET /billing/return/payos`.
- Visit `GET /billing/cancel/payos`.
- Expected: both return informational JSON only.
- Verify no invoice is marked paid and no subscription is activated by these routes.

## Final Result

E2E runtime test result: PASSED.

Date: 2026-06-13 Asia/Saigon.

Environment:

- Backend local runtime on `http://localhost:3001`.
- Public tunnel was used successfully for PayOS webhook delivery.
- Backend and tunnel processes were stopped after the test.

Checkout:

- Provider: `payos`
- Tier: `premium`
- Interval: `monthly`
- Amount: `59000` VND
- Order code: `1781283708818137`
- Checkout URL: real PayOS checkout URL, not a mock URL.

Return URL:

```json
{
  "ok": true,
  "provider": "payos",
  "message": "Payment status will be confirmed by webhook."
}
```

Return URL remained UX-only. No invoice was marked paid from the return URL.

Webhook:

- Backend received `POST /billing/webhooks/payos` with HTTP `201`.
- `billing_events.event_type = 'payos.payment.success'`
- `billing_events.status = 'processed'`
- `billing_events.provider_event_id = 'payos:637c6d5c1dba4adbb2bd048daf290e02:FT26164HMQ86'`
- `billing_events.error_message is null`

Invoice:

- `provider = 'payos'`
- `provider_invoice_id = '1781283708818137'`
- `status = 'paid'`
- `amount_vnd = 59000`
- `paid_at = '2026-06-12T17:11:30+00:00'`

Subscription:

- `provider = 'payos'`
- `tier = 'premium'`
- `status = 'active'`
- `is_paid = true`
- `billing_period_end = '2026-07-12T17:11:30+00:00'`

Entitlement:

- `tier = 'premium'`
- `source = 'paid'`
- `provider = 'payos'`
- `active_until = '2026-07-12T17:11:30+00:00'`

Admin revenue:

- API verification skipped because no admin JWT was available.
- The ledger contains the required paid PayOS invoice and active PayOS subscription for `confirmed_revenue` to include PayOS.

Validation completed after the real PayOS E2E:

- Backend build: PASS
- Mobile lint: PASS
- Full tests: PASS, `365 passed`, `12 skipped`

Post-test secret hygiene:

- Rotate `PAYOS_CHECKSUM_KEY` after local E2E exposure and update hosted/local environment values.
- Keep PayOS credentials only in environment configuration. Do not commit `.env` files.
