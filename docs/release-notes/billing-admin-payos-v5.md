# Billing/Admin PayOS V5 Release Notes

## Scope Completed

- PayOS prepaid checkout, webhook processing, paid invoice recording, active subscription creation, and entitlement sync.
- Mobile PayOS paywall for Premium/Pro prepaid plans.
- PayOS renewal reminder foundation for prepaid subscriptions.
- Admin login, admin route guard UX, logout, and access-denied handling.
- Admin Revenue dashboard support for confirmed billing revenue.
- Admin user detail `Billing & PayOS` support card with safe billing fields.

## Backend Endpoints

- `POST /billing/checkout/payos`
- `POST /billing/webhooks/payos`
- `GET /billing/entitlement`
- `GET /billing/renewal-reminder`
- `GET /admin/revenue`
- `GET /admin/users/:userId`

## Mobile Screens

- Paywall
- Admin login
- Admin overview
- Admin user detail `Billing & PayOS` card

## Security Notes

- PayOS webhook success is the source of truth for payment activation.
- PayOS return and cancel URLs are UX only and must not activate entitlement.
- Backend admin guards and RBAC are the source of truth for admin authorization.
- Admin support responses do not expose PayOS secrets, checksum keys, raw webhook payloads, or sensitive provider payload data.

## Manual QA Checklist

- User can open the PayOS paywall and start checkout for Premium/Pro.
- PayOS payment success completes through the sandbox/test or approved real test flow.
- Backend receives `POST /billing/webhooks/payos`.
- `billing_invoices` shows the PayOS invoice as `paid`.
- `billing_subscriptions` shows an active paid PayOS subscription.
- `GET /billing/entitlement` returns `source=paid` and `provider=payos`.
- `GET /billing/renewal-reminder` returns the expected reminder window near expiry, or `has_reminder=false` when not needed.
- Admin user can log in through `/admin/login`.
- `/admin/revenue` includes confirmed PayOS revenue.
- Admin user detail shows the `Billing & PayOS` card with entitlement, invoice, subscription, and reminder state.

## Known Limitations

- PayOS is prepaid, not recurring.
- No auto-renew.
- No proration.
- No refund automation yet.
- No App Store or Google Play subscription flow yet.

## Rollback Notes

- Disable or hide the mobile paywall entry point if checkout UX must be paused.
- Remove PayOS public webhook routing at the gateway/tunnel/provider level to stop new webhook ingestion.
- Keep existing paid invoice and subscription records intact for auditability.
- Backend entitlement remains the access source of truth; verify affected users before any manual support action.
- Admin support views are read-only for billing in this milestone and can remain enabled independently of checkout.
