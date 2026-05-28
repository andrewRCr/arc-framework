# Task List: Worktree Foundation

- **Design:** `spec-worktree-foundation.md`

---

## **Phase 1:** Worktree conventions & ownership marker

_Purpose:_ Land the small, well-specified primitives every later phase depends on — the worktree branch posture
in `branch-format`, the worktree location-template config key, and the machine-local worktree-ownership marker.
Nothing upstream; built first so the entry verbs resolve locations and apply naming, and every cleanup site
gates against one settled decision.

_Design decisions:_ A WU branch is a WU branch regardless of which worktree checks it out, so there is no
separate worktree branch-naming convention — `branch-format`'s existing type-set and `plan/` prefix already
govern ARC-created worktree branches. 1.1 therefore states the worktree posture in `branch-format`'s default
section (ARC-authored: the convention applies to ARC-created branches; externally-arrived branches are
advisory) rather than adding a parallel method or a `branch.naming_convention` key; adopters override it through
the method's existing override machinery (the `.override` section, untouched here). The worktree location (1.2)
— genuinely worktree-native, with no analog in `branch-format` — is a **config key** (`worktree.location_template`),
not a method: the value is consumed by code (the path-resolution helper) and belongs with ARC's other
code-consumed config values, not in `system/methods/`. The marker (1.3) is a new lib. 1.1's override resolves
agent-side (read the `branch-format` markdown); 1.2's resolves code-side (read the config key). So only the
string/path mechanics (template expansion, marker round-trip, gating decision) carry `test-first`. The marker
ships with its call sites wired later: written at spawn / cold-start (Phase 5), consulted at the branch-gone
cascade and sweep (Phase 2) and the ceremonies (Phase 7).

_New config keys register across multiple sites_ — `arc-config.yml` (both copies), `commands/config/types.ts`
`ConfigSettings`, `lib/config/status-reader.ts` (`DEFAULTS` + `ENUM_VALIDATORS` / `AGENT_CONSUMABLE_KEYS` as
applies), and `.internal/scripts/validate-config.sh` `known_keys` (both copies). See
`notes-worktree-foundation.md` § Phase 1.

### `[x]` **1.1 Worktree branch posture in `branch-format` (existing convention + external-mismatch advisory)**

- _Goal:_ `branch-format`'s existing convention is affirmed to govern the branches ARC creates in linked
  worktrees, and an advisory warns — rather than refuses — when a branch arrives not matching it, so ARC
  composes with externally-created branches without relocating or rejecting them.

    - `[x]` **1.1.a State the worktree posture in `branch-format`'s default section** (both copies)
        - Added a `**Worktree branch posture:**` paragraph to the `.default` section: the existing type set and
          `plan/` prefix govern ARC-created worktree branches exactly as in the primary checkout. No separate
          convention and no `branch.naming_convention` key; the `.override` section is untouched, so projects
          customize through the existing override mechanism.

    - `[x]` **1.1.b Advisory warn-on-external-mismatch**
        - Same paragraph states branches ARC did not create are advisory only — ARC warns on a convention
          mismatch but never refuses or relocates them. Doc-behavior: there is no branch-name validator to
          hook, so the posture is the deliverable and there is no code path.

### `[x]` **1.2 Worktree location template config key (`worktree.location_template`)**

- _Goal:_ ARC resolves a worktree's filesystem path from a configurable template (default `../{repo}.{branch}`,
  slashes → `-`) at creation time, reads external worktrees' locations from `git worktree list` without
  enforcement, and treats the path as a creation-time artifact decoupled from later branch renames.

    - `[x]` **1.2.a Register the config key + inline supporting docs**
        - Registered `worktree.location_template` (freeform; default `../{repo}.{branch}`) across both
          `arc-config.yml` copies — a new `# --- Worktree ---` section carrying semantics, the three override
          examples (in-repo, centralized, home-rooted), and the branch-rename-decoupling + slug-collision notes —
          plus `ConfigSettings`, `status-reader.ts` `DEFAULTS`, and both `validate-config.sh` `known_keys` lists.
          Default-in-code, so no `ENUM_VALIDATORS` entry and no `classification.ts` registration (no method file). [R27]

    - `[x]` **1.2.b Template-resolution logic**
        - New pure helper `lib/git/worktree-location.ts` (`resolveWorktreeLocation`, re-exported via
          `lib/git/index.ts`) expands `{repo}` / `{branch}`, slugging branch separators to `-`. It reads no
          ambient git state, so the resolved path is a creation-time artifact — callers persist it (and read
          live locations from `git worktree list`) rather than recomputing on a branch rename. Reading external
          locations and never relocating stays doc-behavior, not code.

### `[x]` **1.3 Worktree-ownership marker primitive**

- _Goal:_ a machine-local, gitignored marker records that ARC created a worktree, and one gating-decision
  function turns (marker presence × clean × merged) into the correct cleanup action at every call site — with
  no cross-machine reconciliation.

    - `[x]` **1.3.a Marker schema + write/read lib**
        - New lib `lib/git/worktree-marker.ts` (re-exported via `lib/git/index.ts`): the `WorktreeMarker` schema
          (`{ spawnedByArc, wuName, spawningIdentity, createdAt }`) plus `writeWorktreeMarker` / `readWorktreeMarker`
          / `resolveWorktreeMarkerPath` / `isWorktreeMarker`. `read` returns a `present | absent | malformed` union
          so absence (ENOENT) is "no marker", not an error — the signal 1.3c gates on; `atomicWriteJson` creates the
          `.internal/` parent. Identity-agnostic path (no `{identity}` segment, per R29).

    - `[x]` **1.3.b `.gitignore` entry** (generated, not static)
        - Added `.arc/system/.internal/worktree-marker.json` beside the `pristine.json` line in all five
          managed-gitignore arrays — `commands/{init,reconfigure,update}.ts` + `commands/join.ts` (×2). The
          rendered `.gitignore` re-generates on the next init/update/reconfigure; the `join.ts` sites keep the
          marker untracked on the `arc join` contributor path (R29 never-synced). Existing `toContain` gitignore
          assertions stay valid — no test changes needed.

    - `[x]` **1.3.c The single gating-decision function**
        - New `lib/git/worktree-cleanup.ts` (re-exported via `index.ts`): pure `decideWorktreeCleanup` maps
          (marker × clean × merged) → `offer-remove` (present + clean + merged) | `surface` with reason
          `uncommitted` or `unmerged` (present but not removable — never auto-removes) | `advisory` (absent
          _or_ malformed marker ⇒ externally-managed). The real `merged` input is `isBranchMerged` via `git
          merge-base --is-ancestor` (exit 0 → merged; non-zero/error → not merged); the unpushed case folds
          into `merged: false`. `clean` stays the caller's `dirty-state.ts` result.

- _Outcome:_ The marker primitive ships end-to-end — write/read lib, managed-gitignore registration, and the
  single cleanup-gating fn — so every later removal site (branch-gone cascade, sweep, integrate) gates on one
  settled decision. The greenfield `merged`-check is real (`git merge-base --is-ancestor`), so 2.4b / 2.7b / 7.1
  build on a real signal, not a stub. Known boundary: `--is-ancestor` reads squash/rebase merges as not-merged.

## **Phase 2:** Worktree-aware session-init & branch-gone recovery

_Purpose:_ Make the session-init probe worktree-aware, turn the silent `remote-unavailable` branch-gone failure
into a recoverable candidate-bearing state, and add the main-anchored stale-worktree sweep — while keeping the
resume common path latency-unchanged (heavy work fires only in its triggering branch).

_Design decisions:_ WOR's cross-worktree roster already exists as `runWorktreeRoster`
(`lib/git/worktree-roster.ts`) but is not yet wired into the probe — 2.3 integrates it, gated to the
branch-gone / no-WU branch. branch-gone (2.2) is detected by classifying the failure of the bounded fetch the
probe already runs, so detection adds no fetch. The cascade (2.4) and sweep (2.7) consume the Phase 1 marker's
gating decision. R7's forward-compat (trivializes to one worktree) rides with the cascade rather than as a
separate task.

_Note:_ the package copy of the session-init workflow is `session-init.template.md` (not `session-init.md`) —
every "(both copies)" edit below targets the `.template.md`. The conditional-roster wiring (2.3) is a
deliberately minimal two-phase seam designed to be absorbed by In-Flight Awareness's orchestration-model
evolution; keep it clean and self-documenting, do not build a general slot framework here. _Notes:_ See
`notes-worktree-foundation.md` § Phase 2.

### `[x]` **2.1 Worktree-identity detection in the probe**

- _Goal:_ session-init orientation names which physical worktree the session is in when it is non-primary,
  derived cheaply and always-on from one `git rev-parse` in the existing probe pass.

    - `[x]` **2.1.a Probe-side detection** (`lib/git/` + `commands/status/run.ts`)
        - New `lib/git/worktree-identity.ts` (`resolveWorktreeIdentity`): primary-vs-linked by comparing
          `git rev-parse --git-dir` against `--git-common-dir` (equal ⇒ primary), `--show-toplevel` supplies
          the linked path. Local rev-parse only — no fetch. Fired as a dedicated `worktreeIdentity` probe
          slot and folded onto the worktree envelope value in `run.ts`; defaults to `{kind: "primary"}` when
          the probe fails.

    - `[x]` **2.1.b Orientation surface** (session-init workflow, both copies)
        - Orientation header gains a `` · `worktree: {path}` `` segment when `identity.kind === "linked"`;
          `value.identity` documented in the Step 1 probe-field table. Both copies (`session-init.md` +
          `session-init.template.md`).

- _Outcome:_ Identity rides a separate probe slot rather than folding into `runWorktreeSyncStatus` — that
  module is a distinct concern (HEAD-vs-origin) whose tests assert exact git-call counts an extra rev-parse
  would break. The datum nests under `worktree.value.identity`; it is not a top-level envelope slot.

### `[x]` **2.2 `branch-gone` probe state (split from `remote-unavailable`)**

- _Goal:_ a deleted-upstream branch is reported as a distinct `branch-gone` state instead of being masked as
  `remote-unavailable`, by classifying the failure of the bounded fetch the probe already runs (no new fetch,
  no added latency).

    - `[x]` **2.2.a Detection** (`lib/git/worktree-sync.ts`)
        - `boundedFetch` now returns a `FetchOutcome` union with `branch-gone`; `isBranchGoneError` duck-types
          the rejection (exit 128 + "find remote ref" stderr, mirroring `gitMergeFile`'s `.stdout` read off
          `unknown`). `runWorktreeSyncStatus` maps it to a distinct `branch-gone` state carrying no
          `failureReason`; timeout / network / auth stay `remote-unavailable` as before.

    - `[x]` **2.2.b Recommendation + exhaustiveness wiring** (`lib/session-init/recommended-action.ts`)
        - `inferWorktree` surfaces `branch-gone` (same verb as `remote-unavailable`; recovery stays a
          state-keyed workflow arm, not a new `recommendedAction` member). `session-init` workflow state-list
          updated in both copies (`.md` + `.template.md`).

- _Outcome:_ the split touched six consumers, not the two the type's named call sites implied. Compiler-forced
  exhaustive switches: `inferWorktree` + `status/format.ts`. Not compiler-forced (Sets / `default`-bearing, so
  caught only by tests/reasoning): `handlers/sync.ts` (two worktree-block Sets + the `REFUSED_SYNC_CELLS`
  string-set + two guidance switches) and `sync-status.ts`'s qualifier line. `arc sync` behavior is preserved
  deliberately — a deleted-upstream branch was previously masked as `remote-unavailable`, which sits in both
  block-sets and the refused-cell set, so `branch-gone` inherits the same push-blocking (else `sync` would
  silently start auto-recreating deleted branches) with accurate wording instead of "retry when reachable".
  Guard rows added to the orchestrator `it.each` tables cover the string-keyed set the compiler can't.

### `[x]` **2.3 Pre-computed in-flight roster in the probe**

- _Goal:_ in the branch-gone / no-WU branch only, the probe pre-computes an identity-filtered in-flight roster
  in one local pass by wiring WOR's existing `runWorktreeRoster` into the envelope — so the entry skill reaches
  the recovery prompt in a single turn.

    - `[x]` **2.3.a Wire roster into the probe** (`commands/status/run.ts`, `commands/status/types.ts`)
        - Two-phase seam in `runSessionInitStatus`: the eager `Promise.all` stays phase 1; a gated phase 2 fires
          the roster only when `worktree.state === "branch-gone"` or `active.resolution === "none"`, wrapped in
          `safeProbe` and omitted entirely (no scan) on the clean resume path. New required `roster` probe on
          `SessionInitProbes` (orchestrator owns the firing decision, mirroring `worktreeIdentity`); optional
          `roster?: Probe<WorktreeRosterResult>` envelope slot. `handlers/status.ts` binds `runWorktreeRoster`
          (over `node:fs/promises`) plus the new `filterRosterByIdentity`.

- _Outcome:_ `filterRosterByIdentity` (`lib/git/worktree-roster.ts`) is team-mode-gated — solo mode and absent
  identity are pass-throughs; team mode drops other identities but **keeps unattributed worktrees** (admin /
  main / meta-less checkouts carry no `**Owner:**`, so they have no identity — they are the "stranded in main"
  recovery signal the 2.4 cascade reads, not someone else's WU). The team-mode flag is read handler-side from
  `team.mode` in resolved settings, since the session-init envelope's config slot intentionally doesn't expose
  it; the orchestrator stays purely a gate. Slot is produced but unconsumed until 2.4.

### `[x]` **2.4 Branch-gone resolution cascade**

- _Goal:_ on branch-gone, a deterministic cascade produces high-confidence recovery candidates — stopping and
  prompting rather than guessing under ambiguity — and trivializes to a one-candidate resolve in the
  single-worktree case so it ships value pre-worktree-adoption.

    - `[x]` **2.4.a Cascade resolution logic + output contract** (`lib/session-init/branch-gone-cascade.ts`)
        - `resolveCascade` + the `resolved` / `surface` / `main-fallback` union (candidate carries
          `{ branch, worktreePath?, proposedAction }`). Pure tier walk — worktree candidates, then recent
          branches; first non-empty tier decides (lone → resolved, ≥2 → surface), all-empty → main. R7 is the
          single-entry path, not a special case; `proposedAction` is carried for 2.4.b to fill, not read here.

    - `[x]` **2.4.b Per-worktree action determination** (`lib/session-init/branch-gone-cascade.ts`)
        - `determineCandidateAction` maps a candidate worktree to its `proposedAction`: main/admin → `switch`;
          else via `decideWorktreeCleanup` — shipped-clean (merged + present marker) → `offer-remove`, live WU
          (uncommitted / unmerged) → `switch`, untrustworthy marker (absent / malformed) → `advisory`. Pure
          mapping; per-worktree `{ marker, clean, merged }` gathering is 2.4.c's I/O. `proposedAction` dispositions
          each _candidate_ worktree (`isMainOrAdmin` = roster `metaFilePath` absence); the current branch-gone
          worktree's own teardown is the stale-worktree sweep's job, since a worktree cannot self-remove.

    - `[x]` **2.4.c Signal gathering + probe `recovery` slot wiring**
        - `recent-remote-branches.ts` (`runRecentRemoteBranches` — `for-each-ref --sort=-committerdate`, 30-day
          window, `origin/HEAD` filtered) + `branch-gone-recovery.ts` (`runBranchGoneRecovery`): consumes the
          resolved roster, gathers per-WU-worktree marker/clean/merged (cwd-scoped `status`, `isBranchMerged`),
          folds in the recent-branch tier (gone / base / worktree-represented excluded), resolves. Wired into the
          probe as the gated `recovery` slot — branch-gone only, and only when the roster slot resolved (one
          roster computation, two consumers) — extending 2.3's two-stage seam.

    - `[x]` **2.4.d Session-init workflow doc** (both copies)
        - Added the `recovery` slot to the Step-1 probe-field table and a Step-6 branch-gone arm rendering the
          pre-computed candidates as a single recovery prompt, branched on `recovery.value.kind` (`resolved` →
          offer, `offer-remove` → remove + archive; `surface` → choose; `main-fallback` → offer `main`). Both
          copies (`session-init.md` + `session-init.template.md`).

- _Outcome:_ branch-gone recovery is a gated `recovery` envelope slot (branch-gone only, consuming the 2.3
  roster — one computation, two consumers) layered over a pure resolver (`branch-gone-cascade.ts`: tier walk +
  the `resolved` / `surface` / `main-fallback` contract + per-candidate action mapping) and an I/O assembler
  (`branch-gone-recovery.ts`: recent-branch gather + per-worktree marker/clean/merged). The session-init Step-6
  arm renders it as a single recovery prompt (Task 2.5 relocates this render to an early gating action ahead of
  sync/load, leaving the Step-6 arm as narration — completing R4's ordering reversal). Slot-over-subcommand
  rationale: commit `ab572dec`.

### `[x]` **2.5 Branch-gone recovery relocation & sync ordering (git-align before sync + load)**

- _Goal:_ under branch-gone, recovery (fetch → resolve target via cascade → switch) runs as an early gating
  action right after the Step-1 probe detects it — ahead of the sync pulls (Step 2) and context-load (Step 3),
  which re-run against the recovered branch — rather than the Step-6 orientation render Task 2.4.d landed. This
  satisfies R4's ordering reversal: notes / metas / companions are never read against the deleted branch.

- _Outcome:_ The recovery action — the full rendering contract (`resolved` / `offer-remove` / `surface` /
  `main-fallback`) and the prompt — moved into a new Step-2 gating block that runs before both sync channels
  and Step-3 context-load; on switch it fetches the target if needed, then re-runs the Step-1 probe so the rest
  of init dispatches against the recovered branch. Step 6's branch-gone arm dropped to narration for the
  declined / deferred case (consistent now with its sibling conditional sections), and the `recovery`
  probe-field row re-points to Step 2. Both copies; R4 reworded to match.

### `[x]` **2.6 Dual-axis Step 7 trust refactor**

- _Goal:_ session-init's single trust hierarchy splits into two axes — _truth of work state_ (git
  authoritative, narrowed to "was this actually committed?") and _which work am I picking up_ (identity-filtered
  metas + worktree list authoritative) — with the existing mismatch examples redistributed and notes
  deliberately absent from the roster axis.

    - `[x]` **2.6.a Refactor the trust-hierarchy section** (session-init workflow, both copies)
        - Replaced the single git > task-list > meta > notes hierarchy with two named axes; the task list,
          meta, and notes became _claims_ verified against git on Axis 1.

    - `[x]` **2.6.b Redistribute mismatch examples**
        - Tagged each example by axis: the meta-vs-committed and diverged-worktree cases plus the
          uncommitted-changes ambiguity → Axis 1; the meta-points-to-missing-task case → Axis 2.

- _Outcome:_ Step 7 is now two axes over an orthogonal auto-recover / stop-and-ask escalation. Axis 2 names the
  same authority the Step-2 branch-gone recovery uses (identity-filtered metas + worktree list), with notes
  explicitly excluded as context-not-roster — closing the conceptual loop with Task 2.5's relocation. Both copies.

### `[x]` **2.7 Stale-worktree sweep at main-worktree session-init**

- _Goal:_ a main-worktree session-init cross-references `git worktree list` against main's `completed/` and
  surfaces any lingering worktree whose WU has shipped for marker-gated cleanup — closing the spawn-on-A /
  integrate-on-B / never-reopen-A gap — without scanning siblings on the resume-a-WU path.
- **Strategies:** `strategy-session-operations.md`

    - `[x]` **2.7.a Sweep logic**
        - The shipped-WU predicate lives in `lib/work-unit/completed-index.ts` (neutral home, not under
          `session-init/`, since 4.2's retired-subdir reconciliation shares it): `readShippedWorkUnits`
          scans every `completed/<quarter>/NN_<slug>` dir into a slug set; `branchToWorkUnitSlug` strips the
          type-prefix (`feat/foo` / `plan/foo` → `foo`, no-`/` → null); `isShippedWorkUnit` joins them.
          All-quarters scan — a lingering worktree's WU may have shipped in any quarter.
        - `findStaleWorktreeCandidates` (`lib/session-init/stale-worktree-sweep.ts`) cross-refs the reused
          roster (`runWorktreeRoster`) against the slug set, returning shipped-WU entries; empty when
          `worktreeIdentity.kind !== "primary"` so the linked-worktree resume path never scans siblings.

    - `[x]` **2.7.b Marker-gated surfacing + workflow doc**
        - `runStaleWorktreeSweep` enriches each candidate with marker / clean / merged and maps them through
          the shared `decideWorktreeCleanup` (offer-remove / surface / advisory) — never auto-removing without
          the marker-gated clean-and-merged guard. `isWorktreeClean` extracted to `worktree-cleanup.ts`
          (sibling of `isBranchMerged`) and now shared with branch-gone recovery.
        - Wired as a primary-gated `sweep` envelope slot (`run.ts` widens the roster gate to also fire in the
          primary worktree; `types.ts` slot + probe; handler `sweep` probe binds cwd / base branch / fs).
          Documented in both session-init workflow copies: Step 1 probe-field table row + a Step 6
          "Stale worktrees" orientation section.

- _Outcome:_ Closing the spawn-on-A / integrate-on-B / never-reopen-A gap, the roster scan now fires on every
  primary-worktree session-init (the main-on-main cadence bounds the lingering window) while the linked-worktree
  resume path stays scan-free; one roster computation feeds both branch-gone recovery and the sweep. Existing
  roster-gating tests that conflated "clean resume" with the primary worktree were re-pointed at the linked
  worktree, the genuine cheap path.

## **Phase 3:** Cross-WU sync — load & merge

_Purpose:_ Establish the correct per-WU-isolated load substrate and cross-WU entry merge before the entry verbs
build on it — path-driven sync-class dispatch, per-WU subdir load (which fixes the spawn → first-load
overwrite), per-file entry-union merge, and tombstones for deletions.

_Design decisions:_ Layers on WOR R65's `user/` structure and the existing `arc user` save/load family
(`lib/git/user-sync.ts`, `commands/user/save-load.ts`, `findNearestUserNote`). This phase precedes the spawn
primitive (Phase 5) so spawn lands on a correct load — 3.2 is the fix behind the "spawn returns to origin"
success criterion.

_Forward-compat (verified against downstream drafts):_ all new code lands in `lib/user-sync/*`
(`classifier.ts`, `notes-ref.ts`, `parser.ts`, `merge.ts`, `types.ts`), not inlined in `save-load.ts` — this
preempts `user-sync-module-split`'s consolidation and gives `cli-substrate-adoption` a clean schema
co-location; `findNearestUserNote` + the N-most-recent reader relocate to `notes-ref.ts`, with `save-load.ts`
keeping thin orchestration. New parsers/readers return **discriminated outcomes**
(`{ ok: true, … } | { ok: false, reason }`) over plain typed structs, **no throw** on expected failure
(note-not-found, malformed entry, no notes ref), each git command in its own named fn — leaving the
zod / `Result` seam for `cli-substrate-adoption`, not pre-building it. The load is a **two-read model**: per-WU
files from the one note resolved by 3.2 + cross-WU files merged across N notes (3.3), both encapsulated inside
`runUserLoad` / `arc user pull` so callers (session-init, `in-flight-awareness`'s `materialize`) see one call.
**No-resolvable-WU → per-WU no-op:** fresh spawn, load on `main`, or an `errand-enablement` session on a non-WU
branch all resolve to "no current-WU subdir" → per-WU load no-ops, cross-WU still loads; the current-WU input
is optional throughout.

### `[x]` **3.1 Path-driven sync-class dispatch**

- _Goal:_ `arc user save`/`load` infer per-WU vs cross-WU sync class purely from path structure
  (`user/{identity}/<wu-name>/**` per-WU; flat `user/{identity}/**` cross-WU; `.internal/**` never synced) — no
  sync-class allowlist, no in-band class declaration.

    - `[x]` **3.1.a Sync-class classification function** (`lib/user-sync/classifier.ts`)
        - `classifyUserSyncPath` does pure first-segment inference over a manifest-relative path: dot-prefixed
          first segment → `never-synced`; any other subdir path → `per-wu`; any other flat path → `cross-wu`
          (every flat identity-root file, not an allowlisted shape — R16). The file-type allowlist stays on its
          own axis. Exported via `lib/user-sync/index.ts` as a sibling of `inferUserSyncCause`.

    - `[x]` **3.1.b Consumed by the load path** (`lib/user-sync/`, `commands/user/save-load.ts`)
        - No save-side wiring needed: `serialize` already emits every eligible file by path and the walk-time
          dotfile prefilter drops never-synced content, so the class changes behavior only at load — consumed by
          3.2 (per-WU restrict) and 3.3 (cross-WU merge), not yet here.

- _Outcome:_ never-synced keys on any dot-prefixed first segment, not just literal `.internal/` — chosen to
  mirror the serialize-walk dotfile prefilter (drops dot-prefixed dirs + dotfile basenames) so the two axes
  share one boundary. The dot-prefix check precedes the flat→cross-wu rule, covering `.internal/**` (the
  current `.sync-state.json` home) and any root-level dotfile as defense in depth.

### `[x]` **3.2 Per-WU subdir load**

- _Goal:_ a load restores from the most recent reachable note containing the current WU's subdir and skips
  older notes' other-WU subdirs — resolving the spawn → first-load overwrite where a fresh worktree's
  ancestor-walk would otherwise import the prior WU's SESSION-NOTES. **No-resolvable-WU → per-WU no-op:** when
  no current WU resolves (fresh spawn, load on `main`, or an `errand-enablement` session on a non-WU branch) or
  no note contains its subdir, the per-WU restore is a clean no-op (never a stale WU name, never a crash) —
  cross-WU files still load via 3.3.

    - `[x]` **3.2.a Subdir-aware note resolution** (extend `findNearestUserNote` + thread the WU-name input)
        - `findNearestUserNote` + `UserLoadOptions` (both the `commands/user/types.ts` and `handlers/user.ts`
          definitions, plus `UserPullOptions`) gained an optional `currentWuName`. When set, the walk parses
          each candidate note's manifest mid-walk and returns the most-recent note carrying that WU's subdir,
          skipping others and returning no note when none has it. Absent, the first-note behavior is unchanged,
          so the four `sync-status.ts` / `push-recovery.ts` callers keep their newest-note semantics.

    - `[x]` **3.2.b Load materializes the current WU subdir, drops other-WU subdirs**
        - `runUserLoad` filters the resolved note's manifest to cross-WU flat files plus the current WU's subdir
          before materializing / verifying / recording sync-state (`runUserPull` forwards the name). The filter
          is uniform: no current WU → cross-WU flat only (per-WU restore no-ops), and an all-flat pre-isolation
          manifest is unaffected since every entry classifies cross-WU.

- _Outcome:_ the current-WU name is an explicit optional input on the lib options, derived at the handlers by a
  new `lib/user-sync/current-wu.ts` (`resolveCurrentWuName` — active-meta name first, branch-slug fallback) so
  the lib functions stay io-injectable; the classifier gained `wuNameOfPath` as the shared subdir-containment /
  partition key. Wired into `arc user load`, `arc user pull`, and `arc sync`. Cross-WU flat still rides the
  single resolved note here — 3.3 moves it to the N-note merge — so a brand-new WU whose own note doesn't exist
  yet loads nothing until then.

### `[x]` **3.3 Cross-WU file merge (per-file entry list-union)**

- _Goal:_ cross-WU files merge across the N most-recent ref-wide notes via value-level list-union of their
  entries, deduped by entry identity — so entries created in parallel worktrees converge instead of clobbering.
  The merge is **shape-keyed by filename**; an unknown-shape cross-WU flat file (no registered parser) falls
  back to **whole-file most-recent-note-wins** (same recency ordering) — the class stays path-only (3.1), the
  merge strategy is per-file.

    - `[x]` **3.3.a Per-file entry parser + list-union / dedupe** (`lib/user-sync/parser.ts`, `…/merge.ts`)
        - New `lib/user-sync/{types,parser,merge}.ts`, barrel-exported. `parseCrossWuEntries(content, shape)`
          splits a file into entry blocks and returns one discriminated `EntryParse`
          (`{ ok: true, entry } | { ok: false, reason }`) each — no throw, so a WORKING-MEMORY block missing its
          `_Remove when:_` trigger or a USER-INBOX item with no bold lead-in surfaces as a `reason` instead of
          dropping. `mergeEntries` unions by `(section, key)` identity walking most-recent → oldest, so the
          most-recent body wins a divergent collision and a USER-INBOX lead-in stays distinct across
          `## Atomic` / `## Backlog`. `mergeCrossWuFile` dispatches on filename (`shapeForFile`): unknown shape →
          whole-file most-recent-wins; known shape rebuilds onto the most-recent note as base (preamble and
          existing formatting preserved), folding only older-only entries into their owning section and
          returning any malformed reasons on the result.

    - `[x]` **3.3.b Ref-wide N-most-recent-note read** (recency-ordered) (`lib/user-sync/notes-ref.ts`)
        - `readRecentUserNotes(exec, identity, limit)` walks the user-notes ref's own history newest-first and
          returns up to `limit` note versions (`RecentNote` = `{ historyCommit, content }`) in recency order,
          most-recent first; the bound defaults to the named `CROSS_WU_NOTE_WINDOW` (not a literal). Fewer-than-N
          reads what exists, an empty/absent ref yields `[]`, and non-note tree paths are skipped. The three git
          primitives (`log` / `diff-tree` / `show`) live here as one named fn per shape — relocated from
          `save-load.ts`, which now imports them and threads `io.exec`; `findNearestUserNote` behavior is
          unchanged (its tests stay green). Recency order is a sequence, not a set, so the merge can resolve a
          divergent entry to the most-recent note within the window.

    - `[x]` **3.3.c Wire merge into load**
        - `runUserLoad` now reads the recent-note window (`readRecentUserNotes`) and merges each cross-WU flat
          file via `mergeCrossWuFromNotes` → `mergeCrossWuFile`, while per-WU subdir files keep coming from the
          single resolved note; both reads stay inside `runUserLoad` so callers see one call. Note parse +
          version validation moved into `parseResolvedNoteManifest`, and the load anchors on a `sourceCommit`
          that falls back to the most-recent note's commit when no per-WU note resolves, so a brand-new WU still
          materializes cross-WU context. Malformed-entry reasons ride out on the load result.

- _Outcome:_ cross-WU flat files converge across the recent-note window inside `runUserLoad` / `arc user pull`
  (callers see one call), while per-WU subdir restore stays on the single resolved note. The two are now
  decoupled: a brand-new WU with no note of its own still loads shared cross-WU context (the gap 3.2 flagged),
  and load no-ops only when neither a resolved note nor any recent note exists. Running the merge against real
  seeded templates exposed — and this task fixed — two parser gaps: HTML-comment stripping (commented shape
  examples aren't entries) and accepting `*` or `_` italic removal triggers, so a clean install loads without
  spurious malformed warnings.

### `[x]` **3.4 Tombstones for cross-WU deletions**

- _Goal:_ deleting a cross-WU entry writes a timestamped `## Removed: {name}` tombstone that the merge honors
  over earlier inclusions, with a generous fixed-TTL filter-at-merge GC so tombstones eventually drop — the
  contract being the mechanism (time-based TTL, filter-at-merge), not the constant.

    - `[x]` **3.4.a Tombstone write on entry removal** (`lib/user-sync/merge.ts`)
        - `appendRemovalTombstones` diffs the current cross-WU file against the prior merged state (list-union
          across the recent-note window via 3.3's `mergeEntries`) and appends a timestamped, `(section, key)`-keyed
          `## Removed: {key}` H2 marker per present-before / absent-now entry; unknown-shape, empty-window, and
          no-removal cases no-op. The marker body carries `- _Section:_` / `- _Removed:_` lines (the TTL anchor
          3.4.b reads). Wired into `runUserSave` via `applyRemovalTombstones`, which stamps the to-be-saved
          manifest before the note write/verify. Markers are recorded here, not yet honored — suppression + TTL
          is 3.4.b.

    - `[x]` **3.4.b Merge respects latest tombstone**
        - `mergeCrossWuFile` parses `## Removed:` markers per note and resolves each `(section, key)` by recency:
          the most-recent mention (entry or live tombstone) wins, so a tombstone suppresses an older inclusion and
          a more-recent re-add overrides an older tombstone. Winning live tombstones carry forward (re-rendered onto
          a tombstone-stripped base); TTL-expired ones drop and stop suppressing (filter-at-merge GC). Malformed
          markers surface on `MergeResult.malformed` alongside malformed entries. A `now` reference time is injected
          for TTL evaluation; tombstone-free content round-trips byte-for-byte.

- _Outcome:_ the deletion round-trip is closed — `arc user save` records removals as `## Removed:` markers and the
  load-time merge honors the most-recent one with a fixed-TTL GC. Write-side detection stays cause-agnostic (a
  content diff against the prior merged set, not an agent-flagged removal), leaving the seam for a future CLI
  `readyToRemove` evaluator without a rewrite. The TTL is an internal cleanup detail — no user-facing "sync within
  N days" guarantee; past the window the failure mode is re-deleting a note, not data loss.

## **Phase 4:** Cross-WU sync — reconcile, orphans & seam

_Purpose:_ The reconciliation half of cross-WU sync — concurrent-push reconcile, retired-subdir reconciliation,
grouped orphan messaging, and the coherence-WU schema seam. Depends on Phase 3's load/merge substrate.

_Design decisions:_ `.sync-state.json` is already at schema `version: 3` with a `partialPush` marker — 4.4
bumps the version and makes the shape worktree-aware on top of that, reserving (not building) the downstream
extension points. Concurrent-push reconcile (4.1) operates on the global `refs/notes/arc/user/{identity}` ref
that all worktrees share. The pure logic for 4.1–4.4 lands in `lib/user-sync/` (keeping `handlers/sync.ts`
thin and the schema extractable); a 2026-05-26 cross-check against the agile-parallelism cohort and the
downstream sync WUs is recorded in `notes-worktree-foundation.md` § Phase 4 forward-compat cross-check.

### `[x]` **4.1 Concurrent-push reconcile (`git notes merge`)**

- _Goal:_ when parallel worktrees push notes and the second hits non-fast-forward, the push reconciles via
  `git notes merge` (cat_sort_uniq default) and surfaces to the user only when the conflict is non-trivial.

    - `[x]` **4.1.a Non-ff detection + notes-merge reconcile** (`push-fetch.ts` / `lib/user-sync/notes-merge.ts`)
        - Auto-reconcile pusher `reconcileNotesPush` (`push-fetch.ts`): on a notes-ref non-ff, fetch the remote
          ref into a temp tracking ref, union-merge via `git notes merge -s cat_sort_uniq`, re-push, then delete
          the temp ref — automatic, no prompt. Pure ref/arg/predicate helpers in `lib/user-sync/notes-merge.ts`
          (extractable for `user-sync-module-split`); IO orchestration in `push-fetch.ts`.
        - **Scope widened from the planned paired-only seam to every notes-push site** (decided mid-impl — the
          lossy re-save "merge" is a latent data-loss bug for the shared ref under concurrency, identical across
          callers, and this WU is what makes it reachable). `pushWithInteractiveRecovery` retired; replaced by
          `pushNotesWithReconcile` (spinner + staleness-warn wrapper) wired into all four notes-push sites:
          `pairedNotesAdapter`, `handleUserPush`, `user-sync` save+push, and the `sync` notes-only cell.
          `--force` stays the explicit overwrite; the `--yes` notes-conflict-auto-accept role and the
          `failed-nontty-conflict` surface are gone (auto-reconcile needs no prompt, and non-tty pushes now
          reconcile rather than fail).
        - Same-commit-collision corruption detection + surfacing is 4.1.b.

    - `[x]` **4.1.b Non-trivial-conflict surfacing**
        - Post-merge validity scan keys "non-trivial" off whether each merged note still parses as one
          manifest (`isResolvedNoteValid`, `lib/user-sync/notes-merge.ts`), not git's exit signal —
          `cat_sort_uniq` exits 0 even when a same-commit collision concatenates two single-line JSON
          manifests into an unparseable note. On corruption the local ref is rolled back to its pre-merge tip
          (nothing corrupt persists or is pushed) and a new `conflict` outcome surfaces a commit-named,
          actionable message; a failed `git notes merge` command is aborted and surfaced the same way. The
          `conflict` outcome renders gracefully at all four notes-push sites (no throw).

### `[x]` **4.2 Retired-subdir reconciliation**

- _Goal:_ `arc user load` / `pull` / session-init reconcile retired-WU subdirs that linger after a WU shipped on
  another machine — local subdir present + absent from recent notes + WU shipped → offer or auto-close with a
  `.internal/` backup.
- _Context:_ the **"WU shipped" predicate already exists** — 2.7a shipped `readShippedWorkUnits` /
  `isShippedWorkUnit` in `lib/work-unit/completed-index.ts`, whose module doc names retired-subdir
  reconciliation as a consumer. 4.2 **consumes** it, doesn't build it. Reuse nuance: the branch-oriented
  helpers (`isShippedWorkUnit` / `branchToWorkUnitSlug`, which strip a `<type>/` prefix) don't fit 4.2's input
  — a subdir name is already a bare slug — so call `readShippedWorkUnits()` and check `shipped.has(subdirName)`
  directly. `findStaleUserWuSubdirs` (`commands/user/open.ts`) stays detection-only; 4.2 wires reconcile =
  shipped-check + `removeStaleUserWuSubdir` + `.internal/` backup.
- _Forward-compat:_ pure shipped + orphan detection lives in `lib/user-sync/` (reusing `completed-index.ts`);
  if wired into session-init as a slot (4.2.b), follow existing slot conventions (safeProbe-wrapped, envelope
  never rejects, cheap local read like the `sweep` slot) so `in-flight-awareness`'s orchestration evolution
  absorbs it, and keep detection (read-only, surfaced) separate from removal (offer / auto-close-with-backup).
  See `notes-worktree-foundation.md` § Phase 4 forward-compat cross-check.

    - `[x]` **4.2.a Reconciliation logic**
        - Pure decision `planRetiredSubdirReconcile` (`lib/user-sync/retired-subdir.ts`): partitions present
          per-WU subdirs into `reconcile` (absent-from-notes AND shipped) vs. `preserved` (tagged
          `still-in-notes` / `not-shipped`). No I/O and no current-WU input — the shipped gate alone confines a
          no-current-WU (errand / `main`) session to genuinely-retired subdirs, so no "not the current WU"
          filter is needed; the still-in-notes check precedes the shipped check so a shipped-but-still-live
          subdir is preserved. Removal (backup + delete) and the load / pull / session-init wiring are 4.2.b.

    - `[x]` **4.2.b Wire into load / pull / session-init**

        - `[x]` **4.2.b.i Load / pull reconcile path**
            - `reconcileRetiredSubdirs` in `runUserLoad` (`save-load.ts`) derives `localSubdirs` +
              `notesWuNames` (recent-note manifests) + `shipped` (`readShippedWorkUnits`), feeds
              `planRetiredSubdirReconcile`, and `removeStaleUserWuSubdir`s each retired subdir. Reuses the
              pre-load backup (no second one) — reconciled subdirs are excluded from the stale-file
              "preserved" warnings and surfaced as removal warnings instead. `runUserPull` inherits via
              `runUserLoad`. Integration-tested against a real temp repo + notes.

        - `[x]` **4.2.b.ii Session-init detection slot**
            - `runRetiredSubdirDetection` (`lib/session-init/retired-subdir-detection.ts`) surfaces lingering
              retired subdirs read-only — cheap-base / gated-expensive like `sweep` (local subdirs ∩ shipped
              first; the recent-notes read fires only when a shipped subdir is present), reusing
              `planRetiredSubdirReconcile`. Wired as an eager identity-gated probe through
              `commands/status/{types,run}.ts` + `handlers/status.ts`, with `session-init` orientation in both
              copies. `collectNotesWuNames` / `subdirsFromPaths` extracted to `lib/user-sync` and shared with
              the load path.

### `[x]` **4.3 Orphan-warning messaging (T2 grouped + T1 rename-detection)**

- _Goal:_ when retired orphans cluster under a path prefix entirely absent from the incoming manifest, one
  grouped informational line + cleanup hint replaces N warnings (T2, P0); and a local orphan whose content
  matches a different name in the manifest surfaces as "Looks like rename X → Y" (T1, P1) — the underlying
  preserve-to-`.internal/` behavior unchanged, only surfacing changes.
- _Forward-compat:_ compute grouping + rename at the detection site (`runUserLoad`, where `localFiles` and
  `loadManifest.files` names + contents are both in hand) — warnings flatten to opaque strings downstream.
  Emit a **structured classification** (rename-candidate / grouped-retirement / generic), not flat string
  formatting, so `cross-machine-sync-coherence`'s T3 sync-state-drift tier (reads 4.4's `priorFileList`) slots
  in without reworking T1/T2. Pure classifier in `lib/user-sync/`. See `notes-worktree-foundation.md`
  § Phase 4 forward-compat cross-check.

    - `[x]` **4.3.a T2 grouped retirement messaging**
        - Pure `classifyOrphans` (`lib/user-sync/orphan-classification.ts`) emits a structured
          `OrphanClassification[]` (`grouped-retirement` / `generic`; `rename-candidate` reserved for 4.3.b) —
          the T3-extensible seam, not flat-string branching. Entirely-absent per-WU subdir → one grouped line;
          partially-present-subdir / flat orphan → per-item generic; a no-current-WU load suppresses per-WU
          subdir orphans as live other-WU context. Wired into `runUserLoad`, replacing the inline `staleWarnings`
          map; `renderOrphanWarning` owns the structured→string render at the load seam.

    - `[x]` **4.3.b T1 content-equivalence rename detection** (P1)
        - Rename pass in the per-item branch of `classifyOrphans`: an orphan whose content matches a different
          manifest path → `rename-candidate {from, to}`; no match → `generic`. Empty content is excluded from
          the content index, so a trivially-empty orphan can't false-match an empty manifest file. Grouped
          retirement clusters bypass the per-item branch, so they're untouched. `renderOrphanWarning`
          renders the candidate as `not in saved manifest — looks like a rename to "<to>" (content matches)`.

### `[x]` **4.4 Coherence-WU schema seam (`.sync-state.json`)**

- _Goal:_ the `.sync-state.json` schema is extracted to `lib/user-sync/sync-state.ts`, versioned, and
  worktree-aware so the downstream `cross-machine-sync-coherence` WU's remote partial-push marker and T3 drift
  layer land without a rewrite — leaving the seam, not building the marker.
- _Shape:_ (i) extract `LocalSyncState` + its read / write / marker helpers from `save-load.ts` to
  `lib/user-sync/sync-state.ts` (the I/O-boundary home CSA's zod schema and CSC's remote marker land on); (ii)
  bump the schema `version` (`3` → `4`); (iii) keep the shape worktree-aware — no single (main-worktree) HEAD
  assumption; (iv) reserve extension points for a `priorFileList` (T3's drift signal) and remote-marker
  provenance — the provenance reservation shaped to carry **per-worktree** state (pluralizable), so CSC's
  remote marker spans worktrees without a further bump — implementing neither.
- _Forward-compat (cross-ref confirmed):_ `version: 4` is the **stable** contract —
  `cross-machine-sync-coherence` must _populate_ the reserved `priorFileList` and remote-marker provenance
  **without a further version bump**, so v4 readers tolerate **and preserve** populated reserved fields
  (4.4.b's round-trip). This is **not** free today: `readLocalSyncState` reconstructs from known fields only
  (drops unknowns) and the writers rebuild from scratch — both must carry reserved fields forward. Keep the
  validation parser-shaped (`LocalSyncState | null`, no throw) so CSA's later zod swap is mechanical.
- _Note:_ this is `LocalSyncState.version` (2/3), **distinct** from the note manifest's own `version` (1/2,
  gated in `parseResolvedNoteManifest`); 4.4 touches only the former. `partialPush` is a live single-ref field
  with writers (`recordPartialPushMarker`, `runPairedPush`) — reshape in lockstep; the reader's `2 || 3`
  back-compat ladder extends to `4`. The local `.sync-state.json` is already per-worktree (a per-working-tree
  file). _Notes:_ See `notes-worktree-foundation.md` § Phases 3 & 4 and § Phase 4 forward-compat cross-check.
- **Strategies:** `strategy-storage-evolution.md`

    - `[x]` **4.4.a Extract sync-state schema to `lib/user-sync/sync-state.ts`**
        - `LocalSyncState` / `PartialPushMarker` + `readLocalSyncState` / `writeLocalSyncState` /
          `recordPartialPushMarker` / `clearPartialPushMarker` (plus `getUserInternalDir`) moved to
          `lib/user-sync/sync-state.ts`, re-exported via the barrel. IO param widened `UserIOContext` → `CoreIO`
          to keep the module `lib`-internal (no `lib`→`commands` inversion); `writeLocalSyncState` now takes the
          precomputed `materializedManifestHash` rather than the manifest, so `sync-state.ts` needs no
          `hashSyncManifest` dependency (it stays in `save-load.ts` for its external importers) — avoids a
          `save-load` ↔ `sync-state` import cycle. Consumers and the marker-mock test targets repointed.

    - `[x]` **4.4.b Schema `version` bump + worktree-aware shape + reserved-field round-trip**
        - `LocalSyncState.version` 3 → 4: the reader accepts `2 | 3 | 4` and normalizes to 4 (a read-modify-write
          migrates the on-disk record); the writers emit 4. `partialPush` stays a single per-worktree marker (the
          `.sync-state.json` file is itself per-worktree — no single-HEAD assumption). Two reserved extension
          points are declared but not populated: `priorFileList?: string[]` (drift tier) and
          `remoteMarkerProvenance?: Record<string, unknown>` — a per-worktree map (pluralizable, not a scalar).
          Round-trip preservation is wired through every path: `readLocalSyncState` carries reserved fields
          forward, `writeLocalSyncState` reads the prior record so a rebuild-from-scratch save preserves them, and
          `clearPartialPushMarker` keeps them while dropping the marker.

    - `[x]` **4.4.c Record the partial-push-surface widening**
        - Recorded in `notes-worktree-foundation.md` § Phase 4 forward-compat cross-check: concurrent-worktree
          notes-push widens the partial-push surface, so `cross-machine-sync-coherence`'s remote marker is
          genuinely necessary (WF _creates_ the exposure), not merely inherited.

## **Phase 5:** Entry primitives & `arc-session`

_Purpose:_ Deliver the WU entry verbs — spawn (create branch + worktree + meta) and cold-start
(scaffold-in-place) behind the renamed `arc-session` entry skill — plus the degrading concurrency-check stub
and the Errand cheap-branch path documentation.

_Design decisions:_ Consumes Phase 1 (location-resolution helper + marker I/O), Phase 2 (probe pre-resolves
dispatch data so `arc-session` reaches the right prompt in one turn), and Phase 3 (correct per-WU load). Spawn
and cold-start share **one** CLI-level scaffolding primitive (TypeScript, testable — **not** agent workflow
bash): it owns `git worktree add` + fresh Planning-meta scaffold + SESSION-NOTES seed + a conditional ownership
marker, parameterized by **(a)** worktree-target mode (create-new vs. use-existing), **(b)** a created-by-arc
flag (drives the marker), and **(c)** life-phase / branch-prefix / initial-State (defaulted to `Planning` /
`plan/` / `Planning`; Foundation's callers always pass Planning — the parameter is AWL's + the conductor's
seam). The primitive's scope is **fresh scaffolding only** — backlog-graduation (`git mv` + field-preserving
reconcile) and idempotent-resume stay in the `init-work-unit` workflow (5.1), un-entangled. `init-work-unit`'s
worktree-creating mode (R28 / 5.1) is thin prose that **delegates** to the primitive's create-new path; the
testable `git worktree add` lives in the primitive (5.2). Entry surfaces (`arc-session`, the downstream
`arc start`) stay thin skills over it. The primitive homes in `lib/` (alongside its `worktree-location` /
`worktree-marker` deps). Removal-side ceremony edits live in Phase 7. Full ratification + reasons +
forward-compat seams: `notes-worktree-foundation.md` § Phases 5 & 6.

### `[x]` **5.1 `init-work-unit` worktree-creating mode (delegation + mode selection)**

- _Goal:_ `init-work-unit` gains a worktree-creating mode that **delegates** to the 5.2 scaffolding primitive's
  create-new path (the primitive runs `git worktree add <templated-path> -b plan/{name}`, path via the Phase 1
  `resolveWorktreeLocation` helper); the in-place `git checkout -b` mode survives for the single-worktree /
  atomic-launchpad case. This task is the **workflow-doc** change only — thin delegation prose + mode
  selection; the testable `git worktree add` + fresh-meta scaffold live in 5.2.
- **Strategies:** `strategy-work-organization.md`

    - `[x]` **5.1.a Worktree-creating mode = delegation prose** (`init-work-unit.md`, both copies)
        - New `## Execution Modes` section frames worktree-creating as pure delegation: the planning branch,
          fresh meta, seeded SESSION-NOTES, and ownership marker are minted by the spawn path's create-new
          operation — no `git worktree add` bash enters the workflow. Adopter-facing prose carries neither task
          IDs nor the not-yet-built skill name; "spawn entry point" is the forward-safe referent.

    - `[x]` **5.1.b In-place mode retained + mode selection**
        - Both modes are framed neutrally — neither stamped default, since WF ships worktrees as a capability
          and defers the when-to-parallelize convention downstream. Mode selection is caller-driven, no flag —
          direct planning init → in-place (single-worktree posture), spawn → worktree-creating. A Step 2 pointer
          cross-references § Execution Modes so the branch command isn't misread as the only path.

- _Outcome:_ Both copies carry the two modes neutrally (neither stamped default), with zero create-new
  mechanics — `git worktree add` and the fresh-meta scaffold stay deferred to the 5.2 primitive. Backlog
  graduation (Step 3), meta reconcile (Step 4 Path A), and idempotent-resume left workflow-owned and
  un-entangled, staying factorable for the conductor's future `resume-work-unit.md`. In-place validated as
  forward-compatible (single-worktree baseline + AWL's atomic-tier-no-worktree seam); R28 conflation + stale
  AWL "thin wrapper" note captured in `notes-worktree-foundation.md` § Phases 5 & 6.

### `[x]` **5.2 Spawn primitive (shared CLI-level scaffolding)**

- _Goal:_ a one-shot spawn, invoked from an existing session, creates a new WU's branch, worktree, meta, and
  empty SESSION-NOTES, reports the new worktree path, and returns the originating session unchanged to its own
  context — no stash-switch, no disruption to in-flight state. Atomic: a failure mid-scaffold rolls back rather
  than leaving a partial worktree.
- **Strategies:** `strategy-work-organization.md`

    - `[x]` **5.2.b Fresh-meta scaffold from the code-owned field set (ADR-022 interim)** — _build first_
        - `META_FIELDS` (ordered name/default/group descriptors) + `renderMetaFile` + `parseMetaRecord` in
          `meta-reader.ts`: pure code-render of the Planning meta (no template read), a general
          `Partial<Record<MetaFieldName, string>>` override map (spawn sets 4 fields, cold-start extends), and a
          shared field set giving the render↔parse round-trip its teeth. Rationale + seams: notes § Phases 5 & 6.

    - `[x]` **5.2.c Ownership-marker write (create-by-arc flag)** — _build second_
        - `writeWorktreeOwnershipMarker` (`worktree-marker.ts`, barrel-exported): the `createdByArc` flag
          self-gates the write — spawn passes `true` (marker lands with `spawnedByArc: true` + injectable
          timestamp), a cold-start into an externally-created worktree passes `false` (no marker; absence is the
          not-ARC-created signal). Worktree removal satisfies 5.2.a's rollback contract; breadcrumb dropped.

    - `[x]` **5.2.a Spawn create-new wiring (integrates b + c + seed + worktree add)** — _build last_
        - `spawnWorktree` (new `worktree-scaffold.ts`) is the orchestration: `git worktree add <path> -b
          <prefix><name> <base>` (base = resolved `branch.base`; path via `resolveWorktreeLocation`), then meta
          (`renderMetaFile`) + SESSION-NOTES (`runUserOpen`) + marker into the new root, with best-effort
          rollback (`worktree remove --force` + `branch -D`) on any post-add failure. No `cd`; `--tier`/`--type`
          accepted, not branched. Config / repo / identity are caller-injected; direct `runUserOpen` (no cycle).

- _Outcome:_ the shared spawn primitive is whole — `spawnWorktree` composes the b (meta render) + c (marker)
  units + the SESSION-NOTES seed behind one atomic, rollback-guarded `git worktree add`, in
  `lib/git/worktree-scaffold.ts` (barrel-exported). The worktree-creation ⊥ scaffolding split
  (`scaffoldIntoWorktree`) is the reuse seam 5.3 cold-start consumes; life-phase / created-by-arc / tier-type
  params are the AWL + conductor forward-compat seam. Full rationale: notes § Phases 5 & 6.

### `[x]` **5.3 Cold-start scaffolding primitive**

- _Goal:_ the shared scaffolding primitive (5.2's) creates a meta in an existing bare worktree from any spec
  input (file pointer / URL / issue / plan-doc / name + description), honoring WOR's Origin ⊥ Design
  orthogonality, invoked from `arc-session` (discovery) and, later, `arc start` (deliberate create-in-place).
- **Strategies:** `strategy-work-organization.md`

    - `[x]` **5.3.a Shared scaffolding primitive (CLI-level)** — the use-existing path of 5.2's primitive
        - Exported `scaffoldIntoWorktree` (`worktree-scaffold.ts` + barrel) behind a creation-free
          `ScaffoldWorktreeParams` (worktree path + branch + `initialState` / `origin` / `design`, no
          base / location / repo); `spawnWorktree` now delegates to it after `git worktree add`. `origin` /
          `design` thread into the meta overrides (Origin ⊥ Design); `createdByArc` stays caller-set (default
          `true`; cold-start passes `false`) — the marker-write seam 5.3.c formalizes. Tested: scaffolds a
          Planning meta + SESSION-NOTES into an existing root with no `git worktree add`.

    - `[x]` **5.3.b Spec-input parser**
        - `parseSpecInput` (`lib/active/spec-input-parser.ts`): a no-throw `SpecInputParse` discriminated union
          making two _closed_ assignments — ARC spec artifact (`draft-` / `spec-` basename) → `Design`, issue
          ref (`#n` / `owner/repo#n` / `/issues/` URL) → `Origin` — and passing all else through untouched: a
          `document` (file / URL, incl. prefixless `whatever.md` and non-spec ARC files like `tasks-`) or
          free-text `description`, for the `arc-session` agent to assess (trigger-vs-spec is operator intent, not
          syntax). Origin / Design stay narrow by design; only empty input fails. Shaped for CSA's zod wrap.

    - `[x]` **5.3.c Marker semantics via the created-by-arc flag**
        - Locked the cold-start marker semantics on `scaffoldIntoWorktree`'s `createdByArc` flag (gating built
          in 5.2.c): `false` → no marker (advisory — tool / manual worktree), `true` → marker written. The
          flag-true path is the `arc start` create-in-place seam — exercised by test, not wired to a caller here.

- _Outcome:_ cold-start is whole — `scaffoldIntoWorktree` (use-existing) scaffolds a Planning meta into a
  worktree ARC didn't create, fed by `parseSpecInput`, marker gated advisory off the created-by-arc flag. The
  spec-input model landed narrower than the Goal's flat variant list: Origin / Design are _closed_
  auto-assignments (issue → Origin, `draft-` / `spec-` → Design), with files / URLs / blurbs passed through as
  `document` / `description` for the `arc-session` agent to assess (`plan-*` retired). Consumed by 5.4; the
  flag-true create-in-place path is `arc start`'s seam.

### `[x]` **5.3.R Cold-start invocation command (`arc start --here`)**

- _Goal:_ give `arc-session`'s cold-start dispatch (5.4.b) an invocable command to run — a remedial fix for
  the primitive↔skill gap surfaced at the 5.4 interlock: the scaffolding primitives (5.2 / 5.3) are lib-only
  with no CLI surface, and no prior task supplied one. Register `arc start` with a `--here` mode wrapping
  `scaffoldIntoWorktree` (use-existing): scaffold a Planning meta + SESSION-NOTES into the current bare
  worktree, advisory marker (`createdByArc: false` — ARC didn't create the worktree), confirm-before-use.
  Config / repo / identity are caller-injected (mirroring the primitive's seams); no `cd`.
- **Strategies:** `strategy-work-organization.md`
- _Outcome:_ `arc start [name] --here [--from <input>] [-y]` registered (`cli.ts`) over a testable
  `runColdStart` + `deriveColdStartWuName` (`commands/start.ts`) and a thin `handleStart` (`handlers/start.ts`):
  name defaults to the branch slug, `--from` routes through `parseSpecInput` (issue → Origin, `spec-`/`draft-`
  → Design, else pass-through for the agent), an active-WU guard refuses rather than clobber, and
  `createdByArc: false` keeps the marker advisory. Settled **agent-invoked** — run by `arc-session`'s
  cold-start dispatch, not a human step (the confirm auto-skips the agent's non-interactive call); scope stays
  `--here` (create-new `arc start <name>` + `--tier`/`--type`/`--branch`/`--spec` is AWL's, which extends this
  verb and inherits `--here`); a separate `arc adopt` verb was weighed and declined. Supersedes R8's
  "not a standalone CLI command." Design depth + the "adopters invoke directly" reframing:
  `notes-worktree-foundation.md` § Phases 5 & 6.

### `[x]` **5.4 `arc-session` entry skill (rename from `arc-resume`, dispatch)**

- _Goal:_ the renamed `arc-session` skill is the thin session-_entry_ surface that runs `session-init`, which
  inspects worktree state and dispatches _resume_ (local meta present) or _cold-start_ (bare worktree, offered,
  never auto-scaffolded) — with the _materialize_ dispatch seam present (In-Flight Awareness fills it).
  Dispatch lives in the workflow, not the skill. Arg-free / discovery-led by default; one optional
  `/arc-session <pointer-or-blurb>` may pre-seed cold-start, confirmed before use.

    - `[x]` **5.4.a Rename + reframe the skill + sweep references** (canonical sources, both copies)
        - Renamed the skill dir + `name:`/heading to `arc-session`; reframed the description/intro to the
          session-entry surface (names the resume / cold-start paths; resume steps retained, dispatch mechanics
          left to 5.4.b — no task-ID forward-refs in the shipped skill). Swept every `arc-resume` → `arc-session`
          reference across `.arc/system/**`, `.arc/reference/**`, and the package mirror (both copies) — zero
          remain. Registration was hand-edited (this repo never runs `arc update` on itself, and nothing enforces
          the hash): the `manifest.json` key + refreshed `pristine_hash` (the stored hash was already stale), and
          the `init-recipe.json` install path so `arc init` still copies the skill — both per the `bdd663cf`
          rename precedent. ADR-011 name updated for accuracy. Scope calls: included the top-level `README.md`
          skill-list (shipped doc, beyond the enumerated set); excluded `docs/**` (docs-content-sweep owns it)
          and backlog drafts (refresh at their own promotion).

    - `[x]` **5.4.b Dispatch logic (resume / cold-start + explicit materialize seam)** (canonical sources, both copies)
        - Dispatch lives in **`session-init`**, not the skill — single source of truth (the workflow loads on
          every entry; cf. `arc-commit`, whose skill-fork gates whether its workflow loads). Step 2 (retitled
          "Dispatch & Conditional Sync") gained a named `### Entry dispatch` step beside the branch-gone
          precondition: resume / orient continue into sync + context-load; cold-start (offer `arc start --here`,
          never auto-scaffold) and materialize (`git worktree add origin/<branch>` + `arc user pull`) mint/fetch
          state → re-probe → re-enter as resume. No step renumber (`contributor.md` welds to step numbers); the
          named step (slug `#entry-dispatch`) is the forward-compat seam, with the systemic ordinals→anchors
          refactor captured for `composable-workflows` (the `· #name` heading tag is extension-only — validated
          against `system/extensions/`). Skill thinned to a pointer (both copies); R10 + walkthrough
          reframed. Detail: `notes-worktree-foundation.md` § Phases 5 & 6.

    - `[x]` **5.4.c Optional-arg seed (confirmed before use)**
        - Skill (both copies): a body line names the optional argument an **entry seed** that the cold-start arm
          consumes; frontmatter left uniform (no `argument-hint` — a Claude-only slash-command field, out of place
          in the harness-agnostic source). `session-init` (both copies): Entry dispatch defines the entry-seed
          concept (feeds cold-start only); the cold-start arm threads `arc start --here --from <seed>` and shows
          the seed's resolved disposition in the offer (issue → Origin, `draft-`/`spec-` → Design, else
          pass-through for the agent to read) so the user confirms the reading, not just the act; non-cold-start
          arms surface-and-note rather than act, mirrored in Step 6's actionable list. No TypeScript — `--from`
          and `parseSpecInput` shipped in 5.3.R / 5.3.b.

    - `[x]` **5.4.d Hand-sync harness skill copies**
        - Copied the updated canonical `arc-session/SKILL.md` into `.claude/skills/` and `.codex/skills/` and
          removed the stale `arc-resume/` dirs from both, so this repo's own sessions resolve `/arc-session`
          (carrying the 5.4.c entry-seed line). `.gemini/skills/` is absent here — skipped. All harness skill
          dirs are gitignored; only the checkbox is committed.

- _Outcome:_ `arc-session` is the thin session-entry skill: renamed from `arc-resume` (5.4.a), dispatch
  relocated into `session-init` as the single source of truth (5.4.b), an optional first argument pre-seeds
  cold-start through `arc start --here --from` (5.4.c), and the gitignored harness copies re-synced (5.4.d). The
  materialize seam ships present-but-dormant for In-Flight Awareness.

### `[x]` **5.5 Activation-time concurrency-check stub**

- _Goal:_ before creating a worktree, the spawning / cold-starting session reads in-flight WUs (`git worktree
  list` + identity-filtered metas) and surfaces scope-overlap concerns via general agent judgment over
  `**Purpose:**` / spec text — but does **not** gate, and degrades to a no-op when nothing else is in flight.
- _Outcome:_ Shipped as a shared `in-flight-scope-check.md` workflow fragment, referenced by the spawn surface
  (`init-work-unit` worktree-creating mode) and the cold-start surface (`session-init`), over a new
  `arc active roster [--json]` command. The command reuses `runWorktreeRoster` + `filterRosterByIdentity` and
  narrows to meta-bearing (in-flight) worktrees; the fragment treats it as a swappable data input. Gather and
  degrade-on-empty are deterministic; scope-overlap assessment is agent judgment over each in-flight WU's
  `**Design:**` spec (the meta has no `Purpose` field), biased toward surfacing and never gating. `cohort` is
  carried as a neutral fact only — no concurrency inference. `commands/status/run.ts` left untouched.

### `[x]` **5.6 Errand cheap-branch path documentation**

- _Goal:_ the Errand-class path is documented — an Errand (per ADR-021) has no meta, never touches the spawn
  primitive, launches from the **main worktree** on a short-lived branch off `main`, ships via the lighter
  gate, and tears down — and ADR-021's cheap-branch floor is ratified.
- **Strategies:** `strategy-work-organization.md`
- _Outcome:_ New `## Errand Work Class` section in `strategy-work-organization.md` (both copies) introduces
  the WU/Errand split as self-contained content (no ADR citation, per the strategy/ADR audience boundary),
  with Threshold (three-part test + create/maintain), Cheap-branch path (per-mode: direct under partial,
  ephemeral `chore`-prefix branch + PR under full), and Entry path (launches from main worktree, distinct
  from spawn/cold-start; ships via the `standalone (...)` footer). Brief inline launchpad mention; full
  main-on-main rationale + the cross-ref deferred to 7.3.a (Note added under it). ADR-021 carries a dated
  Amendment ratifying the cheap-branch floor; Status remains **Proposed** (CWC and AWL still pending).

### `[x]` **5.7 Cold-start protected-branch guard**

- _Goal:_ `runColdStart` refuses to scaffold onto a protected branch — mirroring the release-path rule
  (`branch.protection: full` **and** current branch == resolved `branch.base` → refuse), in the same no-throw
  `{ ok: false, reason }` shape as the existing active-WU guard. Closes a gap left by 5.3.R: today
  `deriveColdStartWuName("main")` returns `main` (no `/`, non-empty) instead of refusing, and `runColdStart`
  carries no protection check, so a direct cold-start onto `main` would mint a Planning meta on the trunk. This
  repo runs `full`; the WU must not ship with the gap present.
- **Strategies:** `strategy-work-organization.md`
- _Outcome:_ Factored `isProtectedBranch(settings, branch)` out of the inline check in
  `interlock-validation.ts` (extraction stayed clean, so no local mirror) — now shared by `checkBranchProtection`
  and the new `runColdStart` guard. Cold-start reads config via `readConfigSettings` (yaml-only, cheap) and
  refuses onto `branch.base` under `full` _before_ the active-WU scan; `partial` and feature branches (e.g.
  `plan/foo`) pass through. Reason names the branch. Handler signature unchanged. Closes the 5.3.R
  trunk-scaffold gap.

## **Phase 6:** In-session shift (`arc-shift`) — deferred

_Status (2026-05-28):_ Phase deferred at the start of execution. The use case is real but demand-unverified,
and the wider conception this verb was originally sized for was absorbed by the Errand class. Surviving
narrow design (workflow + thin-dispatcher implementation shape, PR-review-checkout alternative framing,
cohort-end fallback decision tree) lives in `cohort-agile-parallelism.md` § Deferred — `/arc-shift`. Not
re-attempted by this WU.

### `[~]` **6.1 `/arc-shift` skill**

- _Goal:_ a thin `/arc-shift` skill repoints the current session to another existing in-flight worktree,
  preserving the agent's accumulated context, with discovery-led target selection from `git worktree list` and
  an optional arg.

    - `[~]` **6.1.a Skill authoring** (canonical sources + harness hand-sync)

    - `[~]` **6.1.b Target selection (discovery-led + optional arg)**

- _Outcome:_ Deferred — see `cohort-agile-parallelism.md` § Deferred — `/arc-shift`.

### `[~]` **6.2 Uncommitted-work handling at the shift**

- _Goal:_ before switching, `/arc-shift` detects uncommitted changes (reusing `runDirtyStateStatus`) and offers
  commit (recommended) / stash / leave-as-is; the operator chooses.

- _Outcome:_ Deferred with Phase 6 — see `cohort-agile-parallelism.md` § Deferred — `/arc-shift`.

### `[~]` **6.3 Resume-staleness advisory** (P2)

- _Goal:_ arriving in a long-idle worktree surfaces a dismissible "assumptions may be stale — re-read the spec"
  nudge past a fixed idle threshold.

- _Outcome:_ Deferred with Phase 6 — see `cohort-agile-parallelism.md` § Deferred — `/arc-shift`.

## **Phase 7:** Lifecycle wiring, retirements & doc reconciliation

_Purpose:_ Wire worktree create/remove into the lifecycle ceremonies (consuming the marker contract; extending its
decision fn for the new abandonment caller) and leave the framework self-consistent at ship — neutralize the obsolete
pause-pointer mechanic, document the main-on-main pattern, retire the `atomic-*` companion type, and fix the
shipped-doc drift the cohort's resolved decisions create.

_Design decisions:_ Sequenced last so the doc reconciliation lands against everything built. R28's removal-side
ceremony edits join here with R29's cleanup-site wiring (7.1). R32's sweep includes `2_generate-tasks.md` itself — and
this WU dogfoods the retirement (no `atomic-*` companion was created for it). 7.1.f extends the Phase 1
cleanup-decision fn for a new caller (Case A-delete abandonment context) and renames its return-value enum to
state-descriptive — forward extension, not Phase 1 correction.

_Note:_ "(both copies)" maps to per-file package suffixes — `.template.md` for `session-handoff` (7.1d),
`2_generate-tasks` + `3_process-task-loop` (swept by 7.4); plain `.md` for the work-unit-lifecycle ceremonies (7.1a-c,
7.1e) and `manage-incidental-work` (7.2). Docs-site content (`docs/`) is out of scope WU-wide (dedicated docs WU).
_Notes:_ See `notes-worktree-foundation.md` § Phase 7.

### `[x]` **7.1 Lifecycle ceremony worktree wiring (marker-gated cleanup)**

- _Goal:_ the lifecycle ceremonies wire worktree removal with marker-gated cleanup — `integrate-work-unit` adds a
  workflow-driven post-merge worktree-removal step; `deactivate-work-unit` Case A-delete restructures around the
  multi-worktree case (consuming 7.1.f's abandonment-context decision arm) while Case A return-to-Planning leaves the
  decoupled path; `activate` Step 4 mirrors `deactivate` Step 2 (Branch + Next Action refresh) plus a defensive
  `arc user open` reaffirm; `session-handoff` gains a linked-worktree header insert mirroring `session-init` Step 6.
- _Note:_ a worktree cannot remove itself — removal runs from another worktree (typically main), composing with the
  batched-archive step. All cleanup consults the Phase 1 marker decision (extended by 7.1.f); phrasing is
  origin-agnostic (ARC-spawned and external both reach the same descriptor).
- **Strategies:** `strategy-work-organization.md`

    - `[x]` **7.1.a `integrate-work-unit` post-merge worktree-removal step (workflow-driven)** (both copies)
        - _Outcome:_ Step 14 added at integrate's post-merge tail (both copies). Dispatches by worktree identity —
          primary (in-place WU) falls through to `## Next step`; linked consults `decideWorktreeCleanup` and branches
          on `removable` (cd + remove + branch-delete cascade in one invocation; session terminates with cwd
          dangling), `blocked` (surface state; await next main-session stale-worktree check), or `external`
          (operator-managed). In-place degenerate case made explicit per forward-compat check against
          `draft-composable-workflows.md` — keeps the new step honest about the single-worktree posture without
          pre-investing in fragment extraction. References 7.1.f's renamed enum; code rename + cross-doc sweep land
          there.

    - `[x]` **7.1.b `deactivate-work-unit` Case A-delete multi-worktree restructure** (both copies)
        - _Outcome:_ Case A-delete restructured to dispatch by worktree identity (both copies). Primary
          (in-place) keeps switch + force-delete; linked (spawned) navigates to main, consults
          `decideWorktreeCleanup` with abandonment context (`removable` auto-removes; `blocked` / `external`
          surface without removal — operator handles externally-spawned cleanup), then runs branch teardown
          uniformly from main. Steps 2 + 3 merged; Step 4 renumbered to Step 3. Case A return-to-Planning
          unchanged. Uses 7.1.f's renamed enum + abandonment-context extension.

    - `[~]` **7.1.c `activate-work-unit` defensive `arc user open`** (both copies)
        - _Outcome:_ Audit-confirmed (Phase 7 pre-impl): `activate-work-unit.md` Step 5 (post-rename) already carries
          the idempotent `arc user open {name}` reaffirm covering paths that activated without going through
          `init-work-unit`. No net-new content; audit verified the defensive reaffirm is correctly positioned (post
          branch-rename, where the worktree's `arc user` path is stable). Marker contract / spec scope satisfied via
          existing behavior.

    - `[x]` **7.1.d `session-handoff` linked-worktree header insert** (both copies)
        - _Outcome:_ § Confirm Handoff header line gains the conditional `worktree: {identity.path}` insert
          after the branch (both copies), mirroring session-init Step 6 verbatim. Keyed on
          `worktree.value.identity.kind === "linked"`; omitted in the primary worktree. No probe extension —
          the worktree slot is already populated.

    - `[x]` **7.1.e `activate-work-unit` Step 4 meta-field completeness** (both copies)
        - _Outcome:_ Step 4 now updates `**State:**` + `**Branch:**` + `**Next Action:**` (both copies),
          mirroring `deactivate-work-unit` Step 2. Branch flip prevents session-init's branch-match
          disambiguation from breaking after Step 5's rename; Next Action refresh replaces the stale
          activation-pointer with a first-task pointer. Commit template body updated to enumerate the three
          field edits.

    - `[x]` **7.1.f `decideWorktreeCleanup` abandonment-context extension + return-value rename** (Phase 1 fn,
      both copies)
        - _Outcome:_ `decideWorktreeCleanup` takes a required `context: 'shipped' | 'abandonment'` and returns
          state-descriptive `removable` / `blocked` / `external` (was `offer-remove` / `surface` / `advisory`).
          Abandonment bypasses the merge gate; clean gate stays. Consumers (`stale-worktree-sweep`,
          `branch-gone-cascade` + its `CandidateAction` mirror) pass `shipped` explicitly. Doc sweep:
          session-init's envelope rows, Step 2 resolved arm, Step 6 sweep block (both copies). Tests extended
          for both contexts (worktree-cleanup: 5 → 11 cases); enum strings renamed across run / sweep / cascade
          / recovery test suites. All 1780 unit tests pass; typecheck + lint clean.

### `[ ]` **7.2 Pause-pointer neutralization in `manage-incidental-work.md`**

- _Goal:_ `manage-incidental-work.md` no longer instructs setting the retired pause-pointer fields
  (`Interrupts:` / `Paused At:` / `Paused To:`), so it stops contradicting the 4-state machine.
- _Note:_ decisive deletion — § Coordinated Pause/Resume is deleted entirely (its parent-pause premise is dead under
  worktree isolation), replaced with a one-line cross-ref to § Per-Worktree Isolation in
  `strategy-work-organization.md`. The file's other stale drift folds in: the `status-{parent-name}.md` reference
  (stale `status-` prefix → `meta-`). Non-4-state `State:` values were all inside § Coordinated Pause/Resume —
  deletion handles them; no in-place alignment remains. _Notes:_ See `notes-worktree-foundation.md` § Phase 7.
- _Note:_ the deeper reshape (whether this workflow survives as-is vs. folds into always-loaded DEV-RULES routing +
  a design-time strategy) belongs to the agent-context-optimization cohort — ownership tracked across
  `draft-instruction-optimization.md` and `draft-documentation-surface-routing.md`. WF neutralizes the mechanic for
  interim correctness; this step is bounded to that.
- _Note:_ framing guard — the one-line cross-ref stays authority-neutral (no schema/ADR reference, no claim of a
  code schema WF hasn't built). This file is adopter-facing.

    - Decisive delete + replacement in `manage-incidental-work.md` (both copies).

### `[ ]` **7.3 Main-on-main pattern documentation + workflow cross-ref sweep**

- _Goal:_ ARC's stance is documented — the main worktree stays on `main` as a stable reference and the launchpad for
  admin operations (planning, sweep, global edits) and atomic / Errand launches; no separate dedicated administrative
  worktree; composes with externally-spawned worktrees (the tool's main workspace IS ARC's main worktree).
- _Note:_ author the dedicated section in `strategy-work-organization.md` as a **new top-level § Main-on-Main
  Pattern**, placed immediately after § Per-Worktree Isolation — the two sections together answer "what's the role of
  each kind of worktree?" Include the one-worktree-per-IDE/LSP operational constraint (document, don't engineer
  around).
- _Note:_ sweep workflows for incidental main-on-main mentions and add cross-refs to the new § at point of use
  (author-judgment sweep, not a fixed list). Convert § Errand Work Class's terse launchpad mention (left by 5.6) to a
  one-line cross-ref to the new § (drop any restated rationale).
- **Strategies:** `strategy-work-organization.md`

    - Author § Main-on-Main Pattern + sweep cross-refs (`strategy-work-organization.md` both copies; workflows
      touched per author-judgment sweep).

### `[ ]` **7.4 Retire the `atomic-*` companion file type**

- _Goal:_ the `atomic-*` companion file type is retired and its capture rerouted (fold into the commit / add a
  task / spin an Errand / `USER-INBOX.md § Atomic`), with all references swept — the shared `ATOMIC-INBOX.md`
  surface, `USER-INBOX § Atomic`, and the atomic _character_ unaffected; only the per-WU companion file type
  retires.
- _Note:_ a grep-driven sweep, not a fixed list — companion-type refs extend well beyond the named anchors (e.g.
  `strategy-planning-module.md` ~17 refs, `strategy-file-classification.md`'s file-type registry row,
  `strategy-work-organization.md`'s § Directory Structure row, `3_process-task-loop.md`, `DEV-RULES.PROJECT.md`,
  `completed/README.md`, and `USER-INBOX` / `ATOMIC-INBOX` template §-cross-links that dangle on removal). Distinguish
  companion-type refs (in scope) from atomic-character refs (preserved — tier shape, not file type). _Notes:_ See
  `notes-worktree-foundation.md` § Phase 7 for the full found-list.

    - `[ ]` **7.4.a Sweep companion-type refs across live shipped content** (both copies)
        - Named anchors: `DEV-RULES.ARC.md` § Leave it cleaner; `strategy-task-list-formatting.md` § Atomic Companion
          File; `commit-footer` method; `template-tasks.md`; `strategy-work-organization.md` § Directory Structure
          row; plus the full found-list. Acceptance: zero `atomic-{name}` / `atomic-*` / "atomic companion file"
          companion-type refs remain in live shipped content (reword dangling §-links rather than deleting the
          surfaces they point at).
        - _Scope:_ live shipped ARC content (rules / strategies / methods / templates / workflows / briefs). **Out:**
          docs-site (`docs/` — dedicated docs WU), historical ADRs (e.g. `adr-008`, immutable record), internal
          analysis / supplemental docs, and this WU's own `spec-*` (self-referential — it describes the retirement).
          **Preserve:** the `ATOMIC-INBOX` / `USER-INBOX § Atomic` surfaces and atomic-character refs (e.g. tier-shape
          mentions in `strategy-work-organization.md` § Spec-Flow Invariants line ~133 and § Archival line ~353).

    - `[ ]` **7.4.b Sweep workflow mentions** (both copies)
        - `2_generate-tasks.md` (companion creation at Pass 1 + Step 4 checklist), `activate` / `verify` /
          `deactivate` / `archive` work-unit workflows. Watch for cleanup-list enumerations (e.g.
          `deactivate-work-unit.md` Case A-delete Step 4's `active/atomic-*` line ~132), not just companion-creation
          refs. _Note:_ `integrate-work-unit.md` carries only the protected `§ Atomic → ATOMIC-INBOX` surface —
          verify-only, nothing to sweep.

    - `[ ]` **7.4.c Document the rerouted capture** (AGENT-BRIEF in scope; docs-site out)
        - `AGENT-BRIEF.{ARC,CONTRIBUTOR}.md` are in-scope shipped briefs — sweep their companion-type refs. The
          docs site (`docs/**`) is out of scope WU-wide (dedicated docs WU). Document the rerouted capture (fold
          into commit / add a task / spin an Errand / `USER-INBOX § Atomic`) in the swept ARC docs.

### `[ ]` **7.5 Shipped-doc drift-fix**

- _Goal:_ the cut shift-state-machine rows (`Paused` / `Waiting-For`, "future arc-shift") are removed from
  `strategy-work-organization.md` and its state table reconciled with the 4-state machine; the
  `deactivate-work-unit.md` "arc-shift (future)" reference is removed and Case B fills with substantive
  operator-path content (no surviving `arc-shift` to reconcile against — see `cohort-agile-parallelism.md`
  § Deferred — `/arc-shift`); and § ROADMAP redefines In Flight as location-based (`active/**` is in flight;
  Ready/Blocked scope to `backlog/planned/**`), corrects the activation framing, and shifts the regen fire-point
  earlier — a WU enters In Flight on landing in `active/**`, requiring an `init-work-unit` regen step + an
  `activate-work-unit` framing touch.
- **Strategies:** `strategy-work-organization.md`

    - `[ ]` **7.5.a Rewrite the State Enum table + Superseded disposition + integrate sub-section update**
      (`strategy-work-organization.md` + `integrate-work-unit.md`, both copies)
        - _Note:_ rewrite the whole enum table — 4 rows: Planning (set by `init-work-unit`), Active (set by
          `activate-work-unit` Step 4), Integrating (set by `integrate-work-unit` Step 1), Shipped (set by
          `archive-work-unit`) — each with Set By + Meaning. Superseded is **not** in the enum; its disposition
          lives in the Optional Pointer Fields sub-table as `**Superseded By:**`, annotating WUs whose remaining
          scope was absorbed by a successor (state flows Integrating → Shipped normally — no separate state value).
          Also rewrite the Optional Pointer Fields sub-table accordingly. _Notes:_ See
          `notes-worktree-foundation.md` § Phase 7.
        - _Note:_ `integrate-work-unit.md § Handling Partially Superseded Work` updates to set the
          `**Superseded By:**` annotation, not a state value. Same commit as the strategy-doc rewrite (interfaces
          are paired).
        - _Note:_ framing guard — requalify, don't entrench: write the rewritten tables to **present** the
          four-state enum, not to declare `template-meta.md` its source of truth. Both edit targets are
          adopter-facing — phrasing stays authority-neutral (no schema/ADR reference, no claim of a code schema WF
          hasn't built). The four state values are stable across the structural-ownership migration; only where
          the structure is owned changes. Neutral phrasing needs no re-sweep when that ownership moves off the
          template.

    - `[ ]` **7.5.b Case B fill + arc-shift reference removal** (both copies)
        - _Note:_ `deactivate-work-unit.md` Case Matrix's Case B cell currently reads "→ `arc-shift` (future)" —
          change to "See § Case B below" and add a new § Case B section enumerating three operator paths: (1)
          integrate the partial scope (→ `integrate-work-unit`); (2) abandon with history loss (like Case A-delete
          but commits become reflog-only-recoverable — explicit warning, explicit authorization); (3) move work
          to a successor (cherry-pick to a new WU's branch, then run Case A-delete on the original). The
          deactivate workflow doesn't automate Case B — names the paths without claiming automation.
        - _Note:_ no surviving `arc-shift` in this WU to reconcile against — remove the "(future)" reference and
          fill with the § Case B content (don't reword the cell to point at planning artifacts).

    - `[ ]` **7.5.c § ROADMAP location-based In-Flight redefinition + regen fire-point shift + init-work-unit
      edit** (`strategy-work-organization.md` + `init-work-unit.md` + `activate-work-unit.md` framing touch, both
      copies)
        - _Note:_ edit the literal § ROADMAP step-4 In-Flight definition (currently
          `**In Flight** — State: Active | Integrating`) to location-based — a WU located in `active/**` is in
          flight regardless of state. Correct the Regeneration "Activation" bullet's framing
          (`active/ ⟹ State: Active` is planner shorthand; reframe activation as self-healing regen against the
          location-based tier).
        - _Note:_ add a ROADMAP regen step to `init-work-unit.md` at the end of its directory-move work (Step 3
          Path A and other paths that populate `active/<wu>/`) — that's where the WU enters In Flight under the
          new definition. `activate-work-unit.md` Step 7's existing regen stays as self-healing redundancy
          (re-renders same tier state); light framing touch — "activation refreshes ROADMAP" rather than
          "activation moves the WU into the In Flight tier."
        - _Note:_ ROADMAP regen is doc-only (hand-maintained, no render code) — no tests.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` Prompt-flow turn budget met: resume-clean → 0 prompts; resume-needs-sync → 1; cold-start (bare
  worktree) → 1; branch-gone → 1 with pre-computed candidates

- `[ ]` A deleted upstream reports `branch-gone` (not `remote-unavailable`); the motivating recovery resolves
  through the cascade with candidate surfacing, not manual git archaeology

- `[ ]` Common-path latency unchanged — resume of a local WU adds no fetch/scan beyond today's probe; roster
  pre-compute and cascade demonstrably fire only in their triggering branch

- `[ ]` Spawn returns to origin — the originating session is unchanged and on its own branch/worktree; the new
  worktree exists at the templated path with branch + meta + empty SESSION-NOTES

- `[ ]` Cross-WU sync correctness — spawn → first-load does not import the prior WU's SESSION-NOTES; cross-WU
  entries merge by entry identity with tombstones honored; concurrent worktree pushes reconcile without data
  loss; retired-WU subdirs reconcile rather than linger

- `[ ]` External-worktree composability — ARC reads location from `git worktree list` and never relocates or
  refuses an externally-created worktree; a branch-naming mismatch is a warning, not a block

- `[ ]` No permanent orphaned worktrees or markers — a marker cannot outlive its worktree; every lingering
  worktree for a shipped WU is surfaced at the next main-worktree session-init or on reopen (verified against a
  spawn-on-A / integrate-on-B / resume-on-A trace)

- `[ ]` Framework self-consistency — no dangling `atomic-*` companion references across rules / strategies /
  methods / templates / workflows / briefs; `strategy-work-organization.md` and § ROADMAP carry no cut
  shift-state-machine rows and use the location-based In-Flight definition; `manage-incidental-work.md` no
  longer sets retired pause-pointer fields

- `[ ]` Methods genuinely overridable — the worktree branch posture (via `branch-format`) and
  `worktree.location_template` resolve defaults and accept overrides through the standard method-override
  machinery

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
