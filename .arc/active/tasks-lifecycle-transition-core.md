# Task List: lifecycle-transition-core

- **Design:** `spec-lifecycle-transition-core.md`

---

## **Phase 1:** Transition table & invariant guards

_Purpose:_ Land the single authoritative source of truth — the declarative transition table over the resolver's
`(phase, location)` state space — and the table-walking tests that make totality, inverse-pairing, and
encoding-consistency shippable guards rather than per-workflow audits. Pure data + pure tests, no fs/git seam.

### `[x]` **1.1 Transition-record & verb-set types**

- _Goal:_ The table has a typed vocabulary, so an illegal verb, state, guard reference, or mutator spec is a
  compile error and the executor dispatches over exhaustive unions.

- _Outcome:_ New `lib/work-unit/lifecycle-transitions.ts` types the full vocabulary — `Verb` (13), `GuardId`,
  `SideEffectId`, `MutatorSpec` (the four bundle legs as direction-typed optional flags: `relocateArtifacts` /
  `setPhase` booleans, `reconcileBranch` / `reconcileWorktree` enums), `SoftFieldDispositions`
  (`{ reset } | "input" | "leave"` per field, conservative on `nextAction`), `TransitionRecord`, and the disjoint
  `IllegalCell`. `from`/`to` are the resolver's `LifecyclePosition` (logical `(phase, location)`, never the derived
  enum); illegal cells are a sibling list, not a `legal: false` variant, so 1.3's totality walk can catch a
  forgotten cell. `GuardId` / `SideEffectId` are the spec-grounded seed registry — 1.2's table authoring and
  Phase 2–3 extend them as edges crystallize.

### `[x]` **1.2 The declarative transition table**

- _Goal:_ One array of `TransitionRecord`s is the authoritative set of legal lifecycle edges and explicitly-marked
  illegal cells — replacing the transition rules restated per workflow.

    - `[x]` **1.2.a Phase-axis edges** — `activate` / `deactivate` (branch rotates `plan/`↔`<type>/`, `setPhase`)
      and `integrate` / `reopen` (`setPhase` only, no rotation); `reopen` guards on `pr-unmerged`.

    - `[x]` **1.2.b Location-axis edges** — `park` (phase-polymorphic: `park@Active` preserves the branch,
      `park@Planning` deletes it) / `resume` / `promote` / `demote` / `start` graduate, each an `artifacts: relocate`
      caller with conditioned branch/worktree mutators.

    - `[x]` **1.2.c Forward, terminal & destructive edges** — `stub` (scaffold → provisional/planned), the `start`
      dispatcher (create-new / graduate / resume-arm), `archive` (Active·Integrating → shipped), `abandon`
      (pre-merge states → nonexistent), `decompose` (Planning-phase → cohort; full matrix refined by `decompose-matrix`).

    - `[x]` **1.2.d Marked-illegal cells** — the full complement of the legal canonical edges, built via an
      `illegalCells(verb, froms, reason)` helper so each cell is explicit with a reason; includes
      `integrating → park`/`abandon` (route via `reopen`) and the `completed`-sink exits.

- _Outcome:_ 25 legal `TransitionRecord`s + 69 `MARKED_ILLEGAL` cells in `lifecycle-transitions.ts`, total over the
  `13 verbs × 7 states` grid. Encoding modeled as an `artifacts` disposition (`relocate`/`scaffold`/`remove`) +
  conditioned branch/worktree/`setPhase`; `from`/`to` widened to `LifecyclePosition | null` for the `nonexistent`
  endpoint (`stub` source / `abandon` target / create-new); `VERBS` array added as the totality axis. Reflects the
  post-merge-rework resolution — no merged-corner cells (`abandon` pre-merge only, `deactivate` narrow, `reopen`
  guards `pr-unmerged`).

### `[x]` **1.3 Table-walking invariant tests**

- _Goal:_ A documented-but-inconsistent transition fails CI rather than surfacing as a live foot-gun — the table's
  three invariants are proven mechanically.

- _Outcome:_ `lifecycle-transitions.test.ts` — six passing walks: totality (every `(verb, from)` legal XOR illegal,
  never both/neither; illegal cells canonical-only; no dupes), inverse round-trip (a paired verb + its `inverse`
  returns to the origin), encoding-consistency (each edge's `encodingUpdates` equal the mutators derived
  independently from `expectedEncoding(from→to)`), and non-canonical lag-pairs absent. The shared
  `expectedEncoding(position)` oracle lives in the module, referenced by both table authoring and the test.
  Behaviors batched single-pass — tightly-coupled assertions over one shared data structure.

## **Phase 2:** The 1↔1 mutator bundle & transition side-effects

_Purpose:_ Unify the relocation primitive once — the four phase-aware mutators fired together so the
three-encoding invariant (meta `State` · directory · branch) holds by construction — plus the side-effects
location moves fire. Each leg takes fs/git dependencies injected (three-layer architecture) and is unit-tested
against them.

### `[x]` **2.1 `relocate-artifacts` mutator**

- _Goal:_ A single primitive performs the `git mv` of a WU's full artifact set between lifecycle locations, so no
  transition re-authors relocation inline.

- _Outcome:_ New `lib/work-unit/mutators/relocate-artifacts.ts` — `relocateArtifacts` discovers the set from the
  source directory by slug (`^[a-z]+-<slug>.md$`, so missing optionals drop out and a foreign meta or `cohort-*.md`
  sharing the dir is never moved), ensures the caller-supplied destination, then `git mv`s each file in sorted
  order; an empty match is a no-op (no move, no `mkdir`). Git + fs seams injected (three-layer). Five unit tests
  cover the three directions (`backlog→active`, `active→completed`, `active→backlog/planned`) plus the
  missing-optional, foreign-file, and empty-set cases.

### `[x]` **2.2 `reconcile-branch` mutator**

- _Goal:_ Branch state is reconciled to a transition's `(phase, location)` direction — rotated, preserved, or torn
  down — identically in both protection modes.

- _Outcome:_ New `lib/work-unit/mutators/reconcile-branch.ts` — `reconcileBranch` dispatches a discriminated
  `ReconcileBranchOp`: `rename` rotates locally (`git branch -m`), `delete` force-deletes the local branch then
  best-effort deletes the remote ref (an unpushed planning branch's missing remote is swallowed; local teardown is
  authoritative), `preserve` and `create` are no-ops (`create` rides the worktree-spawn leg). Git seam injected;
  six unit tests cover rotate, preserve, local+remote teardown (default + explicit remote), the swallowed
  remote-delete failure, and the create no-op.

### `[x]` **2.3 `reconcile-worktree` mutator (incl. execution-locus relocation)**

- _Goal:_ Worktree state is spawned or torn down per transition, and a transition tearing down the worktree it
  runs from first hops the agent's locus to the primary checkout — so park@Active / abandon of the current WU never
  saws off the branch it stands on.

- _Outcome:_ New `lib/work-unit/mutators/reconcile-worktree.ts` — `reconcileWorktree` dispatches a `spawn` /
  `teardown` op union. `spawn` is the decomposition of `spawnWorktree` (`git worktree add -b` at the
  `resolveWorktreeLocation` path + `writeWorktreeOwnershipMarker`), with the meta write and `runUserOpen` left to
  `scaffold` / the user-workspace side-effect. `teardown` gates on `isWorktreeClean` (refuses dirty; never
  `--force`) and, on self-teardown (`currentLocus` inside `worktreePath`, a `node:path` containment check), resolves
  the primary via `resolvePrimaryWorktreePath` and hops the injected `chdir` before `git worktree remove`. The git
  seam and locus-hop are both injected; four unit tests (real-fs marker for spawn) pin spawn, clean non-self
  teardown, dirty refusal, and the hop-before-remove ordering.

### `[ ]` **2.4 `set-phase` mutator**

- _Goal:_ The meta `State` field is the single write point for a phase-axis move — no location change, no branch
  touch.

- _Note:_ Net-new and **frontmatter-preserving**: `meta-reader.ts` is read-only and `renderMetaFile` writes a full
  fresh meta, so neither fits — `set-phase` edits the `**State:**` field in place, leaving every other field
  untouched.

    - Build `test-first` (one behavior at a time):
        - Writes the meta `**State:**` field to the target phase, preserving all other fields.
        - Rejects an unknown phase (validates against `WorkUnitState` via `validateState` in
          `commands/active/types.ts`).

### `[ ]` **2.5 Transition side-effects**

- _Goal:_ The broad transition side-effects — readiness-view regen on every location move, and user-workspace
  open/close across the WU-touching verbs — are declared effects the executor fires by id, not inline ceremony.

- _Notes:_ See `notes-lifecycle-transition-core.md` § Side-effect implementation split, § User-workspace side-effect.

    - `[ ]` **2.5.a Readiness-view regen** — `reconcile-roadmap` / `reconcile-status-user`, declared on every
      location-move edge.
        - `reconcile-status-user` builds for real — composes via the shipped renderer (`runStatusUserView` /
          `composeUserView`, `lib/status/`) and writes `STATUS.USER`.
        - `reconcile-roadmap` is declared as a `SideEffectId` (forward-compat — `roadmap-tooling` fills the
          renderer), with an interim implementation that emits a precise advisory naming the WU + its `from→to`
          location move. No format / bucket / Parked-label commitment here (downstream).

    - `[ ]` **2.5.b User-workspace satellite** — open/close across
      `init` / `start` / `activate` / `integrate` / `decompose` / `park` / `resume` / `abandon`.
        - Calls the non-interactive `runUserOpen` / `runUserClose` (`commands/user/`) that `scaffoldIntoWorktree`
          already uses headlessly — never the interactive `handleUserOpen` handler (TTY-blocking, destructive
          default; owned by `cli-substrate-adoption`).

## **Phase 3:** The thin executor & foot-gun guards

_Purpose:_ The imperative shell that drives the table — resolve current state, look up the legal edge, validate
guards, fire the mutator bundle, fire side-effects — and the two guards that close the live foot-guns. The
executor never decides and never fabricates judgment values; it requires them supplied as `inputs`.

### `[ ]` **3.1 `executeTransition` dispatch**

- _Goal:_ A transition is a table lookup plus mechanical application — `executeTransition(verb, slug, inputs)`
  resolves state, validates, mutates, and fires side-effects, with no bespoke per-verb code.

- _Note:_ The per-verb `inputs` schema is enumerated from each edge's guard + side-effect set (resolves the spec's
  `inputs`-schema open question). The executor stays thin; the table is the source of truth. The single fs seam is
  at entry: build the index once via `buildLifecycleIndex({ cwd, fs })` (async, injected `fs` — three-layer), then
  the table lookup + guard validation run **pure** over it.

    - Build `test-first` (one behavior at a time):
        - Resolves current state via `resolveSlugPosition(index, slug)` over the entry-built index.
        - Rejects an illegal/unknown `(verb, from)` with an actionable message and no mutation.
        - Validates every declared guard against state + inputs; rejects on first failure with no mutation.
        - Fires `encodingUpdates` legs sequenced so a partial failure is recoverable and reported, never silently
          half-applied.
        - Fires declared side-effects only after the encoding succeeds.
        - Applies the `softFields` disposition (§14): writes `reset` constants + supplied `input` values, leaves the
          rest — never derives (no task-list parsing) or authors prose.
        - Emits an ephemeral next-step suggestion in CLI output (advisory, never persisted to the meta).
        - Never fabricates judgment values (commitment / priority / `Class` / soft-field prose) — requires them in
          `inputs`.

### `[ ]` **3.2 Foot-gun guard predicates**

- _Goal:_ The two live foot-guns become guard rejections — an existing stub is never mis-scaffolded, and a second
  active WU in one worktree is refused.

- _Note:_ The worktree-occupancy guard is **not** `isOccupied(index, slug)` alone (that's slug-scoped/global) — it
  composes `readActiveMetaCandidates(worktree)` (the lite/full-aware active-meta reader session-init's
  active-resolution uses) with `resolveSlugState`, rejecting when any candidate ≠ target sits in an occupying state
  backing a different branch. Resolved from meta + location, never `git branch` inference (arc-backend-safe).

    - Build `test-first` (one behavior at a time):
        - Name-collision: `start <name>` against an existing stub forces graduate-not-scaffold (the one
          deterministic decision the executor makes).
        - Worktree-occupancy: rejects when `readActiveMetaCandidates(worktree)` yields a candidate ≠ target in an
          occupying state (phase ∈ {Planning, Active, Integrating}) backing a different branch.
        - Both evaluate in the executor's guard phase, before any mutation.

## **Phase 4:** The inverse-paired verb set

_Purpose:_ Ship every lifecycle verb as an executor-dispatched transition with its per-cell mechanics — closing
the asymmetry so every forward edge is owned and every inverse present. Each verb declares its table edge and
supplies its `inputs`; the executor and bundle do the work.

_Design decisions:_ Verb CLI shape (context-defaulting vs. slug-required; bare invocation = a **non-interactive**
candidate list, never a clack `select`) and the destructive-cascade safety gate (`abandon` / `deactivate`@merged:
impact plan + `--yes`) are cross-cutting across this phase — see `notes-lifecycle-transition-core.md` § Verb CLI
shape & bare invocation, § Abandon & post-merge safety gate. The PR/gh write mechanics (`reopen` / `deactivate` /
`abandon`) are net-new (no existing wrapper; the `gh`-read pattern in `session-init/work-unit-pr-source.ts` is the
model), hand-rolled now per the spec's CSA-forward-compat note. Each verb supplies its `softFields` `input` values
(§14 — e.g. `activate` → the first task; `park` → the frozen pointer) and emits an ephemeral next-step suggestion;
the executor never derives or authors them.

### `[ ]` **4.1 `stub` creation contract**

- _Goal:_ Every create path routes through one `stub` chokepoint that refuses creation without explicit commitment
  and priority — no silent `provisional` / `P3` default.

- _Note:_ `stub` is a create verb — takes a new name (not an existing slug); commitment + priority supplied as
  `inputs` (flags), no bare default. The required-fields _policy_ is authored in `strategy-work-organization` (a
  `lifecycle-closeout` cascade); the _enforcement mechanic_ lives here. `scaffold` is the internal structure-gen
  mechanic that `stub` / `start` create-new / `decompose` / `init` Path B / errand→WU promotion all invoke.

    - Build `test-first` (one behavior at a time):
        - Rejects `stub` without commitment (`provisional` | `planned`) supplied.
        - Rejects `stub` without priority supplied.
        - Scaffolds the selected-tier meta under `backlog/` when both are supplied.
        - Under non-TTY, fails (or requires an explicit flag) rather than defaulting.

### `[ ]` **4.2 `promote` / `demote`**

- _Goal:_ Backlog-tier movement is an inverse pair with the Class ratchet enforced — `promote` never carries a
  `[TBD]` into `planned/`, `demote` keeps the realized Class.

- _Note:_ Both slug-required (you're not "in" a backlog stub); bare → list that tier's stubs. Replaces the
  `graduate → promote` rename and adds the missing `demote` inverse.

    - Build `test-first` (one behavior at a time):
        - `promote` (`provisional → planned`) rejects when `Class` is `[TBD]` (the Class gate).
        - `promote` relocates the stub to `backlog/planned/` when `Class` is resolved.
        - `demote` (`planned → provisional`) preserves `Class` (Class-sticky ratchet).

### `[ ]` **4.3 `park` / `resume` & the pointer-record**

- _Goal:_ A WU can be parked off the active set and resumed without losing its branch — `park@Active` preserves the
  pushed branch as the durable shelf and lands a blessed render-pointer on `main`; `resume` re-attaches.

- _Note:_ The pointer-record is ADR-022's record/projection model proven on one bounded state — see spec §6 for the
  render shape. Its meta `State` is the literal **`Active`** (resolver-valid); `parked` is _derived_ from the
  `backlog/planned/` location, never stored (a literal "Active (parked)" would fail `validateState` → break
  resolution). The pointer opens with a derived-state callout (parked + authoritative branch + park reason). `park`
  is **context-defaulting** (slug optional → the current worktree's WU) and requires two `inputs`: commitment + a
  free-form **`reason`** (`--reason`, non-TTY-safe), rendered in the callout. Park guard: reject park-from-Integrating
  (withdraw via `reopen` first).
  _Notes:_ See `notes-lifecycle-transition-core.md` § Verb CLI shape & bare invocation.

    - Build `test-first` (one behavior at a time):
        - `park@Planning` tears down the branch (no code yet) and relocates artifacts to `backlog/planned/` →
          resolves `planned`.
        - `park@Active` preserves the branch, tears down only the worktree, relocates artifacts → resolves
          `parked`.
        - `park@Active` writes the pointer-record on `main` — meta `State: Active` (parked derived from location),
          `Branch`, render fields, opened by the derived-state callout carrying the `reason`.
        - `park` requires a `reason`; bare invocation without `--reason` errors with usage.
        - `resume` re-attaches the preserved branch (≈ the Materialize mechanic) and relocates back to `active/`.
        - `park` from `Integrating` is rejected.

### `[ ]` **4.4 `reopen`**

- _Goal:_ An `Integrating` WU can be withdrawn back to `Active` for more work — the genuinely-missing inverse of
  `integrate`.

- _Note:_ Context-defaulting (slug optional → the current Integrating WU). PR-withdrawal default (close vs.
  convert-to-draft) and any `--keep-pr` toggle are settled against the `gh` surface at execution; they don't affect
  the state model. The PR op is a net-new gh side-effect (see preamble), not a bundle leg.

    - Build `test-first` (one behavior at a time):
        - `reopen` (`Integrating → Active`) is a `set-phase`-only move — no location move, no branch rotation.
        - Withdraws the PR (close, or convert-to-draft per `inputs`).

### `[ ]` **4.5 `deactivate`**

- _Goal:_ `deactivate` stays the narrow "undo a premature activation," with the merged corner (Case C) reverting
  the merge and restoring to Planning rather than deleting.

- _Note:_ Context-defaulting (slug optional → the current WU). Case C shares the PR-revert mechanic with `abandon`
  Case D but differs by target (restore vs. delete). Shelving in-progress work is `park@Active`; destructive teardown
  is `abandon`. Case C is a merge-reverting cascade → it carries the impact-plan + `--yes` gate (§ Abandon &
  post-merge safety gate); the narrow non-merged `deactivate` does not.

    - Build `test-first` (one behavior at a time):
        - `deactivate` (`Active → Planning`) reverses a premature activation (recoverable phase↓).
        - `deactivate`@merged (Case C): prints the impact plan, requires `--yes`, then reverts the merge on base and
          restores to Planning (location `planned`, phase `Planning`).

### `[ ]` **4.6 `abandon`**

- _Goal:_ `abandon` removes a WU from any state — the destructive inverse of `stub` — leaving no residue, so the
  resolver returns `nonexistent`.

- _Note:_ Slug-required (safety — never default-to-current). Both cells are destructive cascades → impact plan +
  `--yes` gate (§ Abandon & post-merge safety gate). PR-revert + branch-delete are net-new gh/git ops (see preamble).

    - Build `test-first` (one behavior at a time):
        - Bare `arc abandon <slug>` prints the impact plan and refuses without `--yes`; `--yes` proceeds.
        - Pre-merge: delete branch (local + remote), worktree, artifacts, user-workspace, and the ROADMAP row.
        - Post-merge (Case D): revert the merge on base (PR-revert), then remove residue; net target deleted.
        - `abandon` of the current WU triggers execution-locus relocation before worktree teardown.
        - Direct `integrating → abandon` is rejected (route via `reopen` first).

### `[ ]` **4.7 `activate` dep-edge discharge write**

- _Goal:_ Activating a WU discharges its satisfied `Depends On` edges — the write half of dep-edge lifecycle — so a
  dependent never reads a satisfied dependency as still-blocking.

- _Note:_ `resolveDepStates` returns per-edge `landed` (shipped/merged only — `false` while integrating), so the
  discharge composes the readiness verdict `landed || resolveSlugState(dep) === "integrating"` (the
  team-review-latency case); it never redefines the resolver's `shipped?`. Wired at the `activate` edge.

    - Build `test-first` (one behavior at a time):
        - On `activate`, each `Depends On` edge whose dependency is shipped OR integrating is marked discharged.
        - An edge whose dependency is only planning/active stays live.

## **Phase 5:** `start` dispatch & the planning-entry gate

_Purpose:_ Make `arc start` a safe full-lifecycle dispatch routing on resolved state, and add the mechanical
planning-entry preflight that resolves write-context before `draft-design` runs — the two entry surfaces that
share `resolveWriteContext`.

### `[ ]` **5.1 `start` full lifecycle-state dispatch**

- _Goal:_ `arc start <name>` routes on the resolver's resolved state and refuses an occupied worktree — never
  mis-scaffolding an existing stub.

- _Note:_ Extends `handlers/start.ts` (today create-new + `--here` cold-start only) to full dispatch; wires the two
  guards from 3.2. The create-new and cold-start arms **recompose on the bundle legs** (the Finding-D decomposition
  of `spawnWorktree`), not the old coarse primitive. `start` stays mode-invariant — branch-cut timing is owned by the
  planning-entry gate (5.3). `start [name]` keeps its optional-name shape (create-new needs a name; bare cold-start
  derives from branch). Dispatch route: `nonexistent` → create-new · `provisional`/`planned` → graduate (`init` Path
  A, resolve Class) · `parked` → resume · `active` → error (occupied) · `integrating` → route via the Integrating
  edges (`reopen`) · `shipped` → offer a new WU with an origin-link.
  _Notes:_ See `notes-lifecycle-transition-core.md` § `spawnWorktree` decomposition map (recomposition).

    - Build `test-first` (one behavior at a time):
        - Dispatches to the correct arm for each resolved state.
        - Name-collision against an existing stub routes to graduate (never mis-scaffolds).
        - Worktree-occupancy rejects a second active WU in one worktree.
        - E2E: `start` dispatch across resolved states and both foot-gun guards against real worktrees.

### `[ ]` **5.2 `start --from <draft>` adopt edge**

- _Goal:_ A pre-authored draft with no branch can be adopted into a WU — `start --from <draft>` cuts `plan/<name>`
  and relocates the draft into `active/`.

- _Note:_ A new entry edge neither create-new nor `init` Path A handled (the draft-first path).

    - Build `test-first` (one behavior at a time):
        - `start --from <draft>` with no existing branch cuts `plan/<name>` and relocates the draft to `active/`.
        - Reuses the existing `--from` resolution (issue → Origin, spec/draft artifact → Design).

### `[ ]` **5.3 Planning-entry write-context gate in `arc-plan`**

- _Goal:_ `arc-plan` resolves write-context mechanically before `draft-design` runs and routes — so a draft never
  lands on `main` where it can't be committed.

- _Note:_ Shares `resolveWriteContext` + the start-new path with `out-of-wu-entry` (agile-parallelism) — a distinct
  concern; sequence, don't merge. Whoever touches `resolveWriteContext` / the start-new path second rebases.

    - `[ ]` **5.3.a Extend `resolveWriteContext`** for the planning-entry inputs (branch context × protection ×
      draft-presence/location × active-WU) in `lib/git/write-context.ts`. Reuses the shipped `classifyWriteContext`
      branch-vs-base core (`proceed` / `relocate` / `refuse`) but **layers net-new planning routing** on top — not a
      one-param add.

    - `[ ]` **5.3.b Route the three outcomes** — committable → proceed; not-committable → start-now (`start` /
      `init`) or defer (classify → errand or `stub`); pre-authored draft with no branch → adopt (`start --from`).
        - Build `test-first`: each route resolves correctly across the input combinations.

    - `[ ]` **5.3.c Surface the route decision** to `arc-plan` for the developer to confirm — mechanic in the CLI,
      the route decision in the workflow.

## **Phase 6:** Terminal sweep, read relocation & workflow re-pointing

_Purpose:_ Migrate the deterministic terminal mechanics into the executor, move the slug→state read into its verb
family, and re-point the existing markdown ceremonies to call the executor rather than re-author relocation inline
— leaving the lifecycle corpus locally consistent (the cross-cutting verb-rename sweep is `lifecycle-closeout`'s).

### `[ ]` **6.1 `archive` sweep + dated-path computation in the executor**

- _Goal:_ The archive relocation and its dated/numbered destination are computed and executed by the executor —
  pure deterministic mechanics, no longer hand-run in the workflow.

- _Note:_ Corrects the draft's earlier "no-go" framing. Judgment (merge approval, archival timing) stays in the
  `integrate-work-unit` / `archive` workflow. The path computation is net-new but reuses `completed-index.ts`'s
  `NN_<slug>` parsing + quarter scan to find the next sequence number; the quarter comes from the current date via
  an **injected clock** (testable, three-layer).

    - Build `test-first` (one behavior at a time):
        - Computes `completed/{YYYY-qN}/{NN}_{name}/` deterministically (quarter from injected clock + next `NN`
          from the quarter scan).
        - `archive` (`Active` / `Integrating → completed`) relocates the artifact set to the computed path via
          `relocate-artifacts`.

### `[ ]` **6.2 Cohort-doc archival sweep**

- _Goal:_ When the last cohort member ships, its coordinating `cohort-*.md` is swept to `completed/` in the same
  archive — the cohort doc never lingers in `backlog/` after its members are gone.

- _Note:_ Detection is the resolver's (`isArchivalTriggered` in `lifecycle-membership.ts`); the executor consumes
  the predicate and performs the `git mv` — it never re-derives membership. Destination uses the **`NNa_cohort-<slug>`**
  closeout dir shape (already recognized + WU-index-excluded by `completed-index.ts`), not a regular `NN_<slug>`.

    - Build `test-first` (one behavior at a time):
        - Fires only when `isArchivalTriggered` is true (non-empty cohort, no member outside `completed/`).
        - `git mv`s `cohort-<name>.md` to `completed/` when triggered.
        - Does not fire while any member remains outside `completed/`.

### `[ ]` **6.3 Slug→state read surface + installation-handler rename**

- _Goal:_ The slug→state read is `arc status <slug>` (bare `arc status` = session/active view; a slug = that WU's
  lifecycle state), preserving the shipped JSON shape, with the pure aggregator left in place.

- _Note:_ Only the thin CLI shell changes; `resolveSlugQuery` (`lib/work-unit/lifecycle-query.ts`) is the durable
  artifact and stays put. No `arc lifecycle` namespace — the verbs are top-level (peers of `start`); the read's
  home is `status`. Coordinate verb naming with `idiomatic-alignment`.
  _Notes:_ See `notes-lifecycle-transition-core.md` § Command surface.

    - `[ ]` **6.3.a Move `--lifecycle` to a `status <slug>` positional** — the `cli.ts` option becomes a positional;
      `handlers/status.ts` dispatches to `resolveSlugQuery` when a slug is given, else the session view.
        - Build `test-first`: `arc status <slug>` returns the shape previously served by `arc status --lifecycle`;
          bare `arc status` is unchanged.

    - `[ ]` **6.3.b Rename the installation handler** — `handlers/lifecycle.ts` → `handlers/installation.ts`
      (`update` / `health` / `diff`) + update the `cli.ts` import, freeing `handlers/lifecycle.ts` for the
      WU-transition verb handlers.

### `[ ]` **6.4 Re-point existing workflows to the executor**

- _Goal:_ The existing ceremonies call the executor instead of re-authoring relocation/branch logic inline — ending
  the per-workflow duplication, with each workflow's local docs updated to match.

- _Note:_ Re-pointing only — no new transition logic; the workflows shrink to judgment + an executor call. Existing
  integration/E2E coverage exercises the re-pointed paths (not test-first — markdown + wiring edits).

    - `[ ]` **6.4.a `init-work-unit` Path A** → call the graduate transition (relocate + `reconcile-branch`).

    - `[ ]` **6.4.b `decompose-work-unit` park-exit** → call the teardown legs (`reconcile-branch` /
      `reconcile-worktree`); the full decompose matrix rewrite is the sibling `decompose-matrix` member's, not
      this WU's.

    - `[ ]` **6.4.c `archive-work-unit`** → call the archive sweep (6.1) + cohort sweep (6.2).

    - `[ ]` **6.4.d `activate-work-unit` / `deactivate-work-unit`** → call the activate/deactivate transitions
      (`activate` fires the dep-edge discharge, 4.7).

    - `[ ]` **6.4.e Local doc updates** — per-member workflow/strategy edits that ride this code; the cross-cutting
      verb-rename sweep is deferred to `lifecycle-closeout`.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` A single declarative transition table in `lib/` is the authoritative source of states, legal edges,
  inverses, guard requirements, and per-transition encoding updates — no relocation logic re-authored in a workflow

- `[ ]` Table-walking tests pass and fail correctly: totality, inverse round-trip, and encoding-consistency for
  every edge

- `[ ]` The 1↔1 mutator bundle is the sole relocation primitive, called by every location-moving transition

- `[ ]` `arc start <name>` dispatches correctly across all resolved states and is provably guarded (name-collision
  routes to graduate; worktree-occupancy rejects a second active WU)

- `[ ]` The full inverse-paired verb set ships: `promote`/`demote`, `park`/`resume`, `reopen`, `abandon` (split
  from `deactivate`), each executor-dispatched

- `[ ]` `park@Active` preserves the branch and lands the blessed pointer-record on `main`; resume re-attaches

- `[ ]` `abandon` (pre- and post-merge Case D) and `deactivate`@merged (Case C) execute their per-cell mechanics,
  including execution-locus relocation

- `[ ]` The `archive` sweep + dated-path computation run from the executor, and the cohort-doc sweep fires on
  `isArchivalTriggered`

- `[ ]` The `stub` contract rejects creation without explicit commitment + priority

- `[ ]` The planning-entry write-context gate routes `arc-plan` correctly across its three routes, including the
  pre-authored-draft adopt edge

- `[ ]` `arc status <slug>` serves the slug→state read with the JSON shape preserved (from the interim
  `arc status --lifecycle`)

- `[ ]` Each transition applies its `softFields` disposition (`reset` / `input` / `leave`) so `Next Task` /
  `Next Action` / `Last Completed` stay consistent post-transition (executor writes resets + supplied inputs, never
  deriving/authoring), and emits an ephemeral, never-persisted next-step suggestion

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

---

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
