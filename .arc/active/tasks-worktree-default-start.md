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

### `[x]` **1.1 Wire the create-new `arc start` worktree-spawning mode**

- _Goal:_ Bare `arc start <name>` (non-`--here`) spawns an isolated worktree on a new `plan/<name>` branch
  via the shipped `spawnWorktree` primitive — resolving location / base / repo from config — instead of
  erroring with the `--here` pointer.

    - `[x]` **1.1.a Create-new core in `commands/start.ts`**
        - Added `runCreateNew` (no-throw `{ ok, value | reason }`) as a peer to `runColdStart`: resolves
          `branch.base` / `worktree.location_template` via `readConfigSettings`, derives `{repo}` from the
          primary worktree's basename (`resolvePrimaryWorktreePath`), and delegates to `spawnWorktree`
          (`createdByArc: true`). Refuses when no name is supplied, or when the primary path can't resolve.

    - `[x]` **1.1.b Handler dispatch + CLI surface**
        - `handlers/start.ts` now dispatches the non-`--here` branch to `runCreateNew` (requires an explicit
          name, confirms, reports the spawned worktree path + branch via `p.note`); `cli.ts` command and
          `--here` descriptions now name worktree-spawn as the default and `--here` as the in-place override.

    - `[x]` **1.1.c Drop the moot `--tier` reference + refresh stale module docs**
        - Removed the `--tier` mention and the "only `--here` wired / create-new layers on later" framing
          from `start.ts`'s module doc, which now describes the two-mode (create-new / `--here`) dispatch.

- _Outcome:_ Create-new is wired end-to-end — `arc start <name>` spawns a `plan/<name>` worktree via
  `spawnWorktree`, with `--here` remaining the in-place cold-start override. The new `runCreateNew` core is
  unit-tested for config-driven base/template/repo resolution, the no-name and unresolved-primary refusals,
  and the success surface.

### `[x]` **1.2 Make worktree-creating the default in `init-work-unit`'s Execution Modes**

- _Goal:_ Creating a new work unit through `init-work-unit` defaults to spawning an isolated worktree under
  full protection when spawning is available; falls back to cutting the branch in the primary's base checkout
  when spawning is unavailable; cuts no branch under partial protection (direct base commit). Callers inherit
  the default by not forcing in-place; the `--here` cold-start path remains the explicit in-place override.

- _Outcome:_ `init-work-unit`'s Execution Modes now resolves the mode mechanically (branch-protection ×
  worktree-spawn availability, mirroring `run-errand` Launch) instead of leaving it "caller-selected, no
  default": full protection defaults to worktree-creating where spawning is available and falls back to
  in-place otherwise; partial protection stays no-branch direct-base. Authored once in the mechanism workflow
  (both two-copy instances), so `decompose-`/`graduate-work-unit` and session-init next-work dispatch inherit
  worktree-default by not forcing in-place; `--here` remains the explicit in-place override.

### `[x]` **1.3 Surface a plate-balance advisory line from in-flight `Class` composition**

- _Goal:_ Session-init's next-work discovery surfaces exactly one conditional advisory line when a `Heavy` /
  `Novel` stream is already in flight (the "roughly one genuinely-novel stream" balance rule), is silent
  otherwise, and never reorders, gates, suppresses, or re-nags the suggestion set.

    - `[x]` **1.3.a Emit the in-flight composition on the session-init probe**
        - Added `resolveInFlightComposition()` (`lib/session-init/in-flight-composition.ts`), which maps the
          roster's in-flight slice through `classComposition()` and returns the `Novel`/`Heavy`/`Light` tally
          (null for an empty slice). Wired into the `arc status --session-init` envelope as `inFlightComposition`,
          gated to the no-active-WU arm; `[TBD]`/field-absent rows excluded per `classComposition()`'s contract.

    - `[x]` **1.3.b Render the advisory line in session-init next-work discovery**
        - Added the conditional plate-balance advisory to session-init's next-work discovery (both two-copy
          instances): surfaced only when `inFlightComposition` carries `heavy ≥ 1` or `novel ≥ 1`, silent
          otherwise, with the awareness-only contract held in the prose. Documented the new envelope field in
          the Step 1 field table.

- _Outcome:_ The plate-balance signal now resolves probe-side (`inFlightComposition` on the envelope, no-active-WU
  arm only) and the workflow renders one awareness-only advisory line when a heavier stream is already in flight.
  `classComposition()` — previously uncalled — gains its first caller via the new roster-slice resolver.

### `[x]` **1.4 Read and surface the active WU's coordinating cohort doc**

- _Goal:_ When the active meta carries a `Cohort` value, session-init reads the coordinating `cohort-*.md`
  and surfaces its awareness during context-load, with a short `AGENT-BRIEF.ARC` note documenting the
  surface — so cross-member coordination is load-bearing on agent awareness.

    - `[x]` **1.4.a Resolve and emit the cohort-doc path on the probe**
        - Added `resolveActiveCohortDocPath()` (`lib/session-init/cohort-doc.ts`): reads the active meta's
          `Cohort` value, derives the leaf, and checks for `cohort-<leaf>.md` at the deterministic
          `backlog/planned/<field>/` path. Exposed as the handler-wired `cohortDoc` probe and emitted on the
          envelope as `cohortDocPath`, gated to a single resolved active WU; degrades to null on any miss.
        - _Scope:_ resolves at the `backlog/planned/` location only (not a `completed/` search): an active WU
          is an in-flight cohort member, so its cohort can't be archived and the doc reliably sits there.

    - `[x]` **1.4.b Read the cohort doc in context-load + document the surface**
        - Added context-load item 11 (conditional `cohort-*.md` read gated on `cohortDocPath`), the Step 6
          orientation surface (cohort coordination bearing on the current task), and the Step 1 field-table
          row — all in both session-init two-copy instances. Added the cohort-doc surface note to the
          `AGENT-BRIEF.ARC` `Cohort` vocabulary entry (two-copy).

- _Outcome:_ Cohort coordination is now load-bearing on session context: the probe resolves the active WU's
  `cohort-<leaf>.md` path (`cohortDocPath`) and the workflow reads it during context-load, surfacing
  cross-member coordination in orientation when it bears on the work. Resolution is deterministic from the
  `Cohort` field rather than a tree search, justified by the active-member invariant noted in 1.4.a.

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
