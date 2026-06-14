# Draft: Lifecycle State Resolver

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). The foundational,
  read-side member: lands first; every other member queries it.
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Build the first-class shared **read-side state-resolution infra** the lifecycle machine needs:
  the `(phase, location)` state-space model + its derived-state projection, a deterministic slug→state resolver,
  a lifecycle-complete cohort-membership resolver, and the cohort-doc archival-trigger loop — all over one shared
  index, against the current markdown substrate. `operational-state-docs` later re-homes these behaviors onto
  records (zero reshape).

> Shared context — the as-is lifecycle, the north star, and the cross-member contracts — lives in
> `cohort-lifecycle-state-machine.md`. This draft carries only this member's task-driving design.

---

## Problem / Motivation

Several transitions and guards need to answer **"what lifecycle state is WU `<name>` in?"** cheaply and
deterministically: `start`'s dispatch, the worktree-occupancy guard, dep-edge discharge, cohort-membership
resolution, materialize. Today the answer is ad-hoc `find` / `ls` — hit live three times in one planning session.
There is no single primitive, and no single model of what the states even *are*: the meta `State` field smears two
orthogonal axes onto `Planning` (a `backlog/planned/` stub and a WU on a `plan/` branch both read `Planning`), so
any resolver built without splitting them inherits the overload.

Two adjacent read-side gaps share the same missing infra:

- **The cohort-consistency validator can't tell a graduated member from a removed one.** It derives membership
  from the *staged backlog delta*, so a late-edited cohort doc flags every graduated member section as an orphan
  (hit live on `cohort-agile-wu-lifecycle`).
- **The archival-trigger is unwired.** "Close the cohort doc when the last member ships" never fires, so cohort
  docs strand in `backlog/planned/` after their members have all shipped.

Both need the same thing the slug→state resolver needs: a **lifecycle-complete membership/index** that reads
across `backlog/planned/` + `active/` + `completed/`. Build it once.

## Resolved model

### The state space — two orthogonal axes (owned here)

The meta `State` field is a strict 4-state machine (`Planning` / `Active` / `Integrating` / `Shipped`) that
overloads `Planning` (and `Active`) across commitment levels. Resolve state on **two orthogonal axes** instead:

- **Phase** — `Planning` / `Active` / `Integrating` / `Shipped`. This *is* the meta `State` field.
- **Location** — `provisional` / `planned` / `active` / `completed`. A *logical* commitment value (a field, or
  computed-but-named), **never** raw `git`-driven inference.

A `planned/` stub and a WU on a `plan/` branch are *both* phase `Planning`; phase + location together place it.
This state-space model — the two axes plus the derived projection below — is **owned here**: it is the read-side
foundation every member resolves against. `lifecycle-transition-core` consumes it for its transition table (the
legal edges between these states); the resolver owns *what the states are and how you resolve one*, transition-core
owns *how you move between them*.

### Resolution rules

- **Location first** — presence under `completed/` = location `completed`; `active/` = location `active`;
  `backlog/provisional/` = `provisional`; `backlog/planned/` = `planned`.
- **Meta `State` second** — supplies the phase axis, and acts as the lag tiebreak when the field trails the
  directory (Axis-1 git-is-truth, the same logic session-init uses).
- **Never** `git branch` / `git log` inference — the arc-backend-named anti-pattern; a design guard, not a
  preference. The physical encoding (directory, branch) is a projection of the logical `(phase, location)` record,
  so the resolver reads location + meta fields only.
- **Parked-from-Active** resolves as `(phase = Active, location = backlog)` — phase stays `Active` (its
  pointer-record on `main` carries `State: Active (parked)`), location is backlog. Fully resolvable with no git
  inference. (Park-from-Planning carries no code and re-cuts its branch on resume, so it collapses back to
  `planned` — see the projection.)
- **`abandoned`** leaves no residue, so it resolves to the absent case (`nonexistent` below) — a reused name
  resolves cleanly through create-new.

### The derived-state projection (what consumers switch on)

The convenience lattice computed over `(phase, location)` — the slug→state values `start` dispatch, the
worktree-occupancy guard, in-flight-scope-check, and materialize read. The `(phase, location)` pair is the
primitive return; this is the projection layered on it (so finer needs read the pair directly):

| Derived state | `(phase, location)` derivation                           |
|---------------|----------------------------------------------------------|
| `nonexistent` | name absent everywhere (`abandoned ≡` here — no residue) |
| `provisional` | `(Planning, provisional)`                                |
| `planned`     | `(Planning, planned)` — park@Planning collapses here     |
| `planning`    | `(Planning, active)` — graduated onto a `plan/` branch   |
| `active`      | `(Active, active)`                                       |
| `integrating` | `(Integrating, active)`                                  |
| `parked`      | `(Active, backlog)` — park@Active                        |
| `shipped`     | `(Shipped, completed)`                                   |

`parked` is a *derived* value of `(Active, backlog)`, not a stored primitive — the earlier flat-enum sketch
(`parked-in-backlog`) re-smeared the two axes and had no value for a plain `planned/` stub; this projection
restores both. The render/engagement lattice ROADMAP shows (queued / on-my-plate / awaiting-review / Parked
bucket) is a *further* projection the render layer composes from these same predicates — owned by
`roadmap-tooling`, not minted here. Keep the predicates **queryable** (probe / status), not buried in rendering.

**Boundary — planning maturity is not a state.** How far a WU got through the planning pipeline (which of
draft / spec / tasks exist) is *orthogonal* to `(phase, location)`: a fully-planned-but-unactivated WU and a bare
stub are both `(Planning, planned)`. "Shovel-ready" is a **derived readiness overlay from artifact presence**
(layered like `blocked`), owned by the readiness / render layer (`planning-pipeline-readiness` / `roadmap-tooling`)
— never a `(phase, location)` value. The "did work begin?" signal already lives on the phase axis (`parked` =
activated then shelved vs. `planned` = shelved while planning), so no maturity enum is needed.

### The lifecycle-complete cohort-membership resolver

The set of WUs whose `**Cohort:**` field resolves to a given path, across **all** lifecycle states
(`backlog/planned/` + `active/` + `completed/`) — membership derived from the metas, never a co-located-directory
snapshot. This is what lets a cohort doc distinguish a **graduated** member (now in `active/`) from a **removed**
one, killing the false-orphan flag. Same shared index as the slug→state resolver.

### The archival-trigger loop

At **last-member ship**, the cohort doc is swept to `completed/` (a transition side-effect of `archive`). The
membership resolver is what detects "last member" — no member remains outside `completed/`. Design owned here;
the `archive` fire-point that calls it is `lifecycle-transition-core`'s.

### Dep-edge discharge — the read half stays, the write half defers

Dep-edge discharge (at `activate`, mark each **landed** `Depends On` edge as discharged — a discharged edge → a
provenance prose note per OSD's lean — leaving unlanded deps live) splits cleanly along this member's read/write
boundary:

- **The read half is here, for free.** "Is dependency `X` landed?" is a slug→state query (`shipped`, or
  integrated) — it falls out of the resolver and kills the live tracked read-hazard (state-blind dependency edges)
  this member already targets.
- **The write half defers to `lifecycle-transition-core`.** Rewriting the edge is a meta mutation fired *inside*
  `activate`'s mutator sequence, which that member owns. Authoring it here would mean building a mutator with no
  live caller until transition-core ships — and the composition with the mutator sequence is unanswerable from
  this side. So transition-core's `activate` calls the resolver's dep-state query and performs the discharge
  write.

## Open questions (→ create-spec)

- Index shape and cost: a single scan per invocation, or a cached index? What invalidates it? (Lean: single scan
  per invocation — the CLI process is short-lived, so caching is YAGNI until proven otherwise.)
- The exact projection surface: a single dispatch enum vs. a predicate set (`shipped?` / `parked?` / `occupied?` /
  `materializable?`), and whether the engagement/render lattice is co-owned with `roadmap-tooling` or fully theirs.
  (Lean: `(phase, location)` core + the derived slug→state projection above; render lattice is roadmap-tooling's.)
- Whether the membership resolver and the slug→state resolver share one code path or are two projections of one
  index. (Lean: one index, two projections — the same call shape the `(phase, location)` core already implies.)

## Dependencies

- **Cohort-internal:** none — foundational; lands first. **Owns** the `(phase, location)` state-space model +
  derived projection (the shared read-side contract); see `cohort-lifecycle-state-machine.md` § Shared contracts.
- **Forward-compat:** `operational-state-docs` re-homes all three behaviors onto records later (build v1 here
  against markdown). `arc-backend` design guard: **no `git branch` / `git log` state inference**, ever.
- **Consumed by:** `lifecycle-transition-core` (the state-space model for its transition table; the resolver enum
  for `start` dispatch + the worktree-occupancy guard; the dep-state read at `activate`); `decompose-matrix`
  (cohort-membership reads); the `archive` sweep (archival-trigger).

## Continuity

- **Readiness:** formalization-ready. The contract is settled: the two-axis `(phase, location)` model and its
  derived projection (reconciled against `lifecycle-transition-core`'s model, ownership split recorded in the
  cohort doc), the location-first resolution order, the no-git-inference guard, and the dep-edge read/write split.
  What remains is create-spec detail (index shape, caching, the exact projection surface).
- **Next:** activate via `init-work-unit` Path A → `create-spec` (this is the cohort's first member; nothing
  gates it).

---
