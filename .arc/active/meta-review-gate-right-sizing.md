# Metadata: review-gate-right-sizing

| **State**     | **Owner** | **Branch**                      | **Class** | **Priority** |
| ------------- | --------- | ------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/review-gate-right-sizing` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-review-gate-right-sizing.md`
- **Task List:** `tasks-review-gate-right-sizing.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

ARC review integration now uses one typed, provider-neutral loop for frontline, local, and hosted review, with
human judgment focused on finding disposition and final release rather than routine orchestration. Projects may
add an independently opt-in exact-head `arc-cleared` merge guard without adopting evidence-grade review authority.

### Added

- Hosted-review request, bounded-await, and supported thread-settlement commands for CodeRabbit and Codex PR
  reviews, plus ordered safe fallback across configured standard-review sources.
- Lifecycle readiness and exact-head unlock commands, a pinned `arc-clearance` workflow, and setup guidance for
  projects that choose to require the merge guard.
- A concise final PR review record that separates local and hosted activity, names the triage approver, and
  discloses carried review coverage across later narrow changes.

### Changed

- Work-unit and Errand integration now dispatch review mechanics through typed CLI actions while leaving bounded
  applicability and review-strength decisions to the operating agent.
- Self-hosting review configuration uses CodeRabbit CLI for frontline review and ordered CodeRabbit, Codex, and
  delegated-agent sources for the standard-review stream; package defaults remain unconfigured.

### Removed

- The shadow review controller, GitHub App and wakeup machinery, evidence-grade attestation and qualification
  paths, redundant review workflows and scripts, and the three superseded gate work units.

## Completion Notes

The delivered review model replaces the shadow evidence gate with a smaller operational loop anchored on human
finding disposition. Deterministic mechanics now live behind typed commands: immutable target binding, ordered
source fallback, bounded hosted awaiting, runtime-owned result normalization, supported finding settlement,
lifecycle readiness, and exact-head unlock. The operating agent retains judgment over later-head applicability and
review strength, while the independently configured `arc-cleared` status is the only structural merge lock.

The cut also removed the controller-era workflows, App integration, launchers, evidence authorities, and tests whose
only consumer disappeared. The surviving architecture keeps both hosted adapters, local delegated review,
frontline review, chunking, and extension seams without representing any of them as autonomous merge authority.
Default installations still complete integration with empty review-source lists and no merge guard.

One live-fixture clause was superseded: CodeRabbit hosted ran two complete reviews on PR #348, but the separate
CodeRabbit CLI frontline leg was not run before the disposable fixture closed. The hosted passes produced 20 and
14 actionable findings, which were dispositioned and settled where supported; their broad follow-up delta received
independent chunked and exact-delta local review rather than a third hosted pass. Exact default-branch guard
activation remains intentionally post-merge because the pinned workflow cannot operate until it exists on `main`.

Verification passed Markdown, TypeScript, and shell linting; source and test typechecks; build; projected-copy
checks; and the full repository suite on the reconciled mainline. The final suite passed 564 files and 7,523 tests
with one environment-gated skip. Subsequent reconciliation and lifecycle-only documentation changes received
targeted verification without claiming another complete hosted review on their later heads.

---
