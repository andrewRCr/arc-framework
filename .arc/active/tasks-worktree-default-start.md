# Task List: worktree-default-start

- **Design:** `spec-worktree-default-start.md`

---

## **Phase 1:** Worktree-default start

_Purpose:_ Make worktree-spawning parallelism the lived default for new work units under full protection —
wire the unwired create-new `arc start` verb, flip new-WU dispatch to worktree-by-default, and add the two
start-time session-init steering surfaces (plate-balance awareness, cohort-doc discovery) that make the
resulting concurrency coordinate.

_Design decisions:_ The worktree-or-not default is mechanical — keyed on branch-protection mode ×
worktree-spawn availability only, never on `Class` or planning depth — mirroring the relocation `run-errand`
Launch already performs (`resolveWriteContext` / protection-mode branch). The CLI verb (`1.1`) is the
mechanism; the default _policy_ lives in `init-work-unit`'s Execution Modes (`1.2`), so every WU-creating
caller (`decompose-work-unit`, `graduate-work-unit`, session-init dispatch) inherits worktree-default by not
forcing in-place — composable-aligned, no per-dispatch-site duplication. Both steering surfaces resolve
probe-side: session-init emits an in-flight `Class` composition (`1.3`) and the active WU's resolved
`cohort-*.md` path (`1.4`), and the session-init workflow surfaces each. Steering edits to `init-work-unit`,
`session-init`, and `AGENT-BRIEF.ARC` are Framework markdown → two-copy edits (package source +
`.arc/` instance). See `notes-worktree-default-start.md` for the caller map, two-copy file list, and anchors.

### `[ ]` **1.1 Wire the create-new `arc start` worktree-spawning mode**

- _Goal:_ Bare `arc start <name>` (non-`--here`) spawns an isolated worktree on a new `plan/<name>` branch
  via the shipped `spawnWorktree` primitive — resolving location / base / repo from config — instead of
  erroring with the `--here` pointer.

- _Approach:_ Mirror the existing `runColdStart` split — a testable no-throw core in `commands/start.ts`
  resolves inputs and delegates to `spawnWorktree`; the handler resolves ambient context and reports.

    - `[ ]` **1.1.a Create-new core in `commands/start.ts`**
        - Add a `runCreateNew` core peer to `runColdStart`: resolve `branch.base` and
          `worktree.location_template` via `readConfigSettings`, resolve the primary-worktree path
          (`resolvePrimaryWorktreePath`) and derive `{repo}` from its basename, then call `spawnWorktree`
          with `wuName`, `spawningIdentity`, `baseBranch`, `locationTemplate`, `repo`.
        - Return the no-throw `{ ok, value | reason }` outcome shape; refuse (no write) when no name is
          supplied — create-new cannot derive a name from a branch the way cold-start does.
        - Build `test-first` (one behavior at a time):
            - spawns a worktree on a new `plan/<name>` branch via `spawnWorktree`
            - resolves `baseBranch` / `locationTemplate` / `repo` from config (not hard-coded)
            - refuses with a reason when no work-unit name is supplied
            - surfaces the resolved worktree path + branch on success

    - `[ ]` **1.1.b Handler dispatch + CLI surface**
        - In `handlers/start.ts`, replace the `!opts.here` error branch with the create-new dispatch:
          require an explicit `name`, resolve identity, call `runCreateNew`, and report the spawned
          worktree path + branch (`p.note`).
        - Update the `arc start` command + `--here` option descriptions in `cli.ts` so they no longer claim
          `--here` is "the only mode available today."

    - `[ ]` **1.1.c Drop the moot `--tier` reference + refresh stale module docs**
        - Remove the `--tier` flag reference from `start.ts`'s module doc — the `atomic` / `quick` /
          `standard` tier model is retired in favor of `Class` (resolved during planning, not via a CLI flag).
        - Refresh the "only `--here` wired" / "create-new modes layer on later" framing in the `start.ts`
          module docs to describe what now _is_.
        - _Note:_ No `--tier` flag grammar is introduced — only the stale doc reference is removed.

### `[ ]` **1.2 Make worktree-creating the default in `init-work-unit`'s Execution Modes**

- _Goal:_ Creating a new work unit through `init-work-unit` defaults to spawning an isolated worktree under
  full protection when spawning is available; falls back to cutting the branch in the primary's base checkout
  when spawning is unavailable; cuts no branch under partial protection (direct base commit). Callers inherit
  the default by not forcing in-place; the `--here` cold-start path remains the explicit in-place override.

- _Context:_ `init-work-unit`'s Execution Modes today documents both modes (in-place / worktree-creating) as
  "caller-selected, no default." This task makes the mechanical default the resolved behavior of the mechanism
  workflow itself, so every WU-creating caller — `decompose-work-unit`, `graduate-work-unit`, session-init
  next-work dispatch — inherits worktree-default rather than re-authoring the policy.

- _Approach:_ Author the protection × spawn-availability resolution into the Execution Modes section as the
  default mode selection (the same read `run-errand` Launch performs for errand locus). The worktree-creating
  mode runs the existing in-flight scope check before creating; the in-place path stays available for callers
  that force it. Doc edits only — `init-work-unit` is Framework markdown (two-copy).

- _Note:_ Exact phrasing of the override-and-inherit contract settles against the surrounding Execution Modes
  prose at implementation. `run-errand` is not a caller of this default — it owns its own errand-locus
  relocation (the mirrored shape) and reaches `init-work-unit` only on the errand→WU promotion path.

### `[ ]` **1.3 Surface a plate-balance advisory line from in-flight `Class` composition**

- _Goal:_ Session-init's next-work discovery surfaces exactly one conditional advisory line when a `Heavy` /
  `Novel` stream is already in flight (the "roughly one genuinely-novel stream" balance rule), is silent
  otherwise, and never reorders, gates, suppresses, or re-nags the suggestion set.

- _Approach:_ Compute the in-flight `Class` composition in the session-init probe (the `Novel` / `Heavy` /
  `Light` tally via `classComposition()` over the in-flight slice it already gathers) and emit it on the
  envelope; the session-init workflow reads that tally and renders the conditional line. Awareness-only.

    - `[ ]` **1.3.a Emit the in-flight composition on the session-init probe**
        - Wire `classComposition()` (currently uncalled) over the probe's in-flight slice and add the tally
          to the session-init envelope alongside the existing next-work discovery data.
        - Build `test-first` (one behavior at a time):
            - tallies `Novel` / `Heavy` / `Light` over the in-flight slice via `classComposition()`
            - excludes `[TBD]` / field-absent rows from the tally (per `classComposition()`'s contract)
            - emits the composition on the envelope when the in-flight slice is non-empty

    - `[ ]` **1.3.b Render the advisory line in session-init next-work discovery**
        - Add the conditional advisory line to session-init's next-work discovery step: surface it only when
          the emitted composition shows a `Heavy` or `Novel` stream in flight; stay silent otherwise.
        - Hold the awareness-only contract in the prose — the line never reorders, gates, suppresses, or
          re-nags. Framework markdown (two-copy).
        - _Note:_ Exact wording / placement settles against the surrounding orientation-output format at
          implementation.

### `[ ]` **1.4 Read and surface the active WU's coordinating cohort doc**

- _Goal:_ When the active meta carries a `Cohort` value, session-init reads the coordinating `cohort-*.md`
  and surfaces its awareness during context-load, with a short `AGENT-BRIEF.ARC` note documenting the
  surface — so cross-member coordination is load-bearing on agent awareness.

- _Approach:_ Resolve the cohort-doc path in the probe (which already parses the active meta + `Cohort`
  field) and emit it on the envelope; the session-init workflow reads the resolved path during context-load.
  Cohort docs are not co-located with the active WU — they live under `backlog/` / `completed/` subdirs as
  `cohort-<leaf>.md` — so resolution is a path lookup from the `Cohort` value, not a co-located read.

    - `[ ]` **1.4.a Resolve and emit the cohort-doc path on the probe**
        - From the active meta's `Cohort` value, resolve the backing `cohort-<leaf>.md` path across the
          backlog / completed layout and emit it on the session-init envelope.
        - Build `test-first` (one behavior at a time):
            - resolves the `cohort-<leaf>.md` path from a `Cohort`-bearing active meta
            - emits no cohort-doc path when the meta carries no `Cohort` value
            - degrades cleanly (no path, no error) when no backing `cohort-*.md` is found

    - `[ ]` **1.4.b Read the cohort doc in context-load + document the surface**
        - Add the conditional `cohort-*.md` read to session-init's context-load step, gated on the emitted
          cohort-doc path, and surface its coordination awareness in orientation.
        - Add a short `AGENT-BRIEF.ARC` note documenting the cohort-doc awareness surface. Both files are
          Framework markdown (two-copy).
        - _Note:_ Exact wording / placement of the surfaced awareness settles against the surrounding
          context-load and orientation format at implementation.

## **Phase 2:** Verification

### `[ ]` **2.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `arc start <name>` (bare, non-`--here`) under full protection spawns a worktree on a new branch via
  `spawnWorktree`, resolving location / base / repo from config — no longer errors with the `--here` pointer
- `[ ]` New-WU dispatch defaults to worktree-creating under full protection when spawning is available;
  falls back to a branch in the primary's base checkout when spawning is unavailable; cuts no branch under
  partial protection (direct base commit)
- `[ ]` The moot `--tier` reference is gone from `start.ts`'s module doc
- `[ ]` Session-init surfaces exactly one plate-balance advisory line when a `Heavy` / `Novel` stream is in
  flight, is silent otherwise, and never reorders or gates the suggestion set
- `[ ]` Session-init reads and surfaces the active WU's `cohort-*.md` when the meta carries a `Cohort`;
  `AGENT-BRIEF.ARC` documents the cohort-doc awareness surface
- `[ ]` The create-new handler branch carries test coverage
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
