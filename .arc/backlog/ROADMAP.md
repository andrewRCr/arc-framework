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

| State      | Work unit                       | Priority | Owner  | Depends on      | Cohort                     |
| ---------- | ------------------------------- | -------- | ------ | --------------- | -------------------------- |
| `Active`   | session-init-agenda             | P1       | andrew | —               | agent-context-optimization |
| `Active`   | storage-ref-hardening           | P1       | andrew | —               | state-storage              |
| `Active`   | projection-substrate            | P1       | andrew | —               | storage-projection         |
| `Planning` | cohort-identity-verbs           | P1       | andrew | —               | storage-seam               |
| `Active`   | seam-delivery-review            | P1       | andrew | —               | storage-seam               |
| `Planning` | adopter-install-authority       | P1       | andrew | storage-cutover | —                          |
| `Planning` | candidate-reroot-recovery-frame | P1       | andrew | —               | —                          |
| `Planning` | decomposition-doctrine          | P1       | andrew | —               | —                          |
| `Planning` | delivery-rebuild-continuity     | P1       | andrew | —               | —                          |
| `Planning` | review-checkout-lifecycle       | P1       | andrew | —               | —                          |
| `Planning` | stub-mint-to-launch             | P1       | andrew | —               | —                          |
| `Planning` | cli-output-contract             | P2       | andrew | —               | —                          |

## Ready

| Work unit                             | Priority | Owner  | Depends on | Cohort                     |
| ------------------------------------- | -------- | ------ | ---------- | -------------------------- |
| autonomy-levels                       | P1       | andrew | —          | approval-flow-refinement   |
| errand-autonomous-advance             | P1       | andrew | —          | approval-flow-refinement   |
| interlock-release-refinement          | P1       | andrew | —          | approval-flow-refinement   |
| lifecycle-advancement-provenance      | P1       | andrew | —          | approval-flow-refinement   |
| config-migration-registry             | P1       | andrew | —          | configuration              |
| host-policy-evidence                  | P1       | andrew | —          | review-protocol-alignment  |
| review-evaluator-isolation            | P1       | andrew | —          | review-protocol-alignment  |
| review-source-authority               | P1       | andrew | —          | review-protocol-alignment  |
| storage-native-windows-bulk-transport | P1       | andrew | —          | state-storage              |
| cross-worktree-git-state-safety       | P1       | andrew | —          | —                          |
| delivery-intent-integrity             | P1       | andrew | —          | —                          |
| locus-claim-revalidation              | P1       | andrew | —          | —                          |
| recovery-hardening                    | P1       | andrew | —          | —                          |
| recurring-errand-pr-resolution        | P1       | andrew | —          | —                          |
| review-operation-state-isolation      | P1       | andrew | —          | —                          |
| roadmap-tooling                       | P1       | andrew | —          | —                          |
| session-init-performance              | P1       | andrew | —          | —                          |
| verification-falsification-contract   | P1       | andrew | —          | —                          |
| composable-workflows                  | P2       | andrew | —          | agent-context-optimization |
| loadset-composition                   | P2       | andrew | —          | agent-context-optimization |
| commit-increments                     | P2       | andrew | —          | approval-flow-refinement   |
| method-conventions                    | P2       | andrew | —          | doc-conventions            |
| storage-ref-release-hardening         | P2       | andrew | —          | state-storage              |
| agent-session-bridge                  | P2       | andrew | —          | —                          |
| cross-wu-coordination                 | P2       | andrew | —          | —                          |
| execution-delegation-doctrine         | P2       | andrew | —          | —                          |
| frictionless-capture                  | P2       | andrew | —          | —                          |
| graduation-cleanup                    | P2       | andrew | —          | —                          |
| in-process-cli-harness                | P2       | andrew | —          | —                          |
| knowledge-architecture                | P2       | andrew | —          | —                          |
| left-errand-resumption                | P2       | andrew | —          | —                          |
| operational-advisory-registers        | P2       | andrew | —          | —                          |
| package-project-development-sync      | P2       | andrew | —          | —                          |
| planning-lane-relief                  | P2       | andrew | —          | —                          |
| review-orchestration-right-sizing     | P2       | andrew | —          | —                          |
| store-cross-call-sharing              | P2       | andrew | —          | —                          |
| test-suite-contention-hardening       | P2       | andrew | —          | —                          |
| workflow-eval-harness                 | P2       | andrew | —          | —                          |
| handoff-optimization                  | P3       | andrew | —          | agent-context-optimization |
| ci-cross-platform-hardening           | P3       | andrew | —          | architecture-remediation   |
| lib-layer-type-extraction             | P3       | andrew | —          | architecture-remediation   |
| oversized-function-remediation        | P3       | andrew | —          | architecture-remediation   |
| sync-handler-decomposition            | P3       | andrew | —          | architecture-remediation   |
| user-sync-module-split                | P3       | andrew | —          | architecture-remediation   |
| config-storage-architecture           | P3       | andrew | —          | configuration              |
| customization-arch-realign            | P3       | andrew | —          | configuration              |
| task-list-conventions                 | P3       | andrew | —          | doc-conventions            |
| traceability-identifiers              | P3       | andrew | —          | doc-conventions            |
| scalable-core                         | P3       | andrew | —          | principle-anchored-core    |
| binary-distribution                   | P3       | andrew | —          | release-readiness          |
| docs-site-refresh                     | P3       | andrew | —          | release-readiness          |
| release-lifecycle                     | P3       | andrew | —          | release-readiness          |
| adopter-content-aware-ci              | P3       | andrew | —          | —                          |
| adr-accept-timing                     | P3       | andrew | —          | —                          |
| arc-reinforce                         | P3       | andrew | —          | —                          |
| chunk-scope-binding                   | P3       | andrew | —          | —                          |
| cohort-cut-coherence                  | P3       | andrew | —          | —                          |
| cold-start-init-polish                | P3       | andrew | —          | —                          |
| contributor-path                      | P3       | andrew | —          | —                          |
| errand-launchpads                     | P3       | andrew | —          | —                          |
| external-coord-probe                  | P3       | andrew | —          | —                          |
| external-pm-composition               | P3       | andrew | —          | —                          |
| grok-compaction-recovery              | P3       | andrew | —          | —                          |
| idiomatic-alignment                   | P3       | andrew | —          | —                          |
| knowledge-lint                        | P3       | andrew | —          | —                          |
| merge-queue-landing                   | P3       | andrew | —          | —                          |
| planning-iteration-mechanics          | P3       | andrew | —          | —                          |
| rules-restructure                     | P3       | andrew | —          | —                          |
| session-retitle                       | P3       | andrew | —          | —                          |
| skill-infrastructure-cleanup          | P3       | andrew | —          | —                          |
| status-hud                            | P3       | andrew | —          | —                          |
| sync-primitive-discipline             | P3       | andrew | —          | —                          |
| synthesis-modality                    | P3       | andrew | —          | —                          |

## Blocked

### Depth 1

| Work unit                     | Priority | Owner  | Depends on                                  | Cohort                     |
| ----------------------------- | -------- | ------ | ------------------------------------------- | -------------------------- |
| review-activity-contracts     | P1       | andrew | review-source-authority                     | review-protocol-alignment  |
| projection-write-back         | P1       | andrew | storage-ref-hardening, projection-substrate | storage-projection         |
| unit-scoped-review            | P2       | andrew | commit-increments                           | approval-flow-refinement   |
| documentation-surface-routing | P3       | andrew | handoff-optimization                        | agent-context-optimization |
| instruction-optimization      | P3       | andrew | composable-workflows                        | agent-context-optimization |
| workflow-template-loads       | P3       | andrew | composable-workflows                        | principle-anchored-core    |
| docs-content-sweep            | P3       | andrew | docs-site-refresh                           | release-readiness          |
| comprehension-preservation    | P3       | andrew | execution-delegation-doctrine               | —                          |

### Depth 2

| Work unit                | Priority | Owner  | Depends on                | Cohort                    |
| ------------------------ | -------- | ------ | ------------------------- | ------------------------- |
| review-request-contracts | P1       | andrew | review-activity-contracts | review-protocol-alignment |
| projection-worktrees     | P1       | andrew | projection-write-back     | storage-projection        |
| wu5-public-release       | P3       | andrew | docs-content-sweep        | release-readiness         |

### Depth 3

| Work unit                   | Priority | Owner  | Depends on                                                                                                                            | Cohort           |
| --------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| storage-cutover             | P1       | andrew | seam-delivery-review, cohort-identity-verbs, storage-ref-hardening, projection-substrate, projection-worktrees, projection-write-back | state-storage    |
| delivery-review-cardinality | P2       | andrew | review-request-contracts                                                                                                              | chunked-delivery |

### Depth 4

| Work unit                       | Priority | Owner  | Depends on      | Cohort          |
| ------------------------------- | -------- | ------ | --------------- | --------------- |
| delivery-correction-convergence | P1       | andrew | storage-cutover | —               |
| delivery-observe-attest         | P1       | andrew | storage-cutover | —               |
| work-item-relations             | P1       | andrew | storage-cutover | —               |
| wu-lifecycle-state-model        | P1       | andrew | storage-cutover | —               |
| naming-conventions              | P2       | andrew | storage-cutover | doc-conventions |
| errand-promotion-concurrency    | P2       | andrew | storage-cutover | —               |
| framework-core-from-package     | P2       | andrew | storage-cutover | —               |
| ghost-mode                      | P2       | andrew | storage-cutover | —               |
| goal-aware-direction            | P2       | andrew | storage-cutover | —               |
| history-policy                  | P2       | andrew | storage-cutover | —               |
| operational-state-docs          | P2       | andrew | storage-cutover | —               |
| shared-inbox-model              | P3       | andrew | storage-cutover | —               |

---

_Pre-commitment thinking that hasn't been sequenced yet lives in `backlog/provisional/`._
