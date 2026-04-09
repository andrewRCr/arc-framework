# Analysis: Solo-Dev Blind Spot Audit (Operating Modes WU)

**Work Unit:** `plan-arc-modes.md` (pre-PRD gating deliverable)
**Date:** 2026-04-09
**Scope:** ARC's current workflows, strategies, and the proposed shift lifecycle design, audited
for gaps that the framework's solo-sequential design lens has obscured but that become live in
team, multi-stream, or long-latency contexts.
**Audience:** Next session consuming this document to make the design decisions it surfaces. The
audit produces findings and options, not conclusions — conclusions belong to the follow-up session.

---

## Executive Summary

The audit tested the post-shift, post-modes design against a battery of ~60 realistic scenarios
across 14 categories (multi-dev team, latency and waiting states, branching and stacking, state
mutations, review feedback loops, session and context boundaries, cross-WU dependencies, hotfix,
cadence, stakeholder gates, Lite-specific, Local-specific, planning proto-WU, and system coherence).
Most scenarios are handled cleanly by the shift lifecycle as currently drafted. A handful of gaps
remain, and among them, **one is a scope-defining design decision that must be made before the PRD
can be written**: the shape of multi-WU state capture.

The plan doc sketches an "In Flight registry + Active Focus" inside `WORK-STATUS.md`. That sketch
is one option of at least three, and a clarifying conversation during the audit surfaced that the
assumptions behind it are not yet settled. The question "where does the multi-WU registry live (or
should there be a registry at all)?" is the central open design question this document carries
forward.

Most other findings are detail-design items or documentation clarifications that can be resolved
during implementation without blocking the PRD. A smaller set of out-of-scope findings are captured
as follow-up WU candidates so they are not lost.

---

## Methodology

The audit combined four inputs and synthesized findings against the scenario battery:

1. **Direct reading** of the session-lifecycle workflows, `3_process-task-loop.md`,
   `manage-incidental-work.md`, and `strategy-work-planning.md` — the workflows the developer
   interacts with mid-session, not at work unit boundaries.
2. **Delegated extraction** of work unit lifecycle workflows (`activate-`, `integrate-`, `archive-`,
   `verify-`, `clean-`, and `rotate-branch`) and of the team-coordination, work-organization, and
   session-operations strategies. The extraction produced factual assumption bullets, not
   interpretation — grounding for the synthesis step.
3. **External research** into how established methodology frameworks model the middle-states that
   solo-sequential designs miss: Kanban's "Waiting For" vocabulary, GTD's parallel tracking list,
   SAFe's Program Dependency Board, Scrum's no-rollover discipline, GitFlow's hotfix isolation, the
   cognitive science of context switching and attention residue, and the empirical literature on
   PR review latency.
4. **Scenario construction and walk-through** — ~60 scenarios derived from the 8 candidate areas in
   `plan-arc-modes.md` § Design Investigations plus additional categories surfaced during extraction
   (planning proto-WU state, worktree-share, self-referential WU splitting, etc.).

A second clarification pass with the plan author after an initial draft resolved several framings
that had been shaped by misunderstanding rather than genuine gaps. Those clarifications are
captured below as framing decisions this document carries forward into the follow-up session —
**not as decisions to re-open**.

---

## Clarifications That Frame This Audit

These are treated as resolved for the follow-up session. They came out of the first-pass audit
conversation and narrow the problem space.

### 1. Planning is not a work unit

A work unit begins at `activate-work-unit`, when the PRD and task list are promoted from the
backlog to `active/`. Everything upstream — plan documents, pre-activation PRDs, backlog items — is
planning, not a WU. Shift does not apply to planning artifacts. Planning continuity is handled by
the plan document itself (per `strategy-work-planning.md` § Planning continuity — "artifact-first
resume"), and multi-planning-effort juggling is not a framework concern.

**Implication:** Shift's scope is "in-flight (activated, not-yet-archived) WUs only." The plan doc
should state this explicitly in the shift section so future readers don't re-raise the question.
The audit's original "D1 / planning-state shift scope" finding dissolves into this documentation
clarification.

### 2. `WORK-STATUS.md` is branch status, not multi-WU registry

`WORK-STATUS.md` is shared and tracked precisely because it describes the state of the current
branch's active WU — "branch status" with slightly more specificity. Work units aren't strictly
tied to branches, but in practice they are closely coupled, and `WORK-STATUS` reflects that
coupling. Multi-WU awareness is a different concern: it is inherently **per-developer** (cognitive,
session-level, cross-branch), and belongs in per-developer state (`user/{identity}/`), not in
shared tracked state.

**Implication:** The plan doc's "In Flight registry inside `WORK-STATUS.md`" sketch is one option
but not a given. The registry, if it exists at all, should be considered for placement in per-dev
state. This reframe opens up the design space into at least three viable options (see § Open
Design Space below), and is the central question the follow-up session should walk.

### 3. Lite's interrupt pattern is task-list mutability (+ atomic companion files, if kept)

Lite's task lists are "very mutable" by design — much more so than Full's. An urgent in-scope bug
during Lite work is handled by inserting a task at the top of the existing task list; execution
continues. Urgent out-of-scope atomic work is handled by an atomic companion file (if Lite retains
that concept — still open in the plan doc). Urgent out-of-scope substantial work is a graduation
signal, caught by Lite's guardrails.

**Implication:** Lite does not need a new interrupt mechanism. The question to resolve is only
whether Lite keeps atomic companion files. The audit's original "Lite interrupt pattern" finding
shrinks to that single open question.

### 4. Observe, don't predict — pause age is reliable; resume date is brittle

A user-entered "expected resume date" is brittle: often unknown, usually wrong, quickly stale, and
adds ceremony without signal. An auto-observed pause timestamp is reliable, ceremony-free, and
enables derived reporting ("paused 2d ago", "paused 3w ago — assumptions may be stale"). Orientation
reports the observed age; users who want to note "Alice said Thursday" can put it in the freeform
reason.

**Implication:** Shift captures a pause timestamp automatically. No expected-resume-date field.
Orientation derives and displays pause age. On long pauses (threshold TBD in detail design), resume
may surface a "re-read PRD/task list — your mental model may be stale" prompt. This is the shape
of the original "M1 pause age" finding, simplified.

### 5. Contributors do not interact with WU state

The role boundary in `ADR-014` and `AGENT-BRIEFING.CONTRIBUTOR` is firm: contributors are external
— they fix issues, submit PRs, use the `Context: contribution (...)` commit footer. They do not
manage WUs, do not see `WORK-STATUS.md` in their session-init, do not need to know what's paused.
If a contributor's PR conflicts with code a maintainer has paused mid-WU, that is a merge conflict
the maintainer handles on resume — normal git, not ARC's concern.

**Implication:** The audit's original "M3 contributor visibility into paused WUs" finding
dissolves. Dropped entirely. Any future concern about "OSS contributors coordinating around
maintainer-paused work" belongs to a different discussion, not this audit.

### 6. `arc-shift` is a skill, not a CLI command

Emergency fast-path behavior (if it exists at all) lives inside the shift workflow and the
`arc-shift` skill, not as a CLI flag. The question "does the default shift workflow have enough
ceremony that an emergency variant is warranted?" remains open — the audit has no strong evidence
either way. Flagged in § Open Questions.

---

## Findings That Remain Load-Bearing

After the clarifications above, the findings the follow-up session should address are a smaller
and better-focused set.

### A. The multi-WU state question (central open design decision)

**Context:** Whatever form the "paused WUs a developer is juggling" mechanism takes, it needs a
location. The plan doc sketches an "In Flight registry" inside `WORK-STATUS.md`. The clarification
on `WORK-STATUS`'s semantics opens at least three viable options.

**See § Open Design Space below** for the full three-way comparison and the scenario battery to
walk against each.

### B. "Paused" conflates two states that mature practitioners keep distinct

**Evidence:** Kanban literature (David Anderson school, nkdagility, the pragmatic agilist blog)
explicitly argues against "blocked" as a first-class state — it's opaque and encourages WIP
violations. GTD's "Waiting For" list is the canonical prior art for externally-blocked items.
Empirical research on PR review latency (CMU, arXiv, IEEE TSE) treats "awaiting review" as
categorically distinct from "in progress" because the developer cannot unblock it. Work *occupies*
the waiting state; it does not "go back to in progress."

**What "paused" currently conflates in the plan doc:**

1. **Developer-pause** — "I'm setting this aside to work on something else, and I'll return to do
   more work on it." The developer is the next mover. Examples: shifted to an incidental, waiting
   for clarification, blocked on own decision.
2. **Waiting for external action** — "I'm done from my side; an external actor is the next mover."
   The developer cannot unblock it. Examples: awaiting PR review, awaiting ARB signoff, awaiting
   downstream deployment.

**Why the distinction matters:**

- Orientation reporting can triage differently: "waiting for review (3d)" suggests nudging a
  reviewer; "paused on incidental (2d)" is self-state with no external action available.
- WIP / growth nudges should probably apply only to developer-pauses. Three items waiting on
  review is a normal PR pipeline; three developer-paused WUs is WIP pressure.
- Pause reason taxonomy (plan doc Open Question 12) becomes simpler when the state itself carries
  the "what kind of waiting" semantics — the state is the category.

**Proposed shape** (for the follow-up session to accept or revise):

Two state values instead of one uniform `paused`:

- `paused` — developer is the next mover. Freeform reason is context for the developer's future
  self. WIP nudges apply.
- `waiting-for` — external party is the next mover. Reason identifies the blocker
  (`review`, `approval`, `delivery`, `decision`, `other`). Growth nudges do not apply to this
  state. Age reporting does.

**Cost:** Small. One extra state value, minor vocabulary update in orientation reporting, small
documentation impact. Works under any of the three registry options in § Open Design Space.

### C. Reconcile shift with existing `clean-work-unit` pause pointer fields

**Evidence:** `clean-work-unit.md` already defines four task list header fields for pause/resume
pointer semantics:

- `Interrupts:` — backward pointer (where work resumes AFTER this task list)
- `Paused:` — backward pointer (same direction as `Interrupts:`)
- `Paused To:` — forward pointer (child task list spawned FROM this work)
- `Spawned:` — forward pointer (same direction)

The cleanup workflow has explicit KEEP/REMOVE rules tied to whether the referenced file is in
`.arc/active/`. These fields are documented only in `clean-work-unit.md`, used only at cleanup
time, and not integrated with session-init, WORK-STATUS, orientation, or the shift workflow design.

**The finding:** These fields are an existing, partial pause/resume convention that the shift
design should either **formalize and reuse**, **deprecate in favor of shift's own metadata**, or
**keep alongside as a secondary discoverability layer**. Whichever direction shift takes, the
reconciliation should be explicit. Discovering `Interrupts:` and `Paused:` mid-implementation and
bolting them on is the failure mode to avoid.

**Relevance to registry options:** This finding is load-bearing for Option C (artifact-first — no
registry file) because it would use these fields as the state carrier. It is still relevant to
Options A and B as "deprecate or retain?" but less central.

### D. Pause-reason category for cross-WU dependencies

**Evidence:** External research shows cross-WU (or cross-epic) dependency tracking has no "right"
answer at any scale — SAFe uses a quarterly Program Board, LeSS uses continuous multi-team
meetings, and everyone else does it ad hoc. Heavy formal dependency artifacts are overkill for
ARC's scale. But shift's pause-reason taxonomy (plan doc Open Question 12) has a natural place to
encode a lightweight signal.

**Proposed shape:**

Among structured pause-reason categories, include `blocked-on-wu:{name}` — indicates another
in-flight WU must complete first. Gives ARC cross-WU dependency tracking for free: no new
artifact, just a reason convention. Orientation can surface dependency chains when they exist.

**Cost:** Trivial. This is a taxonomy addition, not a new mechanism.

### E. WIP limit framing for the growth nudge

**Evidence:** The plan doc proposes a soft nudge at ~3 paused WUs, described as "gut level, no
hard cap." External research provides empirical grounding: David Anderson / Personal Kanban
literature recommends per-person WIP limits (commonly 2–3 for solo work); context-switching
research quantifies the cost at ~40% productivity hit with a median 23-minute refocus time; the
concept of "attention residue" describes cognitive function decline persisting after task-switching.

**The finding:** Frame the growth nudge as a **WIP limit** grounded in research, not an arbitrary
threshold. Adopting established language improves credibility and gives users a model for why the
number matters. Shift's documentation should frame it as "a mechanism for unavoidable rotations,
not an invitation to juggle" — the "does less where it has to" philosophy already aligns with this;
the framing just needs to be explicit.

**Cost:** Documentation only. No mechanism change.

### F. Hotfix ≠ shift — reinforce the branch-isolation framing

**Evidence:** GitFlow and similar branching models handle hotfixes as **independent branches**,
not as a pause/resume operation. The plan doc's Local Mode Scenario 2 already gets this right
("switch to hotfix branch, fix, merge, return. ARC state stays on feature-X — visibly mismatched
but correct"), but the framing is not elevated to the shift workflow documentation.

**The finding:** Shift's docs should state explicitly that **production emergencies use plain git
branch isolation, not shift**. Shift exists for WU rotations that warrant formal attention — not
for interrupts that complete within minutes or hours. A developer handling a 30-minute hotfix
should not invoke `arc-shift`; they should branch, fix, merge, and return. The Active Focus
temporarily mismatching git HEAD is expected, documented, and harmless.

**Cost:** Documentation only.

### G. `PROJECT-STATUS.md` "Currently Active" under multi-WU state

**Evidence:** From the workflow extraction, `PROJECT-STATUS.md` has a singular `Currently Active`
field updated by `activate-work-unit` and `archive-work-unit`. This is a parallel single-slot
assumption to the `WORK-STATUS.md` one, but lives in a different file with different semantics
(project-level vs. branch-level).

**The finding:** Whatever shape the multi-WU mechanism takes (Options A/B/C), `PROJECT-STATUS.md`
needs consideration. If the registry is per-dev (Option B), `PROJECT-STATUS.md` probably stays
single-slot and reflects "what is the project formally working on right now" — which may or may
not match any individual dev's Active Focus in multi-dev team mode. If the registry is shared
(Option A), `PROJECT-STATUS.md` should probably show the same aggregate view.

**Status:** Not blocking. But the follow-up session should remember `PROJECT-STATUS.md` when
deciding the registry shape — they co-vary.

### H. Propagate "ARC tracks WUs, not branches" into strategy-work-organization

**Evidence:** `strategy-work-organization.md` states: **"Branch scope: One planned work unit per
branch. Switching work units implies switching branches."** This language is the old single-WU
model and is now inconsistent with the plan doc's reframe.

**The finding:** The strategy document needs language updates in concert with shift's landing.
Scope may not be "one WU per branch" anymore — under shift, branches can outlive WUs (paused WU's
branch sits) and in rare cases one branch may host multiple WUs in sequence (shift-with-archive).

**Cost:** Documentation sweep, shallow.

### I. Document worktree/`WORK-STATUS.md` sharing

**Evidence:** Git worktrees share `.arc/`. Two worktrees cannot reflect different Active Focus
simultaneously — the file is one file.

**The finding:** At minimum, document the limitation in `strategy-work-organization.md`. A
developer using worktrees for parallel WU development hits a silent inconsistency otherwise. Not
worth building tooling around; a doc note is sufficient. Applies regardless of which registry
option is chosen.

### J. Solo-dev is "not like"; team+Local is forbidden

One scenario the audit wants to confirm is handled: a developer using a same-repo install on two
machines, where one is tracked and one is Local. Under the current plan-doc design this should be
"forbidden or documented as developer's responsibility to keep consistent." The audit finds no
firm position stated in the plan doc. Should be documented explicitly (a brief policy note in the
Local mode section is sufficient).

---

## Open Design Space: Where Does Multi-WU State Live?

**This is the central pre-PRD decision.** The audit identifies three viable options. Each has
distinct tradeoffs that only become visible when scenarios are walked against them concretely. The
follow-up session should walk the scenario battery below against all three (at least) and decide.

### Option A — In Flight registry inside `WORK-STATUS.md` (plan doc's current sketch)

**Shape:** `WORK-STATUS.md` gains `## In Flight` and `## Active Focus` sections. In Flight is the
authoritative registry of WUs in `active/` and their current states. Active Focus is the single
current-attention pointer.

**Pros:**

- Single place to look.
- Tracked and visible in the repo.
- Aggregate team view is naturally available (everyone sees the same file).

**Cons:**

- Server-side merges on GitHub/GitLab/Bitbucket do not run `.gitattributes merge=ours`, which the
  current team-coordination strategy relies on for WORK-STATUS conflict avoidance. A multi-WU
  registry in a shared file silently loses entries at merge time if two branches each have
  different In Flight content.
- Conceptually moves `WORK-STATUS.md` away from "branch status" toward "repo-wide state," breaking
  the clean semantic we currently have.
- Duplicates information that git branches already carry in tracked Full (each branch's WU is
  already branch-local state).

**Known open sub-questions if this option is chosen:**

- How does the registry survive server-side merges? Per-identity partitioning? Rebuild at
  integration time? Accept the loss and document it?
- Does `PROJECT-STATUS.md`'s `Currently Active` field mirror this? How?

### Option B — `WORK-STATUS.md` stays single-slot; registry lives in `user/{identity}/`

**Shape:** `WORK-STATUS.md` retains its current semantics — it describes the WU currently active
on this branch, one slot. Multi-WU awareness lives per-developer, either:

- **(B1)** as a new section inside `SESSION-NOTES.md`
- **(B2)** as a specialized Persistent Context entry in `SESSION-NOTES.md` (paused-WU entries fit
  the Persistent Context shape — each has an explicit removal trigger: "remove when resumed or
  archived")
- **(B3)** as a dedicated sibling file like `user/{identity}/IN-FLIGHT.md`

**Pros:**

- No merge conflicts possible — the per-dev directory is single-writer by design (per
  `strategy-team-coordination.md`).
- Works identically in tracked Full, Local Full, and team mode — no mode-specific conflict
  handling.
- `WORK-STATUS.md` keeps its clean "branch status" semantics; no reframe of what it means.
- Portable for free via existing git notes machinery.
- Respects the design principle that shift is a cognitive/personal mechanism (one brain, one
  attention budget) rather than a shared-state mechanism.

**Cons:**

- Aggregate team view ("what is everyone paused on?") is not directly answerable from ARC files.
  Answer requires aggregating across developers (e.g., pulling multiple git notes, or using an
  external tracker).
- Session-init has to read a second file (small cost).
- Choice between B1/B2/B3 adds one sub-decision (where exactly in per-dev state).

**Known open sub-questions if this option is chosen:**

- B1 vs B2 vs B3 — which placement inside `user/{identity}/`?
- Is the team-aggregate view a real loss, or fine to defer to external tooling / team dashboards?
- Does session-init orientation show paused WUs when they live in per-dev state? (Almost certainly
  yes — that's the point.)

### Option C — No registry file; task list headers carry the state

**Shape:** Shift formalizes the existing `clean-work-unit` header fields (`Interrupts:`, `Paused:`,
`Paused To:`, `Spawned:`) and adds `Status: Paused` + `Paused: YYYY-MM-DD` + `Reason:` to the
paused task list's own header. No new file. Session-init discovers paused WUs by scanning
`.arc/active/` for task lists with `Status: Paused`. Per-dev personal context (why the developer
paused, what was in their head) stays in `SESSION-NOTES.md` unchanged.

**Pros:**

- Zero new shared state. Zero new per-dev state. Maximum reuse of existing machinery.
- State lives with the artifact it describes (nice locality — the task list knows its own
  status).
- Formalizes and gives a permanent home to the existing pause-pointer fields that currently live
  orphaned in `clean-work-unit.md`.
- No merge conflict surface — each task list lives in its own file.
- Works uniformly in tracked Full and Local Full.

**Cons:**

- Session-init does more file reads to discover paused state (N task lists instead of one
  registry). Trivial in practice.
- In Local Full, `.arc/active/` contains task lists for all branches (it's not branch-segregated
  since `.arc/` is untracked), so the scan finds them all — which is actually a *feature*, not a
  bug (visibility into all Local paused WUs without branch switching).
- In tracked Full, paused WUs on other branches are invisible to session-init until you switch
  branches. This may be desirable (scope info to current branch) or undesirable (lose cross-branch
  paused visibility). The answer depends on whether "cross-branch paused awareness while on
  another branch" is a real need.
- Orientation needs to aggregate info from N task list headers for its summary — slightly more
  logic than reading one registry.

**Known open sub-questions if this option is chosen:**

- Does tracked Full want cross-branch paused visibility? If yes, Option C alone may be
  insufficient and should compose with a lightweight per-dev summary (approaching Option B).
- How does the scan perform as `active/` grows? Probably fine (~10s of task lists max), but should
  be sanity-checked.
- Does Local Full want to filter the scan by "was this ever the Active Focus on the current
  branch" or just show everything? (Probably just show everything — Local Full has no branch
  segregation.)

### Current lean and honest uncertainty

The audit's current lean is **Option C, possibly composed with a small per-dev summary (part of
Option B)** — but this is a lean, not a recommendation. The scenario battery below should be walked
against all three before the follow-up session commits. Option C's artifact-first property is
philosophically consistent with the rest of ARC ("state lives where it's relevant"), and reusing
the dormant pause-pointer fields is a nice reuse. But Option B is also strong, and the tracked-Full
cross-branch visibility question is real and the audit has no decisive evidence on it.

Decision criteria the follow-up session should explicitly consider:

- **Merge safety** — does this option create merge conflicts or silent data loss?
- **Mode uniformity** — does it work the same in tracked Full, Local Full, and team mode?
- **Scope respect** — does it keep `WORK-STATUS.md`'s "branch status" semantics intact?
- **Reuse** — does it leverage existing mechanisms or invent new ones?
- **Discoverability** — can a developer (or agent) understand the state from reading files?
- **Team aggregate** — can teams answer "who is paused on what" without external tooling? (Is this
  even a need?)
- **Cognitive model** — does it match how a developer actually thinks about their in-flight work?

---

## Scenario Battery for Follow-Up Session

These are the scenarios to walk against Options A/B/C. They are ordered from baseline to edge case
so the follow-up session can stop early if an option fails a baseline. Each scenario should be
walked step by step: what files change, what does session-init show, what merges happen, what
could go wrong.

The goal is not exhaustive coverage — it is to catch option failures against realistic cases.

### Baseline scenarios

**Scenario 1 — Solo tracked Full, 2 paused WUs on 2 branches.**

Developer has activated `feature-x` on branch `feature/x`, paused it to work on `feature-y` on
branch `feature/y`, is currently active on `feature-y`. Developer runs `/arc-resume` on branch
`feature/y`.

- Option A: what does `WORK-STATUS.md` on branch `feature/y` contain? What does orientation show?
- Option B: what does session-init read? Where does "paused: feature-x" come from?
- Option C: does the session-init scan find the paused `feature-x` task list (it lives on
  `feature/x`, not visible from `feature/y` in tracked Full)?

**Scenario 2 — Solo Local Full, 2 paused WUs on 2 branches.**

Same setup, but Local mode (`.arc/` shared across branches via backing store).

- Option A: `WORK-STATUS.md` is a single file shared across branches — does it show both WUs?
  Which is Active Focus?
- Option B: per-dev registry is unaffected by Local mode — works the same as Scenario 1.
- Option C: scan finds both paused task lists in the shared `.arc/active/` — works cleanly.

**Scenario 3 — Team tracked Full, 2 devs each with 1 paused WU.**

Dev A has paused `feature-x` on branch `feature/x`. Dev B has paused `feature-y` on branch
`feature/y`. Both branches get merged to `main` (in some order) via server-side PR merge.

- Option A: what does `main`'s `WORK-STATUS.md` contain after both merges? Does the In Flight
  registry retain both entries, one, or neither? (Key test — this is the regression I flagged
  originally.)
- Option B: Dev A's registry lives in `user/a/`, Dev B's in `user/b/`. Merges don't affect either.
  Each dev's view is independent. Does anyone lose information?
- Option C: `feature-x`'s task list is now in `main`'s `active/` with `Status: Paused`. Same for
  `feature-y`. Both visible to anyone on `main`. Works cleanly.

### Coverage scenarios

**Scenario 4 — Person-to-person handoff of a paused WU.**

Dev A has `feature-x` paused. A hands off to B (vacation, rotation). What information has to move,
and by what mechanism?

- Option A: `WORK-STATUS.md` is already tracked — B sees the In Flight entry on pull. But personal
  context (why A paused, what A was thinking) is in A's `SESSION-NOTES.md`, which moves via git
  notes. So the handoff needs a combined read.
- Option B: B needs to pull A's git notes to see A's registry + SESSION-NOTES. Person-to-person
  handoff protocol from `strategy-team-coordination.md` already covers this. Works cleanly.
- Option C: the paused task list is in `active/` and visible to B on pull (tracked). Personal
  context moves via git notes. Same as baseline handoff. Works cleanly.

**Scenario 5 — Activation of a new WU while another is paused.**

Dev has `feature-x` paused. Dev runs `activate-work-unit` for `feature-y` from a plan doc in the
backlog. What updates?

- Option A: the activation workflow needs to know to add `feature-y` to the existing In Flight
  registry, not overwrite it. New concern for the activate workflow.
- Option B: activation updates `WORK-STATUS.md` single-slot for the current branch; per-dev
  registry is updated via the shift workflow separately (or activation extends to also update the
  registry). The coordination between activate and shift becomes a workflow interaction design
  point.
- Option C: activation sets the new task list's `Status: In Progress`. The paused `feature-x` task
  list is untouched. Session-init scan still finds both. Clean — no cross-workflow coordination
  needed.

**Scenario 6 — Re-clone in Local Full with paused WUs in backing store.**

Developer re-clones the repo on a new machine (or fresh clone). Local mode detection runs.
Restoration pulls `.arc/` from the backing store. The backing store contains two paused WUs.

- Option A: `WORK-STATUS.md` is in the backing store and comes back with its In Flight registry
  intact. Works.
- Option B: `user/{identity}/` is in the backing store and comes back with its registry intact.
  Works.
- Option C: task lists are in the backing store and come back with their `Status: Paused` headers
  intact. Session-init scan finds them. Works.

All three options handle this cleanly because they each store state in files that are captured by
the backing store — but the walk confirms the assumption.

### Edge-case scenarios

**Scenario 7 — Rotate (shift-to-specific-target) between two paused WUs.**

Dev has `feature-x` in progress, `feature-y` paused. Invokes `arc-shift feature-y`. Expected:
`feature-x` becomes paused, `feature-y` becomes in progress.

- Walk the transition under each option. What updates happen atomically? What happens if the
  workflow is interrupted halfway through?

**Scenario 8 — Shift back to a WU paused 3 weeks ago.**

Dev has `feature-x` paused for 21 days. Invokes `arc-shift feature-x`. Per the "observe pause age"
finding (Clarification 4), the resume should surface a staleness warning.

- Under each option: where is the pause timestamp stored? How does the resume workflow read it?
  Does the orientation or the workflow display the age warning?

**Scenario 9 — Shift while a WU is in the integration phase.**

Dev finished implementation, pushed the PR, is waiting for review. Wants to start `feature-y`.
Tests the Finding B vocabulary split: is `feature-x` "paused" or "waiting-for review"?

- Under each option: can the state distinguish the two? Does orientation show the distinction?
  Does the growth nudge apply?

**Scenario 10 — Emergency shift (if implemented).**

Production issue requires immediate attention. Dev wants to drop current WU with minimum ceremony.
Tests Finding F (hotfix = branch isolation) and open question on emergency fast-path.

- Is this shift at all, or plain git branching? If it's shift, what does the emergency variant
  skip? If it's git, what does ARC say about it?

### Optional scenarios (if time permits)

- **Scenario 11 — Stacked WU-B built on paused WU-A's branch.** Does rebasing WU-A after review
  break WU-B's state under each option?
- **Scenario 12 — Worktree with WU-A checked out while `.arc/` reflects WU-B.** How does each
  option report the mismatch?
- **Scenario 13 — Three paused WUs — WIP limit nudge fires.** Does each option support
  differentiating "paused" vs "waiting-for" so the nudge only counts the former?

---

## Out-of-Scope Findings (Follow-Up WU Candidates)

These are real gaps surfaced by the audit but should not be absorbed into the modes WU. Capturing
here so they aren't lost. Each is a candidate for a future WU or ROADMAP entry; none are blocking.

- **PRD revision mid-flight** — no formal workflow for "the PRD's premise changed during
  execution." Currently ad hoc.
- **Incidental-to-feature promotion** — when an incidental outgrows its category, no workflow.
- **WU merge / WU split** — no formal workflows. The modes WU itself just split
  (`plan-arc-modes.md` → modes + rebrand) and was handled manually without drama, suggesting ad
  hoc is fine for now.
- **WU abandonment** — explicit "pivot and don't archive" path distinct from archive-as-success.
- **Integration revert/restart** — when integration reveals the approach was wrong.
- **Task-reopen-after-review state** — a checkbox state like `[!]` for tasks that were `[x]` but
  review requires redo. External research confirms this is ad hoc industry-wide; ARC does not
  have to solve it, just needs awareness.
- **Cross-developer `ATOMIC-INBOX` visibility** — personal inboxes are invisible to teammates;
  team mode could have shared inbox semantics.
- **"Shipped but not adopted" state** — post-merge, pre-deployment tracking; probably out of
  ARC's scope entirely (closer to product tooling).
- **Cadence / sprint overlay** — ARC is cadence-neutral by design; teams that want sprints overlay
  externally. Worth documenting the "ARC is cadence-neutral" position explicitly.
- **Global-freeze / cross-WU emergency operation** — pause-everything for security advisory or
  similar, distinct from shifting one WU at a time.
- **`ROADMAP.md` / `PROJECT-STATUS.md` auto-sync** — currently hand-maintained, drifts with
  multi-WU state.

---

## Findings That Validate the Current Plan Doc Direction

Noting what works so the audit is not only surfacing problems:

- Shift cleanly handles: external API blocks, PR review latency, mid-WU design reviews, compliance
  reviews, cross-WU dependencies (via pause reasons), mid-WU info blockers. These are the
  canonical scenarios and shift covers them regardless of which registry option is chosen.
- The "ARC tracks WUs, not branches" reframe is sound and unlocks Local Full.
- The orthogonal mode composition (Lite/Full × Tracked/Local) holds under scenario testing — the
  four combinations really do compose without conflict.
- The metadata-in-place design principle (no file moves on pause) is confirmed correct — file
  churn would add friction without benefit.
- The single-active-unit invariant (one in-progress per developer) matches cognitive reality; the
  shift mechanism is the right escape hatch.
- The growth nudge at ~3 paused WUs is well-calibrated (research backs the Personal Kanban WIP
  limit guidance), though should be framed as a WIP limit explicitly (Finding E).

The plan doc is mostly on the right track. The audit's critical-path question is the registry
design space (§ Open Design Space), not a fundamental rethink.

---

## Open Questions the Follow-Up Session Should Track

Questions the audit could not resolve — flagged so they are not forgotten:

1. **Registry option choice** (A / B / C, or a composition). Resolved by walking the scenario
   battery.
2. **If Option B: placement within `user/{identity}/`** — section of `SESSION-NOTES.md`, Persistent
   Context entries, or dedicated sibling file?
3. **If Option C: tracked-Full cross-branch paused visibility** — need or nice-to-have?
4. **Staleness threshold** for the "re-read PRD on resume after long pause" prompt — 1 week?
   2 weeks? Configurable?
5. **Emergency shift variant** — is the default workflow's ceremony light enough to not need a
   fast-path, or is a variant worth the complexity?
6. **Lite atomic companion files** — kept or dropped? Determines Lite's interrupt pattern.
7. **Does `PROJECT-STATUS.md` track multi-WU or stay single-slot?** Co-varies with registry
   option.
8. **Mixed tracked/local on the same repo across machines** — forbidden policy or developer's
   responsibility?

---

## Recommended Next Steps for the Follow-Up Session

1. **Read this document in full.** It is the audit's output; the session that consumes it should
   start here, not re-run the audit.
2. **Accept the clarifications in § Clarifications That Frame This Audit as given.** Re-opening
   them wastes cycles.
3. **Walk the scenario battery (§ Scenario Battery) against Options A/B/C.** At least Scenarios
   1–6 (baseline + coverage). Scenarios 7–10 are nice-to-have if time permits.
4. **Make a decision on the registry option.** This unblocks PRD writing.
5. **Decide Finding B (paused vs. waiting-for vocabulary split)** — independent of the registry
   option, low cost, high value.
6. **Decide Finding C (reconciliation with existing pause-pointer fields)** — co-varies with
   registry option but should be explicit.
7. **Capture the remaining findings (D–J) as detail-design notes** in the plan doc's § Open
   Questions or a new § Detail Design Notes section — they do not require discussion but should
   not be lost.
8. **Pull the out-of-scope findings into the backlog or ROADMAP** as candidates for future WUs.
9. **Write the PRD.** The audit has identified enough that the PRD can be specific about shift's
   scope, vocabulary, and metadata shape.

---

## Audit Confidence Notes

- **High confidence:** the clarifications in § Clarifications That Frame This Audit; Findings B,
  C, D, E, F, H, I; the scenario battery; the validation findings.
- **Medium confidence:** Finding A (the registry question is real, but the three-option space may
  not be exhaustive — the follow-up session should consider whether a hybrid or fourth option
  exists); Finding G (the `PROJECT-STATUS.md` concern is real but not fully analyzed).
- **Working intuition, not firm:** the current lean toward Option C. This is a hunch from the
  scenario walk-through pattern, not a decision — the follow-up session should do the concrete
  walk before deciding.
- **Out-of-scope list:** first-pass, should be sanity-checked before committing anything to the
  backlog.
- **What was not audited:** the detail design of the shift workflow itself (state-driven
  branching logic, uncommitted work handling, persist step mechanics), the PRD template, and the
  Lite and Local mode sections beyond their intersections with shift. Those are addressed directly
  in the plan doc and did not need re-auditing.

---
