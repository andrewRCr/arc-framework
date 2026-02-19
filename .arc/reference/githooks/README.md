# Git Hooks

Git hooks that enforce ARC commit standards automatically. These run on every commit — no manual
invocation needed.

## Setup

```bash
# One-time configuration (from repository root)
git config core.hooksPath .arc/reference/githooks
```

Hooks must be executable:

```bash
chmod +x .arc/reference/githooks/commit-msg .arc/reference/githooks/pre-commit
```

## What Gets Validated

### commit-msg — Message Format

Enforces the commit message standard defined in DEVELOPMENT-RULES.md:

**Errors (blocks commit):**

- Conventional Commits format: `<type>(scope): description`
- Subject line length: 10-72 characters
- `Context:` footer present with valid format
- Task reference format (parenthetical required)

**Warnings (allows commit):**

- Subject line 50+ chars (warns, blocks at 72)
- Body over 15 lines (warns, blocks at 25)
- "Phase X.Y" usage (should be "Task X.Y")
- Task list file not found in active directories

### pre-commit — File Safety

**Errors (blocks commit):**

- Merge conflict markers in staged files
- Sensitive files (`.env`, `credentials.json`, etc.)
- Invalid task numbering format in task lists (third level must use letters: 1.1.a not 1.1.1)
- Meta-project references (task IDs, `.arc/` paths) in production code

**Warnings (allows commit):**

- Committing directly to main branch
- Large files (> 1MB)
- Debug statements (`console.log`, `debugger`, `pdb`, `breakpoint()`)
- Modified task lists not staged

## Customization

Edit the hook scripts directly to add project-specific checks. Common additions:

- Additional commit types in the `grep -qE` pattern (commit-msg, Rule 1)
- Project-specific sensitive file patterns (pre-commit, Check 3)
- Additional debug statement patterns (pre-commit, Check 5)

## Note: `core.hooksPath` Singularity

Git supports only one `core.hooksPath`. Setting it to `.arc/reference/githooks/` means hooks in
`.git/hooks/` or other locations won't run. If your project needs additional hooks beyond ARC's,
add them directly to this directory or implement chaining in the hook scripts (check for and
execute a secondary hook path).

## Troubleshooting

**Hooks not running:**

```bash
git config core.hooksPath
# Should output: .arc/reference/githooks
```

**Permission denied:**

```bash
chmod +x .arc/reference/githooks/commit-msg .arc/reference/githooks/pre-commit
```

**Testing hooks locally:**

```bash
# Test commit-msg
echo "test message" > /tmp/test-msg
.arc/reference/githooks/commit-msg /tmp/test-msg

# Test pre-commit
.arc/reference/githooks/pre-commit
```
