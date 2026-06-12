# PayOS V5 Rollout Checklist

Status: ready for staging/production rollout after local E2E passed.

This checklist enables PayOS prepaid billing on a real backend environment. PayOS is used for Vietnam-friendly prepaid payments. It is not recurring auto-charge.

## 1. Preconditions

- Billing V5 PayOS backend has been merged and deployed.
- PayOS V5.1 paywall UI has been merged and deployed.
- `supabase/migrations.disabled/0063_billing_provider_payos.sql` has been reviewed and applied to the target database.
- Local E2E has passed: PayOS checkout, verified webhook, invoice paid, active subscription, and entitlement `paid/payos`.
- No PayOS credentials are committed to Git.

## 2. Required environment variables

Set these on the backend runtime only:

```env
PAYOS_CLIENT_ID=<from PayOS dashboard>
PAYOS_API_KEY=<from PayOS dashboard>
PAYOS_CHECKSUM_KEY=<from PayOS dashboard>
PAYOS_RETURN_URL=https://<backend-domain>/billing/return/payos
PAYOS_CANCEL_URL=https://<backend-domain>/billing/cancel/payos
```

Keep these values out of source control, logs, screenshots, and chat messages.

## 3. Database rollout

Apply the PayOS provider migration on the target database:

```sql
-- supabase/migrations.disabled/0063_billing_provider_payos.sql
```

Verify PayOS is accepted by the billing tables:

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

Optional smoke insert should only be done in a disposable staging database, then rolled back.

## 4. PayOS webhook confirmation

The webhook URL must be public and point to the deployed backend:

```text
https://<backend-domain>/billing/webhooks/payos
```

Confirm it with PayOS API from a secure shell that has the real credentials available:

```powershell
$clientId = $env:PAYOS_CLIENT_ID
$apiKey = $env:PAYOS_API_KEY
$webhookUrl = "https://<backend-domain>/billing/webhooks/payos"

$body = @{
  webhookUrl = $webhookUrl
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://api-merchant.payos.vn/confirm-webhook" `
  -Headers @{
    "x-client-id" = $clientId
    "x-api-key" = $apiKey
    "Content-Type" = "application/json"
  } `
  -Body $body
```

Expected result:

```text
code = 00
desc = success
```

Do not use localhost for PayOS webhook confirmation.

## 5. Runtime smoke test

Create a test checkout from the app paywall or directly through the API:

```http
POST /billing/checkout/payos
Authorization: Bearer <USER_JWT>
Content-Type: application/json

{
  "tier": "premium",
  "interval": "monthly"
}
```

Expected response:

```json
{
  "ok": true,
  "provider": "payos",
  "checkout_url": "https://pay.payos.vn/...",
  "order_code": 123456789,
  "tier": "premium",
  "interval": "monthly",
  "amount_vnd": 59000
}
```

Before payment, verify an open invoice exists:

```sql
select provider, provider_invoice_id, user_id, tier, status, amount_vnd, paid_at, created_at
from public.billing_invoices
where provider = 'payos'
order by created_at desc
limit 10;
```

Expected:

```text
provider = payos
status = open
paid_at = null
```

## 6. Payment verification

After manually paying through PayOS, verify webhook processing.

Billing events:

```sql
select provider, provider_event_id, event_type, status, processed_at, error, created_at
from public.billing_events
where provider = 'payos'
order by created_at desc
limit 10;
```

Expected:

```text
event_type = payos.payment.success
status = processed
error = null
```

Invoice:

```sql
select provider, provider_invoice_id, user_id, tier, status, amount_vnd, paid_at
from public.billing_invoices
where provider = 'payos'
order by created_at desc
limit 10;
```

Expected:

```text
status = paid
paid_at is not null
```

Subscription:

```sql
select provider, provider_subscription_id, user_id, tier, status, is_paid,
       billing_period_start, billing_period_end, cancelled_at
from public.billing_subscriptions
where provider = 'payos'
order by created_at desc
limit 10;
```

Expected:

```text
status = active
is_paid = true
billing_period_end > now()
```

## 7. Entitlement verification

Call the entitlement endpoint with the same user token:

```http
GET /billing/entitlement
Authorization: Bearer <USER_JWT>
```

Expected:

```json
{
  "tier": "premium",
  "source": "paid",
  "provider": "payos",
  "active_until": "<future timestamp>"
}
```

The mobile app should only show paid PayOS status after this backend entitlement response. It must not activate the package locally after opening PayOS checkout.

## 8. Admin revenue verification

Call admin revenue with an admin token:

```http
GET /admin/revenue
Authorization: Bearer <ADMIN_JWT>
```

Expected:

```text
confirmed_revenue.active_paid_by_provider includes payos
confirmed_revenue.month_to_date includes the paid invoice amount
```

If an admin token is not available, verify the underlying ledger rows first and mark API verification as pending.

## 9. Secret hygiene

- Never commit `.env` files.
- Rotate `PAYOS_CHECKSUM_KEY` after exposed screenshots or shared debugging sessions.
- If Client ID or API Key are exposed and cannot be rotated in dashboard, create a new PayOS channel or contact PayOS support before production.
- Keep production credentials separate from local/staging credentials.

## 10. Rollback plan

If PayOS has issues after deployment:

1. Hide or disable the PayOS paywall entry point in the mobile app or feature flag.
2. Remove or disable PayOS env variables from the backend runtime.
3. Keep existing billing ledger data; do not delete paid invoices/subscriptions.
4. If a payment succeeded but entitlement failed, inspect `billing_events`, `billing_invoices`, and `billing_subscriptions` before making any manual correction.
5. Use manual/admin grant only as a documented customer-support fallback.

## 11. Known limitations

- PayOS is prepaid, not recurring auto-charge.
- No automatic renewal.
- No upgrade/downgrade proration yet.
- Renewal reminder is not implemented yet.
- Return/cancel URLs are UX only; verified webhook is the source of truth.
- App Store / Google Play subscription support remains a future option for mobile recurring billing.
