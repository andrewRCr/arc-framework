# PRD: User Sync UX Polish

**Purpose:** Polish the user-notes sync surface — collapse dual state machines, align config and
command vocabulary, and pin coherence guarantees that prevent cross-machine resume bugs and
partial-push hazards.

---

## Introduction

ARC's user-notes sync surface (`arc user save / load / push / pull / fetch`, the porcelain
`arc sync`, and `arc status` reporting) carries cross-cutting UX problems that surfaced during real
cross-machine resume usage:

- **2026-04-24 (cross-machine resume).** Full-mode `arc status` reported "git note out of date /
  latest local git note is not current with the working files / remote notes in sync / next step:
  run `arc user save`" when the user actually needed `arc user pull`. The action hint pointed in
  the opposite direction from the correct recovery.
- **2026-05-01 (unpushed-HEAD bug).** With the worktree branch ahead of origin, `arc user save`
  reported success and `arc user push` reported success while no note actually existed at the
  remote. Recovery required pushing the worktree branch first, then re-running save+push. The CLI
  claimed remote sync success against an unpushed commit.

Underlying causes:

- **Dual state machines.** Full-mode (`inspectUserSyncRefsDetailed`) and session-init
  (`runUserSessionInitStatus`) compute sync state through separate code paths that can disagree
  about the same underlying git state, with full-mode's action-hint logic able to route to the
  opposite-direction recommendation.
- **Ambiguous directional copy.** Strings omit the object of comparison ("git note out of date",
  "Remote notes: in sync") in surfaces that mix with directional lines elsewhere in the same module.
- **Coherence gaps in handoff-interior pushes.** `user.sync_push: always` running alongside
  `session.push_interlock: manual` (or against an unpushed HEAD generally) publishes notes that
  reference unknown commits. Interlock Foundation's push-ordering invariant guarantees worktree
  before notes when both fire at handoff, but doesn't cover the mixed-config or unpushed-HEAD
  cases.
- **No orchestrator for the paired-push surface.** The handoff workflow today coordinates worktree
  push and notes push in markdown — two CLI invocations (`git push` and `arc sync`) with
  workflow-prose gating. Cross-cutting coherence rules (R3 partial-push, R4 unpushed-HEAD, R14
  notes-vs-worktree blocking) are scattered across single-leg commands and workflow narrative.
  No single CLI surface owns "do the right combination of pushes per my config."
- **Three competing config-shape standards.** `user.sync_push: always | prompt | manual` predates
  Interlock Foundation; IF shipped `session.{commit,push}_interlock: manual | on-X`; the
  session-operations strategy doc documents an unused third "canonical" shape (`auto / prompt /
  manual`).
- **Vocabulary asymmetry on the user-notes verb family.** `arc sync` is the lone non-namespaced
  verb in the `arc user *` family, reading broader than its scope and absent from
  `arc user --help`'s discovery surface.
- **Missing per-developer overrides on the IF interlocks.** `user.sync_push` has `arc.syncPush` as
  a per-dev override; `session.commit_interlock` and `session.push_interlock` shipped without
  equivalents.

**Why now:** Cross-machine resume is a primary use case for user notes, and the flow is broken at
the first surface users touch after pulling. The pre-1.0 polish window means these surfaces
shouldn't reach public release as-is, and dogfooding (upcoming in the release path) will compound
user confusion if the state-machine and copy issues persist. Notes-vs-commits push coherence only
surfaces across machines and would dominate dogfooding time.

## Goals

- Eliminate cross-machine resume confusion: action hints always point in the correct direction;
  full-mode and session-init agree about the same underlying git state.
- Pin coherence guarantees for handoff-interior pushes: notes never reference unpushed commits;
  partial-push failures surface clearly with idempotent recovery.
- Collapse the three config-shape standards into the IF interlock vocabulary; align the
  user-notes command family under one namespace.
- Add per-developer overrides for the IF interlocks so the override surface is symmetric across
  all three handoff-interior toggles.
- Establish a layered vocabulary rule and a first-use framing surface for the user-notes feature
  so developers can reason about `arc user *` commands without prior context.

## System Scenarios

- **Cross-machine resume (the 2026-04-24 case).** Developer commits and pushes from machine A,
  then on machine B runs `git pull` followed by `arc status` (full mode). The action hint reads
  "Remote notes ahead of local — run `arc user pull`" — directionally correct, with the
  comparison's reference side named in every headline and detail line.
- **Unpushed-HEAD save+push (the 2026-05-01 case).** Developer runs `arc user save` on a worktree
  branch ahead of origin. `save` succeeds (preserves local working state). `arc user push` (or
  `user.notes_push: on-sync` firing through `arc sync` at handoff) blocks the notes-push leg with
  guidance to push the worktree branch first. The CLI never claims remote sync success against an
  unpushed commit.
- **Partial-push failure recovery.** Worktree push succeeds at handoff but notes push fails
  (network blip, server policy). Output itemizes both legs; exit code reflects the worst outcome.
  `arc user push` invoked manually checks remote ref state via `git ls-remote`; if remote already
  matches local, the command no-ops; otherwise it re-attempts the notes push. Re-runnable safely.
- **Cross-version config migration.** Adopter on `user.sync_push: always` runs `arc update`. The
  migration rewrites the key+value to `user.notes_push: on-handoff`. Old key removed; no dual-key
  window.
- **Vocabulary first-use.** Developer freshly joined via `arc join` sees a brief paragraph
  orienting them to user-notes (where the gitignored personal context lives, that it travels via
  push/pull as a git notes ref). On their first `arc status` invocation before they've created any
  notes, a single-line hint points at `arc user --help`. Once their first handoff completes (notes
  ref exists), the status hint stops firing.
- **Handoff sync opt-out (same-machine continuation).** Developer planning to start the next
  session immediately on the same machine configures `session.sync_interlock: manual`. The handoff
  workflow surfaces unpushed state in the summary but does not auto-invoke `arc sync` — pushes
  fire only when the developer explicitly runs `arc sync` (or single-leg commands). The contract:
  the configured trigger (`on-handoff` vs. `manual`) names when the workflow fires sync; the
  sync command itself is unchanged when invoked manually.

## Requirements

### P0 — State-machine integrity and concrete bugs

**R1. Single state computation feeds both modes.** Full-mode (`inspectUserSyncRefsDetailed`) and
session-init (`runUserSessionInitStatus`) share one state-machine spine. The session-init 5-state
surface (`clean | remote-ahead | conflict | disabled | remote-unavailable`) is the spine for both;
full-mode adds disk-status, saved-when, and ref-distance as secondary detail axes that never
disagree with the spine. Action hints derive deterministically from the spine — no path where the
hint points opposite to the correct recovery direction.

**R2. Notes-discovery walks the notes ref's own history.** `arc user load` and `arc user pull`
find the most recent attachment by walking `git log refs/notes/arc/user/{identity}` rather than
HEAD ancestry, succeeding when notes are attached to commits outside the current HEAD's ancestry
(stale local branches, branch-gone scenarios). The HEAD-independent walk is the new default; the
existing `--max-walk <n>` flag continues to bound depth.

**R3. Partial-push state is a recognized condition on the spine.** The state machine distinguishes
"worktree pushed, notes ref lagging" from generic `local-ahead`. After a partial-push failure
(handoff or manual), subsequent `arc status` invocations report the partial state with recovery
guidance — never report clean.

**R4. Unpushed-HEAD save/push behavior.** `arc user save` saves the local note regardless of HEAD
push state (preserves working state). `arc user push` checks the annotated commits' push status
before pushing the notes ref; blocks with clear guidance when the worktree branch is ahead of
origin. The same coherence rule generalizes to all push triggers (handoff, manual, future modes).

**R5. Paired-push failure semantics.** When worktree and notes pushes fire together via
`arc sync` (typically invoked by the handoff workflow):

- Exit code reflects the worst outcome across the paired operation. Never exit 0 on partial
  publish.
- Output itemizes both legs, marking each succeeded/failed, with the underlying error line for
  failures and a recovery command for the failed leg.
- No automatic retry. User invokes recovery via `arc user push`.
- Recovery is idempotent — `arc user push` checks remote ref state via
  `git ls-remote refs/notes/arc/user/{identity}`; no-ops with confirmation when remote already
  matches local.
- Coherence rules layer cleanly. Primitives enforce shape (no force-flag, WU resolved, ref
  valid). The pushability matrix encodes shape-detectable coherence — including R4
  unpushed-HEAD alignment via the notes-target check — so single-leg push entry points
  (`arc user push`, `arc release push`, orchestrator-routed legs) get uniform enforcement by
  consulting the matrix. The `arc sync` orchestrator owns *routing*: R3 partial-push marker
  management across paired flows, R15 notes-vs-worktree blocking under mixed config,
  force-push refusal at handoff, and the Reconcile-required surface on a diverged worktree.

**R6. Directional copy audit.** Every headline and detail line in `sync-status.ts` names both
sides of the comparison it makes. No line allows the user to wonder "newer than what" or "synced
with what."

**R7. Worktree qualifier surfaces `failureReason`.** When `worktree.state === "remote-unavailable"`,
the rendered line distinguishes timeout (transient — suggest retry or `--offline`) from error
(suggest investigating auth/network). The `failureReason: "timeout" | "error"` field captured by
`runWorktreeSyncStatus` reaches the rendered surface.

### P1 — Vocabulary, config, and command-shape alignment

**R8. Layered vocabulary rule.** "User notes" is the workhorse noun in headlines, action hints,
and status summaries. "Git notes ref" or "git notes" surfaces only when storage mechanism is
relevant (debugging, ref state, error messages mentioning `refs/notes/...`). The rule is
documented and applied across `sync-status.ts` rendering and adjacent help text.

**R9. Config-shape alignment.** Rename and align the legacy notes-push key with IF's interlock
vocabulary, using event-naming consistency: each interlock value names *its own* trigger event
(not an upstream occasion):

- Yaml key: `user.sync_push` → `user.notes_push`.
- Value enum: `always | prompt | manual` → `manual | prompt | on-sync` (semantic identity:
  `always` ⇄ `on-sync`). The trigger is the `arc sync` event; the typical *occasion* is the
  handoff workflow, but mid-session `arc sync` invocations are also sync events.
- `session.push_interlock` value rename: `manual | on-handoff` → `manual | on-sync`. Same
  reasoning — push-leg's trigger event is sync, not handoff.
- Git-config override: `arc.syncPush` → `arc.notesPush`. `arc.pushInterlock` value rename
  parallels the yaml.
- Strategy doc § Standard value enum (session-operations § Handoff-Interior Toggle Pattern):
  retire the documented-but-unused `auto / prompt / manual` standard. Canonical shape becomes
  `manual | on-X` where `X` names the actual triggering event for that operation; `prompt` stays
  available as opt-in for review-before-fire toggles (notes; future similar cases). Document the
  three-layer cascade (handoff event → sync; sync event → push & notes-push) explicitly.
- Migration: hard rename in `arc update` rewrites key+values. Old key removed; no dual-key window.
  Pre-1.0 break is acceptable.

**R10. Command-shape alignment + orchestrator surface.** Two changes, one coherent move:

- **Notes-only rename.** Today's `arc sync` (notes-only direction-aware porcelain) becomes
  `arc user sync`. The user-notes family shares the namespace with `save / load / push / pull /
  fetch`. Hard rename, pre-1.0 — no transitional alias. Existing direction-aware semantic
  preserved; only the invocation path moves.
- **New top-level `arc sync` (orchestrator).** Becomes the all-in-one sync command: probes
  worktree state, notes state, and config (`push_interlock`, `notes_push`); dispatches over the
  6-cell matrix (paired push, worktree-only, notes-only, R15 blocking, save-only, prompt cells);
  surfaces worst-outcome exit code + itemized output. Calls `runPairedPush` for the paired cell,
  single-leg primitives for others. Owns the cross-cutting coherence rules per R5.
- **Authorize-by-invocation.** `arc sync` honors config as-is whether invoked by the workflow at
  handoff or by the user mid-session. The user typing `arc sync` is the sync event; configured
  triggers (`on-sync` interlock values) fire accordingly. The contract is "fire when sync runs,"
  not "fire only at the handoff occasion."
- **`--dry-run`.** Preview-mode flag prints the matrix decision and what would fire without
  invoking either leg. Useful for verifying config under unfamiliar conditions; cheap to add.
- **Discoverability.** `arc --help` lists both `sync` (top-level orchestrator) and
  `user sync` (notes-only). Each command's `--help` cross-references the other.

**R11. Sync-interlock config option.** New `session.sync_interlock: manual | on-handoff` (default
`on-handoff`) gates whether the handoff workflow auto-invokes `arc sync`:

- `on-handoff` (default): handoff workflow runs `arc sync` automatically. Matches today's
  implicit behavior — backwards-compat for existing adopters.
- `manual`: handoff workflow does not auto-invoke sync. Surfaces unpushed state in the handoff
  summary (`Worktree: N unpushed commit(s)`, `Notes: local changes unpushed`, etc.) but takes no
  action. User runs `arc sync` (or single-leg commands) when ready.
- Use case: same-machine continuation — developer planning to start the next session
  immediately doesn't want auto-pushes at handoff; the handoff is just state preservation.
- Per-developer override `arc.syncInterlock` follows the 3-tier pattern (R12).
- Three-layer cascade made explicit:

    ```text
    commit_interlock: on-task-approval  (event: task approval → operation: commit)
    sync_interlock:   on-handoff        (event: handoff       → operation: sync)
    push_interlock:   on-sync           (event: sync          → operation: push)
    notes_push:       on-sync           (event: sync          → operation: notes push)
    ```

  Each interlock's `on-X` names *its own* trigger; cascade reads cleanly downward. `arc sync`
  with `sync_interlock: manual` is the user opting out of the handoff→sync edge while keeping
  sync→push edges intact.

**R12. Per-developer overrides for interlock keys.** Add `git config arc.commitInterlock`,
`arc.pushInterlock`, and `arc.syncInterlock` as per-dev overrides. All three move to **3-tier
resolution** (git config → yaml → default), matching `user.notes_push` and the broader
handoff-interior toggle shape.

**R13. Resolver consolidation.** With all four release-mode keys (`session.commit_interlock`,
`session.push_interlock`, `session.sync_interlock`, `user.notes_push`) sharing the 3-tier
resolution shape, extract the precedence logic into a generic helper (e.g.,
`resolveGitConfigOverride<T>`) and migrate `lib/sync-policy.ts` plus the new interlock
resolutions onto it. Validation in `lib/config/status-reader.ts` extends to read the git-config
override before falling through to yaml + default.

**R14. Pushability pre-checks for handoff-interior pushes.** Detect what's detectable client-side;
surface the condition; never silently skip. The PRD pins behavior per condition; concrete copy
strings finalize at implementation time:

- **Rebase in progress** — block both refs; guide ("Complete or abort rebase first").
- **Detached HEAD** — block both refs; guide ("Push requires a branch").
- **No upstream tracking — worktree branch** — block; guide ("Set upstream first:
  `git push -u origin <branch>`").
- **No upstream tracking — notes ref** — auto-configure (internal ref; no user-visible config
  implication).
- **Protected branch (server policy)** — bubble server error verbatim. Cannot detect client-side
  without API access.
- **Pre-receive hook failure** — bubble server output verbatim.
- **Permission denied (auth/authz)** — bubble error; suggest token/credentials refresh.
- **Force-push required** — error. Never force-push from handoff or `arc user push`. User invokes
  raw git if rewriting history is intended.

**R15. `user.notes_push: on-sync` under `session.push_interlock: manual`.** When notes
auto-push but worktree is manual, the orchestrator (`arc sync`) gates notes push on worktree
state:

- Worktree has no unpushed commits → save and push notes.
- Worktree is local-ahead → save notes locally; **block** notes push with guidance ("push the
  worktree first, then `arc user push`").
- Worktree is diverged / remote-ahead → block notes push; surface reconciliation guidance.

### P2 — DX polish

**R16. First-use framing surface.** Two complementary surfaces:

- `arc join` post-init paragraph: introduces the user-notes feature once at install time —
  briefly explains where the gitignored personal context lives and that it travels via push/pull
  as a git notes ref attached to commits.
- `arc status` single-line hint pointing at `arc user --help`, conditional on the local notes ref
  not yet existing. Naturally bounded — fires until the first handoff (or manual `arc user save`)
  creates the local ref, then stops. No suppression flag.

PRD pins behavior, surface placement, and trigger condition; concrete copy strings finalize at
implementation time.

**R17. Shared-ref sync-state inference for sibling sessions.** Each session computes sync state
from its worktree's HEAD; the notes ref is shared across the identity. Sync-state inference
distinguishes:

- "your local is behind because you haven't fetched" — local hasn't pulled yet.
- "your local is behind because work happened on another machine" — different machine pushed.
- "your local is behind because a sibling session on this machine pushed" — same machine,
  different worktree/session.

Mechanism: extend the existing bounded-fetch pattern (already in place for the worktree-sync probe)
to the notes ref on full-mode `arc status` invocation. Session-init probe stays remote-aware via
the existing pull mechanism. The `--offline` flag suppresses both fetches.

## Non-Goals

- Reimplementation of the notes storage model (e.g., moving off git notes).
- Docs-site deep dive on git notes concepts — `plan-docs-content-sweep.md` territory.
- Changes to the per-identity notes ref path or namespace.
- Changes to the session-init probe's 5-state enum (the target of unification, not a new state).
- Adding `prompt` mode to `session.commit_interlock` / `session.push_interlock`. Worktree pushes
  go through reviewed commits and commit work is reviewed at the task-interlock; mid-session
  prompts add friction without team-scenario justification. The notes-prompt rationale is unique
  to notes (review-before-share for shared remotes).
- Reserving `arc sync` for cross-domain porcelain beyond worktree+notes (e.g., framework files,
  external services). The post-rename `arc sync` orchestrator's scope is bounded to the same
  surface today's handoff push step covers — worktree branch + user-notes ref. Future expansion
  revisited only if outside-repo / non-git sync enters scope.
- Suppression flag for the first-use `arc status` hint. Trigger-bounded by local notes ref
  existence; revisit only on real signal that the unsuppressable form is friction.

## Technical Considerations

### Architectural touch points

- `packages/arc-framework/src/commands/user/sync-status.ts` — primary state-machine and rendering
  surface. State-machine unification refactors `inspectUserSyncRefsDetailed`.
- `packages/arc-framework/src/commands/user/save-load.ts` — notes-discovery walk; switches from
  HEAD ancestry to notes-ref history.
- `packages/arc-framework/src/lib/sync-policy.ts` — 3-tier resolution for `user.notes_push`.
  Migrates onto the generic resolver helper.
- `packages/arc-framework/src/lib/config/status-reader.ts` — extend validation to read git-config
  overrides for `arc.commitInterlock`, `arc.pushInterlock`, and `arc.syncInterlock` before
  yaml + default. Also adds `session.sync_interlock` schema entry.
- `packages/arc-framework/src/cli.ts` + new orchestrator handler — top-level `arc sync` registers
  as the orchestrator; existing `handleSync` migrates under `arc user sync`.
- `packages/arc-framework/src/handlers/sync.ts` — orchestrator dispatch over the 6-cell matrix;
  consumes `runPairedPush` for the paired cell, single-leg primitives for others.
- `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` — Push Sequence section
  collapses to "Run `arc sync` (gated by `sync_interlock`); interpret structured output."
- `arc update` migration path — applies the `user.sync_push` → `user.notes_push` rewrite plus
  `session.push_interlock: on-handoff` → `on-sync` value migration.

### Cross-cutting design constraints

External research on mature VCS-tooling conventions surfaced concrete failure modes the
implementation must avoid:

- **Silent skip on missing auth or scope** (`semantic-release`, `lerna publish`) — credentials
  lacking push permission must fail loudly with the server message; never skip silently and exit
  0.
- **Exit 0 on partial publish** (`lerna publish`, `npm publish` in workspaces) — exit code must
  reflect the worst outcome across paired operations. Partial success is failure.
- **Create-then-fail-mid-asset that can't be re-run** (`gh release create` historical behavior) —
  composite operations must support idempotent re-invocation. Recovery commands detect
  already-succeeded work and skip it cleanly.
- **Single-line error buried in success output** — failure is visually distinct from progress
  text. Itemized two-line summaries make state scannable.

These constraints inform R5 (paired-push failure), R14 (pushability pre-checks), R1
(state-machine), and the rendering surfaces touched by R6 (directional copy).

### Dependencies

All upstream prerequisites have landed (archived under
`reference/archive/2026-q2/technical/`):

- **Session-Init Optimization** (04) — `arc user fetch` atomic fix, neighboring context refactor.
- **Interlock Foundation** (05) — handoff-interior toggle pattern, push-ordering invariant,
  configuration surface.
- **Session-Operational-Flow** (06) — `session.push_interlock: on-handoff` (worktree push at
  handoff), structured task-completion prompt, parallel-session concurrency model framing.

### Sibling and downstream work

- **Sibling plans (parallelizable):** `plan-worktree-foundation.md` (worktree-aware sync
  semantics — either order works); `plan-coord-probe.md` (consumes the notes-discovery
  fix as a branch-gone signal source).
- **Downstream (benefit from this WU's exits):** `plan-agile-wu-lifecycle.md` and
  `plan-concurrent-work-conventions.md` benefit from a clean sync state machine and
  aligned config vocabulary before adding their own axes.

### Scheduling

Pre-1.0 polish window. Lands before ARCd Rebrand so the rebrand's rename pass picks up
consolidated state machine + aligned config in one pass rather than re-touching strings churned
during this work.

### WU split

Default: unified. Internal coupling between state-machine unification, directional copy audit,
and config/command-shape alignment (all touch `sync-status.ts` adjacent surfaces or its
rendering layer) makes a split awkward. Split-trigger is task-generation scope blowout; if
invoked, the natural axis is **diagnostic vs. behavior**:

- Diagnostic: R1, R2, R3, R6, R7, R17.
- Behavior: R4, R5, R9, R10, R11, R12, R13, R14, R15, R16.

Each track is independently shippable and either order works. Decision deferred to task
generation review.

### Validated assumptions

The following plan-stage assumptions were committed at PRD time; revisit only on counter-evidence
during implementation:

- Session-init probe remains the canonical remote-state surface; full-mode consumes it
  (R1 direction).
- Users reading `arc status` are devs familiar with git notes *concept* — vocabulary
  supplementation, not abstraction (R8 posture).
- `user.notes_push: prompt` rationale (review-before-share for team mode) is the only
  non-`manual|on-X` mode worth keeping (R9 canonical shape).
- The IF push-ordering invariant holds for all paired-push scenarios introduced here — no new
  orderings needed (R5).
- `arc sync` framing as authorize-by-invocation under the `on-sync` cascade. Manual mid-session
  `arc sync` is an explicit sync event; configured `on-sync` interlocks fire accordingly. The
  contract names triggers (events), not occasions (handoff vs. mid-session). Confirmed during
  design discussion 2026-05-04; the alternative (require `--handoff` flag) was rejected as
  adding ceremony without coverage benefit.
- The orchestrator (`arc sync`) owns cross-cutting coherence rules (R5 partial-push, R4
  unpushed-HEAD, R15 notes-vs-worktree blocking, force-push refusal at handoff). Single-leg
  primitives and the pushability matrix stay scope-narrow — shape enforcement only.
- `lib/autonomy-policy.ts` deletion during SOF Task 2.1 was clean — verified at PRD drafting:
  no orphan references in workflows, strategies, or active code.

## Success Criteria

- Cross-machine resume (machine A push → machine B `git pull` + `arc status`) reports the correct
  recovery direction. The action hint matches the user's actual next step.
- A worktree branch ahead of origin never produces a notes-push success against an unpushed
  commit. `arc user save` and `arc user push` either succeed coherently or block with actionable
  guidance.
- Full-mode and session-init `arc status` agree about underlying git state across all 5 spine
  states + the partial-push condition (verified via paired-call test fixtures).
- One config-key vocabulary across all four release-mode keys (`session.commit_interlock`,
  `session.push_interlock`, `session.sync_interlock`, `user.notes_push`); each supports per-dev
  override; old `user.sync_push` rewritten cleanly by `arc update` migration.
- User-notes command family reachable under one namespace: `arc user --help` lists `save / load /
  push / pull / fetch / sync`. Top-level `arc sync` becomes the orchestrator over worktree+notes
  per `sync_interlock`; legacy notes-only `arc sync` removed (replaced by `arc user sync`).
- `session.sync_interlock: manual` opts out of automatic handoff-time sync; handoff summary
  surfaces unpushed state without firing pushes.
- Three-layer cascade documented in strategy doc: each interlock's `on-X` value names its own
  trigger event; cascade reads handoff → sync → push & notes-push.
- Quality gates pass: markdown lint (zero violations), TypeScript type check, full Vitest suite,
  build verification.

## Open Questions

**Resolve during implementation (not blocking task generation):**

- Concrete copy strings for the pushability pre-check matrix (R14), the paired-push failure
  itemized output (R5), the orchestrator's matrix-cell surfaces (R10/R15), the first-use
  framing paragraph and `arc status` hint (R16), and the worktree-qualifier `failureReason`
  lines (R7). Strings live with the code that emits them; the PRD pins behavior shape per
  condition.
- Whether the `prompt` mode for `user.notes_push` should remain an opt-in convention or surface
  more prominently for team-mode adopters. Beta feedback may suggest adjustments; default
  position is opt-in / discover-via-config.

**Resolve at task generation:**

- WU split decision (unified vs. diagnostic/behavior axis split). Default unified; flip if the
  scope estimate at task-generation review crosses the split-trigger threshold.

---
