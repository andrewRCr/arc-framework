# Git Hooks

Git hooks that enforce ARC commit standards automatically. These run on every commit — no manual
invocation needed.

## Setup

```bash
# One-time configuration (from repository root)
git config core.hooksPath .arc/system/githooks
```

Hooks must be executable:

```bash
chmod +x .arc/system/githooks/commit-msg .arc/system/githooks/pre-commit
```

## What Gets Validated

### commit-msg — Message Format

Enforces the commit message standard defined in
[DEV-RULES.ARC.md](../../reference/constitution/DEV-RULES.ARC.md) § Commit format:

**Errors (blocks commit):**

- Conventional Commits format: `<type>(scope): description` (when `commit.format: conventional`)
- Custom format pattern match (when `commit.format: custom`)
- Subject line length: 10–`hooks.subject_max_length` characters (default 72; skipped when
  `commit.format: any`)
- `Context:` footer present with valid format (when `commit.context_footer: required`)
- Task reference format (parenthetical required)
- Invalid regex in `commit.custom_pattern` or `commit.context_pattern`
- Unknown `commit.context_footer` value

**Warnings (allows commit):**

- Subject line over `hooks.subject_warn_length` characters (default 60, accounts for conventional
  commit prefix overhead)
- Body over 15 lines (warns at 15; warns again at 25 for milestones)
- "Phase X.Y" usage (should be "Task X.Y")
- Task list file not found in active directories
- Context footer issues when `commit.context_footer: recommended`
- Contributor using non-`contribution` context footer pattern
- WORK-STATUS.md not advanced when committing a completed parent task

### pre-commit — File Safety

**Errors (blocks commit):**

- Base branch commit protection in `full` mode (all changes require branches and PR review)
- Merge conflict markers in staged files
- Sensitive files (`.env`, `credentials.json`, etc.)
- Invalid task numbering format in task lists (third level must use letters: 1.1.a not 1.1.1) —
  configurable via `hooks.task_numbering` (`error` | `warning` | `off`)
- Meta-project references (task IDs, phase numbers) in added lines of production code

**Warnings (allows commit):**

- Detached HEAD state (commits may be lost)
- Base branch commit protection in `partial` mode (planned work should use branches)
- Large files (> 1MB, measured from staged content)
- Debug statements (`console.log`, `debugger`, `pdb`, `breakpoint()`) in added lines
- Modified task lists not staged (maintainer only)
- Task list staged with completions but WORK-STATUS.md not co-staged (maintainer only)
- Task list changes without `(@name)` ownership markers (team mode only)

## Role-Aware Behavior

Hooks read `arc.role` from git config (set during `arc init` or `arc join`).

**Maintainer** (default): All checks run. Task list staging, task numbering, and WORK-STATUS
co-staging checks are active.

**Contributor**: Maintainer-only checks are skipped with a notice. A soft warning fires if the
contributor uses a non-`contribution` context footer pattern. Protected path warnings fire when
staging files in `.arc/active/` or `.arc/backlog/`.

## Team Mode Behavior

When `team.mode: true` in `arc-config.yml`, the pre-commit hook adds a check for `(@name)`
ownership markers in task list changes. This helps prevent coordination conflicts when multiple
developers work on the same task list. Advisory only — does not block commits.

## Configuration (`arc-config.yml`)

Hook behavior is controlled by settings in `.arc/system/arc-config.yml`. Key settings:

| Setting | Default | Effect |
| ------- | ------- | ------ |
| `hooks.pre_commit` | `enabled` | Enable/disable pre-commit hook |
| `hooks.commit_msg` | `enabled` | Enable/disable commit-msg hook |
| `commit.format` | `conventional` | Format validation (`conventional` / `custom` / `any`) |
| `commit.context_footer` | `required` | Footer validation (`required` / `recommended` / `custom` / `disabled`) |
| `hooks.subject_max_length` | `72` | Hard limit for subject line length |
| `hooks.subject_warn_length` | `60` | Warning threshold for subject line length |
| `hooks.task_numbering` | `error` | Task numbering format (`error` / `warning` / `off`) |
| `hooks.meta_ref_patterns` | `[Tt]ask...` | Meta-project reference patterns |
| `hooks.skip_extensions` | `md\|yml...` | Extensions skipped in meta-reference check |
| `hooks.test_patterns` | `__tests__/...` | Test file patterns (skipped in debug + meta checks) |
| `hooks.contributor_protected_paths` | `active/\|backlog/` | Contributor staging warnings |
| `branch.protection` | `partial` | Branch protection (`partial` / `full`) |
| `team.mode` | `false` | Team mode (`true` / `false`) |

## Environment

**Colors**: ANSI color output is conditional — disabled when stdout is not a TTY, when the
`NO_COLOR` environment variable is set, or when `TERM=dumb`. Colors are always safe in CI
environments.

**Cross-platform**: `numfmt` (used for human-readable file sizes) has a macOS fallback. No
GNU-specific dependencies required.

## Shared Library

Both hooks source `.arc/system/scripts/arc-lib.sh` for config reading (`arc_config_get`) and
color definitions. If you add custom hooks, source the same library to avoid duplicating the
config parser:

```bash
. "$(dirname "$0")/../scripts/arc-lib.sh"
```

## Customization

Edit the hook scripts directly to add project-specific checks. Common additions:

- Additional commit types in the `grep -qE` pattern (commit-msg, Rule 1)
- Project-specific sensitive file patterns (pre-commit, Check 3)
- Additional debug statement patterns (pre-commit, Check 5)

## Note: `core.hooksPath` Singularity

Git supports only one `core.hooksPath`. Setting it to `.arc/system/githooks/` means hooks in
`.git/hooks/` or other locations won't run. If your project needs additional hooks beyond ARC's,
add them directly to this directory or implement chaining in the hook scripts (check for and
execute a secondary hook path).

## Troubleshooting

**Hooks not running:**

```bash
git config core.hooksPath
# Should output: .arc/system/githooks
```

**Permission denied:**

```bash
chmod +x .arc/system/githooks/commit-msg .arc/system/githooks/pre-commit
```

**Testing hooks locally:**

```bash
# Test commit-msg
echo "test message" > /tmp/test-msg
.arc/system/githooks/commit-msg /tmp/test-msg

# Test pre-commit
.arc/system/githooks/pre-commit
```
