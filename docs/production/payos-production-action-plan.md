# PayOS Production Action Plan

## P0 - Must Fix Before Go-Live

| ID | Action | Owner | ETA | Dependency | Success Criteria | Status |
|---|---|---|---|---|---|---|
| P0-01 | Deploy backend and web app on stable HTTPS domains; configure PayOS return, cancel, webhook, web-return, and allowed origins | DevOps | 1 day | Production DNS/TLS | No localhost, ngrok, or trycloudflare hostname in production | Todo |
| P0-02 | Rotate PayOS Client ID, API Key, and Checksum Key before accepting customer money | Product owner | Same day | PayOS dashboard access | Old credentials revoked; new values stored only in production secret manager | Todo |
| P0-03 | Apply and verify billing schema/migrations in production | Backend/DBA | 1 day | Supabase production access | Billing tables, provider constraints, unique event/invoice indexes, and RLS verified | Todo |
| P0-04 | Execute a real small-value E2E transaction | QA + Finance | Same day | P0-01 to P0-03 | Checkout → bank payment → signed webhook → entitlement → profile redirect succeeds; duplicate webhook does not extend twice | Todo |
| P0-05 | Define refund, cancellation, invoice, and customer-support policy | Product/Finance | 2 days | Business decision | Published customer policy and tested admin support procedure | Todo |

## P1 - Should Fix Near Go-Live

| ID | Action | Owner | ETA | Dependency | Success Criteria | Status |
|---|---|---|---|---|---|---|
| P1-01 | Add external alert for failed/stale PayOS billing events | DevOps | 2 days | Monitoring destination | Alert fires for failed events or open invoice past checkout expiry | Todo |
| P1-02 | Add scheduled reconciliation for stale open invoices | Backend | 2 days | Stable PayOS credentials | Paid orders missed by webhook are recovered without user returning to the app | Todo |
| P1-03 | Run PayOS-focused load/rate-limit test | QA | 1 day | Staging-like deployment | Checkout/reconcile limits hold and provider errors remain bounded | Todo |

## P2 - Improve After Go-Live

| ID | Action | Owner | ETA | Dependency | Success Criteria | Status |
|---|---|---|---|---|---|---|
| P2-01 | Add finance reconciliation export and daily settlement checks | Finance/Backend | 1 sprint | Production transaction history | Daily ledger can be compared against PayOS settlement records | Todo |
| P2-02 | Add automated refund integration if business volume justifies it | Backend/Product | Backlog | Refund policy | Refund status and entitlement changes are automated and audited | Todo |
