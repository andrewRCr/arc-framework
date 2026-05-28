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
- **Probe orchestration is a forward-compat seam owned by In-Flight Awareness.** 2.3's conditional roster and
  2.4's branch-gone recovery cascade are WF's *two* conditional-expensive slots in an orchestrator that today
  fans out every slot eagerly (`commands/status/run.ts`, three entry points: `runStatus` /
  `runSessionInitStatus` / `runSessionHandoffStatus`). IFA adds a further one (the oracle, gated on
  `active.resolution === "none"`) and owns evolving the orchestration model — gated-slot affordance +
  per-entry-point de-dup — see
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
- **4.1 reconcile replaces the lossy `[rejected]` recovery for notes pushes, automatically** (no prompt).
  Shipped all-in: `pushWithInteractiveRecovery` was retired (not just bypassed for the paired leg) and the
  reconcile became the universal notes-push recovery. Mechanism, the shipped wiring, the scope decision, and
  the cat_sort_uniq corruption gotcha are below under "4.1 reconcile is a notes-specific arm."
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
- **4.1 reconcile is a notes-specific arm, not the generic recovery (shipped all-in 2026-05-26).** The old
  `pushWithInteractiveRecovery` was one generic `[rejected]` path (force/merge/cancel; force-fetch, re-save,
  re-push) with no notes-vs-branch distinction — and for the shared notes ref that "merge" was **lossy**:
  re-save only serializes *this* worktree's `user/{identity}/` dir, dropping notes another worktree
  concurrently pushed. Every notes-push site routed through it, so the lossy merge was a latent data-loss bug
  reachable from any of them once this WU enables parallel worktrees.
    - **Decision — fix it everywhere, not just the paired leg.** Planning scoped 4.1 to `runPairedPush`'s
      notes leg via the `pushNotes` seam, leaving the other sites on the lossy path. At impl time the scope
      widened (the bug is identical across callers, and this WU is what makes it reachable):
      `pushWithInteractiveRecovery` was **retired** and replaced by `pushNotesWithReconcile` (a thin
      spinner / staleness-warn wrapper over the new `reconcileNotesPush`), wired into **all four**
      notes-push sites: `pairedNotesAdapter`, `handleUserPush` (`arc user push`), the `user-sync` save+push
      flow, and the `sync` notes-only cell. `--force` stays the explicit overwrite; the `--yes`
      notes-conflict-auto-accept role and the `failed-nontty-conflict` surface are gone (auto-reconcile
      needs no prompt, and non-tty pushes now reconcile instead of failing).
    - **Wiring (logic stays modular).** Pure ref/arg/predicate + validity helpers (`isResolvedNoteValid`)
      live in `lib/user-sync/notes-merge.ts` (extractable for `user-sync-module-split`); IO orchestration
      (`reconcileNotesPush`) in `commands/user/push-fetch.ts` — no merge logic in `runPairedPush` or the
      handlers. `pushNotesWithReconcile` (`handlers/push-recovery.ts`) is the thin rendering wrapper the four
      sites call; the paired flow still injects via the `pushNotes` seam (now pointing at the reconciler).
      Keeps `handlers/sync.ts` thin for `sync-handler-decomposition` (orthogonal).
    - **cat_sort_uniq corrupts single-line-JSON notes on a same-commit collision (the real 4.1.b case).**
      User notes are single-line JSON (`JSON.stringify(manifest)`). `git notes merge -s cat_sort_uniq`
      line-merges blobs *only when both refs annotate the same commit*. Different worktrees usually annotate
      different commits (different branches) → clean disjoint union, no blob merge. But two worktrees at the
      **same** HEAD commit (both freshly branched off one commit, neither has committed yet) each note that
      commit → cat_sort_uniq concatenates two JSON objects into `{…}\n{…}` = invalid JSON, and exits **0
      (success, no conflict)**. The next per-WU load (`parseResolvedNoteManifest`) then *throws* "Corrupt git
      note." So 4.1.b's surfacing **cannot key off git's conflict/exit signal** — detect via a post-merge
      validity check (does each merged note still parse as one manifest?). Reachable precisely in the
      concurrent-worktree scenario this WU enables.
    - **Pin the invocation before the test** (mirror 2.2a's fetch-idiom discipline): fetch remote notes into
      a temp tracking ref, `git notes --ref <ref> merge -s cat_sort_uniq <temp>`, re-push; clean up
      `NOTES_MERGE_*` state on abort. `gitMergeFile` (`exec.ts`) is the existing duck-typed analog.
    - CSA later moves the reconcile's error handling onto execa's typed errors and adds zod-on-read of the
      merged note payload — keep the validity check parser-shaped (discriminated outcome, no throw) on the
      `GitExec` seam so that swap is mechanical.
- **Shared "WU shipped" predicate is already built (2.7a → 4.2 consumes).** 2.7a shipped
  `lib/work-unit/completed-index.ts` — `readShippedWorkUnits` (scans `completed/{quarter}/NN_{slug}` into a
  slug set), `branchToWorkUnitSlug`, `isShippedWorkUnit` — and its module doc already names "retired-subdir
  reconciliation" as a consumer. So 4.2 does **not** build a predicate; it consumes this one. Reuse nuance:
  `isShippedWorkUnit` / `branchToWorkUnitSlug` are **branch-oriented** (strip a `<type>/` prefix), but 4.2's
  input is a **subdir name** under `user/{identity}/` — already a bare WU-name slug, no prefix. So 4.2 calls
  `readShippedWorkUnits()` and checks `shipped.has(subdirName)` directly; the branch helpers don't fit.
  `findStaleUserWuSubdirs` (`commands/user/open.ts`) stays detection-only — 4.2 wires reconcile =
  shipped-check + `removeStaleUserWuSubdir` + `.internal/` backup.

#### Phase 4 forward-compat cross-check (2026-05-26)

Cross-checked Phase 4's surfaces against the agile-parallelism cohort (errand-enablement, agile-wu-lifecycle,
in-flight-awareness) and the downstream sync WUs (cross-machine-sync-coherence, user-sync-module-split,
sync-handler-decomposition, cli-substrate-adoption). Mostly confirmed the spec's R20–R24; the items below
either changed a design call or are load-bearing constraints for a downstream WU.

- **No-current-WU load is a common path, not an edge (errand-enablement + R31 main-on-main).** On a session
  with no current WU, per-WU restore no-ops and only cross-WU files load. Two consequences Phase 4 must
  handle: (a) **4.2** reconciles only *shipped* subdirs — the shipped gate is what stops an Errand/main
  session from mass-reconciling every in-flight WU's subdir (all of which look "not the current WU"); (b)
  **4.3** must not flag present per-WU subdirs as orphans on a cross-WU-only load — they are other WUs'
  legitimate in-flight context, absent from the cross-WU manifest by design. Today `runUserLoad`'s
  `staleWarnings` (`save-load.ts:171`) would flag every such file. The clean disambiguation ("retired at
  source" vs. "live other-WU context") is T3's `priorFileList`; 4.3's interim just must not be noisy.

- **4.4 → cross-machine-sync-coherence (consumes the seam directly).** CSC's T3 drift tier reads the reserved
  `priorFileList`; its remote partial-push marker reads the reserved provenance field. Two refinements: (a)
  shape the **remote-marker-provenance** reservation to carry **per-worktree** state — CSC's remote marker
  must represent multiple worktrees (its draft: "per-worktree HEAD, not just the main worktree's"), so don't
  reserve a scalar a re-bump would have to pluralize. The local `.sync-state.json` is already per-worktree (a
  per-working-tree file); `partialPush.sourceCommit` stays per-record. (b) "**Reserved fields present →
  preserved round-trip**" is **not** free: `readLocalSyncState` currently reconstructs the record from only
  the explicitly-extracted known fields (drops everything else), and `writeLocalSyncState` /
  `clearPartialPushMarker` rebuild from scratch. 4.4 must change read + write to carry unknown reserved fields
  forward, or CSC's populated fields vanish on the next op. CSC is pre-PRD — reserve *generically*, commit to
  no marker shape.

- **Concurrent-worktree notes-push *widens* the partial-push surface (R24 record).** Parallel worktrees sharing
  `refs/notes/arc/user/{identity}` multiply the partial-push / recovery scenarios the marker guards — Worktree
  Foundation *creates* this exposure (4.1 made the shared-ref push reconcile universal; concurrent worktrees
  make same-ref collisions routine rather than a single-machine rarity), so `cross-machine-sync-coherence`'s
  remote partial-push marker is genuinely necessary, not a pre-WF plan merely inherited. The local
  `.sync-state.json` marker (4.4) is the per-worktree half; CSC adds the remote, cross-worktree half that the
  reserved `remoteMarkerProvenance` seam (per-worktree-pluralizable) is shaped to carry.

- **4.3 orphan classification is tier-extensible.** T1 (content-equivalence rename) + T2 (grouped retirement)
  ship here; T3 (sync-state-aware drift) is CSC's, and CSC frames it as the *third tier of the same surface*.
  So 4.3 emits a structured classification (rename-candidate / grouped-retirement / generic) that a T3 drift
  axis slots into — not a flat string-formatting branch.

- **Schema home: extract `LocalSyncState` → `lib/user-sync/sync-state.ts` in 4.4 (decided 2026-05-26).** It
  lives in the 768-line `save-load.ts` today. Both CSC (remote marker, T3) and CSA (zod schema for "user-sync
  state") build on it, and the Item-D layout decision already routes new sync code to `lib/user-sync/*`.
  Extracting now gives both a clean I/O-boundary home; keep the validation parser-shaped (`LocalSyncState |
  null`, no throw) so CSA's zod swap is mechanical (the eventual schema needs `.passthrough()` for the
  reserved fields above).

- **Two `version` fields, don't conflate.** `save-load.ts` carries the note **manifest** `version` (1/2,
  gated in `parseResolvedNoteManifest` / `isSyncManifest`) and the `.sync-state.json` `LocalSyncState.version`
  (2/3). 4.4 bumps **only** the sync-state version (3 → 4); the manifest gate is out of scope.

- **in-flight-awareness owns the session-init probe orchestration.** If 4.2 wires retired-subdir detection
  into session-init as a slot, follow the existing slot conventions (safeProbe-wrapped, "envelope never
  rejects", cheap always-on local FS read like the `sweep` slot) so IFA's later gated-slot + de-dup evolution
  absorbs it. Keep detection (read-only, surfaced) separate from removal (offer / auto-close-with-backup),
  mirroring the worktree-sweep pattern. Don't build a general slot framework — IFA owns that.

### Phase 5 — entry primitives

- **`arc start` does not exist** (downstream Agile WU Lifecycle's). 5.3's cold-start primitive builds
  standalone with `arc-session` as its only current caller; its test must exercise via `arc-session`, not a
  stubbed `arc start`.
- **"Spawn returns to origin" is automatic at the git level** (`git worktree add` doesn't touch the invoking
  worktree's cwd/HEAD). Residual risk is skill-authoring discipline: the skill must NOT `cd` into the spawned
  path, only report it.
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

#### Phase 5 design ratification (2026-05-26) — CLI-primitive scaffolding + forward-compat seams

Settled across an audit + forward-compat pass against the agile-parallelism cohort, the arc-plan conductor, CSA,
and the architecture-remediation cluster. Refines (does not contradict) R8/R9/R28 — the PRD's "thin wrapper"
language is realized as the decisions below.

- **`git worktree add` + fresh-meta scaffold live in a CLI primitive (TypeScript, testable), not agent workflow
  bash.** `init-work-unit`'s worktree-creating mode (5.1) is thin prose delegating to the primitive's
  create-new path. Reasons: the PRD's single-turn budget (one tool call, not a multi-turn bash sequence);
  atomicity (a half-run agent sequence leaves a worktree with no marker → R29 misclassifies it as
  externally-managed); testability; and eliminating the "skill must not `cd` into the spawned path" hazard (CLI
  code writes to the resolved root and reports the path; it never `cd`s). The Phase-1/WOR helpers are already
  cwd-parameterized for this — `runUserOpen({cwd})`, `writeWorktreeMarker(cwd, …)`,
  `resolveWorktreeMarkerPath(cwd)` all target an arbitrary worktree root; `resolveWorktreeLocation` is pure path
  math (returns the path — something still has to run `git worktree add`, and that something is the primitive).

- **Primitive scope = fresh scaffolding only.** Worktree-create + fresh Planning-meta + SESSION-NOTES seed +
  conditional marker. Backlog-graduation (`init-work-unit` Step 3 `git mv` + Step 4 Path A field-preserving
  reconcile) and the idempotent-resume case stay in the workflow — they reconcile existing files; the primitive
  only mints fresh. Don't entangle them. The conductor (`draft-arc-plan-conductor.md:1090-1095`) will later want
  graduation factored as its own callable for `resume-work-unit.md`; keep graduation a clean, self-contained
  workflow step so that extraction is possible without un-baking it from the primitive.

- **Parameterize life-phase / branch-prefix / initial-State (default `Planning` / `plan/` / `Planning`).** The
  single highest-leverage forward-compat seam — converged from AWL (`draft-agile-wu-lifecycle.md:353-372`: its
  `arc start` tier story, atomic = Active-from-start on `<type>/<name>`, flows through this param) and the
  conductor (`draft-arc-plan-conductor.md:1039,1097-1106`: resume wants `plan/<name>`, life-phase-agnostic init
  wants `<type>/<name>`). R8 reads as a `-b plan/{name}` hardcode while calling `--tier`/`--type` "AWL's seam";
  resolve toward the parameter. Foundation's callers always pass create-new + Planning; the param costs an extra
  default now and saves AWL + the conductor a primitive rewrite later.

- **Primitive homes in `lib/`** (alongside `worktree-location.ts` / `worktree-marker.ts`), not `handlers/` or a
  fat `commands/` module — so sync-handler-decomposition / user-sync-module-split never have to relocate it.

- **Meta single-source-of-truth — superseded by ADR-022** (`adr-022-managed-operational-state-documents.md`).
  ADR-022 makes the meta a *managed operational-state document* whose **structure is a code-owned record**;
  the markdown is a projection. This **drops the earlier "`template-meta.md` is the document SoT / read the
  project copy to preserve adopter-customizable behavior" framing** — meta is **not** adopter-customizable.
  What survives: (1) the field set is the **`META_FIELDS` constant shared with `meta-reader.ts`** — one
  definition for parse + scaffold (the proto-schema CSA's zod meta-schema wraps, not a rewrite; today
  scattered across `meta-reader.ts`, `worktree-roster.ts`, `wu-resolution.ts`, `validate-meta-spec.ts`, which
  schema-introspection-layer then exposes); and (2) the meta is H1 + grouped bold-field bullets — **not** YAML
  frontmatter. WF Task 5.2.b scaffolds from an internal/bundled skeleton (not the adopter `.arc/` copy)
  populated via `META_FIELDS`, round-trip-tested — the model-aligned interim `operational-state-docs` later
  generalizes into the full record→render engine.

- **Spec-input parser (5.3.b) is discriminated-outcome / no-throw**, mirroring `lib/user-sync/parser.ts`
  (`{ ok } | { ok: false, reason }`); it feeds structured meta fields into the writer's override map. The skill
  gathers + confirms raw input. This keeps CSA's zod migration a wrap, not a rewrite.

- **`arc-session` dispatch (5.4.b) must carry an explicit, named (empty) materialize branch.** IFA fills it
  (`draft-in-flight-awareness.md:106-113`: remote-only in-flight WU → `git worktree add origin/<branch>` +
  `arc user pull` — note this is a use-existing-branch path that does **not** route through the fresh-scaffold
  primitive; it needs `resolveWorktreeLocation` callable on its own + `arc user pull`). Risk is omission: a
  two-branch dispatcher forces IFA to restructure rather than add a branch.

- **Concurrency stub (5.5) factored with a swappable data input; reuse `runWorktreeRoster` /
  `parseWorktreeList`.** IFA swaps the data source (local roster → remote refs + PRs;
  `draft-in-flight-awareness.md:119-124`), Errand Enablement clones the advisory shape for its foreign-artifact
  gate (`draft-errand-enablement.md:69-71`), CWC layers gate doctrine (`draft-concurrent-work-conventions.md:177-187`)
  — all presume a factored advisory step, not inline prose. (Also: CSA's "3 worktree-list parsers" count is
  stale — one shared `parseWorktreeList` exists; don't add a third.)

- **Do NOT let the primitive rework touch `commands/status/run.ts`.** The session-init two-stage probe seam is
  orthogonal to the scaffold primitive and is IFA's + CSA's shared evolution target
  (`draft-in-flight-awareness.md:126-143`); a stray edit there is a three-way collision. The primitive is
  invoked at spawn/cold-start time, not session-init — keep it that way.

- **`errand-launch` is a sibling primitive, not a mode of spawn (5.6).** Spawn always creates worktree +
  Planning meta; an Errand never does (`draft-errand-enablement.md:54,156-157` says "mirrors," not "reuses").
  Phrase 5.6's boundary so EE's author mirrors the architecture rather than extends the spawn primitive.
  ADR-021 stays Proposed (promotion gated on all three cohort PRDs); 5.6 ratifies the cheap-branch floor only.

- **Rename-staleness coordination (5.4.a).** The `arc-resume` → `arc-session` rename creates downstream
  staleness Foundation does **not** sweep: Instruction Optimization audits the skill by literal name
  (`draft-instruction-optimization.md:226`), and backlog drafts cite `arc-resume`. 5.4.a's sweep correctly
  scopes to `.arc/system/**` + `.arc/reference/**` (both copies); backlog drafts refresh at their own promotion.
  Surface this so it isn't a surprise when those drafts are next touched.

- **In-place mode survives as the single-worktree baseline; framed neutrally in the shipped doc (5.1).** The
  5.1 audit question — does in-place have a forward-compatible role given Errands absorbed the incidental
  class? — resolved **yes, retain**. Worktrees are a capability, not a mandate (PRD Goals: "operates correctly
  inside one [worktree]"; usage conventions deferred to CWC), so in-place is the single-worktree posture's
  WU-creation path **and** a no-worktree-creation substrate AWL's atomic-tier-under-`full` init may layer on —
  AWL leaves the mechanism open among three options (`arc start` directly, an `init-work-unit` life-phase param,
  or the conductor absorbing both; `draft-agile-wu-lifecycle.md:358`). R28's "single-worktree /
  **atomic-launchpad**" conflates two things: the
  atomic-launchpad half is an internal forward-pointer (AWL atomic-tier; Errands launch from the launchpad but
  via `errand-launch`, never `init-work-unit`). So the shipped `## Execution Modes` justifies in-place as
  single-worktree **only** and stamps **neither** mode as default (WF must not preempt CWC's when-to-parallelize
  convention). Stale cross-draft note to refresh at its own PRD: `draft-agile-wu-lifecycle.md:366` still calls
  spawn "a thin wrapper over `init-work-unit`" — the Phase 5 ratification moved the mechanics into the primitive
  (spawn wraps the primitive; init's worktree-creating mode also delegates to it).

#### Phase 5.2 audit resolution (2026-05-27)

Pre-implementation audit + a forward-compat scan (config-storage-architecture, customization-arch-realign, AWL,
IFA, CSA, operational-state-docs, doc-naming-convention) closed the open 5.2 specifics. The task list now encodes
them; rationale here.

- **Pure code-render — no bundled meta file.** The Phase-5 "internal/bundled skeleton" is realized as *code*, not
  a `.md`: render the projection from `META_FIELDS` in `meta-reader.ts`; do **not** read the adopter `.arc/`
  `template-meta.md`, and add **no** bundled meta template. A token-template would reintroduce a third drift
  surface (tokens + `META_FIELDS` + parse regex) — the thing ADR-022 removes. The SESSION-NOTES analogy is
  "internal / not-adopter" **only**, not mechanism: the SESSION-NOTES seed is a bundled static file because it
  needs no scaffold-time population; the meta populates (State/Owner/Branch/Next Action), so it is code-render.
  The `.arc/` template's retirement is `operational-state-docs`' migration — leave it in place here.
- **`META_FIELDS` shape = declarative, ordered, extensible.** `{name/label, default, group}` descriptors in
  `meta-reader.ts`; render + round-trip both derive from the one definition. Kept declarative so CSA's zod
  meta-schema **wraps** it (not a rewrite) and AWL (`Tier`, extended `State` enum) / IFA (`Priority`) extend by
  one entry. **Scope is `meta-reader.ts` only** — the duplicate field-parsing in `worktree-roster.ts` (and other
  consumers) is left for CSA / schema-introspection-layer.
- **Round-trip teeth.** With render + parse both keyed on `META_FIELDS`, label drift can't break the pair; the
  round-trip instead guards render-format ⊥ parse-regex — the emitted bullet shape must stay matchable by
  `extractField`, else it fails loudly.
- **Build order b → c → a.** 5.2.a is the create-new *wiring* that integrates the b scaffold + c marker +
  SESSION-NOTES seed + `git worktree add`, so b and c land first. Letters keep meaning (`5.2.b` = meta scaffold)
  — sequenced, not renumbered — to preserve external refs (this file § 5.3.a, ADR-022 § Coordination).
- **Branch base = `branch.base`** (config, default `main`), read from local refs — **not** the spawning HEAD, no
  fetch inside the primitive. config-storage-architecture confirmed `branch.base` + `worktree.location_template`
  stay project-level `arc-config.yml` keys (it relocates only the per-developer keys), so reading them via the
  existing config reader is forward-compatible.
- **Atomicity = rollback.** On any failure *after* `git worktree add` succeeds (meta / seed / marker write), roll
  back — `git worktree remove --force` + delete the new branch — then surface; never a partial, unmarked worktree
  (R29 would misclassify it). This atomicity is the reason the mechanics moved to a CLI primitive over agent bash.
- **"Dirty base" dropped.** Not a `git worktree add` failure — it neither needs a clean source tree nor carries
  its uncommitted changes into the new checkout. Dirty-state is the in-place `git checkout -b` mode's concern
  (5.1), not this primitive's.
- **Breadcrumb dropped.** `runUserOpen` is idempotent and won't overwrite a seeded SESSION-NOTES; a breadcrumb
  would need an append-after-seed step — deferred, not built.
- **"Never under auto-cascade" = skill-layer.** 5.4 invokes the primitive only on explicit `arc-session`; the lib
  unit carries no cascade-guard (nothing would call one).
- **`{repo}` = main-worktree directory basename** for `resolveWorktreeLocation`. Keep `resolveWorktreeLocation`
  standalone and the bare `git worktree add` thin enough that IFA's materialize (`git worktree add <path>
  origin/<branch>`, existing-branch, no `-b`) can reuse it — present as a seam, not built here.

#### Phase 5.2 implementation (2026-05-27) — spawn primitive landed

Built b → c → a. The primitive is `spawnWorktree` in `lib/git/worktree-scaffold.ts` (barrel-exported). Context
for the sessions that build on it:

- **Reuse seam for 5.3 (cold-start).** Worktree-creation and scaffolding are split: `spawnWorktree` runs
  `git worktree add` then calls a file-private `scaffoldIntoWorktree(ctx, path, branch, lifePhase, params)` that
  writes the meta (`renderMetaFile`), seeds SESSION-NOTES (`runUserOpen`), and writes the marker
  (`writeWorktreeOwnershipMarker`). 5.3's use-existing path reuses `scaffoldIntoWorktree` **without** the
  `git worktree add` — export it rather than re-implementing.
- **Injection boundary (for 5.4's handler).** The primitive is the testable core: it takes a
  `{ io: UserIOContext, internalTemplateDir }` context plus resolved params (`wuName`, `spawningIdentity`,
  `baseBranch`, `locationTemplate`, `repo`, `lifePhase?`, `createdByArc?`, `tier?`, `type?`, `now?`). The 5.4
  caller resolves the ambient context: `createUserIOContext()` + `getInternalTemplatePath()`, `branch.base` /
  `worktree.location_template` via the config reader, identity via git config, and `repo` = the main-worktree
  directory basename (no existing helper — resolve it in the handler).
- **`runUserOpen` imported directly** from `commands/user/open.js` into `lib/git/` — no runtime cycle
  (`open.ts` only type-imports `lib/git`), and `worktree-roster.ts` already imports a value from `commands/`.
  Chose this over an injected seam (KISS); revisit only if a cycle ever appears.
- **Rollback is best-effort + git-level only.** On a post-add scaffold failure it force-removes the worktree
  and deletes the branch, swallowing rollback errors so the original failure surfaces. The marker lives inside
  the worktree, so worktree removal cleans it (5.2.c's contract).

#### Phase 5.3.R implementation (2026-05-27) — `arc start --here` cold-start command

The invocation surface `arc-session` reaches for on cold-start. `runColdStart` (`commands/start.ts`) is the
testable core; `handleStart` (`handlers/start.ts`) resolves ambient cwd/branch/identity and reports. Decisions
settled this session, beyond the task-list Outcome:

- **Shape `arc start [name] --here [--from <input>] [-y]`.** Optional positional name → branch slug via
  `branchToWorkUnitSlug` when omitted (refuses a multi-slash / empty derivation, asking for an explicit name).
  `--from` carries the pointer-or-blurb through `parseSpecInput` (issue → Origin, `spec-`/`draft-` → Design,
  else `document` / `description` pass-through for the agent to assess).
- **`--from`, not `--spec`.** Cold-start's input is a "figure out what this is" conservative classify; AWL's
  create-new `--spec` is an explicit "this IS the design spec → Design" set. Different contracts → distinct
  flags, so WF neither pre-empts nor collides with AWL's `--spec`. The positional means "WU name" in both modes
  (required in create-new, optional here) — never overloaded to carry spec input.
- **Agent-invoked, not human-direct.** `arc-session` is the uniform entrypoint; on a bare worktree its 5.4.b
  dispatch runs `arc start --here`. There is no "human runs it, then `arc-session`" path — that's redundant
  double-entry. The command exists because the markdown skill can't call the lib primitive and must not
  hand-write the managed meta. The confirm auto-skips under the agent's no-TTY bash call; a direct terminal run
  still prompts. This corrected the "adopters invoke directly" framing (task entry + AWL draft § composition).
- **One verb, not a separate `arc adopt`.** Splitting was weighed (the `--here` vs create-new flag sets barely
  overlap; `--here` flips the core action + marker semantics). Declined: the command is agent-facing plumbing,
  so human-discoverability — the main pro-split argument — doesn't apply, and the cohort already coordinated on
  `arc start --here`.
- **Active-WU guard.** Refuses (no-throw `{ ok: false }`) when the worktree already holds an active WU —
  defense-in-depth; the dispatch decides resume-vs-cold-start, but the command won't clobber an existing meta.

**Pre-existing break found + fixed (separate commit).** 5.4.a's `arc-resume` → `arc-session` rename missed the
CLI source — `CANONICAL_SKILLS` (`lib/skills/resolution.ts`), a generation JSDoc example, the join restart
hint — plus the matching test expectations, leaving the integration + e2e install tiers red at `f69483a5` (the
unit suite passed only because its skill tests asserted the same stale name). Fixed standalone as `fix(skills):`
(`3e45cfc8`); 5.4.a's "zero remain" sweep was doc-scoped. 5.4.d (hand-sync harness copies) remains open.

#### Phase 5.4.b implementation (2026-05-27, revised) — dispatch home = `session-init`, not the skill

First landed as dispatch prose *in* the `arc-session` skill; reworked after review to live in the
**workflow**. The skill had bolted onto session-init's internal step numbers ("run Step 1, continue from
Step 2") and re-read the `active.resolution` the workflow already forks on — two places, one signal.

- **Single source of truth (B).** `arc-commit` dispatches in its skill because the fork *gates whether the
  workflow loads at all*; `session-init` loads on every entry regardless, so the branch belongs in it.
  `session-init` is already a dispatcher (forks on `active.resolution`, disambiguates multiple metas, orients
  on `none`) and already does pre-context entry handling — branch-gone recovery, which mutates git state and
  re-probes. Cold-start / materialize are the same move, so they sit beside it.
- **Expanded Step 2, no renumber.** Dispatch went into Step 2 (retitled "Dispatch & Conditional Sync") as
  `### Branch-gone recovery (precondition)` → `### Entry dispatch` → `### Conditional sync pulls`. *No* step
  renumber — renumbering is high blast-radius (`contributor.md` welded to "Step 3 item 7+,
  Step 5, Step 6"; `DEV-RULES.ARC` "item 10"; extension docs). Steps 3–7 keep their numbers; cross-file
  citations stay valid.
- **Four arms.** resume / orient continue into the sync channels + context-load; cold-start / materialize
  mint or fetch state → re-run the Step 1 probe → re-enter as resume. Orient is *not* a separate arm — it's
  resume with no active WU, handled by Step 5 discovery.
- **Named `Entry dispatch` step — the forward-compat seam.** The dispatch surface is a named heading (slug
  `#entry-dispatch`), a stable reference target for IFA / `composable-workflows`, not a buried sub-bullet.
  Learned via the pre-commit hook: the `· #name` heading tag is the *extension fire-point* marker (validated
  against `system/extensions/`), so it can't double as a general anchor — `#entry-dispatch` is just the
  markdown heading slug. The systemic ordinals→anchors fix (heading slugs or a codified scheme, **not** the
  extension syntax) is captured for `composable-workflows` (USER-INBOX § Backlog): cross-file step citations
  are brittle (the `contributor.md` welding + already-stale extension refs are the evidence).
- **Materialize stays dormant + WU-name-free.** session-init ships (`.arc/system/**` + package template), so
  the arm is present-tense and IFA-name-free; it never fires under WF's probe (no remote-only-WU signal).
  Rationale (seam for IFA, omission risk) lives here, not in shipped prose.
- **Skill thinned to a pointer** (both copies); R10 + walkthrough scenario 3 reframed (dispatch home =
  workflow). **Scope:** dispatch only — optional-arg pre-seed (5.4.c: thin skill forwards `/arc-session
  <pointer>` → cold-start's `arc start --here --from`) and harness hand-sync (5.4.d) remain open.

#### Phase 5.5 implementation (2026-05-27) — concurrency-check stub

Shipped as a shared `in-flight-scope-check.md` fragment over a new `arc active roster [--json]` command
(`commands/active/roster.ts`, reusing `runWorktreeRoster` + `filterRosterByIdentity`), referenced by the spawn
(`init-work-unit`) and cold-start (`session-init`) surfaces. Detail in the task-list Outcome.

- **`composable-workflows` forward-compat seam.** The fragment is an *unconditional* shared step (runtime
  degrade-on-empty, not load-time config resolution), composed by a reference link — the right mechanism for an
  always-invoked step, and distinct from `composable-workflows`' resolve-then-load machinery, which targets
  *conditional* mode/tier spokes. Granularity already matches the draft's "extract whole steps" rule. If that
  WU later generalizes declared-load + fire-points to all fragments, this fragment's invocation is a mechanical
  migration candidate (reference link → declared load) — nothing to pre-invest now, and inventing a load
  mechanism here would be the "new machinery" the draft warns against. Pairs with the `#entry-dispatch` anchor
  seam above.

### Phase 6 (deferred) — `/arc-shift`

Deferred at start of execution (2026-05-28). The implementation notes previously captured here (return-intent
same-session re-orient; `runDirtyStateStatus` for the uncommitted-work gate) are moot for this WU. The
surviving narrow design — preserved use case, PR-review-checkout alternative framing, workflow +
thin-dispatcher implementation shape, and the cohort-end fallback decision tree — lives in
`cohort-agile-parallelism.md` § Deferred — `/arc-shift`. The cohort owns any revival decision.

### Phase 7 — lifecycle, retirements, drift

- **Package workflow suffix map (`.md` vs `.template.md`) — affects every "(both copies)" workflow edit.**
  Package `.template.md`: `session-init` (Phase 2), `session-handoff` (7.1d), `2_generate-tasks` +
  `3_process-task-loop` (7.4 sweep). Package plain `.md`: `1_create-spec`, `session-loop`, and all
  work-unit-lifecycle ceremonies (`activate` / `deactivate` / `integrate` / `verify` / `archive`-work-unit,
  `manage-incidental-work`). Edit the matching suffix; the `.arc/` copy is always plain `.md`.
- **The R32 atomic-sweep found-list.** Live companion-type refs beyond the task's named anchors:
  `strategy-planning-module.md` (~17 refs incl. a § link), `strategy-file-classification.md` (the `atomic-`
  file-type registry row), `strategy-work-organization.md` (§ Directory Structure row — `atomic-<name>.md`),
  `strategy-session-operations.md` (shape analogy — reword, don't delete), `3_process-task-loop.md` (package
  `.template.md`) (routing instruction), `DEV-RULES.PROJECT.md` (capture-routing row), `AGENT-BRIEF.ARC.md` +
  `AGENT-BRIEF.CONTRIBUTOR.md`, `completed/README.md`, `templates/user/USER-INBOX.md` (shape analogy + § link),
  and `backlog/ATOMIC-INBOX.template.md` (§ cross-link that dangles when the § is removed). **Out of scope:**
  docs-site (`docs/` — dedicated docs WU), historical ADRs, internal analysis docs, and this WU's own `spec-*`.
  **Preserve:** the shared `ATOMIC-INBOX` surface, `USER-INBOX § Atomic`, and atomic-character refs (tier-shape
  mentions in `strategy-work-organization.md` § Spec-Flow Invariants ~L133 and § Archival ~L353 are
  tier-character, not companion-type — preserve). Reword dangling §-links rather than deleting target surfaces.
- **`integrate-work-unit.md` is verify-only for the sweep** — its only `atomic` refs are the protected
  `§ Atomic → ATOMIC-INBOX` surface, no companion ref.
- **`Spawned:` field does not exist** in `manage-incidental-work` or `template-meta` (only `Interrupts:` /
  `Paused At:` / `Paused To:`) — neutralize the three that do.
- **7.5a is a full state-table rewrite + Superseded disposition + paired integrate sub-section update.**
  `strategy-work-organization.md` § Work Unit State table (`In Progress` / `Paused` / `Waiting-For` /
  `Complete` / `Superseded`) contradicts the 4-state machine (`Planning | Active | Integrating | Shipped`) on
  every row — rewrite the whole enum table (+ the Optional Pointer Fields sub-table). **Superseded
  disposition:** drop as a state value, retain as an Optional Pointer Fields annotation (`**Superseded By:**`)
  on WUs whose remaining scope was absorbed by a successor (state flows Integrating → Shipped normally).
  `integrate-work-unit § Handling Partially Superseded Work` updates in lockstep to set the annotation, not a
  state value — both edits land in the same commit (interfaces are paired). **Wholesale rejection deferred:**
  the "executed-work-but-undo-and-archive" case isn't addressed here — defer for demonstrated need; 7.5.b's
  Case B fill keeps Case B open as the future expansion slot.
- **Template-as-authority requalification (7.5a) — ADR-022 alignment.** 7.5a originally framed the 4-state
  machine as "contradicts / aligns to `template-meta.md`." ADR-022 reassigns the state-enum + legal-transition
  authority to a code-owned record (the template becomes the render skeleton); its Coordination set already
  requalified the identical "authoritative in `template-meta.md`" line in `cohort-agile-parallelism.md`, but
  that propagation was scoped to Task 5.2 and never reached Phase 7. Fix constraint: 7.5a's edit targets
  (`strategy-work-organization.md` + `integrate-work-unit.md § Handling Partially Superseded Work`) are
  **adopter-facing**, so — unlike the internal cohort file, which names the schema — these stay
  **authority-neutral**: present the four state values as the enum, don't assert the template is their SoT,
  and don't name a schema WF hasn't built. The values are stable across the migration; only structural
  ownership moves. Neutral phrasing now spares `operational-state-docs` a re-sweep of these shipped docs
  later. (7.2 originally inherited this concern but moved to decisive deletion — no in-place State: alignment
  remains.)
- **7.5a outcome — Superseded dropped, not retained (decision pivot during impl).** The plan assumed
  `integrate-work-unit § Handling Partially Superseded Work` still existed and would be updated in lockstep to
  set `**Superseded By:**` as an annotation. It doesn't: that § (and § Appendix) were removed in the integrate
  restructure (`cab193e9`, ~30 commits before Phase 7), so the strategy doc's enum-row + pointer-field cross-refs
  were dangling. A framework-wide sweep found the `**Superseded By:**` field had zero live setters/readers and
  wasn't in `template-meta.md` — pure speculative doc-machinery that bit-rotted unnoticed. Decided (with the
  maintainer) to **drop it entirely** rather than reanimate the workflow handling: dropped the `Superseded
  (partial)` state row AND the `**Superseded By:**` Optional Pointer Fields sub-section (its only row). Rationale:
  the deliberate-supersession-vs-abandonment distinction is real but a *predecessor-side* forward-pointer is the
  wrong carrier — it dies on Case A-delete (reflog-only, no `completed/` doc) and goes stale on partial-ship.
  Provenance is better carried *successor-side* (`Origin:` "supersedes/continues Y", forward-natural + durable)
  plus completion-doc / deactivate-commit narrative, and the task-level `[~]` marker already covers per-task
  supersession. Any structured supersession metadata deferred to demonstrated need (YAGNI). No `integrate`
  edit — it already tracks reality.
- **7.5c literal anchors + init-work-unit regen step + activate framing touch.** Edit the § ROADMAP step-4
  In-Flight definition (currently `**In Flight** — State: Active | Integrating`) to location-based — a WU
  located in `active/**` is in flight regardless of state. Correct the Regeneration "Activation" bullet
  (`active/ ⟹ State: Active` is planner shorthand, not doc text) — reframe activation as self-healing regen
  against the location-based tier. **Init-work-unit edit:** add a ROADMAP regen step at the end of init's
  directory-move work (Step 3 Path A and other paths populating `active/<wu>/`) — that's where the WU enters
  In Flight under the new definition. **Activate-work-unit framing touch:** Step 7's existing regen stays as
  self-healing redundancy (re-renders same tier state); text shifts from "moves the WU into the In Flight
  tier" to "refreshes ROADMAP." ROADMAP regen is doc-only (NO render code — hand-maintained); 7.5c carries no
  tests.
- **7.1c / 7.1d are extend-existing, not net-new.** **7.1c is `[~]`** (audit-confirmed during Phase 7
  pre-impl): `arc user open` is already present defensively in `activate-work-unit` Step 5 (idempotent
  reaffirm, post branch-rename); no net-new content. **7.1d is the symmetry insert** — `session-handoff`
  already surfaces worktree context via probe-1's `worktree` slot + the pre-composed `recommendedSummaryLine`;
  what's missing is the linked-worktree header insert in Confirm Handoff mirroring `session-init` Step 6.
  Probe slot already populated — no probe extension needed; just the header-line edit, gated on
  `kind === "linked"`.
- **`manage-incidental-work` carries other stale drift** consistent with 7.2's neutralization: a
  `status-{parent-name}.md` reference (stale `status-` prefix → `meta-`) and non-4-state `State:` values
  (`Paused` / `In Progress`). All non-4-state `State:` values lived inside § Coordinated Pause/Resume — 7.2's
  decisive deletion handles them; no in-place alignment remains.
- **7.1.a workflow-driven post-merge cleanup + termination shape.** New step at integrate's post-merge tail is
  workflow-driven (pre-merge `integration-interlock` covers approval; no second prompt fires). On `removable`
  (7.1.f's renamed return): execute `cd <other-worktree> && git worktree remove <wu-path> && git branch -d
  <wu-branch>` in one bash invocation. Agent's cwd ends up dangling (deleted dir) — fine because integrate IS
  terminal for the WU. Workflow concludes with explicit "session ends here" framing; no Next Action pointer
  (would lead the agent into dead cwd). Local branch cleanup rides the same step — `-d` lowercase
  (merged-only-safe).
- **R34-free surface-text constraint.** Per DEV-RULES.ARC § Documentation Boundaries, workflow text can't
  reference planning-artifact IDs (R-numbers, task IDs). 7.1.a's surface text describes the stale-worktree
  check by behavior ("the stale-worktree check at the next main-worktree session-init"), not by ID. Same
  applies wherever workflows reference the sweep mechanism. Spec / notes / drafts can use R34 freely (planning
  context); workflows (durable docs) cannot.
- **7.1.b + 7.1.f — abandonment authorizes removal of unmerged work.** Case A-delete is the explicit user act
  authorizing removal of unmerged work, which R29's existing decision fn (gated on `merged`) would surface as
  `blocked`. 7.1.f extends the fn with `context: 'shipped' | 'abandonment'`; abandonment context skips the
  merge gate (marker + clean → `removable`). 7.1.b's marker-present multi-worktree variant consumes this;
  marker-absent path stays as the existing single-worktree in-place sequence (no worktree to remove).
- **7.1.f rename rationale.** Action-prescriptive names (`offer-remove` / `surface` / `advisory`) were
  coherent when callers behaved similarly; integrate's workflow-driven auto-execute breaks the pattern.
  State-descriptive names (`removable` / `blocked` / `external`) describe the worktree's removability *state*
  — each caller chooses action per its approval model (integrate's pre-approved auto-execute, branch-gone's
  user-offer, sweep's user-offer, Case A-delete's deactivation-approved auto-execute). Future callers compose
  without re-litigating the API.
- **`manage-incidental-work` eventual fate.** `draft-instruction-optimization.md` (agent-context-optimization
  cohort) carries the cross-ref: "whether this workflow survives as a workflow vs. folds into always-loaded
  DEV-RULES routing + a design-time strategy is this WU's / `documentation-surface-routing`'s ownership call
  — not a mere table-compression." 7.2's decisive deletion of § Coordinated Pause/Resume aligns with that
  trajectory — neutralize the mechanic now, defer the deeper reshape. Don't invest in replacement prose for
  an § that may not survive.
- **7.6 — `arc log atomic` repointed to `standalone`, not retired.** The carried 7.4 follow-up (companion
  doc-refs swept, CLI code path unchecked) surfaced wider than a file glob: the commit-msg hook still validated
  the retired `Context: atomic-{name}.md` companion footer (and checked for the now-never-created file), and
  `arc log atomic` greped both that and `(atomic / no associated task list)` — the latter long superseded by
  the `standalone (...)` anchor (ADR-012 → `commit-footer.md`). Both search targets were dead. Retire vs.
  repoint: repointed, because nothing else surfaces off-WU history and the command + handler + test scaffold
  already exist (reuse over rebuild-later). Renamed `atomic` → `standalone` (no back-compat alias — the old
  footer is gone), `--work-unit` (matched `atomic-{name}`) → `--category` (the four standalone categories).
  7.6.a's hook-test move (`commit-msg-footer` atomic-* positive → negative) rode with 7.6.a via amend after the
  full suite first caught it red. ADR-012 kept as immutable history; `contribution (...)` and the `arcd-rebrand`
  provisional draft scoped out (the latter reconciles its own command set when that WU is worked).
