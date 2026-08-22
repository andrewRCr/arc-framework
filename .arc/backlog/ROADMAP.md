# Roadmap: Project Status

> **Generated from meta files — re-render at ceremony boundaries.**
> Source scope: tree + local refs. Live view: `arc status --project`.

This view is a derived readiness and dependency map. Tier membership follows dependency satisfaction: a
unit is Ready once the units it depends on have shipped, and Blocked units are banded by how many
unsatisfied dependency hops separate them from a startable root. Within each tier, rows are ordered by
Priority (P1 → P2 → P3), then cohort, then canonical name. Cohort renders as the leaf segment; the full
path lives in each meta's Cohort field. Cohort membership is a logical grouping, not a scheduling constraint.

---

## In Flight

| State      | Work unit                         | Priority | Owner  | Depends on                      | Cohort                    |
| ---------- | --------------------------------- | -------- | ------ | ------------------------------- | ------------------------- |
| `Active`   | delivery-native-stack-composition | P1       | andrew | —                               | chunked-delivery          |
| `Planning` | decompose-conservation-coverage   | P1       | andrew | —                               | decompose-core-hardening  |
| `Planning` | review-signal-convergence         | P1       | andrew | —                               | review-protocol-alignment |
| `Planning` | decomposition-doctrine            | P1       | andrew | decompose-conservation-coverage | —                         |
| `Planning` | review-checkout-lifecycle         | P1       | andrew | —                               | —                         |
| `Planning` | stub-mint-to-launch               | P1       | andrew | —                               | —                         |

## Ready

| Work unit                           | Priority | Owner  | Depends on | Cohort                     |
| ----------------------------------- | -------- | ------ | ---------- | -------------------------- |
| interlock-release-refinement        | P1       | andrew | —          | approval-flow-refinement   |
| host-policy-evidence                | P1       | andrew | —          | review-protocol-alignment  |
| review-evaluator-isolation          | P1       | andrew | —          | review-protocol-alignment  |
| cross-worktree-git-state-safety     | P1       | andrew | —          | —                          |
| delivery-intent-integrity           | P1       | andrew | —          | —                          |
| locus-claim-revalidation            | P1       | andrew | —          | —                          |
| recovery-hardening                  | P1       | andrew | —          | —                          |
| recurring-errand-pr-resolution      | P1       | andrew | —          | —                          |
| roadmap-tooling                     | P1       | andrew | —          | —                          |
| session-init-performance            | P1       | andrew | —          | —                          |
| verification-falsification-contract | P1       | andrew | —          | —                          |
| wu-lifecycle-state-model            | P1       | andrew | —          | —                          |
| composable-workflows                | P2       | andrew | —          | agent-context-optimization |
| loadset-composition                 | P2       | andrew | —          | agent-context-optimization |
| commit-increments                   | P2       | andrew | —          | approval-flow-refinement   |
| check-id-stabilization              | P2       | andrew | —          | architecture-remediation   |
| cli-substrate-complete-migration    | P2       | andrew | —          | cli-substrate-adoption     |
| decompose-scaling                   | P2       | andrew | —          | decompose-core-hardening   |
| method-conventions                  | P2       | andrew | —          | doc-conventions            |
| naming-conventions                  | P2       | andrew | —          | doc-conventions            |
| pull-request-surface-policy         | P2       | andrew | —          | doc-conventions            |
| cross-wu-coordination               | P2       | andrew | —          | —                          |
| execution-delegation-doctrine       | P2       | andrew | —          | —                          |
| frictionless-capture                | P2       | andrew | —          | —                          |
| goal-aware-direction                | P2       | andrew | —          | —                          |
| graduation-cleanup                  | P2       | andrew | —          | —                          |
| knowledge-architecture              | P2       | andrew | —          | —                          |
| left-errand-resumption              | P2       | andrew | —          | —                          |
| operational-advisory-registers      | P2       | andrew | —          | —                          |
| operational-state-docs              | P2       | andrew | —          | —                          |
| package-project-development-sync    | P2       | andrew | —          | —                          |
| plan-segmentation                   | P2       | andrew | —          | —                          |
| planning-lane-relief                | P2       | andrew | —          | —                          |
| review-orchestration-right-sizing   | P2       | andrew | —          | —                          |
| workflow-eval-harness               | P2       | andrew | —          | —                          |
| handoff-optimization                | P3       | andrew | —          | agent-context-optimization |
| ci-cross-platform-hardening         | P3       | andrew | —          | architecture-remediation   |
| lib-layer-type-extraction           | P3       | andrew | —          | architecture-remediation   |
| schema-introspection-layer          | P3       | andrew | —          | architecture-remediation   |
| sync-handler-decomposition          | P3       | andrew | —          | architecture-remediation   |
| user-sync-module-split              | P3       | andrew | —          | architecture-remediation   |
| config-migration-registry           | P3       | andrew | —          | configuration              |
| config-storage-architecture         | P3       | andrew | —          | configuration              |
| customization-arch-realign          | P3       | andrew | —          | configuration              |
| task-list-conventions               | P3       | andrew | —          | doc-conventions            |
| traceability-identifiers            | P3       | andrew | —          | doc-conventions            |
| scalable-core                       | P3       | andrew | —          | principle-anchored-core    |
| binary-distribution                 | P3       | andrew | —          | release-readiness          |
| docs-site-refresh                   | P3       | andrew | —          | release-readiness          |
| release-lifecycle                   | P3       | andrew | —          | release-readiness          |
| adopter-content-aware-ci            | P3       | andrew | —          | —                          |
| adr-accept-timing                   | P3       | andrew | —          | —                          |
| arc-backend                         | P3       | andrew | —          | —                          |
| arc-reinforce                       | P3       | andrew | —          | —                          |
| chunk-scope-binding                 | P3       | andrew | —          | —                          |
| cohort-cut-coherence                | P3       | andrew | —          | —                          |
| cold-start-init-polish              | P3       | andrew | —          | —                          |
| contributor-path                    | P3       | andrew | —          | —                          |
| external-coord-probe                | P3       | andrew | —          | —                          |
| external-pm-composition             | P3       | andrew | —          | —                          |
| grok-compaction-recovery            | P3       | andrew | —          | —                          |
| idiomatic-alignment                 | P3       | andrew | —          | —                          |
| inbound-routing-method              | P3       | andrew | —          | —                          |
| knowledge-lint                      | P3       | andrew | —          | —                          |
| planning-iteration-mechanics        | P3       | andrew | —          | —                          |
| quality-gate-hooks                  | P3       | andrew | —          | —                          |
| rules-restructure                   | P3       | andrew | —          | —                          |
| self-hosted-ci-qualification        | P3       | andrew | —          | —                          |
| session-retitle                     | P3       | andrew | —          | —                          |
| shared-inbox-model                  | P3       | andrew | —          | —                          |
| skill-infrastructure-cleanup        | P3       | andrew | —          | —                          |
| sync-primitive-discipline           | P3       | andrew | —          | —                          |
| synthesis-modality                  | P3       | andrew | —          | —                          |

## Blocked

### Depth 1

| Work unit                     | Priority | Owner  | Depends on                                                  | Cohort                     |
| ----------------------------- | -------- | ------ | ----------------------------------------------------------- | -------------------------- |
| review-source-authority       | P1       | andrew | review-signal-convergence                                   | review-protocol-alignment  |
| unit-scoped-review            | P2       | andrew | commit-increments                                           | approval-flow-refinement   |
| documentation-surface-routing | P3       | andrew | handoff-optimization                                        | agent-context-optimization |
| instruction-optimization      | P3       | andrew | composable-workflows                                        | agent-context-optimization |
| workflow-template-loads       | P3       | andrew | composable-workflows                                        | principle-anchored-core    |
| docs-content-sweep            | P3       | andrew | docs-site-refresh                                           | release-readiness          |
| comprehension-preservation    | P3       | andrew | execution-delegation-doctrine                               | —                          |
| local-mode                    | P3       | andrew | operational-state-docs, scalable-core, composable-workflows | —                          |

### Depth 2

| Work unit                 | Priority | Owner  | Depends on              | Cohort                    |
| ------------------------- | -------- | ------ | ----------------------- | ------------------------- |
| review-activity-contracts | P1       | andrew | review-source-authority | review-protocol-alignment |
| wu5-public-release        | P3       | andrew | docs-content-sweep      | release-readiness         |

### Depth 3

| Work unit                | Priority | Owner  | Depends on                | Cohort                    |
| ------------------------ | -------- | ------ | ------------------------- | ------------------------- |
| review-request-contracts | P1       | andrew | review-activity-contracts | review-protocol-alignment |

### Depth 4

| Work unit                   | Priority | Owner  | Depends on               | Cohort           |
| --------------------------- | -------- | ------ | ------------------------ | ---------------- |
| delivery-review-cardinality | P2       | andrew | review-request-contracts | chunked-delivery |

---

_Pre-commitment thinking that hasn't been sequenced yet lives in `backlog/provisional/`._
