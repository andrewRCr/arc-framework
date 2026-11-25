# Quick Reference - {{PROJECT_NAME}}

Command patterns and environment context for {{PROJECT_NAME}}.

## Environment & Path Context

**Repository Root**: Current checkout root (the directory containing `.arc/`).
**All commands in this document assume you are at repository root.**

**On-demand sections**: `Command Patterns`, `ARC CLI Commands`, `Platform Commands` — load on demand when workflow
steps reference them.

### Critical Path Reference

| Resource         | Location from Repo Root | Why It Matters       |
| ---------------- | ----------------------- | -------------------- |
| \[Resource name] | `[path]`                | \[brief explanation] |
| \[Resource name] | `[path]`                | \[brief explanation] |

### Runtime Environment

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

## ARC CLI Commands

### Command Prerequisites and Remote Access

ARC requires Node.js 24 or newer and Git 2.53 or newer.

`arc status --session-init --json` is passive for code-repository evidence: it reads one live advertised-head
generation and inspects only objects already present locally. It does not fetch code objects, update or create code
refs, prune, or run maintenance. This holds in linked worktrees, where ref and object writes would target the shared
Git common directory. Missing advertised objects return `pending-fetch`; unreachable transport returns
`unreachable`; disabled or absent transport returns `not-applicable`. Shallow history or missing partial-clone
trees/blobs cannot produce an exact graph or content result and do not trigger lazy fetching.

Use an explicit operation when acquisition is intended:

```bash
# Expand live in-flight candidates; may fetch missing advertised candidate objects
arc active in-flight --json

# Fast-forward the local base ref from advertised remote state
arc base sync --json
```

Materialization, pull, and sync verbs likewise own their documented Git writes. The store's refs are a separate channel
with its own operational ref behavior, and they never count as passive code-head evidence. See [Session Operations
Strategy](strategies/arc/strategy-session-operations.md) § Remote access boundary.

### Schema Discovery

Use `arc schema list` to find registered contracts and `arc schema get <id>` to retrieve one. Read a result's
`editorDocument` field to locate its editor document.

Run `arc schema install` to refresh checkout editor documents after a CLI upgrade or in a checkout provisioned before
the command existed.

### Artifact Viewing

`arc view [kind]` renders an artifact. With no kind, it checks **tasks → spec → draft → meta**. The `design` kind
follows the meta's `Design` list: the first entry with a Purpose field, or the first readable entry when none has one.
`--path` prints the selected file's absolute path; `--editor` or `-e` opens that same real file in the configured editor.

`--for <slug>` selects the named work unit by its current or a former slug and reads its records from the store;
`--path` and `--editor` use the record's projected file in this checkout. `session-notes` reads the work unit's
session context from its meta. `inbox --project` selects the shared project inbox.

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
ARC_EDITOR="code --wait" arc view -e
```

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
cover only the judgment-bearing subset, so a verb with no workflow file (`demote`, `rename`, `teardown`, `stub`) is
by design, not a missing ceremony.

```bash
# Resolve one work unit's lifecycle state — (phase, location), derived enum, predicates, dep-edges
arc status <slug> [--json]

# Create a backlog stub at a committed tier — no ceremony (judgment-light; required fields per strategy-work-organization.md § Stub required fields)
# Planned requires --class <Light|Heavy|Novel>. Use provisional when Class is unresolved.
# --cohort accepts <cohort> or <cohort>/<subcohort> and requires the planned tier.
arc stub <name> --commitment <provisional|planned> --priority <P#> [--class <Class>] \
  [--origin <ref>] [--design <ref>] [--cohort <cohort-path>]

# Start an existing work unit in Planning; --new explicitly creates an absent name.
# Spawns a worktree; --here uses the current checkout (init-work-unit.md).
arc start [name] [--new] [--here] [--from <pointer-or-blurb>]

# Rename a WU or cohort by slug or UID, with a WU's branch, remote, marker, and worktree identities — no ceremony
arc rename <slug|uid> <new-slug>

# Close a cohort, or remove an empty one, by slug or UID — no ceremony
arc cohort close <cohort> --yes
arc cohort remove <cohort> --yes

# Set Class at any lifecycle placement; the slug defaults to the checkout's work unit
arc set-class <Light|Heavy|Novel> [slug]

# Promote a provisional stub to planned, requires a resolved Class (promote-work-unit.md)
arc promote <slug>
# Demote a planned stub back to provisional — no ceremony (see promote-work-unit.md § Inverse)
arc demote <slug>

# Set the current WU's planning-stage pointer; --advance also resets Next Action for the new stage.
arc set-stage <draft-design|create-spec|generate-tasks> [--advance]
# Advance the current WU's Design pointer at a planning event.
arc repoint-design <draft-created|spec-finalized>
# Persist Class at a planning ceremony; generate-tasks also writes Task List and Next Action.
arc finalize <create-spec|amend-design|generate-tasks> --class <Light|Heavy|Novel>

# Save pending edits in every projected root — work-unit records and your personal records
arc save
# Close tasks after their commit, capturing the increment's code commits (process-task-loop.md)
arc task close [ids...] [--commit <sha>]
# Defer a task and cascade its parent marker
arc task defer <id>
# Write the handoff's session context and state from a JSON request (session-handoff.md)
arc handoff write <file|->

# Activate a planning WU: Planning → Active (activate-work-unit.md)
arc activate [slug] --type <type> --task <first task> --action <next action>
# Deactivate a premature activation: Active → Planning (deactivate-work-unit.md)
arc deactivate [slug]

# Pause a started WU in place, with its reason and what it waits on (park-work-unit.md)
arc pause [slug] --reason <text> [--waits-on <slug> | --waits-on-note <text>] [--resume-notes <text>] [--open]
# Resume a paused WU (resume-work-unit.md)
arc resume [slug]
# Hand a WU to another owner once its work is shared
arc handover [slug] --to <identity>
# Pick up a remote-only in-flight WU; --here uses the current checkout (resume-work-unit.md)
arc materialize [slug] [--here]
# Release the current checkout's work-item occupancy — no ceremony
arc locus release [slug]

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

# Split one WU into a cohort of members per a cut-map, or extract from it (decompose-work-unit.md)
arc decompose <origin> --preflight
arc decompose <origin> --execute <cut-map>
arc decompose <origin> --extract <cut-map>
# Preview finishing, revising, or discarding the stored cut; --apply takes the approved preview's authority
arc decompose <origin> --finish [--apply <authority>]
arc decompose <origin> --revise [<cut-map>] [--apply <authority>]
arc decompose <origin> --discard [--apply <authority>]

# Abandon a pre-merge WU — artifacts, branch, worktree; prints the impact plan (deactivate-work-unit.md § Case A-delete)
arc abandon <slug> --yes

# Archive a shipped WU's records to their dated completed/ placement (archive-work-unit.md)
arc archive [slug] [--pr-url <url>] [--completed <date>]
# Post-merge cleanup — reap branch, remove worktree, prune refs — no ceremony (invoked from integrate-work-unit.md Step 11)
arc teardown <name> [--force] [--husk <absolute-path>]

# Safely fast-forward the configured local base from any worktree
arc base sync [--json]

# Classify the planning-entry route — proceed, or route an unstarted idea to start / stub / errand
arc plan check [--name <slug>]

# Inboxes — list a personal, project, or work-unit inbox; move a listed entry or insert one from stdin
arc inbox <personal|project|slug> [--target <slug>] [--json]
arc route <id> --from <list> --expected-version <version> --to <destination> [--section <name>]
arc route --to <destination> [--section <name>]

# Errand lifecycle — no meta; `open` exactly resumes an existing eligible identity
arc errand next [--json]
arc errand open <slug> [--intent <text>] [--from-inbox <personal|project>:<id>] [--isolate] [--json]
arc errand link <slug> --from-inbox <personal|project>:<id> [--json]
arc errand queue [--json]
arc errand queue set <file|->
arc errand materialize <slug> [--claim-id <claim-id> --expected-head <oid>] [--json]
arc errand leave <slug> --state <paused|awaiting-merge> [--confirm-foreign-generation <generation>] [--json]
arc errand close <slug> [--confirm-foreign-generation <generation>] [--json]
arc errand abandon <slug> [--confirm-foreign-generation <generation>] [--json]
arc errand promote <slug> [--name <name>] [--type <type>] --floor <derivation|scale> \
  [--confirm-foreign-generation <generation>] [--json]
```

### Session State Portability

```bash
# Save pending edits, your personal records among them
arc save

# Pull state from the state remote, publish this clone's state, then push the branch
arc sync

# Inspect or set the state remote's roles; --own-state publishes everything this clone's store holds
arc store remote [remote] [role] [--own-state]

# Move state to another remote or backing URL, or import the current operational state
arc store migrate --to <remote-or-url> [--trial]
arc store migrate --import

# Inspect, or explicitly discard, a stored conflict
arc store conflict <uid> <kind> <id>
```

Your personal records, `scratch/` included, are stored under your identity beside the project's state: `arc save`
persists edits, and `arc sync` publishes them with the project's state to its state remote.

See [Session Operations Strategy](strategies/arc/strategy-session-operations.md) § Session State Portability for the
portability model.

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

Refusal exit codes 10–17 cover `ambiguous-active-wu`, `interlock-not-authorized`, `destructive-flag`,
`branch-protection-violation`, `pushability-precheck-failed`, `arg-grammar-fallthrough`, and
`commit-message-preflight-failed`, and `close-precheck-failed`; audit entries land at
`.arc/user/{identity}/.internal/.audit-log.jsonl`. See [DEV-RULES.ARC](../system/rules/DEV-RULES.ARC.md) § Commit
Discipline for the trust model and opt-in semantics.

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

| Operation    | Command                                      |
| ------------ | -------------------------------------------- |
| Create PR/MR | `gh pr create --base {base} --head {branch}` |
| List PRs/MRs | `gh pr list --head {branch} --base {base}`   |
| View PR/MR   | `gh pr view --json number,url,state`         |
| Merge PR/MR  | `gh pr merge {pr-number} --merge`            |
| Create issue | `gh issue create`                            |
