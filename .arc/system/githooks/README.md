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

- Conventional Commits format: `<type>(scope): description`
- Subject line length: 10-72 characters
- `Context:` footer present with valid format
- Task reference format (parenthetical required)

**Warnings (allows commit):**

- Subject line 50+ chars (warns, blocks at 72)
- Body over 15 lines (warns at 15; warns again at 25 for milestones)
- "Phase X.Y" usage (should be "Task X.Y")
- Task list file not found in active directories

### pre-commit — File Safety

**Errors (blocks commit):**

- Base branch commit protection in `full` mode (all changes require branches and PR review)
- Merge conflict markers in staged files
- Sensitive files (`.env`, `credentials.json`, etc.)
- Invalid task numbering format in task lists (third level must use letters: 1.1.a not 1.1.1) —
  configurable via `hooks.task_numbering` (`error` | `warning` | `off`)
- Meta-project references (task IDs, `.arc/` paths) in production code

**Warnings (allows commit):**

- Base branch commit protection in `partial` mode (planned work should use branches)
- Large files (> 1MB)
- Debug statements (`console.log`, `debugger`, `pdb`, `breakpoint()`)
- Modified task lists not staged

**Configuration (`arc-config.yml`):**

The base branch name and protection level are read from `.arc/system/arc-config.yml`.
If the config file is missing or a setting is absent, defaults apply (`main` base branch,
`partial` protection, `error` task numbering). See
[strategy-work-organization.md](../../reference/strategies/arc/strategy-work-organization.md)
for branch mode descriptions and
[strategy-task-list-formatting.md](../../reference/strategies/arc/strategy-task-list-formatting.md)
for the task numbering convention.

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
