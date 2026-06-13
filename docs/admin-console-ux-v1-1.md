# Admin Console UX V1.1

Admin Console UX V1.1 refines the V1 admin structure into a more conventional desktop console layout inspired by Stripe, Supabase, and Linear. The change is UI-only: no backend behavior, API contracts, admin authorization, Billing/PayOS logic, or product features were changed.

## Why the layout changed

UX V1 introduced shared admin components, but the desktop layout still felt visually fragmented:

- Navigation rendered as horizontal cards under the page title.
- Main KPI/detail cards could appear pushed toward the far right.
- The center of the page had too much unused space.
- Admin workflows did not feel like one cohesive console.

V1.1 moves navigation into a fixed-width left sidebar on tablet/desktop and gives the main content area the full remaining width.

## Sidebar navigation structure

Desktop/tablet admin screens now use a two-column layout:

| Area | Behavior |
| --- | --- |
| Left sidebar | Fixed width around 240px, contains product/admin label, route navigation, and logout. |
| Main content | Flexible width, contains page header, page subtitle, refresh/actions, and page content. |

Routes in the sidebar:

- Overview -> `/admin`
- Users -> `/admin/users`
- Revenue -> `/admin/revenue`
- Payment Issues -> `/admin/payment-issues`
- AI Usage -> `/admin/ai-usage`
- Audit Log -> `/admin/audit-log`

The active route is highlighted with a subtle background and accent border. Navigation items are compact list rows rather than large dashboard cards.

## Overview content hierarchy

The `/admin` overview now follows this order:

1. Page header and subtitle
2. KPI grid
   - Active users today
   - Active users 7d
   - New users 7d
   - AI requests today
   - AI cost today
   - Quota blocked today
3. Quick actions grid
   - Users
   - Revenue
   - Payment Issues
   - AI Usage
4. Needs attention section
   - Payment Issues
   - Revenue
   - AI Usage

The KPI grid sits directly under the header and uses the full main content width, avoiding the previous right-heavy layout.

## Responsive behavior

| Width | Layout |
| --- | --- |
| Desktop/tablet | Left sidebar plus right main content. |
| Small/mobile | Header first, compact wrapped navigation under the header, then content. |

The layout avoids horizontal overflow by letting mobile nav wrap and by keeping all grids flexible.

## Future polish

- Charts for revenue, AI usage, and support queue trends.
- Open issue counts in the sidebar and Needs attention section.
- PayOS webhook health: signature failures, latency, idempotency, and last successful event.
- Notification delivery health: push/email delivery status, skipped states, and retry visibility.
- Desktop sidebar collapse state for narrower tablets.
- Saved filters for payment issues, users, and audit log.
