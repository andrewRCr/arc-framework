# Quick Reference - ARC Framework

Command patterns and environment context for the ARC framework.

## Environment & Path Context

**Repository Root**: Current checkout root (the directory containing `.arc/`).
**All commands in this document assume you are at repository root.**

**On-demand sections**: `Command Patterns`, `Quality Gate Commands`, `ARC CLI Commands`,
`npm Publishing` — load on demand when workflow steps reference them.

### Critical Path Reference

| Resource           | Location from Repo Root          | Why It Matters                        |
| ------------------ | -------------------------------- | ------------------------------------- |
| Template documents | `.arc/reference/`                | Template/example content for adopters |
| Active work        | `.arc/active/`                   | Current feature work                  |
| CLI package        | `packages/arc-framework/`        | `@arc-framework/cli` npm package      |
| Quality gates      | `npm run -s lint:md`, `npm test` | Zero-tolerance checks                 |

**Working Directory Note**: Hybrid project — `.arc/` docs + `packages/arc-framework/` CLI. All
commands run from repository root; npm workspaces delegates to the package automatically.

### Runtime Environment

**No Runtime Containers**: No backend, frontend, database, or services. The CLI package builds
locally via tsup.

**Quality Tools**: `markdownlint-cli2`, TypeScript, Vitest, tsup, Git. Commands live in
§ Command Patterns and § Quality Gate Commands below.

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

# Certify the exact staged candidate (normally run by pre-commit)
npm run -s lint:md:staged

# Lint specific directory
npx --yes markdownlint-cli2 ".arc/reference/**/*.md"
```

**Important:**

- Without `--no-globs`, markdownlint-cli2 processes config globs **in addition to** specified files
- Use `--no-globs` when checking/fixing individual files to avoid processing entire workspace
- If local dependencies are unavailable, use fallback: `npx --yes markdownlint-cli2 ...`
- `markdownlint-cli2 --fix` does not fix MD060 (table alignment). Use the repository's explicit table formatter:

```bash
# Fix table formatting without rewriting surrounding prose
npm run format:tables -- "path/to/file.md"
```

### Prettier (Markdown Formatting)

Use `prettier` for bulk line-length wrapping (MD013). It's markdown-aware — won't break inside links, emphasis, or
code spans. Do not use it for MD060 table alignment; use `npm run format:tables -- <file>` so only validated table
ranges change.

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

### Code Linting

```bash
# Lint TypeScript source (recommended-type-checked rules)
npm run lint:ts

# Focused root targets: repository-relative files, directories, or quoted globs
npm run -s lint:ts:file -- packages/arc-framework/src/lib/dev-check.ts
npm run -s lint:ts:file -- 'packages/arc-framework/src/lib/*.ts'

# Optional adapter delimiter: following ESLint options and values stay native
npm run -s lint:ts:file -- packages/arc-framework/src/lib/dev-check.ts -- --fix

# Lint shell scripts (githooks and system scripts)
npm run lint:sh
```

Root TypeScript targets precede the optional adapter `--`. ESLint runs in package cwd so suppression keys remain
package-relative; option values and explicitly forwarded positional patterns after that delimiter use the same
native base. Package-local `lint:ts:file` also retains package-relative paths. Markdown lint/fix helpers accept
literal repository-relative filenames through their existing `--no-globs` scripts.

### Type Checking

```bash
# Source files (strict mode, no emit)
npm run typecheck

# Test files (strict mode, includes __tests__)
npm run typecheck:test
```

### Testing

```bash
# Run the routine local lane (unit + unit-mocks + integration)
npm test

# Run every Vitest project, including E2E
npm run test:full

# Run unit tests only
npm run test:unit

# Exact repository-relative file, with a native name filter through one npm separator
npm run -s test:file -- packages/arc-framework/__tests__/unit/dev-check.test.ts -t "returns skip when src/ is absent"

# Exact directory selection; each named operand must contribute an eligible specification
npm run -s test:file -- packages/arc-framework/__tests__/integration

# Explicit native execution options override configured defaults
npm run -s test:file -- packages/arc-framework/__tests__/unit/dev-check.test.ts --project unit --maxWorkers 1

# Broad tiers retain native package-relative filename filters
npm run -s test:unit -- __tests__/unit/dev-check.test.ts

# Run tests in watch mode (during development)
npm run -w packages/arc-framework test:watch
```

`test:file` accepts existing files or directories under the configured unit, integration, and E2E test trees.
It selects exact files or directory descendants; every operand must contribute before optional native pre-parsing.
Project filters can restrict that selection. Name filters, pool, isolation, file parallelism, and worker settings
retain native precedence and literal option values; unit-mocks keeps configured isolation unless explicitly
overridden. Invalid/excluded/empty targets, unknown or malformed flags, extra separators, config/root overrides,
and watch/browser/UI or alternate discovery modes receive actionable diagnostics. Zero completed cases is
non-passing even when native empty-run or ignored-error options are supplied.

Supported run-mode scripts, including retained cost measurements, discover first and retain one controller through
closing. Unit-only selections request no heavy admission or build. Integration/E2E selections acquire CPU admission,
then checkout artifact ownership, and prepare qualified CLI and metafile output before setup. Artifact ownership lasts
through test execution and cleanup; logged closing errors and final worker errors fail the run. Native watch remains
the separate package convenience shown above.

### Building

```bash
# Build CLI package (ESM output with shebang and declarations) — the build-verification gate
npm run build

# Fast build: CLI entry, metafile, and qualified input evidence, without declarations
npm run build:fast
```

Explicit `build` and `build:fast` always generate the requested output. Test preparation reuses unchanged qualified
CLI and metafile output, including output from a full build; fast preparation supplies no declaration proof. Supported
builders wait behind an owning controller in the same checkout and remain interruptible. Other worktrees have
independent artifact ownership. CI and `ARC_TEST_ALLOW_CONCURRENCY=1` bypass CPU admission only.

CI downloads the evidence with `dist`, then runs consumer-local preparation with generation enabled before tests
set `ARC_E2E_SKIP_BUILD=1`. Skip-build revalidates matching inputs, installation/tools, Node/platform/architecture,
and required files under artifact ownership; it never generates. Repair unavailable installation evidence with
`npm ci`, then run preparation or `npm run build:fast` before retrying. Direct native Vitest setup may prepare only
when controller evidence is absent; that convenience owns generation alone and does not pin an unmanaged run.

---

## Quality Gate Commands

The project's quality gates and the commands that run them. **Which** of them a given change has to run is
DEV-RULES.PROJECT § Quality Gates (relevance and unchanged-tree conditions), which also carries the standards each
gate enforces; the tier model itself is the [Quality Gates Strategy][quality-gates].

**Parity with CI.** The gate set below tracks the required workflow in `.github/workflows/ci.yml`. The
`lint:arc:*` contract checks are required there and are easy to omit locally — doing so produces a false green
that CI then rejects. When CI gains or renames a required gate, update this section in the same change.

### The gates

Zero violations or errors on each. Commands, config, and tooling:

- **Markdown lint** — `lint:md` over the worktree; `lint:md:staged` certifies the index and is authoritative at
  pre-commit. Config `.markdownlint-cli2.jsonc`.
- **Code lint** — `lint:ts` for the whole package, `lint:ts:file` for named paths; config
  `packages/arc-framework/eslint.config.js` (typescript-eslint recommended-type-checked, plus size and
  complexity limits baselined in `eslint-suppressions.json` — see DEV-RULES.PROJECT § Size and complexity
  baseline). `lint:sh` requires a system-installed `shellcheck` on developer machines.
- **Type checking** — `typecheck` for source (`packages/arc-framework/tsconfig.json`, strict, excludes
  `__tests__`), `typecheck:test` for tests (`tsconfig.test.json`), or `typecheck:all` for both.
- **Tests** — `npm test` for the routine unit + integration lane, `test:changed` for affected unit tests, and
  `test:full` for an explicit whole-project run. Vitest, config `packages/arc-framework/vitest.config.ts`.
- **Build** — `build`. Tooling is tsup, emitting ESM output, declarations, and an injected shebang.
- **ARC contract checks** — `lint:arc:triggers`, `lint:arc:domain-rules`, `lint:arc:section-refs`. Corpus-wide by
  design and required in CI.

Invocation detail for the Markdown gates — `lint:md:staged`, `lint:md:fix:file`, `format:tables`, the `--no-globs`
rule, and the MD060 caveat — stays in § Markdown Linting above rather than being restated here.

### Incremental — Tier 1 (per-task)

**Always targeted** — pass the paths the task actually changed. A single-file TypeScript task runs in seconds,
not a minute.

```bash
# Markdown — per changed file
npm run -s lint:md:file -- "path/to/file.md"

# ARC contract checks — run when any `.arc/**` methodology artifact changed
# (~0.7s combined; required in CI, so skipping them here only defers the failure)
npm run -s lint:arc:triggers
npm run -s lint:arc:domain-rules
npm run -s lint:arc:section-refs

# TypeScript lint — repository-relative files, directories, or quoted globs
# (`npm run lint:ts -- <path>` appends to the full set rather than narrowing it. Run eslint by hand only
# from the package directory: the size/complexity baseline is keyed to that working directory.)
npm run -s lint:ts:file -- packages/arc-framework/src/lib/dev-check.ts

# Affected unit tests — resolves committed and uncommitted changes against main...HEAD
# Empty selection is a non-passing outcome
npm run -s test:changed

# Framework-contract tests — fast subset for two-copy sync / extension / review-gate changes
npm run -s test:arc-contracts

# Types — whole-program, not narrowable; run when TypeScript changed
npm run typecheck:all

# Shell — fixed hook/script set; run when a hook or script changed
npm run lint:sh
```

### Integration — Tier 2 (coherent unit)

Full-project scope. The relevance condition still applies — a unit that touched no TypeScript skips the code
checks.

```bash
npm run -s lint:md
npm run -s lint:arc:triggers
npm run -s lint:arc:domain-rules
npm run -s lint:arc:section-refs
npm run lint:ts
npm run lint:sh
npm run typecheck
npm run typecheck:test
npm test
```

### Complete Gate — Tier 3 (per-phase / pre-PR)

Tier 2 plus build verification and a change review. Complete every command in the project-designated gate. In this
repo `build` is the only added build/test command; change review remains a separate mandatory Tier 3 activity. The
command sets have nearly converged. That convergence is an input to the eventual tier-model rework rather than a
license to substitute one tier for the other.

```bash
# 1-9: the Tier 2 block above (the complete project-designated local set), then:

# 10. Build verification
npm run build

# 11. Change review
git status
git --no-pager diff --stat
```

`npm test` runs the routine unit + integration lane. `npm run test:full` is the explicit local whole-project
command; required CI remains authoritative for E2E and portability enforcement before merge. Runtime preparation
does not replace the full `npm run build` declaration gate or either type check.

---

## ARC CLI Commands

> **Self-hosting invocation:** This repo develops the `arc` CLI itself — don't rely on a global
> `arc` install in this working tree. A global install would resolve to the published version,
> not local source, so changes you make here wouldn't run. Use `npx arc <command>` for every ARC
> CLI command in the sections below; npm workspaces symlinks the local package binary into
> `node_modules/.bin/arc` automatically, and `npx` picks it up. Requires a current build (the
> binary points at `packages/arc-framework/dist/cli.js`); the guard refuses against a stale one,
> and `npm run build:fast` regenerates qualified runtime output. This guidance applies only
> to the self-hosting repo; adopter projects install the published CLI globally and use `arc`
> directly.

### Command Prerequisites and Remote Access

ARC requires Node.js 24 or newer and Git 2.45 or newer.

`npx arc status --session-init --json` is passive for code-repository evidence: it reads one live advertised-head
generation and inspects only objects already present locally. It does not fetch code objects, update or create code
refs, prune, or run maintenance. This holds in linked worktrees, where ref and object writes would target the shared
Git common directory. Missing advertised objects return `pending-fetch`; unreachable transport returns
`unreachable`; disabled or absent transport returns `not-applicable`. Shallow history or missing partial-clone
trees/blobs cannot produce an exact graph or content result and do not trigger lazy fetching.

Use an explicit operation when acquisition is intended:

```bash
# Expand live in-flight candidates; may fetch missing advertised candidate objects
npx arc active in-flight --json

# Fast-forward the local base ref from advertised remote state
npx arc base sync --json
```

Materialization, pull, and sync verbs likewise own their documented Git writes. User-notes refs and transient
Errand-record transport are separate channels with their own operational ref behavior; they never count as passive
code-head evidence. See [Session Operations Strategy][session-ops] § Remote access boundary.

### Schema Discovery

Use `arc schema list` to find registered contracts and `arc schema get <id>` to retrieve one. Read a result's
`editorDocument` field to locate its editor document.

Run `arc schema install` to refresh checkout editor documents after a CLI upgrade or in a checkout provisioned before
the command existed.

### Artifact Viewing

`arc view [kind]` renders an artifact using the existing selectors. With no kind, it checks
**tasks → spec → draft → meta**. `--path` prints the selected file's absolute path; `--editor` or `-e` opens
that same real file in the configured editor. Kind, `--for`, and `inbox --project` selection stays the same.

Use a non-empty `ARC_EDITOR` to supply an editor command, including arguments and shell expansion. Otherwise ARC
delegates to `git var GIT_EDITOR`: `GIT_EDITOR`, `core.editor`, `VISUAL`, `EDITOR`, then Git's compile-time default,
usually `vi`.

Editor mode inherits terminal streams and requires allowed interaction. `--no-input`, CI, piped stdin, or piped
stdout refuse with a nonzero diagnostic. `--editor` also conflicts with `--path` and `--current`. Missing artifacts,
failed editor selection or launch, and unsuccessful exits report failures; set `ARC_EDITOR` to repair the command
and retry.

ARC waits for the configured command to exit and preserves its wait flags. A successful exit confirms handoff;
buffer opening and saving depend on the editor. For a GUI command that waits for the file to close:

```bash
ARC_EDITOR="code --wait" npx arc view -e
```

### Setup and Configuration

```bash
# Install ARC CLI globally (one-time)
npm install -g @arc-framework/cli

# Initialize ARC in a new project
npx arc init

# Initialize with non-interactive defaults
npx arc init --yes --name "My Project" --pm-mode arc-in-git --tools claude,cursor

# Change structural settings on an existing installation (pm.mode, team.mode, project name)
npx arc init --reconfigure

# Preview reconfigure changes without applying
npx arc init --reconfigure --dry-run

# Join an existing ARC project (personal workspace: role, identity, skills)
npx arc join

# Change personal workspace settings (role, tools)
npx arc join --reconfigure

# Update framework files to the latest version
npx arc update
```

### Lifecycle Verbs

The complete work-unit lifecycle command set — the full verb index. The `work-unit-lifecycle/` workflow files
cover only the judgment-bearing subset, so a verb with no workflow file (`demote`, `rename`, `teardown`, `stub`) is
by design, not a missing ceremony.

```bash
# Resolve one work unit's lifecycle state — (phase, location), derived enum, predicates, dep-edges
arc status <slug> [--json]

# Create a backlog stub at a committed tier — no ceremony (judgment-light; required fields per strategy-work-organization.md § Stub required fields)
# --cohort accepts <cohort> or <cohort>/<subcohort> and requires the planned tier.
arc stub <name> --commitment <provisional|planned> --priority <P#> \
  [--origin <ref>] [--design <ref>] [--cohort <cohort-path>]

# Start an existing work unit on plan/<name>; --new explicitly creates an absent name.
# Spawns a worktree; --here uses the current checkout (init-work-unit.md).
arc start [name] [--new] [--here] [--from <pointer-or-blurb>]

# Rename a WU and its applicable branch, notes, remote, marker, and worktree identities — no ceremony
arc rename <slug> <new-slug>

# Promote a provisional stub to planned, requires a resolved Class (promote-work-unit.md)
arc promote <slug>
# Demote a planned stub back to provisional — no ceremony (see promote-work-unit.md § Inverse)
arc demote <slug>

# Activate a planning WU: Planning → Active (activate-work-unit.md)
arc activate [slug] --type <type> --task <first task> --action <next action>
# Deactivate a premature activation: Active → Planning (deactivate-work-unit.md)
arc deactivate [slug]

# Park a started WU off the active set (park-work-unit.md)
arc park [slug] --reason <text> [--land <oid>]
# Resume a parked WU's preserved branch (resume-work-unit.md)
arc resume [slug] [--here]

# Attest a verified Candidate without changing lifecycle State (verify-work-unit.md)
# --new-root roots a new lineage over the current fully verified subject, superseding a blocked Candidate
arc attest <name> --json [--new-root]

# Schedule publication: Active → Integrating, not the merge (prepare-work-unit.md)
# --last-completed / --action override the task-list and boundary reads the verb makes on its own
arc publish [slug] [--last-completed <work>] [--action <next action>] [--json]
# Integration procedures — checkpoint composes the readiness verdict, merge executes it (integrate-work-unit.md)
arc integrate checkpoint <name>
arc integrate merge <name> --checkpoint <handle>
# Withdraw from review: Integrating → Active (reopen-work-unit.md)
arc reopen [slug] [--keep-pr]

# Split one WU into a cohort of members per a cut-map (decompose-work-unit.md)
arc decompose <origin> --execute <file>

# Abandon a pre-merge WU — artifacts, branch, worktree; prints the impact plan (deactivate-work-unit.md § Case A-delete)
arc abandon <slug> --yes

# Sweep a shipped WU to completed/ (archive-work-unit.md)
arc archive [slug] [--pr-url <url>] [--completed <date>]
# Post-merge cleanup — reap branch, remove worktree, prune refs — no ceremony (invoked from integrate-work-unit.md Step 11)
arc teardown <name> [--force] [--husk <absolute-path>]

# Safely fast-forward the configured local base from any worktree
arc base sync [--json]

# Classify the planning-entry route — committable, or redirect to start / stub / errand
arc plan check

# Errand lifecycle — no meta; `open` exactly resumes an existing eligible identity
arc errand next [--json]
arc errand open <slug> [--intent <text>] [--from-inbox <entry>] [--inbox-title-file <path|->] [--json]
arc errand link <slug> (--from-inbox <entry> | --inbox-title-file <path|->) [--json]
arc errand materialize <slug> [--claim-id <claim-id> --expected-head <oid>] [--json]
arc errand leave <slug> --state <paused|awaiting-merge> [--confirm-foreign-generation <generation>] [--json]
arc errand close <slug> [--confirm-foreign-generation <generation>] [--json]
arc errand abandon <slug> [--confirm-foreign-generation <generation>] [--json]
arc errand promote <slug> [--name <name>] [--type <type>] --floor <derivation|scale> \
  [--confirm-foreign-generation <generation>] [--json]
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

See [Session Operations Strategy][session-ops] § Session State Portability for the portability
model, `arc sync` direction semantics, and `user.notes_push` push policy.

### Release Wrappers

```bash
# Wrapped `git commit` — validates interlock state and branch protection, refuses
# destructive flags, preflights deterministic messages, writes one audit entry
# Choose a quoted delimiter absent as a complete message line
arc release commit -F - <<'ARC_COMMIT_MESSAGE_9F3D'
feat(scope): sufficiently descriptive subject

- Explain the change and its impact.

Context: standalone (maintenance)
ARC_COMMIT_MESSAGE_9F3D

# Validate a message file independently
arc check commit-msg path/to/message.txt
# Or validate stdin with a machine envelope
arc check commit-msg - --json

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

See [`commit-format`](../system/methods/commit-format.md) for multiline transport, direct-file matcher fallback,
message structure, and wrapper retry behavior.

Refusal exit codes 10–16 cover `ambiguous-active-wu`, `interlock-not-authorized`, `destructive-flag`,
`branch-protection-violation`, `pushability-precheck-failed`, `arg-grammar-fallthrough`, and
`commit-message-preflight-failed`; audit entries land at
`.arc/user/{identity}/.internal/.audit-log.jsonl`. See [DEV-RULES.ARC][dev-rules-arc] §
Commit Discipline for the trust model and opt-in semantics.

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

---

## npm Publishing

**Auth model:** Token-only. Use a granular access token from npmjs.com with "Bypass 2FA"
enabled, stored as a literal `//registry.npmjs.org/:_authToken=<token>` in `~/.npmrc`.

**Never run `npm login`** — it triggers browser-based WebAuthn that doesn't work in WSL2
and creates a session that overrides the granular token. If interactive login is needed,
use `npm login --auth-type=legacy` for prompt-based auth.

**Recovery:** `npm logout` removes auth entries (`_authToken`, registry-scoped keys) from
`~/.npmrc`. If the file only contained auth, it's effectively empty — recreate from the
token. Write tokens expire at 90 days max — rotate before expiry.

---

[quality-gates]: strategies/arc/strategy-quality-gates.md
[session-ops]: strategies/arc/strategy-session-operations.md
[dev-rules-arc]: ../system/rules/DEV-RULES.ARC.md
