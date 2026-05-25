# Notes: Worktree Foundation

Implementation-reference detail carried from planning that the PRD doesn't fully spell out. Read alongside
`spec-worktree-foundation.md` during task generation and execution.

## Lifecycle workflow touch-points (detail beyond R28)

- **`integrate-work-unit`** — a worktree cannot remove itself, so the removal runs from the **main**
  worktree. This composes with the batched-archive step (archive also runs in main): once the merge lands,
  the WU worktree is removable immediately. Keep the removal phrasing **origin-agnostic** — ARC-spawned and
  externally-spawned both reach the same advisory/offer, gated by the R29 marker.
- **`activate-work-unit`** — the branch rename (`plan/x` → type-prefix) runs *inside* the WU's worktree; the
  **worktree path is unchanged** by the rename (paths are creation-time artifacts, R26). `arc user open`
  reappearing here is **benign idempotence, not a leak**.
- **`init-work-unit`** — stays planning-welded; the life-phase generalization (Planning vs. Active at
  creation) is **AWL's seam**, not WF's. WF adds only the worktree-creating mode.
- **`archive-work-unit`** — worktree-neutral / low-risk: its sweep already lands on the WU branch before
  merge. Not separately reworked.

## Operational constraint (content for the R31 main-on-main strategy doc)

- **One worktree per IDE / language-server window.** Cross-worktree IDE/LSP coordination is largely outside
  ARC's control; document the constraint rather than engineer around it.

## Implementation reference (per phase)

The real mechanisms, gotchas, and registration sites the spec and task list don't fully spell out. The
implementing session is a different session; read the relevant subsection before starting each phase's tasks.

### Phase 1 — conventions & marker

- **Config-key registration is multi-site.** A new flat-dotted key must be registered in: `arc-config.yml`
  (both copies); `commands/config/types.ts` `ConfigSettings` interface (closed type — typecheck fails
  otherwise); `lib/config/status-reader.ts` (`DEFAULTS`, and `ENUM_VALIDATORS` / `AGENT_CONSUMABLE_KEYS` as
  applicable); and `.internal/scripts/validate-config.sh` `known_keys` allowlist (both copies — an
  unregistered key warns "Unknown key"). Precedent: `commit.format` lives in `DEFAULTS` but is enum-gated
  shell-side via `validate_enum`, NOT in `ENUM_VALIDATORS` — follow "default in code, enum in shell" for
  freeform-ish convention keys.
- **New method files register in `lib/classification.ts` `CONFIGURABLE_FILES`** so three-way merge preserves
  adopter overrides on `arc update`. Omitting this silently breaks override preservation.
- **The marker `.gitignore` line is generated, not static.** The ARC-managed `.gitignore` block is rewritten
  from hardcoded arrays in `commands/{init,reconfigure,update}.ts`. Add
  `.arc/system/.internal/worktree-marker.json` to all three arrays; a manual `.gitignore` edit alone is
  overwritten on next update.
- **The marker "merged" input is greenfield.** 1.3c's gating decision needs (present × clean × merged).
  `clean` has `lib/git/dirty-state.ts` (`runDirtyStateStatus`); `merged` has NO existing helper — build a
  `git branch --merged` / merge-base check inside 1.3c. 2.4b / 2.7b / 7.1 consume the decision fn, so the
  merged-check must be real (not stubbed) before they build on it.
- **`branch-format` is the extension target (1.1).** It already governs branch naming, ships the type-set
  (`feat fix chore refactor hotfix` + `plan/<name>`), has the `override-active` / `.override` / `.default`
  machinery, and is registered Configurable; `strategy-work-organization.md` (~L184-189) defers the type-set
  to it. The advisory warn-on-external-mismatch has no existing branch-name validator to hook — it lives in
  session-init / workflow prose (doc-behavior).
- **Location-template slug collisions** (`plan/foo` and `plan-foo` both → `plan-foo`) — a one-line
  "creation-time, last-write-wins / user-resolved" note in the method, not collision-handling code.

### Phase 2 — probe, branch-gone, cascade, sweep

- **branch-gone is a fetch-failure classification.** Against real git: the probe's `git fetch origin <branch>`
  (no `--prune`) FAILS with exit 128 "couldn't find remote ref" when the remote branch is deleted — it does
  NOT produce a `[gone]` upstream (that needs `--prune`). `boundedFetch` currently collapses all non-abort
  failures to `"error"` and discards stderr; 2.2a extends it to surface the failure kind and classify
  "couldn't find remote ref" as `branch-gone`. No new fetch. (The already-pruned-tracking-ref case exits at
  `no-upstream` before fetching — a separate arm.)
- **Adding `branch-gone` breaks exhaustive switches.** `inferWorktree` (`recommended-action.ts`) and the
  state JSDoc/tables enumerate states with no `default` — 2.2a + 2.2b must land in one green-build increment.
  The `session-init` workflow state-list (both copies) also needs the new member.
- **The probe orchestrator has no conditional branch.** `runSessionInitStatus` fires all slots eagerly via
  one `Promise.all`. 2.3's "roster fired only in the branch-gone / no-WU branch" needs either two-phase
  orchestration (resolve the worktree probe first, then conditionally fire the roster — changes the
  single-`Promise.all` shape and its "envelope never rejects" property) or a self-no-op roster probe gated on
  a passed-in worktree state. "no-WU" derives from the `active` slot (a second gating input). Settle the shape
  in 2.3.
- **`coord.recency_days` does not exist** and no Foundation task adds it. Use an internal recency constant in
  the hand-rolled fallback; the config key is the coord-probe WU's
  (`backlog/planned/cross-machine-coherence/coord-probe/`, unbuilt).
- **2.1a rev-parse idiom:** primary-vs-linked detection compares `git rev-parse --git-common-dir` vs
  `--git-dir` (equal → primary). `pushability.ts` models `--git-path` resolution. Pin the exact invocation
  before the test.
- **2.3a team-mode filter** rides on optional `**Owner:**`; admin / meta-less worktrees carry no identity —
  define their disposition (include unattributed vs exclude) in the filter + test.
- **2.7a shipped-WU match key:** worktree branch (`plan/foo` / `feat/foo`) won't string-match
  `completed/{quarter}/NN_{wu-name}` dir names — pin a normalization (strip `NN_` + branch type-prefix,
  compare WU-name slug) and decide the quarter-dir glob scope.
- `runWorktreeRoster` entries also carry `metaFilePath`; cohort from `**Cohort:**` (skips `[none]`).
- **branch-gone classification duck-types the rejection (2.2a).** `boundedFetch` (`worktree-sync.ts`) returns
  `"ok" | "timeout" | "error"` and its catch discards the error (only `AbortError` → timeout). Extend the
  union to include `"branch-gone"` and classify by inspecting the rejection's `.stderr` / `.code` (exit 128 +
  "couldn't find remote ref"): `GitExec` types only the resolved `ExecResult`, not the rejection, so this
  duck-types the thrown error the way `gitMergeFile` already does (`exec.ts:219`). `runWorktreeSyncStatus`
  then maps `"branch-gone"` → `state: "branch-gone"`, other failures → `remote-unavailable` as today. The
  2.2a test mock must reject with a `{ stderr, code: 128 }`-shaped error, not a bare `Error`. Written plainly
  here; CSA later migrates the branch-gone evidence to a zod discriminated union — leave the seam, don't
  pre-build it.
- **Probe orchestration is a forward-compat seam owned by In-Flight Awareness.** 2.3's conditional-roster
  wiring is the *first* conditional-expensive slot in an orchestrator that today fans out every slot eagerly
  (`commands/status/run.ts`, three entry points: `runStatus` / `runSessionInitStatus` /
  `runSessionHandoffStatus`). IFA adds the *second* (the oracle, gated on `active.resolution === "none"`) and
  owns evolving the orchestration model — gated-slot affordance + per-entry-point de-dup — see
  `draft-in-flight-awareness.md` § In scope item 6. WF ships only the minimal, clean, absorbable two-phase
  seam; do not build a general slot framework. CSA (parallel post-WF) separately converts `Probe<T>` →
  `Result<T, E>` + zod-validates the envelope in the same file — orthogonal axis (slot-result type, not
  firing discipline), but co-located: coordinate `run.ts` edits if the two run concurrently.
- **CSA migration-target staleness (worktree-list parser).** `draft-cli-substrate-adoption.md` lists
  "3 hand-rolled `git worktree list --porcelain` parsers" as WF migration targets, but `parseWorktreeList`
  already exists (`worktree-roster.ts`, from WOR). WF reuses it across 2.4 / 2.7 (one parser, multiple
  callers), so CSA's later sweep migrates **one** parser, not three — flag for CSA's pre-PRD refresh.

### Phases 3 & 4 — cross-WU sync

- **Cross-WU entries are NOT H3-headed — two different shapes.** `WORKING-MEMORY` entries = bold-field header
  (`**...:**`) + `_Remove when:_` + body, under `## Memories`. `USER-INBOX` entries = markdown list items
  (`- **lead-in** — text`) under `## Atomic` / `## Backlog` H2 sections. Codified at
  `strategy-session-operations.md` (~L781-823) + the templates. Merge-key: WORKING-MEMORY → the bold-field
  header; USER-INBOX → the list-item lead-in within each named H2 section (preserve section boundaries).
  Tombstone (`## Removed: {name}`, H2) keys to the same per-file identity.
- **`.sync-state.json` version field is `version` (value 3).** Reader gates `version === 2 || 3`; writer emits
  3. `partialPush: {localRefHash, sourceCommit}` already exists. 4.4 bumps `version` to 4 (the `2||3`
  back-compat ladder extends naturally). Note: `schemaVersion` IS a live convention in
  `lib/release/setup-marker.ts` (sibling `.internal/` marker) — the repo has both field names; `.sync-state`
  uses `version`.
- **4.4 re-shapes a LIVE field.** `partialPush` is single-ref-shaped with live writers
  (`recordPartialPushMarker`, `runPairedPush`) + a back-compat reader; the worktree-aware reshape must update
  those writers in lockstep, and the back-compat test must hydrate an old single-`partialPush` record. (The
  marker helpers live in `save-load.ts`, not `push-fetch.ts`.)
- **3.1 classification is greenfield; `.internal/` exclusion is already incidental** at the io-layer
  (`io-context.ts` skips `.`-prefixed dirs; `user-sync.ts` skips dotfile basenames). The per-WU vs cross-WU
  distinction is the real new surface. Name-collision warning: `inferUserSyncCause` (a divergence-cause
  diagnostic) is UNRELATED to 3.1's sync-class dispatch — don't assume 3.1 is partly built there.
- **4.1 precedes the existing push-recovery `[rejected]` handler** (`handlers/push-recovery.ts`). Define
  whether `git notes merge` reconcile replaces or runs before the rejection prompt for the notes ref.
- **Test coverage to add:** 3.3.b (ref-wide N-most-recent read) and 4.1.b (non-trivial-conflict surfacing)
  need behavior bullets; 3.3.a needs a per-section USER-INBOX case + a malformed-entry case; 4.1 needs a
  notes-merge-failure error path. (Folded into the task list.)
- **Sync-class dispatch is a separate axis from the existing type allowlist (3.1).** `serialize` already filters
  by file *type* (`isAllowedFile` / `ALLOWED_EXTENSIONS` + `EXCLUDED_NAMES`, `user-sync.ts`); R16's "no
  allowlist" means no *sync-class* allowlist — the type filter stays. The new classifier owns the per-WU /
  cross-WU / never-synced *semantic* (its single source of truth); the io-layer dotfile skips (`io-context.ts`
  `readUserDir`, `serialize`) — both on the single serialize path, no other `readUserDir` consumer — stay as a
  cheap walk-time prefilter. Don't replicate class logic across the sites.
- **The load path needs a current-WU input (3.2).** `UserLoadOptions` (`commands/user/types.ts` +
  `handlers/user.ts`, both) and `findNearestUserNote` carry no WU signal; thread the current WU name (active-meta
  resolution / branch → wu-name) so the note search filters by "contains the current WU's subdir."
- **Merge divergent-body resolution = most-recent wins (3.3).** Same entry-identity (header / lead-in) with a
  divergent body resolves to the most-recent note's body, recency-ordered — consistent with 3.4's tombstone
  recency. The 3.3.b N-most-recent read must therefore return notes in recency order (a sequence, not a set);
  both merge body-resolution and tombstone recency consume that ordering.
- **Forward-compat — keep new logic modular for `user-sync-module-split`.** That WU extracts `sync-status.ts` +
  ref/manifest helpers into `lib/user-sync/*` (not `save-load.ts`), so Phase 3 is forward-compatible; isolate
  the sync-class classifier (3.1) and the entry-merge (3.3) into their own functions / a `lib/user-sync/` home
  rather than inlining into `save-load.ts`, so the later split stays clean.
- **4.1 reconcile is a notes-specific arm, not the generic recovery.** `pushWithInteractiveRecovery`
  (`push-recovery.ts`) is one generic `[rejected]` path (force/merge/cancel; force-fetch + re-save + re-push)
  with no notes-vs-branch distinction. 4.1 adds an automatic `git notes merge` (cat_sort_uniq) arm at
  `runPairedPush`'s notes-push leg, run instead of the interactive recovery for the notes ref; the interactive
  path stays for the worktree/branch leg. Forward-compat: the arm lives in the push leg (`paired-push.ts`),
  below `sync-handler-decomposition`'s target (`handlers/sync.ts` matrix/execute/render split) — orthogonal.
  CSA later moves the reconcile's error handling onto execa's typed errors.
- **Shared "WU shipped" predicate (2.7a ↔ 4.2).** Both the stale-worktree sweep (2.7a) and retired-subdir
  reconciliation (4.2) need "is this WU shipped?" via the `completed/{quarter}/NN_{wu-name}` cross-ref +
  match-key normalization (strip `NN_` + branch type-prefix, compare WU-name slug). Build it once, consume in
  both; `findStaleUserWuSubdirs` is detection-only today and carries no shipped-check. (2.7a's task text
  predates this sharing — add the back-pointer in the final coherence pass.)

### Phases 5 & 6 — entry primitives, arc-shift

- **`arc start` does not exist** (downstream Agile WU Lifecycle's). 5.3's cold-start primitive builds
  standalone with `arc-session` as its only current caller; its test must exercise via `arc-session`, not a
  stubbed `arc start`.
- **"Spawn returns to origin" is automatic at the git level** (`git worktree add` doesn't touch the invoking
  worktree's cwd/HEAD). Residual risk is skill-authoring discipline: the skill must NOT `cd` into the spawned
  path, only report it.
- **6.2 `runDirtyStateStatus` covers uncommitted, not unpushed** — correct as scoped (commit/stash/leave is
  uncommitted-only; the R29 marker-gating separately handles unpushed for removal).
- **ADR-021 confirmed** (`adr-021-introduce-errand-work-class.md`, Status: Proposed; names Worktree
  Foundation as the cheap-branch ratification owner). 5.6 ratifies it as intended.
- **One shared scaffolding primitive, parameterized (5.2 / 5.3).** meta + SESSION-NOTES (`runUserOpen`-style
  seed) + conditional marker, parameterized by worktree-target mode (create-new via 5.1's `git worktree add`
  vs. use-existing) and a created-by-arc flag. Spawn = create-new + flag true; cold-start = use-existing + flag
  false (advisory). Avoid a monolith that conflates worktree-creation with scaffolding — cold-start creates no
  worktree; the `git worktree add` lives in 5.1's `init-work-unit` mode, invoked on the create-new path only.
- **Spec-input parser is a CSA migration target (5.3.b).** Hand-rolled per-variant now (file / URL / issue /
  plan-doc / name+description); CSA migrates the 5-variant parser to a zod discriminated union — leave the seam.
- **`arc-resume` → `arc-session` is a ~19-reference grep sweep (5.4.a),** not just the skill dir: `.arc/system/**`
  workflows (session-loop, initial-setup, add-agent, skills/README) + `.arc/reference/**` (strategies,
  AGENT-BRIEF.ARC, analysis); ADR-011's example reference updated for accuracy. Harness copies (`.claude`,
  `.codex`) hand-synced per 5.4.d.

### Phase 7 — lifecycle, retirements, drift

- **The R32 atomic-sweep found-list.** Live companion-type refs beyond the task's named anchors:
  `strategy-planning-module.md` (~6 refs incl. a § link), `strategy-file-classification.md` (the `atomic-`
  file-type registry row), `strategy-session-operations.md` (shape analogy — reword, don't delete),
  `3_process-task-loop.md`(+`.template`) (routing instruction), `DEV-RULES.PROJECT.md` (capture-routing row),
  `AGENT-BRIEF.ARC.md` + `AGENT-BRIEF.CONTRIBUTOR.md`, `completed/README.md`, `templates/user/USER-INBOX.md`
  (shape analogy + § link), `backlog/ATOMIC-INBOX.template.md` (§ cross-link that dangles when the § is
  removed), and the docs site (`docs/work-planning.md`, `docs/reference/glossary.md`,
  `docs/reference/task-lists.md`). PRESERVE the shared `ATOMIC-INBOX` surface, `USER-INBOX § Atomic`, and the
  atomic *character* — only reword dangling §-links.
- **`integrate-work-unit.md` is verify-only for the sweep** — its only `atomic` refs are the protected
  `§ Atomic → ATOMIC-INBOX` surface, no companion ref.
- **`Spawned:` field does not exist** in `manage-incidental-work` or `template-meta` (only `Interrupts:` /
  `Paused At:` / `Paused To:`) — neutralize the three that do.
- **7.5a is a full state-table rewrite.** `strategy-work-organization.md` § Work Unit State table
  (`In Progress` / `Paused` / `Waiting-For` / `Complete` / `Superseded`) contradicts `template-meta`'s
  `Planning | Active | Integrating | Shipped` on every row — rewrite the whole enum table (+ the Optional
  Pointer Fields sub-table).
- **7.5c literal anchors:** edit the § ROADMAP step-4 In-Flight definition (`**In Flight** — State: Active |
  Integrating`) and the Regeneration "Activation" bullet (`active/ ⟹ State: Active` is planner shorthand, not
  doc text). ROADMAP regen is doc-only (NO render code — hand-maintained per `activate-work-unit` Step 7);
  7.5c carries no tests.
- **7.1c / 7.1d are extend-existing, not net-new.** `arc user open` is already present defensively in
  `activate-work-unit` (idempotent reaffirm); `session-handoff` already surfaces worktree context (worktree
  probe slot + recommended summary line).
- **`manage-incidental-work` carries other stale drift** consistent with 7.2's neutralization: a
  `status-{parent-name}.md` reference (stale `status-` prefix → `meta-`) and non-4-state `State:` values
  (`Paused` / `In Progress`).
