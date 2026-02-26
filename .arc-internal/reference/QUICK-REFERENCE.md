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

- Markdown linting via pinned local `markdownlint-cli2` (`npm run lint:md`)
- Git for version control

---

## Command Patterns

All commands from **repository root**.

### Markdown Linting

```bash
# Install local tooling once (preferred)
npm install

# Lint all documentation (preferred: pinned local version)
npm run -s lint:md

# Lint specific file (use --no-globs to avoid re-processing config globs)
npm run -s lint:md:file -- "path/to/file.md"

# Auto-fix specific file
npm run -s lint:md:fix:file -- "path/to/file.md"

# Lint specific directory
npx --yes markdownlint-cli2 ".arc/reference/**/*.md"
```

**Important:**

- Without `--no-globs`, markdownlint-cli2 processes config globs **in addition to** specified files
- Use `--no-globs` when checking/fixing individual files to avoid processing entire workspace
- If local dependencies are unavailable, use fallback: `npx --yes markdownlint-cli2 ...`
- `markdownlint-cli2 --fix` does NOT fix MD060 (table alignment) - use `markdown-table-prettify` instead:

```bash
# Fix table formatting (MD060 violations)
npx --yes markdown-table-prettify < input.md > output.md
# Or use VS Code extension: "Markdown Table Prettifier"
```

### Prettier (Markdown Formatting)

Use `prettier` for bulk line-length wrapping (MD013) and table alignment (MD060). It's
markdown-aware — won't break inside links, emphasis, or code spans.

```bash
# Format a file (prose wrap at 120 chars, matching markdownlint config)
npx --yes prettier --prose-wrap always --print-width 120 --parser markdown "path/to/file.md"

# Preview without writing (pipe to temp file, diff, then copy if good)
npx --yes prettier --prose-wrap always --print-width 120 --parser markdown "file.md" > /tmp/fmt.md
```

**When to use prettier vs. manual wrapping:**

- **Prettier**: Bulk formatting — new files, agent-generated content, 10+ line-length
  violations. Handles wrapping, table alignment, and indentation in one pass.
- **Manual**: Surgical fixes — 1-5 violations where you can wrap at a natural break
  point without reformatting surrounding prose.

**Gotchas:**

- Adjacent bold metadata lines (e.g., `**Date:**` / `**Purpose:**` on consecutive
  lines) get merged into one paragraph. Add `\` line breaks or blank lines between
  them, or fix manually after running prettier.
- Converts `*emphasis*` to `_emphasis_` (stylistic, not a lint issue).
- Re-indents code blocks inside list items to 4-space indent (correct per MD007 config,
  but may change existing formatting).

---

## Quality Gate Commands

Reference for DEVELOPMENT-RULES quality gates. Run before any commit.

```bash
# 1. Markdown Linting (zero violations required)
npm run -s lint:md

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
