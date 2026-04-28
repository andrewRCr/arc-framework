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

3. **`arc user fetch` breaks git convention.** `git fetch` is universally read-only and never prompts.
   `arc user fetch` prompts with copy identical to `arc user pull` ("Local notes will be overwritten by
   remote. Continue?"), implying a file overwrite when only the ref is updated. (Atomic fix routed to
   the Session-Init Optimization WU's `atomic-session-init-optimization.md` — this plan assumes it
   lands first.)

4. **`user.sync_push` covers notes only, not commits.** Pushing `refs/notes/arc/user/{identity}`
   without pushing the commits it annotates produces a remote state where notes reference unknown
   commits for fresh clones or sibling machines. `arc user load --max-walk` partly mitigates via
   ancestor search within a walk depth, but the semantic coherence is broken. Session handoff never
   pushes the worktree — users do it manually, making `user.sync_push: always` partly meaningless when
   the commits the notes annotate haven't been pushed.

This matters now because:

- Cross-machine resumes are a primary use case for user notes — the flow is broken at the first
  surface users touch after pulling.
- Pre-1.0 polish window — these surfaces shouldn't reach public release as-is.
- Dogfooding (upcoming in the release path) will compound user confusion if the state machine and
  copy issues persist; notes-vs-commits push coherence is the kind of friction that only surfaces
  across machines and will dominate dogfooding time if not addressed beforehand.

## Relationship to Gate Model Frame

[ADR-016][adr-016] establishes configurable autonomy gates for session-operational flow, with
[plan-session-operational-flow][plan-ops] implementing the core mechanics — including the
handoff-interior toggle framework for configuring actions inside `arc handoff`. This plan consumes
that framework: the auto-push design below becomes an instantiation of handoff-interior toggles
(worktree push + notes push as paired configurable actions) rather than a standalone `user.sync_push`
expansion.

Scope impact: the auto-push portion of this plan gets lighter post-frame. State-machine unification
and directional copy audit (the other two scope items) are unaffected — they stand on their own.

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

**Directional copy audit.** Every headline and detail line in `sync-status.ts` names both sides of the
comparison it makes. One first-use "About user notes" framing surface (likely in `arc join` output or
as a conditional hint line in `arc status`) to orient users who haven't internalized the git notes
terminology. Keep git notes vocabulary — supplement, don't abstract; devs need the terms to reason
about `arc user *` commands, which are thin wrappers over `git notes` operations.

**Auto-push implementation within the gate-model frame.** Consumes the handoff-interior toggle framework
from [plan-session-operational-flow][plan-ops] (Phase 6). This plan instantiates paired worktree-push +
notes-push as configurable handoff-interior actions — solving the `user.sync_push: always` incoherence
(notes pushed without commits) by pairing both operations at the same gate. Includes pushability
pre-checks (protected branches, unpushable states, rebase in progress), failure semantics, and
remote-unavailable handling. Config axis shape is provided by the frame; this plan picks up the
worktree/notes-specific instantiation.

### Out of scope

- Full reimplementation of the notes storage model (e.g., moving off git notes).
- Docs-site deep dive on git notes concepts — that's `plan-docs-content-sweep.md` territory.
- Changes to the per-identity notes ref path or namespace.
- Changes to the session-init probe's 5-state enum (the target; not a new state).

## Alternatives

**State-machine unification approaches:**

- **A — Session-init spine + full-mode detail axis (recommended direction).** Single state computation
  returns the 5-state spine plus a detail object (diskStatus, savedWhen, refDistance). Full-mode
  renders spine + detail; session-init renders spine only. Action hints come from the spine.
    - *Pro:* Keeps session-init surface stable. Eliminates state-machine drift. Produces a documented
      state matrix.
    - *Con:* Non-trivial refactor of `inspectUserSyncRefsDetailed`. Full-mode output shape changes
      (version-gate or accept the break — CLI is pre-1.0).

- **B — Keep two state machines, add cross-validation assertion.** In dev builds, assert full-mode and
  session-init agree about the same underlying git state; surface mismatches as warnings.
    - *Pro:* Smaller change. Catches the specific bug that hit this morning.
    - *Con:* Doesn't fix underlying architecture. Copy inconsistency remains. Full-mode stays hard to
      reason about.

**Auto-push config shape** is now provided by the gate-model frame's handoff-interior toggle framework
(see [plan-session-operational-flow][plan-ops] Phase 6). The three axes previously enumerated here
(new `handoff.push` key, extended `user.sync_push`, smart coupling) are superseded — worktree push
and notes push become paired handoff-interior toggles under the frame's configuration schema.

Remaining plan-level design choices (for PRD):

- **Pushability pre-check behavior.** When push is enabled and the branch is protected or unpushable
  (rebase in progress, upstream hook failure, detached HEAD), does the toggle skip silently, prompt,
  or error?
- **Paired-operation failure semantics.** If worktree push succeeds but notes push fails (or vice
  versa), how is the failure surfaced to the user? Retry, rollback, report-and-continue?
- **Backward compatibility with `user.sync_push`.** Does the existing key deprecate, get absorbed
  into the new toggle schema, or continue to coexist during transition?

## Unknowns and Assumptions

**External research status update.** The coupled-push semantics research ("is pairing branch + metadata
push idiomatic?") is partially obviated by the gate-model frame — the frame's architectural decision
is that pairing-at-same-gate is the right shape, validated by industrial precedent in
[ADR-016][adr-016]. Remaining research value at PRD drafting:

- Pushability pre-check conventions in modern VCS tooling (protected branches, unpushable states) —
  narrower than the original coupled-push question; specific to this plan's mechanics.
- Failure semantics for paired remote operations — how do tools surface partial-failure of composite
  push operations? (Conventional patterns in `git push --all`, `git push --atomic`, monorepo tooling.)
- Terminology research for the "ref snapshot of local config/state" concept ("snapshot", "state ref",
  "note", "metadata", "pin") — still relevant for copy audit regardless of the frame.

**Assumptions to validate during PRD:**

- Session-init probe remains the canonical remote-state surface; full-mode consumes it. If this is
  wrong (e.g., full-mode needs independent semantics for some CI path), the unification direction
  changes.
- Users reading `arc status` are devs familiar with git notes *concept* (even if rarely used) —
  terminology supplementation, not abstraction. If beta feedback shows this is wrong, revisit the
  abstraction question.
- `arc user fetch` without a prompt is universally safer than with prompt. If the prompt was
  protecting against a failure mode not yet identified, the atomic fix in Session-Init Optimization
  needs revisiting — this plan assumes no such failure mode exists.

## Scope Estimate

**Medium** (days–week).

Rough breakdown:

- State-machine unification + copy audit: 2–3 days (refactor + tests + two-copy sync where applicable).
- Auto-push: 1–2 days external research + 1–2 days PRD drafting + implementation TBD (depends on axis
  chosen — Axis C is smallest, Axis A is largest).

**Dependencies:**

- **[plan-session-operational-flow][plan-ops] Phase 6 (handoff-interior toggles) must land first** for
  the auto-push portion of this plan — the toggle framework is the substrate this plan instantiates
  worktree-push + notes-push against. State-machine unification and copy audit (the other two scope
  items) have no such dependency and could ship earlier if scoped independently.
- Session-Init Optimization must land first (atomic fix for `arc user fetch` prompt ships there; the
  state-machine refactor would conflict with the ongoing context-audit edits touching neighboring
  surfaces).
- Landing before ARCd Rebrand (not after) means the rename pass picks up a consolidated state
  machine and directional copy in one pass, rather than re-touching strings that churned during this
  work. Rebrand is a bulk-rename editorial pass; doing this WU first keeps its scope mechanical.
- **[plan-worktree-foundation][plan-wf]** is sibling (parallelizable). Worktree Foundation's
  SESSION-NOTES per-worktree handling interacts with sync semantics; either order works (this WU
  first → Worktree Foundation incorporates worktree-aware sync from clean substrate; Worktree
  Foundation first → this WU retrofits worktree axis cleanly).
- **[plan-coord-probe][plan-coord]** is sibling (parallelizable). Coord-probe consumes the
  notes-discovery fix as one signal source for branch-gone detection. Coord-probe ships v1 with in-git
  and gh signals; notes-as-breadcrumb signal joins when the notes-discovery fix lands. Coordinated
  parallel work, not strict ordering.
- **[plan-agile-wu-lifecycle][plan-awl]** and **[plan-concurrent-work-conventions][plan-cwc]** are
  downstream — both benefit from a clean sync state machine before tier model and concurrency
  conventions add their own axes.

**Scheduling:** After Session-Init Optimization and plan-session-operational-flow Phase 6 (handoff-interior
toggles). State-machine + copy work can start once Session-Init Optimization lands; auto-push work
waits for the gate-model frame. Before Work-Unit Mobility and ARCd Rebrand. Pre-1.0 polish window
where fixing sync UX produces maximum leverage for downstream work.

**Pre-approved split at PRD-drafting time:** Natural split aligns with the frame dependency:

- WU-A: State-machine unification + copy audit (small–medium; independent of gate-model frame; can
  ship as soon as Session-Init Optimization lands).
- WU-B: Auto-push instantiation against handoff-interior toggle framework (medium; waits for
  [plan-session-operational-flow][plan-ops] Phase 6).

Unified scope is acceptable if sequencing works out, but the frame dependency makes split the more
likely path.

---

[adr-016]: ../../reference/adr/adr-016-configurable-autonomy-gates-for-session-operations.md
[plan-ops]: plan-session-operational-flow.md
[plan-coord]: plan-coord-probe.md
[plan-wf]: plan-worktree-foundation.md
[plan-awl]: plan-agile-wu-lifecycle.md
[plan-cwc]: ../feature/plan-concurrent-work-conventions.md
