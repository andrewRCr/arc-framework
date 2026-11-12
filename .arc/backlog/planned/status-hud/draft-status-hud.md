# Draft: status-hud

- **Origin:** [internal] — split out of `arc-view` at the storage-substrate grooming (2026-07-17), when the
  verb-semantics line was drawn: `arc view` renders an existing artifact as it is; this WU owns the **status/HUD
  surfaces** — projections _about_ the work rather than documents _of_ the work.
- **Cohort:** [none]
- **Purpose:** Zero-input, cwd-resolved status surfaces for the human operator under parallelism: the **WU context
  card** (where is this WU at, at a glance) and the **live watch panel** (follow the work as it progresses).

---

## Problem / Motivation

Under worktree parallelism the operator bounces between concurrent WU contexts, and re-grounding on entry is the
recurring cost: _"I need to evaluate this agent's latest message — but where is this WU AT? What stage
(planning: create-spec? generate-tasks? impl? review?), what `Class`, what deps, what was the current task?"_
The pre-parallelism answer (an editor pinned to the relevant files) breaks under worktrees — state forks per
checkout, files reopen on every swap. The need is a terminal-native card that answers the grounding question from
nothing but cwd, plus a live panel for watching progress beside a running session.

## Deliverables (independent; each standalone)

1. **Context card** — `<verb TBD>` with no argument renders: lifecycle stage, `Class`, deps/blockers (from meta),
   current task (from the task cursor), staleness/freshness signals. **v1 derives every field from today's
   oracle/meta/cursor chain** — no new state, no new records required.
2. **Watch panel** — the live arm transferred from `arc-view`'s original positions 2–4: statusline band
   (`Phase 4/6 · Task 4.1 (subtask 2/5) · 23/61 overall`) + collapsed outline + current-task detail, re-rendered
   on file change at a reasonable debounce. **Render-only, no input handling** — the panel cap transfers as a
   settled position and is the scope line to hold.

Explicitly **not** here: project-level status/roadmap surfaces (`roadmap-tooling` owns that render surface;
non-overlap carried over from `arc-view`), and artifact viewing (`arc-view` proper).

## Settled positions (carried from the split / grooming)

- **Verb family:** status/HUD semantics, not view semantics. Whether this lands as `arc status` flags (status is
  already in play as the probe surface) or a new verb is this WU's grooming call, coordinated with
  `naming-conventions` — reconfiguring existing verb territory is acceptable as ARC matures; don't contort to
  avoid it.
- **Projection identity:** the card and panel are projections over the record/oracle layer — the same layer that
  renders markdown. Consume record queries and oracle resolution only; never parse artifacts beyond codified
  formats. This is what makes the surfaces invariant across storage tiers, and it makes this WU the visible
  payoff surface for the record migrations: every document that becomes a record (`meta`, locus, lifecycle state)
  upgrades the card for free, with no interface change.
- **Upgrade seams, not dependencies:** v1 stage/position from proxies (meta fields, task cursor, branch/worktree
  state); upgrades in place when `session-locus-model` (agent's live position) and `wu-lifecycle-state-model`
  (stage as record) land. Neither is a core dependency — the seam discipline carried from `arc-view` position 3.
- **TUI non-foreclosure (someday-maybe north star, not a plan):** panels are **composable, pure render units**
  (records in → text region out), no global-screen assumptions, input handling isolated from rendering. If the
  view/HUD pieces all ship and earn it, a TUI shell composing them is a natural someday extension — this
  principle keeps that door open at zero cost; nothing here builds toward it.

## Coordination seams

- `arc-view` — sibling work unit (artifact viewing); shares oracle resolution, checkbox parse, renderer
  infrastructure. Sequence: viewer → card → watch.
- `session-locus-model` / `wu-lifecycle-state-model` / `operational-state-docs` — record suppliers; inbound-buffer
  compose-notes routed 2026-07-17 (locus as queryable record; placement/stage as record; renderer-facing record
  queries).
- `roadmap-tooling` — project-level surface owner; the "pinned workspace as verbs" demand signal routed there.
- `cli-substrate-adoption` — non-interactive contract; the card must degrade to plain stdout when piped.
- `naming-conventions` — verb-family decision.

## Continuity

- **Readiness:** stub-shaped; planned at the `state-storage` re-cut (2026-09-28) as one of the storage program's
  follow-ons, with no edge on it: the card reads records through the oracle, so the store lands underneath it.
  `arc-view` has shipped. Open at grooming: verb naming, card field set and layout, watch-panel layout detail,
  debounce interval.
- **Sequencing:** after `arc-view` v1 ships and the record keystones (`operational-state-docs`,
  `wu-lifecycle-state-model`) are at least underway — the card gets sharply better with them, and v1-with-proxies
  should be weighed against simply waiting.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **Shape the status HUD's general and per-worktree views, and its line against the rendered status files**

- _Routed from:_ `USER-INBOX § Work Unit`, drained at the `state-storage` re-cut (2026-09-28).
- _Observation:_ The Owner's need (2026-09-25): a HUD-like overview, kept open in a pinned terminal tab and updating
  live, useful both to editor users, who do not get it from files, and to those who never open them; basic first,
  with seams toward a lightweight TUI and standalone commands. It resolves into two views, with design still to do:
  a general ARC view tied to no work unit or Errand, and a separate view that follows one worktree's context ("for
  this WU or Errand, where are we at?"), which can also be pinned in that worktree. The draft carries the card, the
  render-only watch panel and TUI non-foreclosure, but is work-unit-only and has no general view. An Errand has
  little state to report; its originating inbox record is the useful part to show.
- _Approach:_ Settle at grooming where the file versions end and the HUD begins, and which needs each serves:
  `STATUS.USER` and `STATUS.PROJECT` (rendered files; `roadmap-tooling` keeps the render standard and writers
  after the storage program shrinks it), `VECTOR.USER` and `VECTOR.PROJECT` (authored direction,
  `goal-aware-direction`), and today's `arc status` surfaces. File-as-record (decided 2026-09-25) makes the family
  parsers the record layer, so the draft's "consume record queries only" should read that way. Under the storage
  program the live views can re-render when the store's ref tips move; the history spike read every work unit's
  meta at its tip in one 17 ms batch, so they need no cache for that.
- _Captured during:_ the storage program's history-growth spike and design discussion.

---
