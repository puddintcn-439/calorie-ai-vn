# Billing PayOS V5

Billing V5 adds PayOS prepaid checkout for Vietnam. PayOS is not recurring auto-charge in this implementation: users buy Premium or Pro for one month or one year, pay manually through a PayOS payment link/QR, and only a verified PayOS webhook activates access.

## Required Environment

- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- `PAYOS_RETURN_URL`
- `PAYOS_CANCEL_URL`

Do not commit real PayOS credentials. Non-production can return a mock checkout URL when PayOS config is missing. Production rejects checkout/webhook verification safely when config is missing.

## Migration

Apply `supabase/migrations.disabled/0063_billing_provider_payos.sql` before enabling real PayOS runtime. It updates billing ledger provider constraints to include `payos`.

## Checkout

Authenticated users can create a prepaid PayOS order:

```http
POST /billing/checkout/payos
Authorization: Bearer <JWT>
```

```json
{
  "tier": "premium",
  "interval": "monthly"
}
```

Prices are fixed in VND:

- Premium monthly: `59000`
- Premium annual: `499000`
- Pro monthly: `129000`
- Pro annual: `999000`

The backend creates or links `billing_customers` with `provider='payos'`, then creates an open `billing_invoices` row before returning the payment link. The local invoice uses `provider_invoice_id=String(orderCode)` and stores the order metadata.

Example response:

```json
{
  "ok": true,
  "provider": "payos",
  "checkout_url": "https://pay.payos.vn/...",
  "order_code": 1760000000000123,
  "tier": "premium",
  "interval": "monthly",
  "amount_vnd": 59000
}
```

Creating checkout does not activate a subscription.

## Webhook

PayOS should send payment notifications to:

```http
POST /billing/webhooks/payos
```

When configured, webhook payloads are verified with:

```ts
payOS.webhooks.verify(req.body)
```

The provider event id is:

- `payos:<paymentLinkId>:<reference>` when both fields are present
- otherwise `payos:<orderCode>:<code>`

Duplicate billing events return safely and do not duplicate invoices or subscriptions.

## Activation Rule

Access is granted only when the verified webhook has:

- `success === true`
- `code === '00'`
- currency is `VND` when present
- webhook amount matches the pending invoice `amount_vnd`

Successful webhooks mark the invoice paid, create/update a paid active `billing_subscriptions` row with `provider='payos'`, then call `syncUserSubscriptionFromBilling(userId)`. Entitlement then returns `source='paid'` and `provider='payos'`.

Monthly purchases add one month. Annual purchases add one year. Same-tier renewals extend from the current active end date when it is in the future. Upgrade/downgrade proration is not supported yet.

## Return And Cancel URLs

`GET /billing/return/payos` and `GET /billing/cancel/payos` are UX-only endpoints. They never mark an order paid. Webhook verification is the only trusted payment confirmation.

## Local Mock Behavior

Outside production, when PayOS credentials are missing, checkout returns:

```text
http://localhost:3000/mock-payos-checkout?provider=payos&tier=<tier>&interval=<interval>&orderCode=<orderCode>
```

This is for local UI wiring only and does not grant entitlement.

## Production Checklist

- Apply `supabase/migrations.disabled/0063_billing_provider_payos.sql`.
- Configure all PayOS env variables.
- Configure PayOS webhook delivery to `POST /billing/webhooks/payos`.
- Confirm webhook verification succeeds before enabling paid access.
- Keep return/cancel screens informational; do not trust redirects for activation.

## Limitations

- No automatic recurring charge.
- No proration for tier changes.
- Renewal reminder/paywall UI is not included yet.
- App Store and Google Play provider-specific automation remains pending.
