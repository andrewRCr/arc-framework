# Cohort: Agile Parallelism

> Cohort-level design record for the agile-parallelism cohort — Worktree Foundation (active),
> Agile WU Lifecycle (`draft-agile-wu-lifecycle.md`), Concurrent Work Conventions
> (`draft-concurrent-work-conventions.md`). Internal-dev-facing; not shipped. The detailed designs live
> in each member's draft; this record holds what the cohort owns *as a whole* — the shared thesis, the
> boundary map, cross-member contracts, the cross-cutting design spine, and candidates not yet owned by
> any member.

## Why this doc exists (the cohort-doc convention)

A cohort is sometimes just a browsing bucket — WUs grouped by domain for backlog legibility, members
otherwise independent. Sometimes it is *parts of a whole*: members serve one goal and must coordinate
and cross-reference. Agile-parallelism is the latter. For that kind, an optional `cohort-{name}.md` at
the cohort root carries the shared content no single member owns. **Its presence is the signal** that a
cohort coordinates — no separate type flag is needed. It lives at cohort root, stays stable across
member activation / integration churn, and archives when the last member ships. (Convention to be
codified in Concurrent Work Conventions and file-classification at their PRDs; captured here as the
first instance.)

## Cohort thesis

Make concurrent, isolated, cheap-to-shift work real. [ADR-019][adr-019] (Work Unit Lifecycle Reform)
laid the single-branch-per-WU substrate; this cohort builds the parallelism on top of it.

## Membership and ownership map

- **Worktree Foundation** (active — mechanism): worktree spawn + cold-start primitives, the in-session
  worktree pivot (the surviving "shift" — thin, provisional), worktree-aware session-init + branch-gone
  handling, cross-WU sync, and the Change-class branch / oracle hooks (below).
- **Agile WU Lifecycle** (verbs / lifecycle): tier model (atomic / quick / standard), `arc start`, the
  `**State:**`-machine rollout, and tier-model reconciliation to the Change/WU split.
- **Concurrent Work Conventions** (conventions): when to parallelize, awaiting-review handling, parked =
  soft guidance, and the Change-class doctrine + gates (below).

Cross-cohort touchpoint: **roadmap-tooling** (outside the cohort) owns the renderer that both ROADMAP
and the in-flight view (below) derive from.

## Shared contract — WU state machine

WU state is WOR's strict 4-state machine — `Planning | Active | Integrating | Shipped` (+ `Superseded
(partial)`), authoritative in `template-meta.md`, with merge-position folded into `Integrating` (no
separate `Integration:` field). "Awaiting PR review" is simply `Integrating`.

## Cross-cutting design spine — the Change work class

The cohort's central cross-cutting decision is the **Change work class** — see [ADR-021][adr-021] for
the taxonomy (Change vs. Work Unit, the 1:1 relaxation, the threshold, atomic-as-character extended).
ADR-021 decides the taxonomy; the operational plumbing is owned across the cohort:

**Worktree Foundation owns:**

- The cheap ephemeral-branch mechanism that makes a Change affordable under full / host-protected `main`.
- The **concurrency oracle** hook: in-flight detection from remote refs + open PRs, parsed
  path / content-based (not branch-name → WU, since a Change branch maps to no WU). Closes the in-flight
  blind spot via `init-work-unit`'s existing branch-push step. The branch *prefix* (`plan/` vs a type
  prefix) is a free state-proxy: `plan/` = live-mutating planning; type-prefix = activated, plan frozen.
- The in-flight view's user-domain placement + orient / pivot regeneration hooks (render is
  roadmap-tooling's; see candidate below).

**Concurrent Work Conventions owns:**

- **Isolation doctrine.** Actionable cross-cutting work is done once, in its real place — off the member
  branch, reaching `main` independently. Capture surfaces (USER-INBOX) are for *not-yet-actionable*
  pointers only; stub-ready or non-trivial work goes to its real home directly. Create = WU (a tracked
  deliverable); maintain = Change.
- **Concurrency gate.** Edit a foreign artifact directly only when its WU is not in flight. Editing your
  own WUs' artifacts uses the user-scoped in-flight view; a foreign WU that is in flight is coordinated,
  never blind-edited. The oracle is all-owner (refs + open PRs); a policy layer keeps the common path
  (your own work) on the cheap user-scoped check.
- **Lighter merge gate.** Path-graded: planning / backlog grooming auto-merges; constitutional docs
  (rules, ADRs, strategies) stay reviewed. Implemented via a conditional "merge-ok" status job (not CI
  `paths-ignore`, which leaves required jobs Pending and blocks branch protection). CODEOWNERS does the
  path-scoped review-requirement and notification; native auto-merge suffices (path-graded, not
  author-graded). Optional phase-2: generate CODEOWNERS from the `**Owner:**` field so ownership
  presence selects the lane and a sibling owner is auto-notified / required on edits to their in-flight
  planning — turning the coordination convention into a host-enforced gate. Keep CODEOWNERS a hard gate
  under auto-merge; require the most-recent push be approved by a non-pusher.
- **Dependent-WU ordering.** Adopt "stacked PR / dependent PR" vocabulary for sequencing cohort siblings
  that depend on each other; evaluate the full stacked-PR workflow (rebase discipline, tooling) against
  ARC's independent-merge model at the PRD — vocabulary now, workflow TBD.

**Agile WU Lifecycle owns:** tier-model reconciliation to Change/WU + atomic-as-character (whether the
*atomic-tier* name survives in the tier set).

Cross-cohort follow-on — **arc-plan-conductor** (outside the cohort): reconcile its spec-graduation
cleanup ceremony (drop a WU's *own* planning-noise commits before the Planning → Active flip) with the
lighter-gate / planning-layer merge treatment here. Related but distinct — the cleanup is intra-WU
history hygiene; the lighter gate is cross-WU merge routing.

## Candidate — user-scoped in-flight view (not yet owned by a member draft)

A gap distinct from both ROADMAP and the cut `/arc-status`: a **user-scoped, cross-WU, persistent view
of in-flight WUs and their states** — including WUs in flight with no open session right now. ROADMAP is
project-scoped, all-owners, derived-at-merge (mid-WU stale), shared. Session tabs / GUI show *sessions*,
not *WUs*. An agent in one worktree's session structurally cannot see the operator's other in-flight
worktrees. This view fills that — and it is now also the **concrete consumer of the concurrency gate**:
the all-owner, on-demand variant (sourced from refs + open PRs, since `main`-derived state is blind to
unmerged work) is the gate's safety oracle, while the `Owner = me` filter is the operator's
work-awareness view.

- **Derived, never hand-edited** (per [ADR-020][adr-020]'s derived / mutated split): regeneration always yields
  current truth; concurrent writes resolve by "regenerate wins."
- **A user-scoped mode of the roadmap renderer, not a second generator** — ROADMAP's in-flight rows
  filtered to `Owner = me`. The renderer belongs to `roadmap-tooling`; this is another view from it. Its
  in-flight detection must source from refs / open PRs, not `main` meta files (`main` cannot see unmerged
  work).
- **Lives in the user/ domain**, alongside USER-INBOX / WORKING-MEMORY (cross-WU class, synced via user
  notes). Name TBD (DASHBOARD / IN-FLIGHT / WORKLIST).
- **"Always up to date" = regenerated at every orient and pivot** (plus state-change ceremonies, like
  ROADMAP) — current whenever consulted, not real-time-reactive to a sibling live session.
- **Ownership split:** render = `roadmap-tooling`; user-domain placement + orient / pivot regen hooks =
  WF; the motivating value (agent cross-WU awareness; the concurrency-gate oracle) is why it earns a
  persisted artifact over an on-demand query.
- **Open questions (spec):** machine-independent WU-state core (syncs in user/) vs. machine-local
  worktree-path overlay (`.internal/`, never synced); exact regeneration triggers; name; persisted file
  vs. on-demand render.

## Pending cross-cohort follow-ons

- **Shipped-doc drift-fix** (rides with WF execution, WF draft Scope Estimate phase 7):
  `strategy-work-organization.md` still advertises `Paused` / `Waiting-For` as "future arc-shift" —
  remove; reconcile its state table with `template-meta.md` (including `Superseded`).
- **arc-modes re-scope** (queued on its own meta `**Next Action:**`): Lite cut, post-WOR de-stale,
  local-mode rename.
- **AWL generic artifact-model prefix mentions** (`plan-*` / PRD in the tier-model body): left during the
  WOR-terminology sweep — entangled with AWL's tier ↔ spec-form coupling, deferred to arc-plan Conductor.

---

[adr-019]: ../../../reference/adr/adr-019-work-unit-lifecycle-reform.md
[adr-020]: ../../../reference/adr/adr-020-adopt-principle-anchored-scalable-core.md
[adr-021]: ../../../reference/adr/adr-021-introduce-change-work-class.md
