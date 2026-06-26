# Metadata: Stale-State Detect-and-Pull

| **State**     | **Owner** | **Branch**                         | **Class** | **Priority** |
| ------------- | --------- | ---------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/stale-state-detect-and-pull` | `Heavy`   | `P2`         |

- **Cohort:** `cross-machine-coherence`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-stale-state-detect-and-pull.md`
- **Task List:** `tasks-stale-state-detect-and-pull.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification (Phase 6 — all tasks complete)
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

ARC now detects when a session's local state has fallen behind the remote at a session boundary — a stale base
ref, orphaned local planning branches, notes/disk divergence, or lingering retired work-unit subdirs — and
offers a path to get current. `arc sync` becomes bidirectional, pulling as well as pushing.

### Added

- A base-ref staleness check at session start: when the local base branch is behind its remote, session-init
  surfaces it and offers a fast-forward, gated by the new `session.init_pull.base` config
  (`manual` / `prompt` / `always`).
- A `plan/`-orphan sweep that detects local planning branches whose upstream was deleted and offers a
  merged-safe removal.
- An inbound fast-forward leg for `arc sync`, making it bidirectional where the working tree is cleanly behind
  the remote.
- A non-gating advisory at session start when a sibling machine's notes push is known to be incomplete.

### Changed

- Retired work-unit subdir cleanup now reconciles on shipped status (read from the remote base branch) plus an
  unpushed-local-drift check, so a machine that never integrated still reconciles shipped subdirs instead of
  accumulating stale-subdir warnings. Removal stays recoverable from the pre-load backup.
- Session-start notes/disk divergence is now classified — safe auto-load, intentional retirement, or possible
  local drift — instead of collapsing to no action.

### Fixed

- Recurring "stale subdir" warnings on a machine that had not integrated a work unit already shipped on the
  remote.

## Completion Notes

Shipped the arrival/pull half of cross-machine coherence: the B-side detection cluster (base-ref staleness,
`plan/`-orphan sweep, notes/disk drift classification, retired-subdir reconcile) plus a single inbound
fast-forward pull primitive shared by session-init's base-ref freshen and a new bidirectional `arc sync` leg.
The retired-subdir reconcile's gate moved from a recency-window proxy to the authoritative pair — shipped
membership read from the `origin/<base>` `completed/` tree, plus a per-subdir unpushed-local-drift check — with
the pre-existing pre-load backup as the recovery net.

Key supersession from plan: verification surfaced that the partial-push marker's liveness predicate tested
exact-OID equality rather than reachability. That fix landed separately on `main` (#139); this branch absorbed
it via a base merge and rewired its consumer surface to the now-async predicate, so the integration diff carries
only the consumer adaptation for that piece, not the predicate change. The cohort's Caution force-gate register
remains parked — ARC exposes no marker-aware force-push surface to host it, so only the Aware advisory ships.

Review (two CodeRabbit passes) sharpened a latent contract — `computeUnsavedDirection` now returns `null` for
identical manifests rather than a spurious `missing` — corrected a non-TTY regression test a pseudo-TTY wrapper
had been masking on CI, and reconciled several doc and comment references the shipped implementation had
outpaced.

Verification: Tier 3 gates green before PR (`lint:md`, `lint:ts`, `typecheck:all`, `build`, and full `npm test`
at 3454 passing); the review-fix passes reran typecheck, lint, the e2e suite, and the full test suite.

---
