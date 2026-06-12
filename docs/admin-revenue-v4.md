# Admin Revenue V4

Billing & Revenue Dashboard V4 keeps the existing estimated subscription revenue view and adds provider-confirmed billing revenue from ledger tables.

Related: see `docs/billing-entitlements-v4.md` for paid/trial/manual entitlement resolution and legacy `user_subscriptions` sync behavior.

## Estimated vs Confirmed Revenue

Estimated revenue is calculated from `user_subscriptions` tier pricing. It is useful for product and entitlement monitoring, but it can include trials, manual grants, or rows whose provider is unknown.

Confirmed revenue is calculated from billing ledger tables and appears in the `confirmed_revenue` block returned by `GET /admin/revenue`. This is the source to use for paid billing reporting when provider data is available.

## Billing Ledger Tables

The V4 foundation uses:

- `billing_customers`
- `billing_subscriptions`
- `billing_invoices`
- `billing_refunds`
- `billing_events`

The migration currently lives in `supabase/migrations.disabled/0062_billing_ledger_v4.sql` and must be explicitly applied before production ledger data is available.

## Webhook Foundation

Webhook routes exist for:

- `POST /billing/webhooks/stripe`
- `POST /billing/webhooks/payos`
- `POST /billing/webhooks/app-store`
- `POST /billing/webhooks/google-play`

The current foundation stores raw provider events in `billing_events` with idempotency on `(provider, provider_event_id)`.

## V5 PayOS Provider Support

PayOS prepaid checkout writes open invoices before payment and marks them paid only after a verified successful PayOS webhook. Because confirmed revenue reads paid rows from the billing ledger without hard-coding a provider allowlist, PayOS paid invoices and active paid subscriptions are included in `confirmed_revenue` and `active_paid_by_provider.payos` after migration `supabase/migrations.disabled/0063_billing_provider_payos.sql` is applied.

## V4.1 Stripe Event Mapping

Stripe webhooks now record the billing event first, then process known event types:

- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`
- `refund.created`

Mapped invoice events upsert `billing_invoices` when the Stripe customer is already linked in `billing_customers`. Subscription events upsert `billing_subscriptions`. Refund events upsert `billing_refunds` when a linked customer is available. If the Stripe customer is not linked to a user, the event is kept and marked `ignored` with a non-secret reason.

Unknown Stripe event types remain stored as `received` and do not throw.

## V4.2 Stripe Checkout And Customer Linking

Authenticated users can start the Stripe subscription flow with:

- `POST /billing/checkout/stripe`

Request body:

```json
{
  "tier": "premium",
  "interval": "monthly"
}
```

Allowed tiers are `premium` and `pro`. Allowed intervals are `monthly` and `annual`.

The checkout foundation first links the app user to a Stripe customer in `billing_customers`. Existing `billing_customers` rows for `provider='stripe'` and the current `user_id` are reused. If no row exists, the service creates a deterministic local placeholder customer id in non-production only:

```text
test_cus_<user_id>
```

Production never returns placeholder customer ids or mock checkout URLs. Until the real Stripe SDK integration is wired, production checkout returns a clear `501` configuration error instead of pretending to create a session.

Stripe webhook mapping resolves users through `billing_customers`. As a safe fallback, webhook metadata can link a Stripe customer when `metadata.user_id` is present and is a valid UUID. The service does not guess users from email addresses.

In non-production without a live Stripe client, checkout returns a local mock URL:

```text
http://localhost:3000/mock-checkout?provider=stripe&tier=premium&interval=monthly
```

## V4.3 Real Stripe SDK And Signature Verification

The backend now uses the official Stripe Node SDK when `STRIPE_SECRET_KEY` is configured.

For checkout, `POST /billing/checkout/stripe` creates a real Stripe Checkout Session when all Stripe config is present:

- customer: resolved from `billing_customers` or created through `stripe.customers.create`
- mode: `subscription`
- line item: the configured Stripe price id
- metadata: `user_id`, `tier`, and `interval`
- subscription metadata: `user_id`, `tier`, and `interval`

If `STRIPE_SECRET_KEY` is missing outside production, the route keeps the local mock checkout URL behavior for development. In production, mock checkout is never allowed.

Stripe webhook verification now requires the raw request body in production. The Nest app is bootstrapped with raw body support so `POST /billing/webhooks/stripe` can verify:

- `STRIPE_WEBHOOK_SECRET`
- `Stripe-Signature` header
- raw request body

Production webhooks are verified with `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` before any billing event is recorded or mapped. Invalid signatures return a safe `400` error and do not expose secrets. Outside production, the existing `x-webhook-secret` placeholder flow remains available for local development and tests.

## Environment Variables

- `USD_TO_VND_RATE`: optional exchange rate, defaults to `26000`.
- `STRIPE_SECRET_KEY`: required for real Stripe customer/session creation.
- `STRIPE_WEBHOOK_SECRET`: placeholder secret checked against `x-webhook-secret`.
- `STRIPE_PRICE_PREMIUM_MONTHLY`: Stripe price id for premium monthly checkout.
- `STRIPE_PRICE_PRO_MONTHLY`: Stripe price id for pro monthly checkout.
- `STRIPE_PRICE_PREMIUM_ANNUAL`: Stripe price id for premium annual checkout.
- `STRIPE_PRICE_PRO_ANNUAL`: Stripe price id for pro annual checkout.
- `BILLING_SUCCESS_URL`: success redirect URL for real Stripe Checkout sessions.
- `BILLING_CANCEL_URL`: cancel redirect URL for real Stripe Checkout sessions.
- `APP_STORE_WEBHOOK_SECRET`: placeholder secret checked against `x-webhook-secret`.
- `GOOGLE_PLAY_WEBHOOK_SECRET`: placeholder secret checked against `x-webhook-secret`.
- `PAYOS_CLIENT_ID`: PayOS client id for prepaid checkout and webhook verification.
- `PAYOS_API_KEY`: PayOS API key.
- `PAYOS_CHECKSUM_KEY`: PayOS checksum key for webhook verification.
- `PAYOS_RETURN_URL`: PayOS return URL for UX only.
- `PAYOS_CANCEL_URL`: PayOS cancel URL for UX only.

If a webhook secret is not configured, webhook calls are accepted only outside production. In production, the endpoint returns `501` until the provider secret or full signature verification is configured.

## Production Checklist

- Apply `supabase/migrations.disabled/0062_billing_ledger_v4.sql`.
- Apply `supabase/migrations.disabled/0063_billing_provider_payos.sql` before enabling PayOS.
- Configure `STRIPE_SECRET_KEY`.
- Configure `STRIPE_WEBHOOK_SECRET`.
- Configure all Stripe price ids.
- Configure `BILLING_SUCCESS_URL` and `BILLING_CANCEL_URL`.
- Ensure Stripe sends webhooks to `POST /billing/webhooks/stripe` with the `Stripe-Signature` header.
- Keep App Store and Google Play webhooks disabled for billing automation until provider-specific mapping is implemented.
- Configure PayOS credentials and webhook delivery before enabling Vietnam prepaid checkout.

## Validation

Run:

```bash
npm --workspace apps/backend run build
npm --workspace apps/mobile run lint
npm run test
```

## Known Limitations

- Provider signature verification is placeholder/foundation only.
- Stripe signature verification is real in production and placeholder-compatible only outside production.
- Stripe Checkout uses real Stripe SDK calls when configured, and a non-production mock URL only when Stripe config is absent.
- Production Stripe Checkout is blocked if Stripe config, price ids, `BILLING_SUCCESS_URL`, or `BILLING_CANCEL_URL` are missing.
- App Store and Google Play events are stored only; provider-specific mapping is still pending.
- PayOS is prepaid only; no automatic recurring charge or proration is implemented yet.
- Non-VND/USD currencies are stored as original amounts but are not converted into VND/USD yet.
- Billing tables are in `migrations.disabled` until explicitly applied.
- Estimated MRR/ARR remains backwards-compatible and is separate from confirmed billing revenue.
