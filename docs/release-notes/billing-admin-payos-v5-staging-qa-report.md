# Billing/Admin/PayOS V5 Staging QA Report

Final audit baseline: `b6a265e3794441251b6f58b94aca3f78c84f5f8b`

Automated validation baseline:
- mobile lint: PASS
- backend build: PASS
- npm test: PASS
- test count: 401 passed, 12 skipped

QA execution date:
QA owner:
Target environment:
Overall status: Not started

## 1. Environment Info

| Item | Value | Notes |
| --- | --- | --- |
| Backend URL |  |  |
| App build/version |  | Include Expo/native/web build identifier if available. |
| Database/project |  | Supabase project ref/name and migration state. |
| PayOS channel |  | Sandbox or production-like staging. |
| Webhook URL |  | Public URL configured in PayOS. |
| Resend/email config status |  | `none`, configured, or intentionally skipped. |
| Push notification config status |  | Firebase/Expo status and test device availability. |

## 2. Pre-flight Checklist

| Check | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- |
| Migration `0063` applied | Applied on target database |  |  |  |
| Migration `0064` applied | Applied on target database |  |  |  |
| Migration `0065` applied | Applied on target database |  |  |  |
| `PAYOS_CLIENT_ID` set | Present in backend runtime |  |  | Do not paste secret value. |
| `PAYOS_API_KEY` set | Present in backend runtime |  |  | Do not paste secret value. |
| `PAYOS_CHECKSUM_KEY` set | Present in backend runtime |  |  | Do not paste secret value. |
| `PAYOS_RETURN_URL` set | Points to staging app return route |  |  |  |
| `PAYOS_CANCEL_URL` set | Points to staging app cancel route |  |  |  |
| PayOS webhook confirmed | Webhook endpoint registered and reachable |  |  |  |
| `EMAIL_PROVIDER` value | `none` or expected provider |  |  |  |
| `RESEND_API_KEY` configured or intentionally skipped | Configured only when `EMAIL_PROVIDER=resend` |  |  | Do not paste secret value. |
| Admin account configured | Admin can log in to staging |  |  | Record admin email only if safe. |

## 3. User Payment Flow

| Test ID | Scenario | Steps | Expected result | Actual result | Status | Evidence/log link | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PAY-001 | Open paywall | Log in as free user, navigate to premium/paywall entry point. | Paywall renders available paid plan and PayOS CTA. |  |  |  |  |
| PAY-002 | Create PayOS checkout | Click upgrade/checkout CTA. | Backend creates pending invoice and returns PayOS checkout URL. |  |  |  |  |
| PAY-003 | Verify open invoice | Open PayOS checkout URL. | PayOS invoice page opens with correct amount, description, and order code. |  |  |  |  |
| PAY-004 | Complete payment | Complete payment in PayOS staging channel. | PayOS marks payment successful and redirects/returns according to configured URL. |  |  |  |  |
| PAY-005 | Webhook received | Inspect backend logs/admin billing state after payment. | Signed PayOS webhook is accepted and stored/processed once. |  |  |  |  |
| PAY-006 | Invoice paid | Check invoice in app/admin/database. | Invoice status is `paid`. |  |  |  |  |
| PAY-007 | Subscription active | Check subscription state after webhook. | User subscription is active for paid tier. |  |  |  |  |
| PAY-008 | Entitlement paid/payos | Check entitlement source/provider. | Entitlement shows paid access with PayOS/provider metadata. |  |  |  |  |
| PAY-009 | App shows premium active | Reload app and paid feature screens. | App shows premium active and paid gates are unlocked. |  |  |  |  |

## 4. Renewal Reminder Flow

| Test ID | Scenario | Steps | Expected result | Actual result | Status | Evidence/log link | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REN-001 | No reminder when not near expiry | Use active subscription outside reminder window, run/check reminder process. | No renewal reminder notification/email is created. |  |  |  |  |
| REN-002 | 7-day reminder | Set subscription expiry to 7 days away, run/check reminder process. | One 7-day reminder is created and is idempotent. |  |  |  |  |
| REN-003 | 3-day reminder | Set subscription expiry to 3 days away, run/check reminder process. | One 3-day reminder is created and is idempotent. |  |  |  |  |
| REN-004 | 1-day reminder | Set subscription expiry to 1 day away, run/check reminder process. | One 1-day reminder is created and is idempotent. |  |  |  |  |
| REN-005 | Expired reminder | Set subscription expired, run/check reminder process. | Expired reminder is created without granting access. |  |  |  |  |

## 5. Payment Issue Flow

| Test ID | Scenario | Steps | Expected result | Actual result | Status | Evidence/log link | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ISS-001 | User creates `refund_request` | Log in as paid user, create issue for own invoice. | Issue is created with type `refund_request` and visible to user/admin. |  |  |  |  |
| ISS-002 | User creates `duplicate_payment` | Create issue for own invoice. | Issue is created with type `duplicate_payment`. |  |  |  |  |
| ISS-003 | User creates `payment_succeeded_but_not_activated` | Create issue for own invoice. | Issue is created with type `payment_succeeded_but_not_activated`. |  |  |  |  |
| ISS-004 | User sees own cases only | Create issues for two users, list issues as user A. | User A sees only user A issues. |  |  |  |  |
| ISS-005 | User cannot reference another user's invoice | Submit issue referencing another user's invoice ID. | Request is rejected with safe client-facing error. |  |  |  |  |

## 6. Notification Flow

| Test ID | Scenario | Steps | Expected result | Actual result | Status | Evidence/log link | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NOT-001 | Created notification appears | Create payment issue as user. | User notification appears for created issue if expected by product rules. |  |  |  |  |
| NOT-002 | Admin changes `in_review` | Admin updates issue status to `in_review`. | Issue status updates and audit trail is recorded. |  |  |  |  |
| NOT-003 | User receives `in_review` notification | Refresh user notification screen/API. | User receives `in_review` notification. |  |  |  |  |
| NOT-004 | Admin resolves with resolution | Admin sets status `resolved` and enters resolution text. | Issue is resolved with visible resolution. |  |  |  |  |
| NOT-005 | User receives resolved notification | Refresh user notification screen/API. | User receives resolved notification with resolution. |  |  |  |  |
| NOT-006 | Admin rejects with resolution | Admin sets status `rejected` and enters resolution text. | Issue is rejected with visible resolution. |  |  |  |  |
| NOT-007 | User receives rejected notification | Refresh user notification screen/API. | User receives rejected notification with resolution. |  |  |  |  |
| NOT-008 | Mark notification as read | User marks notification as read. | Notification read state persists after reload. |  |  |  |  |
| NOT-009 | `admin_note` hidden from user | Admin adds internal note, user fetches issue/notification. | `admin_note` is not visible to user. |  |  |  |  |
| NOT-010 | Push skipped safely if no token | User has no push token, trigger notification. | Backend does not fail; push is skipped safely. |  |  |  |  |
| NOT-011 | Email skipped safely if `EMAIL_PROVIDER=none` | Set email provider none, trigger notification. | Backend does not fail; email is skipped safely. |  |  |  |  |
| NOT-012 | Email delivered if Resend configured | Configure Resend in staging, trigger notification. | Email is delivered to test inbox and delivery is logged. |  |  |  |  |

## 7. Admin Flow

| Test ID | Scenario | Steps | Expected result | Actual result | Status | Evidence/log link | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ADM-001 | `/admin/login` | Open admin login and sign in as configured admin. | Admin login succeeds and session persists. |  |  |  |  |
| ADM-002 | Admin overview | Open admin overview dashboard. | Overview metrics render without API errors. |  |  |  |  |
| ADM-003 | Admin revenue | Open revenue screen. | Revenue/invoice metrics render and match staging records. |  |  |  |  |
| ADM-004 | Admin user detail Billing & PayOS card | Open paid user's detail page. | Billing and PayOS card shows invoice, subscription, entitlement data. |  |  |  |  |
| ADM-005 | Admin payment issues screen | Open payment issues screen. | Issues list renders with filters/statuses. |  |  |  |  |
| ADM-006 | Admin update issue status | Change issue status and resolution. | Status persists, notifications are generated according to rules. |  |  |  |  |
| ADM-007 | Admin logout | Click logout and refresh. | Admin session is cleared and protected routes require login. |  |  |  |  |
| ADM-008 | Non-admin cannot access admin APIs | Use non-admin token against admin APIs. | API returns `401` or `403`; no admin data is exposed. |  |  |  |  |

## 8. Failure/Safety Checks

| Test ID | Scenario | Steps | Expected result | Actual result | Status | Evidence/log link | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SAFE-001 | Invalid PayOS webhook rejected | Send webhook with invalid/missing signature. | Backend rejects request and does not mutate invoice/subscription. |  |  |  |  |
| SAFE-002 | Duplicate webhook idempotent | Send same valid webhook twice. | First request processes; duplicate is accepted/ignored without double activation or duplicate records. |  |  |  |  |
| SAFE-003 | Return/cancel URL does not activate entitlement | Hit return/cancel route without valid webhook. | Entitlement remains unchanged until signed webhook is processed. |  |  |  |  |
| SAFE-004 | PayOS provider errors sanitized | Force PayOS API failure or bad config in staging-safe way. | User/admin sees safe error; secrets/provider raw payload are not exposed. |  |  |  |  |
| SAFE-005 | No secrets/raw webhook payload exposed | Inspect API responses, admin UI, logs intended for client. | No API keys, checksum keys, or raw sensitive webhook payload are exposed. |  |  |  |  |
| SAFE-006 | Payment issue resolution does not auto-refund | Resolve refund request in admin. | Issue status changes only; no automatic PayOS refund is triggered. |  |  |  |  |
| SAFE-007 | Payment issue resolution does not auto-revoke entitlement | Resolve/reject payment issue. | Entitlement remains controlled by billing/subscription logic only. |  |  |  |  |

## 9. Result Table

| Test ID | Scenario | Steps | Expected result | Actual result | Status | Evidence/log link | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | Not started |  |  |

Status values:
- Not started
- Pass
- Fail
- Blocked
- Not applicable

## 10. Go/No-Go

### Blockers

| ID | Description | Owner | Target fix | Status |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### Non-blocking Issues

| ID | Description | Impact | Follow-up | Status |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### Final Recommendation

Recommendation: No-Go until QA is executed.

Rationale:
- Required staging evidence is not yet attached.
- Payment/webhook behavior must be verified against the real target environment.
- Email and push behavior depends on environment configuration and must be confirmed in staging.

Approver:
Decision date:
