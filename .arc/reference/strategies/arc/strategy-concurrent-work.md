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
