# Roadmap: ARC Framework Development

> **Generated from meta files — re-render at ceremony boundaries.** Last rendered against `1804afef`.

This view is a derived readiness and dependency map, not a priority ordering. Every work unit is keyed by its
canonical name; assignment is the owner field. Sequencing follows dependency satisfaction: a unit is Ready once
the units it depends on have shipped, and Blocked units are banded by how many unsatisfied dependency hops
separate them from a startable root. Cohort membership is a logical grouping, not a scheduling constraint.

---

## In Flight

| Work unit                     | Owner  | Depends on               | Cohort                     |
| ----------------------------- | ------ | ------------------------ | -------------------------- |
| work-organization-reform      | andrew | —                        | —                          |

## Ready

| Work unit                     | Owner  | Depends on               | Cohort                     |
| ----------------------------- | ------ | ------------------------ | -------------------------- |
| commit-increments             | andrew | —                        | approval-flow-refinement   |
| interlock-release-refinement  | andrew | —                        | approval-flow-refinement   |
| lib-layer-type-extraction     | andrew | —                        | architecture-remediation   |
| sync-handler-decomposition    | andrew | —                        | architecture-remediation   |
| user-sync-module-split        | andrew | —                        | architecture-remediation   |
| workflow-template-loads       | andrew | —                        | principle-anchored-core    |
| docs-site-refresh             | andrew | —                        | release-readiness          |
| release-lifecycle             | andrew | —                        | release-readiness          |
| arc-reinforce                 | andrew | —                        | —                          |
| config-storage-architecture   | andrew | —                        | —                          |
| customization-arch-realign    | andrew | —                        | —                          |

## Blocked

### Depth 1

| Work unit                     | Owner  | Depends on               | Cohort                     |
| ----------------------------- | ------ | ------------------------ | -------------------------- |
| handoff-optimization          | andrew | work-organization-reform | agent-context-optimization |
| loadset-composition           | andrew | work-organization-reform | agent-context-optimization |
| worktree-foundation           | andrew | work-organization-reform | agile-parallelism          |
| composable-workflows          | andrew | work-organization-reform | principle-anchored-core    |
| scalable-core                 | andrew | work-organization-reform | principle-anchored-core    |
| docs-content-sweep            | andrew | docs-site-refresh        | release-readiness          |
| cli-substrate-adoption        | andrew | work-organization-reform | —                          |
| meta-file-tracking-model      | andrew | work-organization-reform | —                          |
| review-method-family          | andrew | work-organization-reform | —                          |
| roadmap-tooling               | andrew | work-organization-reform | —                          |
| rules-restructure             | andrew | work-organization-reform | —                          |

### Depth 2

| Work unit                     | Owner  | Depends on               | Cohort                     |
| ----------------------------- | ------ | ------------------------ | -------------------------- |
| documentation-surface-routing | andrew | handoff-optimization     | agent-context-optimization |
| instruction-optimization      | andrew | handoff-optimization     | agent-context-optimization |
| agile-wu-lifecycle            | andrew | worktree-foundation      | agile-parallelism          |
| schema-introspection-layer    | andrew | cli-substrate-adoption   | architecture-remediation   |
| coord-probe                   | andrew | worktree-foundation      | cross-machine-coherence    |
| cross-machine-sync-coherence  | andrew | worktree-foundation      | cross-machine-coherence    |
| wu5-public-release            | andrew | docs-content-sweep       | release-readiness          |
| arc-modes                     | andrew | worktree-foundation      | —                          |
| arc-plan-conductor            | andrew | loadset-composition      | —                          |

### Depth 3

| Work unit                     | Owner  | Depends on               | Cohort                     |
| ----------------------------- | ------ | ------------------------ | -------------------------- |
| concurrent-work-conventions   | andrew | agile-wu-lifecycle       | agile-parallelism          |
| contributor-path              | andrew | agile-wu-lifecycle       | —                          |
| quality-gate-hooks            | andrew | agile-wu-lifecycle       | —                          |

---

_Pre-commitment thinking that hasn't been sequenced yet lives in `backlog/provisional/`._
