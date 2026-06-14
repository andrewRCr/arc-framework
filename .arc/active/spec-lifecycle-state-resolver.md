# Spec (`detailed` · `RFC`): lifecycle-state-resolver

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). The foundational,
  read-side member: lands first; every other member queries it.

- **Purpose:** Build the shared read-side state-resolution infrastructure for the work-unit lifecycle — the
  `(phase, location)` state-space model and its derived projection, a deterministic slug→state resolver, a
  lifecycle-complete cohort-membership resolver, and the cohort-doc archival-trigger detection — all over one
  in-memory index against the current markdown substrate, resolving from location + meta fields with no git-state
  inference.

---

## Introduction / Context

Several lifecycle transitions and guards need to answer one question — **"what lifecycle state is work unit
`<name>` in?"** — cheaply and deterministically: `start`'s dispatch (scaffold-new vs. graduate-existing), the
worktree-occupancy guard, dep-edge discharge, cohort-membership resolution, and materialize. Today the answer is
ad-hoc `find` / `ls` reinvented at each call-site — hit live three times in a single planning session. There is
no single primitive, and — more fundamentally — no single model of what the states even *are*.

The meta `**State:**` field is a strict 4-state machine (`Planning` / `Active` / `Integrating` / `Shipped`) that
**overloads** `Planning` (and `Active`) across commitment levels: a `backlog/planned/` stub and a work unit on a
`plan/` branch both read `Planning`. Any resolver built without first splitting that overload inherits it.

Two adjacent read-side gaps share the same missing infrastructure:

- **The cohort-consistency validator can't tell a graduated member from a removed one.** It derives membership
  from the *staged backlog delta*, so a late-edited cohort doc flags every graduated member as an orphan (hit
  live on `cohort-agile-wu-lifecycle`).
- **The archival-trigger is unwired.** "Close the cohort doc when its last member ships" never fires, so cohort
  docs strand in `backlog/planned/` after all members have shipped.

Both need exactly what the slug→state resolver needs: a **lifecycle-complete index** reading across
`backlog/planned/` + `active/` + `completed/`. Build it once.

The deepest constraint is `arc-backend` (`adr-022-managed-operational-state-documents.md`): work-unit state is a
logical record; the physical encoding (directory, branch) is a *projection* of it. The resolver must therefore
read location + meta fields, **never** `git branch` / `git log` — both because inference is non-deterministic
across machines and worktrees, and because coupling to the physical substrate is exactly what `operational-state-docs`
later replaces.

## Goals

- A single deterministic primitive that resolves a work unit's lifecycle state from location + meta fields, with
  no git inference anywhere in the resolution path.
- The two-axis `(phase, location)` state-space model established as the **shared read-side contract** every
  cohort member resolves against.
- A lifecycle-complete cohort-membership resolver (across all three state directories) that distinguishes a
  graduated member from a removed one — killing the false-orphan flag.
- Archival-trigger *detection* ("last member has shipped") — the predicate, owned here; its fire-point lives in
  `lifecycle-transition-core`.
- The dep-state *read* ("is dependency `X` landed?") that closes the state-blind dependency-edge read hazard.
- Forward-compat: all behaviors re-home onto `operational-state-docs` records later with zero reshape.

## Non-Goals

- **The write half of dep-edge discharge** — rewriting a landed edge is a meta mutation fired inside `activate`'s
  mutator sequence; owned by `lifecycle-transition-core`.
- **The transition table** (legal edges, inverses, guards over the state space) — `lifecycle-transition-core`.
- **The render / engagement lattice** (queued / on-my-plate / awaiting-review / Parked bucket) — a *further*
  projection `roadmap-tooling` composes from these predicates; this member exposes the predicates queryable, it
  does not mint the render lattice.
- **The planning-maturity overlay** (which of draft / spec / tasks exist) — a derived *readiness* overlay owned by
  `planning-pipeline-readiness` / `roadmap-tooling`, layered like `blocked`; explicitly **not** a `(phase, location)`
  value (see Proposed Design § boundary).
- **The `operational-state-docs` record/projection substrate itself** — a different foundational domain; v1 is
  built here against the markdown substrate.
- **The `archive` fire-point invocation** — the call site that acts on the archival-trigger is
  `lifecycle-transition-core`'s; only the detection predicate is here.
- **A persisted / cached index** — resolved against (see Proposed Design § the index).

## Proposed Design

The substrate is **one index, two projections**, built once per invocation against the markdown work surfaces.

### The state space — two orthogonal axes (owned here)

Resolve state on two orthogonal axes rather than the single overloaded `**State:**` field:

- **Phase** — `Planning` / `Active` / `Integrating` / `Shipped`. This *is* the meta `**State:**` field.
- **Location** — `provisional` / `planned` / `active` / `completed`. A *logical* commitment value (read from
  directory presence, named — never raw-`git`-inferred).

Phase + location together place a work unit: a `planned/` stub and a WU on a `plan/` branch are *both* phase
`Planning`, separated by location. This model — the two axes plus the derived projection below — is the read-side
foundation every member resolves against; `lifecycle-transition-core` consumes it for its transition table. The
resolver owns *what the states are and how you resolve one*; transition-core owns *how you move between them*.

### Resolution rules (location-first, deterministic)

- **Location first** — presence under `completed/` → location `completed`; `active/` → `active`;
  `backlog/provisional/` → `provisional`; `backlog/planned/` → `planned`.
- **Meta `**State:**` second** — supplies the phase axis, and acts as the lag tiebreak when the field trails the
  directory (Axis-1 git-is-truth, the same precedence session-init uses).
- **Never** `git branch` / `git log` inference — a design guard, not a preference.
- **Parked-from-Active** resolves as `(phase = Active, location = backlog)` — phase stays `Active` (its
  pointer-record on `main` carries `State: Active (parked)`), location is backlog. Fully resolvable, no git
  inference.
- **Park-from-Planning** carries no code and re-cuts its branch on resume, so it collapses back to `planned`.
- **`abandoned`** leaves no residue, so it resolves to the absent case (`nonexistent`) — a reused name resolves
  cleanly through create-new.

### The index

Built **once per invocation** (resolved OQ — single scan, no persisted cache). A single scan across
`backlog/planned/` + `active/` + `completed/` reads each work unit's meta for `**State:**` (phase) and
`**Cohort:**`, with location taken from the containing directory, yielding:

```text
slug → { phase, location, cohort, path }
```

In-memory, process-scoped. The CLI process is short-lived and the meta set is small (tens of files), so a scan
per invocation is cheap; caching would add invalidation surface and a future `operational-state-docs`
reconciliation hazard for no proven need. Both projections below read this one index (resolved OQ — one index,
two projections).

### Projection A — the slug→state resolver

A layered surface (resolved OQ — pair primitive + derived enum + curated predicate sugar):

- **Primitive return — the `(phase, location)` pair.** The source of truth; what the dep-state read and any
  finer logic consume. It is also the logical-record shape `operational-state-docs` will persist, so it is the
  arc-backend-safe return.
- **Derived projection — the slug→state enum.** The convenience lattice consumers switch on (`start` dispatch's
  single switch value; what status / in-flight-scope render from):

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

  `parked` is a *derived* value of `(Active, backlog)`, not a stored primitive.
- **Predicate sugar — curated to the guard call-sites, not one-per-state.** A small set where a boolean reads
  better than a switch: `occupied?` (the worktree-occupancy guard — slug live on a branch/worktree:
  `planning` / `active` / `integrating`) and `shipped?` (dep-edge discharge read + completion checks: `Shipped`,
  or integrated). Both are pure functions of the pair; a mechanical `isPlanned?` / `isParked?` / … set is
  deliberately **not** exposed — it would duplicate the enum. Materialize is **not** a predicate here: a
  remote-only candidate is a remote-vs-local delta requiring a network read, which this pure-local resolver does
  not do — materialize discovery consumes the resolver (a remote branch resolving locally to `nonexistent` is the
  "not yet here" signal; `occupied?` is the "already here" guard) rather than getting its own predicate. Keeping
  the predicate set pure-local is itself the no-git-inference guard holding at the surface.

**Boundary — planning maturity is not a state.** How far a WU got through the planning pipeline (which of
draft / spec / tasks exist) is *orthogonal* to `(phase, location)`: a fully-planned-but-unactivated WU and a bare
stub are both `(Planning, planned)`. "Shovel-ready" is a derived readiness overlay from artifact presence
(layered like `blocked`), owned by the readiness / render layer — never a `(phase, location)` value. The "did
work begin?" signal already lives on the phase axis (`parked` = activated then shelved vs. `planned` = shelved
while planning), so no maturity enum is needed.

### Projection B — the lifecycle-complete cohort-membership resolver

The set of WUs whose `**Cohort:**` field resolves to a given path, across **all** lifecycle states — membership
derived from the metas in the same index, never from a co-located-directory snapshot. This is what lets a cohort
doc distinguish a **graduated** member (now in `active/`) from a **removed** one, killing the false-orphan flag.

### The archival-trigger detection

"Last member has shipped" = **no member remains outside `completed/`** — a membership-resolver query. The
detection predicate is owned here; the `archive` fire-point that calls it (sweeping the cohort doc to `completed/`)
is `lifecycle-transition-core`'s.

### The dep-state read (read half of dep-edge discharge)

"Is dependency `X` landed?" is a slug→state query (`shipped`, or integrated) — it falls out of the resolver and
closes the state-blind dependency-edge read hazard this member targets. The write half (rewriting the edge inside
`activate`'s mutator sequence) defers to `lifecycle-transition-core`.

### Where it lives

A `src/lib/` pure-logic module with injectable filesystem dependencies, consistent with the three-layer CLI
(`lib` never reaches up to commands/prompts). It reads the `.arc/` work-surface markdown. The resolved predicates
are kept **queryable** (reachable from a probe / status surface), not buried in a rendering path.

## Alternatives & Rationale

- **Flat state enum (no two-axis split).** The earlier `parked-in-backlog` flat-enum sketch re-smeared the two
  axes and had no value for a plain `planned/` stub. Rejected: the overload *is* the root problem; a flat enum
  inherits it. The two-axis model restores both signals and lets `parked` derive cleanly.
- **Git-driven inference (`git branch` / `git log`).** Rejected by the `arc-backend` design guard
  (`adr-022-managed-operational-state-documents.md`): the physical encoding is a projection of the logical
  record, so inferring from it couples the resolver to the substrate `operational-state-docs` replaces, and is
  non-deterministic across machines and worktrees.
- **Cached / persisted index.** Rejected (OQ1): short-lived CLI process, small meta count; caching adds
  invalidation surface and a future OSD reconciliation hazard for no proven benefit. Single scan per invocation.
- **Two separate resolvers (separate scans).** Rejected (OQ3): the slug→state and membership resolvers need the
  *identical* lifecycle-complete scan; one index + two projections avoids a double walk and keeps the read-side
  contract coherent.
- **Enum-only or predicates-only surface.** Rejected (OQ2): enum-only forces every guard site to switch-and-compare;
  predicates-only loses `start` dispatch's single switch value, and an exhaustive predicate set duplicates the
  enum. The pair-primitive + enum + *curated* predicate layering gives each call-site its natural shape with no
  duplicated logic (all projections are pure functions of the pair).
- **Resolver mints the render / engagement lattice.** Rejected: render bucketing (the Parked bucket, on-my-plate)
  is `roadmap-tooling`'s composition over these predicates; minting it here couples the read primitive to
  presentation. This member exposes the predicates; the render layer composes them.

## Cross-cutting Considerations

- **Forward-compat (`arc-backend` / `operational-state-docs`).** The `(phase, location)` pair *is* the
  logical-record shape OSD persists, so building v1 here against markdown lets OSD re-home the behaviors onto
  records with zero reshape. The design guard — location + meta fields only, no git inference — is what preserves
  that property.
- **Performance.** Single scan over tens of small metas, within a sub-second process lifetime — no measurable
  concern; caching deferred as YAGNI.
- **Testing.** A pure-logic lib with injectable fs is unit-testable across the full `(phase, location)` matrix:
  every derived enum value, parked@Active, park@Planning→`planned` collapse, `nonexistent` (both abandoned and
  never-existed), and the directory-trails-meta lag tiebreak — asserting **no** git call on the resolution path.
  Fixture trees stand in for the three state directories. Membership carries the graduated-vs-removed regression
  fixture (the false-orphan case); the archival-trigger carries a last-member-detection fixture.
- **Consumers (integration surface).** `lifecycle-transition-core` (the state-space model for its transition
  table; the slug→state surface for `start` dispatch, the worktree-occupancy guard, and the dep-state read at
  `activate`), `decompose-matrix` (cohort-membership reads), and the `archive` sweep (archival-trigger). The
  pair / enum / predicate surface is the contract these validate against — a change to it is a cross-member break.
- **Migration / rollout.** Purely additive — introduces a primitive where ad-hoc `find` / `ls` exists today;
  call-sites migrate to it as their owning members land. No data migration (it reads the existing substrate).

## Success Criteria

- The resolver returns the correct `(phase, location)` pair and derived enum for **every** state — including
  parked@Active, park@Planning→`planned`, `nonexistent` (abandoned and never-existed), and the
  directory-trails-meta lag tiebreak — with no `git branch` / `git log` call anywhere on the resolution path.
- The membership resolver distinguishes a graduated member (in `active/`) from a removed one over a mixed-state
  cohort — the false-orphan regression fixture passes.
- The archival-trigger predicate reports "last member" **iff** no member remains outside `completed/`.
- The dep-state read answers "is `X` landed?" via slug→state, with no state-blind edge read.
- Exactly one index is built per invocation, and both projections read it; no persisted cache.
- The module is pure `lib` with injectable dependencies; the exposed predicate set is limited to
  `occupied?` / `shipped?` (both pure-local — no network read).
- The resolved predicates are reachable from a probe / status query surface, not render-only.

## Open Questions

None blocking — the three entry-time open questions (index cost, projection surface, code-path sharing) are
resolved in Proposed Design. Genuine implementation detail left to execution: the exact module and function
names, and whether a dedicated `arc` status/probe subcommand surfaces the resolver or an existing command is
extended (coordinates with the status surface's current shape; either satisfies the queryable constraint).
