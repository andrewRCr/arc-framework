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

## Scope

### In scope

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

**Auto-push design + implementation** (requires external research, see Unknowns). Design a config axis
for pushing commits + notes together, with safeguards for protected branches and unpushable states.
Shape TBD at PRD close based on research findings; candidates enumerated in Alternatives.

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

**Auto-push config design axes (all require external research before selecting):**

- **A — `handoff.push: auto | prompt | manual` as a new config key.** Fires only at session handoff.
  Pushes current branch + notes together if the branch is pushable.
    - *Pro:* Scoped narrowly to the workflow that introduces laptop→primary drift.
    - *Con:* Duplicates conceptual space with existing `user.sync_push`.

- **B — Extend `user.sync_push` scope to cover commits.** Push commits + notes together as one logical
  operation; policy enum (`always | prompt | manual`) unchanged.
    - *Pro:* Single config key, single mental model. Matches the user's instinct that notes-only push
      is semantically broken.
    - *Con:* Conflates "push my personal notes ref" with "push the branch" — may deserve independent
      toggles.

- **C — Smart coupling.** `user.sync_push: always` with a pre-check: if commits aren't on the remote,
  offer to push them first. No new config key.
    - *Pro:* No config surface expansion. Defensive by default.
    - *Con:* Hidden behavior; may surprise users who expect `sync_push` to be notes-only.

## Unknowns and Assumptions

**External research required before PRD drafting:**

- How do `jj`, `git-branchless`, graphite, sapling, and other modern git wrappers handle
  coupled-push semantics (branch + metadata together)? Is there an idiomatic pattern?
- How do these tools handle auto-push on protected branches, force-push conditions, or unpushable
  states (rebase in progress, upstream hook failure)?
- Is there precedent for "push notes + commits together" as one operation, or do established tools
  always keep notes push as a conscious separation? (git-appraise, git-test, git-notes tooling are
  reference points.)
- Dev community norms: would auto-push at handoff feel invasive or expected? Any data from tools that
  have tried both defaults and migrated one direction or the other?
- Terminology research: what do other tools name the "ref snapshot of local config/state" concept?
  "snapshot", "state ref", "note", "metadata", "pin" — worth an audit before finalizing copy.

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

- Session-Init Optimization must land first (atomic fix for `arc user fetch` prompt ships there; the
  state-machine refactor would conflict with the ongoing context-audit edits touching neighboring
  surfaces).
- Landing before ARCd Rebrand (not after) means the rename pass picks up a consolidated state
  machine and directional copy in one pass, rather than re-touching strings that churned during this
  work. Rebrand is a bulk-rename editorial pass; doing this WU first keeps its scope mechanical.
- Work-Unit Mobility is immediately downstream and benefits from a clean sync state machine before
  worktree awareness adds an axis to it.

**Scheduling:** Immediately after Session-Init Optimization, before Work-Unit Mobility and ARCd
Rebrand. Pre-1.0 polish window where fixing sync UX produces maximum leverage for downstream work.

**Pre-approved split at PRD-drafting time:** If the auto-push design proves larger than "medium" after
research, split into two WUs:

- WU-A: State-machine unification + copy audit (small–medium; low research burden).
- WU-B: Auto-push design + implementation (medium; research-heavy).

Both WU-A concerns are tightly coupled; auto-push is a different risk profile (behavior change vs.
presentation change). Splitting respects the shorter-scoped-WU preference without forcing it when
unified scope stays manageable.
