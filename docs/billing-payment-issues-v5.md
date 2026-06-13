# Billing Payment Issues V5.4

Billing V5.4 adds a support-case workflow for PayOS prepaid payment issues and refund requests. It is intentionally auditable and manual-first.

## Supported Issue Types

- `refund_request`
- `duplicate_payment`
- `payment_succeeded_but_not_activated`
- `wrong_plan`
- `other`

## Case Statuses

- `open`
- `in_review`
- `resolved`
- `rejected`

## User Flow

Users can open the PayOS paywall support area, choose an issue type, add a short message, and submit a case through `POST /billing/payment-issues`.

Users can list their recent cases through `GET /billing/payment-issues`. User responses hide admin internal notes and never expose raw provider payloads.

## Admin Flow

Support admins can review cases through `GET /admin/payment-issues`, optionally filtering by status, provider, or user id.

Admins can update status, admin note, and resolution through `PATCH /admin/payment-issues/:id`. Updates write an admin audit log entry with action `billing.payment_issue.update`.

## What Is Not Automated

- No PayOS refund API is called.
- No entitlement is revoked automatically.
- No subscription is cancelled automatically.
- No user access is changed by creating or updating a payment issue.
- No auto-charge or recurring renewal behavior is introduced.

## Refund Policy Notes

Refund approval, rejection, provider-side action, and user communication remain manual support operations. Admins should verify the paid invoice, active subscription, and entitlement before deciding on a refund or support adjustment.

## Payment Truth Source

PayOS webhook success remains the source of truth for payment activation. Return and cancel URLs are UX-only and are not proof of payment.

## Future Work

- PayOS or manual refund integration if available and approved.
- Email notification for users/admins.
- Admin SLA tracking.
- Attachment upload for bank transfer proof or payment screenshots.
