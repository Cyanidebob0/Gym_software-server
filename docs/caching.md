# Caching: staleness contract

All caches in this server are **process-local memoization**. They exist to cut
latency and database load, never to hold truth. The invariants below are what
AUD-06 requires; code that violates them is a bug.

## Invariants

1. **Correctness is independent of caches.** Every cached value can be dropped,
   missed, or served stale up to its TTL without breaking behavior — only
   freshness of *displayed* data degrades. Writes always go to the database and
   validate against fresh reads (e.g. payment confirmation re-reads the payment
   and member rows; renewals re-read the member).
2. **No cache is authorization truth.** Authorization inputs are either
   immutable per request (verified JWT claims), static config (the owner email
   whitelist in `config/whitelist.ts`), or read fresh from the database
   (`access_state` in `membership-access.middleware.ts`). The auth cache in
   `auth.middleware.ts` memoizes only values *derived from the token itself
   plus static config*, and an entry's lifetime is capped at the token's own
   expiry — it can never disagree with re-deriving from source.
3. **Invalidation is an optimization, not a guarantee.** `invalidate()` calls
   shorten staleness on the instance that performed the write. The TTL is the
   only bound that holds across instances.

## Inventory

| Cache | File | Scope/key | TTL | Invalidated on write? | Memoizes |
|---|---|---|---|---|---|
| `authCache` | `middleware/auth.middleware.ts` | per token | min(5 min, token exp) | yes — `invalidateAuthCacheForUser` on auth sync changes | token claims + whitelist role (no mutable DB state) |
| member identity | `services/member-identity-cache.ts` | per user id | 10 min | write-through at registration; mapping is never re-pointed | the caller's own member row id |
| `settingsCache` | `services/settings.service.ts` | singleton | 60 s | yes — on settings upsert | settings row (grace/reminder days, gym info) |
| `dashboardCache` | `services/dashboard.service.ts` | singleton | 15 s | TTL only | owner dashboard aggregates |
| `memberStatsCache` | `services/member-management.service.ts` | singleton | 10 s | TTL only | member status counts |
| `paymentStatsCache` | `services/payment.service.ts` | singleton | 15 s | yes — on payment create/confirm/reject | monthly/yearly revenue |
| `pendingCountCache` | `services/payment.service.ts` | singleton | 5 s | yes — same triggers | pending payment count |
| `detailCache` | `services/exercise-provider.service.ts` | per exercise | unbounded | n/a | static local JSON dataset (immutable per deploy) |

## Maximum staleness

- On a single instance (the current deployment), staleness is usually near zero
  for write-adjacent data because writers invalidate; the TTL is the worst case.
- Under horizontal scaling, drop the invalidation column above: **the TTL
  column is the staleness guarantee.** Worst cases: settings 60 s, member
  identity 10 min (benign — see file comment), everything else ≤ 15 s.
- The dashboard response additionally allows client-side reuse via
  `Cache-Control: private, max-age=10, stale-while-revalidate=20`, so the
  end-to-end worst case for dashboard numbers is ~45 s.

## Scaling rule

Do **not** add Redis or shared invalidation preemptively. When (and only when)
a second instance is introduced:

1. Either accept the TTL staleness bounds above (they are all display-freshness
   concerns, not correctness concerns), or move the invalidated caches
   (`settings`, payment stats) to a shared store.
2. Re-verify invariant 2 still holds for any cache added since this document
   was written.
