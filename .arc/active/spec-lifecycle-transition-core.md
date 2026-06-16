# Spec (`detailed` · `RFC`): lifecycle-transition-core

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). The heavy member:
  the state machine itself.

- **Purpose:** Build the work-unit lifecycle as an explicit, complete, coherent state machine in code — a
  hand-rolled declarative transition table over the logical `(phase, location)` model, a thin imperative
  executor, the 1↔1 relocation/sweep mutator bundle, the guards, and the full inverse-paired verb set — taking
  the first deliberate step toward deterministic mechanics living in the CLI while judgment stays in the
  workflows.

---

## Introduction / Context

The work-unit lifecycle today is ~90% markdown ceremony. Of roughly ten transitions, exactly one is code-driven
(`arc start` create-new, the newest, bolted on); the rest are agent-run workflows whose transition rules — branch
prefix, meta `State`, preconditions — are restated per workflow with no single source of truth. The consequences
are concrete and have bitten live:

- **The verb set is half-built and asymmetric.** `activate ↔ deactivate` is the only clean inverse pair; `park` /
  `resume` are unshipped on both sides; `graduate` has no inverse; the create-stub forward edge is unowned.
- **`arc start` has an unguarded foot-gun.** It is create-new only; run against an existing `backlog/` stub it
  silently mis-scaffolds — a fresh template meta losing backfilled fields, an orphaned draft, two metas in
  `active/`, no graduation. The two-metas case broke the release wrapper (`no-active-wu`, code 10) mid-pivot.
- **Relocation logic is duplicated** across `init` Path A, `decompose`'s park-exit, `archive`'s sweep, and the
  unshipped park/resume — re-authored each time, never unified, so the three-encoding invariant (meta `State` ·
  directory · branch) is hand-maintained and drifts.
- **The planning-entry gate is prose-only.** `arc-plan` can drop a draft onto `main` where it cannot be
  committed, because no mechanical preflight resolves write-context and routes (discovered live starting this
  work).

This RFC settles the technical design that makes the lifecycle a shippable, testable mechanical guard rather than
a per-workflow audit. It consumes the read-side `(phase, location)` state-space model and slug→state resolver
owned by the already-shipped `lifecycle-state-resolver`; it owns the **write side** — the legal edges between
states and the mechanics that execute them.

## Goals

- **A single authoritative transition table.** One declarative source of states, legal edges, inverses, guard
  requirements, and per-transition encoding updates — replacing the per-workflow restatement.
- **Totality and encoding-consistency as mechanical invariants.** The table is total over the state space; a test
  walking it proves every cell is either a legal edge or an explicitly-marked illegal cell, and that every edge's
  encoding updates keep meta `State` · directory · branch consistent by construction.
- **A complete, inverse-paired verb set** with every edge owned — no orphaned forward edges, no missing inverses.
- **The relocation primitive unified once.** A 1↔1 mutator bundle fired together so the three-encoding invariant
  holds by construction, called by every location-moving transition rather than re-authored per ceremony.
- **`arc start` as a safe full-lifecycle dispatch** — routing on resolved state, guarded against name-collision
  and worktree-occupancy, never mis-scaffolding an existing stub.
- **Mechanics in the CLI, judgment in the workflows.** Deterministic mechanics (`git mv`, branch/worktree
  reconcile, scaffold, ROADMAP regen, archival path computation, transition-legality validation) move to code;
  the interlocks and value-supplying decisions stay in the workflows.
- **Arc-backend-safe by construction.** The table reasons over *logical* `(phase, location)`, never raw git
  inference, so the physical encoding stays a projection a later backend can re-home with zero reshape.

## Non-Goals

- **Re-deriving the read side.** The `(phase, location)` model, derived-state predicates, slug→state projection,
  and cohort-membership resolver are `lifecycle-state-resolver`'s and are consumed, not redefined.
- **A generic transition engine (B2).** Depth is settled at **B1** — a hand-rolled declarative table + thin
  imperative executor. A B2 engine that bakes `git mv` in as *the* mechanism would re-commit the file-location
  assumption this design is built to avoid.
- **The decompose matrix and the errand lattice.** Those are sibling members (`decompose-matrix`,
  `errand-lattice`); this WU exposes the mutator-bundle teardown legs and crossing-edge firing points they
  consume, but does not author their transforms.
- **Migrating the executor's git/non-TTY mechanics to the shared substrate.** Hand-rolled now; `cli-substrate-adoption`
  migrates them to execa / zod / neverthrow + the shared prompting substrate later.
- **The ROADMAP renderer.** This WU emits the derived-state predicates and the new **Parked** render bucket;
  `roadmap-tooling` renders. Interim hand-render discipline covers the Parked bucket until RT ships.
- **The verb-rename documentation cascade.** Cross-cutting strategy/rules/brief sweeps are `lifecycle-closeout`'s;
  per-member docs update locally with this code.

## Proposed Design

### 1. The state space (consumed from `lifecycle-state-resolver`)

Two orthogonal logical axes, recapped as the substrate the table moves across:

- **Phase** — `Planning` / `Active` / `Integrating` / `Shipped`. This *is* the meta `State` field (the resolver's
  `Phase` reuses the codified `WorkUnitState`).
- **Location** — `provisional` / `planned` / `active` / `completed`. A **logical value** read today from the
  containing lifecycle directory (the resolver's "directory-wins" rule, `locationFromPath`). Arc-backend-safety
  is **no `git branch` / `git log` inference** — *not* "no directory derivation": directory is the current,
  deterministic source the resolver reads, and `(phase, location)` is the logical-record shape a later backend
  re-homes (directory → a record field) with zero reshape.

The two axes measure different things: **phase is maturity** (how far the work has progressed — design authored,
code begun, in review, shipped), **location is engagement** (shelved in `backlog/` vs. live in `active/`). They are
independent, which is why engagement is **derived, never a phase value**: `parked` is the derived state
`(Active, planned)` — "reached the code-exists stage, now shelved" — and is never stored as a `State`. So
"`Active` in `backlog/`" is not a contradiction but the precise encoding of a paused-but-code-exists WU; the
legibility of that raw shape is handled at the render layer (§ 6's pointer-record callout), not by polluting the
phase enum.

A `planned/` stub and a WU on a `plan/` branch are *both* phase `Planning`; phase + location together fix where
it lives. The resolver resolves the two axes independently and never cross-derives them (directory wins for
location, meta wins for phase). The resolver owns *resolving* a state from a slug; this member owns the *legal
edges* between states.

The **derived-state projection** (resolver-owned, consumed for the render buckets transitions populate). The
enum is the shipped resolver's `LifecycleState` (`lifecycle-resolver.ts`) — this WU consumes these values, it
does not name them:

| Derived state (resolver enum) | Canonical `(phase, location)`                           |
|-------------------------------|---------------------------------------------------------|
| `provisional`                 | `(Planning, provisional)`                               |
| `planned`                     | `(Planning, planned)`                                   |
| `planning`                    | `(Planning, active)`                                    |
| `active`                      | `(Active, active)`                                      |
| `integrating`                 | `(Integrating, active)`                                 |
| `parked`                      | `(Active, planned)`                                     |
| `shipped`                     | `(Shipped, completed)`                                  |
| blocked (overlay)             | unmet `Depends On` — orthogonal, layered over the cells |

These are the resolver's seven canonical pairs (`nonexistent` is the absent eighth). A residual non-canonical
pair — a directory-trails-meta lag (e.g. a `completed/` meta still tagged `Integrating`) — the resolver
normalizes location-dominant (→ `shipped`); such pairs are lag-states the resolver smooths, not table cells.
Engagement is fully derived, not a third axis. The model **forbids** "suspended but still in `active/`" (the
dormant-branch rot) — parking *moves location*, which is what makes suspension legible. `park@Planning` collapses
into `planned`; only `park@Active` produces the `parked` state, the input to the new **Parked** render bucket
(excluded from parallel-capacity math).

> **Render-bucket labels are `roadmap-tooling`'s, not this WU's.** How these enum states group into ROADMAP
> display buckets and what those buckets are *labeled* is a presentation concern owned downstream. One naming
> snag to settle there: the existing ROADMAP **In Flight** tier already denotes the whole `active/` location
> (any phase), so it cannot be reused for the narrower `active`-engaged state without blurring that boundary.
> This WU only emits the enum + the new Parked bucket as a queryable predicate; it asserts no display label.

### 2. The verb set — fully inverse-paired, every edge owned

Headline pair: **`start` ⊥ `park`**.

| Axis / role               | Verb                    | Move                                                       | Inverse            |
|---------------------------|-------------------------|------------------------------------------------------------|--------------------|
| phase                     | `activate`              | `Planning → Active`                                        | `deactivate`       |
| phase                     | `deactivate`            | `Active → Planning` (undo activation; recoverable; narrow) | `activate`         |
| phase                     | `reopen`                | `Integrating → Active` (withdraw from review)              | `integrate`        |
| location (active↔planned) | `park`                  | `active → planned` (physical move to `backlog/planned/`)   | `resume` / `start` |
| location (active↔planned) | `resume`                | parked `planned → active` (re-attach branch)               | `park`             |
| location (backlog tier)   | `promote`               | `provisional → planned` (Class **must resolve**)           | `demote`           |
| location (backlog tier)   | `demote`                | `planned → provisional` (Class sticky)                     | `promote`          |
| forward                   | `stub`                  | idea → selected tier (commitment + priority required)      | `abandon`          |
| composite                 | `decompose`             | `Planning → cohort` (matrix — `decompose-matrix` member)   | — (irreversible)   |
| terminal                  | `integrate` + `archive` | `Active`/`Integrating → completed`                         | — (no-go)          |
| destructive               | `abandon`               | pre-merge any → deleted                                    | —                  |

For `stub`, "selected tier" is logical `provisional` or `planned`; both are physically under `backlog/`.

**Renames and additions** (the asymmetry fixes):

- `graduate → promote`, with the missing `demote` inverse added.
- `abandon` splits out of `deactivate` — undo-activation vs. throw-away are different intents.
- `reopen` added as the missing `Integrating → Active` inverse.
- `activate` / `deactivate` keep their names — the model fix resolves the old overload; no rename needed.
- `promote` carries a **Class gate** (never leaves `planned/` carrying `[TBD]`); `demote` is **Class-sticky**
  (the ratchet protects realized work).

### 3. The transition table (B1 — declarative data + thin executor)

A declarative table **as code** — an array of transition records, each:

```text
TransitionRecord {
  verb:            Verb
  from:            State            // logical (phase, location)
  to:              State            // logical (phase, location)
  inverse:         Verb | null
  guards:          GuardId[]        // validated before any mutation
  encodingUpdates: MutatorSpec      // which bundle legs fire, with what direction/conditioning
  sideEffects:     SideEffectId[]   // ROADMAP/status-user regen, dep-edge discharge, user-workspace, PR ops
}
```

The table is **total over the resolver's seven canonical states** (§1): every `(verb, from)` is either a legal
edge or an explicitly **marked-illegal cell** (legal XOR illegal). Non-canonical `(phase, location)` lag-pairs
are not table cells — the resolver normalizes them location-dominant before the executor ever looks up an edge.
Marked illegal: `(*, Integrating)` reached from a backlog tier — no integration from `provisional` / `planned`;
direct `integrating → park` / `abandon` — must route through `reopen` first; any edge out of `completed` except
the new-WU-with-origin-link path (which is a fresh `stub`, not an edge from the sink).

**The thin executor** — `executeTransition(verb, slug, inputs)`:

1. Resolve the current state via the resolver's slug→state projection.
2. Look up the legal edge `(verb, from)`; reject if none (illegal/unknown transition).
3. Validate every declared guard against current state + inputs; reject on first failure with an actionable
   message.
4. Fire the `encodingUpdates` mutator bundle (§ 4) — atomically in intent: the legs are sequenced so a partial
   failure is recoverable and reported, never silently half-applied.
5. Fire declared `sideEffects`.

The executor **never decides** to take a transition (except where the decision is genuinely deterministic — a
name collision forces graduate-not-scaffold) and **never fabricates** judgment values (commitment, priority,
`Class`): it requires them supplied as `inputs`.

**Totality + encoding-consistency are shippable guards**, not audits: a unit test walks the table asserting
(a) every `(phase, location)` cell is a legal edge source/target or explicitly illegal, (b) every paired verb's
inverse round-trips to the origin state, and (c) every edge's `encodingUpdates` leave meta `State` · directory ·
branch mutually consistent for the target state.

### 4. The relocation primitive — a 1↔1 mutator bundle

Strictly 1↔1; a bundle of phase-aware encoding-mutators fired **together** so the three-encoding invariant holds
by construction (the `archive` `→ completed/` edge is the one partial exception — its physical teardown legs defer
to post-merge; § 9):

- **`relocate-artifacts`** — the `git mv` of the WU's artifact set (`meta-*`, `spec-*`, `tasks-*`, `draft-*`,
  companions): `backlog ↔ active`, `active → completed`.
- **`reconcile-branch`** — rename / delete / **preserve**, phase-and-direction-conditioned. *Create* is a **no-op**
  in this leg: branch birth always rides `reconcile-worktree` (below), in both placement modes, so the standalone
  create leg never touches git.
- **`reconcile-worktree`** — spawn / teardown, **including execution-locus relocation** (§ 7) and **branch birth**.
  The spawn leg has two **placement modes**: a *fresh worktree* (`git worktree add [-b] <branch>` at the
  `location_template` path, with the ownership marker) or *in-place* (`--here`, see §5 — `git checkout [-b]
  <branch>` in the current worktree, no new worktree, no marker). `-b` cuts a new branch (graduate / create-new);
  plain checkout / bare add attaches an existing one (resume). A teardown tearing down the worktree it runs from
  must hop the agent's locus out first.
- **`set-phase`** — the meta `State` write (phase-axis mutator, no location move).
- **`clearBranchField`** — the logical `Branch → [none]` write (a meta-field mutator, **no git op**), fired where a
  transition retires the working branch from the *record* without a physical branch op: `archive`'s mergeable
  sweep (physical teardown deferred — § 9) and the local branchless targets (`park@Planning` / `abandon`).

**Caller shapes:**

- **Location-movers** (`park` / `resume` / `promote` / `demote` / `init` Path A) call `relocate-artifacts` +
  conditioned branch/worktree mutators. The **`archive` sweep** is a location-mover too, but fires
  `relocate-artifacts` + `clearBranchField` + `set-phase` — its physical branch/worktree teardown defers to
  post-merge (§ 9).
- **Phase-movers** (`activate` / `deactivate` / `reopen` / the `integrate` flip) call `reconcile-branch` (only
  when the prefix rotates) + `set-phase`.

**Transition side-effects the bundle fires** (mechanics the neighbors own the rendering/reading of):

- `reconcile-roadmap` / `reconcile-status-user` on **every location move**.
- **Dep-edge discharge at `activate`** — the discharge *write* is owned here. The resolver exposes per-edge
  *facts* only: `resolveDepStates` returns each `Depends On` edge's `landed` boolean (merged / `shipped`;
  `integrating` reads not-landed) and `resolveSlugState` gives a dependency's enum. This member composes the
  **readiness verdict** over those — `shipped ∨ integrating` — rather than redefining `shipped?`, covering the
  team-review-latency case (a dependent may start at its dependency's *integration*, not only its merge). The
  write treats `Depends On` as the **live gate** and resolves satisfied edges *off* it — no mirrored lineage
  field (resolve is not destroy: lineage lives in git history, the archive, and spec prose), per
  `operational-state-docs` § Dependency-edge lifecycle; the list mutation re-homes onto a record `dependsOn`
  array with zero reshape.
- **User-workspace satellite** (`arc user open` / `close`) across `init` / `start` / `activate` / `integrate` /
  `decompose` / `park` / `resume` / `abandon`.

### 5. `start` — full lifecycle-state dispatch

`arc start <name>` routes on the resolver's resolved state:

| Resolved state             | Dispatch                                                         |
|----------------------------|------------------------------------------------------------------|
| `nonexistent`              | create-new (scaffold a fresh `Planning` WU)                      |
| `provisional` / `planned`  | begin — graduate via `init` Path A, resolving `Class`            |
| `parked` (Active, planned) | `resume` (re-attach the preserved branch)                        |
| `active`                   | **error — occupied** (worktree-occupancy guard)                  |
| `integrating`              | route via the Integrating edges (`reopen` to resume work)        |
| `shipped`                  | offer a new WU with an origin-link (a fresh `stub`, not an edge) |

`abandoned` is not a distinct arm — `abandon` leaves no residue, so the resolver returns `nonexistent`.

**Two guards:**

1. **Name-collision** — `start <name>` against an existing stub routes to graduate, never mis-scaffold. This is
   the foot-gun fix; the collision *forces* the deterministic branch (graduate-not-scaffold) — the one place the
   executor decides.
2. **Worktree-occupancy** — one active WU per worktree. If the target worktree already holds a meta in `active/`
   with phase ∈ {Planning, Active, Integrating} backing a *different* branch, reject. This is the live foot-gun
   that put two metas in `active/` and broke the release wrapper.

`scaffold` is the internal structure-generation mechanic (`stub`, `start` create-new, `decompose`, `init`
Path B, errand→WU promotion all invoke it). `stub` / `start` are the judgment-bearing front doors.

`start` dispatch is **mode-invariant**; the sole protection variance is branch-cut *timing*, owned by the
planning-entry gate (§11) and §12 — under partial, pre-formalization drafting may precede the branch; the
tracked-WU branch is then cut identically in both modes.

**In-place opt-out (`--here`).** The `graduate` and `resume` arms spawn a dedicated worktree **by default**
(isolation-by-default), but accept a `--here` flag to execute **in place** — cut/attach the branch in the current
checkout, no spawn — mirroring the door `create-new` already exposes via cold-start. The spawn-vs-in-place axis is
**orthogonal to protection mode**: both modes default to spawn and both accept `--here`. In-place runs the same
executor legs, with the `reconcile-worktree` spawn leg in its **in-place placement mode** (§4) instead of spawning a
fresh worktree — `git checkout -b` cuts the branch for graduate / create-new, plain `git checkout` re-attaches the
preserved branch for resume; `reconcile-branch` create stays inert (branch birth is the worktree leg's in both
modes). It honors the **worktree-occupancy guard** — refused when the
current checkout already holds an active WU (graduate into a base-sitting checkout; spawn or park first otherwise).
This serves **WU-grade** in-place development (sequential single-checkout work; heavy-toolchain repos avoiding the
per-worktree dependency-provisioning tax; resuming parked work in one checkout); the atomic 5-minute case is
**errands'**, not this. It is **locus-only** — the branch, the `(phase, location)` record, and notes-sync are
identical to the spawn path, so cross-machine coherence is unaffected, and in-place additionally sidesteps the
`worktree.location_template` path-portability wrinkle. The cross-machine **Materialize** pickup is the same
spawn-vs-in-place question on a remote WU; mirroring `--here` there is downstream (in-flight-awareness /
cross-machine), not this WU.

### 6. `park` — phase-polymorphic, with the pointer-record

- **park@Planning** — no code exists yet on the branch; tear the branch down, re-cut `plan/<name>` on resume.
  Resolves back to `planned`.
- **park@Active** — code exists; **preserve the branch** (the pushed branch *is* the durable shelf), tear down
  only the worktree, relocate artifacts to `backlog/planned/`. Resume re-attaches (≈ the Materialize mechanic).
  Resolves to `parked`.

**The pointer-record (tracked-file resolution).** A parked-Active WU's authoritative artifacts stay on the
preserved branch; `main` carries only a minimal **render-pointer** — meta `State: Active` (the literal,
resolver-valid value; `parked` is *derived* from the `backlog/planned/` location, never stored — see §1),
`Branch: feat/X`, plus render fields — **blessed as a legal state shape** the three-encoding sweep expects rather
than flags. Because a raw `State: Active` under `backlog/` reads ambiguously, the pointer-record (itself a
regenerated render artifact) **opens with a derived-state callout** naming the parked state, the authoritative
branch, and the park reason:

```text
> **Parked** — Active-phase work shelved here; authoritative artifacts on branch `feat/<name>`.
> Reason: {reason}
> Regenerated pointer — do not hand-edit.
```

The branch meta is authoritative; the pointer is regenerable, never hand-edited. This is the arc-backend
record+projection model applied early to one state (pointer → record, `Branch` → code-ref field, zero reshape);
it **ships in this member**.

**Park guards & inputs:** reject park-from-`Integrating` (close/withdraw the PR via `reopen` first). `park` requires
two `inputs` (never fabricated): the **commitment** tier and a free-form **`reason`** string — the latter rendered
in the callout above (and in the relocated meta for park@Planning), supplied via `--reason` (bare invocation errors
with usage, non-TTY-safe).

**Park / resume ceremony workflows.** The verbs ship as the *mechanics* half (CLI + executor + pointer-record);
their *judgment* half is `park-work-unit.md` / `resume-work-unit.md` — thin ceremonies authored **here**. They were
`arc-plan-conductor` §20's; that WU decomposed and park/resume folded into this cohort (via the retired
`park-resume-lifecycle`) with no other member claiming the workflows, so authoring them closes a slip, not new
scope. The load-bearing piece is `park-work-unit`'s **cross-branch run-context**: park@Active's relocate +
pointer-record must land on the **tracked** branch while the WU branch's `active/` artifacts stay authoritative
(the executor does pure `git mv` in its cwd and never commits, so *which* worktree the ceremony drives the legs from
is what makes the pointer-on-main / artifacts-on-branch split hold — settle the run-context at task time: enforced
in the handler vs. documented run-from-tracked). It reuses `decomposition-machinery`'s single-source `active/ →
backlog/` + teardown blocks rather than re-authoring them. `resume-work-unit` drives `arc resume` (spawn + `--here`)
and the re-attach. Authored as **v1**; the composable-fragment factoring is `composable-workflows`'. park@Active and
resume are proven end-to-end by a park→resume round-trip — the coverage the verbs shipped without.

### 7. Per-cell mechanics (the open-question resolutions)

- **`reopen` (`Integrating → Active`)** — a phase-only move: `set-phase` (Integrating → Active), no location
  move, no branch rotation (the branch already carries its `<type>/` prefix from `activate`). Side-effect:
  withdraw the PR (close it, or mark it draft per `inputs`) — a `gh` operation, not a bundle leg. This is the
  genuinely-missing inverse of `integrate`.

- **Worktree-occupancy guard** — implemented as a guard predicate over the resolver's active-WU set scoped to the
  current worktree, evaluated in the executor's guard phase before any mutation (§ 5 guard 2).

- **Execution-locus relocation** — `reconcile-worktree`'s teardown leg detects self-teardown (the transition
  tears down the worktree it is executing from), hops the agent's CWD/locus out to the primary worktree's base
  checkout *first*, then runs `git worktree remove`. Without this, `park@Active` / `abandon` of the current WU
  would saw off the branch they stand on.

- **`abandon`** — the destructive inverse of `stub`: deletes a WU's residue, after which the resolver returns
  `nonexistent`. A destructive cascade, so the handler **presents an impact plan and gates on explicit
  confirmation** (a `--yes` flag; bare invocation prints the plan and refuses — safe default under non-TTY is
  not-destroy) per DEV-RULES § Cascade-undo. The executor stays pure mechanics; the confirmation reaches it as an
  `inputs` value. Legal only from the **pre-merge** states (`provisional` / `planned` / `planning` / `active` /
  `parked`): delete branch (local + remote), worktree, artifacts, user-workspace, and the ROADMAP row. **Not**
  legal from `integrating` (route via `reopen` first) or from a merged WU — backing out merged work is a new
  origin-linked follow-up WU, never a mutation of the shipped unit (§ Post-merge rework).

- **`deactivate`** — narrow by design: "undo a premature activation" (recoverable phase↓, `Active → Planning`).
  Shelving an in-progress WU is `park@Active`; destructive teardown is `abandon`. It does **not** apply to a merged
  WU (no merged-corner cell exists — see § Post-merge rework).

### 8. The `Integrating` phase edges

- `Active → Integrating` — `integrate`, owned by `integrate-work-unit`.
- `Integrating → Active` — `reopen` (§ 7); a guard rejects it when the PR has **already merged** (no open PR to
  withdraw) — that case is a new origin-linked WU, not a reopen (§ Post-merge rework).
- `Integrating → park` / `abandon` — **no direct edge**; route through `reopen` first (withdraw the PR before a
  location move).
- `Integrating → completed` — `archive` (the sweep migrates; § 9).
- `completed` is a **sink** — reopen-after-ship is a new WU with an origin-link, not an edge out of the sink.

**Post-merge rework.** Once a PR merges, the WU is committed to ship; the post-merge window (merged but
pre-archival under `archive.cadence: manual`) is a *finish-the-sweep* window, not a mutation window. Backing out or
reworking merged work is a **new follow-up WU with an origin-link** to the reverted one — never a same-unit
reopen. This matches universal forge / branching practice: GitHub and GitLab both forbid reopening a merged PR/MR,
and post-merge backout is a revert PR + new branch across git-flow / GitHub Flow / trunk-based (ADR-026). The
"reopen" idiom belongs to the issue-tracker layer (reopen the *concern*), which the origin-link lineage already
captures; the ensuing code is a fresh delivery unit regardless. Pre-merge rework remains first-class via `reopen`.

**Integration-entry meta write.** On the `Active → Integrating` flip, the durable phase-transition meta fields
(`Last Completed`, `Next Task`, `Next Action`) are written so cold-session orientation is not left reading stale
task pointers. This is the `integrate` row's **soft-field disposition** (§14): the executor writes the values at
the flip, `integrate-work-unit` supplies them as `input` — review-cycle bookkeeping stays out of the meta, only
durable phase-transition state is captured. (Folds in the routed-in "Codify integration-entry meta status updates"
concern; §14 generalizes it across all transitions.)

### 9. `archive` sweep + path computation (ships here)

`archive` (`Active`/`Integrating → completed`) is a `relocate-artifacts` caller: the sweep migrates the WU's
artifact set from `active/` to `completed/`, and the executor **computes the dated/numbered destination path**
(`completed/{YYYY-qN}/{NN}_{name}/`) deterministically. Both the sweep and the `{NN}` / `{dated}` computation are
pure deterministic mechanics — they **migrate** into the executor (correcting the draft's earlier "no-go"
framing). Judgment (merge approval, archival timing) stays in `integrate-work-unit` / `archive` workflow.

**Mergeable sweep vs. physical teardown.** The `archive` edge fires only the **mergeable** legs —
`relocate-artifacts` (`active/ → completed/`) + `clearBranchField` (logical `Branch → [none]`) + `set-phase`
(`State → Shipped`) — so the whole sweep **rides the ship PR** (one PR under both protection modes). Physical
branch/worktree teardown is **non-mergeable** (deleting the branch would close the open PR), so it stays
`integrate-work-unit`'s post-merge cleanup, not a leg of this edge. The three-encoding invariant therefore holds
at the **record** level (the logical field-clear) at sweep time; the **physical** encoding reconciles after merge
— consistent with the record/projection model (§ 6), where directory + branch are a projection of the logical
`(phase, location)`. The encoding-consistency oracle models `→ completed/` as deferring physical teardown, while
local branchless targets (`park@Planning` / `abandon`) still reconcile the branch in place.

**Cohort-doc archival sweep.** When the archived member is the *last* in its cohort, `archive` also sweeps the
coordinating `cohort-<name>.md` to `completed/`. Detection is the resolver's — `lifecycle-membership.ts`'s
`isArchivalTriggered` (true once a non-empty cohort has no member outside `completed/`); its docs explicitly
assign the **fire-point** (the sweep itself) to this member. The executor consumes the predicate and performs the
`git mv`; it never re-derives membership.

### 10. The `stub` creation contract

`stub` requires **commitment** (`provisional` | `planned`) **and priority** as explicit `inputs` — no silent
`provisional` / `P3` default. The unified `stub` primitive makes enforcement a single chokepoint: every
create-path routes through it. Under non-TTY it fails or requires an explicit flag (riding CSA's prompting
substrate later). The mandatory-fields **policy statement** is authored in `strategy-work-organization`
(→ `lifecycle-closeout` cascade); the **enforcement mechanic** lives here.

### 11. The planning-entry write-context gate

A mechanical preflight in `arc-plan` (the planning analog of `run-errand`'s `resolveWriteContext`) that resolves
write-context and **routes** before `draft-design` runs. Inputs: branch context × protection mode ×
draft-presence/location × active-WU. Two layers:

- **Layer 1 — mechanical (CLI).** Is the current context committable for a draft? This is the write-context
  verdict (`proceed` vs. not) — the existing `classifyWriteContext` branch-vs-base axis. Committable → **proceed**
  (draft here). Otherwise fan out to layer 2.
- **Layer 2 — judgment (surfaced to `arc-plan`).** When not committable, route by WU-worthiness to one of
  **start now** (`start` / `init`), **stub** (mint a `provisional`/`planned` record), or **errand** (atomic /
  off-WU). Draft-presence **parameterizes the stub leg** — when a draft is pre-authored, `stub` folds it in, then
  graduate (or keep drafting first) through the shipped path. It does not select the leg: a pre-authored draft can
  equally proceed (committable) or start (WU-worthy now). No meta-less draft and no bespoke adopt edge — the
  draft-first path unifies on `stub` → draft → `graduate` (per §12, Branchless ≠ recordless).

The `resolveWriteContext` *mechanic* → CLI (reuse/extend the existing one); the route *decision* surfaces to
`arc-plan` for the developer to confirm.

**Coordination seam:** shares `resolveWriteContext` + the start-new code path with `out-of-wu-entry`
(agile-parallelism) — a distinct concern (entry-signal dispatch vs. lifecycle-transition write-context).
Sequence, don't merge: whoever touches `resolveWriteContext` / the start-new path second rebases on the first.

### 12. Protection-mode shaping — mode lives in the ship layer

The **mutator bundle is mode-invariant for every transition**: a WU's branch state is a function of its
`(phase, location)`, not the protection mode. This holds because the branch model is itself mode-invariant — a
tracked WU at an **active** location owns its single branch in both `full` and `partial` (grounded in
`strategy-work-organization` § Branch Protection Modes: planned work requires a branch from
inception in *both* modes), and a **backlog-tier stub** (`provisional` / `planned`) is **branchless in both
modes** (it carries a meta with `Branch: [none]`; the branch is cut at graduate). So `reconcile-branch` keys on
`(phase, location)` direction alone: it *creates* the branch when a stub graduates (`init` Path A), *rotates*
`plan/ → <type>/` at `activate`, *preserves* at `park@Active`, *tears down* at `park@Planning` / pre-merge
`abandon` — each identical across modes.

**Branchless ≠ recordless.** The same cut applies to the *record* as to the bundle: a draft is **always
meta-bearing** — accompanied by a meta from inception, whether a `provisional`/`planned` stub or an active
Planning WU — never a free-floating, stateless file. Partial protection skips the *branch* (drafting on `base`),
never the *meta*; the lightweight pre-WU entry is one explicit `stub` call, not a meta-less draft. A recordless
artifact has no derivable lifecycle state, so it is a gap in the state machine, not a lighter mode of it.

Mode shapes only the **ship layer** — how a transition's resulting commit/PR lands on base — never the bundle.
Three ship-layer concerns, all outside the executor:

1. **Pre-WU drafting boundary** — route-1 of the planning-entry gate (§11) is `base` under partial,
   `plan/<name>` under full. This is the one place mode changes *where work begins*, and the gate already owns it.
2. **Non-WU grooming ship** — off-WU maintenance is a direct base commit under partial, a micro-branch + PR
   under full.
3. **Auto-merge lane (full only)** — under full, per-WU grooming PRs the transitions emit (`meta-*` / `draft-*` /
   `tasks-*` / `notes-*` / `cohort-*`) classify onto the auto-merge lane while `spec-*` / code / constitutional
   surfaces stay reviewed. ARC classifies; the host gate enforces. The executor emits the commit identically in
   both modes; lane classification and merge-gating are downstream (integration / `roadmap-tooling` territory),
   not a bundle concern.

Floor = partial; **unknown `branch.protection` values degrade to partial** (fail-safe).

### 13. Slug→state read surface

The slug→state read surfaces as **`arc status <slug>`**: bare `arc status` keeps the session/active view, and a
slug argument resolves that work unit's lifecycle state — preserving the shipped JSON shape from the interim
`arc status --lifecycle <slug>`. The lifecycle verbs land **top-level** (peers of `arc start`; `start ⊥ park` is an
inverse pair so the family shares `start`'s shape, and a generic `arc lifecycle` namespace would over-claim —
errands have their own lifecycle, under `arc errand`), so there is no verb namespace for the read to join: `status`
is its permanent home, not a placeholder. The pure `resolveSlugQuery` aggregator in
`lib/work-unit/lifecycle-query.ts` is the durable artifact and stays put; only the thin CLI shell changes (the
`handlers/status.ts` `--lifecycle` option becomes a `status <slug>` positional). Verb-transition handlers live in
`handlers/lifecycle.ts` — the existing installation handlers (`update` / `health` / `diff`) move to
`handlers/installation.ts` to free the precise name. Coordinate final verb naming with `idiomatic-alignment`.
(Folds in the routed-in "Relocate the slug→state read" concern.)

### 14. Soft-field disposition at transitions

Beyond the three-encoding triple (`State` · directory · branch), a transition can leave the meta's **soft fields**
— `Next Task`, `Next Action`, `Last Completed`, `Blockers` — stale or nonsensical (a shipped WU still pointing at
"Task 5.5"; a just-activated WU still `Next Task: [none]`). This is the same stale-orientation hazard §8's
integration-entry write addresses, generalized. Extending the consistency mandate from the hard triple to the soft
fields, each transition declares a **soft-field disposition** alongside its `encodingUpdates` / `sideEffects` — per
field, one of:

- **`reset: <constant>`** — the executor writes a fixed value (`archive` / `deactivate` → `Next Task: [none]`).
  Deterministic; pure mechanics.
- **`input`** — the executor writes a caller-supplied value (`activate` → `Next Task` = the first task, supplied by
  the workflow; `integrate` → `Last Completed` / `Next Action`, supplied). This **generalizes §8**: the
  integration-entry write becomes the `integrate` row's disposition (executor writes at the flip, the workflow
  supplies the values) rather than a special-cased workflow step.
- **`leave`** — untouched.

The executor never *derives* (no task-list parsing) and never *fabricates* prose — judgment values are supplied,
exactly like `commitment` / `reason`. This keeps it thin: reset-to-constant or write-a-supplied-input.

**Stored vs. suggested (the inconsistency guard).** The *stored* `Next Action` stays **conservative** — `reset`
only where the next step is genuinely canonical, else `input` / `leave` — so a reader is never unsure whether the
field is authoritative guidance or a machine-stamped default. The "what's next" nudge instead lives in the
transition's **ephemeral CLI completion message** ("Parked `foo` — resume with `arc resume foo`"; "Activated —
begin the task loop"), which every transition emits freely: advisory output, never persisted, so it carries **zero
meta-consistency cost**. Planning-stage ceremonies continue to author their own `Next Action` hand-offs; the
disposition governs the executor transitions.

## Alternatives & Rationale

- **B0 (doc-only) vs. B1 (table-as-code) vs. B2 (generic engine).** B0 keeps the status quo — the lifecycle stays
  an audit, not a guard, and the duplication persists. B2 (a generic transition engine) over-generalizes: baking
  `git mv` in as *the* transition mechanism re-commits the physical-file-location assumption, fighting the
  arc-backend direction. **B1 wins** — a declarative table over *logical* `(phase, location)` makes totality and
  encoding-consistency shippable invariants while keeping the physical encoding a projection. The executor stays
  thin precisely so the table, not the engine, is the source of truth.

- **State from git-inference vs. logical `(phase, location)`.** Inferring state from `git branch` / `git log` is
  non-deterministic across machines and worktrees and bakes in exactly the coupling a record backend must unwind.
  The resolver instead resolves location from the containing directory (deterministic, directory-wins) and phase
  from the meta — a **logical pair** that is the record shape a backend re-homes with zero reshape. Directory
  derivation is the chosen *projection*, not the thing rejected; git inference is.

- **Engagement as a third axis vs. derived.** Modelling engaged / parked as stored state invites the
  dormant-branch rot the model is built to forbid (suspended-but-still-in-`active/`). Deriving engagement from
  `(phase, location)` makes suspension *legible by construction* — you cannot be parked without having moved
  location.

- **Park as branch-delete vs. the pointer-record.** Deleting a parked-Active branch loses the durable shelf and
  forces a full re-cut on resume. The **pointer-record** preserves the branch as the authoritative shelf and
  leaves only a regenerable projection on `main` — and doubles as the first concrete worked example of the
  arc-backend record/projection model, de-risking it early on one well-bounded state.

- **Integration-entry meta write: `verify-work-unit` vs. `integrate-work-unit` Step 1.** Coupling the durable
  field write to verification spreads phase-transition state across two workflows. Putting it on the phase flip
  (`integrate-work-unit` Step 1) keeps the side-effect with the transition that actually changes phase and keeps
  review-cycle bookkeeping out of the meta. **Chosen: Step 1.**

- **Archive-sweep executor: ship here vs. feed back.** The sweep is a `relocate-artifacts` caller and the
  `{NN}` / `{dated}` computation is pure deterministic mechanics — splitting them across members would fracture
  the relocation primitive this WU exists to unify. **Chosen: ship here.**

## Cross-cutting Considerations

- **Testing.** The table-walking tests (totality, inverse round-trip, encoding-consistency) are the headline
  guard and ship with the table. Each mutator leg is unit-tested with injected fs/git dependencies (per the
  three-layer architecture — `lib/` takes dependencies in). Executor dispatch + guard rejection paths get
  integration coverage; `start` dispatch across all resolved states and both foot-gun guards get E2E coverage
  against real worktrees.
- **Arc-backend forward-compat (ADR-022).** The resolver and the worktree-occupancy guard resolve state from
  location + meta fields, **never** `git branch` / `git log` inference. The pointer-record is the record/projection
  model applied early.
- **CSA forward-compat.** The executor's git + non-TTY mechanics are hand-rolled now and migrate to
  execa / zod / neverthrow + the shared prompting substrate later; the `stub` required-fields *policy* stays ours.
- **Migration / rollout.** Existing workflows (`init`, `decompose`, `archive`, `activate` / `deactivate`) are
  re-pointed to call the executor rather than re-author relocation inline; per-member docs update locally with the
  code. The cross-cutting verb-rename doc sweep is deferred to `lifecycle-closeout` (global consistency tail).
- **Architecture rationale (ADR-026).** The B1 depth choice, the mechanics-in-CLI / judgment-in-workflow split,
  and the early application of the record/projection model to `park@Active` are captured in ADR-026, the
  companion to this Novel spec.
- **User-facing impact.** `arc start` becomes safe against existing stubs and worktree occupancy. The slug→state
  read returns to `arc status <slug>` (replacing the interim `arc status --lifecycle`, JSON shape preserved).
  `park` / `resume` / `promote` / `demote` / `reopen` / `abandon` become real **top-level** CLI verbs (peers of
  `start`); the destructive `abandon` verb presents an impact plan and requires an explicit `--yes`.

## Success Criteria

1. A single declarative transition table in `lib/` is the authoritative source of states, legal edges, inverses,
   guard requirements, and per-transition encoding updates — with no relocation logic re-authored in any workflow.
2. Table-walking tests pass and fail correctly: totality (every cell legal-or-marked-illegal), inverse
   round-trip for every paired verb, and encoding-consistency (meta `State` · directory · branch) for every edge.
3. The 1↔1 mutator bundle (`relocate-artifacts` / `reconcile-branch` / `reconcile-worktree` / `set-phase`) is the
   sole relocation primitive, called by every location-moving transition.
4. `arc start <name>` dispatches correctly across all resolved states and is provably guarded: a name-collision
   routes to graduate (never mis-scaffolds), and worktree-occupancy rejects a second active WU in one worktree.
5. The full inverse-paired verb set is shipped as real **top-level CLI verbs** (peers of `arc start`) —
   `promote` / `demote`, `park` / `resume`, `reopen`, `abandon` (split from `deactivate`) — each an
   executor-dispatched transition, with the destructive `abandon` gated behind an impact plan + explicit `--yes`.
6. `park@Active` preserves the branch and lands the blessed pointer-record on `main`; resume re-attaches.
7. `abandon` executes its destructive cascade from the pre-merge states only (never from `integrating` or a merged
   WU — post-merge backout is a new origin-linked WU), including execution-locus relocation when tearing down the
   current worktree.
8. The `archive` sweep + dated-path computation run from the executor, and the cohort-doc archival sweep fires on
   `isArchivalTriggered` (last member shipped) to migrate `cohort-<name>.md` to `completed/`.
9. The `stub` contract rejects creation without explicit commitment + priority.
10. The planning-entry write-context gate routes `arc-plan` correctly: layer 1 resolves committable → proceed via
    the write-context verdict; layer 2 routes not-committable by WU-worthiness to start / `stub` / errand, with a
    pre-authored draft folded into the `stub` leg (mint a record, fold the draft in, then graduate — no adopt edge).
11. `arc status <slug>` serves the slug→state read with the JSON shape preserved from the interim `arc status
    --lifecycle`.
12. Each transition applies its declared soft-field disposition (`reset` / `input` / `leave`) so `Next Task` /
    `Next Action` / `Last Completed` stay consistent post-transition — the executor writes resets + supplied
    inputs, never deriving or authoring — and emits an ephemeral next-step suggestion that is never persisted.
13. `park-work-unit.md` / `resume-work-unit.md` ceremony workflows drive the verbs end-to-end: park@Active's
    relocate + pointer-record land on the tracked branch (the WU branch's `active/` stays authoritative) and resume
    re-attaches in both placement modes (spawn and `--here`), proven by a park→resume round-trip integration test.
    `reconcile-worktree`'s fresh-worktree spawn re-attaches an existing preserved branch (bare `git worktree add`,
    no `-b`) for resume.

## Open Questions

- **Transition-record granularity for composite verbs.** `decompose` and `integrate` are owned by sibling/other
  workflows but appear in the table as edges; the exact split between the table-declared edge and the workflow's
  judgment half is settled per-verb at task time (the table declares the edge + encoding updates; the workflow
  keeps the judgment). Implementation detail, not a design fork.
- **PR-withdrawal mechanic surface for `reopen`** — close vs. convert-to-draft as the default, and whether it is a
  `--keep-pr` `inputs` toggle. Resolved at task time against the `gh` surface; does not affect the state model.
- **Exact `inputs` schema per verb** (the values the executor requires supplied) — enumerated during task
  generation from the per-transition guard + side-effect set; no open *design* decision remains.

---
