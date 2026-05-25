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

### `[ ]` **2.7 Stale-worktree sweep at main-worktree session-init**

- _Goal:_ a main-worktree session-init cross-references `git worktree list` against main's `completed/` and
  surfaces any lingering worktree whose WU has shipped for marker-gated cleanup — closing the spawn-on-A /
  integrate-on-B / never-reopen-A gap — without scanning siblings on the resume-a-WU path.
- **Strategies:** `strategy-session-operations.md`

    - `[ ]` **2.7.a Sweep logic**
        - Cross-ref worktree list against `completed/` (local, network-light). Reuse the existing
          `parseWorktreeList` (`lib/git/worktree-roster.ts`) / `runWorktreeRoster` for enumeration — do not
          re-roll a porcelain parser.
        - _Note:_ pin the match key — worktree branch (`plan/foo` / `feat/foo`) won't string-match
          `completed/{quarter}/NN_{wu-name}` dir names; normalize (strip `NN_` + branch type-prefix, compare
          WU-name slug) and decide the quarter-dir glob scope. This shipped-WU predicate (normalize +
          `completed/` cross-ref) is **shared with 4.2's** retired-subdir reconciliation — build it once.
          _Notes:_ See `notes-worktree-foundation.md` § Phase 2.
        - Build `test-first` (one behavior at a time):
            - lingering worktree for a shipped WU → surfaced
            - active-WU worktree → not surfaced
            - sweep runs only in the main worktree (resume path never scans siblings)

    - `[ ]` **2.7.b Marker-gated surfacing + workflow doc**
        - Consume the Phase 1 decision fn; document the sweep step in the session-init workflow (both copies).
        - _Note:_ worktrees are only ever surfaced — never auto-removed without the marker-gated
          clean-+-merged guard.

## **Phase 3:** Cross-WU sync — load & merge

_Purpose:_ Establish the correct per-WU-isolated load substrate and cross-WU entry merge before the entry verbs
build on it — path-driven sync-class dispatch, per-WU subdir load (which fixes the spawn → first-load
overwrite), per-file entry-union merge, and tombstones for deletions.

_Design decisions:_ Layers on WOR R65's `user/` structure and the existing `arc user` save/load family
(`lib/git/user-sync.ts`, `commands/user/save-load.ts`, `findNearestUserNote`). This phase precedes the spawn
primitive (Phase 5) so spawn lands on a correct load — 3.2 is the fix behind the "spawn returns to origin"
success criterion.

### `[ ]` **3.1 Path-driven sync-class dispatch**

- _Goal:_ `arc user save`/`load` infer per-WU vs cross-WU sync class purely from path structure
  (`user/{identity}/<wu-name>/**` per-WU; flat `user/{identity}/**` cross-WU; `.internal/**` never synced) — no
  sync-class allowlist, no in-band class declaration.
- _Context:_ this is a **separate axis** from `serialize`'s existing file-**type** allowlist (`isAllowedFile` /
  `ALLOWED_EXTENSIONS` + `EXCLUDED_NAMES`, which decides whether a file serializes at all) — R16's "no
  allowlist" means no _sync-class_ allowlist; the type filter stays. The new classifier owns the sync-class
  semantic and is its single source of truth; the io-layer dotfile skip (`io-context.ts` `readUserDir`,
  `user-sync.ts` `serialize`) stays as a cheap walk-time prefilter (single consumer, no external breakage) —
  don't replicate class logic across the two.

    - `[ ]` **3.1.a Sync-class classification function**
        - Owns the per-WU / cross-WU / never-synced decision; the file-type allowlist applies on its own axis.
        - Build `test-first` (one behavior at a time):
            - subdir path → per-WU class
            - flat identity-root path → cross-WU class
            - `.internal/**` path → never-synced
    - `[ ]` **3.1.b Wire into save/load** (`lib/git/user-sync.ts`, `commands/user/save-load.ts`)
        - _Note:_ keep the classifier modular (a `lib/user-sync/` home) — `user-sync-module-split` later extracts
          into `lib/user-sync/*`, and entangling it with `save-load.ts` flow widens that split. _Notes:_ See
          `notes-worktree-foundation.md` § Phases 3 & 4.

### `[ ]` **3.2 Per-WU subdir load**

- _Goal:_ a load restores from the most recent reachable note containing the current WU's subdir and skips
  older notes' other-WU subdirs — resolving the spawn → first-load overwrite where a fresh worktree's
  ancestor-walk would otherwise import the prior WU's SESSION-NOTES.
- _Context:_ the load path carries no current-WU signal today — `UserLoadOptions` (`{ cwd, io, identity,
  maxAncestorWalk? }`, defined in both `commands/user/types.ts` and `handlers/user.ts`) and
  `findNearestUserNote` must gain a current-WU-name input, derived from active-meta resolution / branch →
  wu-name (the same derivation session-init uses).

    - `[ ]` **3.2.a Subdir-aware note resolution** (extend `findNearestUserNote` + thread the WU-name input)
        - Add the current WU name to `UserLoadOptions` (both definitions) and `findNearestUserNote`'s signature;
          resolve the note search by "contains the current WU's subdir."
        - Build `test-first` (one behavior at a time):
            - restores from the most-recent note containing the current WU subdir
            - an older note's different-WU subdir → skipped
            - spawn → first-load → the prior WU's SESSION-NOTES is not imported
    - `[ ]` **3.2.b Load restricts to current WU subdir + cross-WU flat**

### `[ ]` **3.3 Cross-WU file merge (per-file entry list-union)**

- _Goal:_ cross-WU files merge across the N most-recent ref-wide notes via value-level list-union of their
  entries, deduped by entry identity — so entries created in parallel worktrees converge instead of clobbering.
- _Note:_ the two files have different entry shapes. `WORKING-MEMORY` entries = bold-field header (`**...:**`) +
  `_Remove when:_` + body under `## Memories`; `USER-INBOX` entries = list items (`- **lead-in** — text`)
  within `## Atomic` / `## Backlog` H2 sections. Merge-key per file (WORKING-MEMORY → bold-field header;
  USER-INBOX → list-item lead-in, section-scoped). Same entry-identity with a divergent body →
  most-recent-note wins (recency-ordered), consistent with 3.4's tombstone recency; the older body survives in
  its note history. Keep the merge modular (`lib/user-sync/` home) for the `user-sync-module-split` extraction.
  _Notes:_ See `notes-worktree-foundation.md` § Phases 3 & 4.

    - `[ ]` **3.3.a Per-file entry parser + list-union / dedupe**
        - Build `test-first` (one behavior at a time):
            - WORKING-MEMORY: disjoint bold-field entries from two notes → union of all
            - WORKING-MEMORY: same header in both, identical body → single deduped entry
            - WORKING-MEMORY: same header, divergent body → most-recent-note's body wins
            - USER-INBOX: list items merge within their `## Atomic` / `## Backlog` section (boundaries kept)
            - malformed / unparseable entry → surfaced, not silently dropped
    - `[ ]` **3.3.b Ref-wide N-most-recent-note read** (recency-ordered)
        - _Note:_ a new read mode distinct from `findNearestUserNote`'s first-hit walk (N-most-recent across
          the whole notes ref). Must expose note **recency order** — both 3.3's divergent-body resolution and
          3.4's tombstone recency depend on it, so it returns an ordered sequence, not a set.
        - Build `test-first` (one behavior at a time):
            - N bound respected
            - fewer-than-N notes available → reads what exists
            - notes returned in recency order (most-recent first)
            - empty ref → no-op
    - `[ ]` **3.3.c Wire merge into load**

### `[ ]` **3.4 Tombstones for cross-WU deletions**

- _Goal:_ deleting a cross-WU entry writes a timestamped `## Removed: {name}` tombstone that the merge honors
  over earlier inclusions, with a generous fixed-TTL filter-at-merge GC so tombstones eventually drop — the
  contract being the mechanism (time-based TTL, filter-at-merge), not the constant.
- _Note:_ no user-facing "sync within N days" guarantee; the failure mode (re-deleting a note, not data loss)
  keeps the TTL an internal cleanup detail. The tombstone keys to the same per-file entry identity as 3.3;
  `## Removed: {name}` is an H2 marker.

    - `[ ]` **3.4.a Tombstone write on entry removal**
    - `[ ]` **3.4.b Merge respects latest tombstone**
        - Build `test-first` (one behavior at a time):
            - tombstone suppresses an earlier inclusion of the same entry
            - most-recent tombstone wins over an earlier re-add
            - TTL-expired tombstone stops propagating and drops

## **Phase 4:** Cross-WU sync — reconcile, orphans & seam

_Purpose:_ The reconciliation half of cross-WU sync — concurrent-push reconcile, retired-subdir reconciliation,
grouped orphan messaging, and the coherence-WU schema seam. Depends on Phase 3's load/merge substrate.

_Design decisions:_ `.sync-state.json` is already at schema `version: 3` with a `partialPush` marker — 4.4
bumps the version and makes the shape worktree-aware on top of that, reserving (not building) the downstream
extension points. Concurrent-push reconcile (4.1) operates on the global `refs/notes/arc/user/{identity}` ref
that all worktrees share.

### `[ ]` **4.1 Concurrent-push reconcile (`git notes merge`)**

- _Goal:_ when parallel worktrees push notes and the second hits non-fast-forward, the push reconciles via
  `git notes merge` (cat_sort_uniq default) and surfaces to the user only when the conflict is non-trivial.

    - `[ ]` **4.1.a Non-ff detection + notes-merge reconcile** (`paired-push.ts` / `push-fetch.ts`)
        - At the notes-push leg of `runPairedPush`: on non-ff, fetch + `git notes merge` (cat_sort_uniq) +
          re-push, automatically — **instead of** the generic interactive recovery
          (`pushWithInteractiveRecovery`, `push-recovery.ts`), a single force/merge/cancel path with no
          notes-vs-branch distinction. Notes merges auto-reconcile losslessly; the interactive recovery stays
          for the worktree/branch leg only (`runUserPush` surfaces the non-ff signal). _Notes:_ See
          `notes-worktree-foundation.md` § Phases 3 & 4.
        - Build `test-first` (one behavior at a time):
            - second push hits non-ff → `git notes merge` reconcile, push succeeds
            - cat_sort_uniq unions both sides without loss
            - clean fast-forward → no merge invoked
            - branch/worktree-leg rejection → unchanged (still the interactive recovery path)
    - `[ ]` **4.1.b Non-trivial-conflict surfacing**
        - Build `test-first` (one behavior at a time):
            - cat_sort_uniq union (no true conflict) → no surface
            - notes-merge conflict / abort → surfaced to the user, push not silently dropped

### `[ ]` **4.2 Retired-subdir reconciliation**

- _Goal:_ `arc user load` / `pull` / session-init reconcile retired-WU subdirs that linger after a WU shipped on
  another machine — local subdir present + absent from recent notes + WU shipped → offer or auto-close with a
  `.internal/` backup.
- _Context:_ `findStaleUserWuSubdirs` (`commands/user/open.ts`) is **detection-only and has no shipped-check** —
  it returns non-target subdir names; `removeStaleUserWuSubdir` is the separate removal primitive. 4.2 adds the
  missing pieces: a **"WU shipped" predicate** (cross-ref `completed/` with the same match-key normalization as
  2.7a's sweep — strip `NN_` + branch type-prefix, compare WU-name slug; **build once, share with 2.7a**), then
  wires reconcile = shipped-predicate + `removeStaleUserWuSubdir` + `.internal/` backup.

    - `[ ]` **4.2.a Reconciliation logic**
        - Build `test-first` (one behavior at a time):
            - present + absent-from-notes + shipped → reconcile with `.internal/` backup
            - present + still-in-notes → preserved (not retired)
            - present + not-shipped → preserved
    - `[ ]` **4.2.b Wire into load / pull / session-init**

### `[ ]` **4.3 Orphan-warning messaging (T2 grouped + T1 rename-detection)**

- _Goal:_ when retired orphans cluster under a path prefix entirely absent from the incoming manifest, one
  grouped informational line + cleanup hint replaces N warnings (T2, P0); and a local orphan whose content
  matches a different name in the manifest surfaces as "Looks like rename X → Y" (T1, P1) — the underlying
  preserve-to-`.internal/` behavior unchanged, only surfacing changes.

    - `[ ]` **4.3.a T2 grouped retirement messaging**
        - Build `test-first` (one behavior at a time):
            - cluster under a prefix absent from manifest → one line + cleanup hint (not N warnings)
            - mixed orphans → fall back to per-item warnings
    - `[ ]` **4.3.b T1 content-equivalence rename detection** (P1)
        - Build `test-first` (one behavior at a time):
            - orphan content matches a different manifest name → "Looks like rename X → Y"
            - no content match → generic "not in saved manifest"

### `[ ]` **4.4 Coherence-WU schema seam (`.sync-state.json`)**

- _Goal:_ the `.sync-state.json` schema is versioned and worktree-aware so the downstream
  `cross-machine-sync-coherence` WU's remote partial-push marker and T3 drift layer land without a rewrite —
  leaving the seam, not building the marker.
- _Shape:_ (i) bump the schema `version` (currently `3` → `4`); (ii) keep the shape worktree-aware — no single
  (main-worktree) HEAD assumption, since concurrent worktrees are now real and partial-push state is
  per-worktree; (iii) reserve extension points for a `priorFileList` (T3's drift signal) and remote-marker
  provenance, implementing neither.
- _Note:_ `partialPush` is a live single-ref field with writers (`recordPartialPushMarker`, `runPairedPush`) —
  reshape them in lockstep; the reader's `2 || 3` back-compat ladder extends to `4`. _Notes:_ See
  `notes-worktree-foundation.md` § Phases 3 & 4.
- **Strategies:** `strategy-storage-evolution.md`

    - `[ ]` **4.4.a Schema `version` bump + worktree-aware shape**
        - Build `test-first` (one behavior at a time):
            - new `version` written; prior v2 / v3 records read back-compat (incl. the old single-`partialPush`)
            - shape carries per-worktree partial-push state (no single-HEAD assumption)
            - reserved fields absent → tolerated; present → preserved round-trip
    - `[ ]` **4.4.b Record the partial-push-surface widening**
        - _Note:_ document (in `notes-{name}.md`) that concurrent-worktree notes-push _widens_ the partial-push
          surface — the downstream WU is genuinely necessary, not merely inherited.

## **Phase 5:** Entry primitives & `arc-session`

_Purpose:_ Deliver the WU entry verbs — spawn (create branch + worktree + meta) and cold-start
(scaffold-in-place) behind the renamed `arc-session` entry skill — plus the degrading concurrency-check stub
and the Errand cheap-branch path documentation.

_Design decisions:_ Consumes Phase 1 (methods resolve location/naming; marker written at create), Phase 2 (probe
pre-resolves dispatch data so `arc-session` reaches the right prompt in one turn), and Phase 3 (correct per-WU
load). Spawn and cold-start share **one** CLI-level scaffolding primitive, parameterized by worktree-target
mode (create-new vs. use-existing) — spawn creates the worktree, cold-start enters an existing one; the entry
surfaces (`arc-session`, and the downstream `arc start`) stay thin skills over it. R28's `init-work-unit`
worktree-creating mode (5.1) is the create-new path; the removal-side ceremony edits live in Phase 7.

### `[ ]` **5.1 `init-work-unit` worktree-creating mode**

- _Goal:_ `init-work-unit` gains a worktree-creating mode (`git worktree add <templated-path> -b plan/{name}`,
  path resolved via the Phase 1 location template) while the in-place `git checkout -b` mode survives for the
  single-worktree / atomic-launchpad case.
- **Strategies:** `strategy-work-organization.md`

    - `[ ]` **5.1.a Worktree-creating mode** (`init-work-unit.md`, both copies)
    - `[ ]` **5.1.b In-place mode retained + mode selection**
        - _Note:_ stays planning-welded — the Planning-vs-Active-at-creation generalization is AWL's seam,
          not this WU's.

### `[ ]` **5.2 Spawn primitive**

- _Goal:_ a one-shot spawn, invoked from an existing session, creates a new WU's branch, worktree, meta, and
  empty SESSION-NOTES, reports the new worktree path, and returns the originating session unchanged to its own
  context — no stash-switch, no disruption to in-flight state.
- _Approach:_ the testable git/fs mechanics live in **one shared CLI-level scaffolding primitive** that
  cold-start (5.3) also calls, parameterized by **(a) a worktree-target mode** — create-new at the templated
  path (via 5.1's `git worktree add` mode) vs. use-existing — and **(b) a created-by-arc flag** driving the
  marker. Spawn calls it create-new + flag true (worktree + Planning-state meta + empty SESSION-NOTES +
  marker), invoked from the `arc-session` skill — not a standalone CLI command. Ships tier-agnostic; accepts a
  forward-compat `--tier` / `--type` it does **not** branch on (AWL's seam); **never fires under auto-cascade**.
- _Note:_ "returns to origin" is automatic at the git level (`git worktree add` doesn't touch the invoking
  worktree); the residual discipline is in the skill — do NOT `cd` into the spawned path, only report it.
- **Strategies:** `strategy-work-organization.md`

    - `[ ]` **5.2.a Spawn via the shared scaffolding primitive (create-new)**
        - Build `test-first` (one behavior at a time):
            - creates branch + worktree + meta + empty SESSION-NOTES at the templated path
            - the originating session is unchanged, still on its own branch/worktree
            - `--tier` / `--type` accepted but not branched on
            - never fires under auto-cascade (explicit invocation only)
    - `[ ]` **5.2.b Ownership-marker write + optional breadcrumb seed**
        - Write the marker (1.3); optionally seed SESSION-NOTES with a one-line breadcrumb to the spawning
          context.

### `[ ]` **5.3 Cold-start scaffolding primitive**

- _Goal:_ the shared scaffolding primitive (5.2's) creates a meta in an existing bare worktree from any spec
  input (file pointer / URL / issue / plan-doc / name + description), honoring WOR's Origin ⊥ Design
  orthogonality, invoked from `arc-session` (discovery) and, later, `arc start` (deliberate create-in-place).
- _Note:_ cold-start calls the shared primitive in **use-existing** mode — it enters a worktree ARC did not
  create (tool / manual `git worktree add`), so in Foundation it is **always advisory** (created-by-arc flag
  false → no marker). The create-new + marker branch is spawn's (and later `arc start`'s). Honors the
  `branch-format` convention when ARC creates state (warn-only on external mismatch).
- **Strategies:** `strategy-work-organization.md`

    - `[ ]` **5.3.a Shared scaffolding primitive (CLI-level)** — the use-existing path of 5.2's primitive
        - _Note:_ one primitive serves both spawn (create-new) and cold-start (use-existing); `arc start` is
          downstream (Agile WU Lifecycle's), so build it standalone with `arc-session` as its only current
          caller (ready for the future `arc start`).
        - Build `test-first` (one behavior at a time):
            - scaffolds a Planning-state meta in a bare worktree (use-existing, no `git worktree add`)
            - invoked via `arc-session` discovery
    - `[ ]` **5.3.b Spec-input parser**
        - _Note:_ written plainly now (hand-rolled per-variant); CSA later migrates the 5-variant parser to a
          zod discriminated union — leave the seam. _Notes:_ See `notes-worktree-foundation.md` § Phases 5 & 6.
        - Build `test-first` (one behavior at a time):
            - file pointer / URL / issue link / plan-doc / name + description each parse to the right shape
            - external reference → `**Origin:**`; ARC-owned artifact → `**Design:**`
    - `[ ]` **5.3.c Marker semantics via the created-by-arc flag**
        - The shared primitive's created-by-arc flag drives the marker: spawn → true (writes); cold-start in
          Foundation → false (advisory only — tool / manual worktree). The flag-true cold-start path is
          exercised later by `arc start` — present as a seam, not built here.

### `[ ]` **5.4 `arc-session` entry skill (rename from `arc-resume`, dispatch)**

- _Goal:_ the renamed `arc-session` skill is the session-_entry_ surface — it inspects worktree state and
  dispatches _resume_ (local meta present) or _cold-start_ (bare worktree, offered, never auto-scaffolded) —
  with the _materialize_ dispatch seam present (In-Flight Awareness fills it). Arg-free / discovery-led by
  default; one optional `/arc-session <pointer-or-blurb>` may pre-seed cold-start, confirmed before use.

    - `[ ]` **5.4.a Rename + reframe the skill + sweep references** (canonical sources, both copies)
        - Rename `arc-resume` → `arc-session` in `system/.internal/skills/` and reframe from resume-only to
          entry/dispatch; then **grep-sweep all ~19 `arc-resume` references** so none dangle — `.arc/system/**`
          (session-loop, initial-setup 01/02, add-agent, skills/README) and `.arc/reference/**`
          (strategy-session-operations, strategy-package-project-sync, AGENT-BRIEF.ARC, analysis docs), both
          copies where applicable. _Note:_ ADR-011 names `arc-resume` as an example — update for accuracy
          (illustrative reference, not a claim about the name).
    - `[ ]` **5.4.b Dispatch logic**
        - _Note:_ dispatch reads the Phase 2 probe pre-resolution; the skill does not run its own
          fetch / worktree-list / meta-reads across turns.
    - `[ ]` **5.4.c Optional-arg seed (confirmed before use)**
    - `[ ]` **5.4.d Hand-sync harness skill copies**
        - Per the self-hosting drift note, copy the canonical `SKILL.md` into `.claude/skills/` and
          `.codex/skills/` so this repo's own sessions pick up the rename.

### `[ ]` **5.5 Activation-time concurrency-check stub**

- _Goal:_ before creating a worktree, the spawning / cold-starting session reads in-flight WUs (`git worktree
  list` + identity-filtered metas) and surfaces scope-overlap concerns via general agent judgment over
  `**Purpose:**` / spec text — but does **not** gate, and degrades to a no-op when nothing else is in flight.
- _Note:_ Foundation ships only this stub — no probe tooling, no `**Touches:**` field. In-Flight Awareness
  upgrades it to the oracle-backed version. Fires identically from spawn and cold-start.

    - Add the advisory step to the spawn + cold-start surfaces (shared).

### `[ ]` **5.6 Errand cheap-branch path documentation**

- _Goal:_ the Errand-class path is documented — an Errand (per ADR-021) has no meta, never touches the spawn
  primitive, launches from the **main worktree** on a short-lived branch off `main`, ships via the lighter
  gate, and tears down — and ADR-021's cheap-branch floor is ratified.
- _Note:_ the deliverable is documenting the path + ratifying the ADR, not building an "Errand mode" on spawn.
  The Errand's "launch from the main worktree" framing is an instance of the main-on-main pattern — the shipped
  doc cross-references the main-on-main strategy content (7.3's deliverable) for the launchpad rationale rather
  than restating it, to avoid drift.
- _Cross-ref:_ the launch ergonomics (`errand-launch` primitive, Errand decision matrix, advisory
  foreign-artifact gate) are **Errand Enablement's** (`draft-errand-enablement.md`), sequenced
  WF → Errand Enablement → IFA — not Foundation's. 5.6 documents the path only.
- **Strategies:** `strategy-work-organization.md`

## **Phase 6:** In-session shift (`arc-shift`)

_Purpose:_ Add the thin `/arc-shift` skill that repoints the current session to another existing in-flight
worktree, preserving accumulated agent context, with uncommitted-work handling at the switch.

_Design decisions:_ Distinct from spawn — shift repoints to an **existing** worktree (the short-detour case a
fresh `arc-session` would lose context on); creating one for a new WU is spawn (5.2). Built after the entry
verbs so there are worktrees to shift between.

### `[ ]` **6.1 `/arc-shift` skill**

- _Goal:_ a thin `/arc-shift` skill repoints the current session to another existing in-flight worktree,
  preserving the agent's accumulated context, with discovery-led target selection from `git worktree list` and
  an optional arg.
- _Mechanism:_ "repoint" = re-orient the agent to the target worktree **within the same conversation** (read
  its `meta-*` + SESSION-NOTES, operate against its path) — **not** a new session. Shift is **return-intent
  cross-worktree investigation**: a short detour you intend to return from before handoff, which is what makes
  context-preservation worth it (a permanent switch is just handoff + fresh session; a mis-launch is clear +
  re-init — neither has accumulated context to preserve). Each worktree is independently handoff-able, so a
  sidequest that outgrows the detour can handoff in place then shift back — no special handling.
- _Note:_ **narrow scope** — shift's one irreducible use is interactive cross-worktree _investigation_
  (operate in another worktree's runnable environment while reasoning with the current session's live,
  expensive-to-reconstruct context). It is **not** the general sidequest tool: discovered side work is an
  Errand (`errand-launch`, owned by Errand Enablement), and a discrete question about another worktree is
  answered by reading its files or seeding an exploration session. The fuller usage doctrine (when to
  parallelize, the return discipline) is Concurrent Work Conventions's (a Non-Goal here); 6.1 ships the
  mechanism + the minimal framing that justifies it.

    - `[ ]` **6.1.a Skill authoring** (canonical sources + harness hand-sync)
    - `[ ]` **6.1.b Target selection (discovery-led + optional arg)**
        - _Note:_ creating a worktree for a new WU is spawn, not shift. Reuse `runWorktreeRoster` /
          `parseWorktreeList` (`worktree-roster.ts`) for the worktree enumeration — same as 2.4 / 2.7a / 5.5.
          The stale "arc-shift (future)" references (`deactivate-work-unit.md`, `strategy-work-organization.md`)
          reconcile to this shipped skill in 7.5.

### `[ ]` **6.2 Uncommitted-work handling at the shift**

- _Goal:_ before switching, `/arc-shift` detects uncommitted changes (reusing `runDirtyStateStatus`) and offers
  commit (recommended) / stash / leave-as-is; the operator chooses.

    - Detect uncommitted changes; present the three-way choice.

### `[ ]` **6.3 Resume-staleness advisory** (P2)

- _Goal:_ arriving in a long-idle worktree surfaces a dismissible "assumptions may be stale — re-read the spec"
  nudge past a fixed idle threshold.

## **Phase 7:** Lifecycle ceremonies, retirements & doc reconciliation

_Purpose:_ Wire worktree create/remove into the lifecycle ceremonies (consuming the marker contract) and leave
the framework self-consistent at ship — neutralize the obsolete pause-pointer mechanic, document the
main-on-main pattern, retire the `atomic-*` companion type, and fix the shipped-doc drift the cohort's resolved
decisions create.

_Design decisions:_ Sequenced last so the doc reconciliation lands against everything built. R28's removal-side
ceremony edits join here with R29's cleanup-site wiring (7.1). R32's sweep includes `2_generate-tasks.md`
itself — and this WU dogfoods the retirement (no `atomic-*` companion was created for it).

_Note:_ "(both copies)" maps to per-file package suffixes — `.template.md` for `session-handoff` (7.1d),
`2_generate-tasks` + `3_process-task-loop` (swept by 7.4); plain `.md` for the work-unit-lifecycle ceremonies
(7.1a-c) and `manage-incidental-work` (7.2). Docs-site content (`docs/`) is out of scope WU-wide (dedicated
docs WU). _Notes:_ See `notes-worktree-foundation.md` § Phase 7.

### `[ ]` **7.1 Lifecycle ceremony worktree touches (marker-gated cleanup)**

- _Goal:_ the lifecycle ceremonies wire worktree removal with marker-gated cleanup — `integrate-work-unit` adds
  a post-merge worktree-removal step run from main; `deactivate-work-unit` Case A-delete runs `git worktree
  remove` before `git branch -D` while Case A return-to-Planning leaves the decoupled path; `activate` gets a
  defensive `arc user open` reaffirm plus Step-4 meta-field sync (`Branch` + `Next Action`); `session-handoff`
  gets an optional worktree-context surface.
- _Note:_ a worktree cannot remove itself — removal runs from the main worktree, composing with the
  batched-archive step. All cleanup consults the Phase 1 marker decision; phrasing is origin-agnostic
  (ARC-spawned and external both reach the same advisory/offer).
- **Strategies:** `strategy-work-organization.md`

    - `[ ]` **7.1.a `integrate-work-unit` post-merge removal (from main)** (both copies)
    - `[ ]` **7.1.b `deactivate-work-unit` Case A-delete order + Case A return-to-Planning path-left** (both copies)
    - `[ ]` **7.1.c `activate-work-unit` defensive `arc user open`** (both copies)
        - _Note:_ already present (idempotent reaffirm) — verify / light-touch, likely no net-new content.
    - `[ ]` **7.1.d `session-handoff` optional worktree-context surface** (both copies)
        - _Note:_ handoff already surfaces worktree context (worktree probe slot + summary line) — extend,
          don't add from scratch.
    - `[ ]` **7.1.e `activate-work-unit` Step 4 meta-field completeness** (both copies)
        - _Note:_ Step 4 flips only `**State:**`, but Step 5 renames the branch `plan/<name>` → `<type>/<name>` —
          leaving meta `**Branch:**` stale, which breaks session-init's branch-match disambiguation.
          `deactivate-work-unit` Step 2 updates both `State` and `Branch`; activate should mirror it. Also refresh
          the now-stale `**Next Action:**` pointer (still names the activation workflow after activation completes).

### `[ ]` **7.2 Pause-pointer neutralization in `manage-incidental-work.md`**

- _Goal:_ `manage-incidental-work.md` no longer instructs setting the retired pause-pointer fields
  (`Interrupts:` / `Paused At:` / `Paused To:`), so it stops contradicting `template-meta.md`'s 4-state
  machine.
- _Note:_ surgical premise-neutralization only — the deeper reshape (standalone-workflow question, work-class
  consolidation) belongs to the agent-context-optimization cohort, not here. The three fields above are the
  ones the workflow actually sets. Fold in the file's other stale drift (a `status-{parent-name}.md` reference
  → `meta-`; non-4-state `State:` values). _Notes:_ See `notes-worktree-foundation.md` § Phase 7.

    - Neutralize the pause-pointer mechanic in `manage-incidental-work.md` (both copies).

### `[ ]` **7.3 Main-on-main pattern documentation**

- _Goal:_ ARC's stance is documented — the main worktree stays on `main` as a stable reference and the launchpad
  for admin operations (planning, sweep, global edits) and atomic / Errand launches; no separate dedicated
  administrative worktree; composes with externally-spawned worktrees (the tool's main workspace IS ARC's main
  worktree).
- _Note:_ include the one-worktree-per-IDE/LSP operational constraint (document, don't engineer around).
- **Strategies:** `strategy-work-organization.md`

    - `[ ]` **7.3.a Strategy-doc content** (`strategy-work-organization.md`, both copies)
    - `[ ]` **7.3.b Workflow-guidance cross-refs**

### `[ ]` **7.4 Retire the `atomic-*` companion file type**

- _Goal:_ the `atomic-*` companion file type is retired and its capture rerouted (fold into the commit / add a
  task / spin an Errand / `USER-INBOX.md § Atomic`), with all references swept — the shared `ATOMIC-INBOX.md`
  surface, `USER-INBOX § Atomic`, and the atomic _character_ unaffected; only the per-WU companion file type
  retires.
- _Note:_ a grep-driven sweep, not a fixed list — companion-type refs extend well beyond the named anchors
  (e.g. `strategy-planning-module.md` ~17 refs, `strategy-file-classification.md`'s file-type registry row,
  `3_process-task-loop.md`, `DEV-RULES.PROJECT.md`, `completed/README.md`, and `USER-INBOX` / `ATOMIC-INBOX`
  template §-cross-links that dangle on removal). _Notes:_ See `notes-worktree-foundation.md` § Phase 7 for the
  full found-list.

    - `[ ]` **7.4.a Sweep companion-type refs across live shipped content** (both copies)
        - Named anchors: `DEV-RULES.ARC.md` § Leave it cleaner; `strategy-task-list-formatting.md` § Atomic
          Companion File; `commit-footer` method; `template-tasks.md`; plus the full found-list. Acceptance:
          zero `atomic-{name}` / `atomic-*` / "atomic companion file" companion-type refs remain in live
          shipped content (reword dangling §-links rather than deleting the surfaces they point at).
        - _Scope:_ live shipped ARC content (rules / strategies / methods / templates / workflows / briefs).
          **Out:** docs-site (`docs/` — dedicated docs WU), historical ADRs (e.g. `adr-008`, immutable record),
          internal analysis / supplemental docs, and this WU's own `spec-*` (self-referential — it describes
          the retirement). **Preserve:** the `ATOMIC-INBOX` / `USER-INBOX § Atomic` surfaces and the atomic
          _character_.
    - `[ ]` **7.4.b Sweep workflow mentions** (both copies)
        - `2_generate-tasks.md` (companion creation at Pass 1 + Step 4 checklist), `activate` / `verify` /
          `deactivate` / `archive` work-unit workflows. _Note:_ `integrate-work-unit.md` carries only the
          protected `§ Atomic → ATOMIC-INBOX` surface — verify-only, nothing to sweep.
    - `[ ]` **7.4.c Document the rerouted capture** (AGENT-BRIEF in scope; docs-site out)
        - `AGENT-BRIEF.{ARC,CONTRIBUTOR}.md` are in-scope shipped briefs — sweep their companion-type refs. The
          docs site (`docs/**`) is out of scope WU-wide (dedicated docs WU). Document the rerouted capture (fold
          into commit / add a task / spin an Errand / `USER-INBOX § Atomic`) in the swept ARC docs.

### `[ ]` **7.5 Shipped-doc drift-fix**

- _Goal:_ the cut shift-state-machine rows (`Paused` / `Waiting-For`, "future arc-shift") are removed from
  `strategy-work-organization.md` and its state table reconciled with `template-meta.md`'s 4-state machine; the
  `deactivate-work-unit.md` "arc-shift (future)" reference is reconciled to the surviving `arc-shift`; and
  § ROADMAP redefines In Flight as location-based (`active/**` is in flight; Ready/Blocked scope to
  `backlog/planned/**`), corrects the activation framing to `active/ ⟹ in flight`, and shifts the regen
  fire-point earlier (a WU enters In Flight on landing in `active/**`).
- **Strategies:** `strategy-work-organization.md`

    - `[ ]` **7.5.a Rewrite the State Enum table to the 4-state machine** (`strategy-work-organization.md`,
      both copies)
        - _Note:_ the current table (`In Progress` / `Paused` / `Waiting-For` / `Complete` / `Superseded`)
          contradicts `template-meta`'s `Planning | Active | Integrating | Shipped` on every row; rewrite the
          whole enum table + the Optional Pointer Fields sub-table. _Notes:_ See
          `notes-worktree-foundation.md` § Phase 7.
    - `[ ]` **7.5.b `deactivate-work-unit` arc-shift reference** (both copies)
    - `[ ]` **7.5.c § ROADMAP location-based In-Flight redefinition + regen fire-point shift**
        - _Note:_ edit the literal § ROADMAP text (the step-4 In-Flight definition `**In Flight** — State:
          Active | Integrating`; the Regeneration "Activation" bullet). ROADMAP regen is doc-only
          (hand-maintained, no render code) — no tests.

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
