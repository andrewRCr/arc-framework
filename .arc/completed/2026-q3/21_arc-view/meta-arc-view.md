# Metadata: arc-view

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Light`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-arc-view.md`
- **Task List:** `tasks-arc-view.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 4.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/290>
- **Completed:** 2026-07-18

## Release Notes Entry

ARC can now resolve the current work context and render its artifacts directly in the terminal. The new view command
supports one-shot pager output for interactive reading and stable plain output for pipelines, with task-aware context
that makes the active position visible without opening an editor.

### Added

- `arc view [kind]` resolves tasks, specs, drafts, metadata, notes, cohort context, session notes, working memory,
  and personal or project inboxes; bare `arc view` defaults to the active task list.
- Interactive output detects Glow, Bat, or a plain pager, with a personal `arc.viewRenderer` Git configuration
  override and a functional plain fallback.
- Task views include phase, task, completion, and rendered-time context; `arc view tasks --current` emits the bare
  current-task region for pipelines and `watch`.
- Pager rendering opens at the current task where supported, including rendered-heading anchoring for Glow.

### Changed

- Terminal width now drives Glow paragraph and list reflow while preserving Markdown structure and an intentional
  gutter across narrow and wide terminals.

### Fixed

- Non-TTY and stdout-only pipelines bypass renderers without hanging or hiding the CLI's exit status.
- Missing optional artifacts, malformed task lists, invalid renderer configuration, and unreadable paths now degrade
  through explicit output or errors instead of producing ambiguous rendering behavior.
- Glow normalization preserves fenced code, quoted fences, Setext headings, list continuations, and Unicode display
  width at narrow terminal sizes.

### Infrastructure

- Unicode-aware terminal wrapping uses the packaged `string-width` runtime dependency; no separate installation is
  required.

## Completion Notes

The work delivered the planned read-only inspection surface through the existing CLI layering: Commander wiring,
an I/O handler, a testable view orchestrator, and shared resolver/library seams. Artifact kinds remain semantic and
resolver-backed, so the command does not construct storage paths or couple its public contract to today's tracked
Markdown layout. Identity-global surfaces still resolve through the primary checkout while per-work-unit context
remains local to the active worktree.

Implementation testing refined the original renderer plan in two useful ways. Glow gained terminal-aware semantic
reflow with Unicode display-width accounting instead of a fixed width, and its planned unanchored degrade was
superseded by a rendered-heading search through the pager. Review and adversarial verification also tightened exact
session-note resolution, non-ENOENT failure handling, blockquote and Setext preservation, stdout-only pipeline
behavior, completed-task context, and validation ordering without expanding the command into watch or TUI behavior.

Verification passed Markdown, TypeScript, and shell linting; source and test typechecking; the production build; and
the full local suite with 6,277 tests passing and one intentional skip. The adversarial pass's two conformance gaps
were fixed, frontline review findings were addressed, and all hosted CI legs passed on the reconciled final head,
including Linux E2E shards and macOS/Windows portability coverage.

---
