# Quick Reference - ARC Agentic Development Framework

**Version**: 0.3.0-dev | **Updated**: 2025-12-26

Command patterns and environment context for framework development.

## About This Reference Directory

**Read every session:**

- `DEVELOPMENT-RULES.md` (constitution/) - Rules and quality standards
- `QUICK-REFERENCE.md` (this file) - Environment and commands
- `CURRENT-SESSION.md` (active/) - Work status and next actions

**Key documentation** (paths relative to `.arc-internal/`):

- `reference/constitution/` - Project principles (META-PRD, DEVELOPMENT-RULES)
- `reference/strategies/` - Technical approaches (ADR methodology, task formatting, work organization)
- `system/agent/` - AI-specific guidance (AGENTS.md, CLAUDE.md, GEMINI.md, WARP.md, copilot-instructions.md)
- `system/workflows/` - Core process guides (setup, create-prd, generate-tasks, process-task-loop)
- `system/workflows/arc/supplemental/` - Supporting workflows (atomic-commit, session-handoff, manage-incidental-work)

---

## Environment & Path Context

**Repository Root**: `/home/andrew/dev/arc-agentic-dev-framework/`
**All commands in this document assume you are at repository root.**

### Critical Path Reference

| Resource           | Location from Repo Root       | Why It Matters                        |
|--------------------|-------------------------------|---------------------------------------|
| Template documents | `.arc/reference/`             | Template/example content for adopters |
| Internal docs      | `.arc-internal/reference/`    | Framework-specific documentation      |
| Active work        | `.arc-internal/active/`       | Current feature work                  |
| Quality gate       | `npx --yes markdownlint-cli2` | Zero-tolerance linting                |

**Working Directory Note**: This is a documentation-only framework. All work happens at repository root.

### Runtime Environment

**No Runtime Containers**: This framework is documentation-only (no backend, frontend, database, or services).

**Quality Tools**:

- Markdown linting via `npx --yes markdownlint-cli` (primary quality gate)
- Git for version control

---

## Command Patterns

All commands from **repository root**.

### Markdown Linting

```bash
# Lint all documentation
npx --yes markdownlint-cli2 "**/*.md"

# Lint specific file (use --no-globs to avoid re-processing config globs)
npx --yes markdownlint-cli2 --no-globs "path/to/file.md"

# Auto-fix specific file
npx --yes markdownlint-cli2 --fix --no-globs "path/to/file.md"

# Lint specific directory
npx --yes markdownlint-cli2 ".arc/reference/**/*.md"
```

**Important:**

- Without `--no-globs`, markdownlint-cli2 processes config globs **in addition to** specified files
- Use `--no-globs` when checking/fixing individual files to avoid processing entire workspace
- `markdownlint-cli2 --fix` does NOT fix MD060 (table alignment) - use `markdown-table-prettify` instead:

```bash
# Fix table formatting (MD060 violations)
npx --yes markdown-table-prettify < input.md > output.md
# Or use VS Code extension: "Markdown Table Prettifier"
```

---

## Quality Gate Commands

Reference for DEVELOPMENT-RULES quality gates. Run before any commit.

```bash
# 1. Markdown Linting (zero violations required)
npx --yes markdownlint-cli2 "**/*.md"

# 2. Git Status Check
git status

# 3. Review Changes
git --no-pager diff --stat
```

---

## Anti-Patterns

### Path Confusion

❌ Forgetting this is documentation-only (no Docker, no services)
❌ Assuming complex build/test infrastructure exists
❌ Using commands meant for application projects

✅ Remember: Markdown linting is the primary quality gate
✅ All work is documentation editing
✅ Git is the only runtime "service" needed

### Command Construction

❌ Running backend/frontend commands (no code to run)
❌ Looking for test suites (documentation doesn't have unit tests)
❌ Assuming venv or Docker are needed

✅ Use npx for markdown linting (always available)
✅ Focus on documentation quality
✅ Follow framework-specific workflows

---

**Version Note**: Commands assume repo root. This is a documentation-only framework with markdown linting
as the primary quality gate.
