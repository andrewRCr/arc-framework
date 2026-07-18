# Strategy: Concurrent Work

Operational doctrine for running more than one work unit at a time. Covers when and why to parallelize, the
branch, rebase, and append-only discipline that keeps concurrent branches integrable and cross-machine-safe,
merge ordering between in-flight work units, worktree operations, managing work through awaiting-review latency,
and the conventions for shared state under concurrency.

These are **judgment-driven conventions, not enforced rules** — guidance for choosing and running concurrent
work well, applied with a light hand. They hold whenever more than one work unit is in flight, independent of
team mode and of the protection mode in use: a solo developer running two work units and a team running several
exercise the same mechanics.

**Sibling to [Team Coordination][team-coordination], not a subset of it.** The two cover orthogonal axes — team
coordination governs cross-identity collaboration (multiple people sharing the work); concurrent-work conventions
govern multi-work-unit mechanics, which apply per work unit whether the other in-flight work units are yours or a
teammate's. Both coexist and neither requires the other; the relationship is stated precisely in the dedicated
section below.

**Prerequisite:** [Work Organization Strategy][work-org] — branching model, work categories, protection modes,
and the `Integrating` state. This strategy layers concurrency conventions on that foundation.

---

## Contents

1. [Worktrees by default](#worktrees-by-default)
2. [When to parallelize, and when to serialize](#when-to-parallelize-and-when-to-serialize)
3. [Branch and rebase discipline](#branch-and-rebase-discipline)
4. [Append-only until integration](#append-only-until-integration)
5. [Merge ordering between concurrent work units](#merge-ordering-between-concurrent-work-units)
6. [Worktree operations](#worktree-operations)
7. [Async-merge: working through awaiting-review latency](#async-merge-working-through-awaiting-review-latency)
8. [The primary worktree rests on the base](#the-primary-worktree-rests-on-the-base)
9. [When to abandon parallelism](#when-to-abandon-parallelism)
10. [Anti-patterns](#anti-patterns)
11. [Relationship to team mode](#relationship-to-team-mode)
12. [The ROADMAP "Next" slice under concurrency](#the-roadmap-next-slice-under-concurrency)
13. [Shared files under concurrency](#shared-files-under-concurrency)
14. [Foreign-owned work and the all-owner gate](#foreign-owned-work-and-the-all-owner-gate)
15. [Parallelism incident playbook](#parallelism-incident-playbook)
16. [Philosophy checkpoints](#philosophy-checkpoints)

---

## Worktrees by default

Running more than one work unit at a time means keeping more than one branch checked out at a time. ARC's default
mechanism for that is the **git worktree**: each in-flight work unit gets its own working directory, its own
checked-out branch, and its own `meta-{name}.md` and SESSION-NOTES. This departs from the long-standing
solo-developer norm of one clone and one branch with `git checkout` to switch between them — deliberately, and
primarily for the sake of agent isolation rather than developer convenience.

- **Isolation is the primary justification.** When a coding agent drives the work, a single shared working
  directory is a correctness hazard: an agent mid-task on one branch cannot safely switch to another without
  disturbing uncommitted state, build artifacts, and its own orientation. A worktree gives each work unit a
  stable, private directory that no concurrent session mutates underneath it. The per-work-unit `meta-{name}.md`
  and the worktree-local, gitignored SESSION-NOTES ride that isolation — each worktree carries exactly the
  context its work unit needs, and nothing from a sibling's.

- **Frictionless parallelism is the secondary benefit.** Worktrees also make moving between in-flight work units
  cheap: no stash dance, no rebuild from a fresh checkout, no losing your place. You move between directories
  rather than between branch states. For a person steering several work units this is convenience; for the
  isolation guarantee above it is structural.

- **A fresh worktree comes up working.** Worktree creation includes provisioning, not just `git worktree add`: a
  configured post-create step (`worktree.post_create`) installs project dependencies, and registered harness
  integration directories (agent skills, hooks, allowlists — gitignored, so git alone won't carry them) are
  provisioned from the primary. A spawned worktree runs its quality gates and boots an agent session without
  hand setup — "cheap to create" includes coming up working, not just existing.

### Discovery and cleanup discipline

Worktrees are cheap to create and therefore easy to accumulate. Two habits keep them from becoming clutter:

- **Sweep as you go.** A worktree exists to host an in-flight work unit. Once that work unit ships — merged and
  archived — its worktree has no further purpose; remove it (use `git worktree remove`, never `rm -rf`). Session
  initialization surfaces worktrees whose work units have already shipped as a between-sessions nudge; act on
  that surface rather than letting stale directories pile up.

- **Know which worktree you are in.** With several worktrees live, "which worktree am I in, and which work unit
  does it host?" becomes a genuine question. Session initialization names the occupied worktree and its work
  unit in its orientation, and the per-work-unit `meta-{name}.md` is the authoritative answer. Confirm the
  directory matches the work unit you intend to touch before acting in it — especially after switching context.

### Risks to manage

Two failure modes follow directly from worktrees being cheap:

- **Worktree accumulation** — directories created freely and removed reluctantly, until the list grows past the
  point where anyone can tell which are live. The sweep discipline above, reinforced by the stale-worktree
  surface at session start, is the counter.

- **"Which worktree am I in" confusion** — acting in the wrong directory, such as committing one work unit's
  change onto another's branch. Orient on the worktree and its `meta-{name}.md` at session start and before any
  cross-cutting action; never infer the current directory from memory across a context switch.

---

## When to parallelize, and when to serialize

The default is **focused, sequential work** — one primary line of work at a time. Concurrency is a deliberate
exception to that default, taken when the gain is real and the cost is bounded; it is not a baseline operating
mode you reach for by reflex.

Frame the decision around two factors: **domain overlap** and **attention**. Concurrency pays off when work units
are clean to run side by side, and costs more than it saves when they are not — and the two things that decide
which case you are in are whether the work units touch the same surfaces (overlap) and whether each can still get
genuine review focus (attention). Reading a specific candidate's overlap against your in-flight work, and turning
that read into a concrete go / sequence / coordinate posture, is the [`assess-parallel-fit`][assess-parallel-fit]
method's job — invoked wherever a new work unit is weighed (activation, errand launch, pick-time). This strategy
frames _when and why_ to parallelize; the method carries _how_ to read a given candidate. Consult it rather than
re-deriving the call.

### What concurrency is for: harvesting the interval

Concurrency in ARC is about a _developer's_ attention, not an agent's — an agent stays scoped to the one increment
in front of it, and that discipline is what makes the interval predictable in the first place. For well-scoped,
settled work, an agent's working interval typically doesn't need you: ARC pre-shapes and scopes each turn by
design, so the common case between interlocks is genuinely free developer time. Bounded concurrency spends that
interval on another in-flight work unit, then comes back.

The free interval is a default the framework engineers toward, not a promise about every work unit. You keep the
call on when one wants your eyes between turns — and staying with it isn't the framework failing to free the
interval, it is you spending attention where it is warranted, which is the whole point.

### Posture: principled at modest scale

ARC's posture on concurrency is **principled at modest scale.** Two to three work units in flight at once is a
reasonable ceiling for one person steering the work: enough to keep a second work unit moving while the first
awaits review, few enough that each still gets genuine co-development attention at every review increment.

Heavier concurrency is **your call, not ARC's recommendation.** Nothing stops you from running more, but the trade
is real: every additional concurrent work unit thins the co-development bandwidth the methodology depends on. Past
a modest count, the per-task review loop degrades toward rubber-stamping — the very failure mode the approach
exists to prevent. Scale concurrency to the attention you can actually give it, not to the number of worktrees you
can create.

**Metered external budgets are a second scaling axis.** Attention is the first bottleneck, but concurrency also
multiplies everything that bills per run or per review — CI minutes, hosted review quotas, API allowances. Each
in-flight line re-runs its gates at every push and meters its own review cycles, so several concurrent lines can
drain a monthly budget weeks early on per-unit costs that looked reasonable alone. When weighing another
concurrent line, count the metered surfaces it will exercise alongside the attention it will take; a budget
exhausted mid-flight serializes everything behind a top-up anyway.

---

## Branch and rebase discipline

A concurrent branch drifts from its base the moment a sibling merges. Two decisions follow — _how often_ to
reconcile that drift, and _how_ — and the second is what reconciles this section with the append-only invariant
below.

**How: the mechanism depends on whether the branch is shared.** Rebasing onto the base rewrites the branch's
commits; merging the base in preserves them. Before a branch is pushed — a brief private window — rebase onto the
base freely; there's no shared history to disturb. Once it's pushed and shared (the norm here, since worktrees and
cross-machine resume share a branch early), keep it current by **merging the base in**, never by rebasing onto it —
a platform **"Update branch"** action is exactly that merge. So "periodic rebase" is a private-window tool; on a
shared branch the same job is a merge. There is no contradiction with append-only: append-only is precisely what
forbids the rewrite that rebasing a pushed branch would require, and it points you at the merge instead.

**How often: periodic vs. end-of-flight.** The default is to leave the branch alone and reconcile once at
integration — don't bring the base in unless you need to. A branch that lives **more than about two days** is the
case where you usually do: the base moves enough that one end-of-flight reconciliation gets painful, so catch up
periodically (merge the base in, or rebase while still private) to keep each integration a small, cheap delta. The
two-day mark is a guideline — a fast-moving base shortens it, a quiet one stretches it. Periodic catch-up on a
shared branch costs extra merge commits in the history, which the sanctioned cleanup at integration can squash
away.

For repeated reconciliation either way, enable **`git rerere`** (reuse recorded resolution) so a conflict resolved
once is replayed automatically the next time instead of re-litigated.

**The review consequence reinforces the mechanism rule.** A rebase changes commit identities under a reviewer
mid-review; a merge preserves them, so in-progress review stays stable. On a shared, under-review branch, that is
one more reason the mechanism is merge, not rebase.

---

## Append-only until integration

This is the one **hard invariant** in this strategy; everything else here is advisory. The behind-base detector is
the safety net that catches violations, but the convention itself is yours to hold:

> **A pushed work-unit branch is append-only from activation until integration.** While the branch is live and
> shared, only **add commits and fast-forward-push**. Never rebase, amend, or otherwise rewrite commits that have
> already been pushed.

The reason is **git-branch-safety for shared history**, not preference. Once a branch is pushed, another machine —
or another worktree, or a teammate — may have it checked out. Rewriting already-pushed history forces everyone
else into a non-fast-forward reconciliation, and can silently orphan commits that lived only on a machine still
holding the old history. Append-only keeps a pushed branch a safe, shared base. Concretely:

- **Don't bring the base in by default.** A live work-unit branch doesn't need to track `main` mid-flight; let it
  diverge and reconcile at integration.
- **If you genuinely need the base's changes mid-flight, _merge_ it in — never rebase onto it.** Merging `main`
  into the branch is ancestry-preserving and fast-forward-safe for everyone who holds it; rebasing onto `main`
  rewrites the pushed commits and breaks the invariant.
- **Integration is the single sanctioned rewrite point.** Any history cleanup — squash, reorder, final rebase —
  happens at integration, after review, when the branch stops being a shared working base and becomes a merge
  candidate.
- **Cross-machine resume is always `pull --ff-only`** (or `arc sync`). A failing fast-forward pull is the detector
  telling you the branch's history moved; stop and reconcile deliberately, never force.

Frame the branch as a **shared working history**, not as a machine's permanent state store: its job is to carry
the work unit's commits safely between machines and into review, not to be the durable home of your work. That
framing is what makes append-only obviously correct rather than an arbitrary restriction.

---

## Merge ordering between concurrent work units

When two work units are ready to integrate around the same time, the order they merge in is itself a small
coordination decision:

- **First-in-wins (the default).** Whichever work unit is ready first merges first; the second reconciles against
  the now-updated base before it merges. Simple, and right for genuinely disjoint work where order doesn't matter.
- **Explicit serialization (when order matters).** When one work unit should land before another — a shared-surface
  dependency, or a change the other builds on — say so rather than racing. A **"merge after #X"** note or label on
  the PR records the constraint where reviewers and merge tooling can see it.
- **Merge queues.** A merge queue (GitHub merge queue, Mergify, and the like) automates first-in-wins safely: it
  serializes merges and re-tests each against the updated base, so two green PRs can't combine into a broken
  `main`. Where available, it's the mechanical answer to ordering between concurrent PRs.

**Errand branches ride the same discipline.** A `chore/<slug>` errand branch is a mini-PR — small, but it
integrates through the same ordering: it waits its turn, reconciles against the base if something landed ahead of
it, and respects any "merge after #X" constraint just as a full work unit does.

---

## Worktree operations

Concurrency means several worktrees live at once; a few operational habits keep them coherent:

- **Merge from one designated worktree.** Run integrations from the primary worktree (or a dedicated merge
  worktree), not from whichever work-unit worktree you happen to be in. A single merge locus keeps updating the
  base predictable and keeps work-unit worktrees focused on their own branch.
- **Refresh the others after a merge.** When a work unit integrates and the base advances, the other live
  worktrees are now behind. Reconcile them (merge the base in, per append-only) at a clean point so they don't
  drift far. A **sync-all-worktrees** pass — fetch once, reconcile each live branch — is a good between-sessions
  habit.
- **Remove worktrees with `git worktree remove`, never `rm -rf`.** `git worktree remove` also cleans up git's
  internal bookkeeping (the administrative link under `.git/worktrees`); `rm -rf` deletes the directory but
  strands that record, which then needs a `git worktree prune` to clear. If a directory has already been deleted
  out from under git, `git worktree prune` recovers the stale reference.
- **Mind cross-worktree state after a history rewrite.** A branch is checked out in only one worktree at a time,
  but a rebase or other rewrite in one worktree changes what another sees if it tracks the same branch line. After
  any rewrite (integration cleanup, a private-window rebase), re-fetch in the other worktrees before trusting
  their view.

### Composing with external worktree tools

When an external worktree-management tool spawns and tracks worktrees, **honor its conventions** — its branch
naming, its cleanup behavior, and where it places worktree directories. Don't relocate or rename a tool-managed
worktree out from under it; that strands the tool's bookkeeping the same way `rm -rf` strands git's.

ARC's structural discipline is orthogonal to who created the worktree. The per-work-unit `meta-{name}.md`
lifecycle, the work-unit state machine, and sweep-as-you-go cleanup apply to every worktree that hosts a work
unit, however it was spawned. Let the tool own placement and naming; ARC owns the work-unit state inside it.

---

## Async-merge: working through awaiting-review latency

A work unit doesn't always merge the moment it's done. Review can take days, sometimes a week, and through that
window the work unit sits in an **`Integrating`** state — shipped from your side, not yet merged. Concurrency
makes this routine: you advance other work while one waits. Soft conventions for that window:

- **`Integrating` is a real state, not limbo.** The work unit has left active development but hasn't merged — it
  still has a branch, a PR, and a worktree, but it's no longer where your attention goes. Treat it as
  parked-awaiting-external and put your active focus on other in-flight work.
- **Handing off across the wait is normal.** A session can end with a work unit in `Integrating`; session-handoff
  records that state so the next session or machine resumes it correctly. You don't hold a session open waiting
  for review.
- **Archival and worktree cleanup wait for the merge.** Don't archive a work unit or remove its worktree while
  it's still `Integrating` — the branch and PR are live, and a reviewer may ask for changes that need the
  worktree. Both are post-merge steps; the stale-worktree sweep at session start flags only worktrees whose work
  units have actually merged.
- **Answer review feedback on the branch, append-only.** Changes a reviewer asks for land as new commits on the
  still-shared branch — append-only still holds, since the branch is still pushed — not as a rewrite. The single
  sanctioned history cleanup still waits for the actual merge.

---

## The primary worktree rests on the base

The **primary worktree** — the checkout the repository was cloned into — is not a work unit's workspace. Its
resting state is the base branch, and it serves as the **launchpad** ([Work Organization Strategy][work-org]
§ Main-on-Main Pattern): the stable reference every work-unit worktree spawns from, and the always-current
surface for work that has no branch of its own — base ceremonies, backlog grooming, inbox drains, and errand
launches.

- **Work-unit work never occupies the primary.** An in-flight work unit always gets its own worktree. Checking a
  work-unit branch out in the primary parks the launchpad on that branch for the unit's whole life and couples
  every out-of-work-unit need to its state; spawn instead — worktree creation provisions itself (§ Worktrees by
  default), so the cost is one command.
- **Out-of-work-unit work runs in the primary as a bounded excursion.** An errand or grooming pass may switch
  the primary onto its short-lived branch, do its work, and **return the primary to the base at close** — the
  primary is never parked on a branch between excursions.
- **One out-of-work-unit session at a time.** The primary is a single checkout: two sessions sharing it share
  HEAD, index, and per-checkout state. Serialize out-of-work-unit work through it — one errand, drain, or
  grooming session occupying it at a time. When it is occupied — or you want isolation — spawn a worktree for
  the errand instead of queueing on or sharing the checkout.
- **So "go to the primary" means "you're on the base."** Cutting a branch, freshening the base, or running a
  base-context ceremony starts from a clean, current base without a preliminary checkout dance — that resting
  state is what keeps every spawn cut from the right point.

Under partial protection the same shape holds with less apparatus: the base is a legitimate working surface, so
an excursion often collapses to a direct base commit. The launchpad specialization is sharpest under full
protection, where the base is never edited in place.

---

## When to abandon parallelism

Parallelism is a bet that two lines of work integrate more cheaply run together than sequenced. When the bet stops
paying off, abandon it — sunk worktrees are not a reason to keep going. Signals that the cost has overtaken the
savings:

- **Conflict-resolution time exceeds roughly 30% of the parallelism savings.** Spending a third of the time you
  saved resolving conflicts between the branches means the concurrency is near break-even and trending negative.
- **Rebase/merge count from upstream churn exceeds roughly three.** A branch that has had to absorb its base more
  than a few times mid-flight is fighting a moving target — the churn signals the surfaces are more entangled than
  the disjoint-domain assumption held.
- **Semantic drift between the branches.** The two work units have begun making incompatible assumptions — not
  textual conflicts git can flag, but divergent designs whose incompatibility only surfaces at integration.

**Recovery:** merge the further-along work unit, abandon the other's branch, and redo it as a single unified work
unit on top of the merged result. One coherent work unit is cheaper than two that keep colliding. The abandoned
work is not lost — its commits and reasoning stay in history and in its notes — it simply stops being a concurrent
branch and folds back into sequential work.

---

## Anti-patterns

Soft guidance, not enforced rules — judgment calls about holding concurrency well:

- **Single-threaded at any instant, time-sliced across interlocks.** Your active attention is on one work unit at
  a time — you never review two finished increments or hold two design conversations at once. Concurrency
  interleaves it at _interlock granularity_: you service whichever session sits at its interlock — review, steer or
  approve, send it on — then turn to another while that agent works. The second work unit isn't
  parked-and-ignored; it's worked in the gaps the first one leaves.
- **Harvest the interval only when the work unit doesn't need you in it.** The time to switch is after an
  interlock, into the agent's working interval — but only for work that genuinely doesn't want your attention
  between turns. Two kinds do: open derivation (novel design, planning), where the problem stays in your head
  between turns; and settled-but-high-stakes work (a subtle algorithm, a wide blast radius, a security- or
  infrastructure-critical surface), where an unobserved misstep costs too much. For the derivation half this is
  the `assess-parallel-fit` method's design-load read — settled execution time-slices, open derivation doesn't;
  the stakes half is your call, case by case.
- **Avoid same-domain concurrents.** Two work units in the same area of the codebase don't just risk merge
  conflicts — they create attention-residue, where context from one bleeds into review of the other and dulls the
  judgment each needs. Prefer concurrents that are cleanly disjoint, so switching between them is a clean context
  swap rather than a blurred one.

### Calibrating against agentic worktree tools

A growing class of tools spins up many agent sessions across many worktrees at once, optimizing for _many
simultaneous lines, fast spawn, and lighter per-unit review_. That is the **opposite posture** to ARC's
fewer-deeper-reviewed default, and the two do not silently merge: one optimizes throughput across many shallow
lines, the other optimizes judgment on a few deep ones.

Neither is wrong, but they pull in different directions, so pick which frame dominates **consciously, per
session** — don't let a tool's defaults quietly set your concurrency level. ARC's structural discipline
(per-work-unit state, the review increment, sweep-as-you-go) holds regardless of how a worktree was spawned; what
shifts under the high-concurrency frame is how much co-development attention each work unit receives, and that is
exactly the trade to make deliberately.

---

## Relationship to team mode

Running several work units at once does **not** require team mode, and the two are easy to conflate. They are
**orthogonal axes**:

- **Team mode governs cross-identity coordination** — multiple people sharing the work, with the ownership and
  handoff conventions in [Team Coordination][team-coordination]. It answers "how do several people collaborate?"
- **Concurrent-work conventions govern multi-work-unit mechanics** — the rebase, append-only, merge-ordering, and
  worktree discipline in this strategy. They answer "how do several work units stay integrable at once?"

They compose freely, and neither implies the other: a solo developer runs three concurrent work units with no team
mode at all, and a two-person team can work strictly one work unit at a time. Enable team mode when _people_ need
to coordinate — not when you want to run more than one work unit.

**Each work unit has a single owner**, regardless of team size. The unit of ownership is the work unit, so the
concurrent-work mechanics apply per work unit whether the other in-flight work units are yours or a teammate's.
That single-owner framing is what makes the overlap read tractable: an overlap is either with your own other work
unit (reorder it freely) or with someone else's (coordinate with them) — see
[`assess-parallel-fit`][assess-parallel-fit].

---

## The ROADMAP "Next" slice under concurrency

When you pick the next work to run alongside what's in flight, read the candidates for concurrency-safety — but
read them **by hand, on contact, and conservatively.** This is a convention, not a computed field.

ROADMAP is a _derived_ artifact: it isn't hand-maintained, and it carries no "safe to parallelize" column. There
is good reason not to add one — meta files don't declare which files a work unit will touch, and a predicted
file-scope isn't the actual one, so a computed safety flag would be false precision. The real safety net is the
behind-base check at integration, not a pre-emptive prediction. So the pick-time read stays deliberately coarse:
prefer disjoint-domain candidates, don't stack two that touch the same surface, and sequence rather than stack
when in doubt. [`assess-parallel-fit`][assess-parallel-fit] carries the actual rubric for that read.

If you want a curated view of what's safe to parallelize, keep it as a **separate sibling artifact** — never bake
it into the derived ROADMAP, which stays hand-maintenance-free.

---

## Shared files under concurrency

Some files are shared across work units and written from more than one branch. They split into two kinds with
different answers:

- **Derived shared state — solvable in git.** A file _regenerated_ from authoritative inputs (ROADMAP, from
  work-unit metadata) needs no manual merge: regenerate it deterministically at a **single serialization point** —
  post-merge on the integration branch, never hand-edited on feature branches. Two work units that both "change"
  it on their branches don't conflict, because neither hand-edits it; the merge to the base regenerates it once.
  [Work Organization Strategy][work-org] owns the regeneration model.
- **Mutated shared state — serialize it; the residual exposure is narrow and known.** A file _edited in place_
  by people — inbox drains, human-curated ordering, cross-work-unit personal notes — has no deterministic
  regeneration, so concurrent edits genuinely contend. The entry-merged personal surfaces converge cleanly when
  concurrent sessions touch _different_ entries, removals included. The known limitation is the **same entry
  edited — or removed — concurrently from two checkouts**: resolution takes the most recent write, so one edit
  can silently lose, and a removal pushed from a stale copy can resurrect the entry it removed. The exposure is
  narrow and the state recoverable (personal notes keep a pre-load backup); the operative discipline prevents it
  structurally: **pull before writing, and serialize entry-level edits through one drain locus** — the primary
  (§ The primary worktree rests on the base) — rather than editing the same entry from parallel worktrees.

**Cohort files ride a partition.** A `cohort-{name}.md` shared by sibling work units stays conflict-free through
**per-member partition** — each member writes its own section — backed by the behind-base check as the net.
Partition is the first line; if a write genuinely needs to touch shared cohort state, handle it as a small errand
from the primary worktree rather than racing it from a feature branch. [Work Organization Strategy][work-org] owns
the cohort model; this is only how it behaves under concurrent writes.

---

## Foreign-owned work and the all-owner gate

When work surfaces that belongs to a _different_ owner's work unit, you don't silently fold it into yours. ARC
already gates this at the **file level** — writing into another owner's artifact is surfaced for coordination
rather than done unilaterally. Under concurrency that gate extends to the **entry level**: re-homing a
foreign-owned atomic item — moving an inbox entry that belongs to someone else's work unit — passes through the
same all-owner gate.

The rule is identical at both granularities: **reorder and re-home your own work freely; foreign-owned work you
coordinate, not appropriate.** This strategy states the gate; the mechanism that _detects_ a foreign-owned write
and surfaces it is a backstop owned elsewhere — the convention here is the discipline, not the detector.

---

## Parallelism incident playbook

Symptom → diagnosis → recovery for the failure modes concurrent work actually produces. Every loud failure below
is a guardrail doing its job — the recovery is deliberate reconciliation, never force. Entries assume the
conventions above (append-only, primary-on-base, one session per checkout).

- **A fast-forward pull fails, or a push is refused as non-fast-forward.** The branch's history moved under you —
  a sibling machine holds different commits, or something rewrote pushed history. Stop; fetch and inspect. If the
  remote was legitimately rebased elsewhere and your local commits are contained in it, reset to the remote;
  otherwise reconcile by merge. Never force-push a shared branch to "win."

- **Session start (or integration) reports the branch behind the base.** Siblings integrated while you worked —
  the steady state under parallelism, and raw commit counts inflate with ceremony commits. Merge the base in at a
  clean point (required before integrating); never rebase the pushed branch onto it.

- **The merge conflicts on the derived readiness view (ROADMAP).** Two branches carried renders derived from
  different base states — a non-event, not real contention. Finish the merge, regenerate the view, and commit;
  the pre-commit regen check refuses a stale render, so a forgotten regen fails loud.

- **A commit is blocked because the readiness view "wants" a row for a work unit you never touched.** In-flight
  rows derive from remote refs, so a branch appearing (or vanishing) on the remote changes every worktree's
  expected render. Re-render against the staged tree —
  `arc status --project --staged > .arc/backlog/ROADMAP.md` — stage the result, and commit. (Known limitation.)

- **A personal-notes push is refused: the same file diverged at the same commit.** Two machines saved divergent
  notes onto the same base commit; there is no automatic union. Choose one machine, manually combine the
  contested file there, save, and force-publish that chosen result; before adopting it on another machine,
  preserve that machine's local-only content.

- **A personal-notes entry lost your edit, or a removed entry reappeared.** Concurrent same-entry edits resolve
  by recency: the newer write wins silently, and a removal pushed from a stale copy can resurrect the entry.
  Restore what was lost from the pre-load backups kept beside the user files; going forward, pull before writing
  and serialize entry edits through one drain locus (the primary).

- **An errand-record push reports a same-slug conflict.** The same errand slug was opened on two machines; the
  per-identity record ref wedges behind the collision (later record pushes queue behind it). Keep one record and
  run `arc errand close --force <slug>` on the discarded side; the next push reconciles and releases the queue.

- **Session start shows a "notes lag" line for a sibling machine.** A sibling's paired push didn't finish its
  notes leg — lag, not loss: the work is safe on its own machine. Proceed with context; let the owning machine
  re-push. Never force-push notes to clear the line.

- **Worktree removal is refused (uncommitted changes, or unmerged work).** Git is protecting state that would be
  lost. Inspect the worktree; commit, stash, or hand the work off, then remove with `git worktree remove`. Don't
  `rm -rf` — it strands git's bookkeeping (recoverable afterward with `git worktree prune`, but avoidable).

- **Teardown removed the directory your session was standing in.** Physical asymmetry, not a bug: a worktree
  cannot be deleted from within without taking the session's working directory with it — harness errors after
  that point are fallout, not damage. Run the physical teardown from the primary worktree instead; the
  stale-worktree sweep at session start catches anything left behind.

- **Two shipped work units carry the same completion sequence number.** Concurrent archives numbered against the
  same snapshot. Cosmetic only — renumber one directory in a small errand when convenient.

- **Post-compaction recovery refuses its seed (state drift).** Another session sharing the checkout overwrote
  the per-checkout seed — the refusal is the guard working. Re-orient fresh instead of forcing the recovery, and
  keep one session per checkout (spawned worktrees make that the natural state).

- **Orientation says one thing; the world changed a moment later.** Any snapshot can go stale the moment a
  concurrent session acts — bounded and self-correcting. Re-probe rather than acting on a stale premise;
  destructive operations carry their own live guards regardless.

---

## Philosophy checkpoints

Concurrent work touches three of ARC's principles directly. The doctrine is designed to stay inside them, and
where it strains one, it says so plainly.

- **P2 — Human-agent co-development.** Parallelism is **between work units, not within them.** Running a second
  work unit does not relax the per-task review stop on either one; each still closes its review increments with a
  human in the loop. The co-development loop is preserved per work unit — concurrency adds lines, it does not
  remove gates.
- **P3 — Focused, sequential execution.** P3 already permits multiple work units active on different branches;
  what it reserves is the developer's _own attention_ — one primary line at a time. Concurrent-work doctrine lives
  precisely in the space P3 carves out: parallel branches are fine, attention stays single-threaded, and worktrees
  with clean review-increment swaps are how you keep both true at once.
- **P5 — Context preservation.** Each worktree carries its own gitignored SESSION-NOTES and its own
  `meta-{name}.md`. That worktree-local context is **correct WU-scoped state, not degradation** — exactly the
  focused, recoverable context P5 asks for, kept per work unit instead of smeared across one shared workspace.

**The honest stance.** ARC will not _block_ you from running two — or ten — simultaneous sessions; nothing in the
mechanism enforces the modest-concurrency posture. But heavy concurrency can violate P2 in practice by thinning
review attention below the threshold co-development needs. That risk is documented and left as your call — not
because ARC recommends it, but because the framework states the trade honestly rather than pretending a hard limit
it does not enforce.

---

## Related Documentation

- [Team Coordination][team-coordination] — cross-identity collaboration; the orthogonal sibling to this strategy
- [Work Organization Strategy][work-org] — branching model, work categories, protection modes, archival

---

[team-coordination]: strategy-team-coordination.md
[work-org]: strategy-work-organization.md
[assess-parallel-fit]: ../../../system/methods/assess-parallel-fit.md
