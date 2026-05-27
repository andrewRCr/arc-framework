# Cohort: Agile Parallelism

> Cohort-level design record for the agile-parallelism cohort — Worktree Foundation (active),
> In-Flight Awareness (`draft-in-flight-awareness.md`), Agile WU Lifecycle
> (`draft-agile-wu-lifecycle.md`), Concurrent Work Conventions
> (`draft-concurrent-work-conventions.md`), Errand Enablement (`draft-errand-enablement.md`).
> Internal-dev-facing; not shipped. The detailed designs live
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

- **Worktree Foundation** (active — worktree mechanics): the WU entry primitives (spawn / cold-start) and
  the `arc-session` skill, the in-session worktree shift (`arc-shift` — thin; narrowed to cross-worktree
  investigation), worktree-aware session-init + branch-gone handling, cross-WU sync, and the Errand-class
  cheap-branch mechanism.
- **Errand Enablement** (the Errand floor): the `errand-launch` entry primitive, the Errand decision matrix,
  and the advisory foreign-artifact gate — the minimum to make the Errand class usable. Sequences Worktree
  Foundation → Errand Enablement → In-Flight Awareness. Carved from AWL / CWC 2026-05-25.
- **In-Flight Awareness** (awareness layer): the in-flight-detection oracle, the user-scoped `STATUS.USER`
  view + file / standard (below), the per-WU `Priority` field, materialize (the 4th entry-point quadrant),
  and the oracle-backed activation-time concurrency check. Split from Worktree Foundation 2026-05-24;
  depends on it.
- **Agile WU Lifecycle** (verbs / lifecycle): tier model (atomic / quick / standard), `arc start`, the
  `**State:**`-machine rollout, and tier-model reconciliation to the Errand/WU split.
- **Concurrent Work Conventions** (conventions): when to parallelize, awaiting-review handling, parked =
  soft guidance, and the Errand-class doctrine + gates (below).

Cross-cohort touchpoint: **roadmap-tooling** (outside the cohort) owns the renderer that both ROADMAP
and the in-flight view (below) derive from.

## Shared contract — WU state machine

WU state is WOR's strict 4-state machine — `Planning | Active | Integrating | Shipped` (+ `Superseded
(partial)`), defined by the meta record's schema (per ADR-022 — `template-meta.md` is its render skeleton),
with merge-position folded into `Integrating` (no separate `Integration:` field). "Awaiting PR review" is
simply `Integrating`.

## Shared contract — cross-WU personal-notes sync

Worktree Foundation's cross-WU sync (Item D of its PRD) is the substrate the cohort's personal-context flow
rides on. Three contracts the members depend on:

- **Per-WU isolation + cross-WU convergence.** SESSION-NOTES is per-WU (under `<wu-name>/`), restored only for
  the WU whose worktree you occupy. WORKING-MEMORY and USER-INBOX are cross-WU (flat at the identity root),
  merged across notes by per-file entry list-union with deletion tombstones — so parallel-worktree writers
  *converge* instead of clobbering. This is the personal-notes answer to Concurrent Work Conventions'
  mutated-shared-state problem ([ADR-020][adr-020]'s derived-vs-mutated split): git line-merge can't converge
  hand-edited entries, the notes-ref entry-merge can.
- **No-resolvable-WU → per-WU no-op.** An Errand session runs in the **main worktree on a non-WU branch with
  no meta file** ([ADR-021][adr-021]: an Errand branch maps to no WU). `arc user load` there must no-op the
  per-WU restore — never import the prior WU's SESSION-NOTES — while cross-WU files still load. Errand
  Enablement depends on this; it is a required contract, not a fresh-spawn nicety (the same path also covers a
  load on `main` and a fresh spawn).
- **`arc user pull` encapsulates the load.** The per-WU-note + cross-WU-merge two-read model lives behind
  `arc user pull` / `runUserLoad`, so In-Flight Awareness's **materialize** (`git worktree add` →
  `arc user pull` → orient) calls it as one black box and inherits the per-WU isolation for free.

## Path taxonomy — entry and in-session

Two cross-member decision surfaces: the **entry model** (how you get into a worktree / WU) and the
**in-session fork** (a need surfaces mid-session — which path?). `arc-shift`'s niche is stated narrowly on
purpose; discovered side work is errand-launch's, not shift's.

### Entry model — local worktree? × WU exists?

| | WU exists (branch + meta) | WU is new (nothing yet) |
| --- | --- | --- |
| Local worktree exists | resume (`arc-session`) | cold-start (scaffold meta in place) |
| No local worktree | materialize (In-Flight Awareness) | spawn (create worktree + scaffold) |

### In-session fork — a need surfaces while working a WU

| Need | Path | Owner |
| --- | --- | --- |
| Work that is this WU's own concern | continue / inline commit | (no verb) |
| Standalone side-task, self-contained (maintain) | errand-launch -> main worktree | Errand Enablement |
| Standalone side-task on a foreign artifact, owning WU not in flight | errand-launch | Errand Enablement |
| Standalone side-task on a foreign artifact, owning WU in flight | errand-launch + advisory gate (coordinate) | Errand Enablement |
| A new tracked unit of future work (create) | spawn a WU | Worktree Foundation |
| Pick up a WU in flight only on another machine | materialize | In-Flight Awareness |
| Operate briefly in another in-flight worktree's runnable environment, carrying live context, intending to return | arc-shift | Worktree Foundation |

**`arc-shift` is the narrow exception, not the general detour tool.** Its only irreducible use is interactive
cross-worktree *investigation* — running another worktree's environment while reasoning with the current
session's live, expensive-to-reconstruct context. Discovered side work goes to errand-launch; a discrete
question about another worktree is answered by reading its files (worktrees are directories) or seeding an
exploration session — neither needs a context-merging shift.

## Cross-cutting design spine — the Errand work class

The cohort's central cross-cutting decision is the **Errand work class** — see [ADR-021][adr-021] for
the taxonomy (Errand vs. Work Unit, the 1:1 relaxation, the threshold, atomic-as-character extended).
ADR-021 decides the taxonomy; the operational plumbing is owned across the cohort:

**Worktree Foundation owns:**

- The cheap ephemeral-branch mechanism that makes an Errand affordable under full / host-protected `main`
  (mechanism only — launch ergonomics are Errand Enablement's).

**Errand Enablement owns (the floor):**

- The `errand-launch` entry primitive (seed-and-continue from the main worktree), the **Errand decision
  matrix** (create/maintain × self-contained/cross-cutting × owning-WU-in-flight routing), and the
  **advisory foreign-artifact gate** (extends Foundation's R11 stub). The minimum that makes the class
  *usable*, so it lands at WF+1 rather than cohort-end; sequences WF → Errand Enablement → IFA. In-Flight
  Awareness later upgrades the advisory gate (and R11) to oracle-backed. See `draft-errand-enablement.md`.

**In-Flight Awareness owns:**

- The **concurrency oracle** hook: in-flight detection from remote refs + open PRs, parsed
  path / content-based (not branch-name → WU, since an Errand branch maps to no WU). Closes the in-flight
  blind spot via `init-work-unit`'s existing branch-push step. The branch *prefix* (`plan/` vs a type
  prefix) is a free state-proxy: `plan/` = live-mutating planning; type-prefix = activated, plan frozen.
- The in-flight view's user-domain placement + orient / pivot regeneration hooks (render is
  roadmap-tooling's; see candidate below).

**Concurrent Work Conventions owns:**

- **Isolation doctrine.** Actionable cross-cutting work is done once, in its real place — off the member
  branch, reaching `main` independently. Capture surfaces (USER-INBOX) are for *not-yet-actionable*
  pointers only; stub-ready or non-trivial work goes to its real home directly. Create = WU (a tracked
  deliverable); maintain = Errand.
- **Concurrency gate** (the full all-owner doctrine; the *advisory* floor version ships with Errand
  Enablement). Edit a foreign artifact directly only when its WU is not in flight. Editing your
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

**Agile WU Lifecycle owns:** tier-model reconciliation to Errand/WU + atomic-as-character (whether the
*atomic-tier* name survives in the tier set).

Cross-cohort follow-on — **arc-plan-conductor** (outside the cohort): reconcile its spec-graduation
cleanup ceremony (drop a WU's *own* planning-noise commits before the Planning → Active flip) with the
lighter-gate / planning-layer merge treatment here. Related but distinct — the cleanup is intra-WU
history hygiene; the lighter gate is cross-WU merge routing.

## User-scoped in-flight view — oracle-derived (In-Flight Awareness builds oracle + file; roadmap-tooling renders)

A gap distinct from both ROADMAP and the cut `/arc-status`: a **user-scoped, cross-WU view of in-flight
WUs and their states** — including WUs in flight with no open session right now, and WUs checked out only
on another machine. ROADMAP is project-scoped, all-owners, derived-at-merge (mid-WU stale), shared.
Session tabs / GUI show *sessions*, not *WUs*. An agent in one worktree's session structurally cannot see
the operator's other in-flight worktrees. This view fills that — and it is also the **concrete consumer
of the concurrency gate**: the all-owner variant (sourced from refs + open PRs, since `main`-derived
state is blind to unmerged work) is the gate's safety oracle, while the `Owner = me` filter is the
operator's work-awareness view.

**Ownership (settled 2026-05-23; reassigned to In-Flight Awareness in the 2026-05-24 split).** In-Flight
Awareness builds the **oracle** — the in-flight-detection primitive (remote refs + open PRs, parsed
path / content-based; WU metas read off remote refs via `git show`, no checkout needed) — and establishes
the **view file + its strategy-doc standard** (derivation algorithm, hand-maintenance procedure, regen
triggers), so the view is usable from ship and hand-maintained in the interim exactly as ROADMAP is today.
`roadmap-tooling` later automates the render. The oracle is consumed via Worktree Foundation's
`arc-session` skill (which In-Flight Awareness extends with the materialize dispatch branch) for
cross-machine discovery and the advisory concurrency check.

- **Purely derived, never hand-edited** (per [ADR-020][adr-020]'s derived / mutated split): regenerated
  from the oracle; concurrent writes resolve by "regenerate wins." **No annotation layer** — per-WU human
  context stays in SESSION-NOTES, cross-WU context in WORKING-MEMORY; the view carries only derived state.
- **A user-scoped mode of the roadmap renderer, not a second generator** — ROADMAP's in-flight rows
  filtered to `Owner = me`, sourced from refs / open PRs (not `main` meta files — `main` can't see
  unmerged work).
- **Does not need to sync.** Because the core is derived from *remote* refs + PRs, every machine
  regenerates it identically — so it is **on-demand with an optional local cache**, not synced human
  content. This corrects the earlier "lives in user/, synced via user notes" framing: structurally it is
  a ROADMAP (a derived snapshot regenerated at boundaries), not a WORKING-MEMORY. A local cache is a
  convenience (read without a fetch + PR round-trip), not a correctness requirement. Name TBD
  (DASHBOARD / IN-FLIGHT / WORKLIST).
- **Worktree paths are not stored.** Paths are machine-local: resolve them live from `git worktree list`
  for WUs checked out here, omit them for WUs in flight elsewhere (a stored path is meaningless on another
  machine). This dissolves the synced-core-vs-machine-local-overlay question for the interim.
- **"Always up to date" = regenerated at every orient and pivot** (plus state-change ceremonies, like
  ROADMAP) — current whenever consulted, not real-time-reactive to a sibling live session.
- **Open questions (spec):** exact regeneration triggers; name; whether a persisted local cache earns its
  keep over pure on-demand render.

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
[adr-021]: ../../../reference/adr/adr-021-introduce-errand-work-class.md
