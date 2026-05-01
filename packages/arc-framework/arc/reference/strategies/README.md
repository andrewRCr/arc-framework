# Strategy Documents

Stable, long-lived patterns and architectural decisions for your project.

## Directory Structure

- **[STRATEGY-INDEX](STRATEGY-INDEX.md)** - Master index of all strategies (start here)
- **[arc/](arc/)** - ARC framework methodology strategies (universal)
- **[project/](project/)** - Project-specific strategies (your domain)
    - **[style/](project/style/)** - UI/UX styling patterns

## ARC Strategies (Framework Methodology)

These strategies apply to all ARC-adopting projects:

- **[ADR Methodology](arc/strategy-adr-methodology.md)** - Architecture Decision Record patterns
- **[Work Organization](arc/strategy-work-organization.md)** - Work categorization, git workflow, archive structure
- **[Task List Formatting](arc/strategy-task-list-formatting.md)** - Task list structure and conventions

## Naming Convention

Strategy files use the `strategy-` prefix (`strategy-authentication.md`, not `authentication.md`).
The prefix enables fuzzy-find grouping — typing `@strategy` in an editor or prompt file picker shows
all strategies together, which is useful since strategies are most often invoked manually rather than
via embedded cross-references. See [File Classification](arc/strategy-file-classification.md) §
Naming Conventions for the full rationale.

## Project Strategies (Your Domain)

Create strategies in `project/` for your project-specific patterns. See [project/README](./project/README.md)
for guidance on what to document.
