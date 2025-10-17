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

### Changed

- Session handoff workflow enhanced with working directory context warnings and pre-update verification protocol
- Strategies README transformed from minimal placeholder to useful index of available strategy documents

### Removed

- AI-SHARED.md (consolidated into AGENTS.md for better tool auto-discovery)

### Infrastructure

- Initial repository scaffold and _docs system structure

<!-- Versioned releases will begin at 1.0.0 when system is ready for public use -->
