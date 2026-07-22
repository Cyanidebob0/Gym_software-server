# Atomic financial workflows

## Deployment order

1. Apply `migrations/20260722_atomic_financial_workflows.sql` in Supabase SQL Editor.
2. Run `npm run test:financial-concurrency` from `server/` against that database.
3. Deploy the server.
4. Deploy the client.

The migration must be applied before the new server is deployed because the
server now calls the financial RPCs directly.

## What the migration protects

- A member can have only one pending payment request at a time.
- Invoice IDs are unique.
- Member activation/renewal and their payment insert commit together.
- Payment confirmation and membership extension commit together.
- Refund reservation and approval serialize on the payment row, preventing
  total pending/approved refunds from exceeding the payment.
- Repeated requests with the same UUID `Idempotency-Key` return the stored
  result. Reusing a key for different input is rejected.
- Financial tables and RPCs remain callable only through the server service
  role; browser roles cannot execute them directly.

The concurrency test creates uniquely named fixtures, issues simultaneous
duplicate payment/confirmation/refund calls, verifies the invariants, and
removes all fixtures in a `finally` cleanup.

## Maintenance

`financial_idempotency_keys` is deliberately retained for safe delayed retries.
For this single-gym workload it will grow slowly. Once scheduled database
maintenance is available, remove rows older than the chosen retry/audit window
(recommended: 90 days) after confirming they are no longer needed for support.

