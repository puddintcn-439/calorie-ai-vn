# Admin Console UX V1

Admin Console UX V1 reorganizes the existing admin screens into a clearer operational console. It does not change backend behavior, API contracts, authorization, or product features.

## Navigation structure

The shared admin navigation is visible on admin screens except `/admin/login`.

| Group | Screen | Route | Purpose |
| --- | --- | --- | --- |
| Overview | Overview | `/admin` | Operational snapshot and quick actions. |
| Users | Users | `/admin/users` | Search users and inspect plan, quota, credits, and recent activity. |
| Billing | Revenue | `/admin/revenue` | Review confirmed revenue, subscription mix, AI cost, margin, and PayOS notes. |
| Support | Payment Issues | `/admin/payment-issues` | Support queue for refund requests, duplicate payments, and paid-but-not-activated cases. |
| AI Ops | AI Usage | `/admin/ai-usage` | Review AI request volume, cost, provider/model mix, fallback, failures, and blocked quota. |
| System | Audit Log | `/admin/audit-log` | Review admin actions and audit trail. |

Logout remains available in the shared admin header. Admin route guarding remains handled by the existing route guard and backend authorization.

## Screen grouping

### `/admin`

The overview screen now presents:
- KPI cards for active users today, active users 7d, new users 7d, AI requests today, AI cost today, and quota blocked today.
- Quick action cards for Users, Revenue, Payment Issues, and AI Usage.
- A Needs attention section linking to Payment Issues, Revenue, and AI Usage without inventing counts not returned by the current API.

### `/admin/users`

The users screen keeps existing search, plan filter, pagination, and user detail links. Copy now clarifies that filters only change the query and do not mutate user data.

### `/admin/users/:id`

The user detail screen is grouped into:
- Profile
- Subscription / Entitlement
- Billing & PayOS
- AI usage
- Recent activity

Existing audited admin actions remain unchanged. No new mutation actions were added.

### `/admin/revenue`

The revenue screen keeps the existing calculations and API data, grouped as:
- Confirmed revenue
- Subscription mix
- AI cost
- Margin
- PayOS notes

Confirmed revenue remains the preferred section for PayOS reconciliation because it is ledger-based.

### `/admin/payment-issues`

The payment issue screen now reads as a support queue with clear status badges:
- `open`
- `in_review`
- `resolved`
- `rejected`

Status updates still use the existing backend update path and audit behavior.

### `/admin/ai-usage`

The AI usage screen keeps the existing time windows and metrics, with clearer sections for:
- Top features
- Top users
- Provider mix
- Model mix

## Support workflow

1. User creates a payment issue from the app.
2. Admin opens `/admin/payment-issues`.
3. Admin filters by status if needed.
4. Admin changes status to `in_review`, `resolved`, or `rejected`.
5. Admin records an internal note when needed.
6. Admin records a user-facing resolution when the user needs a response.
7. Backend audit and notification behavior remain controlled by existing services.

Resolving a payment issue does not automatically refund, revoke, or grant entitlement. Billing/subscription state remains controlled by the billing and PayOS webhook flows.

## `admin_note` vs `resolution`

| Field | Audience | Use |
| --- | --- | --- |
| `admin_note` | Internal admin/support only | Investigation notes, internal context, operational follow-up. Do not expose to user. |
| `resolution` | User-facing | Clear message explaining the decision or next step for the user. |

The UI labels these fields explicitly to reduce accidental leakage of internal support notes.

## Empty, error, and loading states

Admin screens now use consistent states:
- `Loading...`
- `No data`
- Access denied / session expired
- Retry action
- Back to admin login when the session or role is invalid

## Future improvements

- Sidebar on desktop with collapsed grouped navigation.
- Better charts for revenue, AI usage, and payment issue trends.
- Open issue counts in the navigation and overview Needs attention section.
- Webhook health for PayOS signature, latency, and idempotency.
- Notification delivery health for push and email status.
- Admin dashboard saved filters for repeated support workflows.
