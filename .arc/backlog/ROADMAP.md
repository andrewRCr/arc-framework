# Roadmap: Project Status

> **Generated from meta files — re-render at ceremony boundaries.** Last rendered against `b5c444532`.
> Source scope: tree + local refs. Live view: `arc status --project`.

This view is a derived readiness and dependency map. Tier membership follows dependency satisfaction: a
unit is Ready once the units it depends on have shipped, and Blocked units are banded by how many
unsatisfied dependency hops separate them from a startable root. Within each tier, rows are ordered by
Priority (P1 → P2 → P3), then cohort, then canonical name. Cohort renders as the leaf segment; the full
path lives in each meta's Cohort field. Cohort membership is a logical grouping, not a scheduling constraint.

---

## In Flight

| State    | Work unit            | Priority | Owner  | Depends on | Cohort            |
| -------- | -------------------- | -------- | ------ | ---------- | ----------------- |
| `Active` | finalize-parallelism | P1       | andrew | —          | agile-parallelism |
| `Active` | burn-in-probe-b      | P3       | andrew | —          | —                 |

## Ready

| Work unit                             | Priority | Owner  | Depends on | Cohort                     |
| ------------------------------------- | -------- | ------ | ---------- | -------------------------- |
| interlock-release-refinement          | P1       | andrew | —          | approval-flow-refinement   |
| commit-message-submission             | P1       | andrew | —          | —                          |
| delivery-intent-integrity             | P1       | andrew | —          | —                          |
| pr-decomposition                      | P1       | andrew | —          | —                          |
| recovery-hardening                    | P1       | andrew | —          | —                          |
| review-gate-enforcement-qualification | P1       | andrew | —          | —                          |
| roadmap-tooling                       | P1       | andrew | —          | —                          |
| wu-lifecycle-state-model              | P1       | andrew | —          | —                          |
| composable-workflows                  | P2       | andrew | —          | agent-context-optimization |
| loadset-composition                   | P2       | andrew | —          | agent-context-optimization |
| commit-increments                     | P2       | andrew | —          | approval-flow-refinement   |
| check-id-stabilization                | P2       | andrew | —          | architecture-remediation   |
| naming-conventions                    | P2       | andrew | —          | doc-conventions            |
| cli-substrate-adoption                | P2       | andrew | —          | —                          |
| cross-wu-coordination                 | P2       | andrew | —          | —                          |
| execution-delegation-doctrine         | P2       | andrew | —          | —                          |
| frictionless-capture                  | P2       | andrew | —          | —                          |
| goal-aware-direction                  | P2       | andrew | —          | —                          |
| graduation-cleanup                    | P2       | andrew | —          | —                          |
| knowledge-architecture                | P2       | andrew | —          | —                          |
| workflow-eval-harness                 | P2       | andrew | —          | —                          |
| handoff-optimization                  | P3       | andrew | —          | agent-context-optimization |
| ci-cross-platform-hardening           | P3       | andrew | —          | architecture-remediation   |
| cli-test-hardening                    | P3       | andrew | —          | architecture-remediation   |
| lib-layer-type-extraction             | P3       | andrew | —          | architecture-remediation   |
| sync-handler-decomposition            | P3       | andrew | —          | architecture-remediation   |
| user-sync-module-split                | P3       | andrew | —          | architecture-remediation   |
| config-migration-registry             | P3       | andrew | —          | configuration              |
| config-storage-architecture           | P3       | andrew | —          | configuration              |
| customization-arch-realign            | P3       | andrew | —          | configuration              |
| task-list-conventions                 | P3       | andrew | —          | doc-conventions            |
| scalable-core                         | P3       | andrew | —          | principle-anchored-core    |
| binary-distribution                   | P3       | andrew | —          | release-readiness          |
| docs-site-refresh                     | P3       | andrew | —          | release-readiness          |
| release-lifecycle                     | P3       | andrew | —          | release-readiness          |
| adopter-content-aware-ci              | P3       | andrew | —          | —                          |
| adr-accept-timing                     | P3       | andrew | —          | —                          |
| arc-reinforce                         | P3       | andrew | —          | —                          |
| cohort-cut-coherence                  | P3       | andrew | —          | —                          |
| cohortless-decomposition              | P3       | andrew | —          | —                          |
| cold-start-init-polish                | P3       | andrew | —          | —                          |
| contributor-path                      | P3       | andrew | —          | —                          |
| external-coord-probe                  | P3       | andrew | —          | —                          |
| idiomatic-alignment                   | P3       | andrew | —          | —                          |
| inbound-routing-method                | P3       | andrew | —          | —                          |
| knowledge-lint                        | P3       | andrew | —          | —                          |
| markdown-formatting                   | P3       | andrew | —          | —                          |
| planning-iteration-mechanics          | P3       | andrew | —          | —                          |
| quality-gate-hooks                    | P3       | andrew | —          | —                          |
| review-method-family                  | P3       | andrew | —          | —                          |
| rules-restructure                     | P3       | andrew | —          | —                          |
| shared-inbox-model                    | P3       | andrew | —          | —                          |
| skill-infrastructure-cleanup          | P3       | andrew | —          | —                          |
| sync-primitive-discipline             | P3       | andrew | —          | —                          |
| synthesis-modality                    | P3       | andrew | —          | —                          |

## Blocked

### Depth 1

| Work unit                         | Priority | Owner  | Depends on                            | Cohort                     |
| --------------------------------- | -------- | ------ | ------------------------------------- | -------------------------- |
| review-gate-enforcement-promotion | P1       | andrew | review-gate-enforcement-qualification | —                          |
| unit-scoped-review                | P2       | andrew | commit-increments                     | approval-flow-refinement   |
| operational-state-docs            | P2       | andrew | cli-substrate-adoption                | —                          |
| documentation-surface-routing     | P3       | andrew | handoff-optimization                  | agent-context-optimization |
| instruction-optimization          | P3       | andrew | composable-workflows                  | agent-context-optimization |
| schema-introspection-layer        | P3       | andrew | cli-substrate-adoption                | architecture-remediation   |
| workflow-template-loads           | P3       | andrew | composable-workflows                  | principle-anchored-core    |
| docs-content-sweep                | P3       | andrew | docs-site-refresh                     | release-readiness          |
| comprehension-preservation        | P3       | andrew | execution-delegation-doctrine         | —                          |

### Depth 2

| Work unit                  | Priority | Owner  | Depends on                                                  | Cohort            |
| -------------------------- | -------- | ------ | ----------------------------------------------------------- | ----------------- |
| review-gate-github-adapter | P1       | andrew | review-gate-enforcement-promotion                           | —                 |
| wu5-public-release         | P3       | andrew | docs-content-sweep                                          | release-readiness |
| local-mode                 | P3       | andrew | operational-state-docs, scalable-core, composable-workflows | —                 |

---

_Pre-commitment thinking that hasn't been sequenced yet lives in `backlog/provisional/`._
