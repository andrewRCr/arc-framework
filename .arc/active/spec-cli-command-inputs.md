# Spec (`detailed` · `RFC`): CLI Command Inputs

- **Origin:** [internal]
- **Purpose:** Define one validated input-acquisition contract for interactive and non-interactive ARC commands,
  separating prompt capability from affirmative authority so automation terminates deterministically without
  inventing required values or weakening protected confirmations.

---

## Introduction / Context

ARC commands acquire input through Commander operands and options, Clack prompts, derived process and repository
values, explicit stdin payloads, and command-local defaults. Those paths currently decide interaction availability,
fallback behavior, validation, cancellation, and confirmation independently. Known commands carry isolated non-TTY
guards, but the source still contains prompt-capable handlers whose behavior depends on local checks of TTY, CI, JSON,
or `--yes` state.

The central defect is an authority conflation. `init` and `join` currently imply `--yes` under CI or non-TTY, while
other commands auto-keep, save-only, proceed, or refuse. Existing `--yes` declarations also carry several meanings:
use defaults, suppress a courtesy prompt, accept overwrite behavior, or authorize a destructive cascade. The absence
of a terminal proves only that interaction is unavailable; it does not prove that the caller accepted a protected
effect, supplied a required value, or attested external evidence.

Input validation is likewise uneven. Value-bearing Commander inputs and equivalent Clack answers often arrive in
handlers as raw strings and are narrowed locally. The shipped schema kernel now provides Zod-backed `Slug`,
`Priority`, `WorkClass`, and `WorkUnitState` vocabulary, an extensible error taxonomy, and a composable registry, but
command boundaries do not yet use those contracts uniformly.

This RFC establishes a shared command-input substrate at the CLI boundary. Commands retain ownership of lifecycle,
sync, installation, and trust policy; the substrate makes acquisition, validation, cancellation, no-input refusal,
and confirmation authority explicit and testable.

## Goals

- Inventory every input-bearing command surface: value-bearing Commander operands and options, Clack prompts,
  semantic derived values, explicit stdin payloads, machine-output modes, confirmation gates, and interactive
  subprocess channels such as pagers, editors, and terminal-prompt-capable tools.
- Resolve prompt capability and affirmative authority once at the CLI adapter through a shared interaction context.
- Parse Commander values and Clack answers through the same command-owned Zod schemas before dependent side effects.
- Apply only explicitly declared safe defaults when interaction is unavailable.
- Elicit handler-level required values interactively; otherwise refuse once with every missing value and the exact
  accepted operand or flag syntax.
- Represent cancellation, unavailable interaction, invalid input, and successful resolution as distinct typed
  outcomes.
- Require explicit command-local authority for protected confirmations; CI, non-TTY, and machine-readable output
  never supply it.
- Preserve existing lifecycle and command policy boundaries while replacing bespoke acquisition mechanics.
- Prove every no-input command path terminates without an unsolicited prompt or editor read and performs no mutation
  dependent on unresolved input or confirmation.

## Non-Goals

- Replace Commander or Clack, redesign prompt presentation, or introduce a workflow language around command inputs.
- Redesign lifecycle transitions, stub policy, sync policy, release-wrapper trust policy, or command output envelopes.
- Treat an interactive initial value as a safe automation default without an explicit site declaration.
- Add provisional required values, placeholder owners, or a default priority where policy requires a supplied value.
- Let `--yes` fabricate required data, choose among domain actions, imply `--force`, or attest external evidence.
- Publish command schemas through `arc schema`; consumer-facing projection remains owned by
  `schema-introspection-layer`.
- Validate opaque passthrough payloads such as Git argument arrays or migrate unrelated file and network record
  schemas owned by `cli-validation-surfaces` or `cli-substrate-complete-migration`.
- Change command semantics unrelated to input acquisition, validation, cancellation, or confirmation.

## Proposed Design

### 1. Resolve one interaction context at the adapter boundary

The CLI adapter resolves an `InteractionContext` before a handler acquires input. It carries independent interaction
and confirmation axes plus the process adapters needed to distinguish prompts from explicit payload reads:

```ts
interface InteractionContext {
  readonly interaction: "allowed" | "forbidden";
  readonly confirmation: "ask" | "accept";
  readonly machineReadable: boolean;
  readonly promptInput: NodeJS.ReadStream;
  readonly promptOutput: NodeJS.WriteStream;
  readonly subprocess: {
    readonly terminalPrompts: "allowed" | "forbidden";
    readonly presenters: "allowed" | "forbidden";
  };
}
```

The exact stream and subprocess-policy types may be narrowed during implementation, but the authority split and
coverage are fixed. `interaction` governs Clack prompts, editors, pagers, and terminal-prompt-capable subprocesses.
When it is forbidden, presentation commands render directly without a pager, child terminal prompts and editors are
disabled, and child stdin is closed unless the invocation explicitly selects stdin as data. The process adapter passes
the context plus that optional payload source into every interactive-capable spawn. Git receives its no-terminal-prompt
configuration before execution, so absent credentials or other ambient input produces a bounded refusal instead of a
read. Explicit stdin data is not prompt interaction: a caller-selected `-`, `-F -`, or equivalent operand remains
readable while unrelated child interaction stays forbidden.

| Invocation signal | Interaction | Confirmation |
| --- | --- | --- |
| Ordinary interactive invocation | `allowed` | `ask` |
| Global `--no-input` | `forbidden` | `ask` |
| CI, non-TTY prompt streams, or machine-readable mode | `forbidden` | `ask` |
| Authority-bearing command-local `--yes` | `forbidden` | `accept` |
| Legacy no-input alias on `init`, `join`, `start`, or `user load` | `forbidden` | `ask` |
| `--no-input` plus authority-bearing command-local `--yes` | `forbidden` | `accept` |

`--no-input` is the uniform global automation flag. `--yes` remains command-local. Existing `init`, `join`, `start`,
and inert `user load --yes` forms remain accepted as prompt-free compatibility aliases but add no confirmation
authority. Existing authority-bearing `--yes` forms retain only the protected confirmations named below. An
environment or machine-output signal never changes confirmation to `accept`.

Machine-readable behavior is declared by each command adapter, not inferred from an option spelling. Every current
`--json` path opts into the declaration. Future typed modes do the same explicitly. The adapter replaces direct
prompt-policy checks of `process.stdin.isTTY`, `process.stdout.isTTY`, and `process.env.CI` below the boundary and
threads the resulting policy through pager, editor, and subprocess launch sites.

### 2. Classify every input site explicitly

Every acquired value or confirmation site declares one policy. Neither prompt presentation nor Clack's
`initialValue` supplies a policy implicitly.

| Site kind | Interactive behavior | No-input behavior |
| --- | --- | --- |
| Supplied or deterministically derived value | Parse through its schema; proceed on success | Same |
| Parser-required positional (`<value>`) | Commander requires and parses it without prompting | Same |
| Optional value without a default | Parse when supplied; otherwise preserve `undefined` | Same |
| Optional value with a declared safe default | Prompt only at a declared prompt site; otherwise apply default | Apply default |
| Handler-level required value | Elicit and validate | Refuse once with all missing values and accepted syntax |
| Courtesy confirmation | Ask; cancellation or decline stops cleanly | Proceed because invocation carries intent |
| Protected confirmation | Ask for positive confirmation | Require authority-bearing command-local `--yes` |
| Interactive-only safety override | Ask after surfacing the degraded safety evidence | Refuse; neither `--yes` nor environment can substitute |
| Required evidence or attestation | Elicit or accept a purpose-named evidence flag | Require that flag; `--yes` cannot substitute |

A safe default cannot broaden authority or add a risky effect beyond the invoked command. It may preserve state,
reduce action, or select a documented baseline. Commander retains syntax-level acquisition: required operands remain
required, optional values remain absent unless a selected handler branch requires them, and existing deterministic
Commander or handler defaults do not become prompts.

The implementation generates the inventory from two mechanically checked sources:

1. TypeScript AST extraction discovers canonical Commander paths, operands and options, Clack/acquisition calls, and
   interactive-capable process launches.
2. A typed `CommandInputDeclaration` beside each canonical adapter classifies the discovered sites and declares facts
   syntax alone cannot express: semantic derived fields, handler-level requirements, cross-field constraints,
   machine-readable modes, safe defaults, confirmations, interactive-only safety overrides, explicit stdin payloads,
   opaque passthrough fields, and subprocess policy.

Every discovered site must map to exactly one declaration, and every declared source locus must resolve. Each inventory
entry records its canonical command path, acquisition class, schema owner, default or derivation source, cancellation
behavior, automation flags, accepted no-input syntax, subprocess behavior, and dependent mutation boundary. The
generator verifies the policy table; it never decides whether a default or confirmation is safe. A newly discovered
site without a unique classification returns to this RFC before migration.

A **semantic derived input** is a value in the command's domain request that the adapter resolves on the caller's
behalf, such as an `init` project name derived from the directory, a context-defaulted lifecycle target, or a declared
completion-date default. It belongs in the command object schema and declaration. **Ambient execution context** is a
guard or runtime fact used to execute that request — repository root, current identity for commands that do not expose
identity acquisition, branch/HEAD, config, TTY/CI, or machine-output state. Ambient context resolves through typed
context/guard adapters and does not create a command schema field or registry identity by itself. Identity is semantic
for `init` / `join` because those commands may acquire it, and for commands exposing an identity option; a bare
`resolveUserIdentity()` precondition on another command remains ambient.

### 3. Preserve the authoritative site policies

The following table settles the current prompt and non-prompt interaction gates. Rows may combine repeated prompt
operations that share one command policy.

| Site | Classification and cancellation | No-input contract | Protected boundary |
| --- | --- | --- | --- |
| `init`: project name | Safe derived default; cancel stops setup | `--name`, else directory name | Installation waits for complete config |
| `init` / `join`: tools | Safe empty/current default; cancel stops setup | `--tools`, else empty/current | Skill and config writes wait for list |
| `init`: PM mode | Safe default `none`; cancel stops setup | `--pm-mode`, else `none` | Installation waits for complete config |
| `init`: team mode | Safe disabled default; cancel stops setup | `--team`, else disabled | Installation waits for complete config |
| `init --reconfigure`: project name | Safe current-value default; cancel stops | `--name`, else current | Apply waits for complete config |
| `init --reconfigure`: PM mode | Safe current-value default; cancel stops | `--pm-mode`, else current | Apply waits for complete config |
| `init --reconfigure`: team mode | Safe current-value default; cancel stops | `--team`, else current | Apply waits for complete config |
| `join`: role | Safe current/maintainer default; cancel stops | `--contributor`, else current/maintainer | Workspace writes wait for role, tools, identity |
| Reconfigure removal: bulk choice | Safe classification-derived default; cancel stops | Remove Framework; keep Configurable/Scaffolded | No removal before complete decisions |
| Reconfigure removal: per-file choice | Same classification default; cancel stops | Same | No removal before complete decisions |
| `init` / `join`: identity | Handler-required when config cannot derive it; cancel stops | Derive `arc.identity` / `user.name`, else require `--identity` | No setup write before resolution |
| `user open`: stale subdirectory | Optional safe default `keep`; cancel maps to `keep` | Keep; no `--yes` | Only explicit interactive `remove` deletes |
| `user pull`: local overwrite | Protected; cancel or decline stops pull | Require `--yes` when overwrite would occur | Fetch/restore waits for confirmation |
| `user sync`: contested direction | Optional safe default `save-only`; cancel stops before save | Save only; `--yes` never chooses `push` | Remote push requires chosen direction |
| `user sync`: local overwrite | Protected; cancel or decline skips pull/load | Require `--yes` for overwrite | Restore waits for confirmation |
| `user sync`: notes push | Protected; decline leaves authorized local save | Save only unless `--yes` accepts push | Remote notes push waits |
| `sync`: notes push | Protected; decline leaves earlier authorized legs | Save only unless `--yes` accepts push | Notes push waits |
| `start`: resolved-plan confirmation | Courtesy; cancel stops start | Proceed; legacy `start --yes` aliases no-input | Start waits for resolved inputs/disposition |
| `start`: indeterminate lifecycle-oracle override | Interactive-only safety override; cancel/decline stops | Refuse; `--yes`, `--no-input`, CI, and non-TTY cannot authorize | No branch or ceremony mutation while lifecycle truth is indeterminate |
| Release install: existing-install action | Optional safe default `exit`; cancel is successful no-op | `--idempotency-action <exit\|re-verify\|update-markers\|add-harness>`, else `exit` | No mutation before branch inputs |
| Release install: trust acknowledgment | Protected; cancel or decline aborts | Require new command-local `--yes` | Marker/config writes wait |
| Release install: workflow verification | Required external evidence; cancel or decline aborts | Require `--workflow-verified` | Writes wait for evidence |
| Release uninstall: cleanup verification | Required external evidence; cancel/false refuses | Require `--cleanup-verified` | Marker removal waits for evidence |
| `abandon`: destructive cascade | Protected flag-only lifecycle guard | Require `--yes` after impact plan | No retirement mutation before guard |
| `view`: document pager | Interactive presentation; pager exit returns control | Render directly to stdout without a pager | Pager selection precedes renderer spawn |
| `release commit`: editor/stdin | Editor allowed only when interaction is allowed | Require an existing deterministic message source; explicit `-F -` remains data | Refuse before Git editor spawn |
| Git/external subprocess terminal input | Inherit only when interaction is allowed and the command supports it | Disable terminal prompts, editors, and pagers; close stdin unless explicitly selected as data | Spawn policy applies before child execution |

Protected authority is phase-scoped. A compound sync may complete an independently authorized save or worktree leg
before refusing a later push, but it cannot perform the mutation guarded by unresolved confirmation. Cancellation
normally stops or skips cleanly; `user open`'s non-destructive keep behavior is the sole cancel-to-default exception.

### 4. Return typed acquisition outcomes

Shared acquisition helpers return a discriminated outcome rather than Clack cancellation symbols, nullable values,
or thrown strings:

```ts
type InputResolution<T> =
  | { kind: "resolved"; value: T; source: "argument" | "stdin" | "prompt" | "derived" | "default" }
  | { kind: "cancelled" }
  | { kind: "unavailable"; missing: readonly InputRequirement[] }
  | { kind: "invalid"; issues: readonly InputIssue[] };
```

Only `resolved` authorizes its dependent mutation phase. A site policy maps `cancelled` to stop/skip or, for the one
declared exception, to a safe resolved default. `unavailable` is a non-zero refusal with aggregated accepted syntax.
`invalid` is a non-zero refusal with schema paths and command-domain wording.

The adapter resolves all independently knowable inputs for a mutation phase before invoking that phase. Conditional
requirements join the missing set as soon as their branch is known. Earlier independently authorized phases do not
become contingent on a later optional escalation.

### 5. Make command-owned Zod schemas the parsing authority

- Command-domain schemas remain co-located with the modules that own their semantics. The kernel owns only shared
  vocabulary and registry machinery.
- Equivalent Commander and Clack values parse through the same schema. Raw input is parsed once at the adapter, and
  handlers receive schema-inferred values.
- Kernel primitives compose directly. A required priority uses `PrioritySchema`, not the compatibility-oriented
  `validatePriority()` helper that defaults unknown stored metadata to `P3`.
- Cancellation is detected before parsing. Interactive prompt validation may render issues inline, but the accepted
  value receives the same final schema parse as an argument.
- User-facing failures extend the kernel's dotted error taxonomy while preserving each command's existing stderr and
  machine-output envelope contract.

Create exactly one complete object schema for every canonical command path with at least one **schema-owned**
positional value or value-bearing option, declared semantic derived input, handler-level acquired value, or cross-field
input constraint. Every AST-discovered value field is declaration-classified as schema-owned or opaque passthrough.
Ambient execution context does not trigger registration. A path whose only value syntax is opaque passthrough does not
register; a mixed path registers only its schema-owned fields and passes the opaque payload separately. Aliases share
the canonical schema. Boolean flags join an object only when they participate in a cross-field constraint.

`release commit [args...]` and `release push [args...]` are declared opaque-passthrough paths: their Git argument
arrays remain unvalidated and do not create command registry identities. The release adapter may inspect those arrays
to classify editor, stdin, and terminal-interaction risk without claiming their domain semantics or making the payload
schema-owned.

`createCommandInputRegistry()` composes from `createKernelRegistry()`. Registered IDs use
`command-<command-path>-input`, path segments joined by hyphens, at version `1` and `strict-current` unless a persisted
format establishes a compatibility requirement. The command ID set is the union of canonical paths with at least one
AST-discovered schema-owned value field and paths whose typed declaration contains a semantic derived,
handler-acquired, or cross-field value. Declaration-classified opaque-only paths are subtracted. Exact-membership tests
compare the registry's command subset with that derived set and the complete registry with it plus the four kernel
identities. Registration does not implicitly add command contracts to the shipped JSON Schema bundle.

### 6. Keep lifecycle and command policy at existing owners

The substrate acquires and validates values; it does not decide what a lifecycle transition requires.

- `stub` elicits commitment and priority interactively. No-input execution requires `--commitment` and `--priority`
  and never defaults either.
- Promotion of a provisional stub with unresolved Class accepts `--class` or an interactive Class value, and the
  lifecycle owner persists it atomically with promotion.
- `activate`, `park`, `integrate`, planning finalization, errand promotion, and other required-input verbs consume the
  shared outcome rather than bespoke missing-string checks.
- Destructive lifecycle verbs retain impact-plan, containment, state, and integration guards. Resolved confirmation
  authority cannot bypass them.
- Existing sync, installation, release, and command output policies remain at their current handlers and libraries;
  they declare acquisition policy to the shared resolver.

### 7. Migrate in behaviorally coherent slices

1. Generate and reconcile the exhaustive input inventory before migrating behavior.
2. Land the interaction resolver, typed outcome, schema adapters, missing-input aggregation, and error mapping.
3. Migrate command families as vertical slices, with tests at the argument, prompt, handler, and mutation boundaries.
4. Register complete command contracts as each canonical path migrates and pin exact membership.
5. Finish with an AST/declaration reconciliation proving every prompt-capable, value-bearing, and
   interaction-capable site is classified.

Residual reusable-import and shim cleanup routes to `cli-substrate-complete-migration`. Consumer-facing schema
publication routes to `schema-introspection-layer`. This work introduces no agent-interpreted control flow: the CLI
computes interaction and validation outcomes and returns command-domain messages through existing output boundaries.

## Alternatives & Rationale

- **Use `--yes` as the universal automation flag:** rejected because prompt capability and affirmative authority are
  independent. Environment facts can establish only the former.
- **Use TTY detection alone:** rejected because TTY presence does not express automation intent, machine-readable
  modes must not prompt, and explicit no-input execution is useful inside a terminal.
- **Require `--yes` for every prompt:** rejected because safe defaults need no consent, required values cannot be
  invented, and evidence cannot be attested by a generic affirmative flag.
- **Let each command independently implement no-input behavior:** rejected because duplicated policy resolution is
  the source of inconsistent defaults and hang risks. Commands retain domain policy while the substrate owns mechanics.
- **Centralize every command schema in the kernel:** rejected because it would invert dependency direction and turn
  the kernel into a command-semantics dependency magnet.
- **Register leaf prompt and helper schemas:** rejected because they are implementation details rather than stable
  command contracts.
- **Replace the prompt stack:** rejected because the defect is authority, acquisition, and validation policy rather
  than presentation technology.

## Cross-cutting Considerations

### Trust and safety

No environment-derived signal grants confirmation authority. `--yes` is scoped to named command protections and
cannot imply `--force`, choose a contested domain direction, provide required data, or attest external evidence.
Every dependent mutation waits for a `resolved` value and any required confirmation. Phase-scoped commands preserve
already authorized earlier effects while refusing only the protected later phase.

### Compatibility and migration

All existing `--yes` spellings remain accepted. Compatibility aliases become prompt-free without silently retaining
authority they should not carry. Existing scripts that relied on CI or non-TTY implying authority receive actionable
failures naming `--no-input`, command-local `--yes`, evidence flags, or required operand/option syntax. Existing
machine-output envelopes and explicit stdin payload contracts remain byte- and stream-compatible.

### Performance and termination

Interaction resolution and schema parsing are process-local and negligible beside command I/O. Real subprocess tests
use bounded deadlines so hidden prompts fail as hangs. Inventory generation and registry membership checks run in
development and CI rather than adding runtime scans to ordinary command dispatch.

### Testing

- Table-driven unit tests cover interaction allowed/forbidden, confirmation ask/accept, CI, prompt-stream TTY state,
  machine-readable declarations, `--no-input`, authority-bearing and compatibility-alias `--yes`, cancellation,
  invalid values, and missing sets.
- Parity tests prove equivalent Commander and Clack values produce the same schema-inferred value.
- Mutation-spy tests prove unresolved, invalid, cancelled, and unconfirmed inputs do not invoke dependent writes,
  including compound sync cases where an earlier authorized save may stand.
- Handler and integration tests cover every authoritative policy row and contradictory or redundant automation flags.
- Commander-boundary tests preserve required-operand failures, optional absence, existing deterministic defaults, and
  aggregated handler-level requirement guidance.
- Bounded real subprocess tests cover no-input termination; explicit-stdin cases prove `check commit-msg - --json`,
  inbox file `-`, and `release commit -F -` still consume caller-selected data.
- Pager/editor/credential-prompt subprocess tests prove forbidden interaction renders directly, closes ambient child
  stdin, disables terminal prompting, and fails boundedly when required external input is unavailable.
- Compatibility tests cover prompt-free `init --yes`, `join --yes`, `start --yes`, user/sync behavior, and
  destructive `abandon --yes`, with no authority inferred from environment detection alone.
- `start` tests distinguish ordinary courtesy prompts from the indeterminate-oracle safety override and prove every
  no-input signal, including legacy `start --yes`, refuses the latter before mutation.
- Markdown lint, TypeScript lint, `typecheck:all`, the full test suite, and build all pass.

### Architectural alignment and coordination

The design follows the CLI's `cli → handlers/commands → lib` flow and composes downward with the shipped schema
kernel. It aligns with the procedural-substrate direction: deterministic state resolution and emitted diagnostics
live in TypeScript, schemas are runtime authorities, and no new prose or markup interprets control flow.

Within `cli-substrate-adoption`, this work consumes the kernel vocabulary and registry without redeclaring them. It
owns command-input behavior only. Broad residual migration remains with `cli-substrate-complete-migration`, and
schema publication remains with `schema-introspection-layer`.

## Success Criteria

- Every value-bearing Commander input, prompt-capable site, machine-output declaration, confirmation gate, explicit
  stdin source, pager/editor site, and terminal-prompt-capable subprocess is in the mechanically checked inventory with
  an acquisition class, schema owner, automation behavior, and mutation boundary.
- Semantic derived command inputs and ambient execution context follow the closed boundary above; typed declarations
  make every non-syntactic command field discoverable and exact registry membership deterministic.
- Every canonical in-scope command contract parses supplied and prompted values through one command-owned Zod object
  schema before dependent effects.
- Registry membership equals the mechanically derived command ID set (AST value syntax plus declared semantic fields)
  after opaque-only paths are subtracted, plus the four kernel identities, with no leaf/helper or opaque-passthrough
  registrations.
- `--no-input`, CI, non-TTY prompt streams, and machine-readable modes terminate without unsolicited prompts, pagers,
  editors, or child-process terminal reads and never confer affirmative authority.
- Handler-level missing values are reported together with exact accepted syntax; no required value is invented.
- Protected confirmations require explicit command-local authority, and evidence requirements accept only their
  purpose-named evidence inputs.
- Interactive-only safety overrides require an interactive affirmative and cannot be authorized by `--yes`,
  `--no-input`, environment, or machine-output state.
- Cancellation, invalid input, unavailable interaction, and successful resolution remain distinguishable through
  typed outcomes and command-domain diagnostics.
- Existing explicit stdin payloads, output envelopes, lifecycle guards, safe defaults, and phase-scoped sync effects
  retain their documented behavior.
- Closing AST/declaration reconciliation and the bounded subprocess suite prove no in-scope site escaped
  classification or can hang.
- All project quality gates pass.

## Open Questions

None. Exact internal filenames, adapter factoring, Commander `.argParser()` usage, and final diagnostic phrasing are
implementation details constrained by the contracts above. A newly discovered site that is not uniquely classified
by this RFC reopens the design before that site migrates.

---
