# Notes: Worktree Foundation — Cohort Transition-Shape Record

> Cohort reference for agile-parallelism — Worktree Foundation, Agile WU Lifecycle
> (`draft-agile-wu-lifecycle.md`), Concurrent Work Conventions (`draft-concurrent-work-conventions.md`).
> Phase-2 reconciliation of the extracted shift design against current ARC, now applied across all
> three drafts. The detailed model lives in those drafts; this is the cross-cohort index plus the one
> candidate not yet owned by a draft. Internal-dev-facing; not shipped.

## Reconciled model (index)

The shift _state_ machine (`Paused` / `Waiting-For`) and `/arc-status` are cut; "shift lifecycle" as a
distinct concept dissolves. What each cohort member owns:

- **Worktree Foundation** (mechanism): worktree spawn + cold-start primitives, the in-session worktree
  pivot (the surviving "shift" — thin skill, provisional, possibly `/arc-pivot`), worktree-aware
  session-init + branch-gone, cross-WU sync.
- **Agile WU Lifecycle** (verbs / lifecycle): tier model, `arc start`, the `**State:**`-machine rollout.
- **Concurrent Work Conventions** (conventions): when to parallelize, awaiting-review handling, parked
  = soft guidance.

WU state is WOR's strict 4-state machine — `Planning | Active | Integrating | Shipped` (+ `Superseded
(partial)`), authoritative in `template-meta.md`, with merge-position folded into `Integrating` (no
separate `Integration:` field). "Awaiting PR review" is simply `Integrating`. The drafts carry the
detail; this is the one-breath map.

## User-scoped in-flight view (candidate — not yet owned by a draft)

A gap distinct from both ROADMAP and the cut `/arc-status`: a **user-scoped, cross-WU, persistent view
of in-flight WUs and their states** — including WUs in flight with no open session right now. ROADMAP is
project-scoped, all-owners, derived-at-merge (mid-WU stale), shared. Session tabs / GUI show _sessions_,
not _WUs_. And an agent in one worktree's session structurally cannot see the operator's other in-flight
worktrees. This view fills that.

- **Derived, never hand-edited.** Per ADR-020's split (derived shared state is conflict-free; mutated is
  not), regeneration always yields current truth — concurrent writes from parallel sessions resolve by
  "regenerate wins," and the notes-domain push reconcile (WF sync item 6) handles it trivially.
- **A user-scoped mode of the roadmap renderer, not a second generator.** Essentially ROADMAP's In-Flight
  rows filtered to `Owner = me`. The renderer belongs to the `roadmap-tooling` WU; this is another view from
  it. Cross-cohort touchpoint — `roadmap-tooling` sits outside agile-parallelism.
- **Lives in the user/ domain**, alongside USER-INBOX / WORKING-MEMORY (cross-WU class, synced via user
  notes). Name TBD (DASHBOARD / IN-FLIGHT / WORKLIST).
- **"Always up to date" = regenerated at every orient and shift** (plus state-change ceremonies, like
  ROADMAP) — current whenever consulted, not real-time-reactive to a sibling live session. Gives the thin
  pivot skill a concrete second job: pivot = repoint session + re-orient + trigger regenerate.
- **Ownership split:** render = `roadmap-tooling`; user-domain placement + orient/shift regeneration hooks =
  WF; the motivating value (agent cross-WU awareness, tracking WUs-without-sessions) is why it earns a
  persisted artifact over an on-demand query.
- **Open questions (spec):** machine-independent WU-state core (syncs in user/) vs. machine-local
  worktree-path overlay (`.internal/`, never synced); exact regeneration triggers; name; persisted file vs.
  on-demand render.

## Pending cross-cohort follow-ons

- **Shipped-doc drift-fix** (rides with WF execution, per WF Scope Estimate): `strategy-work-organization.md`
  still advertises `Paused` / `Waiting-For` as "future arc-shift" — remove; reconcile its state table with
  `template-meta.md` (including `Superseded`). Adopter-facing framework files under package-project sync, so
  implementation-phase, not planning.
- **arc-modes re-scope** (queued on its meta `**Next Action:**`): Lite cut, post-WOR de-stale, local-mode
  rename.
- **AWL generic artifact-model prefix mentions** (`plan-*` / PRD in the tier-model body): left during the
  WOR-terminology sweep — entangled with AWL's tier ↔ spec-form coupling, deferred to arc-plan Conductor.

## Archival note

This record is cohort-scoped but sits in WF's `active/` as a WF companion. When WF integrates it should
**not** simply archive with WF — that would orphan the AWL / CWC references and the dashboard candidate
while those WUs are still in flight. Relocate the surviving content (dashboard candidate + index) to the
agile-parallelism group-dir or the surviving siblings at WF integration.

---
