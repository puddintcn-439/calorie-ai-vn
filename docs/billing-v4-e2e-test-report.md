# Billing V4 E2E Test Report

Date/time: 2026-06-12 10:40:15 +07:00

Environment: local verification, Stripe test mode only.

Migration status: `0062_billing_ledger_v4.sql` is reported as applied. Direct SQL verification from this workspace was not executed because no SQL connection string was available locally.

## Summary

- Stripe checkout E2E: skipped safely.
- Reason: required Stripe test-mode environment variables are missing locally.
- Secrets/JWTs/customer personal data: not printed, not stored in this report.
- App Store / Google Play: not tested; still raw-event placeholders.

## Environment Presence

Only presence was checked. Values were not printed.

| Key | Status |
| --- | --- |
| `STRIPE_SECRET_KEY` | missing |
| `STRIPE_WEBHOOK_SECRET` | missing |
| `STRIPE_PRICE_PREMIUM_MONTHLY` | missing |
| `STRIPE_PRICE_PRO_MONTHLY` | missing |
| `STRIPE_PRICE_PREMIUM_ANNUAL` | missing |
| `STRIPE_PRICE_PRO_ANNUAL` | missing |
| `BILLING_SUCCESS_URL` | missing |
| `BILLING_CANCEL_URL` | missing |
| `USD_TO_VND_RATE` | missing |

DB-related local env presence:

| Key | Status |
| --- | --- |
| `DATABASE_URL` | missing |
| `POSTGRES_URL` | missing |
| `SUPABASE_DB_URL` | missing |
| `SUPABASE_URL` | present |
| `SUPABASE_SERVICE_KEY` | present |

Because direct SQL connection env is missing, run the DB verification snippets below in Supabase SQL Editor.

## DB Schema Verification

Tables:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'billing_customers',
    'billing_subscriptions',
    'billing_invoices',
    'billing_refunds',
    'billing_events'
  )
order by table_name;
```

Expected: all five billing tables are returned.

RLS:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename like 'billing_%'
order by tablename;
```

Expected: `rowsecurity = true` for all billing tables.

Billing event indexes / idempotency:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'billing_events';
```

Expected: a unique constraint or unique index exists for `(provider, provider_event_id)`.

## Stripe Test-Mode Setup Checklist

- Premium monthly price created: not verified locally.
- Pro monthly price created: not verified locally.
- Premium annual price created: not verified locally.
- Pro annual price created: not verified locally.
- Webhook endpoint configured: `/billing/webhooks/stripe`: not verified locally.
- Webhook subscribed to `invoice.paid`: not verified locally.
- Webhook subscribed to `invoice.payment_succeeded`: not verified locally.
- Webhook subscribed to `invoice.payment_failed`: not verified locally.
- Webhook subscribed to `customer.subscription.created`: not verified locally.
- Webhook subscribed to `customer.subscription.updated`: not verified locally.
- Webhook subscribed to `customer.subscription.deleted`: not verified locally.
- Webhook subscribed to `charge.refunded`: not verified locally.
- Webhook subscribed to `refund.created`: not verified locally.

Local Stripe CLI command:

```bash
stripe listen --forward-to localhost:<backend-port>/billing/webhooks/stripe
```

Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET` in local env. Do not commit it.

## Checkout E2E Result

Status: skipped safely.

Reason: missing required Stripe test-mode env:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PREMIUM_MONTHLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PREMIUM_ANNUAL`
- `STRIPE_PRICE_PRO_ANNUAL`
- `BILLING_SUCCESS_URL`
- `BILLING_CANCEL_URL`
- `USD_TO_VND_RATE`

Expected request when env is configured:

```http
POST /billing/checkout/stripe
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "tier": "premium",
  "interval": "monthly"
}
```

Expected redacted response shape:

```json
{
  "ok": true,
  "provider": "stripe",
  "checkout_url": "https://checkout.stripe.com/...",
  "customer_id": "cus_...",
  "tier": "premium",
  "interval": "monthly"
}
```

## Webhook Result

Status: skipped with checkout E2E.

Expected after successful test payment:

- `billing_events` contains processed Stripe events.
- `billing_customers` links `provider_customer_id = cus_...` to the app `user_id`.
- `billing_subscriptions` contains an active paid subscription.
- `billing_invoices` contains a paid invoice.
- Duplicate webhook delivery does not create duplicate events or invoices.

## Ledger Verification SQL

Recent billing events:

```sql
select provider, provider_event_id, event_type, status, processed_at, created_at
from public.billing_events
order by created_at desc
limit 20;
```

Customers:

```sql
select provider, provider_customer_id, user_id, email, created_at
from public.billing_customers
order by created_at desc
limit 20;
```

Subscriptions:

```sql
select provider, provider_subscription_id, user_id, tier, status, is_paid,
       billing_period_start, billing_period_end, cancelled_at, created_at
from public.billing_subscriptions
order by created_at desc
limit 20;
```

Invoices:

```sql
select provider, provider_invoice_id, user_id, tier, status,
       amount_original, currency_original, amount_vnd, amount_usd, paid_at, created_at
from public.billing_invoices
order by created_at desc
limit 20;
```

Observed local counts:

| Table | Count |
| --- | --- |
| `billing_customers` | not collected |
| `billing_subscriptions` | not collected |
| `billing_invoices` | not collected |
| `billing_refunds` | not collected |
| `billing_events` | not collected |

## Admin Revenue Verification

Status: skipped with checkout E2E.

Expected request:

```http
GET /admin/revenue
Authorization: Bearer <admin JWT>
```

Expected redacted response shape after a successful paid test checkout:

```json
{
  "confirmed_revenue": {
    "source": "billing_ledger",
    "active_paid_users": 1,
    "active_paid_subscriptions": 1,
    "month_to_date": {
      "gross_revenue_vnd": 1000,
      "gross_revenue_usd": 1,
      "net_revenue_vnd": 1000,
      "net_revenue_usd": 1,
      "paid_invoice_count": 1
    }
  }
}
```

## Refund Test

Status: skipped.

Reason: no Stripe test checkout was executed locally.

Refund verification SQL:

```sql
select provider, provider_refund_id, user_id, amount_vnd, amount_usd, refunded_at, created_at
from public.billing_refunds
order by created_at desc
limit 20;
```

Expected after refund:

- `confirmed_revenue.month_to_date.refunds_vnd > 0`
- `confirmed_revenue.month_to_date.net_revenue_vnd = gross_revenue_vnd - refunds_vnd`

## Idempotency Test

Status: skipped.

Reason: no Stripe webhook event was replayed locally.

Duplicate event check:

```sql
select provider, provider_event_id, count(*)
from public.billing_events
group by provider, provider_event_id
having count(*) > 1;
```

Expected: 0 rows.

Duplicate invoice check:

```sql
select provider, provider_invoice_id, count(*)
from public.billing_invoices
where provider_invoice_id is not null
group by provider, provider_invoice_id
having count(*) > 1;
```

Expected: 0 rows.

## Validation

Backend build: PASS.

Command:

```bash
npm --workspace apps/backend run build
```

Mobile lint: PASS.

Command:

```bash
npm --workspace apps/mobile run lint
```

Tests: PASS.

Command:

```bash
npm run test
```

Result:

- Test suites: 30 passed, 1 skipped, 31 total.
- Tests: 336 passed, 12 skipped, 348 total.

## Remaining Blockers

- Configure Stripe test-mode env locally or in staging.
- Provide a SQL connection path or run the DB SQL snippets in Supabase SQL Editor.
- Authenticate a normal test user and admin user without committing JWTs.
- Run Stripe Checkout with a test card only.
- Replay or inspect Stripe test webhook delivery to confirm idempotency.
