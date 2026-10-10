# Metadata: Quality Gates and Hook Integration

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-quality-gate-hooks.md`
- **Task List:** `tasks-quality-gate-hooks.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:3492ba2107ef6b58f1ad07c35220adfe6bc6c5ce73f9998c56faddf258303484`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/883>
- **Completed:** 2026-10-10

## Release Notes Entry

Projects can declare checks once and use the same CLI selection and execution from local hooks, workflow steps and CI.
Content and runtime fingerprints allow qualifying passes to be reused while event deadlines and explicit forced
verification remain enforced.

### Added

- A typed check declaration for commands, dependency inputs, runtime fingerprints and commit, push or merge deadlines.
- `arc check` requests for named checks, gates, increments, unpublished segments and new heads, with dry-run and JSON
  reports.
- Failure reports with executable retry commands and explicit selection and reuse outcomes.

### Changed

- Commit and push hooks dispatch declared checks through the supported hook-manager integrations.
- Setup and update propose declarations from existing gate commands when retiring legacy tier guidance.
- Check execution preserves the staged content boundary and handles fixer restaging and partial staging explicitly.

### Removed

- Fixed quality tiers, duplicated gate command lists and their retired extension and script surfaces.

### Fixed

- Retry commands preserve repository paths that look like CLI options.
- Check readers retain the selected index and base through native hook and range execution.

## Completion Notes

The implementation replaces fixed tiers with a stack-agnostic declaration and shared check resolver, including input
selection, content/runtime reuse keys, scheduling, structured outcomes, staged execution, fixers and recovery. The
repository consumes the same contract for its existing hooks, related test feedback and CI requests. Legacy command
extraction, retirement guidance and framework/project counterparts are included.

Attestation freshness and the wider review and delivery policy remain outside this change. Verification still forces
the scope required by those protocols. The forward-slice Errand for equivalent-input convergence reuse is captured
separately; its record and invalidation obligations remain intact.

Full local merge verification passed, including both type checks, build, unit, integration and contract tests. The
local E2E feedback run passed 1,019 cases. Non-author standard pass 3 returned clean after complete correction, seam
and aggregate coverage. The current flat 22-criterion verification record preserves immutable criterion text and binds
each current ordinal and digest. CI-only E2E and portability remain host-enforced checks; this local record does not
assert a hosted result or merge authorization.

---
