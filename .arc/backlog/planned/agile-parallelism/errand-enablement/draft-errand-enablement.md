# Draft: Errand Enablement

**Purpose:** Make the Errand work class ([ADR-021][adr-021]) actually *usable* — ship the `errand-launch`
entry primitive, the Errand decision matrix (the create/maintain × self-contained/cross-cutting ×
owning-WU-in-flight routing doctrine), and an advisory foreign-artifact concurrency gate. The thin "floor"
that turns Errands from a documented taxonomy into a discipline a session can reach for, without waiting on
the cohort's heavier conventions (Concurrent Work Conventions) and awareness (In-Flight Awareness) layers.

- **State:** Draft — captured 2026-05-25 during an exploratory session examining external session-handoff
  practice against ARC's parallelism model. Pre-PRD; iteration expected before promotion.
- **Created:** 2026-05-25
- **Origin:** Surfaced when an external "handoff" skill (seed-a-parallel-session context payload) prompted
  asking where ARC efficiently seeds parallel work. The examination found that ADR-021's Errand class is
  ARC's structural answer to that trigger — but the class had not yet *cascaded* through the cohort, which
  was sliced under the older "every bounded chunk is a WU (with a worktree)" assumption. Worktree Foundation
  *documents* the Errand path (R12) but ships no launch ergonomics; the launch primitive was implied to Agile
  WU Lifecycle and the doctrine/gate to Concurrent Work Conventions — both at cohort-end. So the cohort builds
  the *niche* entry verb (`arc-shift`, Foundation R13) but defers the *common* one (errand-launch) to last.
  This WU is the floor/ceiling re-slice that corrects the inversion.

---

## Problem / Motivation

Worktree Foundation makes parallel work *mechanically* safe — cross-WU sync (per-WU subdir load, entry-merge,
tombstones, concurrent-push reconcile), ownership-marker cleanup, and the advisory spawn-time concurrency stub
(R11) mean concurrent worktrees do not corrupt shared state or orphan worktrees. What Foundation does **not**
ship is the discipline and ergonomics for the Errand class it only *documents* (R12):

- **No launch primitive.** Doing an Errand mid-session is manual: know to go to the main worktree, cut a branch
  off `main`, do the work, ship, tear down — without disrupting the WU worktree you are in. High-friction and
  un-guard-railed, for what ADR-021 frames as the *common* lightweight path.
- **No decision matrix.** Nothing routes "I hit some incidental work" to {inline · errand-launch · spawn-WU},
  so the boundary between an Errand and a WU (and between an Errand and just-do-it-here) is left to ad-hoc
  per-session judgment.
- **No foreign-artifact gate.** ADR-021's second Errand motivator is *cross-cutting maintenance* — e.g. a
  dependency note on another WU's backlog stub. If that WU is **in flight**, editing its artifact is precisely
  the cross-branch-conflict case the concurrency gate exists to prevent — yet the current cohort framing
  *exempts* atomic work from the activation-time check. That is backwards: a self-contained Errand needs no
  gate; a cross-cutting one needs the strongest gate in the cohort.

**Why this is a floor, not a nicety — the forcing argument.** A branch-isolated Errand is *structurally forced*
into a separate main-worktree session. An Errand must not ride the current WU's branch (ADR-021: diff pollution
and cross-branch conflict). Committing on a branch off `main` needs a working tree on that branch; switching the
WU worktree's branch is the stash-switch disruption Foundation forbids, and an Errand takes no worktree of its
own. The only clean path is the **main worktree** — a different directory, hence a different session (an
`arc-shift` into main would re-merge contexts, the pollution being avoided). So errand-launch falls out of
R12 + ADR-021 + Foundation's no-stash-switch invariant, the same way `spawn` earned a primitive.

## Scope

### In scope — the Errand floor

1. **`errand-launch` primitive** (skill + CLI scaffolding helper). Invoked from any WU session on discovering
   Errand-class work. Classifies against the decision matrix, emits a minimal forward-pointing **seed**
   (purpose + pointers + suggested skills / quality-gate context + the cheap-branch-off-`main` setup), and
   returns the originating session to its own context — `spawn`'s "return to origin" applied to the main
   worktree. Targets **invocation-friction parity with `arc-shift`**, not single-window parity: the Errand
   runs in a *separate* main-worktree session by structural necessity (above). Operating posture is
   **seed-now, execute-at-boundary** — the seed is produced immediately (cheap, no context pollution) and the
   Errand session is serviced at the next review-increment boundary in the originating WU, preserving
   single-thread attention (P2/P7) rather than demanding simultaneous sessions.

2. **The Errand decision matrix** (doctrine — see below). The routing spine the floor hangs on; feeds the
   in-session-fork rows of the path-taxonomy table in `cohort-agile-parallelism.md`.

3. **Advisory foreign-artifact concurrency gate.** Extends Foundation's R11 spawn-time advisory stub to the
   errand-launch path: when an Errand targets an artifact owned by another WU, check (local `git worktree
   list` + identity-filtered metas) whether that WU is in flight; if so, surface "coordinate / sequence after
   it integrates" rather than proceed. Advisory, judgment-based, never a hard gate — same posture as R11.

### Out of scope — the ceiling (and its owners)

- **Full concurrency-gate doctrine + rebase/merge & async-merge integration discipline** → Concurrent Work
  Conventions. This WU ships the *advisory* gate and the *routing* matrix; CWC owns the when-to-parallelize
  rubric, the all-owner gate, and integration-time conflict handling.
- **Oracle-backed gate** → In-Flight Awareness. IFA upgrades *both* this WU's advisory gate and Foundation's
  R11 stub to the oracle-backed version in one pass — the reason this WU sequences before it.
- **Tier model, `arc start`, tier ↔ Errand reconciliation** → Agile WU Lifecycle. `arc start` and
  `errand-launch` are sibling entry verbs; AWL reconciles the tier set (atomic-as-character) to the Errand
  default this WU operationalizes.
- **Knowledge-return channel** (compressed learnings back to a waiting session) → deferred. Code/doc Errands
  return via git (merge to `main` + rebase); the rare exploration-return case is absorbed by WORKING-MEMORY.
  Revisit only on real need (Open Questions).
- **`arc-shift` re-scoping** → owned by Foundation (its R13). This WU's matrix *redirects* discovered tangents
  to errand-launch, which is what lets Foundation narrow shift to the cross-worktree-investigation niche; the
  shift edit itself stays in Foundation.

## The Errand decision matrix

| Work character | Touches | Owning WU | Path |
| --- | --- | --- | --- |
| Your current WU's own concern | your WU's own files | n/a | **Inline**: not an Errand; ordinary WU work |
| Create a tracked unit of future work (stub, deliverable) | a new owned artifact | n/a | **Spawn a WU** (small): it gets a meta + lifecycle |
| Maintain an existing artifact / standalone side-task | self-contained (your area) | n/a | **errand-launch**: main worktree, cheap branch, ship, continue |
| Maintain an existing artifact / standalone side-task | cross-cutting (foreign artifact) | not in flight | **errand-launch**: safe to edit directly |
| Maintain an existing artifact / standalone side-task | cross-cutting (foreign artifact) | in flight | **errand-launch + gate**: coordinate / sequence after integrate |

**Triviality is not an axis** (ADR-021): a consequential one-commit change is still an Errand, and a *trivial*
cross-cutting edit still needs branch isolation (errand-launch). Only a trivial edit in your *own* current-WU
area is inline. The create/maintain split is ADR-021's; the in-flight column is this WU's advisory gate.

## Design Decisions

### errand-launch is the common case `arc-shift` was groping for

The cohort's surviving in-session move was `arc-shift` — repoint into another worktree carrying live context.
Its genuinely irreducible niche is narrow (briefly operating in another worktree's *executable* environment
while reasoning with the current session's live, expensive-to-reconstruct context — cross-worktree
investigation). The *common* in-session need — "I hit some side work" — is not that; it is an Errand, and its
clean handler is errand-launch (seed → separate main-worktree session), not a context-merging shift. Foundation
narrows shift to its niche; this WU supplies the common-case verb shift was over-serving.

### Seed-now, execute-at-boundary (threads P2)

ARC is wary of simultaneous attention across sessions (P2 co-development bandwidth). errand-launch does not
demand it: the seed is emitted immediately and cheaply, and the Errand session is *serviced at the next
review-increment boundary* in the originating WU. The value is isolation (branch + context) plus near-zero
spin-up when serviced — not parallel attention. This also distinguishes it from USER-INBOX § Atomic capture,
which produces a backlog pointer drained at a ceremony; errand-launch produces an executable seed run soon in
its own bounded session.

### Advisory now, oracle later

The foreign-artifact gate ships advisory (local `git worktree list` + identity-filtered metas), matching
Foundation's R11 posture, so the floor is usable at WF+1 without the oracle. In-Flight Awareness later upgrades
this stub and R11's together — the single reason the floor sequences before IFA.

### Floor, not foundation

Deliberately thin: one primitive, one doctrine table, one advisory gate. The heavy conventions
(when-to-parallelize, integration discipline) stay in CWC; awareness stays in IFA; tiers stay in AWL. The floor
exists only to make the cohort's *intent* (cheap parallel + Errands) safely usable as early as possible.

## Dependencies and Sequencing

### Upstream

- **Worktree Foundation** (hard): the cheap-branch mechanism (R12), the R11 advisory stub this WU extends,
  cross-WU sync, and the main-on-main launchpad pattern (R31).

### Sequencing

- **After Worktree Foundation, before In-Flight Awareness.** IFA's oracle upgrade absorbs both this WU's
  advisory gate and Foundation's R11 stub in one pass; building the floor after IFA would strand the advisory
  interim. Independent of the post-WF parallel candidates (CLI Substrate Adoption ‖ arc-plan Conductor ‖ Coord
  Probe) — may run alongside them.
- The floor → IFA ordering is a **sequencing preference, not a hard dependency** — IFA can build without it. Left
  as a sequencing note rather than encoded in IFA's `Depends On`, to keep the ROADMAP readiness view accurate.
- **Concurrent Work Conventions** consumes this WU's matrix + advisory gate as the floor under its full doctrine.
- **Agile WU Lifecycle**'s `arc start` and this WU's `errand-launch` are sibling entry verbs; AWL's tier
  reconciliation builds on the Errand default this WU operationalizes.

## Open Questions

- **errand-launch shape** — skill-only vs. skill + CLI scaffolding helper. Lean: thin skill over a small
  CLI primitive (mirrors spawn / cold-start's shared-primitive shape); pin at PRD.
- **Knowledge-return channel** — genuinely needed, or do WORKING-MEMORY + git-return cover it? Lean: no bespoke
  channel; revisit on real need.
- **Gate advisory surface** — exact phrasing / heuristics of the foreign-artifact-in-flight warning; align with
  Foundation's R11 stub and CWC's eventual doctrine.
- **Matrix home** — full matrix here (WU design) with the path-taxonomy table in `cohort-agile-parallelism.md`
  summarizing the in-session fork; confirm the split at PRD.

---

[adr-021]: ../../../../reference/adr/adr-021-introduce-errand-work-class.md
