# Metadata: Markdown Formatting Hygiene

| **State**     | **Owner** | **Branch**                 | **Class** | **Priority** |
| ------------- | --------- | -------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/markdown-formatting` | `Heavy`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-markdown-formatting.md`
- **Task List:** `tasks-markdown-formatting.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

Markdown authoring and validation now use one repository-aware formatting contract: tables align by Unicode
display width, emphasis and task descriptors follow deterministic conventions, and staged checks certify the exact
Git index without rewriting contributor changes.

### Added

- A width-aware, explicit-path table formatter with authority-aware routing, atomic writes, structural proof, and
  actionable diagnostics.
- Exact-index Markdown certification for relevant commits, including indexed configuration, dependency alignment,
  descriptor validation, unusual filenames, and linked worktrees.
- Reproducible audits that prove table and emphasis migrations preserve rendered Markdown semantics and unrelated
  bytes.

### Changed

- Selected project and Framework Markdown now uses aligned tables, underscore italics, asterisk strong emphasis,
  and loose wrapped task-descriptor clusters.
- Managed metadata, status, and readiness tables now share the linter's Unicode display-width behavior.
- Repository Markdown linting now derives its complete tracked scope from one authority selector across worktree,
  staged, package-source, rendered, generated, and excluded content classes.

### Fixed

- Linked-worktree harness projections preserve relative symbolic links, preventing copied tooling from resolving
  writes into the primary checkout.
- Current-task extraction preserves structural heading boundaries while ignoring task-like examples inside fenced
  code blocks.

## Completion Notes

The delivered formatting system combines shared Markdown authority, Unicode-aware table machinery, deterministic
emphasis and descriptor rules, migration proof, and exact-index enforcement. Package Framework content remains
source-first, configurable project copies remain independently owned, and managed or generated documents continue
through their authoritative writers rather than a generic formatter.

The implementation stayed within the RFC's boundaries: it does not reformat prose, export repository-specific lint
preferences as universal project policy, auto-fix the Git index, or broaden task-list grammar beyond descriptor
clusters and the shared structural scanner. Review-driven corrections completed the exact-index runtime dependency
closure, limited temporary-file exclusion to ARC state, and retained non-task heading boundaries in current-task
views.

Verification passed Markdown, TypeScript, and shell linting; source and test typechecks; build; the staged candidate
gate; and the full repository test suite. The final suite passed 616 files and 7,800 tests with one intentional skip.
Independent review of the corrected exact head reported no major issues.
