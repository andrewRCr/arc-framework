# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Work Categorization Strategy document (`.arc/reference/strategies/strategy-work-categorization.md`) - comprehensive
  guidance on three-way work split (feature/technical/incidental) with decision rules and git workflow patterns
- Work categorization references in DEVELOPMENT-RULES (framework and template versions) for immediate discoverability
- Session initialization workflow (`.arc/reference/workflows/supplemental/session-init.md`) for consistent AI agent
  context loading
- AI instructions architecture with AGENTS.md as central reference card, inherited by tool-specific files
  (CLAUDE.md, GEMINI.md, WARP.md, copilot-instructions.md)
- QUICK-REFERENCE.md for environment context and command patterns (framework and template versions)
- Task list maintenance workflow (`.arc/reference/workflows/supplemental/maintain-task-notes.md`)
- Work-categorized directory structure in active/, upcoming/, and archive/ (2025-10-24)
- Agent pre-merge review workflow for comprehensive pre-PR quality checks

### Changed

- Session handoff workflow enhanced with working directory context warnings and pre-update verification protocol
- Strategies README transformed from minimal placeholder to useful index of available strategy documents
- Directory structure migrated from doc-type organization to work-categorization throughout lifecycle (2025-10-24)
    - Active: feature/, technical/, incidental/ subdirectories (flat structure)
    - Upcoming: feature/, technical/ subdirectories (no incidental planning)
    - Archive: feature/, technical/, incidental/ with conditional work-level nesting
- Core workflows synced from CineXplorer (1-create-prd, 2-generate-tasks, 3-process-task-loop)
- 7 supplemental workflows synced from CineXplorer with battle-tested refinements
- 5 AI instruction files synced with collaboration protocol enhancements
- 4 constitutional template documents streamlined (48% size reduction, cleaner structure)
- Migrated to markdownlint-cli2 with 4-space indent and 120-character line length standards

### Removed

- AI-SHARED.md (consolidated into AGENTS.md for better tool auto-discovery)
- Old doc-type archive organization (completion-metadata/, notes/, prds/, tasks/)
- Old upcoming structure (prds/, notes/, tasks/ subdirectories)

### Infrastructure

- Initial repository scaffold and _docs system structure

<!-- Versioned releases will begin at 1.0.0 when system is ready for public use -->
