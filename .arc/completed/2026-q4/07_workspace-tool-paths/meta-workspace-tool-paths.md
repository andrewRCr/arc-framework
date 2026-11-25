# Metadata: workspace-tool-paths

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-workspace-tool-paths.md`
- **Task List:** `tasks-workspace-tool-paths.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:cbc60ddbc3a8fbd81eaf30413893ad6e6cc269816761fc4b9aaeb262de121917`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/819>
- **Completed:** 2026-10-05

## Release Notes Entry

Repository development commands now support focused repository-relative targets and reuse qualified runtime/schema
output while keeping supported test runs and builds coordinated.

### Added

- Repository-root `test:file` accepts existing repository-relative test files or directories and native execution
  options through one ordinary npm separator.

### Changed

- Root `lint:ts:file` resolves repository-relative targets while preserving package-local conventions and the
  native semantics of forwarded options and patterns.
- Supported test controllers prepare runtime/schema output only when needed and hold it through execution and
  cleanup. Builds in the same checkout wait for those tests; separate worktrees retain independent ownership.
- CI consumers qualify transferred artifacts against local inputs and installation before skip-build execution.
  Full builds continue to verify declarations.

### Fixed

- Test preparation repairs incomplete build metadata before reuse. Skip-build execution refuses incomplete output
  until matching artifacts have been prepared.
- Empty test selections, zero completed cases, and errors discovered during controller closing produce failing
  results with actionable diagnostics.

## Completion Notes

Repository-root focused test and TypeScript lint commands now use explicit repository-relative targets while
package-local invocations retain native path conventions. Supported test controllers preserve configured project
membership and native execution options, validate discovery and completed cases, and retain artifact ownership through
closing. Native compiler graphs, selected source contents, resolver controls, and installation context qualify
runtime/schema reuse. Builds publish staged output and freshness evidence under retained ownership; full builds
continue to generate declarations. CI consumers qualify transferred output before skip-build execution.

All six implementation phases and fourteen unchanged success criteria closed. Unmanaged native invocations retain
their generation-only boundary; watch/browser/UI orchestration, editor isolation, remote caching, and ARC state-storage
redesign remain outside the delivered scope. One independent criteria pass returned no findings; primary verification
was refreshed after base reconciliation and the approved review correction. The optional successor criteria pass was
declined. Three focused fixture invocations isolate deliberate native execution and `.only` assertions from CI defaults.
Main was reconciled with automatic source composition and a CLI-regenerated ROADMAP.

Final source verification passed the complete routine local lane with 16,372 passing cases and 1,188 skipped, all
19 cases in the affected build regression files, and the integration packaging check. Both type programs, TypeScript
and shell lint, Markdown lint, all three ARC contract checks, and the full declaration build passed. The routine run
used native `--maxWorkers 4` to limit the outer controller while preserving fixture defaults, cases, and assertions.
Earlier default-parallelism verification hit an existing subprocess fixture's five-second timeout; an inherited worker
variable also changed nested fixture assumptions and was replaced by the native invocation.

Hosted Codex reviewed the complete change set twice. The second pass returned one minor defect: test preparation could
reuse output missing the metafile consumed by the integration packaging check. The approved correction requires usable
metadata for test/full qualification and staged publication. Regression coverage proved refusal on the unfixed source,
then verified refusal, repair, skip-build recovery, and preserved runtime-only CLI freshness. Its hosted thread was
settled. Standard review closed by Owner acceptance after the verified fix and two completed passes; no third pass ran.
Required CI and exact-head merge authorization remain separate integration gates.

---
