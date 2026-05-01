# Plan: User Sync UX Polish

## Problem / Motivation

ARC's user-notes sync commands (`arc user save` / `load` / `push` / `fetch` / `pull`, plus `arc status`
reporting) present related UX problems that surfaced during cross-machine resume on 2026-04-24. After
committing and pushing from machine A (laptop), then running `git fetch` + `git pull` on machine B
(primary) the next morning, `arc status` (full mode) reported:

- "git note out of date"
- "latest local git note is not current with the working files"
- "remote notes in sync"
- "next step: run `arc user save`"

The user actually needed `arc user pull` to bring remote notes down. `arc user save` was the wrong
direction — and `arc user fetch` (tried next) prompted with copy identical to `arc user pull`, approved
the prompt, and left state in an intermediate shape the user could not interpret.

A second handoff bug surfaced 2026-05-01: with the worktree branch ahead of origin, `arc user save`
reported "Saved 2 file(s) to git note on 7190a8f" and `arc user push` reported success while the worktree
branch was still ahead of origin. Direct `git notes show 7190a8f` found no note. Recovery succeeded only
after pushing the worktree branch first, then re-running save+push. The CLI claimed remote sync success
against an unpushed commit.

Root causes across `packages/arc-framework/src/commands/user/sync-status.ts` and related handlers:

1. **Dual state machines.** Full-mode (`inspectUserSyncRefsDetailed`) and session-init
   (`runUserSessionInitStatus`) compute sync state through separate code paths. Full-mode exposes ~20
   headline×diskStatus×remote-state permutations; session-init exposes 5 clean states
   (`clean | remote-ahead | conflict | disabled | remote-unavailable`). The two can disagree about the
   same underlying git state, and full-mode's action-hint logic can route to the opposite-direction
   recommendation when remote state is reported stale or absent.

2. **Ambiguous directional copy.** Strings like "git note out of date" and "Remote notes: in sync"
   omit the object of comparison. Other lines in the same module are directional ("Your local git note
   is newer than remote"). The inconsistency forces users to decode which side is the reference.

3. **`arc user fetch` broke git convention.** `git fetch` is universally read-only and never prompts.
   `arc user fetch` prompted with copy identical to `arc user pull` ("Local notes will be overwritten by
   remote. Continue?"), implying a file overwrite when only the ref is updated. *(Atomic fix shipped in
   the Session-Init Optimization WU's `atomic-session-init-optimization.md`.)*

4. **`user.sync_push` covers notes only — without coherence guarantees in mixed-config cases.** Pushing
   `refs/notes/arc/user/{identity}` without pushing the commits it annotates produces a remote state
   where notes reference unknown commits for fresh clones or sibling machines. Interlock Foundation
   shipped the **push-ordering invariant** (worktree before notes when both fire at handoff) which
   solves the case where both auto-push. But when `user.sync_push: always` runs alongside
   `session.push_interlock: manual` — or against an unpushed HEAD generally — the coherence guarantee
   doesn't hold, and the CLI publishes notes that reference unknown commits.

5. **Three competing config-shape standards.** `user.sync_push: always | prompt | manual` predates
   Interlock Foundation. IF shipped `session.{commit,push}_interlock: manual | on-X`. The
   session-operations strategy doc documents a third "canonical" handoff-interior-toggle shape
   (`auto / prompt / manual`) that nothing actually uses. Three shapes is one too many for a polish
   window.

6. **Per-developer overrides missing on the IF interlocks.** `user.sync_push` has `arc.syncPush` as a
   per-dev override; `session.commit_interlock` and `session.push_interlock` shipped without
   equivalents. This was an oversight during IF — per-dev override is a meaningful primitive (e.g., a
   contributor running `manual` while the project default is `on-task-approval`).

This matters now because:

- Cross-machine resumes are a primary use case for user notes — the flow is broken at the first
  surface users touch after pulling.
- Pre-1.0 polish window — these surfaces shouldn't reach public release as-is.
- Dogfooding (upcoming in the release path) will compound user confusion if the state machine and
  copy issues persist; notes-vs-commits push coherence is the kind of friction that only surfaces
  across machines and will dominate dogfooding time if not addressed beforehand.

## Relationship to Upstream Work

The Interlock Foundation WU ([prd-foundation][prd-foundation]) and Session-Operational-Flow WU
([prd-ops][prd-ops]) shipped the substrate this plan operates on:

- **Handoff-interior toggle pattern** (IF Phases 1–2): flat-key configuration shape for actions that
  fire inside the handoff ceremony, with config-key precedence chain (git config → yaml → default).
  Documented in [strategy-session-operations][strategy-ops] § Handoff-Interior Toggle Pattern.
- **Push-ordering invariant** (IF, constitutional): worktree-push lands before notes-push when both
  fire at handoff. Enforced by handoff-workflow per-action checklist ordering.
- **`session.push_interlock: on-handoff`** (SOF): worktree push at handoff. This *is* the worktree-push
  toggle this plan was originally going to introduce; no sibling toggle is needed.
- **`user.sync_push: always | prompt | manual`** (predates IF; formalized as a handoff-interior toggle
  by IF): notes save+push at handoff.

What's left for this plan: **finish the polish work the framework enables** (state machine, copy,
residual edge cases, the unpushed-HEAD bug) and **align the legacy config shape** with IF's interlock
vocabulary while adding the per-dev overrides we forgot during IF.

## Scope

### In scope

**Notes-discovery fix (HEAD-independent walk).** `arc user load` and `arc user pull` currently walk
HEAD ancestry to find notes (`git rev-list --max-count N HEAD` in
`packages/arc-framework/src/commands/user/save-load.ts`), failing when notes are attached to commits
that aren't ancestors of the current HEAD — the canonical scenario being a stale local branch where
work continued elsewhere. The fix adds a HEAD-independent discovery mode that walks the notes ref's
own commit history (`git log refs/notes/arc/user/{identity}`) to find the most recent attachment
regardless of worktree HEAD position. Surfaced 2026-04-28 during cross-machine resume when the
existing HEAD-walk semantics blocked the notes-as-breadcrumb signal for branch-gone detection.
**Sequencing within this WU:** notes-discovery design precedes state-machine unification — unification
builds on the new load semantic and would need rework if added later.

**State-machine unification.** Collapse full-mode and session-init to a single state computation.
Session-init's 5-state surface becomes the spine; full-mode adds diskStatus and saved-when detail as
secondary axes but never disagrees with the spine. Action hints become deterministic from the spine —
no path to "run `arc user save`" when the user actually needs `arc user pull`. Consolidate the ~20
string permutations to a documented matrix.

**Partial-push state surfacing.** The state spine must distinguish "worktree pushed, notes ref lagging"
from generic `local-ahead`. After a partial-push failure (worktree push succeeded, notes push failed at
handoff or on `arc user push`), subsequent `arc status` invocations report the partial state with
recovery guidance — not report clean. Folds into the documented matrix as a recognized condition.

**Directional copy audit.** Every headline and detail line in `sync-status.ts` names both sides of the
comparison it makes. One first-use "About user notes" framing surface (location decision deferred to
PRD — see § Alternatives) to orient users who haven't internalized the git notes terminology. Keep git
notes vocabulary — supplement, don't abstract; devs need the terms to reason about `arc user *`
commands, which are thin wrappers over `git notes` operations.

**Layered vocabulary rule.** "User notes" is the workhorse noun for the concept (headlines, action
hints, status summaries). "Git notes ref" or "git notes" surfaces only when storage mechanism is
relevant (debugging, ref state, error messages mentioning `refs/notes/...`). The first-use framing
surface introduces the connection once — e.g., *"ARC stores your gitignored personal context
(SESSION-NOTES.md, ATOMIC-INBOX.md) as a git notes ref attached to commits. Travels via push/pull."* —
then never repeated. This avoids both the bare-"notes" generic (collides with git's optional-annotation
meaning) and the "user git notes" verbose compound.

**Worktree qualifier — surface `failureReason`.** When `worktree.state === "remote-unavailable"`,
`formatWorktreeQualifierLine` (`sync-status.ts:354`) emits a single message regardless of whether
the bounded fetch hit its 3 s timeout or errored outright. The `failureReason: "timeout" | "error"`
field is captured by `runWorktreeSyncStatus` but never reaches the user, so a transient blip and a
hard auth/config failure render identically. Fold the field into the rendered line — timeout reads as
"likely transient, retry or use `--offline`"; error reads as "investigate auth/network".

**Config-shape alignment.** Rename and align the legacy `user.sync_push` config shape with IF's
interlock vocabulary so all three release-mode keys speak the same language:

- Yaml key: `user.sync_push` → `user.notes_push`. Current name is opaque; `notes_push` says what it does.
- Value enum: `always | prompt | manual` → `manual | prompt | on-handoff`. `always` becomes
  `on-handoff` (semantically identical, vocabulary-aligned with `session.push_interlock: on-handoff`).
  `prompt` stays — team-mode rationale (notes are personal context; review-before-share for shared
  remotes) is real and team-specific. Worktree pushes don't get a `prompt` mode for the symmetric
  reason: commits already had review, so mid-handoff prompting adds friction without justification.
- Git-config override: `arc.syncPush` → `arc.notesPush`.
- Strategy doc § Standard value enum (session-operations § Handoff-Interior Toggle Pattern): retire the
  documented-but-unused `auto / prompt / manual` standard. Canonical shape becomes `manual | on-X` with
  `prompt` available as opt-in for toggles where review-before-fire makes sense (notes; future
  similar cases).
- Migration: pre-1.0 break is acceptable. Adopters with `user.sync_push: always` get a one-time
  rewrite during `arc update` (or equivalent migration helper) that translates key + values.

**Command-shape alignment.** Rename `arc sync` → `arc user sync` so the user-notes porcelain shares the
namespace with the rest of the family (`arc user save / load / push / pull / fetch`). The current
top-level `arc sync` reads as broader than its scope — collides with the mental model of "sync the
project" or "sync framework files" — and is the one verb that doesn't surface under `arc user --help`,
where developers discovering the user-notes flow would expect to find it. Rename preserves the existing
direction-aware porcelain semantic intact (per ADR-012's 2026-04-22 amendment); only the invocation
path moves. Hard rename, pre-1.0 — no transitional alias. No broader cross-domain `arc sync` is on the
pre-1.0 roadmap; revisit the namespace question only if an outside-repo / non-git sync mechanism
enters scope.

**Per-developer overrides for interlock keys.** Add `git config arc.commitInterlock` and
`arc.pushInterlock` as per-dev overrides for the IF interlocks. Both keys move to **3-tier resolution**
(git config → yaml → default), matching `user.notes_push` and the broader handoff-interior toggle
shape. Validation in `lib/config/status-reader.ts` extends to read the git-config override before
falling through to yaml + default.

**Resolver consolidation.** With all three release-mode keys (`session.commit_interlock`,
`session.push_interlock`, `user.notes_push`) sharing the 3-tier resolution shape, extract the
precedence logic into a generic helper (`resolveGitConfigOverride<T>` or similar) and migrate
`lib/sync-policy.ts` plus the new interlock resolutions onto it. Original "deferred to plan-user-sync-ux
when third toggle lands" rationale survives — just retargeted: the third toggle was always going to be
the interlocks once we noticed they needed per-dev overrides, not a worktree-push sibling. *(Note:
`lib/autonomy-policy.ts` shipped briefly during IF as a 3-tier parallel of `sync-policy.ts`, then was
deleted during SOF Task 2.1 when `session.autonomy` split into the two separate flat keys; validation
moved inline to `status-reader.ts` and lost the 3-tier shape. This scope item restores it.)*

**Pushability pre-checks for handoff-interior pushes.** Detect what's detectable client-side; surface
the condition; never silently skip. Per-condition behavior (informed by external research on mature
VCS-tooling conventions):

- **Rebase in progress** — block both refs + guide ("Complete or abort rebase first").
- **Detached HEAD** — block both refs + guide ("Push requires a branch").
- **No upstream tracking** — for the worktree branch: block + guide ("Set upstream first:
  `git push -u origin <branch>`"). For the notes ref: auto-configure (internal ref; no user-visible
  config implication).
- **Protected branch (server policy)** — bubble server error verbatim. Cannot detect client-side
  without API access; let the server reject and surface the underlying message.
- **Pre-receive hook failure** — bubble server output verbatim. Server-side; not predictable.
- **Permission denied (auth/authz)** — bubble error + suggest token/credentials refresh.
- **Force-push required** — error. Never force-push from handoff or `arc user push`. User invokes
  raw git if rewriting history is intended.

Concrete copy strings finalized at PRD/implementation time; the matrix above pins behavior per
condition.

**Paired-push failure semantics.** When both worktree and notes push fire at handoff and one fails:
push-ordering invariant guarantees worktree lands first, so the failure mode is "worktree pushed,
notes failed" (not the reverse). Behavior:

- **Exit 1 on partial success.** Never exit 0 with partial publish. Exit code reflects the worst
  outcome across the paired operation.
- **Itemized output** showing both legs:

    ```text
    ✗ User sync failed at step 2 of 2
      ✓ Worktree push succeeded: refs/heads/<branch>
      ✗ Notes push failed: refs/notes/arc/user/{identity}
        Error: <reason>
        Recovery: arc user push
    ```

- **No automatic retry.** User invokes recovery via `arc user push`. Network errors compound on
  retry; observability matters more than convenience.
- **Idempotent recovery.** `arc user push` checks remote ref state via
  `git ls-remote refs/notes/arc/user/{identity}` before pushing; if remote already matches local,
  the command is a no-op with confirmation. Makes recovery safe to invoke arbitrarily and supports
  re-running after transient failure.

**`user.notes_push: on-handoff` under `session.push_interlock: manual`.** When notes are configured to
auto-push but worktree is manual:

- Worktree has no unpushed commits → save and push notes.
- Worktree is local-ahead → save notes locally; **block** notes push with clear guidance ("push the
  worktree first, then `arc user push`").
- Worktree is diverged / remote-ahead → block notes push; surface reconciliation guidance.

The block-with-guidance pattern preserves coherence (no notes against unknown commits) without forcing
users into `session.push_interlock: on-handoff` when they want manual control of worktree pushes.

**Shared-ref sync-state inference under parallel sessions.** Each session computes sync state from its
worktree's HEAD. The notes ref is shared across the identity. Sync-state inference must distinguish:

- "your local is behind because you haven't fetched" — local hasn't pulled yet
- "your local is behind because work happened on another machine" — different machine pushed
- "your local is behind because a sibling session on this machine pushed" — same machine, different
  worktree/session

Without a remote probe, only the third can be detected directly (notes-ref distance from local working
files vs. saved-when timestamp). The first two require a fetch to disambiguate. **Mechanism (committed,
final shape at PRD):** extend the existing bounded-fetch pattern (already in place for the worktree-sync
probe) to the notes ref on full-mode `arc status` invocation. Session-init probe stays remote-aware via
the existing pull mechanism. The `--offline` flag suppresses both fetches.

**Unpushed-HEAD save/push behavior.** Pin the CLI behavior for the 2026-05-01 bug: `arc user save`
saves the local note regardless of HEAD push state (preserves the dev's working state). `arc user push`
checks the annotated commits' push status before pushing the notes ref; blocks on unpushed commits
with clear guidance to push the worktree first. The same coherence rule applied to the
`user.notes_push: on-handoff` + `session.push_interlock: manual` case above generalizes here — notes
push is gated on commit pushability regardless of trigger (handoff, manual, or future modes).

**Anti-patterns to avoid.** External research surfaced concrete failure modes in mature tooling that
this plan's implementation must guard against:

- **Silent skip on missing auth or scope** (`semantic-release`, `lerna publish`) — when credentials
  lack push permission, fail loudly with the server message; never skip silently and exit 0.
- **Exit 0 on partial publish** (`lerna publish`, `npm publish` in workspaces) — exit code must
  reflect the worst outcome across paired operations. Partial success is failure.
- **Create-then-fail-mid-asset that can't be re-run** (`gh release create` historical behavior) —
  composite operations must support idempotent re-invocation. The recovery command detects
  already-succeeded work and skips it cleanly.
- **Single-line error buried in success output** — failure is visually distinct from progress text.
  Itemized two-line summaries (per the paired-push failure shape above) make state scannable.

These constraints inform implementation across the pushability, paired-push, state-machine, and
CLI-output scope items above.

### Out of scope

- Full reimplementation of the notes storage model (e.g., moving off git notes).
- Docs-site deep dive on git notes concepts — that's `plan-docs-content-sweep.md` territory.
- Changes to the per-identity notes ref path or namespace.
- Changes to the session-init probe's 5-state enum (the target; not a new state).
- Adding `prompt` mode to `session.commit_interlock` / `session.push_interlock`. Worktree pushes go
  through reviewed commits and commit work is reviewed at the task-interlock; mid-session prompts add
  friction without team-scenario justification. The notes-prompt rationale is unique to notes (see
  § Config-shape alignment).

## Alternatives

**State-machine unification (committed: A).**

- **A — Session-init spine + full-mode detail axis.** Single state computation returns the 5-state
  spine plus a detail object (diskStatus, savedWhen, refDistance). Full-mode renders spine + detail;
  session-init renders spine only. Action hints come from the spine.
    - *Pro:* Keeps session-init surface stable. Eliminates state-machine drift. Produces a documented
      state matrix.
    - *Con:* Non-trivial refactor of `inspectUserSyncRefsDetailed`. Full-mode output shape changes
      (version-gate or accept the break — CLI is pre-1.0).
- **B — Keep two state machines, add cross-validation assertion.** In dev builds, assert full-mode and
  session-init agree about the same underlying git state; surface mismatches as warnings.
    - *Pro:* Smaller change.
    - *Con:* Doesn't fix underlying architecture. Copy inconsistency remains. Full-mode stays hard to
      reason about.

**Decision: A.** B trades a real fix for a smaller change, which doesn't earn the deferral when
state-machine drift is the root pathology behind the symptoms.

**Config-rename migration (committed: A).**

- **A — Hard rename in `arc update`.** `arc update` rewrites `user.sync_push: always` →
  `user.notes_push: on-handoff` (and `prompt`/`manual` values renamed equivalently). Single migration;
  old key removed.
- **B — Accept both keys for one release; deprecate.** Both `user.sync_push` and `user.notes_push`
  work; old key emits a warning. Hard remove in next release.
- **C — Coexist forever.** Two keys, two names, permanent vocabulary asymmetry.

**Decision: A.** Pre-1.0; clean break is cheaper than a dual-key window. C is not really an option in a
polish window.

**Command-rename migration (committed: A).**

- **A — Hard rename, pre-1.0.** `arc sync` is removed; `arc user sync` becomes the only invocation. No
  transitional alias.
- **B — Accept both invocations for one release; deprecate.** Both `arc sync` and `arc user sync` work;
  old invocation emits a deprecation warning. Hard remove next release.
- **C — Coexist forever.** Two invocations, permanent vocabulary asymmetry.

**Decision: A.** Same logic as config-rename: pre-1.0; clean break is cheaper than a dual-invocation
window. C is not really an option in a polish window.

**First-use framing surface (deferred to PRD).**

- **A — Conditional hint line in `arc status`.** When the user's first-touch state suggests confusion
  (e.g., session-init detects no local notes yet), append a single-line "About user notes:
  see `arc user --help`" pointer.
- **B — Add to `arc join` post-init message.** First-time setup includes a paragraph orienting to the
  user-notes flow.
- **C — Both** (belt-and-suspenders).

**Decision deferred to PRD** — both have merit; want to gauge volume of confusion against signal value.
Likely answer is C with the `arc status` hint conditional on a suppression flag the user can toggle off.

## Unknowns and Assumptions

**External research completed during planning** — findings folded into the relevant scope items
above (pushability matrix, paired-push failure shape, layered vocabulary rule).

**Assumptions to validate during PRD:**

- Session-init probe remains the canonical remote-state surface; full-mode consumes it. If wrong
  (e.g., full-mode needs independent semantics for some CI path), the unification direction changes.
- Users reading `arc status` are devs familiar with git notes *concept* (even if rarely used) —
  terminology supplementation, not abstraction. If beta feedback shows this is wrong, revisit the
  abstraction question.
- `user.notes_push: prompt` rationale (review-before-share for team mode) is the only non-`manual|on-X`
  mode worth keeping. If beta feedback surfaces other prompt-worthy cases, revisit the canonical shape.
- The push-ordering invariant from IF holds for all paired-push scenarios this plan introduces — no
  new orderings needed.
- `lib/autonomy-policy.ts` deletion during SOF Task 2.1 was clean — no orphan references in workflows
  or strategies. Verify during PRD-drafting; any stragglers route into the resolver-consolidation
  scope item.

## Scope Estimate

**Medium** (week-ish).

Rough breakdown:

- Notes-discovery fix: ~0.5 day.
- State-machine unification + directional copy audit: 2–3 days (refactor + tests).
- Config and command-shape alignment (key + value rename, verb rename, strategy doc updates,
  `arc update` migration): 1 day.
- Per-dev overrides for interlocks + resolver consolidation: 1 day (extend status-reader; extract
  generic helper; migrate `sync-policy.ts` onto it).
- Residual auto-push edge cases (pushability pre-checks, paired-push failure, unpushed-HEAD,
  notes-push under manual worktree push): 1–2 days.
- Worktree qualifier `failureReason`: ~0.5 day.
- Shared-ref inference: scoped during state-machine unification (uses the same probe).

**Dependencies:** All upstream prerequisites have landed.

- Session-Init Optimization (`arc user fetch` atomic fix + neighboring context refactor) — 04, archived.
- Interlock Foundation (handoff-interior toggle pattern, push-ordering invariant, configuration
  surface) — 05, archived.
- Session-Operational-Flow (`session.push_interlock: on-handoff` worktree push, structured
  task-completion prompt, parallel-session concurrency model framing) — 06, archived.

**Sibling plans (parallelizable):**

- [plan-worktree-foundation][plan-wf]: Worktree Foundation's per-worktree SESSION-NOTES handling
  interacts with sync semantics; either order works (this WU first → Worktree Foundation incorporates
  worktree-aware sync from clean substrate; Worktree Foundation first → this WU retrofits worktree
  axis cleanly).
- [plan-coord-probe][plan-coord]: Coord-probe consumes the notes-discovery fix as one signal source
  for branch-gone detection. Coordinated parallel work, not strict ordering.

**Downstream (benefit from this WU's exits):**

- [plan-agile-wu-lifecycle][plan-awl] and [plan-concurrent-work-conventions][plan-cwc]: both benefit
  from a clean sync state machine and aligned config vocabulary before tier model and concurrency
  conventions add their own axes.

**Scheduling:** Pre-1.0 polish window. Before ARCd Rebrand (rename pass picks up consolidated state
machine + aligned config in one pass rather than re-touching strings that churned during this work).

**WU split:** Default unified. Internal coupling between state-machine unification, directional copy
audit, and config-shape alignment (all touch `sync-status.ts` adjacent surfaces or its rendering layer)
makes a split awkward. Split-trigger is task-generation scope blowout; if invoked, the natural split
axis is **diagnostic vs. behavior**:

- Diagnostic: notes-discovery + state-machine unification + directional copy audit + shared-ref
  inference + worktree qualifier `failureReason`.
- Behavior: config-shape alignment + command-shape alignment + per-dev overrides + resolver
  consolidation + pushability pre-checks + paired-push failure + unpushed-HEAD +
  notes-under-manual-worktree.

Each track is independently shippable and either order works.

---

[prd-foundation]: ../../reference/archive/2026-q2/technical/05_interlock-foundation/prd-interlock-foundation.md
[prd-ops]: ../../reference/archive/2026-q2/technical/06_session-operational-flow/prd-session-operational-flow.md
[strategy-ops]: ../../reference/strategies/arc/strategy-session-operations.md
[plan-coord]: ../../backlog/technical/plan-coord-probe.md
[plan-wf]: ../../backlog/technical/plan-worktree-foundation.md
[plan-awl]: ../../backlog/technical/plan-agile-wu-lifecycle.md
[plan-cwc]: ../../backlog/feature/plan-concurrent-work-conventions.md
