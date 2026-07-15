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

### Lifecycle Verbs

The complete work-unit lifecycle command set — the full verb index. The `work-unit-lifecycle/` workflow files
cover only the judgment-bearing subset, so a verb with no workflow file (`demote`, `teardown`, `stub`) is by
design, not a missing ceremony.

```bash
# Resolve one work unit's lifecycle state — (phase, location), derived enum, predicates, dep-edges
arc status <slug> [--json]

# Create a backlog stub at a committed tier — no ceremony (judgment-light; required fields per strategy-work-organization.md § Stub required fields)
arc stub <name> --commitment <provisional|planned> --priority <P#> [--origin <ref>] [--design <ref>] [--cohort <slug>]

# Start an existing work unit on plan/<name>; --new explicitly creates an absent name.
# Spawns a worktree; --here uses the current checkout (init-work-unit.md).
arc start [name] [--new] [--here] [--from <pointer-or-blurb>]

# Promote a provisional stub to planned, requires a resolved Class (promote-work-unit.md)
arc promote <slug>
# Demote a planned stub back to provisional — no ceremony (see promote-work-unit.md § Inverse)
arc demote <slug>

# Activate a planning WU: Planning → Active (activate-work-unit.md)
arc activate [slug] --type <type> --task <first task> --action <next action>
# Deactivate a premature activation: Active → Planning (deactivate-work-unit.md)
arc deactivate [slug]

# Park a started WU off the active set (park-work-unit.md)
arc park [slug] --reason <text>
# Resume a parked WU's preserved branch (resume-work-unit.md)
arc resume [slug] [--here]

# Open review: Active → Integrating, marks phase entry not the merge (integrate-work-unit.md)
arc integrate [slug] --last-completed <work> --action <next action>
# Withdraw from review: Integrating → Active (reopen-work-unit.md)
arc reopen [slug] [--keep-pr]

# Split one WU into a cohort of members per a cut-map (decompose-work-unit.md)
arc decompose <origin> --cut-map <file>

# Abandon a pre-merge WU — artifacts, branch, worktree; prints the impact plan (deactivate-work-unit.md § Case A-delete)
arc abandon <slug> --yes

# Sweep a shipped WU to completed/ (archive-work-unit.md)
arc archive [slug] [--pr-url <url>] [--completed <date>]
# Post-merge cleanup — reap branch, remove worktree, prune refs — no ceremony (invoked from integrate-work-unit.md Step 13)
arc teardown <name> [--force]

# Safely fast-forward the configured local base from any worktree
arc base sync [--json]

# Classify the planning-entry route — committable, or redirect to start / stub / errand
arc plan check

# Errand lifecycle — chore/<slug> branch, no meta (run-errand.md)
arc errand open <slug> [--type <fix|chore|refactor|hotfix>] [--intent <text>] [--from-inbox <entry>]
arc errand close <slug>
arc errand promote <slug>
arc errand retire <slug>
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

### Standalone Work History

```bash
# Browse off-WU standalone commits from history
arc log standalone

# Filter by category (maintenance | planning | documentation | refactor)
arc log standalone --category maintenance
```

---

## Platform Commands

ARC workflows use GitHub CLI (`gh`) examples by default. For GitLab, Bitbucket,
Azure DevOps, or another platform, replace these commands with your team's CLI
equivalents.

| Operation    | Command                                           |
|--------------|---------------------------------------------------|
| Create PR/MR | `gh pr create --base {base} --head {branch}`      |
| List PRs/MRs | `gh pr list --head {branch} --base {base}`        |
| View PR/MR   | `gh pr view --json number,url,state`              |
| Merge PR/MR  | `gh pr merge {pr-number} --merge`                 |
| Create issue | `gh issue create`                                 |
