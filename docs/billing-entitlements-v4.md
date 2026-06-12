# Billing Entitlements V4

Billing entitlement is the safe, user-facing access state for a user. It answers whether the current user should be treated as `free`, `premium`, or `pro`.

## Priority

Entitlements are resolved in this order:

1. Active paid billing ledger subscription
2. Legacy `user_subscriptions` trial/manual grant
3. Free

The billing ledger is the source of truth for paid access. Legacy `user_subscriptions` remains a compatibility layer for existing app code, trials, and manual/admin grants.

## Paid Billing Ledger Rules

A paid billing subscription grants access only when:

- `billing_subscriptions.is_paid = true`
- `billing_subscriptions.status = 'active'`
- `billing_subscriptions.cancelled_at is null`
- `billing_subscriptions.billing_period_end is null` or is in the future

If multiple active paid rows exist, the highest tier wins:

```text
pro > premium > free
```

## Legacy Fallback

When no active paid billing subscription exists, the service checks `user_subscriptions`.

- `payment_provider = 'trial'` maps to source `trial`.
- `payment_provider = 'manual'` maps to source `manual`.
- Unknown/null legacy providers are not treated as paid access.

The service does not remove or aggressively overwrite trial/manual rows.

## Endpoint

Authenticated users can call:

```http
GET /billing/entitlement
Authorization: Bearer <JWT>
```

Response:

```json
{
  "user_id": "user_...",
  "tier": "premium",
  "source": "paid",
  "provider": "payos",
  "active_until": "2026-07-12T00:00:00.000Z"
}
```

The endpoint does not expose provider customer IDs, invoice data, or raw billing rows.

## Sync To Legacy Subscriptions

After Stripe subscription webhooks or verified successful PayOS payment webhooks update `billing_subscriptions`, the backend attempts to sync paid entitlement into `user_subscriptions`.

For paid entitlements, it upserts:

- `user_id`
- `tier`
- `is_active = true`
- `payment_provider`
- `renews_at`
- `updated_at`

For `trial`, `manual`, or `free` entitlement, sync is skipped so legacy grants are not overwritten unnecessarily.

Webhook delivery still succeeds if compatibility sync fails; the billing ledger remains the paid source of truth.

## Admin Detail

Admin user detail responses include a safe `billing_entitlement` summary:

```json
{
  "tier": "pro",
  "source": "paid",
  "provider": "stripe",
  "active_until": "2026-07-12T00:00:00.000Z"
}
```

## PayOS V5

PayOS prepaid purchases can grant paid entitlement when a verified successful PayOS webhook creates an active paid `billing_subscriptions` row with `provider='payos'`. Return and cancel URLs do not grant access. Monthly purchases set the paid period to one month; annual purchases set it to one year.

## Limitations

- Stripe env is not required for entitlement resolution.
- Entitlement logic does not call Stripe or any external network.
- Stripe payment E2E remains pending until Stripe test-mode env is configured.
- PayOS env is not required for entitlement resolution; it is required only for real checkout/webhook verification.
- PayOS is prepaid only and has no recurring auto-charge in V5.
- App Store and Google Play paid rows can be represented in the billing ledger, but provider-specific checkout/webhook mapping is still pending.
