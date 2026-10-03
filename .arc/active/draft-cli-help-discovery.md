# Draft: CLI Help Discovery

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from a `USER-INBOX` capture made during the
  `clarify-review-json-output` Errand (2026-09-23).
- **Purpose:** Make `arc --help` and the high-traffic namespaces scannable, so a person or agent can find the common
  path without reading every command.
- **Planning posture:** `P3`; `Class` settles at planning.

---

## Problem / Motivation

At the 2026-10-03 baseline, `program` registrations rendered by `Help.formatHelp` produce 115 lines for
`npx arc --help`: a flat command list, long wrapped descriptions, and no examples or task groups. Busy namespaces
such as `review` are also flat, so common paths are hard to pick out. The
[CLI Guidelines](https://clig.dev/#help) recommend leading with common commands and examples. Commander 15 provides
command groups through `Command.helpGroup` and short summaries through `Command.summary`.

## Approach

Identify ARC's priority user journeys, then make root and high-traffic namespace help scannable with concise
summaries, task-based groups, and a few useful examples. Preserve exact command syntax while improving presentation;
assess any command re-nesting as a separate interface change.

## Design Constraints

- ARC is primarily operated by agents. Evaluate help by how directly it lets an agent find the relevant command,
  understand its invocation contract, and obtain the detail needed to use it correctly.
- Preserve human UX/DX. Prefer improvements that serve both audiences; justify any tradeoff explicitly rather than
  assuming agent use warrants a separate interface.
- Intended audience matters for presentation. Keep human-facing views easy to discover; an agent may invoke a
  command whose result is intended for a person. Task grouping can coexist with audience-specific labeling.
- Follow established CLI idiom where applicable, considering the agent operator alongside the
  [CLI Guidelines](https://clig.dev/#help).

## Resolved Direction

- Keep explicit root `--help` complete and grouped by task. Use the six root task groups, order, and command
  placements in the Root help sketch, including its workflow helper placements.
- Bare `arc` shows the concise introduction in the Bare invocation sketch, pointing to complete `arc --help`
  and command-specific help. Keep it on the help path with existing missing-subcommand status/channel behavior.
- Use concise summaries in command lists and retain precise descriptions on command pages. Judge rendered
  readability rather than treating a fixed character limit as sufficient; preserve meaningful qualifiers.
- Command pages expose exact syntax, applicable inherited options, defaults, effects, and output expectations.
  Point to existing request-schema discovery where supported.
- Choose examples by invocation difficulty and importance to either audience, including structured-request and
  continuation examples where those are the difficult parts.
- Apply the namespace groups, membership, and ordering below to `review`, `user`, `errand`, `release`, and `delivery`.
- Use the command-page convention and initial ten-page example set below. Keep `view` discoverable with inspection
  commands and describe its human-facing presentation on its own page.
- Improve the root purpose statement to cover work orchestration as well as installation and maintenance.
- Keep the work as one work unit: root navigation, namespace navigation, and command-page detail jointly establish
  one help-discovery contract. They share the command registration and rendering substrate and need no independently
  landed delivery boundary. Output-mode changes remain with `cli-output-contract`.

## Alternatives

- A curated explicit root help page plus a separate complete listing reduces the first list but introduces another
  discovery surface. Keep explicit root help complete; the short bare introduction supplies the concise entry.
- Re-nesting commands could shorten the root list but changes invocation syntax and existing workflow references.
  Task grouping improves navigation within the existing command tree; assess interface restructuring separately.
- Dividing the primary inventory by human versus machine use obscures commands an agent invokes for human
  consumption. Group by task and explain presentation and output on command pages. A future coherent presentation
  family can receive its own group when it exists.
- Separate agent help or an agent invocation preset introduces another interface or runtime contract. Shared precise
  help addresses this work's discovery needs; assess any runtime preset with `cli-output-contract`.

## Unknowns and Assumptions

No product-design decision remains open. The formatter's internal structure and rendering adjustments are
implementation details within the settled section order, grouping, and visibility rules. Representative discovery
exercises still need to validate the assumption that these task labels make the common paths easy to find; summary
and grouping coverage checks alone cannot establish that.

## Scope boundary (Won't Do)

This work changes help presentation and discovery. It does not rename or re-nest commands, alter operational
behavior, add output modes or an agent preset, or implement future HUD features. Existing output and interaction
contracts are described accurately; their redesign belongs to `cli-output-contract` and is not a prerequisite.
Keep the registered command tree authoritative, without a second syntax inventory or handwritten request schema.

## Settled Help Sketches

The sketches define the agreed presentation; they are not current CLI output. Examples use `my-work` for an existing
planned work unit and `request.json` for a valid request. Command and option spellings remain unchanged.

Grounding: `program` in `packages/arc-framework/src/cli.ts` owns the command registration.
`handleStatus` and `StatusCommandInputSchema` own the status defaults and mode constraints.
`handleReviewResolve`, `handleReviewRequestSchema`, and `reviewDiscoverableCommandInputSchema` own the review
request, schema-discovery, and input-exclusivity behavior. `resolveCommandInteractionContext` and
`resolveInteractionContext` establish the inherited no-input policy. Commander supplies short list descriptions through
`Help.subcommandDescription`, grouping through `Help.groupItems`, and inherited options through
`Help.visibleGlobalOptions`.

### Root help

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

### Bare invocation

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

### Status command help

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

### Review resolution help

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

### Namespace grouping

Apply task groups to the immediate children of these five namespaces. Each retains a final Help group for its
generated `help` command; the table lists the 65 substantive commands. Other small namespaces retain a single
Commands group unless a concrete navigation problem calls for more.

| Namespace  | Group, in display order    | Commands, in display order                                                     |
| ---------- | -------------------------- | ------------------------------------------------------------------------------ |
| `review`   | Choose review work         | `pre-publication`, `resolve`, `changeset`                                      |
| `review`   | Run and respond            | `frontline`, `hosted`, `local`, `respond`, `reduce`, `terminus`                |
| `review`   | Check readiness            | `status`, `readiness`, `checks`, `change-request`, `merge-method`              |
| `review`   | Clear planning changes     | `planning-lane`, `planning-grooming`                                           |
| `user`     | Inspect and synchronize    | `status`, `sync`, `save`, `load`, `push`, `fetch`, `pull`                      |
| `user`     | Manage workspaces          | `add`, `open`, `close`                                                         |
| `user`     | Maintain notes and inbox   | `compact`, `reconcile-references`, `inbox-mark-execute-bound`, `inbox-remove`  |
| `errand`   | Find and open work         | `next`, `check`, `open`, `link`, `materialize`                                 |
| `errand`   | Pause and finish work      | `leave`, `merge`, `close`, `abandon`, `promote`                                |
| `release`  | Commit and push            | `commit`, `push`                                                               |
| `release`  | Configure and inspect      | `status`, `opt-in`, `opt-out`, `setup`                                         |
| `delivery` | Prepare and transfer plans | `entry`, `plan`, `authoring`, `eligibility`, `compose`, `transfer`             |
| `delivery` | Publish and inspect        | `publish`, `native`, `position`, `checks`                                      |
| `delivery` | Refresh and repair         | `refresh`, `review-fix`, `reconcile`, `rewrite`, `rematerialize`, `top-remedy` |
| `delivery` | Land and clean up          | `land`, `teardown`, `closeout`                                                 |

The namespace groups describe the operation rather than the caller or output format. A namespace that mixes
inspection and mutation retains both, with precise list summaries and command-page effects. The tables define help
display order; reorder help collections rather than moving registrations in `program`. Commander remains the
source for command syntax, wrapping, option defaults, and inherited options.

### Command-page convention

Use the order in the two command-page sketches: Usage, a precise purpose statement, Examples when present,
Arguments when present, command-local options, applicable Global options, then short command-specific notes and
related help. Group command-local options when that makes a busy page easier to navigate; a small flag set retains
one Options section. An operation's important effects stay in its purpose statement before examples; individual
flag effects stay with their option descriptions. Supplementary defaults and mode relationships may follow options.

The extra Defaults and Choose one sections address `StatusCommandInputSchema`'s multi-mode constraints. They are
not required boilerplate on every page. A structured-request command points to existing `--schema` discovery when
available and describes whether JSON output is automatic or opt-in according to its registered behavior. Examples
reuse request file/stdin patterns without publishing a second handwritten copy of a request schema.

Give visible registered commands concise, verb-first list summaries; retain precise descriptions on their own
pages. Explicit command groups are required at the root and the five namespaces above. Generated help entries
receive intentional Help placement; hidden commands/options retain their current visibility. Check summary
presence and grouping coverage, and inspect representative rendering at 80 columns. Allow justified wrapping for
long syntax or meaningful qualifiers rather than deleting meaning to satisfy a fixed character limit.

### Initial example coverage

Root and bare-introduction examples remain as shown. The initial command-page set is ten pages selected for
invocation difficulty and workflow importance; namespace overview pages point to relevant child help rather than
repeating every child example.

| Page                    | Example invocations                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `start`                 | `arc start my-work`; `arc start fresh-work --new`; `arc start my-work --here`              |
| `status`                | The three examples in its sketch: one work unit, project work, and session context         |
| `view`                  | `arc view tasks --current`; `arc view spec --for my-work`                                  |
| `errand open`           | `arc errand open my-fix`; `arc errand open my-fix --from-inbox "Fix the formatting issue"` |
| `errand next`           | `arc errand next --json`                                                                   |
| `sync`                  | `arc sync --dry-run`; `arc sync`                                                           |
| `user status`           | `arc user status`; `arc user status --offline --json`                                      |
| `review resolve`        | The schema, request-file, and stdin examples in its sketch                                 |
| `review hosted request` | `arc review hosted request --schema`; `arc review hosted request request.json`             |
| `release commit`        | `arc release commit -F message.txt`                                                        |

The start examples distinguish an existing planned target, a fresh target, and the current-checkout variant; the
command description retains branch, commit, and push effects. The inbox title example denotes an existing matching
capture. `request.json` is a valid request for the command, and `message.txt` is a valid commit message for the
project; examples do not fabricate either payload. The hosted request page retains the existing continuation
direction: submit its emitted action unchanged to `arc review hosted await -`, as registered by `program`.
The release example uses `program`'s existing argument forwarding, with approvals and validation unchanged.

These ten pages are a first coverage set, not a ceiling on examples. Add an example only when it resolves a concrete
invocation ambiguity; other schema-capable commands retain their schema-discovery pointers, and namespace overview
help continues to expose every child operation.

## Success Signal

An unfamiliar reader can find the relevant operation and construct a valid invocation using help and its linked
schema, without reading implementation source. Representative discovery exercises cover both agent-operated
workflows and human use; structural checks verify grouping and concise summaries without standing in for usability.

## Related

- `cli-output-contract` — owns output-mode conventions; the possible agent invocation preset is captured for it.
  Help describes current output and interaction behavior while tasks drive primary grouping. Coordinate future
  output labels and flags with that contract.
