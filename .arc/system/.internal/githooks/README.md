# Git Hooks

Git hooks that enforce ARC commit standards automatically. These run on every commit — no manual
invocation needed.

## Setup

**Automatic:** `arc init` and `arc join` handle hook setup automatically, including
detecting existing hook managers.

**Hook manager integration:** If your project uses a hook manager (husky, lefthook, or
pre-commit), ARC detects it during `arc init` / `arc join` and adds hook calls to the
manager's configuration instead of setting `core.hooksPath`. This preserves your existing
hook setup while adding ARC's validation:

- **Husky** — adds calls to `.husky/pre-commit` and `.husky/commit-msg`
- **Lefthook** — adds `arc-pre-commit` and `arc-commit-msg` commands to `lefthook.yml`
- **pre-commit** — adds local hooks to `.pre-commit-config.yaml`

**No hook manager:** When no manager is detected, ARC sets `core.hooksPath` directly to
`.arc/system/.internal/githooks/`.

**Manual setup** (if not using the CLI):

```bash
# Option A: Direct hook path (no hook manager)
git config core.hooksPath .arc/system/.internal/githooks

# Option B: Hook manager — add calls to your manager's config
# Husky: echo '.arc/system/.internal/githooks/pre-commit' >> .husky/pre-commit
# See the integration patterns below for each manager
```

Hooks must be executable:

```bash
chmod +x .arc/system/.internal/githooks/commit-msg .arc/system/.internal/githooks/pre-commit
```

## What Gets Validated

### commit-msg — Message Format

Enforces the commit message standard defined in
[DEV-RULES.ARC.md](../../../system/rules/DEV-RULES.ARC.md) § Commit format:

The `commit-msg` hook is a thin shim. When validation is enabled, it resolves the repository-local
`node_modules/.bin/arc` executable first, falls back to `arc` on `PATH`, and delegates to
`arc check commit-msg <message-file>`. If neither executable is available, validation fails closed and
blocks the commit. Disabling `hooks.commit_msg` or committing Git's generated merge message bypasses the
delegation intentionally.

**Errors (blocks commit):**

- Conventional Commits format: `<type>(scope): description` (when `commit.format: conventional`)
- Custom format pattern match against the `commit.custom_pattern` ECMAScript source (when
  `commit.format: custom`)
- Subject line length: 10–`hooks.subject_max_length` characters (default 72; skipped when
  `commit.format: any`)
- Body line count over `hooks.body_max_lines` (default 100 — runaway backstop)
- Body per-line length over `hooks.body_max_line_length` (default 100 — runaway backstop;
  authorial wrap target is ~72 per the commit-format method)
- "Phase X.Y" usage in commit message (should be "Task X.Y" — phases are bare integers,
  tasks are dotted; preserves grep-ability of commit history)
- `Context:` footer present with valid format (when `commit.context_footer: required`)
- Task reference format (parenthetical required)
- Invalid regex in `commit.custom_pattern` or `commit.context_pattern`
- Unknown `commit.context_footer` value

**Warnings (allows commit):**

- Task list file not found in active directories
- Context footer issues when `commit.context_footer: recommended`
- Contributor using non-`contribution` context footer pattern
- Meta file not advanced when committing a completed parent task (derived
  from the staged task list's directory)

### pre-commit — File Safety and Declared Checks

**Errors (blocks commit):**

- A failed declared commit check from `arc check pre-commit`, after the structural checks
- An unresolved CLI when `.arc/system/arc-checks.yml` is present; install `@arc-framework/cli` locally or globally
  and retry the commit
- Base branch commit protection in `full` mode (all changes require branches and PR review)
- Merge conflict markers in staged files (exception: under `pm.mode: arc-in-git`, ROADMAP uses a scoped merge
  driver that preserves normal text merging and surfaces the regenerate-and-stage remedy as soon as a conflict
  occurs; when `.arc/backlog/ROADMAP.md` is the **only** conflicted or marker-bearing path, the pre-commit fallback
  also auto-regenerates and restages it from the staged-index projection before this check runs)
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
- Task list staged with completions but sibling meta file not co-staged (maintainer only)

### pre-push — Push Gate and Force-Push Advisory

The hook runs `arc check pre-push` over the pushed ref lines and returns its exit status.
Declared check failures block the push; state refs and deletions are skipped.

**Advisory warnings:**

- Force-push that rewrites published history: the remote tip being replaced is not an ancestor of the
  commit being pushed, so commits present only on the remote would be dropped. The warning names the
  branch, the remote tip, and how many commits would be dropped, and points at the remote reflog for
  recovery. Configurable via `hooks.pre_push` (`enabled` | `disabled`).

  The hook sees only ref OIDs, not whether a branch is shared, so it warns on every non-ancestor
  overwrite — the append-only concern applies whenever published history is rewritten. The base branch is
  not special-cased. The advisory does not block; the declared push gate still applies.

## Role-Aware Behavior

Hooks read `arc.role` from git config (set during `arc init` or `arc join`).

**Maintainer** (default): All checks run. Task list staging, task numbering, and meta-file
co-staging checks are active.

**Contributor**: Maintainer-only checks are skipped with a notice. A soft warning fires if the
contributor uses a non-`contribution` context footer pattern. Protected path warnings fire when
staging files in `.arc/active/` or `.arc/backlog/`.

## Configuration (`arc-config.yml`)

Hook behavior is controlled by settings in `.arc/system/arc-config.yml`. Key settings:

| Setting                             | Default             | Effect                                                                 |
| ----------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `hooks.pre_commit`                  | `enabled`           | Disabled: no structural checks or commit gate dispatch                 |
| `hooks.commit_msg`                  | `enabled`           | Enable/disable commit-msg hook                                         |
| `hooks.pre_push`                    | `enabled`           | Disabled: no force-push advisory or push gate dispatch                 |
| `commit.format`                     | `conventional`      | Format validation (`conventional` / `custom` / `any`)                  |
| `commit.custom_pattern`             | empty               | ECMAScript pattern source used by `commit.format: custom`              |
| `commit.context_footer`             | `required`          | Footer validation (`required` / `recommended` / `custom` / `disabled`) |
| `commit.context_pattern`            | empty               | ECMAScript pattern source used by `commit.context_footer: custom`      |
| `hooks.subject_max_length`          | `72`                | Hard limit for subject line length                                     |
| `hooks.body_max_lines`              | `100`               | Hard limit for commit body line count (runaway backstop)               |
| `hooks.body_max_line_length`        | `100`               | Hard limit for body per-line length (runaway backstop)                 |
| `hooks.task_numbering`              | `error`             | Task numbering format (`error` / `warning` / `off`)                    |
| `hooks.meta_ref_patterns`           | `[Tt]ask...`        | Meta-project reference patterns                                        |
| `hooks.skip_extensions`             | `md\|yml...`        | Extensions skipped in meta-reference check                             |
| `hooks.test_patterns`               | `__tests__/...`     | Test file patterns (skipped in debug + meta checks)                    |
| `hooks.contributor_protected_paths` | `active/\|backlog/` | Contributor staging warnings                                           |
| `branch.protection`                 | `partial`           | Branch protection (`partial` / `full`)                                 |
| `team.mode`                         | `false`             | Team mode (`true` / `false`)                                           |

## Environment

**Colors**: ANSI color output is conditional — disabled when stdout is not a TTY, when the
`NO_COLOR` environment variable is set, or when `TERM=dumb`. Colors are always safe in CI
environments.

**Cross-platform**: `numfmt` (used for human-readable file sizes) has a macOS fallback. No
GNU-specific dependencies required.

## Shared Library

All three hooks source `.arc/system/.internal/scripts/arc-lib.sh` for config reading (`arc_config_get`);
the shell-owned `pre-commit` and `pre-push` checks also use its color definitions. If you add custom
shell checks, source the same library to avoid duplicating the config parser:

```bash
. "$(dirname "$0")/../scripts/arc-lib.sh"
```

## Customization

Commit-message grammar belongs in `arc-config.yml`, not the shell shim. Set `commit.format` and its
related keys there; `commit.custom_pattern` is ECMAScript pattern source consumed by the CLI validator.

Edit the scripts directly only for project-specific checks that remain shell-owned. Common additions:

- Project-specific sensitive file patterns (pre-commit, `CHECK[sensitive-files]`)
- Additional debug statement patterns (pre-commit, `CHECK[debug-statements]`)

## Hook Manager Compatibility

ARC's CLI automatically detects and integrates with existing hook managers during `arc init` and
`arc join`. If your project uses husky, lefthook, or pre-commit, ARC adds its hooks to the
manager's configuration rather than setting `core.hooksPath`, so both ARC hooks and your existing
hooks run through the same manager.

If you're **not** using a hook manager, ARC sets `core.hooksPath` directly. Git supports only one
`core.hooksPath`, so hooks in `.git/hooks/` or other locations won't run in this mode. If your
project needs additional hooks beyond ARC's, either adopt a hook manager (recommended) or add
custom checks directly to the hook scripts in this directory.

## Troubleshooting

**Hooks not running:**

```bash
# If using core.hooksPath (no hook manager):
git config core.hooksPath
# Should output: .arc/system/.internal/githooks

# If using a hook manager, check the manager's config for ARC hook entries:
# Husky: cat .husky/pre-commit (should contain .arc/system/.internal/githooks/pre-commit)
# Lefthook: grep arc-pre-commit lefthook.yml
# pre-commit: grep arc-pre-commit .pre-commit-config.yaml
```

**Permission denied:**

```bash
chmod +x .arc/system/.internal/githooks/commit-msg .arc/system/.internal/githooks/pre-commit
```

**Testing hooks locally:**

```bash
# Test commit-message policy directly
echo "test message" > /tmp/test-msg
arc check commit-msg /tmp/test-msg

# Test the shim's CLI resolution and delegation
.arc/system/.internal/githooks/commit-msg /tmp/test-msg

# Test pre-commit
.arc/system/.internal/githooks/pre-commit
```
