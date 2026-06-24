# Metadata: single-owner-wu-model

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-single-owner-wu-model.md`
- **Task List:** `tasks-single-owner-wu-model.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — verification complete (Phases 1–6); apparatus removal verified clean across both trees
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/132>
- **Completed:** 2026-06-24

---

## Release Notes Entry

ARC work units now follow a single-owner model: every work unit has one owner — the meta `**Owner:**` field is the
source of assignment truth — and cross-person parallelism comes from running multiple single-owner work units
rather than several developers driving one. The team-coordination guidance and the constitutional task-interlock
rule are reconciled to this model.

**Changed**

- Team-coordination guidance is reframed around single-owner work units; handoff, interlock-release coordination,
  cross-work-unit planning, and external-tracker integration remain as genuine cross-person coordination.
- Ownership is recorded at work-unit granularity via the meta `**Owner:**` field; task lists no longer carry
  per-task ownership markers.

**Removed**

- The per-task `(@name)` ownership-marker convention — removed from the strategies, the workflow templates, and
  the task-interlock rule.
- The within-work-unit multi-developer branching patterns (Shared Integration Branch, Personal Sub-Branches,
  Stacked PRs per Developer, Direct Shared Branch).
- The team-mode `(@name)` pre-commit check and its hooks-README documentation.

**Breaking Changes**

- Projects that placed `(@name)` ownership markers in task lists should drop them — ownership is now carried by
  the work unit's `**Owner:**` field, and the pre-commit hook no longer checks for per-task markers.

## Completion Notes

Reconciled ARC's constitutional docs to the single-owner work-unit model that `strategy-concurrent-work.md`
already operated on but the lagging docs still contradicted. The contradiction was concrete, not cosmetic: the
concurrency doctrine asserted one owner per WU while `strategy-team-coordination.md` still described multiple
developers concurrently driving one work unit. The self/foreign asymmetry and all-owner gate were already shipped
upstream, so this WU neither re-authored nor waited on them — the work was deletion plus reconciliation of
load-bearing docs, closed by a corpus-coherence sweep.

What shipped, by phase: team-coordination gutted to a cross-person-only doc (the within-WU multi-dev apparatus
removed wholesale, the genuine cross-person residual kept and reframed); the `(@name)` convention retired from the
formatting strategy, workflow templates, and `DEV-RULES.ARC` § Task interlock; ownership-cardinality decoupled
from PR-cardinality in `strategy-work-organization.md` and `assess-cohort-fit.md`, leaving a neutral seam for the
planned `pr-decomposition` WU rather than re-hardening a one-PR claim; the team-mode `(@name)` pre-commit check and
its README entry removed (the one code surface, gated by `lint:sh` + the hook test suite); and a terminal sweep
confirming the removal is complete across both trees.

Key supersession: Task 4.2.b (renumber the post-removal `pre-commit` CHECK sequence to close the gap) was dropped.
A full sweep found the ordinal check numbers referenced across ~43 live sites plus pre-existing off-by-one drift
in two source comments, so closing the gap would have triggered a high-churn renumber for no behavioral gain. The
numbering gap was left deliberately and a stable-check-ID redesign captured to `USER-INBOX` (target
`check-id-stabilization`).

Mode-agnostic per Decision 9 / ADR-020: universal statements (the task interlock) drop the `team.mode` conditional
rather than reframe it, while the genuinely cross-person social layer stays `team`-gated. The
`team.mode → team.enabled` rename is left to `arc-modes`; edits reference the shipped key only where unavoidable.

Verification: Tier 3 gates green (md/code/shell lint, typecheck, 3236 tests, build); all 10 success criteria met
as planned with no deviations; both trees byte-parity on every mirrored file.

---
