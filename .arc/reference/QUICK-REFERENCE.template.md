# Quick Reference - {{PROJECT_NAME}}

Command patterns and environment context for {{PROJECT_NAME}}.

## Environment & Path Context

**Repository Root**: `{{REPO_ROOT}}`
**All commands in this document assume you are at repository root.**

### Critical Path Reference

<!-- List the resources an agent needs to find quickly. Adapt to your project's stack. -->

| Resource        | Location from Repo Root | Why It Matters            |
|-----------------|-------------------------|---------------------------|
| [Resource name] | `[path]`                | [brief explanation]       |
| [Resource name] | `[path]`                | [brief explanation]       |
| ARC docs        | `.arc/`                 | Development documentation |

**Working Directory Note**: Your working directory may vary. Check WORK-STATUS.md for
current context and adjusted paths.

### Runtime Environment

<!-- Describe what's needed to run the project. Examples: -->
<!-- "Docker Compose must be running (3 containers: api, web, db)" -->
<!-- "Python 3.12+ with venv at backend/.venv/" -->
<!-- "Node.js 20+ with dependencies installed via npm" -->
<!-- "Documentation-only — no runtime services needed" -->

[Runtime description]

**Quality Tools**:

- _[Primary linter/formatter]_: `[command]`
- _[Type checker (if applicable)]_: `[command]`
- _[Test runner]_: `[command]`

---

## Command Patterns

All commands from **repository root**.

<!-- Document the commands your agents will run most often. Group by concern -->
<!-- (linting, testing, type checking, building) rather than by technology. -->
<!-- Include both "check" and "fix" variants where applicable. -->

### Linting

```bash
# Check all files
[lint_command_all]

# Check specific file
[lint_command_single]

# Auto-fix
[lint_fix_command]
```

<!-- Add additional linting commands if your project has multiple linters -->
<!-- (e.g., separate backend and frontend linters, markdown linting alongside code linting) -->

### Type Checking

<!-- Omit this section if your project doesn't use static type checking -->

```bash
# Full project
[type_check_command_all]

# Specific file or directory
[type_check_command_targeted]
```

### Testing

```bash
# Run all tests
[test_command_all]

# Run specific test file
[test_command_single]

# With coverage
[test_command_coverage]
```

<!-- If tests require services (database, containers), note that here -->

### Markdown Linting

<!-- Keep this section if your project uses ARC documentation with markdown linting -->

```bash
# Check all documentation
npx --yes markdownlint-cli2 "**/*.md"

# Check specific file (bypass config globs)
npx --yes markdownlint-cli2 --no-globs "path/to/file.md"

# Auto-fix specific file
npx --yes markdownlint-cli2 --fix --no-globs "path/to/file.md"
```

---

## Quality Gate Commands

Reference commands for DEV-RULES.PROJECT quality gates. See
[Quality Gates Strategy](strategies/arc/strategy-quality-gates.md) for the tiered approach
(when to run which level of checks).

### Incremental — Tier 1 (per-task)

<!-- Targeted commands for modified files only. Run after completing each task. -->

```bash
# Lint specific file
[lint_command_single]

# Type check specific file
[type_check_command_targeted]

# Run specific test
[test_command_single]
```

### Full Suite — Tier 3 (per-phase / pre-PR)

<!-- All checks at full project scope. Run after completing a phase or before creating a PR. -->

```bash
# 1. [Quality gate name]
[command]

# 2. [Quality gate name]
[command]

# 3. Markdown Linting
npx --yes markdownlint-cli2 "**/*.md"

# 4. Git Status Check
git status
```

---

## ARC CLI Commands

<!-- Include this section if your project uses the @arc-framework/cli package. -->

### Session State Portability

```bash
# Save user directory to git notes (called automatically at session handoff)
arc user save

# Load user directory from git notes (called automatically at session init)
arc user load

# Push/pull user notes to/from remote
arc user push
arc user pull

# Save + push in one step
arc sync
```

Push behavior is controlled by `user.sync_push` in `arc-config.yml` (`always` / `prompt` /
`manual`). Per-developer override: `git config arc.sync_push`.

### Atomic Work History

```bash
# Browse completed atomic work from commit history
arc log --atomic
```

---

## Anti-Patterns

### Path Confusion

❌ Assuming you're at repo root without checking
❌ Mixing repo-root and subdirectory paths in commands

✅ Check `pwd` first
✅ Use absolute paths or correct relative paths
✅ Reference WORK-STATUS.md for working directory context

### Command Construction

❌ Using commands from DEV-RULES.PROJECT without checking paths
❌ Assuming tools are globally available vs. project-local

✅ Use commands from this file (paths correct for repo root)
✅ Check Runtime Environment section for tool locations

<!-- Add project-specific anti-patterns as you discover them. Examples: -->
<!-- "Running tests without the database container" -->
<!-- "Forgetting to activate the virtual environment" -->
<!-- "Using wrong port for API testing" -->

---

**Commands assume repo root.** If working from a subdirectory, see WORK-STATUS.md
for adjusted paths.
