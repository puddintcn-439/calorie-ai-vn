# Admin Billing Support

## Purpose

The admin user detail screen includes a read-only `Billing & PayOS` section so support can verify prepaid PayOS access without touching payment state.

## What To Check

Use `GET /admin/users/:userId` or the Admin Console user detail screen.

Payment is verified when the latest billing invoice shows:

- `provider = payos`
- `status = paid`
- `amount_vnd` matches the purchased plan
- `paid_at` is present
- `order_code` / `provider_invoice_id` matches the PayOS checkout order

Subscription is active when the latest billing subscription shows:

- `provider = payos`
- `status = active`
- `is_paid = true`
- `billing_period_end` is in the future

Entitlement is active when billing entitlement shows:

- `source = paid`
- `provider = payos`
- `tier = premium` or `pro`
- `active_until` matches the paid billing period

Renewal reminder state is shown from the prepaid PayOS reminder endpoint. It may be `has_reminder = false` or include the current reminder window, days remaining, and support-safe message.

## Important

The PayOS return URL is UX only. Admins must not rely on the return URL as proof of payment. Only a verified PayOS webhook that records a paid invoice and active subscription should be treated as payment confirmation.

The admin view must not expose PayOS secrets, checksum keys, raw webhook payloads, or sensitive provider payload data.
