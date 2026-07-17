# Draft: ARC Coordination Service (Coordinated tier)

- **Origin:** [internal] — split out of `draft-arc-backend.md` at the storage-substrate grooming (2026-07-17), so
  the git-only substrate (tiers 1–3) could promote to planned while the service tier stays a someday-target.
- **Cohort:** [none]
- **Purpose:** The **Coordinated** tier of the storage substrate: a coordination layer fronting the same git
  backing store, for deployments whose needs outgrow a plain shared remote — per-record authorization,
  event-log gatekeeping, richer heal/refresh contracts, high-parallelism arbitration.

---

## Governing constraint (non-negotiable, inherited)

**Service-optional** (`strategy-storage-evolution.md` Principle 10): the canonical store is a git repo, always.
This tier is a **gatekeeper and accelerator over the same ledger** — event-log records serialize into the store
repo; a clone of the store is always the full canonical state; any Coordinated deployment degrades to Shared-tier
(plain git remote) semantics. A canonical record class that exists only in a service database is the anti-pattern
(the beads 2026 churn lesson — `research-storage-landscape-2026-07.md`).

## Two variants — deliberately undecided

1. **Self-hosted service.** The carried 2026-06 shape: single binary/container on a VPS (Gitea/Plausible class),
   SQLite-as-index (never canonical) or Postgres past ~50 users, static API tokens (OIDC past ~20), reverse proxy
   for TLS, periodic store snapshots. Self-hosted only; hosted SaaS by ARC remains a non-goal.
2. **SaaS-composed coordination.** Compose an existing PM SaaS (Linear/Jira/Notion via MCP/adapters) as the
   coordination/visibility layer while the git store stays canonical — B-canonical/A-integration extended to the
   coordination role. Preference signal (2026-07-17): compose-over-build where viable. Research note: PM-SaaS
   agent write-access GA'd only in 2026-H1; no practitioner track record yet — re-survey at grooming.

## What lives here (moved from arc-backend)

Auth model (tokens / OIDC / OAuth / JWTs); distributed-access transport (HTTPS vs VPN-only vs configurable);
deployment/provisioning guidance; multi-tenant/org-boundary model; per-record/namespace authorization (the hosted
per-user-namespace fallback of the scope model); server-side arbitration beyond optimistic push-retry; the
Coordinated arm of the failure-taxonomy harmonization (auth-expired / server-unavailable / conflict-at-backend).

## Why deferred (evidence-aligned)

No demonstrated demand at 5–50-person scale (2026-07 research: coordination is modally out-of-band; the Shared
tier's push-retry over entry-granular records covers the evidenced contention; OpenSpec Stores ships team planning
on a plain git repo). The tier exists so nothing forecloses it — the service-optional invariant is the entire
present-day cost. Activate on demand or contributor capacity, after the Shared tier has real usage.

## Coordination seams

- `arc-backend` — the substrate this fronts; its § Concurrency port design must not foreclose either variant.
- `local-mode` — provisioning/re-clone flows reused for service enrollment; failure-taxonomy harmonization.
- `external-coord-probe` / `pm.mode: external` — the read-side adapters variant 2 would extend.
- `goal-aware-direction` — `VECTOR.PROJECT` authority model maps onto server-side auth unchanged.

---
