# Draft: Lifecycle State Resolver

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). The foundational,
  read-side member: lands first; every other member queries it.
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Build the first-class shared **read-side state-resolution infra** the lifecycle machine needs:
  a deterministic slug→state resolver, a lifecycle-complete cohort-membership resolver, and the cohort-doc
  archival-trigger loop — all over one shared index, against the current markdown substrate. `operational-state-docs`
  later re-homes these behaviors onto records (zero reshape).

> Shared context — the as-is lifecycle, the north star, and the cross-member contracts — lives in
> `cohort-lifecycle-state-machine.md`. This draft carries only this member's task-driving design.

---

## Problem / Motivation

Several transitions and guards need to answer **"what lifecycle state is WU `<name>` in?"** cheaply and
deterministically: `start`'s dispatch, the worktree-occupancy guard, dep-edge discharge, cohort-membership
resolution, materialize. Today the answer is ad-hoc `find` / `ls` — hit live three times in one planning session.
There is no single primitive.

Two adjacent read-side gaps share the same missing infra:

- **The cohort-consistency validator can't tell a graduated member from a removed one.** It derives membership
  from the *staged backlog delta*, so a late-edited cohort doc flags every graduated member section as an orphan
  (hit live on `cohort-agile-wu-lifecycle`).
- **The archival-trigger is unwired.** "Close the cohort doc when the last member ships" never fires, so cohort
  docs strand in `backlog/planned/` after their members have all shipped.

Both need the same thing the slug→state resolver needs: a **lifecycle-complete membership/index** that reads
across `backlog/planned/` + `active/` + `completed/`. Build it once.

## Resolved model

### The slug→state resolver — contract

- Returns a **state enum** — `provisional` / `planning` / `active` / `parked-in-backlog` / `integrating` /
  `shipped` / `nonexistent` — not a boolean; `shipped?` is a trivial projection.
- Resolves by **location first** (presence under `completed/` = shipped; `active/` = active; `backlog/**` =
  provisional / planned / parked per dir + meta), **meta `State` second** (the field can lag the directory — same
  Axis-1 git-is-truth logic session-init uses). **Never** from `git branch` / `git log` inference (the
  arc-backend-named anti-pattern — a design guard, not a preference).
- `abandoned` is **not** an enum value — it resolves to `nonexistent` (abandon leaves no residue), so a reused
  name resolves cleanly through create-new.

### The lifecycle-complete cohort-membership resolver

The set of WUs whose `**Cohort:**` field resolves to a given path, across **all** lifecycle states
(`backlog/planned/` + `active/` + `completed/`) — membership derived from the metas, never a co-located-directory
snapshot. This is what lets a cohort doc distinguish a **graduated** member (now in `active/`) from a **removed**
one, killing the false-orphan flag. Same shared index as the slug→state resolver.

### The archival-trigger loop

At **last-member ship**, the cohort doc is swept to `completed/` (a transition side-effect of `archive`). The
membership resolver is what detects "last member" — no member remains outside `completed/`. Design owned here;
the `archive` fire-point that calls it is `lifecycle-transition-core`'s.

### Dep-edge discharge (the genuinely-optional sub-member)

At `activate`, examine each `Depends On` edge and discharge only the **landed** ones (a discharged edge → a
provenance prose note per OSD's lean), leaving unlanded deps live. Included here because the resolver is already
present and it kills a live tracked read-hazard (state-blind dependency edges), but it is the optional piece — it
can ride this member or drop to OSD without breaking the cohort.

## Open questions (→ create-spec)

- Index shape and cost: a single scan per invocation, or a cached index? What invalidates it?
- How dep-edge discharge composes with `activate`'s mutator sequence (it reads the resolver mid-transition).
- Whether the membership resolver and the slug→state resolver share one code path or are two projections of one
  index (lean: one index, two projections).

## Dependencies

- **Cohort-internal:** none — foundational; lands first.
- **Forward-compat:** `operational-state-docs` re-homes all three behaviors onto records later (build v1 here
  against markdown). `arc-backend` design guard: **no `git branch` / `git log` state inference**, ever.
- **Consumed by:** `lifecycle-transition-core` (`start` dispatch + worktree-occupancy guard call the resolver);
  `decompose-matrix` (cohort-membership reads); the `archive` sweep (archival-trigger).

## Continuity

- **Readiness:** formalization-ready. The contract (enum, resolution order, no-git-inference guard) is settled;
  what remains is create-spec detail (index shape, caching, dep-edge composition).
- **Next:** activate via `init-work-unit` Path A → `create-spec` (this is the cohort's first member; nothing
  gates it).

---
