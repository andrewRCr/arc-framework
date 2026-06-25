# Metadata: Out-of-WU Session Entry

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Light`   | `P2`         |

- **Cohort:** `agile-parallelism`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-out-of-wu-entry.md`
- **Task List:** `tasks-out-of-wu-entry.md`

- **Current Workflow:** [none]
- **Last Completed:** All tasks (Phases 1–4) — verified: Tier 3 gates + 11/11 success criteria
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/134>
- **Completed:** 2026-06-24

---

## Release Notes Entry

`arc-session` now accepts explicit out-of-work-unit entry signals — start an errand, drain the inbox, or groom a
backlog item — from any session, whether or not a work unit is active, and runs them without disturbing the
active work unit's checkout.

### Added

- `--housekeep` and `--plan <stub>` session-entry signals alongside `--errand`: drain the user inbox, or groom a
  backlog item's draft in place, directly at session start.
- Bare `--errand` (no argument) is supported — the session elicits the concern, or adopts a flagged inbox capture.

### Changed

- An explicit out-of-work-unit signal now routes regardless of whether a work unit is active; the active work
  unit's branch is preserved while the signal runs against its own context.

### Fixed

- An `--errand` signal raised while a work unit was active was previously discarded; it now routes correctly.

## Completion Notes

out-of-wu-entry realigns `session-init`'s entry dispatch around a single arm-orthogonal signal leaf: an explicit
`--errand` / `--housekeep` / `--plan` signal is resolved before the resume / orient / cold-start arms, outranks
them on any arm, preserves the active work unit's checkout, and routes to the signal's locus. The design intent
was to close a latent contradiction in shipped doctrine — the concurrent-work conventions already assume mid-work-
unit errand and housekeep entry works, while the plumbing honored it only with no active work unit.

All three signals reduce to one spine — parse → displacement guard → relocate via `resolveWriteContext` → load
universal context only → run locus — so relocation (protection-mode-shaped, worktree-shape-agnostic) is shared,
not re-implemented per signal. `--plan` grooms a backlog stub's draft in place with no lifecycle transition,
backed by a minimal backlog-stub resolver (slug → stub dir / state-dir / draft path) that also replaces the
draft-presence check's directory globbing; `draft-design` gained an entry-gate-skip and a groom-and-stop exit for
that locus. The `arc-session` skill and the cohort doc were realigned to match.

The original cohort known-gap was under-scoped to the no-originating-session case; the dual it missed — explicit
out-of-work-unit intent raised while a work unit is active — is what this work unit took and generalized into the
arm-orthogonal leaf. The linked-worktree `--errand` criterion was reconciled via an inserted task that let the
signal leaf own `--errand` on every arm. Forward-compat seams (composable-workflows' fragment composition, the
shared-inbox scope parameter, the grooming-branch bare-landing recovery) are routed to the inbox, not built here.

Review sharpened two points: the signal-leaf sync semantics were corrected to keep notes sync on every signal
path while skipping only the worktree pull (the loci consume USER-INBOX / WORKING-MEMORY, which must be fresh),
and the backlog-stub resolver now rejects an ambiguous slug rather than resolving it by filesystem traversal
order. Verification: Tier 3 gates plus 11/11 success criteria, CodeRabbit clean after one fix pass, green CI.
