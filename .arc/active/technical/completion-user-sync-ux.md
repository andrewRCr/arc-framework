# Completion: User Sync UX Polish

- **Started**: 2026-05-01
- **Completed**: 2026-05-07
- **Branch**: technical/user-sync-ux
- **Pull Request**: {pending until archival}

- **Context**: Roadmap-queued sync-surface polish — scoped after live cross-machine use surfaced resume
  defects (notes-ref topology vs. disk staleness divergence) and dual-state-machine drift between full-mode
  status and session-init.

## Summary

Collapsed `arc status` and `arc sync` onto a single five-state spine, hardened the paired-push contract
against cross-machine resume bugs and partial-publish hazards, aligned the user-notes vocabulary across
config keys and command surfaces, and pushed judgment-heavy workflow decisions into pre-composed envelope
strings so prose renders rather than decides.

## Key Deliverables

- _State-machine spine_ — Shared `UserSyncSpine` (`clean | remote-ahead | conflict | disabled |
  remote-unavailable`) computed once and consumed by full status, session-init, and `inspectUserSyncState`.
  Disk staleness, saved age, note-history distance, and partial-push recovery layer as detail axes without
  expanding the state set.

- _Notes-ref-history walk_ — `arc user load` / `arc user pull` discover the newest readable note by walking
  `refs/notes/arc/user/{identity}` history instead of HEAD ancestry, preserving notes attached to commits no
  longer reachable from HEAD's first-parent walk. `--max-walk N` bounds the walk.

- _Verified-save postcondition_ — `runUserSave` reads back the just-written note and hash-compares against
  the just-serialized manifest before `.sync-state.json` advances. Save success cannot lie about
  `HEAD`-attached notes existence; verification failure leaves the note in place for the next save to replace.

- _`arc sync` orchestrator + paired-push contract_ — Top-level `arc sync` dispatches the 6-cell matrix
  (worktree × notes); `arc user sync` keeps the notes-only direction-aware command. Paired-push saves
  inside `runPairedPush` before either leg, refuses on `force-push-required` advisory, runs the worktree
  leg through the shared pushability gate, and surfaces partial-push failures with itemized output and
  idempotent recovery via `arc user push`.

- _Pushability pre-check matrix_ — `lib/git/pushability.ts` exports `runPushabilityStatus` over
  `target: "worktree" | "notes" | "both"` covering rebase-in-progress, detached HEAD, no-upstream,
  notes-refspec missing (auto-fixed), force-push-required (advisory), and worktree-not-aligned-with-origin.
  Server-side classes (protected branch, pre-receive, auth) preserve the verbatim push-time error.

- _`arc sync --json` envelope contract_ — Single JSON object on stdout across all return paths (runtime,
  dry-run, and both error paths). `interlockState` carries resolved policy with nested provenance;
  `mode: "dry-run"` distinguishes previews; `cell: "none"` plus `reason` discriminator on
  `identity-absent` / `no-arc-project`. Stdout purity guarded by the `SyncOutput` boundary wrapper.

- _Config-key vocabulary alignment_ — `user.sync_push` → `user.notes_push`; `push_interlock: on-handoff`
  → `on-sync`; `session.sync_interlock` added with `manual | on-handoff`. Three-layer cascade
  (handoff → sync → push & notes-push) documented in `strategy-session-operations`. `arc update`
  migrates legacy values in place; ADRs 012 / 016 took Tier 2 amendment trailers.

- _Per-developer interlock overrides_ — `arc.commitInterlock`, `arc.pushInterlock`, `arc.syncInterlock`,
  `arc.notesPush` plumb through `lib/config/resolved-settings.ts` (per-key helpers + composite wrapper)
  with `{value, source}` provenance. `status-reader.ts` drops the four release-mode keys from
  `ENUM_VALIDATORS`; the wrapper owns operational validation.

- _Action-oriented `arc user status`_ — Default output is one-line headline + one-line context +
  `Next step:`. `--verbose` retains the three-tier detail and pre-load backup enumeration; `--json`
  envelope shape unchanged. `inferUserSyncCause` distinguishes `unfetched-local`,
  `concurrent-local-writer`, `cross-machine`, and `offline` causes; `--offline` short-circuits to
  `offline` cause without speculation.

- _First-use framing_ — `arc join` post-init paragraph orients new developers to user-notes location
  and travel mechanism. `arc status` prepends a one-line hint when the notes ref doesn't exist locally;
  no flag, env-var, or stored suppression — the probe boolean drives presence.

- _Session-init notes-load cascade_ — `session.init_load.notes` (`manual | prompt | always`) closes the
  cross-machine resume gap where a worktree pull silently advances the user-notes ref while working
  files stay stale. `loadNeeded` surfaces on the clean arm of the session-init envelope; `always` mode
  refuses on dirty trees and degrades to `prompt`.

- _Pre-composed envelope strings_ — `recommendedAction` (`pull | prompt | surface | skip`) +
  `recommendedPromptText` per pull channel; `recommendedCombinedPrompt` for combined two-pull cases;
  `recommendedSummaryLine` for the Confirm Handoff line; `restateCandidates` for SESSION-NOTES filter
  cross-check (commits + closed task IDs + notes-file changes since last handoff). Workflow prose
  renders verbatim instead of branching.

- _Library seams for `plan-interlock-release-wrappers.md`_ — `lib/git/push-worktree.ts`
  (`pushWorktreeBranch`), `lib/git/pushability.ts`, `commands/user/paired-push.ts`
  (`PairedPushNotesPusher` delegate), `lib/sync-output.ts` (`SyncOutput` boundary), and
  `__tests__/helpers/multi-clone.ts` (cross-clone harness) extracted as reusable APIs so wrappers
  swap the implementation without re-extracting from raw call sites.

## Implementation Highlights

- _Five-state spine, layered detail axes_ — Resisted state-set expansion when partial-push, disk
  staleness, and direction-of-divergence each looked like new states. Each landed as an orthogonal
  detail axis on a stable five-state surface; full-mode and session-init agree on the spine across
  all five states + the partial-push detail.

- _JSON-mode purity at the boundary_ — `SyncOutput` wrapper consumed by every sync-related call site;
  raw `@clack/prompts` imports excised from `handlers/sync.ts`. Under `--json`, intro/outro/spinner
  no-op, `log.warn`/`log.error` route to stderr-only, `confirm` resolves to `false`,
  `isCancel` returns `false`. Defended at three tiers: unit (boundary contract), subprocess e2e
  (5-cell purity matrix), and multi-clone integration (envelope parsed from real stdout).

- _Save-before-push inside `runPairedPush`_ — Single boundary, single owner. The orchestrator does
  not call `runUserSave` separately for the paired cell; the paired helper saves first or returns
  `save-failed` and pushes neither leg. Blocked sync cells follow the same invariant — save fires
  in every blocked cell except rebase-in-progress (where HEAD is mid-step and notes can't follow
  the rewrite).

- _Force-push advisory contract_ — Definition site (`pushability.ts`) declares
  `disposition: "advisory"` so refusal policy lives at the call site. Paired flow refuses
  defense-in-depth (`decideWorktree` already routes diverged worktrees to blocked-worktree
  upstream). `--yes` never auto-selects force; the Clack `select` remains the only entry point
  for that destructive action.

- _Probe-twice handoff for full determinism_ — Surfacing that chore-commit is the common case
  exposed an under-counting bug in the original single-probe Confirm Handoff design — every typical
  handoff under-reported unpushed commits, and the `Commit at Handoff` SESSION-NOTES anchor wrote a
  pre-step-3 hash that tripped session-init freshness on every fresh resume. Restructured the
  handoff workflow with a second probe after the status-file commit; the unpushed-count formula
  and ad-hoc `git rev-parse` in workflow prose deleted entirely.

- _Forward-compat seams over premature abstraction_ — `pushWorktreeBranch` kept at internal scope
  (not re-exported from `lib/git/index.ts`) until the wrapper WU consumes it. `PairedPushNotesPusher`
  injected as a delegate so `commands/user/` stays Clack-free while the paired flow inherits
  conflict recovery from the user-mode helper. `boundedNotesRefFetch` inlined locally rather than
  reshaping `worktree-sync.ts`'s `boundedFetch` for one new caller.

- _CLI computes, workflow renders_ — Pre-composed `recommendedAction`, `recommendedPromptText`,
  `recommendedSummaryLine`, `recommendedCombinedPrompt`, and `restateCandidates` shifted strings
  owned by code out of workflow prose. Reduces session-init token cost, eliminates the
  state×config conditional matrix in workflow prose, and collapses the SESSION-NOTES filter's
  most error-prone manual cross-check ("did I just paraphrase a commit subject?") against
  structured envelope data.

- _Sync invariants audited end-to-end_ — Phase 2.R audit covered 25 files × 7 invariants
  (verified save, JSON contamination, raw worktree-push bypass, clean-but-stale hidden state,
  misleading no-op copy, blocked-cell save invariant, force-push advisory). 0 active findings;
  two surfaced fixes (`arc user status --json` purity + envelope-on-error;
  `resolveSyncPushPolicy` `output` threading) closed inline. Coverage matrix pins each invariant
  at the appropriate tier with cross-clone paths for the three cross-machine invariants.

## Verification

- _Quality gates:_ All passed at Tier 3 — markdown lint, TypeScript lint, shell lint, typecheck,
  test typecheck, build, and the full Vitest suite (unit + integration + e2e).

- _Success criteria:_ 25 of 25 task-list criteria met against the PRD's 9-criterion checklist —
  no deviations, no supersessions. PRD Open Questions resolved during implementation: concrete
  copy strings live with the code that emits them (pushability matrix, paired-push itemized output,
  orchestrator matrix-cell surfaces, first-use framing, worktree-qualifier failure reasons);
  `user.notes_push: prompt` confirmed opt-in / discover-via-config; WU split decision landed unified
  (no diagnostic/behavior axis split needed).

## Follow-Up Work

- _Cross-machine partial-push invisibility_ — `recordPartialPushMarker` is local-only
  (`.arc/user/{identity}/.internal/.sync-state.json`, gitignored); machine A's partial push leaves
  no signal machine B can read after `git pull`. PRD R3 holds on the originating machine; on a
  sibling clone it currently fails silently. Closing this needs a remote-marker mechanism (sibling
  notes ref or hook contract) — substantial enough to be its own design WU. Captured in
  `backlog/technical/plan-cross-machine-sync-coherence.md`.

- _Status-file markdown-lint timing_ — Workflow-doc stopgap landed inline (project-markdown-lint
  substep on the status-file chore-commit); the structural fix (move the lint to fire before the
  Step-3 commit) is captured in `backlog/technical/plan-quality-gate-hooks.md`.

- _`promptConflictResolution` clack-routing residual_ — `handlers/push-recovery.ts` still uses
  `p.log.warn` + `p.select` directly inside `promptConflictResolution`. Both are gated by
  `isNonInteractiveEnvironment()` which short-circuits before either clack call fires under JSON
  mode, so they're dead-code today. If that gate is ever removed or weakened, route them through
  `output` — the 5-cell purity test won't catch it because no test cell triggers an actual notes
  conflict.

- _`resolveCurrentBranch` standalone helper_ — `arc-framework/src/handlers/sync.ts` retains its
  standalone branch-resolution helper rather than reading branch from `WorktreeSyncStatusResult`.
  Adding `branch` to that shared result is a separate cleanup that ripples through fixtures in
  unrelated test files.

- _Workflow-doc staleness — clean-work-unit Mode 2_ — Step 1's "Add/update `**Completed**:` date
  in both files" guidance is stale relative to the current `template-tasks.md` and
  `strategy-task-list-formatting.md` (no Completed field on the task-list header — dates land in
  this completion doc and git log). Surfaced during this integration prep; capture as an atomic
  workflow-doc edit.
