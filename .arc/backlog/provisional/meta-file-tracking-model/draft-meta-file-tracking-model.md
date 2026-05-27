# Draft: Meta-File Tracking Model

**Purpose:** Re-evaluate whether the active-phase WU meta file should be tracked in
git at all. Frame the design space (preserve / untrack / split), surface unknowns
that need resolution before PRD, and capture this as a provisional follow-up to
WOR — not a committed direction.

- **State:** Draft — captured 2026-05-18 from a design conversation during WOR
  Phase 5 → Phase 6 transition. Provisional; no PRD yet, no commitment to direction.
- **Created:** 2026-05-18
- **Origin:** Recurring observation that `chore(status): handoff` commits land each
  session with empty bodies and tautological subjects, generating per-session git
  history that carries near-zero durable signal. Surfaced when reviewing recent
  commit history before starting WOR Phase 6 — initial scope was a Phase 6 task to
  reshape handoff-commit content, then broadened to question whether the underlying
  tracked-meta-file model is the right shape to begin with.

---

## Problem / Motivation

### The friction signal

The active-phase WU meta file (`status-*.md` pre-WOR; `meta-*.md` post-WOR R58) is
tracked in git. Every session-handoff that materially advances meta-file fields fires
a dedicated `chore(status): handoff` commit per DEV-RULES.ARC § Status-file commit
shape. In practice these commits have empty bodies, a tautological `Context:`
footer, and a subject that conveys only "handoff happened."

Concrete recent example (HEAD on `technical/work-organization-reform`):

```text
chore(status): handoff

Context: status-work-organization-reform.md (handoff)
```

The staged change IS the meta-file diff, which carries the actual narrative (Last
Completed advancement, Next Task pointer, Next Action prose). But the commit
*message* surfaces none of that — readers either visit the diff or learn nothing.

Empirical posture on the WOR branch: ~1-in-5 commits is `chore(status): handoff`.
That ratio inverts in low-tempo weeks where the only commits ARE handoffs. In a
hypothetical adopter project mixing ARC ceremony with active product work, the
handoff commits interleave into application-code history.

### The structural question

A WU meta file has two distinct lives in one document today:

| Field class      | Examples                                               | Volatility     | Durable value    |
|------------------|--------------------------------------------------------|----------------|------------------|
| Session pointers | Last Completed, Next Task, Next Action, Blockers       | Per-session    | Low              |
| Governance / ID  | State, Branch, Spec, Owner, Origin, Depends On, Cohort | Per-ceremony   | Lifecycle-anchor |
| Archive content  | Release Notes Entry, Completion Notes (per R6)         | At integration | High             |

The session-pointer class generates almost all the commit noise. The governance
class transitions at lifecycle ceremonies — points where OTHER tracked changes are
already firing (branch rename at activate, PR merge at integrate, archive moves at
sweep). The archive class accumulates substantive content that genuinely needs
tracked history at the WU's close.

Current model: tracked throughout, treated uniformly. This is the simplest model
but it pays for the durable classes' tracked status by also tracking the volatile
class — generating the per-session noise as a side effect.

### Why now (or why not)

**Why consider now:** WOR Phase 6 hasn't migrated this WU's own meta file yet (Tasks
6.2.a et al. are the migration). Changing the destination state from "tracked
`meta-*.md` in flat `active/`" to "untracked `meta-*.md` in `user/{identity}/<wu-name>/`"
is cheaper to fold into Phase 6 than to retrofit post-WOR. R65/R65a already
establishes `user/{identity}/<wu-name>/` as the contributor-role personal-state
surface; extending to all roles is a smaller lift than introducing the pattern from
scratch.

**Why defer:** the friction is real but bounded. The adopter-perception argument is
unverified. WOR's PRD already ratified the tracked model; reopening R3/R6/R58
mid-flight risks compounding the WU's horizon. AI-driven coding has normalized
markdown-in-repo enough that adopter tolerance for ARC ceremony commits is likely
higher than pre-AI intuition suggests. A well-shaped subject (option α below)
probably captures the bulk of perceived improvement at a fraction of the cost.

The honest read: this is worth designing carefully, but it's a follow-up to WOR,
not a pivot from it.

---

## Alternatives

Three shapes considered. Lean toward β, but specifics are open and a hybrid path
isn't ruled out.

### Option α — Polish handoff commit content only

**Mechanism.** Keep the tracked-meta-file model. Reshape `session-handoff.md` step 3
to compose informative commit subjects and bodies from the staged meta-file diff,
per the Design CLEAN three-layer convention (subject scope = locus, subject body =
specific work, footer parenthetical = lifecycle action).

- Subject leads with action verb + em-dash + position string:
  `chore(arc): handoff — Phase 5 complete, next: Task 6.1` for phase-boundary
  transitions, `chore(arc): handoff — next: Task 5.6` for within-phase advancement,
  `chore(arc): handoff — between work units` for no active WU, etc. Position string
  derives mechanically from `Last Completed` + `Next Task` field-deltas in the
  staged diff; agent picks from a codified vocabulary.
- Body carries the structured field-delta:

  ```text
  Last Completed: 5.5 → 5.6
  Next Task: 5.6 → 6.1
  ```

  `Last Completed` and `Next Task` lines always present. `State` and `Blockers`
  lines included only when those fields change across the handoff.
- Scope = `(arc)`. Under Design CLEAN, `(arc)` is reserved for cross-cutting
  framework concerns + ARC lifecycle ceremony invocations. Filter via
  `git log --grep '^chore(arc): handoff'` (subject-side) or
  `git log --grep '(handoff)'` (footer-parenthetical-side).

**Pros.** Lowest disruption. No PRD reopen. Ships in days, not weeks. Handoff commits
become genuinely informative at git-log scan level. Hosting-UI surfaces show
field-delta in commit body. Doesn't change the meta-file lifecycle model.

**Cons.** Commit *count* unchanged — N handoff commits per WU still land. Improves
content quality, doesn't address the structural question. If the underlying model
is wrong, α is paint over the problem.

**Scope estimate.** Small (hours-days). One session-handoff workflow edit + workflow
prose codifying the subject + body templates + tests. CLI extraction of the
deterministic rendering steps is tracked separately under `plan-handoff-optimization.md`
§ Approach item 6 — α ships workflow-prose-driven; that plan ships the CLI helper.

### Option β — Untrack active-phase meta; promote to tracked at archive

**Mechanism.** Reshape the meta-file lifecycle into two phases:

- **Active phase.** Meta file lives at `user/{identity}/<wu-name>/meta-<wu-name>.md`
  (extends R65a from contributor-only to universal). Gitignored. Synced via git
  notes namespace (extends the existing `refs/notes/arc/user/{identity}` infrastructure
  that already carries SESSION-NOTES.md). Session updates do not fire commits.
  `chore(status): handoff` retires entirely; § Status-file timing rule retires from
  DEV-RULES.ARC.
- **Archive phase.** At integration ceremony, an archive-promote step composes a
  tracked archive document from the active meta file's governance fields + accumulated
  archive-phase content (Release Notes Entry, Completion Notes). Volatile session
  pointers are dropped. The promote step lands as part of the integration PR's
  commit set — one substantive tracked snapshot per WU.

**Lifecycle transitions remain visible in tracked history** because they ride along
with other ceremony commits: `Planning → Active` rides the branch-rename commit at
activate; `Active → Integrating` rides the archive-promote commit; `Integrating →
Shipped` rides the merge commit.

**Multi-maintainer coordination.** Two patterns to choose between:

1. **User-scoped notes + cross-developer pull.** Each maintainer's view of the meta
   file syncs via their own `refs/notes/arc/user/{identity}` namespace; team mode
   reconciles via `arc user pull <other-identity>`. Matches the SESSION-NOTES model
   exactly. Cost: divergence risk when two maintainers update simultaneously.
2. **WU-scoped notes namespace.** A new `refs/notes/arc/wu/<wu-name>` namespace
   shared across maintainers on the WU. Cost: new infrastructure; first-class
   shared-state mechanism (potentially valuable beyond meta files, e.g. for ATOMIC
   coordination).

**Pros.** Solves friction at the source — zero per-session commits. Solves adopter
perception (if it's a real concern) structurally rather than cosmetically. Retires
§ Status-file timing rule entirely — constitutional simplification. Cleanly extends
R65a's contributor-meta-file path convention to universal. Archive-phase content
still ships in the integration PR (the audit anchor that actually matters). Falls
naturally into the existing user-notes sync infrastructure.

**Cons.** PRD-level reshape — touches R3 (meta-file location-by-state), R6
(completion-doc consolidation), R58 (meta-file shape), R65/R65a (personal-workspace
layout). Reopens decisions WOR's PRD review-loop already ratified. Multi-maintainer
coordination needs design (choice between patterns 1 and 2 isn't free). Session-init
resolver extends to a third arm (or generalizes to one universal arm).

**Scope estimate.** Medium-large (weeks). PRD revision, workflow edits across
init/handoff/activate/integrate/archive, CLI surface for archive-promote, R65a
resolver extension, possible new notes-namespace infrastructure, migration of any
in-flight WU meta files at adoption time.

### Option γ — Two-tier split

**Mechanism.** Volatile session-pointer fields move to a new untracked file
(`user/{identity}/<wu-name>/pointers.md` or similar); governance + archive content
stays in a tracked `meta-*.md`.

**Pros.** Eliminates session-pointer commit noise without retiring the tracked
meta file entirely. Governance transitions still visible in tracked history without
needing to ride other commits.

**Cons.** Worst of both worlds: two files to maintain, two resolution paths in
session-init, conceptual fragmentation of the "WU meta" concept. The split boundary
(which fields go where?) is arbitrary and likely to drift. Loses β's constitutional
simplification benefit while paying β's resolver-complexity cost.

**Scope estimate.** Medium. Not recommended; included for completeness.

### Leaning

β. Reasons:

- Structurally cleanest — addresses the friction at its source rather than masking it.
- Builds on R65/R65a infrastructure rather than fighting it.
- Eliminates a constitutional rule (Status-file timing) rather than adding one.
- Archive-phase content (the high-durability class) gets a *better* tracked surface
  under β than today, not a worse one — one substantive snapshot per WU vs. accreted
  per-session commits.

But specifics are open. α might land first as a low-risk improvement while β is
designed; α's investment isn't wasted because β still needs handoff workflow edits
(just different ones — composing the promote-content vs. composing commit messages).

---

## Unknowns and Assumptions

Open questions that need resolution before promoting this plan to a PRD.

### Adopter perception is the load-bearing assumption

The friction signal includes both a measurable component (per-session commit count)
and an unmeasured component (whether adopters actually balk at it). The
measurable component is bounded. The perception component is hypothesized — no
adoption data exists yet to validate or refute it. If perception turns out not to
matter, α covers the substantive concern and β is over-engineering. If perception
DOES turn out to matter, β covers it structurally. The risk: building β on
unvalidated perception data.

**Mitigation.** This is exactly why the plan is provisional. Validate by getting
the WOR PR in front of any early adopter, asking whether the handoff commits read
as friction or as operational signal. If the answer is "didn't notice / fine," α
suffices.

### Multi-maintainer coordination model

User-scoped notes (each maintainer carries their own view, pulls peers' notes
as-needed) vs. WU-scoped notes (single shared view per WU). The choice has
implications beyond meta files — a WU-scoped notes namespace could carry ATOMIC
items, shared scratch state, etc. β shouldn't lock this decision; the meta-file
lifecycle should work under either pattern.

**Mitigation.** Document the choice as a PRD-time decision; sketch both with
trade-offs. Don't pre-resolve.

### Activation transition footprint

Today the `Planning → Active` State transition is a tracked commit (the meta-file
edit alone, ~1 commit). Under β, it rides along with the branch rename. Is the
rolled-up commit shape acceptable, or does the State transition deserve its own
visible commit?

**Assumption.** Acceptable to roll up. Branch rename commit body can include the
State transition in its message body. Reviewer benefit of "see the transition in
git log" is small — branch rename is itself the transition signal.

### Resolution semantics at session-init

R65a's resolver currently walks both `active/{cat}/meta-*.md` (maintainer) and
`user/{identity}/active/meta-*.md` (contributor) layouts. Under β, the maintainer
arm collapses into the contributor arm — universal `user/{identity}/<wu-name>/`.
Question: does any existing consumer (CLI, hook, workflow) need to distinguish?
If not, simplification; if yes, compat-shim needed.

**Mitigation.** Audit consumers as part of the discovery phase. Suspect the answer
is "no consumers care" but needs verification.

### Commit-at-Handoff freshness anchor

SESSION-NOTES carries `**Commit at Handoff:** {hash}` as a freshness check at
session-init. Today it points at the `chore(status): handoff` commit. Under β,
no such commit fires. The anchor re-points to the most recent substantive tracked
commit at handoff time.

**Assumption.** The anchor's purpose is to gauge tracked-state drift between
sessions. Re-pointing to "last substantive tracked commit" preserves that purpose;
it's arguably the more honest anchor (the handoff commit was a self-referential
sentinel anyway).

### Existing handoff commits in `main`'s history

Under β, do we rewrite history to remove past `chore(status): handoff` commits?
**No.** They're historical record; rewriting tracked history is a heavier
disruption than the noise they generate. β applies forward-only; existing commits
stay.

### Interaction with Worktree Foundation

Worktree Foundation introduces per-WU worktrees. β's `user/{identity}/<wu-name>/`
meta-file path naturally co-locates with the WU's worktree directory if WF chooses
that layout, or sits adjacent if WF chooses something else. β doesn't constrain
WF's layout choice; WF may inform β's resolver semantics if it lands first.

---

## Sibling / Adjacent Work Units

- **plan-handoff-optimization.md** — overlapping concern. Handoff-optimization
  targets agent-reasoning load + double-probe cost in the *existing* tracked-meta
  workflow. β subsumes much of that scope (no probe-2 needed when no commit fires;
  status-field-delta machinery becomes archive-promote machinery). If β lands first,
  handoff-optimization's scope shrinks substantially. If handoff-optimization lands
  first, its investments port forward to β with rework. Order to be determined.
  Both could converge into a single WU if scope alignment becomes clear.

- **Work Organization Reform (WOR)** — must land first. R65/R65a infrastructure is
  β's substrate; § Status-file timing rule retirement only makes sense once WOR's
  meta-file shape stabilizes. WOR also establishes the `arc user open/close`
  lifecycle that β extends to cover the universal meta file.

- **plan-arc-backend** — way downstream. Long-term path to project state living
  outside the repo entirely. β is a step toward (some) state moving out of tracked
  worktree files; arc-backend is the eventual destination for more aggressive
  removal. No immediate dependency.

- **plan-worktree-foundation** — independent but interacting. Worktree-aware meta
  paths may inform β's resolver layout. β doesn't block WF; WF may inform β.

- **plan-contributor-path** — touches R65a's path convention. Any reshape of R65a
  under β needs to preserve contributor-path workflows.

---

## Scope Estimate

**Medium-large overall** if pursuing β. Roughly 4-7 sessions of work depending on
multi-maintainer coordination depth and migration tooling needs.

- PRD revision (R3, R6, R58, R65a fold-in): ~1 session.
- DEV-RULES.ARC § Status-file timing retirement + § Commit Discipline edits: ~0.5 session.
- Workflow edits (session-init, session-handoff, activate, integrate, archive): ~1-2 sessions.
- CLI surface for archive-promote: ~1 session.
- R65a resolver universalization: ~0.5 session.
- Multi-maintainer notes-namespace decision + plumbing: ~1-2 sessions depending on choice.
- Migration of any in-flight WU meta files at adoption time: ~0.5 session.
- Tests + verification: ~1 session.

**α-only scope:** Small (hours-days). ~1 session for the workflow edits + tests.

**Sequencing.** Provisional; revisit post-WOR-ship. Before promoting to PRD: (a)
validate the adopter-perception assumption against any early-adopter feedback on
the WOR PR or subsequent releases, (b) decide whether to ship α as an interim
improvement while β is designed, (c) settle the multi-maintainer coordination
pattern as a PRD-time decision rather than a plan-time one.

---

## Coordination — ADR-022

Demoted to `provisional/` by ADR-022, which answers the *class* question — the WU meta file is a
lifecycle-fielded managed operational-state document whose structure is a code-owned record, not a template.
This WU's residual scope is the meta-specific *storage* question (active-phase tracked vs. notes-synced; the
multi-maintainer coordination model) — the β-shaped slot ADR-022 reserves but does **not** ratify. Do not
assume β lands. See `adr-022-managed-operational-state-documents.md` § Coordination.
