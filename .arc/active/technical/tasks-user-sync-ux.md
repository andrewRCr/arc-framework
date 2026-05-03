# Task List: User Sync UX Polish

- **PRD:** `prd-user-sync-ux.md`
- **Branch(es):** `technical/user-sync-ux`
- **Base Branch:** `main`

- **Purpose:** Polish the user-notes sync surface — collapse dual state machines, align config and
  command vocabulary, and pin coherence guarantees that prevent cross-machine resume bugs and
  partial-push hazards.

---

## **Phase 1:** State-machine foundation

_Purpose:_ Unify the diagnostic spine. R1 single state computation, R2 notes-ref-history discovery,
R3 partial-push state, R6 directional copy audit, R7 worktree qualifier `failureReason`. Foundation
that Phase 2's coherence work builds on. PRD-pinned ordering: notes-discovery (1.1) precedes spine
unification (1.2) — unification builds on the new load semantic.

### `[x]` **1.1 Notes-ref-history discovery walk**

- `arc user load` and `arc user pull` now discover the newest readable user-note attachment by walking
  `refs/notes/arc/user/{identity}` history instead of HEAD ancestry.
- `--max-walk N` bounds note-ref history commits. Load/search results carry annotated-commit reachability and
  note-history distance for downstream routing work.
- Status and load summary copy no longer treats notes attached outside current HEAD ancestry as current with HEAD.
- Coverage added for outside-HEAD ancestry, branch-gone local refs, shallow clones, deleted latest note entries,
  empty note refs, and note-ref-history walk caps.

### `[x]` **1.2 State-machine spine unification**

- `sync-status.ts` now computes a shared `UserSyncSpine` from remote-sync enablement and
  notes-ref topology; full status, session-init, and `inspectUserSyncState` consume the same
  spine instead of maintaining separate state/action switch paths.
- Full `UserStatusResult` carries `spineState`, with disk status, saved age, and note-history
  distance layered as detail axes that do not change the underlying five-state spine.
- Unit coverage pins five-state exhaustiveness, paired full/session-init agreement, layered
  detail axes, and pull-directed `remote-ahead` recovery when local disk edits are present.

### `[x]` **1.3 Partial-push state on the spine**

- Partial-push recovery is now a validated coherence axis on the shared spine. Markers persist in
  `.internal/.sync-state.json`, are validated against the current local notes ref hash, clear when stale or
  already recovered, and surface an unverified recovery condition when the remote cannot be checked.
- Sync records the marker when notes push fails after a clean worktree publish state; `arc user push` clears it
  on successful recovery or idempotent already-matching pushes.

    - `[x]` **1.3.a Coherence-condition interface**
        - Added `UserSyncCoherenceState` / `coherenceState` as a detail axis layered on the shared spine.
          `partial-push` survives only with `local-ahead` notes topology, while the session-init spine state
          remains `clean`. Full-mode status now emits explicit partial-push recovery copy and points at
          `arc user push` retry guidance instead of the generic local-ahead hint.

    - `[x]` **1.3.b Partial-push marker persistence**
        - `.sync-state.json` now stores `partialPush.localRefHash` plus `sourceCommit`. Status validates the
          marker against the current local notes ref before surfacing it, clears stale or already-recovered
          markers, and reports `partial-push-unverified` when the marker matches locally but remote comparison
          is unavailable.

    - `[x]` **1.3.c Push-flow marker lifecycle**
        - Sync records a partial-push marker when a notes push fails after the worktree is clean against remote.
          `arc user push` passes repository context through the push-recovery path and clears the marker after a
          successful push, including no-op pushes where the remote already matches local notes.

### `[x]` **1.4 Rendering surface pass**

- Completed the `sync-status.ts` rendering pass so comparison copy names both sides and worktree
  remote-unavailable qualifiers surface timeout vs. auth/network failure detail.

    - `[x]` **1.4.a Directional copy audit**
        - Updated `sync-status.ts` rendering so summaries and detail lines explicitly name local
          notes, remote notes, working files, and origin upstream where comparisons are reported.
          Shared status and sync tests now pin the directional copy.

    - `[x]` **1.4.b Worktree qualifier `failureReason` surfacing**
        - `formatWorktreeQualifierLine` now renders timeout-specific retry/`--offline` copy and
          error-specific auth/network investigation copy for `remote-unavailable` worktree probes.
          Status and sync tests cover the rendered failure-reason surface.

## **Phase 2:** Coherence guarantees

_Purpose:_ Prevent notes-against-unpushed-commits and partial-publish bugs. R4 unpushed-HEAD
save/push, R5 paired-push failure semantics, R13 pushability pre-check matrix, R14 notes-push
under manual worktree-push interlock. Builds on Phase 1's unified spine for partial-push surfacing.

### `[ ]` **2.1 Pushability pre-check matrix**

- Detect what's detectable client-side; surface the condition; never silently skip.
- Per-condition behavior: rebase in progress → block both refs + guide; detached HEAD → block +
  guide; no upstream tracking on worktree branch → block + guide; no upstream tracking on notes
  ref → auto-configure; protected branch / pre-receive hook failure / permission denied → bubble
  server output verbatim; force-push required → error (never force-push from handoff or
  `arc user push`).
- Affected files: `packages/arc-framework/src/commands/user/save-load.ts`, the git-wrapper module
  used for push (`packages/arc-framework/src/lib/git.ts` or equivalent).
- Concrete copy strings finalize at implementation time alongside the emitting code.
- Build `test-first` (one behavior at a time):
    - Rebase-in-progress → both refs blocked; correct guidance returned
    - Detached HEAD → both refs blocked; correct guidance returned
    - Worktree branch with no upstream → blocked; guidance points at
      `git push -u origin <branch>`
    - Notes ref with no upstream → auto-configures via `git push --set-upstream`
    - Server protected-branch error → bubbles verbatim; no client-side mangling
    - Force-push refused → exits error; no automatic retry

### `[ ]` **2.2 Paired-push failure semantics**

- When worktree and notes pushes fire together at handoff: exit code reflects worst outcome
  across paired operation; output itemizes both legs; no automatic retry; recovery via
  `arc user push` is idempotent.
- `arc user push` checks remote ref state via `git ls-remote refs/notes/arc/user/{identity}`;
  no-ops with confirmation when remote already matches local.
- Affected files: `packages/arc-framework/src/commands/user/save-load.ts`, handoff-workflow's
  push-action integration.
- Concrete itemized-output copy strings finalize at implementation time.
- Build `test-first` (one behavior at a time):
    - Both legs succeed → exit 0; both lines marked succeeded
    - Worktree succeeds, notes fails → exit non-zero; itemized output marks each; recovery
      command surfaced
    - `arc user push` invoked when remote already matches local → no-ops with confirmation
      (not error)
    - `arc user push` invoked after transient failure → re-attempts notes push successfully
    - Push-ordering invariant respected: worktree always lands before notes

### `[ ]` **2.3 Unpushed-HEAD save/push behavior**

- `arc user save` saves the local note regardless of HEAD push state (preserves working state).
- `arc user push` checks the annotated commits' push status before pushing the notes ref; blocks
  with clear guidance when worktree branch is ahead of origin.
- Generalizes to all push triggers — handoff, manual, future modes — via the same coherence rule.
- Affected file: `packages/arc-framework/src/commands/user/save-load.ts`.
- Build `test-first` (one behavior at a time):
    - Worktree clean, notes save → succeeds and creates local note
    - Worktree ahead of origin, notes save → succeeds locally (no push attempted)
    - Worktree ahead of origin, notes push → blocks with guidance to push worktree first
    - Worktree pushed, notes push retried → succeeds (recovery path)
    - The 2026-05-01 reproduction (claim of remote sync success against unpushed commit) →
      no longer occurs

### `[ ]` **2.4 Notes-push under manual worktree-push interlock**

- When `user.notes_push: on-handoff` and `session.push_interlock: manual`:
- Worktree has no unpushed commits → save and push notes.
- Worktree is local-ahead → save notes locally; block notes push with guidance ("push the
  worktree first, then `arc user push`").
- Worktree is diverged / remote-ahead → block notes push; surface reconciliation guidance.
- Affected files: handoff-workflow integration;
  `packages/arc-framework/src/commands/user/save-load.ts`.
- Build `test-first` (one behavior at a time):
    - Worktree clean + notes-on-handoff + push-manual → notes save+push fires
    - Worktree local-ahead + notes-on-handoff + push-manual → notes save fires; push blocks with
      guidance
    - Worktree diverged + notes-on-handoff + push-manual → notes push blocks with reconciliation
      guidance
    - Worktree remote-ahead + notes-on-handoff + push-manual → notes push blocks with
      reconciliation guidance

## **Phase 3:** Vocabulary and config alignment

_Purpose:_ Align user-notes vocabulary across config keys, CLI commands, and rendering surfaces.
R12 resolver consolidation, R11 per-dev interlock overrides, R9 config-shape rename +
`arc update` migration, R10 command rename, R8 layered vocabulary rule. Sequencing: resolver first
(R11 needs it), then renames, then vocabulary pass (so the vocabulary pass operates on
final-shape strings).

### `[ ]` **3.1 Resolver consolidation**

- Extract the precedence logic shared by `user.notes_push` (and the new interlock keys in 3.2)
  into a generic helper — e.g., `resolveGitConfigOverride<T>`.
- Migrate `lib/sync-policy.ts` onto it. The helper resolves git-config override → yaml → default
  in 3-tier order.
- Affected files: `packages/arc-framework/src/lib/sync-policy.ts`, new
  `packages/arc-framework/src/lib/config/resolve-override.ts` (or similar).
- Build `test-first` (one behavior at a time):
    - Git-config value present → returns git-config value
    - Git-config absent + yaml present → returns yaml value
    - Both absent → returns default
    - Type validation: invalid value at any tier rejected with appropriate error
    - `sync-policy.ts` migrated → all existing sync-policy tests pass with no behavior change

### `[ ]` **3.2 Per-developer overrides for interlock keys**

- Extend `lib/config/status-reader.ts` validation to read `arc.commitInterlock` and
  `arc.pushInterlock` git-config overrides before falling through to yaml + default.
- Both keys resolve via the helper from 3.1; no shape divergence.
- Affected file: `packages/arc-framework/src/lib/config/status-reader.ts`.
- Build `test-first` (one behavior at a time):
    - `arc.commitInterlock` git-config set → status-reader returns git-config value
    - `arc.pushInterlock` git-config set → status-reader returns git-config value
    - Git-config absent → falls through to yaml; absent yaml → falls through to default
    - Invalid git-config value → rejected with same shape as yaml validation
    - 3-tier resolution applied uniformly across all three release-mode keys

### `[ ]` **3.3 Config-shape alignment**

- _Goal:_ Rename `user.sync_push` → `user.notes_push` end-to-end and migrate adopters in place.

    - `[ ]` **3.3.a Yaml schema and value enum**
        - Rename key in config schema/validation; rename git-config override
          (`arc.syncPush` → `arc.notesPush`).
        - Value enum: `manual | prompt | on-handoff` (semantic identity: `always` ⇄
          `on-handoff`).
        - Affected files: `packages/arc-framework/src/lib/config/status-reader.ts`,
          `packages/arc-framework/src/lib/sync-policy.ts`,
          `packages/arc-framework/arc/system/arc-config.yml` (template default).
        - Build `test-first` (one behavior at a time):
            - Schema validates new key+values; rejects old key
            - `on-handoff` value resolves equivalently to legacy `always`
            - Git-config override reads from `arc.notesPush`

    - `[ ]` **3.3.b `arc update` migration logic**
        - Rewrite legacy `user.sync_push: {value}` → `user.notes_push: {translated}` once.
          Old key removed; no dual-key window.
        - Affected file: `packages/arc-framework/src/commands/update.ts` (or wherever migration
          logic lives).
        - Build `test-first` (one behavior at a time):
            - `always` → `on-handoff` translation
            - `prompt` and `manual` carry forward unchanged
            - Old key absent post-migration
            - Idempotent: re-running migration on already-migrated config is a no-op

    - `[ ]` **3.3.c Strategy and reference doc updates**
        - Retire the documented-but-unused `auto / prompt / manual` standard from
          `strategy-session-operations.md` § Handoff-Interior Toggle Pattern. Canonical shape
          becomes `manual | on-X` with `prompt` opt-in for review-before-fire toggles.
        - Update QUICK-REFERENCE, AGENT-BRIEF.ARC, and any other reference docs that surface the
          old key name.
        - Test-after — documentation only.

### `[ ]` **3.4 Command-shape alignment**

- Rename `arc sync` → `arc user sync` so the user-notes porcelain shares the namespace with the
  rest of the family. Hard rename, pre-1.0 — no transitional alias.
- Existing direction-aware porcelain semantic preserved; only the invocation path moves.
- `arc user --help` output reflects the new placement.
- Affected files: `packages/arc-framework/src/cli.ts`,
  `packages/arc-framework/src/commands/user/index.ts` (or wherever subcommand registration
  lives).
- Test-after — CLI command wiring per project testing methodology.

### `[ ]` **3.5 Layered vocabulary rule application**

- Sweep `sync-status.ts` rendering and adjacent help text so "user notes" is the workhorse noun
  in headlines, action hints, and status summaries.
- "Git notes ref" or "git notes" surfaces only when storage mechanism is relevant (debugging,
  ref state, error messages mentioning `refs/notes/...`).
- Affected files: `packages/arc-framework/src/commands/user/sync-status.ts`, `arc user --help`
  text, error messages in `save-load.ts`.
- Test-after — rendering and string-content audit, not logic change.

## **Phase 4:** DX polish

_Purpose:_ Round out the developer experience. R15 first-use framing surface, R16 shared-ref
sync-state inference. Builds on Phase 1's unified spine for the bounded-fetch extension and on
Phase 3's vocabulary alignment for first-use copy strings.

### `[ ]` **4.1 First-use framing surface**

- _Goal:_ Introduce the user-notes feature and orient new developers without a suppression-flag
  burden.

    - `[ ]` **4.1.a `arc join` post-init paragraph**
        - One-time install paragraph briefly explaining where the gitignored personal context
          lives and that it travels via push/pull as a git notes ref attached to commits.
        - Affected file: `packages/arc-framework/src/commands/join.ts` (or post-init message
          integration).
        - Test-after — output formatting per project testing methodology.
        - Concrete paragraph copy finalizes at implementation time.

    - `[ ]` **4.1.b `arc status` single-line hint**
        - Single-line hint pointing at `arc user --help`, conditional on local notes ref absence
          (no `refs/notes/arc/user/{identity}` present).
        - Naturally bounded — fires until first handoff (or manual `arc user save`) creates the
          local ref, then stops. No suppression flag.
        - Affected file: `packages/arc-framework/src/commands/user/sync-status.ts`.
        - Build `test-first` (one behavior at a time):
            - Local notes ref absent → hint appears in `arc status` output
            - Local notes ref present → hint absent
            - Hint absence is silent (no flag, no flag-checking code path)

### `[ ]` **4.2 Shared-ref sync-state inference**

- Extend the bounded-fetch pattern (already in place for the worktree-sync probe) to the notes
  ref on full-mode `arc status` invocation. Session-init probe stays remote-aware via the
  existing pull mechanism.
- Boundary: this task classifies why the notes-sync state differs; it does not decide which branch
  or work unit the identity should work on. Branch-gone recovery and target selection remain
  Worktree Foundation + Coord Probe scope.
- Downstream signal contract: preserve enough metadata from notes discovery for later routing work
  to consume (annotated commit, note-history distance, current-HEAD reachability, and inferred
  local / sibling-session / cross-machine cause).
- Sync-state inference distinguishes:
    - Local-behind-because-haven't-fetched (single-machine, single-session)
    - Local-behind-because-other-machine (cross-machine work)
    - Local-behind-because-sibling-session (same machine, different worktree/session)
- The `--offline` flag suppresses both fetches.
- Affected file: `packages/arc-framework/src/commands/user/sync-status.ts`.
- Build `test-first` (one behavior at a time):
    - Bounded-fetch on notes ref fires by default in full-mode `arc status`
    - `--offline` suppresses both worktree and notes fetches
    - Sibling-session detection (notes ref distance from local working files vs. saved-when
      timestamp) → state-machine resolves correctly
    - Cross-machine vs. unfetched-local distinction surfaced when remote ref differs

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` Cross-machine resume produces directionally-correct action hint (machine A push →
  machine B `git pull` + `arc status` recommends `arc user pull`)
- `[ ]` `arc user load` and `arc user pull` succeed when notes attach to commits outside HEAD's
  ancestry (notes-ref-history walk is the default)
- `[ ]` Worktree-ahead-of-origin scenarios produce coherent save/push behavior — `arc user save`
  preserves working state; `arc user push` blocks with guidance; never claims notes-push success
  against unpushed commit
- `[ ]` Paired-push partial failures produce non-zero exit, itemized output marking each leg, and
  idempotent recovery via `arc user push`
- `[ ]` Full-mode and session-init `arc status` agree about underlying git state across all 5
  spine states + partial-push condition (verified by paired-call test fixtures)
- `[ ]` Pushability pre-checks block or surface server errors per the documented matrix
  (rebase, detached HEAD, no-upstream, protected branch, hook failure, auth, force-push)
- `[ ]` All three release-mode keys (`session.commit_interlock`, `session.push_interlock`,
  `user.notes_push`) support 3-tier resolution via per-dev `arc.*` overrides
- `[ ]` `arc update` migrates legacy `user.sync_push` config; old key removed; no dual-key
  window; strategy docs reflect canonical shape
- `[ ]` `arc user --help` lists `save / load / push / pull / fetch / sync`; bare `arc sync`
  removed
- `[ ]` First-use framing surfaces operational: `arc join` install paragraph, `arc status` hint
  with notes-ref-existence trigger
- `[ ]` Layered vocabulary rule applied: "user notes" workhorse noun across
  headlines/hints/summaries; "git notes ref" only when storage mechanism is relevant
- `[ ]` All quality gates pass (markdown lint, TypeScript type check, full Vitest suite, build
  verification)
- `[ ]` Ready for integration

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
