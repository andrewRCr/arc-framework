# Notes: Worktree Foundation — Cohort Transition-Shape Contract

> Internal design contract for the agile-parallelism cohort — Worktree Foundation,
> Agile WU Lifecycle (`draft-agile-wu-lifecycle.md`), Concurrent Work Conventions
> (`draft-concurrent-work-conventions.md`). Captures the Phase-2 reconciliation of the extracted
> shift design against current ARC and governs the harmonization pass across all three cohort
> drafts. Internal-dev-facing; not shipped.

## Context

Phase 1 extracted the shift lifecycle and `/arc-status` from `draft-arc-modes.md` into this WU's
draft. Phase-2 evaluation — grounded in WOR's shipped `template-meta.md` state machine,
`draft-concurrent-work-conventions.md`'s 2026-05-08 focus-role rejection, and Session-Operational
Flow's parallel-session concurrency model — found the extracted shift-_state_ machinery largely
obsolete: superseded by worktree isolation, WOR's state machine, and conventions the cohort already
settled. This contract defines the surviving shape before any draft is edited.

## Core conclusion

"Shift lifecycle" as a distinct concept dissolves. Worktree Foundation delivers **worktree
transition primitives + worktree-aware session-init**, feeding Agile WU Lifecycle's `arc start` verb
and Concurrent Work Conventions' usage conventions. The shift _state_ vocabulary (`Paused` /
`Waiting-For`) is cut — superseded by WOR's `Integrating` state and CWC's soft "parked" guidance.
`/arc-status` is cut.

## Locked decisions (2026-05-23)

1. **`/arc-status` — cut entirely.** The project-wide in-flight view is the derived ROADMAP; the
   session-scoped "where am I" view is something operators already hold. YAGNI; revisit only on
   demonstrated need.
2. **In-session worktree pivot — keep as a thin skill (provisional).** A quick-trigger, canonical /
   DRY entrypoint that points to a workflow — the `arc-handoff` / `arc-commit` pattern — making the
   behavior explicit and reliable. Likely `/arc-shift`, worktree-pivot only. Shape open to adjustment
   at spec.
3. **No standalone `arc worktree` command.** Worktree creation / removal lives inside the WU
   transition verbs (`arc start`, cold-start); cross-site consistency comes from the branch-naming
   method + location template (WF scope item 10). Reopenable on demonstrated need.
4. **Shipped-doc drift-fix rides with Worktree Foundation.** The `strategy-work-organization.md` and
   `template-meta.md` cleanups (below) are WF deliverables, executed at WF spec / implementation —
   not a separate WU, and not edited during planning.

## Unified state language

WOR's `template-meta.md` is authoritative and already folds merge-position into State
("`Integration:` folds into State as the `Integrating` value"); the pause-pointer fields are retired.
One machine governs WU state:

| State                   | Meaning                                              | Set at                          |
|-------------------------|------------------------------------------------------|---------------------------------|
| `Planning`              | Scoped, not yet activated                            | init-work-unit                  |
| `Active`                | Being worked, in a worktree                          | activate-work-unit / `arc start`|
| `Integrating`           | Work done, PR open — **this is "awaiting review"**   | integrate-work-unit             |
| `Shipped`               | Merged and archived (terminal)                       | archive ceremony                |
| `Superseded (partial)`  | Remaining work absorbed by a successor (variant)     | integrate-work-unit             |

Retired / remapped: `In Progress` → `Active`; `Complete` / `Waiting-For Review` / `Complete +
Integration: Awaiting Review` → `Integrating`; `Paused` → removed (leave the worktree; "parked" is
soft strategy-doc guidance, not a state). A WU awaiting PR review for days is simply `Integrating`.
Minor open item: reconcile `Superseded` between `template-meta.md`'s "strict 4-state" framing and
`strategy-work-organization.md`'s table.

## Surviving transition shape

| Need                                                  | Mechanism                                                | Owner                     |
|-------------------------------------------------------|----------------------------------------------------------|---------------------------|
| Spawn new WU + worktree (greenfield or graduate-stub) | `arc start <name>` over the spawn primitive              | AWL verb / WF mechanism   |
| Enter an existing or tool-made worktree               | cold-start primitive (arc-resume-style)                  | WF                        |
| Switch to an in-flight WU                             | `cd <worktree> && /arc-resume` (parallel session)        | existing                  |
| In-session pivot, preserving agent context            | thin pivot skill -> workflow; repoint session, re-orient | WF                        |
| Cold-start into nothing                               | session-init discovery (ROADMAP-driven)                  | existing                  |
| Named branch, no meta (partial init)                  | recognize, prompt to scaffold                            | WF (fold into cold-start) |

Worked example (atomic detour): `arc start <fix> --tier atomic` → own worktree → fix → PR (sits
`Integrating`) → return to the original worktree, untouched throughout. No state flips, no momentum
loss. Planning detours follow the same spawn shape (a `plan/<name>` WU); the planning entry verb is
arc-plan Conductor's eventual concern.

## User-scoped in-flight view (candidate)

A gap distinct from both ROADMAP and the cut `/arc-status`: a **user-scoped, cross-WU, persistent view
of in-flight WUs and their states** — including WUs in flight with no open session right now. ROADMAP is
project-scoped, all-owners, derived-at-merge (mid-WU stale), shared. Session tabs / GUI show _sessions_,
not _WUs_. And an agent in one worktree's session structurally cannot see the operator's other in-flight
worktrees. This view fills that.

- **Derived, never hand-edited.** Per ADR-020's split (derived shared state is conflict-free; mutated is
  not), regeneration always yields current truth — concurrent writes from parallel sessions resolve by
  "regenerate wins," and the notes-domain push reconcile (sync item 6) handles it trivially.
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

## Deadwood — cut from WF's extracted block

Cut: State Model (restates WOR's), State Lives in Task List Headers / Pure Option C, Document Status
Headers (the `Paused` / `Waiting-For` vocabulary), Workflow Shape's pause / rotate /
shift-with-activation transitions, the Integration Interaction acceptance matrix (adjudicates states
that no longer exist), Why This Lives in Its Own Cross-Cutting Section, Alignment with Work-Status
Restructure WU (archaeology), and the entire Mid-Session Orientation / `/arc-status` section.

Survives (small; folds into the transition primitives): uncommitted-work handling at a worktree
switch (commit / stash / leave), and the resume-staleness advisory (returning to a long-idle worktree
→ re-read the spec).

## Harmonization plan

**Worktree Foundation (this draft):** rescope shift-related scope items toward "worktree transition
primitives + worktree-aware session-init"; reduce the extracted block to the survivors above; drop
`/arc-status`; the pause-pointer item becomes "WOR already retired the pointer fields — nothing to
migrate to"; keep the thin pivot skill (provisional).

**Agile WU Lifecycle (`draft-agile-wu-lifecycle.md`):** fix the State enum to `Planning | Active |
Integrating | Shipped`; drop the separate `**Integration:**` field (folded into State per WOR);
replace "shift state handles interrupts" with "interrupts spin up an atomic-tier WU via `arc start
--tier atomic`."

**Concurrent Work Conventions (`draft-concurrent-work-conventions.md`):** already largely aligned
(its 2026-05-08 redesign rejected focus-roles and mapped the concepts away); reconcile `Complete +
Integration: Awaiting Review` → `Integrating`; confirm "parked = soft guidance" and "shift =
in-session escape hatch" match WF's final shape.

**Shipped framework docs (ride with WF; executed at spec / implementation):**
`strategy-work-organization.md` still advertises `Paused` / `Waiting-For` as "future arc-shift"
values — remove; reconcile its state table with `template-meta.md`'s machine (including `Superseded`).
These are adopter-facing framework files under package-project sync, so they are WF implementation
deliverables, captured here, not edited during planning.

---
