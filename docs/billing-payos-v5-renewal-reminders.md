# PayOS V5 Renewal Reminders

## Model

PayOS billing is prepaid. The app creates a PayOS checkout link, the user pays once, and the verified PayOS webhook activates access for the purchased period. There is no automatic renewal and no automatic charge.

Access remains controlled by `GET /billing/entitlement`. Renewal reminders are only a UX layer to help prepaid users renew before or after `billing_period_end`.

## Reminder Windows

The backend checks active paid PayOS subscriptions for the current authenticated user:

- `provider = 'payos'`
- `status = 'active'`
- `is_paid = true`
- `billing_period_end` is present

Reminder windows:

- `7_day`: subscription ends within 7 days
- `3_day`: subscription ends within 3 days
- `1_day`: subscription ends within 1 day
- `expired`: subscription period has ended

If a user has already renewed and has a later active PayOS subscription for the same or higher tier, the reminder is based on the later active period.

## Endpoint

`GET /billing/renewal-reminder`

Authentication is required. The endpoint only evaluates the current authenticated user.

When no reminder is needed:

```json
{ "has_reminder": false }
```

When a reminder is needed:

```json
{
  "has_reminder": true,
  "tier": "premium",
  "provider": "payos",
  "active_until": "2026-07-12T17:11:30.000Z",
  "billing_period_end": "2026-07-12T17:11:30.000Z",
  "days_remaining": 7,
  "reminder_window": "7_day",
  "message": "Gói Premium của bạn còn 7 ngày. Gia hạn để tiếp tục sử dụng."
}
```

## Mobile UX

The paywall calls the reminder endpoint on load. If `has_reminder = true`, it shows the backend reminder message in the subscription status area.

The `Gia hạn ngay` button reuses the existing PayOS checkout flow. It creates a new PayOS checkout and opens the returned checkout URL. The app does not activate entitlement locally; only a verified PayOS webhook can extend access.

## Future Improvements

- Push notification reminders
- Email reminders
- Admin visibility into upcoming PayOS expirations
- Reminder audit events
- User-selectable renewal interval from the reminder CTA
