# CLI Help Presentation Reference

The sketches define the agreed presentation; they are not current CLI output. Examples use `my-work` for an existing
planned work unit and `request.json` for a valid request. Command and option spellings remain unchanged.

Grounding: `program` in `packages/arc-framework/src/cli.ts` owns the command registration.
`handleStatus` and `StatusCommandInputSchema` own the status defaults and mode constraints.
`handleReviewResolve`, `handleReviewRequestSchema`, and `reviewDiscoverableCommandInputSchema` own the review
request, schema-discovery, and input-exclusivity behavior. `resolveCommandInteractionContext` and
`resolveInteractionContext` establish the inherited no-input policy. Commander supplies short list descriptions through
`Help.subcommandDescription`, grouping through `Help.groupItems`, and inherited options through
`Help.visibleGlobalOptions`.

## Navigation alternatives

- A curated explicit root help page plus a separate complete listing reduces the first list but introduces another
  discovery surface. Keep explicit root help complete; the short bare introduction supplies the concise entry.
- Re-nesting commands could shorten the root list but changes invocation syntax and existing workflow references.
  Task grouping improves navigation within the existing command tree; assess interface restructuring separately.
- Dividing the primary inventory by human versus machine use obscures commands an agent invokes for human
  consumption. Group by task and explain presentation and output on command pages. A future coherent presentation
  family can receive its own group when it exists.
- Separate agent help or an agent invocation preset introduces another interface or runtime contract. Shared precise
  help addresses this work's discovery needs; assess any runtime preset with `cli-output-contract`.

## Root help

```text
Usage: arc [options] [command]

Plan, run, review, and land development work with ARC.

Examples:
  arc status --project              See project work
  arc start my-work                 Start a planned work unit
  arc view tasks --current          Display the current task

Options:
  --no-input                       Forbid prompts, interactive presentation,
                                   and ambient child-process input
  -V, --version                    Show the version
  -h, --help                       Show help

Inspect work and context:
  status [options] [slug]          Inspect work, project, and session state
  view [options] [kind]            Display a work artifact
  active                           Inspect active work-unit state
  locus [options]                  Inspect checkouts and their ARC roles
  log                              Browse ARC commit history
  recover                          Recover agent context after compaction

Plan and organize work:
  start [options] [name]           Start work in an isolated worktree
  stub [options] [name]            Create a provisional or planned work unit
  promote [options] [slug]         Raise a provisional work unit to planned
  demote [slug]                    Return a planned work unit to provisional
  rename <slug> <new-slug>         Rename a work unit and its related state
  decompose [options] <origin>     Split work along settled boundaries
  plan                             Check whether drafting can proceed
  set-stage [options] <stage>      Set the current planning stage
  finalize [options] <fire-point>  Persist planning finalization facts
  repoint-design <event>           Advance the work unit's design pointer

Run and resume work:
  activate [options] [slug]        Activate a planning work unit
  deactivate [slug]                Return an active work unit to planning
  park [options] [slug]            Shelve work while preserving its branch
  resume [options] [slug]          Resume a parked work unit
  materialize [options] [slug]     Pick up remote-only work locally
  reopen [options] [slug]          Withdraw publication and return to work
  abandon [options] [slug]         Destroy pre-merge work with confirmation
  wu                               Plan or apply current-work-unit repairs
  attest [options] <name>          Attest a verified work-unit Candidate
  candidate                        Manage Candidate lineage and applicability

Review and land work:
  review                           Resolve and run review workflows
  publish [options] [slug]         Prepare an active work unit for publication
  integrate                        Check readiness and merge an approved head
  merge                            Manage merge controls
  base                             Inspect or reconcile the integration base
  delivery                         Compose and land delivery plans
  release                          Commit or push through release validation
  archive [options] [slug]         Archive a shipped work unit
  teardown [options] [name]        Clean up retired work and its checkout

Run errands and synchronize:
  errand                           Open, resume, or complete isolated work
  housekeep                        Check the context for draining the inbox
  sync [options]                   Synchronize the configured concerns
  user                             Manage user workspaces and notes

Set up and maintain ARC:
  init [options]                   Initialize ARC in the current project
  join [options]                   Join an existing ARC project
  update [options]                 Update installed framework files
  health                           Check installed framework file health
  diff                             Compare installed and latest framework files
  check                            Run standalone repository checks
  config                           Inspect configuration
  extensions                       Inspect extensions

Help:
  help [command]                   Show help for a command

Learn more:
  arc <command> --help              Read command-specific help
  arc review <command> --help       Read help within a namespace
  Docs:   https://github.com/andrewRCr/arc-framework#readme
  Issues: https://github.com/andrewRCr/arc-framework/issues
```

The first six headings are task groups; the final Help section carries the generated help command. Inspection comes
first, followed by planning, execution, landing, synchronization, and setup. `view` stays next to `status` as the
human-facing display operation in this shared inspection group. A dedicated presentation group remains an option
when a coherent family of such commands exists; this sketch creates no empty future groups.

Workflow record helpers sit with their task: `set-stage`, `finalize`, and `repoint-design` support planning;
`attest`, `candidate`, and `wu` support execution; `release` supports committing and publication. These
placements follow how a reader would look for the operation and are part of the settled root grouping.

## Bare invocation

The complete root listing remains substantial even after grouping. Bare `arc` provides a concise introduction,
while explicit `arc --help` remains complete. This settled presentation choice is independent of command re-nesting.

```text
Usage: arc [options] [command]

Plan, run, review, and land development work with ARC.

Examples:
  arc status --project        See project work
  arc start my-work           Start a planned work unit
  arc view tasks --current    Display the current task

Options:
  --no-input     Forbid prompts, interactive presentation,
                 and ambient child-process input
  -V, --version  Show the version
  -h, --help     Show full help

More help:
  arc --help                  List every command, grouped by task
  arc <command> --help        Read command-specific help
```

This introduces no second command inventory: the examples reuse the root examples and command references remain
grounded in `program` registrations. Retain the current missing-subcommand
stderr/exit-1 behavior established by `Command._parseCommand` and `Command.help`; changing that behavior would be
an explicit additional decision. Keep the introduction on the help path, without repository probes or operational
actions.

## Status command help

```text
Usage: arc status [options] [slug]

Inspect work-unit state, project work, and session context.

Examples:
  arc status my-work --json         Inspect one work unit as JSON
  arc status --project              See the project work list
  arc status --session-init --json  Read session initialization context

Arguments:
  slug                     Work unit to inspect; omit for composite status

Work views:
  --project                Show project work
  --user                   Show your in-flight work across checkouts

Session context:
  --session-init           Select session initialization context
  --session-handoff        Select handoff context; requires --json
  --recover                Select recovery context; requires --json

Refresh:
  --fetch                  With a slug: refresh remote membership
  --local                  With --user/--project: use local refs
  --no-fetch               With --user/--project: use local refs

Project rendering:
  --staged                 With --project: read the staged tree
  --write                  With --project --staged: write ROADMAP;
                           requires omitting --json

Context writes:
  --write-compaction-seed  With --session-init: write the local recovery seed

Options:
  --json                   Emit the selected result as JSON
  -h, --help               Show help

Global options:
  --no-input               Forbid prompts, interactive presentation,
                           and ambient child-process input
  -V, --version            Show the version

Defaults:
  Without a slug or view flag, inspect user sync, extensions,
  configuration, and active work.
  Slug queries use local state by default. --user and --project
  read live refs by default; use --local or --no-fetch for local views.

Choose one:
  A slug, --project, --user, --session-init, --session-handoff,
  or --recover. These modes are mutually exclusive.
```

This page keeps every current option visible, brings three representative examples forward, groups options by
purpose, and states mode exclusivity and remote-read defaults. The write options explicitly name their effects.
Selecting session initialization context does not itself promise JSON output: `handleStatus` still uses `--json`
to choose that format. Its handoff and recovery branches require explicit `--json`. Global version and no-input
options remain visible alongside the command-local help option.

## Review resolution help

```text
Usage: arc review resolve [file | -] [--schema]

Resolve the next configured review-policy action from a JSON request.

Examples:
  arc review resolve --schema      Inspect the accepted request schema
  arc review resolve request.json  Resolve an existing request
  cat request.json | arc review resolve -
                                   Read the request from stdin

Arguments:
  input       Versioned JSON request file, or - for stdin;
              required unless --schema is selected

Options:
  --schema    Print the request schema and referenced schema definitions;
              use without a request file or stdin argument
  -h, --help  Show help

Global options:
  --no-input     Forbid prompts, interactive presentation,
                 and ambient child-process input
  -V, --version  Show the version

Input and output:
  Supply a request matching the schema; request facts must describe
  the actual review target and review state.
  The review-policy result is JSON. --json is unsupported.

Related:
  arc review --help
```

Schema discovery comes before request submission. The examples cover file and stdin input without duplicating the
request schema in help; the schema supplies field structure while descriptions establish purpose and actual-state
expectations. The page states that output is already JSON and that `--schema` is an alternative to request input.
It makes no new guarantee about JSON output from parser or self-hosting guard failures.

## Representative validation

The built-CLI pilot passed outside an initialized ARC project at Commander's default 80-column width. The subprocess
suite in `packages/arc-framework/__tests__/e2e/run-cli.e2e.test.ts` exercised these entry paths in empty temporary
folders; focused native-Commander tests checked display ordering, hidden visibility, inherited settings, wrapping,
and action-hook isolation.

- Bare invocation: stderr, exit 1, concise introduction and help pointers, no command inventory.
- Explicit `-h`, `--help`, and `help`: stdout, exit 0, complete ordered root groups, examples, and documentation.
- `status --help`: ordered local-option groups, inherited flags, refresh defaults, JSON selection, mode exclusivity,
  and write requirements/effects.
- `review resolve --help`: exact Usage, schema-first file/stdin examples, input exclusivity, automatic result JSON,
  unsupported `--json`, and related help. Separate example columns retain native wrapping for arguments and options.
- `review resolve --schema`: stdout JSON with the registered root and referenced schema definitions, exit 0, no
  project required.

The file and stdin examples retain the registered optional `input` operand, whose handler requires exactly one
request source or schema selection. No request execution or fabricated review-authority payload was needed for the
pilot. The CLI loading-boundary checks continue to show implementation handlers loaded only when their actions run.

---
