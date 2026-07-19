# Metadata: commit-message-ergonomics

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Light`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-commit-message-ergonomics.md`
- **Task List:** `tasks-commit-message-ergonomics.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/296>
- **Completed:** 2026-07-18

---

## Release Notes Entry

Release-wrapper commit submission now wraps deterministic message bodies automatically, detects effective
message-mutating hooks by manager, and offers validated retry artifacts for byte-preserved input without changing
the original source.

### Added

- `arc release commit` wraps repeated `-m` paragraphs and flat list items to the configured body width, with
  `--no-wrap` available when exact message formatting is required.
- Rejected UTF-8 file or stdin messages can be resubmitted from a validated wrapper-owned corrected retry artifact.

### Changed

- Prepare-message hook detection now follows Husky, Lefthook, pre-commit, and raw Git semantics instead of treating
  manager dispatcher shims as effective hooks.
- Wrapped message bytes are validated and committed through the same snapshot-backed transport.

### Fixed

- Structured message content—including nested lists, tables, fenced and indented code, trailers, and trailer
  continuations—remains verbatim while eligible prose is wrapped.
- Wrapping measures Unicode code points consistently with commit-message validation and preserves option operands
  that resemble wrapper-only flags.

## Completion Notes

Release-wrapper message handling now separates deterministic formatting from byte-preserving sources. Repeated
`-m` paragraphs and flat list items are cleaned and greedily wrapped to the configured validator width, then routed
through a private snapshot whenever wrapping changes the bytes so validation and Git consume the same content.
Subjects, trailers, nested structures, tables, and code blocks remain verbatim; `--no-wrap` preserves raw `-m`
formatting. File and stdin sources remain unchanged, while qualifying UTF-8 width failures produce a validated
corrected retry artifact.

The prepare-message preflight skip now asks the existing manager abstraction whether a hook is actually effective.
Husky public hooks, Lefthook commands, scripts, and jobs, pre-commit install and stage defaults, and executable raw
Git hooks each follow their native configuration semantics. Unavailable paths remain ordinary absence while
unexpected I/O failures surface, eliminating both dispatcher-shim false positives and silent configuration races.

Implementation stayed within the designed CLI and hook-manager boundaries. Review-driven follow-through hardened
wrapper-option operands, UTF-8 retry eligibility, fenced-block delimiter lengths, trailer continuations,
pre-commit's implicit all-stages default, and Unicode width measurement without expanding into full Markdown
reflow or custom unknown-manager detection. Markdown, TypeScript, and shell linting, source and test typechecking,
the production build, the complete verification suite, portability, integration, and all three E2E shards passed.
All hosted review threads are resolved, and the undeferred exact-head `ci-ok` and `merge-ok` checks are green.
