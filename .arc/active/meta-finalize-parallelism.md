# Metadata: finalize-parallelism

| **State**     | **Owner** | **Branch**                  | **Class** | **Priority** |
| ------------- | --------- | --------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/finalize-parallelism` | `Heavy`   | `P1`         |

- **Cohort:** `agile-parallelism`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-finalize-parallelism.md`
- **Task List:** `tasks-finalize-parallelism.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 9.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

ARC's parallel-worktree model is now ready for bounded multi-work-unit operation. Spawned worktrees boot with the
project dependencies and harness capabilities they need, cross-machine pickup and shared user state behave
consistently across checkouts, and lifecycle, recovery, and teardown paths fail loudly when their safety evidence
cannot be established.

### Added

- Guarded in-place materialization for resuming remote work in the current checkout, alongside the existing spawned
  pickup path.
- Focused pre-launch reconnaissance and spawn-anchored entry recipes for starting work with a fully oriented session.
- A parallelism incident playbook covering shared-state conflicts, stale projections, recovery refusals, and safe
  worktree cleanup.

### Changed

- Spawned worktrees run project post-create provisioning and receive registered harness directories before entry.
- Notes synchronization anchors machine coordination in the repository common directory, preserves branch-safe
  export ordering, and retains multiple outstanding partial-push intents.
- Identity-global user surfaces resolve to one canonical machine-local location while per-work-unit session notes
  remain checkout-local.
- Work-unit graduation validates metadata before mutation and completes spawned ceremonies in the target worktree.

### Fixed

- Recovery audits now compare the compaction seed with the live branch and HEAD lineage instead of accepting a
  clean but foreign checkout.
- Teardown refreshes protection-aware lifecycle authority, preserves valid detached husks, and refuses cleanup when
  shipped state or path identity cannot be proven.
- Errand and notes recovery messages describe actionable retry or reconciliation steps without promising automatic
  recovery from permanent failures.

### Infrastructure

- Local path comparisons canonicalize filesystem aliases for cross-platform worktree identity and containment
  checks.
- Burn-in coverage spans concurrent planning fixtures, code work units, Errand drains, teardown, and cross-machine
  resume across four waves.

### Security

- Destructive worktree and branch cleanup fails closed on unresolved lifecycle refs, remote refresh failures, and
  operational filesystem-identity errors.

## Completion Notes

This closeout turned ARC's independently shipped parallelism components into one verified operating model. The
driving concern was not adding more concurrency, but proving that bounded concurrent work preserves attention and
state across the seams between worktree creation, session entry, user-note synchronization, lifecycle transitions,
integration, teardown, and cross-machine resume. A shared-mutable-surface matrix classified those seams as loud or
silent, and every silent GA blocker either received a contained build item or an explicit limitation with recovery
guidance.

Six build items landed: spawned-worktree dependency and harness provisioning; guarded in-place materialization;
repository-common notes locking, export ordering, and multi-intent markers; CLI-complete spawned-start ceremonies;
validate-first graduation; and canonical identity-global user-surface binding. The closeout also hardened recovery
lineage auditing, filesystem path identity, lifecycle-authority refresh, detached self-teardown behavior, and
user-facing recovery guidance. The concurrency and Errand strategies now describe the as-built execution loci and
carry an incident playbook for the accepted failure modes.

Four burn-in waves exercised the model through synthetic planning fixtures, real code work units, a live Errand and
housekeep drain, and a second-machine resume. The workload deliberately evolved with the evidence: purpose-built
fixtures replaced an unsatisfiable "Light doc WU" premise; a planned re-graduation was superseded by equivalent live
ceremony-locus evidence; the destructive old-shape metadata lane, in-place materialization arm, and selected
machine-independent detectors used focused tests or earlier induced evidence when no safe independent live target
remained. Those substitutions are recorded in the task-list success criteria. The post-remediation CI cost sample
was likewise approved for routine post-GA observation because only the remediation merge run existed at the gate,
with the self-hosted-runner option retained as an escape hatch. Burn-in evidence also dismissed the proposed
mid-session shift verb: cross-worktree reads or a fresh spawn-anchored session covered every observed case.

Verification passed Markdown, TypeScript, and shell linting; source and test typechecking; build; package/project
sync; focused unit and E2E regressions; and the full suite with 477 test files and 6,128 tests passing, plus one
intentional skip in each count. Two fresh adversarial passes converged after correcting evidence attribution, and
the local frontline review closed five material findings and five minor corrections while rejecting three findings
that conflicted with recorded acceptance decisions. PROJECT-PRD and TECHNICAL-OVERVIEW alignment found no conflict:
the result operationalizes bounded collaboration, typed lifecycle tooling, injected library boundaries, and
cross-platform Git behavior without expanding ARC into autonomous execution or unbounded parallelism.
