# Roadmap: ARC Framework Development

> **Generated from meta files — re-render at ceremony boundaries.** Last rendered against `babdbf75`.

This view is a derived readiness and dependency map. Tier membership follows dependency satisfaction: a
unit is Ready once the units it depends on have shipped, and Blocked units are banded by how many
unsatisfied dependency hops separate them from a startable root. Within each tier, rows are ordered by
Priority (P1 → P2 → P3), then cohort, then canonical name. Cohort renders as the leaf segment; the full
path lives in each meta's Cohort field. Cohort membership is a logical grouping, not a scheduling constraint.

---

## In Flight

| State      | Work unit                | Priority | Owner  | Depends on | Cohort                  |
|------------|--------------------------|----------|--------|------------|-------------------------|
| `Active`   | lifecycle-mechanics-tail | P1       | andrew | —          | lifecycle-state-machine |

## Ready

| Work unit                    | Priority | Owner  | Depends on | Cohort                      |
|------------------------------|----------|--------|------------|-----------------------------|
| coord-probe                  | P1       | andrew | —          | cross-machine-coherence     |
| cross-machine-sync-coherence | P1       | andrew | —          | cross-machine-coherence     |
| decompose-matrix             | P1       | andrew | —          | lifecycle-state-machine     |
| errand-lattice               | P1       | andrew | —          | lifecycle-state-machine     |
| roadmap-tooling              | P1       | andrew | —          | —                           |
| loadset-composition          | P2       | andrew | —          | agent-context-optimization  |
| out-of-wu-entry              | P2       | andrew | —          | agile-parallelism           |
| commit-increments            | P2       | andrew | —          | approval-flow-refinement    |
| interlock-release-refinement | P2       | andrew | —          | approval-flow-refinement    |
| single-owner-wu-model        | P2       | andrew | —          | concurrent-work-conventions |
| naming-conventions           | P2       | andrew | —          | doc-conventions             |
| composable-workflows         | P2       | andrew | —          | principle-anchored-core     |
| cli-substrate-adoption       | P2       | andrew | —          | —                           |
| goal-aware-direction         | P2       | andrew | —          | —                           |
| graduation-cleanup           | P2       | andrew | —          | —                           |
| compaction-recovery          | P3       | andrew | —          | agent-context-optimization  |
| handoff-optimization         | P3       | andrew | —          | agent-context-optimization  |
| cli-test-hardening           | P3       | andrew | —          | architecture-remediation    |
| lib-layer-type-extraction    | P3       | andrew | —          | architecture-remediation    |
| sync-handler-decomposition   | P3       | andrew | —          | architecture-remediation    |
| user-sync-module-split       | P3       | andrew | —          | architecture-remediation    |
| config-migration-registry    | P3       | andrew | —          | configuration               |
| config-storage-architecture  | P3       | andrew | —          | configuration               |
| customization-arch-realign   | P3       | andrew | —          | configuration               |
| task-list-conventions        | P3       | andrew | —          | doc-conventions             |
| scalable-core                | P3       | andrew | —          | principle-anchored-core     |
| workflow-template-loads      | P3       | andrew | —          | principle-anchored-core     |
| binary-distribution          | P3       | andrew | —          | release-readiness           |
| docs-site-refresh            | P3       | andrew | —          | release-readiness           |
| release-lifecycle            | P3       | andrew | —          | release-readiness           |
| adr-accept-timing            | P3       | andrew | —          | —                           |
| arc-modes                    | P3       | andrew | —          | —                           |
| arc-reinforce                | P3       | andrew | —          | —                           |
| cohort-cut-coherence         | P3       | andrew | —          | —                           |
| cold-start-init-polish       | P3       | andrew | —          | —                           |
| contributor-path             | P3       | andrew | —          | —                           |
| idiomatic-alignment          | P3       | andrew | —          | —                           |
| inbound-routing-method       | P3       | andrew | —          | —                           |
| knowledge-lint               | P3       | andrew | —          | —                           |
| markdown-formatting          | P3       | andrew | —          | —                           |
| planning-iteration-mechanics | P3       | andrew | —          | —                           |
| quality-gate-hooks           | P3       | andrew | —          | —                           |
| review-method-family         | P3       | andrew | —          | —                           |
| rules-restructure            | P3       | andrew | —          | —                           |
| shared-inbox-housekeep       | P3       | andrew | —          | —                           |
| skill-infrastructure-cleanup | P3       | andrew | —          | —                           |
| synthesis-modality           | P3       | andrew | —          | —                           |

## Blocked

### Depth 1

| Work unit                     | Priority | Owner  | Depends on                       | Cohort                     |
|-------------------------------|----------|--------|----------------------------------|----------------------------|
| lifecycle-closeout            | P1       | andrew | decompose-matrix, errand-lattice | lifecycle-state-machine    |
| unit-scoped-review            | P2       | andrew | commit-increments                | approval-flow-refinement   |
| operational-state-docs        | P2       | andrew | cli-substrate-adoption           | —                          |
| documentation-surface-routing | P3       | andrew | handoff-optimization             | agent-context-optimization |
| instruction-optimization      | P3       | andrew | handoff-optimization             | agent-context-optimization |
| schema-introspection-layer    | P3       | andrew | cli-substrate-adoption           | architecture-remediation   |
| docs-content-sweep            | P3       | andrew | docs-site-refresh                | release-readiness          |

### Depth 2

| Work unit            | Priority | Owner  | Depends on                                                                                            | Cohort            |
|----------------------|----------|--------|-------------------------------------------------------------------------------------------------------|-------------------|
| finalize-parallelism | P1       | andrew | single-owner-wu-model, cross-machine-sync-coherence, coord-probe, out-of-wu-entry, lifecycle-closeout | agile-parallelism |
| wu5-public-release   | P3       | andrew | docs-content-sweep                                                                                    | release-readiness |

---

_Pre-commitment thinking that hasn't been sequenced yet lives in `backlog/provisional/`._
