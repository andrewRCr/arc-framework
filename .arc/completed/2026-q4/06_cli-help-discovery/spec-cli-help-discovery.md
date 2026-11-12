# Spec (`outline`): CLI Help Discovery

- **Origin:** [internal] — CLI discovery concern captured during the `clarify-review-json-output` Errand.
- **Purpose:** Make ARC help easy to scan and sufficient to find an operation and construct its invocation, for
  agent operators and people using the CLI directly.

---

## Problem / Context

At the 2026-10-03 baseline, `program` in `packages/arc-framework/src/cli.ts` and Commander's `Help.formatHelp`
produce 115 lines of flat root help, with long wrapped descriptions and no examples. Busy namespace lists have the
same navigation problem. ARC is primarily agent-operated, but human UX/DX and discovery of human-facing features
remain requirements: the caller and the intended consumer of a command's result can differ.

This work improves the existing command tree through summaries, task groups, examples, and precise command pages.
The design follows the help idiom described by the [CLI Guidelines](https://clig.dev/#help); it needs no separate
agent help interface. Root navigation, namespace navigation, and command detail stay one work unit because they
jointly establish one discovery contract on the same registration and rendering substrate.

## Decision(s)

### Entry help and root navigation

Use the purpose statement: "Plan, run, review, and land development work with ARC." Bare `arc` shows a short
introduction containing Usage, that purpose, the three root examples, the existing global options, and pointers to
`arc --help` and `arc <command> --help`. It contains no command inventory. Explicit root `-h` / `--help` and
`arc help` remain complete. Root examples are:

```text
arc status --project        See project work
arc start my-work           Start a planned work unit
arc view tasks --current    Display the current task
```

Keep the bare introduction on the help path. `Command._parseCommand` routes the current missing-subcommand case
through `Command.help({ error: true })`; retain stderr and exit 1. Explicit help retains stdout and exit 0. Rendering
help must not invoke operational handlers, prompts, or repository probes.

Explicit root help displays the following groups and members in the specified order, with a final Help group for
the generated `help [command]` entry. The baseline has 48 visible entries including generated help. Every visible
registered root command remains discoverable.

| Group, in display order     | Commands, in display order                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Inspect work and context    | `status`, `view`, `active`, `locus`, `log`, `recover`                                                          |
| Plan and organize work      | `start`, `stub`, `promote`, `demote`, `rename`, `decompose`, `plan`, `set-stage`, `finalize`, `repoint-design` |
| Run and resume work         | `activate`, `deactivate`, `park`, `resume`, `materialize`, `reopen`, `abandon`, `wu`, `attest`, `candidate`    |
| Review and land work        | `review`, `publish`, `integrate`, `merge`, `base`, `delivery`, `release`, `archive`, `teardown`                |
| Run errands and synchronize | `errand`, `housekeep`, `sync`, `user`                                                                          |
| Set up and maintain ARC     | `init`, `join`, `update`, `health`, `diff`, `check`, `config`, `extensions`                                    |

Keep `view` beside `status`, and describe its human-facing presentation on its own page. Group commands by the task
they support; do not divide the inventory by human versus machine callers. Planning record helpers stay with
planning, execution helpers with execution, and `release` with landing. Create no empty groups for future features.

End root help with command-specific and namespace-help pointers, plus the existing package homepage and issue links.
The concise introduction reuses the root purpose, examples, and global-option descriptions.

### Namespace navigation

Apply task groups to immediate children of the five namespaces below, using the specified group and member order.
Each has a final Help group for its generated help entry; the table covers the 65 substantive baseline children.
Other small namespaces keep a single Commands group unless a concrete navigation problem warrants more.

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

Sort help collections, preserving registration order and command routing in `program`. Reuse Commander's
`Command.summary`, `Command.helpGroup`, and option grouping, with a small presentation override where needed for
the chosen section and display order. `Help.groupItems` otherwise orders groups by their first registered item.
The registered tree remains the authority for syntax, options, defaults, and visibility; help metadata may supply
summaries, examples, headings, and display order without duplicating the command grammar.

### Command pages and summaries

Every visible registered command gets a concise, verb-first, sentence-case list summary. Its own page retains a
precise purpose and meaningful qualifiers, including important operational effects before examples. A summary is
judged by its rendered readability; there is no fixed character limit that permits deleting meaning.

Use this page order: Usage, purpose, Examples when present, Arguments when present, command-local options,
applicable Global options, then concise command-specific notes and related help. Group busy local-option sets by
purpose; small sets keep one Options section. Describe a flag's effects beside that flag. Defaults and mode
relationships are additional notes where needed, rather than boilerplate on every page.

Expose exact existing syntax and applicable inherited options. `Help.visibleGlobalOptions` supplies inherited
visibility; retain the local help option, show inherited version and no-input flags, and keep existing hidden
commands and options hidden. `resolveCommandInteractionContext` and `resolveInteractionContext` establish the
no-input policy: forbid prompts, interactive presentation, and ambient child-process input.

Structured-request pages point to their existing `--schema` discovery and explain file/stdin input, input
exclusivity, and whether JSON output is automatic or opt-in. Preserve existing continuation guidance. Do not copy a
request schema into help or fabricate example request payloads.

### Representative contracts

The `status` page groups its local options as follows, then displays Global options, Defaults, and Choose one:

- **Work views:** `--project`, `--user`.
- **Session context:** `--session-init`, `--session-handoff`, `--recover`.
- **Refresh:** `--fetch`, `--local`, `--no-fetch`.
- **Project rendering:** `--staged`, `--write`.
- **Context writes:** `--write-compaction-seed`.
- **Options:** `--json`, `-h` / `--help`.

Explain the behavior established by `handleStatus` and `StatusCommandInputSchema`: bare status inspects user sync,
extensions, configuration, and active work; a slug query is local by default, with `--fetch` refreshing remote
membership. User and project views read live refs by default; `--local` or `--no-fetch` selects local views. A slug,
project, user, session-init, session-handoff, or recover selection is mutually exclusive with the others.
Session-init does not itself select JSON; handoff and recover require explicit `--json`. `--staged` requires
`--project`; `--write` requires `--project --staged` without `--json` and writes ROADMAP. `--write-compaction-seed`
requires session-init and writes the local recovery seed.

The `review resolve` page uses its current Usage, `arc review resolve [file | -] [--schema]`, and the existing
`input` operand. `handleReviewResolve` emits its review-policy result as JSON; `program`'s
`rejectUnsupportedReviewJson` hook keeps `--json` unsupported. `handleReviewRequestSchema` prints the registered
request schema and referenced definitions; `reviewDiscoverableCommandInputSchema` requires exactly one request
source or schema selection. Put schema discovery before file and stdin submission in Examples, followed by
Arguments, Options, Global options, Input and output, and Related (`arc review --help`). Explain that request facts
describe the actual target and review state. Make no new JSON guarantee for parser or self-hosting guard failures.

### Initial example coverage

Provide examples on these ten pages, selected for invocation difficulty and workflow importance to either audience.
Namespace overview pages point to relevant child help rather than repeat every child example.

| Page                    | Example invocations                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `start`                 | `arc start my-work`; `arc start fresh-work --new`; `arc start my-work --here`                                |
| `status`                | `arc status my-work --json`; `arc status --project`; `arc status --session-init --json`                      |
| `view`                  | `arc view tasks --current`; `arc view spec --for my-work`                                                    |
| `errand open`           | `arc errand open my-fix`; `arc errand open my-fix --from-inbox "Fix the formatting issue"`                   |
| `errand next`           | `arc errand next --json`                                                                                     |
| `sync`                  | `arc sync --dry-run`; `arc sync`                                                                             |
| `user status`           | `arc user status`; `arc user status --offline --json`                                                        |
| `review resolve`        | `arc review resolve --schema`; `arc review resolve request.json`; `cat request.json \| arc review resolve -` |
| `review hosted request` | `arc review hosted request --schema`; `arc review hosted request request.json`                               |
| `release commit`        | `arc release commit -F message.txt`                                                                          |

`my-work` denotes an existing planned target, `fresh-work` a new target, and the inbox title an existing matching
capture. Explain `start`'s default isolated checkout and its `--here` alternative while retaining the branch, commit,
and push effects already described by `program`. `request.json` and `message.txt` denote valid files for their
commands, not supplied payloads. Retain `program`'s hosted-request continuation: submit its emitted action unchanged
to `arc review hosted await -`. Its `release commit` registration already forwards Git arguments.

These pages are the initial coverage set, not a ceiling. Add an example when it resolves a concrete invocation
ambiguity; keep schema-discovery pointers on other supported pages. Examples must use supported syntax and explain
any context they assume, without implying approval or successful execution merely from the displayed command.

## Scope boundary (No-gos)

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- Change help presentation and discovery only. Do not rename or re-nest commands, change positional arguments or
  flags, change operational handlers, or alter output modes, approval requirements, and interaction policy.
- Do not add an agent preset, JSON help mode, or a primary human/machine inventory division.
- Do not implement future HUD features or create placeholder groups for them.
- Do not add a second command grammar, handwritten request schemas, new persistent state, or a dependency for help.
- Existing output and interaction contracts are described here. Their redesign is separate and is not a dependency
  of this work.

## Consequences & Risks

- Complete explicit root help remains substantial. The short introduction, task groups, concise summaries, and
  scoped pages reduce the navigation cost while keeping less common operations visible.
- Presentation metadata can drift as commands are added. Check summary presence throughout the visible command
  tree and grouping coverage at the root and the five named namespaces, including intentional generated-help
  placement. Derive syntax and visibility from registrations.
- Custom ordering and example placement must preserve Commander wrapping, option annotations, hidden-item handling,
  and help contexts. Compose its existing helpers rather than maintain another parser or rendering grammar.
- `program` centralizes registrations in an already large entry file. Keep presentation logic cohesive and small;
  avoid moving registrations or expanding this work into a general registration refactor.
- Task labels are a usability assumption. Validate them through representative human and agent discovery exercises;
  structural coverage alone cannot show that readers find the right operation.
- Narrow terminals and long syntax may require wrapping. Inspect representative output at 80 columns and retain
  meaningful qualifiers rather than enforce an arbitrary summary-length rule.

## Success Criteria

1. Explicit root help includes every visible registered root entry exactly once, in the specified groups and order;
   each named namespace does the same for its immediate children, with generated help placed last.
2. Bare `arc` displays the concise introduction and help pointers with stderr/exit 1; explicit `-h`, `--help`, and
   `arc help` display complete root help with stdout/exit 0. Help works outside an ARC project and invokes no
   operational handler, prompt, or repository probe.
3. Every visible command has a concise list summary and a precise own-page purpose. Representative pages follow the
   specified section order, retain exact syntax and meaningful effects, show applicable inherited flags, and
   preserve hidden-item visibility. Rendered root, status, and review-resolve help is readable at 80 columns.
4. The initial ten pages contain the listed supported examples, with context assumptions and existing continuation
   guidance. Schema-capable request pages retain discovery pointers without a second handwritten schema.
5. Status help exposes all existing local flags in the specified groups and correctly states modes, refresh
   defaults, JSON selection, and the write constraints and effects listed above.
6. Review-resolve help accurately describes schema versus request input, file/stdin forms, automatic JSON output,
   actual-state request facts, and unsupported `--json`; existing command behavior remains unchanged.
7. A reader starting from root help can find and state valid invocations to inspect project work, display the
   current task for a person, obtain session-init JSON, and discover and submit a review request by file or stdin,
   using help/schema and valid contextual inputs without reading implementation source. Record the help paths and
   resulting invocations as discovery evidence, alongside the automated coverage and behavior checks.

## Open items

No settle-before-implementation design decision remains open. Formatter internals and small wrapping adjustments
are implementation details within these decisions. If a discovery exercise exposes a material navigation gap,
resolve it against the design rather than silently changing the command interface.

---
