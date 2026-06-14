# Draft: Lifecycle Transition Core

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). The heavy member: the
  state machine itself.
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Build the explicit, complete, coherent WU state machine as code — the logical `(phase, location)`
  model + derived-state predicates, a hand-rolled declarative transition table (B1), a thin imperative executor,
  the 1↔1 relocation/sweep mutator bundle, the guards, the full inverse-paired verb set, the park@Active
  pointer-record, the `stub` required-fields contract, and the planning-entry write-context gate. Take the first
  deliberate step toward the north star (deterministic mechanics → CLI).

> Shared context — the as-is lifecycle, the north star, the cross-member contracts (this member owns the
> transition table and the mutator bundle, and *consumes* the `(phase, location)` state-space model owned by
> `lifecycle-state-resolver`) — lives in `cohort-lifecycle-state-machine.md`.

---

## Problem / Motivation (this member's slice)

- **The verbs are a half-built, asymmetric set.** `activate ↔ deactivate` is the only clean inverse pair; `park` /
  `resume` unshipped; `graduate` has no inverse; the create-stub forward edge is unowned.
- **`arc start` has an unguarded foot-gun.** `arc start <name>` is create-new only; run against an existing
  `backlog/` stub it silently mis-scaffolds (fresh template meta losing backfilled fields, orphaned draft, two
  metas, no graduation).
- **Relocation logic is duplicated across ceremonies** (`init` Path A, `decompose`'s park-exit, `archive`'s
  sweep, the unshipped park/resume) — never unified.
- **The machine is ~90% markdown, with no single source** of what the states and legal transitions are.
- **The planning-entry gate is prose-only** — `arc-plan` drops a draft onto `main` where it can't be committed,
  because no mechanical preflight resolves write-context and routes (discovered live starting this work).
- **Starting from a pre-authored draft has no clean entry** — neither create-new nor init Path A handles it.

## Resolved model

### Two logical axes: phase ⊥ location (consumed from `lifecycle-state-resolver`)

The transition table reasons over the `(phase, location)` state-space model **owned by `lifecycle-state-resolver`**
(§ Shared contracts) — recapped here as the substrate the verbs move across:

- **Lifecycle phase** — `Planning` / `Active` / `Integrating` / `Shipped`. This *is* the meta `State` field.
- **Commitment location** — `provisional` / `planned` / `active` / `completed`.

A `planned/` stub and a WU on a `plan/` branch are *both* phase `Planning`; phase + location together say where it
lives. **Resolution: location is a logical value** (a field, or computed-but-named), **not raw
directory-derivation** — a table reasoning about logical `(phase, location)` is arc-backend-safe (the physical
encoding becomes a projection). The resolver owns *resolving* a state; this member owns the *legal edges* between
states.

### Derived-state vocabulary — engagement is computed, not a third axis

The rendered/filtered "states" are a derived lattice over `(phase, location)` + the dependency graph — the
resolver's derived-state projection, recapped here for the render buckets the transitions populate:

| Rendered state    | Derivation                                               |
|-------------------|----------------------------------------------------------|
| queued            | `location ∈ {provisional, planned}` ∧ `phase = Planning` |
| on my plate       | `location = active` ∧ `phase ∈ {Planning, Active}`       |
| awaiting review   | `phase = Integrating`                                    |
| parked / suspended| `location ∈ backlog` ∧ `phase = Active`                  |
| blocked (overlay) | unmet `Depends On` — orthogonal, layered over the cells  |
| shipped           | `location = completed`                                   |

Splitting the **`Active` overload** (phase-fact "implementation underway" vs. engagement-fact "on my plate") is
the mirror of the `Planning` overload. Engagement is fully derivable, so not an independent axis; the model
*forbids* "suspended but still in `active/`" (the dormant-branch rot — parking *moves location*, which is what
makes suspension legible). `park@Planning` collapses into `queued`; only `park@Active` populates the **Parked**
render bucket (excluded from parallel-capacity math). Keep the predicates **queryable** (probe / status), not
buried in ROADMAP rendering.

### The verb set — fully inverse-paired, every edge owned

Headline pair: **`start` ⊥ `park`**.

| Axis / role               | Verb                    | Move                                                        | Inverse            |
|---------------------------|-------------------------|-------------------------------------------------------------|--------------------|
| phase                     | `activate`              | `Planning → Active`                                         | `deactivate`       |
| phase                     | `deactivate`            | `Active → Planning` (undo activation; recoverable; narrow)  | `activate`         |
| phase                     | `reopen`                | `Integrating → Active` (withdraw from review / PR rejected) | `integrate`        |
| location (active↔backlog) | `park`                  | `active → backlog` (phase-polymorphic)                      | `resume` / `start` |
| location (active↔backlog) | `resume`                | parked `backlog → active` (re-attach branch)                | `park`             |
| location (within backlog) | `promote`               | `provisional → planned` (Class **must resolve**)            | `demote`           |
| location (within backlog) | `demote`                | `planned → provisional` (Class sticky)                      | `promote`          |
| forward                   | `stub`                  | idea → `backlog` (commitment + priority **required**)       | `abandon`          |
| composite                 | `decompose`             | `Planning → cohort` (matrix — `decompose-matrix` member)    | — (irreversible)   |
| terminal                  | `integrate` + `archive` | `Active`/`Integrating → completed`                          | — (no-go)          |
| destructive               | `abandon`               | any → deleted                                               | —                  |

- **`arc start <name>` is a full lifecycle-state dispatch** (routing on the resolver's state): nonexistent →
  create-new; provisional/planned → begin (graduate via init Path A, resolving `Class`); **parked** → `resume`;
  already active → error (occupied); shipped → offer a new WU with origin-link; integrating → route via the
  Integrating edges. Abandoned is not a distinct arm (`abandon` leaves no residue → resolver returns
  `nonexistent`). **Two guards:** name-collision AND **worktree-occupancy** (one active WU per worktree — the
  live foot-gun that put two metas in `active/` and broke the release wrapper).
- **`scaffold` is the internal structure-generation mechanic** (`stub`, `start` create-new, `decompose`, init
  Path B, errand→WU promotion all invoke it). `stub` / `start` are the judgment-bearing front doors.
- **Renames:** `graduate → promote` (+ the missing `demote` inverse); **`abandon` splits out of `deactivate`**
  (undo-activation vs. throw-away are different intents); **`reopen` added** as the missing `Integrating → Active`
  inverse. `activate` / `deactivate` keep their names (the model fix, not a rename, resolves the old overload).
- **`promote` carries a Class gate** (never leaves `planned/` carrying `[TBD]`); `demote` is Class-sticky (the
  ratchet protects realized work).

### `deactivate` — a semantic + totality seam

Stays narrow = "undo a premature activation" (recoverable phase↓); shelving an in-progress WU is `park@Active`;
destructive teardown is `abandon`. The post-merge corners are two distinct cells sharing the PR-revert mechanic
but differing by target: **`deactivate`@merged (Case C)** reverts back to Planning; **`abandon`@merged (Case D)**
reverts to deleted.

### The relocation primitive — a 1↔1 mutator bundle

Strictly 1↔1; a bundle of phase-aware encoding-mutators fired **together** so the three-encoding invariant (meta
`State` · directory · branch) holds by construction:

- `relocate-artifacts` — the `git mv` of the WU's artifact set (`backlog ↔ active`, `active → completed`).
- `reconcile-branch` — create / rename / delete / **preserve**, phase-and-direction-conditioned.
- `reconcile-worktree` — spawn / teardown, **including execution-locus relocation** (a transition tearing down
  the worktree it runs from must hop the agent's locus out first).
- `set-phase` — the meta `State` write (phase-axis mutator, no location move).

**Callers:** location-movers (`park` / `resume` / `promote` / `demote` / init-Path-A / **`archive` sweep**) call
`relocate-artifacts` + conditioned branch/worktree mutators; phase-movers (`activate` / `deactivate` / `reopen` /
`integrate` flip) call `reconcile-branch` (when the prefix rotates) + `set-phase`. **Transition side-effects the
bundle fires** (mechanics the neighbors own): `reconcile-roadmap` / `reconcile-status-user` on every location
move; dep-edge discharge at `activate` — the discharge *write* is owned here, reading landed-edge state from
`lifecycle-state-resolver`'s dep-state query; the user-workspace satellite (`arc user open/close`) across
init/start/activate/integrate/decompose/park/resume/abandon.

### Shelve — `park` made phase-polymorphic + the pointer-record

- **park@Planning** — no code; tear the branch down, re-cut `plan/<name>` on resume. Renders as `queued`.
- **park@Active** — code exists; **preserve the branch** (pushed = the durable shelf), tear down only the
  worktree, relocate artifacts. Resume re-attaches (≈ the Materialize mechanic). Renders as `parked`.

**The pointer-record (tracked-file resolution).** A parked-Active WU's authoritative artifacts stay on the
preserved branch; `main` carries only a minimal **render-pointer** (`State: Active (parked)`, `Branch: feat/X`, +
render fields), **blessed as a legal state shape** the three-encoding sweep expects rather than flags. The branch
meta is authoritative; the pointer is regenerable, never hand-edited. This is the arc-backend record+projection
model applied early to one state (pointer → record, `Branch` → code-ref field, zero reshape). **Ships in this
member** (not deferred). Park's guards: reject park-from-`Integrating` (close/withdraw the PR via `reopen` first);
commitment picked at park time.

### `stub` creation contract — the CLI never fabricates judgment values

`stub` requires **commitment** (`provisional` | `planned`) **and priority** as explicit inputs — no silent
`provisional` / `P3`. The unified `stub` primitive makes enforcement one chokepoint (every create-path routes
through it). Under non-TTY it fails or requires an explicit flag (riding CSA's prompting substrate later). The
mandatory-fields *policy* statement is authored in `strategy-work-organization` (→ `lifecycle-closeout` cascade).

### The planning-entry write-context gate

A mechanical preflight in `arc-plan` (the planning analog of `run-errand`'s `resolveWriteContext`) that resolves
write-context and **routes** before `draft-design` runs. Inputs: branch context × protection mode ×
draft-presence/location × active-WU. Routes: (1) committable drafting context → proceed; (2) not committable →
by WU-worthiness, start now (`start`/`init`) or defer (classify → errand or `stub`); (3) **pre-authored draft, no
branch → adopt** (`start --from <draft>`: cut `plan/<name>`, relocate the draft into `active/`) — a new entry
edge. The `resolveWriteContext` mechanic → CLI (reuse/extend the existing one); the route *decision* surfaces to
`arc-plan` for the developer to confirm. **Coordination seam:** shares `resolveWriteContext` + the start-new code
path with `out-of-wu-entry` (agile-parallelism) — distinct concern, sequence not merge (see cohort doc).

### Protection-mode shaping — mode lives in the ship layer

The **mutator bundle is mode-invariant for every tracked-WU transition** (a tracked WU owns its single branch in
both `full` and `partial`). Mode shapes only the **ship mechanism** (how a transition's commit lands on base) —
uniform, not per-transition. Partial relaxes exactly two surfaces, neither inside the bundle: (1) the pre-WU
drafting boundary (route-1 is `base` under partial, `plan/<name>` under full); (2) the ship mechanism for non-WU
grooming. Floor = partial; **unknown `branch.protection` values degrade to partial** (fail-safe).

### The `Integrating` phase's edges

`Active → Integrating` (`integrate`, owned by `integrate-work-unit`); `Integrating → Active` (`reopen` — the
genuinely-missing inverse); `Integrating → park`/`abandon` route through `reopen` first (no direct edge — withdraw
the PR before a location move); `Integrating → completed` (`archive` — sweep migrates). **Illegal cells, marked:**
`(backlog, Integrating)`; `completed` is a sink (reopen-after-ship is a new WU with origin-link).

### CLI-migration depth — B1 + the transition table

Ship a hand-rolled declarative transition table **as code** — states, legal transitions, inverses, guard
requirements, per-transition encoding-update spec — with a **thin imperative executor**. Over *logical*
`(phase, location)` (arc-backend-safe; a B2 engine baking `git mv` as *the* mechanism re-commits the
file-location assumption). The table makes the totality + encoding-consistency invariants a **shippable
mechanical guard/test** ("ship it, don't just audit it"). **Exclusions principle** (the table is total
regardless; "excluded" = executor-not-built-this-WU): judgment never moves; within mechanics, the executor
targets relocation/sweep-mechanics-that-are-seams. `archive`'s sweep + `{NN}`/`{dated}` computation **migrate**
(pure deterministic mechanics — corrects the prior "no-go").

## Open questions (→ create-spec)

- Per-cell mechanics: `abandon`'s per-cell set incl. the post-merge PR-revert corner; the `reopen` mechanic; the
  worktree-occupancy guard; execution-locus relocation in the worktree mutator.
- Final transition-table representation + guard placement (in the bundle / table-validated).
- Whether the `archive`-sweep executor ships in this member or is fed back (depends on member sizing at its spec).

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-state-resolver` — the transition table moves over its
  `(phase, location)` state-space model; `start` dispatch + the worktree-occupancy guard call its slug→state
  projection; dep-edge discharge reads its dep-state query.
- **Forward-compat:** arc-backend (logical-record design target; no git-inference); CSA (hand-roll executor git +
  non-TTY now, migrate later); roadmap-tooling (emits the Parked bucket + predicates, RT renders);
  composable-workflows (the mutator bundle is its code-tier worked example); graduation-cleanup (names the
  `activate`/`park` hook point only); `out-of-wu-entry` coordination seam (see cohort doc).
- **Consumed by:** `decompose-matrix` (mutator-bundle teardown legs); `lifecycle-closeout` (the model the doc
  sweep documents).

## Continuity

- **Readiness:** formalization-ready. The load-bearing forks are resolved (B1; the full inverse-paired verb set;
  the 1↔1 mutator bundle; park@Active pointer-record; the `stub` contract; the planning-entry gate; protection-mode
  = ship-layer property). The `(phase, location)` state-space model it moves over is owned by
  `lifecycle-state-resolver` (consumed here). Remaining items are create-spec per-cell detail.
- **Next:** activate via `init-work-unit` Path A once `lifecycle-state-resolver` ships → `create-spec`.

---
