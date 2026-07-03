# Metadata: adversarial-review

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-adversarial-review.md`
- **Task List:** `tasks-adversarial-review.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/175>
- **Completed:** 2026-07-03

---

## Release Notes Entry

ARC now includes an advisory adversarial-review mechanism: fresh-context review passes can be offered at planning
and verification boundaries, with recommendation strength scaled by work-unit class while the user remains in
control of whether each pass runs.

### Added

- **`adversarial-review` method** — a reusable fresh-context review mechanism with a signature-led invocation
  contract, fixed severity model, convergence exit gate, prompt template, context-provisioning rules, and a
  default-off `Novel` partitioned fan-out hook.
- **Adversarial fire-points** — `draft-design`, `create-spec`, `generate-tasks`, and `verify-work-unit` now
  surface the pass at their boundary gates, recommending it only where the configured class posture warrants.
- **`design-audit` method and skill door** — a reusable design-efficacy and fit rubric for draft/spec review.
- **`task-audit` method extraction** — `task-audit` is now a public method, with `arc-task-audit` reduced to an
  explicit-request skill door.
- **Method-trigger coverage affordance** — the trigger audit supports temporary pre-wiring entries and flags stale
  entries once workflow declarations land.

### Changed

- `DEV-RULES.ARC` now defines sub-agent scope by function: derivation may delegate, execution stays primary-held
  absent explicit relaxation, and judgment never delegates.
- Planning finalize points now re-run their stage-owned coherence check after adversarial findings are settled and
  before the finalize commit.

## Completion Notes

`adversarial-review` shipped the fresh-context adversarial review mechanism that had already proven valuable in
ad hoc planning passes. The delivered shape is a public method, not a rubric: each boundary supplies its own
rubric and artifacts, while the method owns the fresh pass contract, return schema, materiality model, convergence
loop, prompt template, and context-provisioning rules.

The implementation landed the mechanism in both framework copies and wired the four boundary offers:
draft-readiness, spec finalization, task generation, and work-unit verification. Offers are now always surfaced;
only the recommendation posture scales by class. `Light` receives neutral offers, `Heavy` is recommended at spec
and task-generation finalization, and `Novel` is recommended at all four boundaries. The optional `Novel`
partitioned fan-out remains a contract hook and primary-proposed path, not automatic orchestration.

The supporting rubric layer also shipped: `design-audit` was added as a public method with a thin skill door, and
`task-audit` was extracted from its skill into a public method while preserving the ad hoc skill entry. The
`generate-tasks` grounding-audit path now calls the method directly, retiring the workflow-to-skill inversion.

The constitutional rule changed from task-list-membership-based delegation to function-based delegation:
derivation and review outputs may be delegated, execution remains primary-held unless explicitly relaxed, and
judgment stays with the primary. That keeps the mechanism compatible with ARC's co-development center while
making fresh-context review first-class.

Verification completed at Tier 3: markdown lint, TypeScript lint, shellcheck, source and test typecheck, the full
Vitest suite, and build all passed locally; CI is green on PR #175. The dogfood `task-audit` pass found a real
verification-surface gap in the task list's success criteria, which was confirmed and fixed before integration.
CodeRabbit review then found and fixed contract-wording issues around neutral offers, `partition-map`,
subagent-loop state, and stale task-list field names; the final outside-diff `WIRING_PENDING` note was rejected as
an intentional pre-wiring affordance covered by tests.
