# Draft: cli-command-inputs

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Define and implement a uniform validated input contract for interactive and non-interactive ARC
  commands.

---

## Problem / Motivation

ARC commands acquire input through Commander arguments, Clack prompts, environment-derived values, and local
defaults. Those paths currently decide interaction availability, fallback behavior, validation, cancellation, and
confirmation independently. Known commands have isolated non-TTY safeguards, but another prompt can still block or
auto-cancel when invoked by an agent, CI, or a machine-readable command mode.

The central defect is an authority conflation. The CLI often treats "cannot prompt" as if the caller had supplied
`--yes`: `init` and `join` currently imply `--yes` under CI/non-TTY, while other commands auto-keep, auto-proceed,
save-only, or refuse. The eight existing `--yes` declarations themselves carry several meanings — use defaults,
skip a courtesy confirmation, accept overwrite behavior, or authorize a destructive cascade. Interaction
capability, default selection, required values, and affirmative authority need separate contracts.

The CLI also validates value-bearing Commander options and Clack results unevenly. `cli-schema-kernel` now ships
Zod-backed `Slug`, `Priority`, `WorkClass`, and `WorkUnitState` vocabulary plus a registry, Result seam, and open
error taxonomy, but command handlers still receive many raw strings and hand-narrow them. For example, the landed
`stub` contract correctly refuses absent commitment and priority, yet priority is only checked for non-emptiness and
missing values cannot be elicited through a reusable input layer.

The CLI needs one command-input contract that makes automation deterministic without weakening interactive
guidance, inventing required values, or granting authority merely because no terminal is attached.

## Goals

- Inventory every input-bearing command surface: Clack prompt sites, value-bearing Commander operands/options,
  derived values, machine-output modes, and confirmation gates.
- Separate interaction capability from affirmative authority through one centrally resolved interaction context.
- Parse Commander values and Clack answers through the same command-owned Zod schemas before dependent side effects.
- Let only explicitly declared safe defaults resolve when interaction is unavailable.
- Elicit handler-level required values when interaction is available; otherwise fail once with every missing value
  and the exact accepted operand/flag syntax needed to proceed.
- Treat cancellation, invalid input, and unavailable interaction as distinct typed outcomes.
- Require explicit affirmative authority for protected confirmations; CI/non-TTY/JSON never supplies it.
- Preserve the shipped lifecycle and command policy boundaries while providing their reusable acquisition and
  validation substrate.
- Prove that every non-interactive command path terminates without an unsolicited prompt or editor read and
  performs no mutation that depends on unresolved required input or protected confirmation.

## Non-Goals

- Replace Commander or Clack, redesign prompt presentation, or churn the prompt framework.
- Redesign work-unit lifecycle transitions, stub policy, sync policy, or release-wrapper trust policy.
- Make unsafe choices merely because they are current interactive defaults.
- Add silent provisional values, placeholder owners, or default `P3` priority where a value is required.
- Give `--yes` the power to fabricate required data or attest external evidence.
- Define a universal machine-readable error envelope; commands preserve their existing output contracts.
- Publish registered command schemas through `arc schema`; registration and publication remain distinct, and
  `schema-introspection-layer` owns the consumer-facing projection.
- Validate opaque passthrough payloads such as arguments forwarded to Git, or migrate unrelated file/network record
  schemas owned by `cli-validation-surfaces` or `cli-substrate-complete-migration`.
- Change command semantics unrelated to input acquisition, validation, cancellation, or confirmation.

## Design Decisions

### Two-axis interaction contract

Resolve one `InteractionContext` at the CLI adapter before a handler acquires input. It carries two independent
axes:

- **Interaction:** `allowed` or `forbidden` — whether a prompt may be rendered and read.
- **Confirmation:** `ask` or `accept` — whether the caller supplied affirmative authority.

The adapter resolves the axes from explicit invocation and process facts:

| Signal | Interaction | Confirmation |
| --- | --- | --- |
| Ordinary interactive invocation | `allowed` | `ask` |
| Global `--no-input` | `forbidden` | `ask` |
| CI, non-TTY input/output, or machine-readable mode | `forbidden` | `ask` |
| Command-local `--yes` on an authority-bearing command | `forbidden` | `accept` |
| Legacy no-input alias (`init`, `join`, `start`, or `user load --yes`) | `forbidden` | `ask` |
| `--no-input --yes` | `forbidden` | `accept` |

`--no-input` is the uniform global automation flag. `--yes` remains command-local: it either accepts the protected
confirmations named in the site table below or survives as a compatibility alias for prompt-free execution.
Existing `init`, `join`, `start`, and currently inert `user load --yes` remain accepted as no-input aliases and add
no authority. Every existing `--yes` option remains accepted and becomes deterministically prompt-free, but the
flag never supplies required values, selects among domain actions, or attests evidence. An environment signal never
changes confirmation to `accept`.

Machine-readable output always forbids unsolicited interaction even in a TTY. Every current `--json` selection sets
that adapter bit; another current or future typed mode does so only through an explicit machine-readable declaration
at its command adapter, never by flag-name inference. It does not forbid stdin as data when the caller explicitly
selects a stdin operand such as `-` or `-F -`. CI is only a stronger no-input signal; it does not select a different
command behavior. The process adapter resolves the actual prompt input and render streams once, separately from
explicit payload readers, replacing direct `process.stdin.isTTY`, `process.stdout.isTTY`, and `process.env.CI` checks
below the boundary.

### Input and confirmation matrix

Every site declares its policy; there is no fallback inferred from prompt presentation or a Clack initial value.

| Site kind | Interactive behavior | No-input behavior |
| --- | --- | --- |
| Supplied or deterministically derived value | Parse through its schema; proceed on success | Same |
| Parser-required positional (`<value>`) | Commander requires it; parse through its schema without prompting | Same Commander requirement |
| Optional value without a default | Parse when supplied; otherwise preserve `undefined` without prompting | Same |
| Optional value with declared safe default | Prompt only at a declared prompt site; otherwise apply the default | Apply the declared default |
| Handler-level required value | Elicit and validate | Refuse once, naming every missing value and accepted operand/flag |
| Courtesy confirmation | Ask; cancellation/decline stops cleanly | Proceed because invocation already carries authority |
| Protected confirmation | Ask for positive confirmation | Require command-local `--yes`; otherwise refuse before mutation |
| Required evidence/attestation | Elicit or accept a domain-specific evidence flag | Require that flag; `--yes` never substitutes |

A **safe default** is site-declared and cannot broaden authority or add a risky effect beyond the command already
requested. It may preserve existing state (`user open` keeps a stale subdirectory), reduce action (`sync` saves
without pushing), or select the command's documented baseline configuration (`init` derives its project name and
uses declared defaults). A prompt's `initialValue` is not enough to establish safety.

A **courtesy confirmation** repeats intent already expressed by invoking the command, such as starting a resolved
work unit after the command has shown its plan. A **protected confirmation** covers destructive cascades, data
replacement, trust grants, or another effect for which invocation alone is insufficient. `--force` remains a
separate domain override and is never implied by either automation flag.

Required evidence is not confirmation. Release-setup workflow verification, for example, asserts that an external
step occurred; automation must supply a purpose-named evidence flag or refuse. `--yes` can consent but cannot make
the assertion true.

Commander keeps ownership of syntax-level acquisition. A required `<operand>` remains required in both modes and
uses Commander’s pre-handler missing-operand failure; this WU adds its schema parser but neither makes it optional
nor duplicates it as a flag. An `[optional]` operand or value option remains absent without a prompt unless the
command owner already requires it for the selected handler branch. Those handler-level requirements use the shared
elicitation/refusal outcome and advertise whichever positional or flag form the command accepts. Existing explicit
Commander/handler defaults (for example, errand type/intent and archive completion date) remain deterministic
defaults after schema validation; this WU does not turn them into prompts. The generated inventory records one of
these acquisition classes for every value-bearing input and fails on an unclassified input.

The following policy table is authoritative for the 22 current Clack prompt operations and the two non-Clack
interaction gates found in source. A later inventory may discover another site, but implementation may not choose
its authority class: the spec must record the added row before that site migrates.

| Site | Classification and interactive cancellation | No-input contract | Protected mutation boundary |
| --- | --- | --- | --- |
| `init`: project name | Safe derived default; cancel stops setup | `--name`, else derive from the directory | Installation writes wait for the resolved config |
| `init` / `join`: tools | Safe empty/current default; cancel stops setup | `--tools`, else empty for fresh setup or current value for reconfigure | Skill/config writes wait for the resolved list |
| `init`: PM mode | Safe default `none`; cancel stops setup | `--pm-mode`, else `none` | Installation writes wait for the resolved config |
| `init`: team mode | Safe default disabled; cancel stops setup | `--team`, else disabled | Installation writes wait for the resolved config |
| `init --reconfigure`: project name | Safe current-value default; cancel stops reconfigure | `--name`, else current value | Reconfigure apply waits for the complete config |
| `init --reconfigure`: PM mode | Safe current-value default; cancel stops reconfigure | `--pm-mode`, else current value | Reconfigure apply waits for the complete config |
| `init --reconfigure`: team mode | Safe current-value default; cancel stops reconfigure | `--team`, else current value | Reconfigure apply waits for the complete config |
| `join`: role | Safe current/maintainer default; cancel stops setup | `--contributor`, else current role or maintainer | Workspace writes wait for role, tools, and identity |
| Reconfigure removal: bulk choice | Safe classification-derived default; cancel stops reconfigure | Remove Framework files; keep Configurable/Scaffolded files | Removal apply waits for the complete decision set |
| Reconfigure removal: per-file choice | Same safe classification default; cancel stops reconfigure | Same classification-derived result | No file removal precedes the complete decision set |
| `init` / `join`: identity | Required when config cannot derive it; cancel stops setup | Derive `arc.identity` / `user.name`, else require new `--identity` | No setup write precedes resolution |
| `user open`: stale subdirectory choice | Optional safe default `keep`; cancel deliberately maps to `keep` | Keep; `--yes` is neither needed nor accepted here | Only explicit interactive `remove` may delete the stale directory |
| `user pull`: local overwrite | Protected confirmation; cancel/decline stops pull | Require `--yes` when local notes would be overwritten | Fetch/restore waits for confirmation |
| `user sync`: contested-direction choice | Optional safe default `save-only`; cancel stops before save | Save only; `--yes` never chooses `push` | Remote push requires an interactive `push` choice or `arc user push` |
| `user sync`: local overwrite | Protected confirmation; cancel/decline skips the pull/load phase | Require `--yes` when local notes would be overwritten | Restore waits for confirmation |
| `user sync`: notes push | Protected confirmation; cancel/decline skips push after the authorized local save | Save only unless `--yes` accepts push | Remote notes push waits; the preceding local save may stand |
| `sync`: notes push | Protected confirmation; cancel/decline skips the notes push after earlier authorized legs | Save only unless `--yes` accepts push | Notes push waits; an earlier worktree leg/local save may stand |
| `start`: resolved-plan confirmation | Courtesy confirmation; cancel stops start | Proceed; legacy `start --yes` aliases `--no-input` | Start ceremony waits for resolved inputs and the courtesy disposition |
| Release install: existing-install action | Optional safe default `exit`; cancel is a successful no-op | New `--idempotency-action <exit\|re-verify\|update-markers\|add-harness>`, else `exit` | No install mutation precedes the selected branch's inputs |
| Release install: trust acknowledgment | Protected confirmation; cancel/decline aborts | Require new command-local `--yes` | Marker/config writes wait for trust and workflow evidence |
| Release install: workflow verification | Required external evidence; cancel/decline aborts | Require new `--workflow-verified`; `--yes` cannot substitute | Marker/config writes wait for the evidence |
| Release uninstall: cleanup verification | Required external evidence; cancel aborts and false refuses | Require new `--cleanup-verified`; `--yes` cannot substitute | Marker removal waits for the evidence |
| `abandon`: destructive cascade | Protected, flag-only lifecycle guard; TTY does not add a prompt | Require `--yes` after the impact plan | No retirement mutation precedes the guard |
| `release commit`: Git editor / stdin | Editor interaction is allowed only on an interactive context | In no-input mode require a deterministic source accepted by the existing classifier; explicit `-F -` stdin data remains valid | Refuse before spawning `git commit` if an editor would be required |

Protected authority is phase-scoped. A compound sync may complete an independently authorized safe phase (for
example, local save or a preceding worktree leg) before declining a later remote push; it may not perform the
mutation controlled by the unresolved confirmation. Cancellation normally yields a clean stop/skip. The sole
cancel-to-default exception above is `user open`'s existing non-destructive `keep` policy.

### Typed acquisition outcome

The shared acquisition layer returns a discriminated outcome rather than Clack symbols, nullable values, or thrown
strings:

```ts
type InputResolution<T> =
  | { kind: "resolved"; value: T; source: "argument" | "stdin" | "prompt" | "derived" | "default" }
  | { kind: "cancelled" }
  | { kind: "unavailable"; missing: readonly InputRequirement[] }
  | { kind: "invalid"; issues: readonly InputIssue[] };
```

- `resolved` is the only outcome that authorizes the mutation phase which depends on that input.
- `cancelled` never grants authority. The site policy maps it to stop/skip, or to a declared safe `resolved`
  default only for the explicit cancel-to-default case above.
- `unavailable` is a non-zero refusal with aggregated, actionable flag guidance.
- `invalid` is a non-zero refusal with schema issue paths and command-domain wording.

The union models expected command control flow directly. The kernel Result seam may compose fallible adapters where
useful, but this WU does not force command handlers or Commander itself onto `Result`.

Resolve the complete input set for a mutation phase before invoking that phase. Aggregate every independently
knowable missing value command-wide; conditional values join the set as soon as their branch is known. A command
with three simultaneously required values reports all three together rather than rejecting one-at-a-time across
repeated agent invocations. Earlier independently authorized phases do not become contingent on a later optional
escalation.

### Schema authority and boundary placement

- Command-domain Zod schemas stay with the module that owns their semantics. The kernel owns only proven-shared
  vocabulary; this member does not create a schema monolith.
- Value-bearing Commander arguments/options and the corresponding Clack answer use the same schema. The CLI adapter
  parses raw values once and passes schema-inferred types inward.
- Compose kernel primitives directly. A required priority uses `PrioritySchema`, not legacy `validatePriority()`,
  whose compatibility contract intentionally defaults unknown stored metadata to `P3`.
- Prompt validation may re-render an inline issue while interaction remains available; the final accepted answer is
  parsed by the same schema before resolution.
- Cancellation is detected before schema parsing and maps to `cancelled`, never to a false boolean or invalid value.
- Registration has closed membership: create and register exactly one complete object schema for every in-scope
  canonical command path with a positional value, value-bearing option, derived required value, or cross-field
  input constraint. Commands whose inputs are only independent boolean-presence flags do not register; neither do
  opaque passthrough commands. Aliases share the canonical command's schema. `createCommandInputRegistry()` starts
  from `createKernelRegistry()`, matching the shipped session-envelope composition precedent.
- Registered IDs are `command-<command-path>-input` with path segments joined by hyphens (for example,
  `command-user-pull-input`). Each complete object contains all parsed values that gate dispatch, including boolean
  flags only when they participate in a cross-field constraint. Leaf prompt/helper schemas never register.
  Registration uses version `1` and `strict-current` unless a persisted input format establishes a real
  compatibility need.
- Exact membership tests compare `ids()` with the full union of the four kernel built-ins (`work-unit-state`,
  `work-class`, `priority`, and `slug`) plus the AST-derived command ID set; a separate assertion compares only the
  `command-*-input` subset with the AST inventory.
- Registration does not add command schemas to the shipped JSON Schema bundle automatically. Build projection and
  introspection availability stay with their owning downstream work.
- User-facing failures use domain errors extending the kernel's dotted error taxonomy. Existing output envelopes
  and stderr formatting remain authoritative at each command boundary.

### Grounded input inventory

The 2026-07-20 source pass found 22 prompt operations across 11 command/prompt modules. This is the acceptance
inventory floor, not a fixed count: spec discovery performs an AST-backed enumeration and treats any additional
site as in scope.

| Family | Prompt operations | Required treatment |
| --- | ---: | --- |
| `init` / `join` / reconfigure / removals / identity | 11 | Replace implied environment `--yes`; declare derived/default/required values and validate shared answers |
| `user` / `user-sync` / `sync` | 6 | Preserve keep/save-only/manual fallbacks; protect overwrite or affirmative push choices |
| `start` | 1 | Treat the resolved-plan confirmation as courtesy; keep degraded-oracle refusal authoritative |
| Release setup install/uninstall | 4 | Default idempotent no-op safely; require explicit trust, cleanup, and workflow evidence inputs |

Commander currently declares `--yes` eight times with incompatible behavior. Four become authority-neutral
no-input compatibility aliases (`init`, `join`, `start`, and the currently inert `user load` flag); four retain
authority-bearing use (`abandon`, `user pull`, `user sync`, and `sync`). Release install adds a new command-local
`--yes` for its trust acknowledgment while keeping workflow verification on its independent evidence flag. The
value-bearing Commander inventory additionally covers:

- kernel vocabulary (`Slug`, `Priority`, `WorkClass`, and any actual command use of `WorkUnitState`);
- closed command enums such as commitment, PM mode, branch type, fire point, harness mode, and output format;
- structured lists and files such as tools, target paths, and decompose cut maps;
- domain strings such as task/action pointers, reasons, dates, URLs, identities, and inbox operands.

Boolean presence flags need no redundant Zod wrapper unless they participate in a cross-field command schema.
Opaque forwarded argument arrays remain outside this inventory.

### Lifecycle and policy seams

`lifecycle-transition-core` remains authoritative for which values and guards a transition requires. This member
provides the adapter that supplies those inputs:

- `stub` elicits commitment and priority interactively; no-input execution requires `--commitment` and
  `--priority`, validates both through their schemas, and never defaults either.
- A provisional stub promoted with unresolved `Class` may acquire `--class` or an interactive Class value; the
  lifecycle verb persists the supplied value atomically with promotion. This closes the current read-only
  Class-guard asymmetry without moving Class policy into the input substrate.
- `activate`, `park`, `integrate`, planning finalization, errand promotion, and other required-input verbs consume
  the same acquisition contract instead of maintaining bespoke missing-string checks.
- Destructive lifecycle verbs retain their impact-plan and guard logic. The input substrate can deliver confirmed
  authority but cannot bypass containment, lifecycle-state, or integration interlocks.

`cli-session-envelope` and `cli-git-executor` are shipped sibling precedents, not dependencies. This member follows
their schema co-location and typed-outcome patterns without importing their domain modules. It does not depend on
the still-planning `cli-layout-resolver` or `cli-validation-surfaces` members.

## Delivery and Verification

1. Generate the exhaustive command/input inventory mechanically and reconcile it with the authoritative site table
   before migrating behavior. The generated record adds every value-bearing Commander input, acquisition class,
   default/derivation source, and schema owner; it verifies, rather than decides, each prompt/confirmation site's safe
   default or requirement, automation flags, cancellation outcome, and mutation boundary. A newly discovered safety
   site returns to the spec before migration.
2. Land the pure interaction-context resolver, typed acquisition outcome, schema adapters, and error mapping before
   command migrations.
3. Migrate vertical slices by command family, keeping each review increment behaviorally coherent. Existing
   command-specific policies remain at their owners; only input mechanics converge.
4. Register the closed AST-derived command-schema ID set as each complete contract migrates, and assert final
   registry membership exactly. Route build-publication work to `schema-introspection-layer` and residual
   first-party import/shim cleanup to
   `cli-substrate-complete-migration`.
5. Close with an AST-backed re-scan proving no prompt-capable or value-bearing command site escaped classification.

Verification includes:

- table-driven unit tests over interaction allowed/forbidden, confirmation ask/accept, CI, TTY, JSON,
  `--no-input`, `--yes`, cancellation, invalid values, and missing required sets;
- parity tests proving a Commander value and equivalent Clack answer produce the same schema-inferred value;
- mutation-spy tests proving unresolved, invalid, cancelled, and unconfirmed inputs invoke no dependent write seam,
  including phase-scoped sync cases where an earlier independently authorized save may stand;
- handler/integration tests for every classified row, including contradictory or redundant automation flags;
- Commander-boundary tests proving `<operand>` commands retain pre-handler missing-operand failures, optional
  inputs remain absent, existing defaults do not start prompting, and handler-required inputs aggregate guidance;
- real subprocess non-TTY tests with bounded completion deadlines, so a hidden prompt fails as a hang rather than
  being mocked away;
- explicit-stdin subprocess tests proving `check commit-msg - --json`, inbox `*-file -`, and `release commit -F -`
  still consume caller-declared data, paired with a no-input release-commit test that refuses before an editor spawn;
- compatibility tests for existing prompt-free `init --yes`, `join --yes`, `start --yes`, user/sync flows, and
  destructive `abandon --yes`, with the new rule that environment detection alone never supplies confirmation;
- all project quality gates: Markdown lint, TypeScript lint, `typecheck:all`, full tests, and build.

## Alternatives

- **Use `--yes` as the universal non-interactive flag:** rejected because interaction capability and affirmative
  authority are different facts. The environment can establish only the former.
- **Use TTY detection alone:** rejected because TTY presence does not express automation intent, JSON mode must
  never prompt, and explicit no-input execution is useful inside a terminal.
- **Require `--yes` for every prompt:** rejected because safe defaults need no consent, required values cannot be
  invented, and evidence cannot be attested by a generic affirmative flag.
- **Let each command decide its own non-interactive behavior:** rejected because that is the inconsistency and hang
  risk being removed. Commands still own policy; the shared matrix owns mechanics.
- **Centralize all command schemas in the kernel:** rejected because it would invert dependency direction and make
  the kernel a command-semantic dependency magnet.
- **Replace the prompt stack:** rejected because the failure is policy and boundary validation, not presentation
  technology.

## Risks

- Misclassifying a courtesy confirmation as safe could grant authority the invocation did not carry.
- Existing scripts may rely on environment-implied `--yes`; migration needs explicit compatibility tests and
  actionable failures directing callers to `--yes`, `--no-input`, or required operand/flag syntax.
- A global `--no-input` option can be wired inconsistently through Commander subcommands unless one adapter resolves
  it before handler dispatch.
- Treating stdin as a single interaction channel can either reintroduce editor hangs or break deterministic pipes;
  prompt/editor capability and explicit payload reads remain separate adapters.
- Registering leaf/helper schemas would create an unstable introspection surface; only complete command contracts
  receive identities.
- Prompt tests can miss hangs when they mock Clack above the stream boundary; bounded real subprocess tests are
  required.
- The lifecycle seam can blur if acquisition begins deciding which values transitions require. Policy remains with
  the command/lifecycle owner and is supplied declaratively to the resolver.

## Unknowns and Assumptions

No settle-able design fork remains in the interaction, authority, validation, or ownership model.

- Every currently known handler-required value has an existing positional/flag form or the exact new flag named in
  the site table. Parser-required operands stay operands. A newly discovered handler requirement must gain an
  accepted syntax in the spec; absence is never permission to default.
- Exact internal filenames, whether Commander parsing occurs through `.argParser()` or an equivalent adapter, and
  final diagnostic phrasing are implementation details constrained by the contracts above.
- The exhaustive inventory may find source drift or an additional site. The spec records its exact row before tasks
  proceed; a site not uniquely classified by the settled matrix reopens design rather than becoming an implementation
  choice.

## Scope Estimate

Large (week+). `Class: Heavy` remains correct by scale: the design composes landed kernel and CLI patterns rather
than inventing a new model, but implementation crosses command registration, prompt acquisition, lifecycle input,
error rendering, and real process-level verification. The concern stays one WU because acquisition and validation
meet at one boundary and share one acceptance inventory; migration slices are phases, not independently owned
deliverables.
