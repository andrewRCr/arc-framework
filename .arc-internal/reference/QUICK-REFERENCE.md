# Quick Reference - ARC Agentic Development Framework

**Version**: 0.2.0-dev | **Updated**: 2025-10-24

Command patterns and environment context for framework development.

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

**Note:** Without `--no-globs`, markdownlint-cli2 processes config globs in addition to specified files,
which can unnecessarily process the entire workspace.

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

### Sync Confusion

❌ Syncing active work or temporal content from CineXplorer
❌ Forgetting to de-instance project-specific details
❌ Skipping validation steps

✅ Only sync stable `.arc/reference/` improvements
✅ Only sync format/structure changes from CURRENT-SESSION
✅ Always de-instance before committing
✅ Follow sync-cinexplorer-refinements.md workflow

---

**Version Note**: Commands assume repo root. This is a documentation-only framework with markdown linting
as the primary quality gate.
