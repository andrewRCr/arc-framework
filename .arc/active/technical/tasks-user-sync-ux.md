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

### `[ ]` **1.1 Notes-ref-history discovery walk**

- Refactor `arc user load` and `arc user pull` to walk `git log refs/notes/arc/user/{identity}`
  rather than HEAD ancestry.
- Notes-ref-history walk contract:
    - Walk note-ref commits newest to oldest, inspect changed note entries, and return the newest valid ARC
      user manifest.
    - Returned metadata distinguishes the annotated commit from the note-history position and reports whether
      the annotated commit is reachable from current HEAD.
- Affected file: `packages/arc-framework/src/commands/user/save-load.ts`.
- Existing `--max-walk N` flag continues to bound depth; after this change it bounds note-ref history commits,
  not HEAD ancestors.
- Build `test-first` (one behavior at a time):
    - HEAD-ancestry-stale scenario (notes attached to commit not in HEAD's ancestry) → walk via
      notes-ref history succeeds
    - Branch-gone scenario (local branch deleted but notes ref intact) → notes still discoverable
    - Empty notes ref → returns no-notes signal cleanly
    - Deleted or rewritten latest note state falls through to the newest valid manifest or no-notes cleanly
    - `--max-walk N` bounds notes-ref-history walk depth

### `[ ]` **1.2 State-machine spine unification**

- Collapse `inspectUserSyncRefsDetailed` and `runUserSessionInitStatus` onto a single
  state-computation spine.
- Full-mode and session-init render from the shared spine result; neither keeps an independent
  state-to-action switch path.
- Session-init's 5-state surface (`clean | remote-ahead | conflict | disabled |
  remote-unavailable`) is the spine for both modes; full-mode adds `diskStatus`, `savedWhen`,
  `refDistance` as detail axes that never disagree with the spine.
- Action hints derive deterministically from the spine — eliminate the path that recommended
  `arc user save` when `arc user pull` was needed (the 2026-04-24 bug).
- Affected file: `packages/arc-framework/src/commands/user/sync-status.ts`.
- Build `test-first` (one behavior at a time):
    - Same git state → both modes return same spine value (paired-call fixture)
    - Action hint determinism: spine value `remote-ahead` always recommends pull-direction
      recovery, never push-direction
    - Detail axes layered correctly: full-mode includes `savedWhen` / `refDistance` while
      session-init does not, but both agree on spine
    - 5-state spine exhaustiveness: every input combination resolves to exactly one spine state
    - Cross-machine resume scenario (the 2026-04-24 reproduction) produces directionally-correct
      hint

### `[ ]` **1.3 Partial-push state on the spine**

- _Goal:_ Surface "worktree pushed, notes ref lagging" as a validated recovery condition without
  changing the pure notes-ref topology or session-init's 5-state contract.

    - `[ ]` **1.3.a Coherence-condition interface**
        - Model partial-push as a separate coherence/detail axis layered on the spine, not as a new
          `UserSyncRefState` value and not as a sixth `UserSessionInitState`.
        - The notes ref topology remains `local-ahead`; session-init keeps
          `clean | remote-ahead | conflict | disabled | remote-unavailable`.
        - Full-mode status must surface the partial-push condition explicitly and use `arc user push`
          recovery guidance instead of generic `local-ahead` copy.
        - Affected files: `packages/arc-framework/src/commands/user/types.ts`,
          `packages/arc-framework/src/commands/user/sync-status.ts`.
        - Build `test-first` (one behavior at a time):
            - Partial-push condition layers on a `local-ahead` ref topology
            - Session-init state union remains 5-state while preserving the condition detail
            - Action hint surfaces recovery guidance (`arc user push` to retry)

    - `[ ]` **1.3.b Partial-push marker persistence**
        - Persist a recovery marker in the user internal sync state (or equivalent internal notes-sync
          state), including local notes ref hash and annotated/source commit.
        - Validate marker before surfacing: ignore or clear stale markers when local notes no longer match;
          clear when remote already matches local; when remote is unavailable, report that recovery cannot be
          verified rather than reporting clean.
        - Affected file: `packages/arc-framework/src/commands/user/save-load.ts`.
        - Build `test-first` (one behavior at a time):
            - Valid marker + remote mismatch → `arc status` reports partial-push, not clean
            - Stale marker ignored or cleared
            - Remote already matches local → marker clears and spine returns clean
            - Remote unavailable with marker → status reports recovery-verification uncertainty

    - `[ ]` **1.3.c Push-flow marker lifecycle**
        - Record the marker when a notes push fails after the worktree-side publish step has succeeded
          (handoff or manual paired-push path).
        - Clear the marker when `arc user push` succeeds or no-ops because remote already matches local.
        - Affected files: `packages/arc-framework/src/commands/user/push-fetch.ts`,
          `packages/arc-framework/src/handlers/push-recovery.ts`,
          `packages/arc-framework/src/handlers/sync.ts`.
        - Build `test-first` (one behavior at a time):
            - Failed notes-push after successful worktree-side publish records marker
            - Recovery via `arc user push` clears marker
            - Re-running recovery is idempotent when remote already matches local

### `[ ]` **1.4 Rendering surface pass**

- _Goal:_ Pass over `sync-status.ts` rendering so every line names its comparison reference and
  all captured detail reaches the user.

    - `[ ]` **1.4.a Directional copy audit**
        - Every headline and detail line in `sync-status.ts` names both sides of the comparison
          it makes.
        - No line allows the user to wonder "newer than what" or "synced with what."
        - Test-after — output formatting per project testing methodology.
        - Affected file: `packages/arc-framework/src/commands/user/sync-status.ts`.

    - `[ ]` **1.4.b Worktree qualifier `failureReason` surfacing**
        - When `worktree.state === "remote-unavailable"`, the rendered line distinguishes timeout
          (transient — suggest retry or `--offline`) from error (suggest investigating
          auth/network).
        - The `failureReason: "timeout" | "error"` field captured by `runWorktreeSyncStatus`
          reaches the rendered surface.
        - Test-after — rendering, not detection logic (detection already exists).
        - Affected file: `packages/arc-framework/src/commands/user/sync-status.ts` (specifically
          `formatWorktreeQualifierLine`).

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
