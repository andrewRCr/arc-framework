# Quick Reference - ARC Agentic Development Framework

Command patterns and environment context for the ARC framework.

## Environment & Path Context

**Repository Root**: `/home/andrew/dev/arc-agentic-dev-framework/`
**All commands in this document assume you are at repository root.**

### Critical Path Reference

| Resource           | Location from Repo Root          | Why It Matters                        |
|--------------------|----------------------------------|---------------------------------------|
| Template documents | `.arc/reference/`                | Template/example content for adopters |
| Internal docs      | `.arc-internal/reference/`       | Framework-specific documentation      |
| Active work        | `.arc-internal/active/`          | Current feature work                  |
| CLI package        | `packages/arc-framework/`        | `@arc-framework/cli` npm package      |
| Quality gates      | `npm run -s lint:md`, `npm test` | Zero-tolerance checks                 |

**Working Directory Note**: This is a hybrid project — documentation (`.arc/`, `.arc-internal/`) plus a
TypeScript CLI package (`packages/arc-framework/`). All commands run from repository root; npm workspaces
delegates to the CLI package automatically.

### Runtime Environment

**No Runtime Containers**: No backend, frontend, database, or services. The CLI package builds locally
via tsup.

**Quality Tools**:

- Markdown linting via pinned local `markdownlint-cli2` (`npm run -s lint:md`)
- TypeScript type checking (`npm run typecheck`)
- Vitest test suite (`npm test`)
- tsup build (`npm run build`)
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
- `markdownlint-cli2 --fix` does NOT fix MD060 (table alignment) — use `markdown-table-prettify` instead:

```bash
# Fix table formatting (MD060 violations)
npx --yes markdown-table-prettify < input.md > output.md
# Or use VS Code extension: "Markdown Table Prettifier"
```

### Prettier (Markdown Formatting)

Use `prettier` for bulk line-length wrapping (MD013). It's markdown-aware — won't
break inside links, emphasis, or code spans. **Not recommended for MD060** (table
alignment) — use `markdown-table-prettify` instead, which fixes tables without
reformatting surrounding prose.

```bash
# Format a file (prose wrap at 120 chars, matching markdownlint config)
npx --yes prettier --prose-wrap always --print-width 120 --parser markdown "path/to/file.md"

# Preview without writing (pipe to temp file, diff, then copy if good)
npx --yes prettier --prose-wrap always --print-width 120 --parser markdown "file.md" > /tmp/fmt.md
```

**When to use prettier vs. manual wrapping:**

- **Prettier**: Bulk formatting — new files, agent-generated content, 10+ line-length
  violations. Handles wrapping and indentation in one pass.
- **Manual**: Surgical fixes — 1-5 violations where you can wrap at a natural break
  point without reformatting surrounding prose.

**Gotchas:**

- Adjacent bold metadata lines (e.g., `**Date:**` / `**Purpose:**` on consecutive
  lines) get merged into one paragraph. Add `\` line breaks or blank lines between
  them, or fix manually after running prettier.
- Converts `*emphasis*` to `_emphasis_` (stylistic, not a lint issue).
- Re-indents code blocks inside list items to 4-space indent (correct per MD007 config,
  but may change existing formatting).

### TypeScript / Build / Test

```bash
# Build CLI package (ESM output with shebang and declarations)
npm run build

# Type checking (strict mode, no emit)
npm run typecheck

# Run full test suite
npm test

# Run unit tests only
npm run test:unit

# Run tests in watch mode (during development)
npm run -w packages/arc-framework test:watch
```

---

## Quality Gate Commands

Reference commands for DEV-RULES.PROJECT quality gates. See
[Quality Gates Strategy][quality-gates] for the tiered approach (when to run which level of checks).

### Incremental — Tier 1 (per-task)

```bash
# Lint specific markdown file
npm run -s lint:md:file -- "path/to/file.md"

# Run relevant unit tests (for code changes)
npm run test:unit
```

### Integration — Tier 2 (coherent unit)

```bash
# Full markdown lint + type check + test suite
npm run -s lint:md
npm run typecheck
npm test
```

### Full Suite — Tier 3 (per-phase / pre-PR)

```bash
# 1. Markdown Linting (zero violations required)
npm run -s lint:md

# 2. TypeScript (zero errors required)
npm run typecheck

# 3. Full test suite (all pass required)
npm test

# 4. Build verification
npm run build

# 5. Git Status Check
git status

# 6. Review Changes
git --no-pager diff --stat
```

---

## Anti-Patterns

### Path Confusion

❌ Running commands from inside `packages/arc-framework/` (use repo root — npm workspaces delegates)
❌ Assuming Docker, venv, or backend services exist
❌ Forgetting markdown linting applies to `.arc/` and `.arc-internal/` docs alongside code quality

✅ All commands from repo root
✅ `npm run build/test/typecheck` delegate to the CLI workspace automatically
✅ Markdown linting and code quality gates are both enforced

### Command Construction

❌ Using `-w` flag for routine commands (root convenience scripts already delegate)
❌ Running `npx tsc` or `npx vitest` directly (use npm scripts for consistent config)

✅ Use commands from this file (paths correct for repo root)
✅ Follow framework-specific workflows

---

**Commands assume repo root.** This is a hybrid documentation + TypeScript project with markdown
linting and code quality gates.

---

[quality-gates]: ../../.arc/reference/strategies/arc/strategy-quality-gates.md
