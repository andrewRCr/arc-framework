# Metadata: concurrent-work-doctrine

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --- | --- | --- | --- | --- |
| `Shipped` | `andrew` | `feat/concurrent-work-doctrine` | `Heavy` | `P1` |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-concurrent-work-doctrine.md`
- **Task List:** tasks-concurrent-work-doctrine.md

- **Last Completed:** Task 5.1 — Complete verification (Tier 3 gates green; all success criteria met)
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** merge PR #81

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/81>
- **Completed:** 2026-06-11

---

## Release Notes Entry

ARC now includes a concurrent-work doctrine for running multiple work units at once, with a reusable
parallel-fit read and branch-safety guidance that keeps concurrency deliberate rather than chaotic.

### Added

- A Concurrent Work strategy covering worktrees, parallelize-vs-serialize judgment, append-only branch safety,
  merge ordering, awaiting-review latency, shared files, foreign-owned work, and philosophy checkpoints.
- An `assess-parallel-fit` method that provides the advisory proceed / sequence / coordinate posture for
  activation, errand launch, and pick-time surfaces.
- ADR-025 as the internal rationale for convention-over-tooling, focus-role rejection, append-only branch safety,
  and team-mode orthogonality.

### Changed

- Session initialization, activation, in-flight scope checks, and errand launch now invoke or reference the shared
  parallel-fit method instead of carrying local overlap rubrics.
- Team Coordination now links to Concurrent Work as an orthogonal sibling covering multi-work-unit mechanics.

## Completion Notes

Concurrent Work Doctrine shipped the convention layer for principled multi-WU concurrency. The adopter-facing
strategy states ARC's posture: focused sequential work remains the default, bounded concurrency is principled at
modest scale, and heavy concurrency is an operator call with explicit co-development tradeoffs.

The hard rule is narrow: a pushed work-unit branch is append-only until integration. The strategy frames that rule
as git-branch-safety for shared history, not as a permanent storage model, keeping the doctrine compatible with
future storage evolution while making today's cross-machine branch safety clear.

The reusable `assess-parallel-fit` method now owns the overlap and design-load reads. The consuming workflows
declare or load the method at the fire-sites that weigh new work against in-flight work, while the strategy keeps
the rubric out of its own body.

ADR-025 holds the internal research grounding and rejected alternatives, including the focus-role field rejection,
the append-only incident rationale, and the team-mode orthogonality decision. The tracked notes companion remains
as supporting internal rationale, and the shipping strategy stays clean of research citations, storage-forward
compat reasoning, and internal roadmap framing.

Verification passed with the full Tier 3 gate set twice on the final verification state, plus ARC section-reference
and trigger audits during integration review. The final PR state before archive had green CI, CodeRabbit success,
and one rejected pre-PR finding: ROADMAP state drift on `Active` -> `Integrating`, rejected because ROADMAP regen is
intentionally archive-wired and self-heals when the work unit leaves `active/`.
