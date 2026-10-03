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

| State         | Work unit                       | Priority | Owner  | Depends on       | Cohort                   |
| ------------- | ------------------------------- | -------- | ------ | ---------------- | ------------------------ |
| `Active`      | storage-contract                | P1       | andrew | —                | state-storage            |
| `Planning`    | storage-seam                    | P1       | andrew | storage-contract | state-storage            |
| `Planning`    | candidate-reroot-recovery-frame | P1       | andrew | —                | —                        |
| `Planning`    | decomposition-doctrine          | P1       | andrew | —                | —                        |
| `Planning`    | delivery-rebuild-continuity     | P1       | andrew | —                | —                        |
| `Planning`    | review-checkout-lifecycle       | P1       | andrew | —                | —                        |
| `Planning`    | stub-mint-to-launch             | P1       | andrew | —                | —                        |
| `Integrating` | check-id-stabilization          | P2       | andrew | —                | architecture-remediation |
| `Active`      | spec-reader-standard            | P2       | andrew | —                | doc-conventions          |
| `Planning`    | artifact-editor-handoff         | P3       | andrew | —                | —                        |
| `Planning`    | cli-help-discovery              | P3       | andrew | —                | —                        |

## Ready

| Work unit                           | Priority | Owner  | Depends on | Cohort                     |
| ----------------------------------- | -------- | ------ | ---------- | -------------------------- |
| errand-autonomous-advance           | P1       | andrew | —          | approval-flow-refinement   |
| interlock-release-refinement        | P1       | andrew | —          | approval-flow-refinement   |
| lifecycle-advancement-provenance    | P1       | andrew | —          | approval-flow-refinement   |
| host-policy-evidence                | P1       | andrew | —          | review-protocol-alignment  |
| review-evaluator-isolation          | P1       | andrew | —          | review-protocol-alignment  |
| review-source-authority             | P1       | andrew | —          | review-protocol-alignment  |
| storage-projection                  | P1       | andrew | —          | state-storage              |
| storage-ref-backend                 | P1       | andrew | —          | state-storage              |
| cross-worktree-git-state-safety     | P1       | andrew | —          | —                          |
| delivery-intent-integrity           | P1       | andrew | —          | —                          |
| locus-claim-revalidation            | P1       | andrew | —          | —                          |
| recovery-hardening                  | P1       | andrew | —          | —                          |
| recurring-errand-pr-resolution      | P1       | andrew | —          | —                          |
| review-operation-state-isolation    | P1       | andrew | —          | —                          |
| session-init-performance            | P1       | andrew | —          | —                          |
| verification-falsification-contract | P1       | andrew | —          | —                          |
| composable-workflows                | P2       | andrew | —          | agent-context-optimization |
| loadset-composition                 | P2       | andrew | —          | agent-context-optimization |
| commit-increments                   | P2       | andrew | —          | approval-flow-refinement   |
| decompose-scaling                   | P2       | andrew | —          | decompose-core-hardening   |
| method-conventions                  | P2       | andrew | —          | doc-conventions            |
| pull-request-surface-policy         | P2       | andrew | —          | doc-conventions            |
| cli-output-contract                 | P2       | andrew | —          | —                          |
| cross-wu-coordination               | P2       | andrew | —          | —                          |
| execution-delegation-doctrine       | P2       | andrew | —          | —                          |
| frictionless-capture                | P2       | andrew | —          | —                          |
| goal-aware-direction                | P2       | andrew | —          | —                          |
| graduation-cleanup                  | P2       | andrew | —          | —                          |
| knowledge-architecture              | P2       | andrew | —          | —                          |
| left-errand-resumption              | P2       | andrew | —          | —                          |
| operational-advisory-registers      | P2       | andrew | —          | —                          |
| package-project-development-sync    | P2       | andrew | —          | —                          |
| planning-lane-relief                | P2       | andrew | —          | —                          |
| review-orchestration-right-sizing   | P2       | andrew | —          | —                          |
| workflow-eval-harness               | P2       | andrew | —          | —                          |
| handoff-optimization                | P3       | andrew | —          | agent-context-optimization |
| ci-cross-platform-hardening         | P3       | andrew | —          | architecture-remediation   |
| lib-layer-type-extraction           | P3       | andrew | —          | architecture-remediation   |
| oversized-function-remediation      | P3       | andrew | —          | architecture-remediation   |
| schema-introspection-layer          | P3       | andrew | —          | architecture-remediation   |
| sync-handler-decomposition          | P3       | andrew | —          | architecture-remediation   |
| user-sync-module-split              | P3       | andrew | —          | architecture-remediation   |
| config-migration-registry           | P3       | andrew | —          | configuration              |
| customization-arch-realign          | P3       | andrew | —          | configuration              |
| task-list-conventions               | P3       | andrew | —          | doc-conventions            |
| traceability-identifiers            | P3       | andrew | —          | doc-conventions            |
| scalable-core                       | P3       | andrew | —          | principle-anchored-core    |
| binary-distribution                 | P3       | andrew | —          | release-readiness          |
| docs-site-refresh                   | P3       | andrew | —          | release-readiness          |
| release-lifecycle                   | P3       | andrew | —          | release-readiness          |
| adopter-content-aware-ci            | P3       | andrew | —          | —                          |
| adr-accept-timing                   | P3       | andrew | —          | —                          |
| arc-reinforce                       | P3       | andrew | —          | —                          |
| chunk-scope-binding                 | P3       | andrew | —          | —                          |
| cohort-cut-coherence                | P3       | andrew | —          | —                          |
| cold-start-init-polish              | P3       | andrew | —          | —                          |
| contributor-path                    | P3       | andrew | —          | —                          |
| errand-promotion-concurrency        | P3       | andrew | —          | —                          |
| external-coord-probe                | P3       | andrew | —          | —                          |
| external-pm-composition             | P3       | andrew | —          | —                          |
| grok-compaction-recovery            | P3       | andrew | —          | —                          |
| idiomatic-alignment                 | P3       | andrew | —          | —                          |
| inbound-routing-method              | P3       | andrew | —          | —                          |
| knowledge-lint                      | P3       | andrew | —          | —                          |
| merge-queue-landing                 | P3       | andrew | —          | —                          |
| planning-iteration-mechanics        | P3       | andrew | —          | —                          |
| quality-gate-hooks                  | P3       | andrew | —          | —                          |
| rules-restructure                   | P3       | andrew | —          | —                          |
| session-retitle                     | P3       | andrew | —          | —                          |
| skill-infrastructure-cleanup        | P3       | andrew | —          | —                          |
| status-hud                          | P3       | andrew | —          | —                          |
| sync-primitive-discipline           | P3       | andrew | —          | —                          |
| synthesis-modality                  | P3       | andrew | —          | —                          |

## Blocked

### Depth 1

| Work unit                     | Priority | Owner  | Depends on                                            | Cohort                     |
| ----------------------------- | -------- | ------ | ----------------------------------------------------- | -------------------------- |
| review-activity-contracts     | P1       | andrew | review-source-authority                               | review-protocol-alignment  |
| storage-cutover               | P1       | andrew | storage-seam, storage-ref-backend, storage-projection | state-storage              |
| roadmap-tooling               | P1       | andrew | storage-seam                                          | —                          |
| unit-scoped-review            | P2       | andrew | commit-increments                                     | approval-flow-refinement   |
| documentation-surface-routing | P3       | andrew | handoff-optimization                                  | agent-context-optimization |
| instruction-optimization      | P3       | andrew | composable-workflows                                  | agent-context-optimization |
| config-storage-architecture   | P3       | andrew | storage-contract                                      | configuration              |
| workflow-template-loads       | P3       | andrew | composable-workflows                                  | principle-anchored-core    |
| docs-content-sweep            | P3       | andrew | docs-site-refresh                                     | release-readiness          |
| comprehension-preservation    | P3       | andrew | execution-delegation-doctrine                         | —                          |

### Depth 2

| Work unit                       | Priority | Owner  | Depends on                | Cohort                    |
| ------------------------------- | -------- | ------ | ------------------------- | ------------------------- |
| review-request-contracts        | P1       | andrew | review-activity-contracts | review-protocol-alignment |
| delivery-correction-convergence | P1       | andrew | storage-cutover           | —                         |
| delivery-observe-attest         | P1       | andrew | storage-cutover           | —                         |
| wu-lifecycle-state-model        | P1       | andrew | storage-cutover           | —                         |
| naming-conventions              | P2       | andrew | storage-cutover           | doc-conventions           |
| framework-core-from-package     | P2       | andrew | storage-cutover           | —                         |
| ghost-mode                      | P2       | andrew | storage-cutover           | —                         |
| history-policy                  | P2       | andrew | storage-cutover           | —                         |
| operational-state-docs          | P2       | andrew | storage-cutover           | —                         |
| wu5-public-release              | P3       | andrew | docs-content-sweep        | release-readiness         |
| shared-inbox-model              | P3       | andrew | storage-cutover           | —                         |

### Depth 3

| Work unit                   | Priority | Owner  | Depends on               | Cohort           |
| --------------------------- | -------- | ------ | ------------------------ | ---------------- |
| delivery-review-cardinality | P2       | andrew | review-request-contracts | chunked-delivery |

---

_Pre-commitment thinking that hasn't been sequenced yet lives in `backlog/provisional/`._
