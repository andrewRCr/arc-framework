# Roadmap: ARC Framework Development

> **Generated from meta files — re-render at ceremony boundaries.** Last rendered against `6a734286`.

This view is a derived readiness and dependency map, not a priority ordering. Every work unit is keyed by its
canonical name; assignment is the owner field. Sequencing follows dependency satisfaction: a unit is Ready once
the units it depends on have shipped, and Blocked units are banded by how many unsatisfied dependency hops
separate them from a startable root. Cohort membership is a logical grouping, not a scheduling constraint.

---

## In Flight

| Work unit                     | State  | Owner  | Depends on                  | Cohort                     |
| ----------------------------- | ------ | ------ | --------------------------- | -------------------------- |
| in-flight-awareness           | Active | andrew | —                           | agile-parallelism          |

## Ready

| Work unit                     | Owner  | Depends on                  | Cohort                     |
| ----------------------------- | ------ | --------------------------- | -------------------------- |
| handoff-optimization          | andrew | —                           | agent-context-optimization |
| loadset-composition           | andrew | —                           | agent-context-optimization |
| compaction-recovery           | andrew | —                           | agent-context-optimization |
| agile-wu-lifecycle            | andrew | —                           | agile-parallelism          |
| commit-increments             | andrew | —                           | approval-flow-refinement   |
| interlock-release-refinement  | andrew | —                           | approval-flow-refinement   |
| lib-layer-type-extraction     | andrew | —                           | architecture-remediation   |
| sync-handler-decomposition    | andrew | —                           | architecture-remediation   |
| user-sync-module-split        | andrew | —                           | architecture-remediation   |
| cli-test-hardening            | andrew | —                           | architecture-remediation   |
| config-storage-architecture   | andrew | —                           | configuration              |
| customization-arch-realign    | andrew | —                           | configuration              |
| config-migration-registry     | andrew | —                           | configuration              |
| task-list-conventions         | andrew | —                           | doc-conventions            |
| naming-conventions            | andrew | —                           | doc-conventions            |
| coord-probe                   | andrew | —                           | cross-machine-coherence    |
| cross-machine-sync-coherence  | andrew | —                           | cross-machine-coherence    |
| composable-workflows          | andrew | —                           | principle-anchored-core    |
| scalable-core                 | andrew | —                           | principle-anchored-core    |
| workflow-template-loads       | andrew | —                           | principle-anchored-core    |
| docs-site-refresh             | andrew | —                           | release-readiness          |
| release-lifecycle             | andrew | —                           | release-readiness          |
| binary-distribution           | andrew | —                           | release-readiness          |
| arc-modes                     | andrew | —                           | —                          |
| arc-reinforce                 | andrew | —                           | —                          |
| cli-substrate-adoption        | andrew | —                           | —                          |
| review-method-family          | andrew | —                           | —                          |
| roadmap-tooling               | andrew | —                           | —                          |
| rules-restructure             | andrew | —                           | —                          |
| skill-infrastructure-cleanup  | andrew | —                           | —                          |
| adr-accept-timing             | andrew | —                           | —                          |

## Blocked

### Depth 1

| Work unit                     | Owner  | Depends on                  | Cohort                     |
| ----------------------------- | ------ | --------------------------- | -------------------------- |
| documentation-surface-routing | andrew | handoff-optimization        | agent-context-optimization |
| instruction-optimization      | andrew | handoff-optimization        | agent-context-optimization |
| concurrent-work-conventions   | andrew | agile-wu-lifecycle          | agile-parallelism          |
| schema-introspection-layer    | andrew | cli-substrate-adoption      | architecture-remediation   |
| docs-content-sweep            | andrew | docs-site-refresh           | release-readiness          |
| arc-plan-conductor            | andrew | loadset-composition         | —                          |
| contributor-path              | andrew | agile-wu-lifecycle          | —                          |
| operational-state-docs        | andrew | cli-substrate-adoption      | —                          |
| quality-gate-hooks            | andrew | agile-wu-lifecycle          | —                          |

### Depth 2

| Work unit                     | Owner  | Depends on                  | Cohort                     |
| ----------------------------- | ------ | --------------------------- | -------------------------- |
| wu5-public-release            | andrew | docs-content-sweep          | release-readiness          |
| shared-inbox-housekeep        | andrew | concurrent-work-conventions | —                          |

---

_Pre-commitment thinking that hasn't been sequenced yet lives in `backlog/provisional/`._
