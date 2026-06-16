# Admin Users / Subscriptions Consistency Audit

Audit date: 2026-06-15
Cleanup migration: `supabase/migrations/037_normalize_subscription_consistency.sql`

## Table Roles

- `users`: account/profile table. `subscription_tier` is a denormalized cache and should not be treated as billing truth.
- `user_subscriptions`: legacy current-access bridge used by older subscription/quota/admin flows. Missing row should be interpreted as free access.
- `billing_subscriptions`: paid billing ledger/source for PayOS/Stripe/App Store/Google Play entitlements.

## Current Rules

- Active paid access requires:
  - tier is `premium` or `pro`
  - `is_active = true`
  - `cancelled_at IS NULL`
  - not expired when `renews_at` or billing period end is available
- `users.subscription_tier` should mirror current access, not historical paid status.
- Active paid billing rows should sync into `user_subscriptions` and clear legacy `cancelled_at`.

## Live Data Audit Snapshot

Observed in Supabase:

- `users`: 83
- `user_subscriptions`: 13
- `billing_subscriptions`: 1
- Duplicate `user_subscriptions.user_id`: 0
- Orphan `user_subscriptions` rows without `users`: 0
- Users without `user_subscriptions`: 70
- Rows with both `is_active = true` and `cancelled_at`: 2
- `users.subscription_tier` mismatches current legacy access: 2
- Active paid billing rows not mirrored in legacy `user_subscriptions`: 1

## Findings

1. Users without a `user_subscriptions` row are expected at current scale because missing means free.
2. The two active/cancelled legacy rows are inconsistent legacy state. They should not grant paid access.
3. One active paid PayOS billing subscription was not mirrored into `user_subscriptions`, likely historical data from before sync was tightened or a prior sync failure.
4. `users.subscription_tier` can drift and should remain a cache only.

## Fixes Applied

- `SubscriptionService.getUserSubscription()` now normalizes cancelled or expired paid legacy rows to current free access.
- `SubscriptionService.upgradeSubscription()` now clears `cancelled_at` when granting paid access.
- `BillingService.syncUserSubscriptionFromBilling()` now clears `cancelled_at` and updates `users.subscription_tier`.
- Admin Users filter now separates `cancelled` from `free`, so Users and Revenue distribution can reconcile.
- Admin Revenue copy now distinguishes paid-tier access from confirmed paid ledger revenue.
- Migration `037_normalize_subscription_consistency.sql` normalizes historical data:
  - allows current provider values on `user_subscriptions.payment_provider`
  - allows `user_subscriptions.renews_at` to be nullable for open-ended paid/manual access
  - marks cancelled legacy rows inactive when no active paid billing row exists
  - mirrors active paid billing rows into `user_subscriptions`
  - rebuilds `users.subscription_tier` from current active access

## Recommended Data Cleanup

Run `037_normalize_subscription_consistency.sql` before production QA:

- Sync active paid `billing_subscriptions` into `user_subscriptions`.
- Set `users.subscription_tier` from current active paid access, otherwise `free`.
- Normalize rows with `cancelled_at IS NOT NULL` so they cannot be interpreted as active paid.

Do not delete legacy rows without confirming support/reporting needs.

## Verification Query

After the cleanup migration, this query should return zero rows for the most important conflict:

```sql
select id, user_id, tier, is_active, cancelled_at
from public.user_subscriptions
where is_active = true
  and cancelled_at is not null;
```

Use this query to check the denormalized cache against current access:

```sql
with current_access as (
  select distinct on (us.user_id)
    us.user_id,
    us.tier
  from public.user_subscriptions us
  where us.tier in ('premium', 'pro')
    and us.is_active = true
    and us.cancelled_at is null
    and (us.renews_at is null or us.renews_at > now())
  order by
    us.user_id,
    case us.tier when 'pro' then 2 when 'premium' then 1 else 0 end desc,
    us.updated_at desc nulls last,
    us.created_at desc nulls last
)
select u.id, u.email, u.subscription_tier, coalesce(ca.tier, 'free') as expected_tier
from public.users u
left join current_access ca on ca.user_id = u.id
where u.subscription_tier is distinct from coalesce(ca.tier, 'free');
```
