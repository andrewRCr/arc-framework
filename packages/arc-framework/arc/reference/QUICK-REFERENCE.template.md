# Quick Reference - {{PROJECT_NAME}}

Command patterns and environment context for {{PROJECT_NAME}}.

## Environment & Path Context

**Repository Root**: Current checkout root (the directory containing `.arc/`).
**All commands in this document assume you are at repository root.**

**On-demand sections**: `Command Patterns`, `Quality Gate Commands`, `ARC CLI Commands` —
load on demand when workflow steps reference them.

### Critical Path Reference

<!-- List the resources an agent needs to find quickly. Adapt to your project's stack. -->

| Resource        | Location from Repo Root | Why It Matters            |
|-----------------|-------------------------|---------------------------|
| [Resource name] | `[path]`                | [brief explanation]       |
| [Resource name] | `[path]`                | [brief explanation]       |
| ARC docs        | `.arc/`                 | Development documentation |

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
<!-- (code linting, markdown linting, testing, type checking, building). -->
<!-- Include both "check" and "fix" variants where applicable. -->

### Code Linting

```bash
# Check all files
[lint_command_all]

# Check specific file
[lint_command_single]

# Auto-fix
[lint_fix_command]
```

### Markdown Linting

<!-- ARC documentation benefits from markdown linting. Fill in your tool's commands below. -->
<!-- Example using markdownlint-cli2 (zero-install via npx): -->
<!-- npx --yes markdownlint-cli2 "**/*.md" -->
<!-- npx --yes markdownlint-cli2 --no-globs "path/to/file.md" -->
<!-- npx --yes markdownlint-cli2 --fix --no-globs "path/to/file.md" -->

```bash
# Check all documentation
[md_lint_command_all]

# Check specific file
[md_lint_command_single]

# Auto-fix specific file
[md_lint_fix_command]
```

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

### Integration — Tier 2 (coherent unit)

<!-- Project-scoped checks. Run after completing a parent task or coherent unit. -->

```bash
# Full markdown lint
[md_lint_command_all]

# Full code lint + type check
[lint_command_all]
[type_check_command_all]

# Full test suite (or relevant subset)
[test_command_all]
```

### Full Suite — Tier 3 (per-phase / pre-PR)

<!-- All checks at full project scope. Run after completing a phase or before creating a PR. -->

```bash
# 1. [Quality gate name]
[command]

# 2. [Quality gate name]
[command]

# 3. Markdown Linting
[md_lint_command_all]

# 4. Git Status Check
git status
```

---

## ARC CLI Commands

### Setup and Configuration

```bash
# Initialize ARC in a new project
arc init

# Join an existing ARC project (personal workspace: role, identity, skills)
arc join

# Change structural project settings (pm.mode, team.mode, project name)
arc init --reconfigure

# Change personal workspace settings (role, tools)
arc join --reconfigure

# Preview reconfigure changes without applying
arc init --reconfigure --dry-run

# Update framework files to the latest version
arc update
```

### Session State Portability

```bash
# Save user directory to git notes (called automatically at session handoff)
arc user save

# Load user directory from git notes on HEAD or a reachable ancestor
arc user load --max-walk 1000

# Skip overwrite prompts when loading/pulling in automation or non-interactive flows
arc user load --yes

# Fetch another developer's notes ref without overwriting local files
arc user fetch --identity teammate

# Pull remote notes into the local user directory
arc user pull --yes --max-walk 1000

# Push/pull user notes to/from remote
arc user push

# Direction-aware save/push or fetch/pull, depending on sync state
arc sync
```

See [Session Operations Strategy](strategies/arc/strategy-session-operations.md) § Session
State Portability for the portability model, `arc sync` direction semantics, and
`user.notes_push` push policy.

### Release Wrappers

```bash
# Wrapped `git commit` — validates interlock state and branch protection, refuses
# destructive flags (--amend, --no-verify, --allow-empty), writes one audit entry
arc release commit -m "feat(scope): subject"

# Wrapped `git push` (worktree leg) — validates pushability matrix and interlock,
# refuses destructive flags (--force, --force-with-lease, --mirror, +refspec, --delete)
arc release push

# Record per-developer opt-in (writes `arc.releaseOptedIn: true` to local git config)
arc release opt-in

# Record per-developer opt-out (writes `arc.releaseOptedIn: false` to local git config —
# captures explicit decline, idempotent on already-`false`)
arc release opt-out

# Show resolved opt-in flag and interlock states with provenance
arc release status

# Same as above as a structured envelope (`schemaVersion: 2`)
arc release status --json
```

Refusal exit codes 10–14 cover `no-active-wu`, `interlock-not-authorized`, `destructive-flag`,
`branch-protection-violation`, and `pushability-precheck-failed`; audit entries land at
`.arc/user/{identity}/.internal/.audit-log.jsonl`. See
[DEV-RULES.ARC](constitution/DEV-RULES.ARC.md) § Commit Discipline for the trust model and
opt-in semantics.

### Atomic Work History

```bash
# Browse completed atomic work from commit history
arc log --atomic
```

<!-- arc:if platform.type != github -->

---

## Platform Commands

<!-- CLI commands for your git hosting platform (e.g., glab for GitLab, tea for Gitea).
     ARC workflows reference this section for platform-appropriate alternatives to the
     GitHub defaults (`gh pr create`, `gh pr view`, `gh issue create`). Fill in what
     your team uses. -->

| Operation    | Command                    |
|--------------|----------------------------|
| Create PR/MR | `[platform CLI create]`    |
| List PRs/MRs | `[platform CLI list]`      |
| Create issue | `[platform CLI issue new]` |

<!-- arc:endif -->
