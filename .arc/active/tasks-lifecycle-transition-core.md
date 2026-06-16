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

### `[x]` **2.4 `set-phase` mutator**

- _Goal:_ The meta `State` field is the single write point for a phase-axis move — no location change, no branch
  touch.

- _Outcome:_ New `lib/work-unit/mutators/set-phase.ts` — `setPhase` validates the target via `validateState`
  (rejects an unknown phase before any read/write), then reads the meta, rewrites only the core-block `State` cell,
  and writes it back; read/write fs seams injected. The in-place rewrite is a net-new `setMetaState` export in
  `meta-reader.ts` (neither the read-only reader nor full-fresh `renderMetaFile` fit) that re-renders only the
  three core-table rows via the shared `renderCoreTable` — preserving alignment and leaving every other field,
  bullet, and narrative section byte-identical. Three mutator tests (write-and-preserve, unknown-phase reject,
  no-table throw); `meta-reader` suite stays green (71).

### `[x]` **2.5 Transition side-effects**

- _Goal:_ The broad transition side-effects — readiness-view regen on every location move, and user-workspace
  open/close across the WU-touching verbs — are declared effects the executor fires by id, not inline ceremony.

    - `[x]` **2.5.a Readiness-view regen** — `reconcile-roadmap` / `reconcile-status-user` in
      `lib/work-unit/side-effects/readiness-regen.ts`.
        - `reconcileStatusUser` composes via an injected `composeView` seam (executor binds the shipped
          `runStatusUserView`, local-only) and writes `STATUS.USER.md` under `.arc/user/{identity}/`
          (ensures the dir, single trailing newline); a null identity skips. The side-effect owns the write, not
          the status subsystem's git surface.
        - `reconcileRoadmap` returns a precise advisory naming the WU + its `from → to` (`phase/location`, or
          `nonexistent` for a creation/deletion endpoint), flagging a hand-render until `roadmap-tooling` ships the
          renderer — no format / bucket / Parked-label commitment.

    - `[x]` **2.5.b User-workspace satellite** — `userWorkspace` in
      `lib/work-unit/side-effects/user-workspace.ts`.
        - Dispatches an `open` / `close` op (direction decided per-edge by the executor) to the injected
          non-interactive `runUserOpen` / `runUserClose` seams — never the interactive `handleUserOpen` handler
          (TTY-blocking, destructive default; owned by `cli-substrate-adoption`). A null identity skips
          (workspace is identity-scoped). Three tests cover open, close, and the skip.

## **Phase 3:** The thin executor & foot-gun guards

_Purpose:_ The imperative shell that drives the table — resolve current state, look up the legal edge, validate
guards, fire the mutator bundle, fire side-effects — and the two guards that close the live foot-guns. The
executor never decides and never fabricates judgment values; it requires them supplied as `inputs`.

### `[x]` **3.1 `executeTransition` dispatch**

- _Goal:_ A transition is a table lookup plus mechanical application — `executeTransition(verb, slug, inputs)`
  resolves state, validates, mutates, and fires side-effects, with no bespoke per-verb code.

- _Outcome:_ `executeTransition` (`lib/work-unit/lifecycle-executor.ts`) is a verb-agnostic engine: build index →
  resolve → edge lookup → guard validation → encoding legs in the canonical `setPhase → artifacts → worktree →
  branch` order (worktree teardown precedes branch delete) → side-effects → soft-field disposition → ephemeral
  suggestion. The four mutators, side-effect handlers, guard validators, and a new in-place soft-field writer
  `setMetaBulletFields` (`meta-reader.ts`, the bullet-field complement of `setMetaState`) reach it as injected
  seams; the single direct fs touch is `buildLifecycleIndex` at entry. Per-verb operands + judgment values arrive
  as the enumerated `TransitionInputs` schema and are _required_, never fabricated (a missing input rejects).
  Rejections (illegal/guard/missing-input) and a mid-bundle leg failure surface as a discriminated
  `TransitionOutcome` carrying what landed — never silently half-applied. Wiring completeness (required operands,
  side-effect handlers, `input`-disposed soft values) is validated before any mutation; Phase-4 verbs register
  their side-effect handlers + `scaffold`/`remove` artifact runner.

### `[x]` **3.2 Foot-gun guard predicates**

- _Goal:_ The two live foot-guns become guard rejections — an existing stub is never mis-scaffolded, and a second
  active WU in one worktree is refused.

- _Outcome:_ `lib/work-unit/lifecycle-guards.ts` ships both predicates, resolved from meta + location (never
  `git branch` inference): `hasNameCollision(index, slug)` — the signal `start` dispatch reads to
  graduate-not-scaffold — wired as the create-new edge's `name-collision` guard, and
  `makeWorktreeOccupancyGuard({ cwd, readActiveMetaCandidates })`, which composes the lite/full-aware active-meta
  reader with `deriveState` and rejects a _different_ work unit occupying the worktree (`planning` / `active` /
  `integrating`) on another branch. `buildFootgunGuards` assembles both into the `guardValidators` map the executor
  merges over its pure defaults; `worktree-occupancy` is now declared on all four `start` edges. Since the
  executor's state resolution already routes an existing slug to its graduate edge, the `name-collision` guard is
  the defensive floor — a forced create-new over a live name is refused. Both verified through `executeTransition`'s
  guard phase, before any mutation.

## **Phase 4:** The inverse-paired verb set

_Purpose:_ Ship every lifecycle verb as an executor-dispatched transition with its per-cell mechanics — closing
the asymmetry so every forward edge is owned and every inverse present. Each verb declares its table edge and
supplies its `inputs`; the executor and bundle do the work.

_Design decisions:_ Verb CLI shape (context-defaulting vs. slug-required; bare invocation = a **non-interactive**
candidate list, never a clack `select`) and the destructive-cascade safety gate (`abandon`: impact plan + `--yes`)
are cross-cutting across this phase — see `notes-lifecycle-transition-core.md` § Verb CLI shape & bare invocation,
§ Abandon safety gate. The only net-new PR/gh write mechanic is `reopen`'s PR withdrawal (no existing wrapper; the
`gh`-read pattern in `session-init/work-unit-pr-source.ts` is the model), hand-rolled now per the spec's
CSA-forward-compat note — there is **no merged-corner cell** to revert (ADR-026 amendment: post-merge rework is a
new origin-linked WU, so `deactivate` stays narrow and `abandon` is pre-merge only). Each verb supplies its
`softFields` `input` values (§14 — e.g. `activate` → the first task; `park` → the frozen pointer) and emits an
ephemeral next-step suggestion; the executor never derives or authors them.

### `[x]` **4.1 `stub` creation contract**

- _Goal:_ Every create path routes through one `stub` chokepoint that refuses creation without explicit commitment
  and priority — no silent `provisional` / `P3` default.

- _Outcome:_ `runStub` (`lib/work-unit/verbs/stub.ts`) is the enforcement front door — it rejects a creation missing
  commitment or priority (pure over its inputs, so the non-interactive case is the same rejection, never a default),
  then registers the `scaffold` artifact runner and dispatches through `executeTransition` to write the branchless
  `Planning` / `Branch: [none]` meta at `backlog/<tier>/<name>/`. Enforcement sits at the handler chokepoint, not a
  guard, because commitment must be resolved at dispatch — it selects which of the two `stub` edges fires — so
  `executeTransition` gained a verb-agnostic `selectEdge` that disambiguates a shared-`(verb, from)` edge set by the
  committed target `location` (serving any future multi-target verb). The user-facing `arc stub` command is deferred
  to the Phase-6 command-surface work.

### `[x]` **4.2 `promote` / `demote`**

- _Goal:_ Backlog-tier movement is an inverse pair with the Class ratchet enforced — `promote` never carries a
  `[TBD]` into `planned/`, `demote` keeps the realized Class.

- _Outcome:_ `runPromote` / `runDemote` (`lib/work-unit/verbs/promote-demote.ts`) dispatch the two content-preserving
  backlog-tier relocations through `executeTransition`. `promote` reads the source stub's realized `Class` from its
  meta and feeds it to the existing `class-resolved` guard, so a `[TBD]` stub is refused before any move; `demote` is
  the unguarded inverse, and the Class ratchet is sticky by construction — a content-preserving relocate carries the
  field down untouched (no soft-field rewrite). Both verbs take a full executor context (the relocate mutator is
  pre-bound); no executor change was needed beyond Task 4.1's. CLI surface (slug-required, bare → tier candidate
  list) is deferred to the Phase-6 command work.

### `[x]` **4.3 `park` / `resume` & the pointer-record**

- _Goal:_ A WU can be parked off the active set and resumed without losing its branch — `park@Active` preserves the
  pushed branch as the durable shelf and lands a blessed render-pointer on `main`; `resume` re-attaches.

- _Outcome:_ `runPark` / `runResume` (`lib/work-unit/verbs/park-resume.ts`) dispatch the location-axis pair through
  `executeTransition`, resolving park's phase-polymorphism from the source meta's `State`: `park@Planning` supplies a
  branch-delete op, `park@Active` omits the branch leg (preserve) and writes a pointer-record at the relocated meta.
  The pointer is a pure composer (`lib/work-unit/pointer-record.ts`, ADR-022's record/projection on one state) — a
  derived-state callout (parked notice + authoritative branch + `reason`) over a minimal meta whose `State` stays the
  literal `Active` (so `parked` derives from location and `parseMetaRecord` round-trips). `reason` is a required,
  never-fabricated input (mirrors `stub`); park-from-`Integrating` rejects via the table's marked-illegal cell. Two
  seams stay downstream: the cross-branch selectivity (commit only the pointer to the tracked branch, full artifacts
  on the preserved branch) is the park ceremony's, and `resume`'s checkout-existing re-attach is a `reconcile-worktree`
  `spawn` refinement — both noted at their call sites. CLI surface (`arc park` / `resume`) deferred to Phase 6.

### `[x]` **4.4 `reopen`**

- _Goal:_ An `Integrating` WU can be withdrawn back to `Active` for more work — the genuinely-missing inverse of
  `integrate`.

- _Outcome:_ `runReopen` (`lib/work-unit/verbs/reopen.ts`) dispatches the `set-phase`-only `Integrating → Active`
  flip through `executeTransition` — no location move, no branch rotation — forwarding the merge fact (the
  `pr-unmerged` guard input) and the withdrawal mode as inputs. The net-new PR-withdrawal `gh` side-effect ships as
  `lib/work-unit/side-effects/withdraw-pr.ts`: `close` (default → `gh pr close`) or `draft`
  (`gh pr ready --undo`), hand-rolled behind the injected executor per the read-side `gh` model. The `prWithdrawMode`
  input was added to the executor's `TransitionInputs` so the side-effect reads the mode at fire time. Merge-fact
  resolution (a `gh` read) and the handler's CLI binding are deferred to the Phase-6 command surface; the verb takes
  the fact as a supplied input (never fabricated).

### `[x]` **4.5 `deactivate`**

- _Goal:_ `deactivate` is the narrow "undo a premature activation" — a recoverable phase↓ (`Active → Planning`),
  the clean inverse of `activate`. No merged corner: post-merge rework is a new origin-linked WU.

- _Outcome:_ `runDeactivate` (`lib/work-unit/verbs/deactivate.ts`) reads the current working branch from the meta,
  derives the `plan/<name>` rotation target, and dispatches the phase-mover through `executeTransition` — the branch
  rename (`<type>/ → plan/`), the `Active → Planning` phase write, and the `Next Task` reset are the table's; the WU
  stays in `active/` (no location move). A non-`active` source falls to the table's illegal-edge lookup (only an
  `active` WU qualifies). Narrow by construction — no PR-revert, no `--yes` gate (the dropped merged corner;
  ADR-026 amendment). CLI surface deferred to Phase 6.

### `[x]` **4.6 `abandon`**

- _Goal:_ `abandon` removes a WU from any **pre-merge** state — the destructive inverse of `stub` — leaving no
  residue, so the resolver returns `nonexistent`.

- _Outcome:_ `runAbandon` (`lib/work-unit/verbs/abandon.ts`) resolves the source state from the lifecycle index and
  composes the per-cell cascade: a backlog stub (`provisional` / `planned`) is artifact-removal only; a started WU
  (`planning` / `active`) also deletes the branch and tears down the worktree (passing the current locus so the
  mutator's self-teardown hop fires); a `parked` WU deletes its preserved branch but tears down no worktree. The
  `confirmation` guard enforces the `--yes` refusal (the impact-plan print is the handler's, Phase 6); `integrating`
  and merged/`shipped` fall to the table's illegal-edge lookup. The verb registers a `remove` artifact runner that
  deletes the WU's own set by slug — reusing `relocate-artifacts`'s now-exported `artifactMatcher` (one definition of
  "a WU's artifact set") so a foreign `cohort-*.md` is never touched — and drops the emptied per-WU backlog subdir,
  never the shared flat `active/` tier. CLI surface deferred to Phase 6.

### `[x]` **4.7 `activate` dep-edge discharge write**

- _Goal:_ Activating a WU discharges its satisfied `Depends On` edges — the write half of dep-edge lifecycle — so a
  dependent never reads a satisfied dependency as still-blocking.

- _Outcome:_ The `discharge-dep-edges` side-effect (`lib/work-unit/side-effects/discharge-dep-edges.ts`) treats
  `Depends On` as the **live gate** and resolves satisfied edges off it at `activate`: per edge it composes the
  readiness verdict `landed || resolveSlugState(dep) === "integrating"` (the team-review-latency case) over the
  resolver's enum — never redefining `shipped?` — then rewrites the `Depends On` bullet to the live set only
  (`[none]` when all clear), leaving genuinely-blocking deps. **Representation decision** (confirmed against
  `operational-state-docs` § Dependency-edge lifecycle + `strategy-storage-evolution`): the gate is the single
  source of truth and discharge is removal — no mirrored lineage field (a second source of truth, YAGNI; "resolve"
  is not "destroy" — lineage lives in git history, the archive, and spec prose). This is the only representation
  compatible with both the OSD lean and arc-backend's "no new per-artifact booleans," and re-homes onto a record
  `dependsOn` array with zero reshape. The index + meta read/write are injected seams; the `SideEffectHandler`
  binding rides the `activate` verb/CLI (Phase 6).

## **Phase 5:** `start` dispatch & the planning-entry gate

_Purpose:_ Make `arc start` a safe full-lifecycle dispatch routing on resolved state, and add the mechanical
planning-entry preflight that resolves write-context before `draft-design` runs — the two entry surfaces that
share `resolveWriteContext`.

### `[x]` **5.1 `start` full lifecycle-state dispatch**

- _Goal:_ `arc start <name>` routes on the resolver's resolved state and refuses an occupied worktree — never
  mis-scaffolding an existing stub.

- _Outcome:_ `resolveStartDispatch` (`commands/start.ts`) routes a name on its resolved state — create-new,
  graduate, resume, or a directed refusal for the live/terminal states; `handlers/start.ts` dispatches and reports
  (`--here` stays the orthogonal cold-start arm). The graduate/resume arms run through the first production executor
  binder (`lib/work-unit/executor-context.ts`, `buildExecutorContext`) — the four mutators, the foot-gun guards, and
  the render + user-workspace side-effects closed over real git/fs. create-new and cold-start recompose on the bundle
  legs (`reconcile-worktree.spawn` + `scaffoldIntoWorktree`), retiring the coarse `spawnWorktree`. The two foot-gun
  guards gate the spawning arms (name-collision routes an existing stub to graduate; worktree-occupancy rejects a
  second active WU). `reconcile-status-user` ships an interim advisory (real local render deferred to 5.4 — the
  renderer is shipped, so it must build for real before ship). Covered by unit (dispatch, graduate, recomposition),
  handler, and a real-worktree integration suite. See `notes-lifecycle-transition-core.md` § `start` arm wiring for
  the executor-vs-direct-recompose split.

### `[~]` **5.2 `start --from <draft>` adopt edge** — retired

- _Outcome:_ Retired — the draft-first path unifies on the shipped `stub` → draft → `graduate` chain, so there is
  no bespoke adopt edge to build. A draft is always meta-bearing (no meta-less / branchless-but-recordless state):
  `stub` (Task 4.1) mints the record, then `graduate` (Task 5.1) relocates the full artifact set (meta + draft)
  and cuts the branch. See `spec-lifecycle-transition-core.md` §12 (Branchless ≠ recordless); the corpus-wide doc
  reconciliation of the position routes to `lifecycle-closeout`.

### `[x]` **5.3 Planning-entry write-context gate in `arc-plan`**

- _Goal:_ `arc-plan` resolves write-context mechanically before `draft-design` runs and routes — so a draft never
  lands on `main` where it can't be committed.

    - `[x]` **5.3.a Extend `resolveWriteContext`** for the planning-entry inputs (branch context × protection ×
      draft-presence/location × active-WU) in `lib/git/write-context.ts`.
        - `classifyPlanningEntry` is the new pure layer over the shipped `classifyWriteContext` branch-vs-base
          core: it takes the core verdict plus `protection` / `onPlanningBranch` / `draftPresent` /
          `activeWorkUnit` and returns `proceed` | `redirect{reason, facts}` — net-new planning routing, not a
          one-param add.

    - `[x]` **5.3.b Route via the two-layer gate** — layer 1: committable → proceed (the write-context verdict);
      layer 2: not-committable → start-now (`start` / `init`), `stub`, or errand by WU-worthiness. Draft-presence
      parameterizes the `stub` leg (fold the draft in, then graduate — no adopt edge), not the leg selection.
        - Committability is mode-shaped: `partial` keys on the base branch, `full` on an active `Planning` WU's
          planning branch. The CLI resolves layer 1 and carries the layer-2 facts; it never picks the leg
          (WU-worthiness stays the workflow's judgment). Covered by the `classifyPlanningEntry` unit matrix.

    - `[x]` **5.3.c Surface the route decision** to `arc-plan` for the developer to confirm — mechanic in the CLI,
      the route decision in the workflow.
        - New `arc plan check [--name <slug>] --json` command (`handlers/plan.ts`) resolves the live inputs and
          emits the route; `draft-design.md`'s new "Planning-entry gate" section calls it and surfaces
          start / stub / errand on `redirect`. E2E in `plan.e2e.test.ts`.

- _Outcome:_ The planning-entry gate ships end to end: a pure two-layer classifier (`classifyPlanningEntry`), the
  `arc plan check` CLI surface resolving protection / active-WU / draft-presence and emitting the route as JSON
  (with an exit-1 human guard), and the `draft-design` workflow wiring — mirroring the `arc errand check` /
  `arc housekeep check` write-context-gate pattern. The `resolveWriteContext` / start-new path stays a rebase seam
  with `out-of-wu-entry`; final verb naming coordinates with `idiomatic-alignment`.

### `[x]` **5.4 Wire the executor binder's `reconcile-status-user` to the real local render**

- _Goal:_ The production executor binder regenerates `STATUS.USER.md` for real on a location move — the shipped
  `runStatusUserView` in local-only mode — replacing the interim advisory Task 5.1 stands it up with.

- _Outcome:_ Extracted the `arc status --user` render assembly into `assembleStatusUserView`
  (`lib/status/assemble-user-view.ts`) — the single seam-binding source now shared by `handlers/status.ts` and the
  executor binder, so the rendered view can't fork. The binder's `reconcile-status-user` renders for real (local-only)
  and writes `STATUS.USER.md` via the new `reconcileStatusUserSideEffect` wrapper, which degrades to an advisory
  instead of failing the transition when the render or write throws. `buildExecutorContext` gains a `teamMode` dep
  (threaded from `start`'s spawn config) for the in-flight oracle's identity filter.

## **Phase 5.R:** Verb command surface

_Purpose:_ Surface the Phase-4 lifecycle verbs as user-facing CLI commands — the command layer for the verb set
whose logic, executor dispatch, and guards already exist (Phase 3–4). This phase is the handlers, the registration,
and the CLI shape; no new transition logic. Sequenced before Phase 6 because the workflow re-pointing (6.5) re-points
ceremonies onto these commands, so they must exist first.

_Design decisions:_ The verb CLI shape (context-defaulting vs. slug-required; bare invocation = a **non-interactive**
candidate list, never a clack `select`) and the `abandon` destructive-cascade gate (impact plan + `--yes`) are
specified in `notes-lifecycle-transition-core.md` § Verb CLI shape & bare invocation and § Abandon safety gate. Verbs
land **top-level** (peers of `arc start`), no `arc lifecycle` namespace (§13). Final verb naming coordinates with
`idiomatic-alignment`.

### `[x]` **5.R.1 Installation-handler rename**

- _Goal:_ Free `handlers/lifecycle.ts` for the WU-transition verb handlers by relocating the installation handlers to
  their own precise home — `handlers/lifecycle.ts` → `handlers/installation.ts` (`update` / `health` / `diff`), with
  the one `cli.ts` import updated.

### `[x]` **5.R.2 Verb-handler scaffold & shared CLI shape**

- _Goal:_ A shared dispatch shape in the freed `handlers/lifecycle.ts` so each verb handler is a thin, consistent
  binding over `executeTransition` — context-defaulting where a current-WU default is safe, slug-required where it is
  not.

    - `[x]` **5.R.2.a Context-defaulting vs. slug-required dispatch** — `DISPATCH_MODE` + `selectVerbTarget`: an
      explicit slug always wins; context verbs (`park` / `reopen` / `archive` / `activate` / `deactivate`) fall back to
      the current worktree's WU (single active meta via `readActiveMetaCandidates`); slug-required verbs (`resume` /
      `promote` / `demote` / `abandon`) never default.

    - `[x]` **5.R.2.b Bare-invocation candidate-list helper** — `validFromStates` reads each verb's legal from-states
      off the transition table; `findVerbCandidates` lists matching slugs from the lifecycle index;
      `formatVerbCandidates` renders the one-line, state-grouped surface + usage. The handler binding prints it via
      `p.log.error` + non-zero exit — non-interactive, never a clack `select`.

- _Outcome:_ Split into a pure dispatch core (`lib/work-unit/verbs/dispatch.ts` — mode table, target selection,
  candidate derivation + formatting) and a thin CLI binding (`handlers/lifecycle.ts` — `resolveVerbTargetOrReport`,
  the shared opening each Phase-5.R verb handler calls to get its target slug or surface the candidate list and bail).

### `[x]` **5.R.3 Register the non-destructive verb commands**

- _Goal:_ `stub` / `promote` / `demote` / `park` / `resume` / `deactivate` / `activate` are registered top-level
  commands, each binding its `run*` transition with the §14 soft-field and side-effect `inputs` supplied.

- _Note:_ Split into a foundational increment (5.R.3.a — the missing `activate` verb infra) and the command-surface
  increment (5.R.3.b). Discovered at task entry: no `runActivate` exists — Phase 4's 4.7 built only the
  `discharge-dep-edges` side-effect logic and deferred the verb + its binding here (its outcome: "the
  `SideEffectHandler` binding rides the `activate` verb/CLI"). The `reconcile-status-user` / `reconcile-roadmap` regen
  on location-movers is already bound in `buildExecutorContext` (5.4). Each command surfaces the verb's required
  `inputs` (e.g. `park --reason`, `stub`'s commitment + priority) — never fabricated, refused when absent. (`abandon`
  / `reopen` carry extra gates — their own tasks below; `archive`'s command rides its executor work in 6.1.)

    - `[x]` **5.R.3.a `runActivate` verb & `discharge-dep-edges` binding** — `runActivate` co-located with
      `runDeactivate` in `verbs/activate-deactivate.ts` (the inverse pair, matching `park-resume` / `promote-demote`):
      rotates `plan/<name>` → the caller-supplied working branch, `setPhase` → `Active`, writes the `Next Task` /
      `Next Action` inputs, and fires `discharge-dep-edges`. The deferred `discharge-dep-edges` `SideEffectHandler` is
      now bound in `buildExecutorContext` (fresh index → `dischargeDepEdges` for the activated WU → discharge-count
      advisory) — closing the Phase-4 `activate` gap.

    - `[x]` **5.R.3.b Register the verb commands** — 7 top-level handlers in `handlers/lifecycle.ts` (thin bindings
      over the 5.R.2 dispatch scaffold + each `run*`) plus `cli.ts` registration, all with an optional positional so a
      bare invocation reaches the candidate-list surface. Required `inputs` are refused when absent: `stub`
      `--commitment` / `--priority`, `park` `--reason`, `activate` `--type` / `--task` / `--action` (the working branch
      composed `<type>/<slug>`).

### `[x]` **5.R.4 `abandon` command — destructive-cascade gate**

- _Goal:_ `arc abandon <slug>` presents the impact plan and refuses without explicit `--yes` — the safe-by-default
  destructive gate (§7, DEV-RULES.ARC § Cascade-undo).

- _Outcome:_ Added `handleAbandon` + the `abandon [slug]` registration (`handlers/lifecycle.ts`, `cli.ts`) over a new
  pure `planAbandon` impact-plan composer (`verbs/abandon.ts`) — it resolves the from-state, prints the per-cell
  cascade (artifacts always; branch on planning/active/parked; worktree on planning/active; workspace + ROADMAP), and
  refuses without `--yes`; an illegal source (`integrating` / merged) is refused outright with no plan. The
  `runAbandon` cascade and `confirmation` guard already existed from Phase 4, so this is the command / judgment layer
  only — `planAbandon` shares the verb's existing teardown-state sets so the plan can't drift from the actual cascade.

### `[x]` **5.R.5 `reopen` command — merge-fact read**

- _Goal:_ `arc reopen [<slug>]` withdraws an `Integrating` WU to `Active`, resolving the merge fact and forwarding the
  withdrawal mode — the CLI binding for the 4.4 transition.

- _Note:_ Split a/b (foundational `withdraw-pr` binding, then the command surface) — the `reopen` edge's `withdraw-pr`
  side-effect was still declared-but-unbound in `buildExecutorContext`, the same deferral `discharge-dep-edges` carried
  before 5.R.3.a.

    - `[x]` **5.R.5.a `withdraw-pr` executor binding** — registered the `withdraw-pr` `SideEffectHandler` in
      `buildExecutorContext`: it reads the WU's `Branch` from its active meta, calls `withdrawPr` with
      `inputs.prWithdrawMode` (`close` default / `draft`), and degrades to an advisory (never throws) when the `gh`
      op fails — so the already-applied `Integrating → Active` flip isn't left mid-transition. A missing branch
      surfaces an advisory without calling `gh`. Closes the gap `discharge-dep-edges` left open (the last deferred
      side-effect binding).

    - `[x]` **5.R.5.b `reopen` command** — `handleReopen` (context-defaulting, defaults to the current WU) resolves
      the `pr-unmerged` guard input via `createGhWorkUnitPrSource` (the read-side `gh` model), degrading the merge
      fact to unknown when the branch is unresolved or `gh` / the remote is unavailable so the reopen proceeds; a
      positively-merged PR drives the guard's refusal. Withdrawal mode (`close` default / `--keep-pr` → `draft`) is
      forwarded to `runReopen`; registered `arc reopen [slug]` in `cli.ts`.

### `[x]` **5.R.6 Re-point `draft-design`'s stub leg**

- _Goal:_ With `arc stub` now shipped (5.R.3), the planning-entry gate's redirect surface names the concrete command
  instead of the generic stub action.

- _Outcome:_ The `draft-design.md` Planning-entry-gate stub leg now names `arc stub <name>` with its
  `--commitment provisional|planned` / `--priority` inputs (mirroring the `arc start <name>` start-now leg above
  it), in both the package source and `.arc/` copies. Markdown + package-sync only.

## **Phase 6:** Terminal sweep, read relocation & workflow re-pointing

_Purpose:_ Migrate the deterministic terminal mechanics into the executor, move the slug→state read into its verb
family, add the in-place (`--here`) opt-out the re-point depends on, and re-point the existing markdown ceremonies
to call the executor rather than re-author relocation inline — leaving the lifecycle corpus locally consistent (the
cross-cutting verb-rename sweep is `lifecycle-closeout`'s).

### `[x]` **6.1 `archive` sweep + dated-path computation in the executor**

- _Goal:_ The archive relocation and its dated/numbered destination are computed and executed by the executor —
  pure deterministic mechanics, no longer hand-run in the workflow.

- _Outcome:_ `computeArchiveDestination` added to `completed-index.ts` (now the read- and write-side owner of the
  `completed/` layout): quarter from an injected `Clock`, next `NN` from a scan of that quarter that also counts the
  shared number of `NNa_cohort-*` sidecars, resetting per quarter. The thin `archive` verb (`verbs/archive.ts`)
  computes the destination and dispatches the edge's full encoding through the executor — `relocate` to the dated
  path, branch delete, worktree teardown, `State → Shipped`, soft-field reset. `arc archive [slug]`
  (context-defaulting) bound via `handleArchive`. Self-teardown of the current primary worktree is wired but left to
  the integration context that re-points the ceremony (6.5c).

### `[x]` **6.2 Cohort-doc archival sweep**

- _Goal:_ When the last cohort member ships, its coordinating `cohort-*.md` is swept to `completed/` in the same
  archive — the cohort doc never lingers in `backlog/` after its members are gone.

- _Outcome:_ `sweepCohortDoc` (in `verbs/archive.ts`) runs after the member relocate: `runArchive` rebuilds the
  index over the post-move tree and the sweep gates on the resolver's `isArchivalTriggered` (consumed, never
  re-derived). When triggered, it `git mv`s `cohort-<leaf>.md` into the `{NN}a_cohort-<leaf>` sidecar — sharing the
  final member's `NN` from the same `destination` — reusing `relocate-artifacts` with the cohort leaf as the match
  key. Standalone WUs, `[none]`, and cohorts with members still in flight are no-ops; the swept path surfaces on
  `ArchiveResult.cohortSwept` and in the `arc archive` report. Single-cohort scope; the nested-parent `{NN}b`
  cascade is left for the closeout member's audit.

### `[x]` **6.3 Slug→state read surface**

- _Goal:_ The slug→state read is `arc status <slug>` (bare `arc status` = session/active view; a slug = that WU's
  lifecycle state), preserving the shipped JSON shape, with the pure aggregator left in place.

- _Outcome:_ The `--lifecycle <slug>` option on `arc status` became a `[slug]` positional (`cli.ts`); `handleStatus`
  (`handlers/status.ts`) now takes the slug as its first argument, folds it into the mutual-exclusion check against
  `--session-init` / `--session-handoff` / `--user`, and dispatches to `resolveSlugQuery` when present (JSON shape
  unchanged) else the composite session view. `resolveSlugQuery` stayed put. The `status-lifecycle` e2e now drives
  `status <slug>` and adds a bare-`arc status` assertion (no top-level `slug` key — the positional left it
  untouched).

### `[ ]` **6.4 In-place (`--here`) opt-out for `graduate` / `resume`**

- _Goal:_ The begin-work transitions accept a `--here` flag to execute in the current checkout without spawning a
  worktree (spawn stays the default), so single-checkout / heavy-toolchain WU development re-points to the executor
  rather than the inline `git mv` Success Criterion 1 forbids.

- _Note:_ Locus-only — branch, `(phase, location)` record, and notes-sync are identical to the spawn path
  (cross-machine coherence unaffected; in-place sidesteps the `location_template` path-portability wrinkle). The
  atomic in-place case stays **errands'**; this is WU-grade. Honors the worktree-occupancy guard (refuse a checkout
  already holding an active WU). Spawn-vs-in-place is orthogonal to protection mode. See
  `spec-lifecycle-transition-core.md` §5 (in-place opt-out) + §4 (reconcile-branch create realizations). The
  Materialize cross-machine twin is downstream (captured for `finalize-parallelism`).

    - `[x]` **6.4.a `reconcile-branch` in-place create** — the `create` op now carries an optional
      `inPlace: { branch }` operand: present → a current-worktree `git checkout -b <branch>` (off HEAD); absent →
      inert spawn-backed path (the worktree-spawn `-b` owns the birth), as before. Operand-presence keys the
      realization, so the edge keeps declaring `reconcileBranch: "create"` on both paths and the executor's
      mutation-match check is untouched (no executor change). The 6.4.b/c in-place arms supply the `inPlace` branch.

    - `[x]` **6.4.b `graduate --here`** — the executor gained `TransitionInputs.inPlace`, which suppresses the
      `reconcile-worktree` *spawn* leg and waives its `worktreeOp` (the "reuse the legs minus the spawn" mechanism;
      reused by 6.4.c). `runGraduate`'s params became a spawn/in-place union — the in-place arm composes relocate +
      `branchOp.create{inPlace}` + `inPlace`, no `worktreeOp`. `handleStart` now routes `--here` *through* dispatch
      (create-new→cold-start, graduate→in-place) rather than short-circuiting to cold-start; the `--here` CLI help
      broadened to match. The shipped `worktree-occupancy` guard already rejects a checkout holding an active WU —
      reused unchanged. Integration test cuts `plan/<name>` in the current checkout (HEAD moves, no spawn).

    - `[ ]` **6.4.c `resume --here`** — the resume arm threads the no-spawn variant (re-attach the preserved branch
      in the current checkout); CLI `--here` flag; same occupancy guard.
      Build `test-first`: `arc resume <parked> --here` re-attaches in place (no spawn); bare `arc resume <parked>`
      still spawns.

### `[ ]` **6.5 Re-point existing workflows to the executor**

- _Goal:_ The existing ceremonies call the executor instead of re-authoring relocation/branch logic inline — ending
  the per-workflow duplication, with each workflow's local docs updated to match.

- _Note:_ Re-pointing only — no new transition logic; the workflows shrink to judgment + an executor call. Existing
  integration/E2E coverage exercises the re-pointed paths (not test-first — markdown + wiring edits).

    - `[ ]` **6.5.a `init-work-unit` Path A** → call the graduate transition for both the spawn (`arc start`) and
      in-place (`--here`, 6.4) paths (relocate + `reconcile-branch`), replacing the inline `git mv`.

    - `[ ]` **6.5.b `decompose-work-unit` park-exit** → call the teardown legs (`reconcile-branch` /
      `reconcile-worktree`); the full decompose matrix rewrite is the sibling `decompose-matrix` member's, not
      this WU's.

    - `[ ]` **6.5.c `archive-work-unit`** → call the archive sweep (6.1) + cohort sweep (6.2).

    - `[ ]` **6.5.d `activate-work-unit` / `deactivate-work-unit`** → call the activate/deactivate transitions
      (`activate` fires the dep-edge discharge, 4.7).

    - `[ ]` **6.5.e Local doc updates** — per-member workflow/strategy edits that ride this code; the cross-cutting
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

- `[ ]` `abandon` executes its per-cell mechanics across the pre-merge states (including execution-locus
  relocation) and rejects from `integrating` / merged states; `deactivate` stays the narrow `Active → Planning`
  undo — no merged-corner cells (ADR-026 amendment)

- `[ ]` The `archive` sweep + dated-path computation run from the executor, and the cohort-doc sweep fires on
  `isArchivalTriggered`

- `[ ]` The `stub` contract rejects creation without explicit commitment + priority

- `[ ]` The planning-entry write-context gate routes `arc-plan` correctly across its three routes, including the
  pre-authored-draft route to `stub` (no adopt edge)

- `[ ]` `arc status <slug>` serves the slug→state read with the JSON shape preserved (from the interim
  `arc status --lifecycle`)

- `[ ]` Each transition applies its `softFields` disposition (`reset` / `input` / `leave`) so `Next Task` /
  `Next Action` / `Last Completed` stay consistent post-transition (executor writes resets + supplied inputs, never
  deriving/authoring), and emits an ephemeral, never-persisted next-step suggestion

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

---

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
