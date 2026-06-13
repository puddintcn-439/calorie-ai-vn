# Billing Payment Issue Notifications V5.5

Billing V5.5 notifies users when payment issue/refund support cases are created or updated.

## Event Types

- `billing.payment_issue.created`
- `billing.payment_issue.in_review`
- `billing.payment_issue.resolved`
- `billing.payment_issue.rejected`

## Channels

- In-app: always persisted in `user_notifications`.
- Push: attempted through existing Expo push tokens in `push_notification_tokens`.
- Email: disabled by default with `EMAIL_PROVIDER=none`; Resend can be enabled with env configuration.

## When Notifications Are Emitted

- User creates a payment issue: emits `billing.payment_issue.created`.
- Admin changes status to `in_review`: emits `billing.payment_issue.in_review`.
- Admin changes status to `resolved`: emits `billing.payment_issue.resolved`.
- Admin changes status to `rejected`: emits `billing.payment_issue.rejected`.

Admin note-only updates do not emit notifications. Re-saving the same status does not create duplicate notifications.

## Provider Env Behavior

- `EMAIL_PROVIDER=none`: email is skipped safely.
- `EMAIL_PROVIDER=resend`: requires `RESEND_API_KEY` and `EMAIL_FROM`.
- `EMAIL_PROVIDER=smtp`: reserved for future adapter work and currently skipped safely.

Missing push tokens or email env values are recorded in `channel_status` as `skipped`. External delivery failures are recorded as `failed` and do not fail payment issue creation or admin status updates.

## User-Facing Copy

- Created: “Đã ghi nhận yêu cầu hỗ trợ thanh toán”
- In review: “Yêu cầu thanh toán đang được kiểm tra”
- Resolved: “Yêu cầu thanh toán đã được xử lý”
- Rejected: “Yêu cầu thanh toán không được chấp nhận”

Resolved and rejected notifications use the safe admin `resolution` field as the body when present. They never include `admin_note`.

## Metadata Policy

Notification metadata may include safe support identifiers such as payment issue id, issue type, status, provider, and invoice id. It must not include raw PayOS payloads, webhook signatures, provider secrets, push tokens, email API keys, or internal admin notes.

## Intentionally Not Included

- No PayOS refund API calls.
- No automatic entitlement or subscription mutation.
- No admin notification management UI.
- No raw provider payload or secret exposure.

## Future Work

- Notification preferences.
- SLA reminders for open support cases.
- Richer email templates.
- Attachment support for payment proof.
- Real refund automation if PayOS support/process is confirmed.
