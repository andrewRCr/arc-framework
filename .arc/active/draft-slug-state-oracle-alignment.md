# Draft: Slug-State Oracle Alignment

- **Origin:** USER-INBOX capture drained at stub creation (2026-07-09); surfaced during `finalize-parallelism`
  Task 3.1.c observer resume — the probes' `planned/unoccupied` misreport investigation. Full mechanism and
  source anchors: `notes-finalize-parallelism.md` § Dogfood finding (2026-07-09): slug-state surfaces are
  checkout-local.
- **Purpose:** Give the slug-state query/dispatch surfaces in-flight-sibling truth, and fix the foreign-write
  advisory reading base divergence as authored overlap. Both are "the state layer reports false facts about
  what is in flight under parallelism" — the family the parallelism GA gate certifies. Lands on `main` before
  `finalize-parallelism` wave 2; FP merges it in.

---

## Problem

Two confirmed defects, one state-layer family:

### 1. Slug-state surfaces are checkout-local — blind to in-flight siblings

`arc status <slug>` and `arc start` dispatch resolve from `buildLifecycleIndex`
(`lib/work-unit/lifecycle-index.ts` / `lifecycle-query.ts`) — a pure walk of the *current checkout's* four
lifecycle directories, deliberately no git or network on the path. Under single-branch-per-WU, a sibling WU's
activation (`backlog/planned/ → active/` move + `State` flip) exists only on its own branch until merge, so
every other checkout still carries the pre-graduation stub and the local index faithfully — but falsely —
reports `planned`. `occupied` derives from the same state enum (`isOccupied`, `lifecycle-resolver.ts`), not a
`git worktree list` check, so it inherits the stale answer even though the local-sibling case is answerable
correctly via `worktree-roster.ts`.

`project-state-integrity` fixed the *view path* (`deriveInFlight` → `mergeProjectReadinessRecords`,
`lib/status/project-view.ts`) — `arc status --project` renders in-flight siblings truthfully. But its spec kept
the lifecycle index as the "shared slug→identity substrate" and the slug-query *surface* appeared in neither
its Goals nor Non-Goals; the gap fell through the seam. The oracle sees the truth; the slug query never
consults the oracle. Observed live: both wave-1 probes integration-ready, yet `arc status burn-in-probe-a`/`-b`
from FP's worktree reported `planned · Planning · occupied: false` while `arc status --project` in the same
checkout rendered both `Active`.

**Blast radius** (consumers of the checkout-local resolver, from source):

1. **Agent doctrine points at the blind surface.** DEV-RULES.ARC § Verify before assuming names
   `arc status <slug>` as *the* lifecycle resolver, and session-init's `--start` focused-recon arm resolves
   Tier-1 dependency edges through it. Any agent operating outside a WU's own worktree inherits the false facts.
2. **`arc start` dispatch — the sharp edge.** `resolveStartDispatch` (`commands/start.ts`) routes `planned` →
   **graduate**: from `main`, `arc start <live-sibling-slug>` graduates the stale stub and silently mints a
   second branch for a WU already live in a sibling worktree. The refuse arms (`planning`/`active`/
   `integrating`) cannot fire, and the foot-gun guards (`lifecycle-guards.ts`) check only the current
   checkout's `active/`. A silent double-launch recreates exactly the one-to-many branch⇄WU condition the
   `project-state-integrity` spec named as the root disease.
3. **Dep-edge reads.** `discharge-dep-edges` (satisfied at `landed ∨ integrating`) and `ready-mine`
   (deps-shipped filter) read stale for edges onto in-flight siblings — an `integrating` dep reads `planned`.
   Conservative-wrong (under-reports readiness, never over-reports); lower severity, same root.
4. **`occupied` reporting.** No code consumer beyond the query surface today, but agents read it; a
   false-negative occupancy invites exactly the double-launch in (2).

### 2. Foreign-write advisory reads divergence as authored overlap

`detectForeignArtifactOverlap` (pre-commit `check-foreign-writes`) can surface the two-dot divergence set
(`base..candidate`) where the authored three-dot overlap (`base...candidate`, merge-base) is meant — flagging
files the *other* branch has simply never seen as "also touched." Deterministically reproduced in **both**
directions: behind-base (probes lagging `main` flagged ~20 backlog drafts they never authored, 2026-07-09
cascade) and forward (FP's own-artifact commit `4c05c455` flagged FP-side files as probe overlaps). Distinct
from the 2026-07-06 phantom-meta roster misfire (fixed by `project-state-integrity`); this is the diff-base
selection in the overlap primitive itself.

## Fix shape (to settle at grooming)

- Overlay the oracle — or minimally a `worktree-roster` read covering the local-sibling case — onto the
  slug-query/dispatch consumers, while keeping `buildLifecycleIndex` itself pure (its locality is a deliberate
  `arc-backend` commitment).
- Per-consumer degradation postures differ: a status query can warn-and-degrade offline; `start` dispatch fails
  safe — refuse or confirm when the oracle is unreachable, never silently graduate.
- Correct `detectForeignArtifactOverlap`'s diff-base selection so divergence in either direction never renders
  as authored overlap; regression coverage for both observed directions.

Open questions for the brief spec: oracle vs. roster-only overlay (network cost on the query path vs. covering
only local siblings), where the overlay composes (per-consumer vs. a shared resolution layer above the index),
`occupied`'s contract (state-derived vs. roster-derived), and whether dep-edge reads (`discharge-dep-edges` /
`ready-mine`) take the same overlay or a narrower in-flight check.

## Constraints

- **Sequencing:** land on `main` **before FP wave 2** — the waves *consume* these surfaces (every wave session
  resolves lifecycle states, gates dependencies, and launches WUs through them). FP merges the fix in; wave-1
  cell 3.2.e and wave 2 verify both halves under live concurrency.
- **Launch mode:** code WU — run `--here` in the primary worktree per the standing spawned-code-WU caveat
  (wave 2 is what blesses spawned code worktrees).
- **Class:** Light — needs a brief spec (design decisions above), not an errand; no novel derivation.

---
