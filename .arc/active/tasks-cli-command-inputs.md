# Task List: CLI Command Inputs

- **Design:** `spec-cli-command-inputs.md`

---

## **Phase 1:** Mechanically checked input inventory

_Purpose:_ Establish the typed declaration model and generated completeness oracle that every later migration slice
uses to prove its command-input coverage.

### `[ ]` **1.1 Define canonical command-input declarations and inventory records**

- _Goal:_ Every command-input fact that syntax cannot reveal has one typed, command-owned declaration that can be
  validated and joined with discovered source sites.

    - `[ ]` **1.1.a Define the declaration and inventory algebra**
        - Create the command-input module boundary under `packages/arc-framework/src/lib/command-input/` with canonical
          command paths,
          source loci, acquisition classes, schema ownership, defaults, cancellation, automation flags, accepted
          no-input syntax, mutation boundaries, and subprocess policy.
        - Distinguish AST-discovered syntax/process sites from declaration-originated semantic facts whose live source
          locus is mechanically verified even though syntax cannot reveal the policy.
        - Keep semantic derived inputs distinct from ambient execution context and opaque passthrough fields.
        - Build `test-first` (one behavior at a time):
            - Valid declarations preserve the complete policy vocabulary with schema-inferred types.
            - Invalid or contradictory policy combinations fail with command-domain diagnostics.

    - `[ ]` **1.1.b Add declarations beside canonical CLI adapters**
        - Give every canonical command path a stable declaration locus and make aliases point to the canonical record.
        - Export command-owned declarations from the owning `packages/arc-framework/src/commands/` or
          `packages/arc-framework/src/handlers/` module and bind them from the centralized `cli.ts`; later family
          slices add and register their command schemas at the same owning loci. Do not accumulate a second monolithic
          command map in the CLI entry point.
        - Declare semantic fields, cross-field constraints, machine-readable modes, confirmations, explicit stdin,
          presenter/editor use, and opaque passthrough where syntax cannot express the fact.
        - Exclude ambient repository, identity, branch, config, TTY, and CI facts unless the command actually acquires
          them as semantic input.

    - `[ ]` **1.1.c Validate declaration identity and source-locus integrity**
        - Reject duplicate canonical paths, duplicate site identities, dangling aliases, and source loci that no longer
          resolve.
        - Preserve deterministic declaration ordering so generated artifacts and exact-membership tests stay stable.

### `[ ]` **1.2 Extract Commander, prompt, mode, stdin, and subprocess sites from source**

- _Goal:_ The source scanner discovers every syntactic command-input and interaction-capable site without depending on
  a hand-maintained command list.

    - `[ ]` **1.2.a Extract canonical Commander paths and value syntax**
        - Use the TypeScript compiler API against `packages/arc-framework/src/cli.ts` to recover command nesting,
          operands, value-bearing options, aliases, boolean flags participating in cross-field constraints, and action
          adapter loci.
        - Build `test-first` (one behavior at a time):
            - Chained and separately bound command builders produce the same canonical path model.
            - Required operands, optional operands, variadic values, aliases, and value options retain their syntax.
            - `addOption()` choices/defaults/conflicts, parser callbacks, hidden commands, inline actions,
              `allowUnknownOption(true)`, and opaque variadic paths remain distinguishable.
            - Pure boolean flags remain outside schema ownership unless a declaration marks a cross-field constraint.

    - `[ ]` **1.2.b Extract prompt and handler-level acquisition sites**
        - Discover Clack prompt calls, shared prompt helpers, and handler-level required-value resolvers across the full
          `packages/arc-framework/src/` tree with stable source loci, including library-owned wrappers such as
          `packages/arc-framework/src/lib/sync-output.ts`.
        - Distinguish reusable helper definitions from canonical command call sites so helpers never become registry
          identities.

    - `[ ]` **1.2.c Extract machine-output and explicit-stdin declarations**
        - Discover value-bearing machine-mode syntax while requiring the owning adapter declaration to mark whether it
          forbids interaction.
        - Detect explicit stdin operands and options such as `-`, inbox title files, `check commit-msg`, and release
          message sources without treating caller-selected data as ambient prompt input.

    - `[ ]` **1.2.d Extract interaction-capable process launches**
        - Discover Clack-backed presenters and child-process launches that may inherit a terminal, open an editor or
          pager, prompt for credentials, or consume stdin.
        - Cover shared executors as source sites while leaving per-command subprocess policy in typed declarations.

### `[ ]` **1.3 Generate and enforce the authoritative site-policy inventory**

- _Goal:_ A generated inventory proves that every discovered site maps to exactly one policy declaration and every
  declaration maps back to live source.

    - `[ ]` **1.3.a Join AST discoveries with typed declarations**
        - Produce one deterministic entry per AST-discovered site or declaration-originated semantic fact with its
          canonical path, origin, acquisition class, schema owner, default or derivation source, cancellation behavior,
          automation syntax, subprocess behavior, and protected mutation.
        - Refuse unclassified or multiply classified discovered sites, duplicate semantic site identities, and any
          declared source locus that does not resolve; accept declaration-originated facts only for policy syntax
          cannot expose, rather than asking the scanner to infer domain semantics.

    - `[ ]` **1.3.b Render and check the inventory artifact**
        - Add a development script and package command that renders the joined model deterministically to stdout or an
          explicit output path for inspection.
        - Run source-to-declaration reconciliation directly in CI; keep typed declarations as the authority and do not
          add a second tracked generated inventory artifact.
        - Keep rendering descriptive: expose the declaration-owned policy table without choosing whether a default or
          confirmation is safe.

    - `[ ]` **1.3.c Pin inventory completeness in automated tests**
        - Add fixture-level scanner tests for representative Commander, prompt, stdin, mode, and subprocess shapes.
        - Add a repository-corpus reconciliation test so new input-bearing or interaction-capable sites fail until they
          receive one explicit classification.

## **Phase 2:** Shared interaction and acquisition substrate

_Purpose:_ Give every command one adapter-resolved interaction context, typed acquisition outcome, schema path, and
process policy before migrating command-owned behavior.

### `[ ]` **2.1 Resolve one interaction and confirmation context at the CLI boundary**

- _Goal:_ Every command receives one adapter-resolved context whose interaction and affirmative-authority axes cannot
  be conflated by downstream handlers.

    - `[ ]` **2.1.a Implement `InteractionContext` resolution**
        - Resolve prompt capability from the global `--no-input` signal, declared machine-readable mode, CI, and the
          configured prompt streams while resolving confirmation only from command-local authority.
        - Carry prompt streams plus terminal-prompt and presenter policy as explicit dependencies.
        - Build `test-first` (one behavior at a time):
            - Interactive invocations allow prompts and ask for confirmation.
            - Every no-input signal forbids interaction without accepting protected effects.
            - Prompt-input and prompt-output TTY state are evaluated independently across every allowed/forbidden
              combination.
            - Authority-bearing `--yes` accepts only the command's declared confirmation.
            - Compatibility-alias `--yes` forbids interaction without granting authority.

    - `[ ]` **2.1.b Add the global no-input option and adapter factory**
        - Register `--no-input` at the Commander boundary and construct the context once per invocation through a shared
          action-adapter helper owned by `packages/arc-framework/src/lib/command-input/` and bound from
          `packages/arc-framework/src/cli.ts`.
        - Retrieve global and command-local options through the action command rather than assuming `.opts()` includes
          inherited values; preserve `--no-input` before or after nested command paths.
        - Require adapters to declare machine-readable behavior instead of inferring it from a `--json` spelling.

    - `[ ]` **2.1.c Bound environment-policy inference to the adapter contract**
        - Make the boundary resolver the sole environment-policy authority for new and migrated paths, and assign every
          existing `isNonInteractiveEnvironment()` or direct `process.stdin.isTTY` / `process.env.CI` caller to its
          owning family slice rather than migrating those commands into the substrate task.
        - Retain environment access only inside the boundary resolver and unrelated runtime diagnostics; Phase 7
          removes the superseded shared helper after its final family caller migrates.

### `[ ]` **2.2 Implement typed acquisition, confirmation, cancellation, and refusal outcomes**

- _Goal:_ Commands can acquire all independently knowable inputs before mutation and distinguish successful values,
  cancellation, unavailable input, and invalid input without nullable or thrown-string ambiguity.

    - `[ ]` **2.2.a Define `InputResolution` and command-input diagnostics**
        - Implement the closed `resolved` / `cancelled` / `unavailable` / `invalid` union with source attribution,
          structured missing requirements, and schema-path issues.
        - Define a command-local `CommandInputErrorCode` union and `CommandInputError` extending the kernel `ArcError`
          base, following the existing `SchemaError` pattern without adding command codes to the legacy kernel union.
        - Preserve existing terminal and machine-output error boundaries.
        - Build `test-first` (one behavior at a time):
            - Each outcome remains exhaustively distinguishable by type and at runtime.
            - Unknown failures adapt through a safe command-owned error without leaking raw values.

    - `[ ]` **2.2.b Resolve supplied, derived, defaulted, and handler-required values**
        - Parse supplied and deterministic values immediately, apply only declared safe defaults, and aggregate every
          independently knowable missing requirement with its accepted operand or option syntax.
        - Add conditional requirements as soon as their owning branch is known without invalidating already authorized
          earlier phases.
        - Build `test-first` (one behavior at a time):
            - Safe defaults resolve only at sites that declare them.
            - Missing handler-level values return one complete requirement set.
            - Invalid supplied or prompted values retain schema paths and command-domain wording.

    - `[ ]` **2.2.c Resolve courtesy, protected, safety-override, and evidence gates**
        - Encode courtesy proceed, protected positive confirmation, interactive-only safety override, and purpose-named
          evidence as distinct policy operations.
        - Prove environment facts and generic `--yes` cannot satisfy a stronger gate than the declaration grants.

    - `[ ]` **2.2.d Adapt prompt cancellation before schema parsing**
        - Normalize Clack cancellation to `cancelled` before parsing and let each site policy choose stop, skip, or the
          sole declared safe-default exception.
        - Preserve clean cancellation presentation without letting prompt symbols escape command adapters.

### `[ ]` **2.3 Enforce prompt, explicit-stdin, presenter, and subprocess policy**

- _Goal:_ Forbidden interaction cannot suspend the process, while explicitly selected stdin data remains usable and
  existing process failures stay typed and actionable.

    - `[ ]` **2.3.a Make prompt and presenter adapters context-aware**
        - Expose shared context-backed prompt and presenter capabilities from the command-input substrate so commands
          can consume them without adopting sync-specific output semantics.
        - Keep `packages/arc-framework/src/lib/sync-output.ts` unchanged until its Phase 5 vertical slice, where it is
          narrowed directly to human/JSON presentation routing; do not add a transitional context-delegating prompt or
          select layer that the same work unit later removes.
        - Render presentation commands directly when presenters are forbidden.

    - `[ ]` **2.3.b Apply terminal policy before child-process execution**
        - Extend the injected process/Git boundary in `packages/arc-framework/src/lib/io-context.ts` and
          `packages/arc-framework/src/lib/git/process-executor.ts` to disable terminal prompts, editors, pagers, and
          inherited stdin when interaction is forbidden.
        - Carry policy through per-invocation handler dependencies or I/O factories; never mutate a process-global
          interaction setting or rely on the exported singleton `gitExec` to retain invocation state.
        - Preserve the typed executor and cancellation/timeout contracts delivered by `cli-git-executor`.

    - `[ ]` **2.3.c Preserve explicit stdin as a separate payload source**
        - Let caller-selected `-`, `-F -`, and equivalent forms supply data through a dedicated source while unrelated
          child-process stdin stays closed.
        - Preserve programmatic piped input used by `GitExecInput`, notes/ref builders, and prepared ref transactions;
          only ambient terminal input is forbidden.
        - Reject missing deterministic input before spawning an editor or child process.

    - `[ ]` **2.3.d Prove bounded forbidden-interaction behavior**
        - Build `test-first` (one behavior at a time):
            - Prompt, pager, editor, and credential-capable subprocess paths cannot read ambient stdin when forbidden.
            - Explicit stdin payload paths still receive exact caller bytes.
            - Programmatic Git stdin payloads remain functional and per-invocation policies do not bleed between runs.
            - External input absence returns bounded typed failures rather than hangs.

### `[ ]` **2.4 Establish the command-schema adapter and registry substrate**

- _Goal:_ Family slices can add equivalent Commander/prompt schemas and registrations through one reusable contract
  without Phase 2 pre-implementing their command behavior or centralizing semantics in the kernel.

    - `[ ]` **2.4.a Define schema parsing in the canonical adapter contract**
        - Define the reusable adapter shape that lets each later family slice co-locate one complete Zod object schema
          with the command domain that owns schema-backed values or cross-field constraints and infer the handler input
          type from it; do not author the family schemas in Phase 2.
        - Compose kernel `SlugSchema`, `PrioritySchema`, `WorkClassSchema`, and other shared vocabulary directly instead
          of compatibility helpers that default invalid stored metadata.

    - `[ ]` **2.4.b Compose `createCommandInputRegistry()` from the kernel**
        - Accept family-owned registrations and register their canonical IDs as `command-<command-path>-input` at
          version `1` and `strict-current`, sharing schemas across aliases and excluding ambient-only or opaque-only
          paths.
        - Keep command schemas out of the shipped kernel JSON Schema bundle.

    - `[ ]` **2.4.c Prove Commander/prompt parity and registry isolation**
        - Build `test-first` (one behavior at a time):
            - Equivalent raw values from arguments and prompts produce identical schema-inferred objects.
            - Cancellation is handled before parsing and invalid values report the same issues from both sources.
            - A registry with no family registrations contains only the four kernel identities; supplied representative
              registrations add only their declared command schemas.

## **Phase 3:** Installation and workspace command migration

_Purpose:_ Migrate installation-time input families as vertical slices while preserving their safe defaults,
cancellation boundaries, and existing configuration semantics.

### `[ ]` **3.1 Migrate `init` acquisition and validation as one vertical slice**

- _Goal:_ The `init` adapter resolves one complete validated command input before projecting fresh-install or
  reconfiguration values into the existing domain requests, retaining safe defaults without treating no-input
  execution as consent.

    - `[ ]` **3.1.a Define and register the `init` command schema and declaration**
        - Register one canonical `command-init-input` contract covering the fresh-install and `--reconfigure`
          branches across `packages/arc-framework/src/cli.ts`, `packages/arc-framework/src/commands/init.ts`, and
          `packages/arc-framework/src/handlers/init.ts`; do not mint a separate reconfigure registry identity.
        - Add `--identity <name>`, update value-option help so supplied values no longer claim to require `--yes`, and
          constrain identity acquisition to fresh installation; reject `--identity` with `--reconfigure` rather than
          silently changing or ignoring the existing identity.
        - Mark legacy `init --yes` as a prompt-free compatibility alias with no confirmation authority.

    - `[ ]` **3.1.b Unify supplied, prompted, derived, and defaulted init values**
        - Route `packages/arc-framework/src/prompts/init-prompts.ts` and non-interactive option handling through the same
          schema and acquisition resolver.
        - Establish one command-input identity normalization operation for `init`, `join`, and later identity-option
          consumers instead of retaining parallel handler-local normalization helpers.
        - Preserve directory-derived project name, empty tool selection, `none` PM mode, disabled team mode, and
          identity derivation; normalize supplied, prompted, and derived identities through the existing identity
          slugging behavior and validate the result with `SlugSchema`, requiring `--identity` only when derivation is
          unavailable without a prompt.

    - `[ ]` **3.1.c Gate installation on complete resolved inputs**
        - Keep the complete command object at the CLI adapter, project only domain values into `runInit()` and
          `runReconfigure()`, and keep interaction policy plus compatibility flags out of those domain orchestrators.
        - Keep recipe, config, skill, manifest, and Git-config writes behind complete resolution while preserving the
          existing init-in-progress and already-installed safeguards.

    - `[ ]` **3.1.d Prove interactive and no-input init parity**
        - Build `test-first` (one behavior at a time):
            - Equivalent options and prompt answers produce the same `runInit()` request.
            - Cancellation and missing identity perform no installation write.
            - CI, non-TTY, `--no-input`, and legacy `--yes` apply only the declared safe defaults and terminate.
            - Commander help and boundary parsing expose `--identity`, accept value options without `--yes`, and reject
              identity acquisition on the reconfigure branch.

### `[ ]` **3.2 Migrate `join` acquisition and validation as one vertical slice**

- _Goal:_ The `join` adapter resolves one validated command input for fresh setup or personal reconfiguration without
  allowing no-input signals to invent an identity or broaden workspace writes.

    - `[ ]` **3.2.a Define and register the `join` command schema and declaration**
        - Register one canonical `command-join-input` contract covering fresh setup and `--reconfigure` across
          `packages/arc-framework/src/commands/join.ts`, `packages/arc-framework/src/handlers/join.ts`, and
          `packages/arc-framework/src/prompts/join-prompts.ts`; do not mint a separate personal-reconfigure identity.
        - Add `--identity <name>`, update `--tools` help so supplied values no longer claim to require `--yes`, and
          constrain identity acquisition to fresh setup; reject `--identity` with `--reconfigure`.

    - `[ ]` **3.2.b Route join acquisition through the shared resolver**
        - Preserve the current or maintainer role default, empty/current tools, and derived identity while aggregating
          `--identity` as required when derivation fails; normalize every acquired identity through the existing
          slugging behavior and `SlugSchema` via the identity operation established by `init`.
        - Keep the complete command object at the adapter, project fresh role, tools, and identity or reconfiguration
          role and tools into the existing domain requests, and keep all dependent workspace writes behind resolution.

    - `[ ]` **3.2.c Prove join cancellation, parity, and no-input behavior**
        - Build `test-first` (one behavior at a time):
            - Interactive and option-provided values produce equivalent `runJoin()` requests.
            - Cancellation and unavailable identity leave the workspace untouched.
            - `--no-input`, CI, non-TTY, and legacy `join --yes` terminate with only declared defaults.
            - Commander help and boundary parsing expose fresh-setup identity syntax, accept tools without `--yes`, and
              reject identity acquisition during personal reconfiguration.

### `[ ]` **3.3 Migrate reconfiguration and removal decisions as one vertical slice**

- _Goal:_ Reconfiguration resolves current-value defaults and removal decisions completely before applying changes,
  with non-interactive execution preserving Configurable and Scaffolded files.

    - `[ ]` **3.3.a Define reconfiguration schemas and acquisition policy**
        - Compose project, PM, and team reconfiguration into the canonical `init` contract and role/tool personal
          reconfiguration into the canonical `join` contract; cover current-value defaults, dry-run, and
          installation-state constraints without registering standalone reconfigure schemas.
        - Keep branch-specific acquisition in `packages/arc-framework/src/commands/reconfigure.ts`,
          `packages/arc-framework/src/prompts/reconfigure-prompts.ts`, and the existing `join` reconfigure owner.

    - `[ ]` **3.3.b Unify interactive and no-input reconfiguration values**
        - Parse prompted and option-provided replacements through the same schema, preserving current values when no
          change is supplied and returning cancellation before any apply phase.
        - Move `arc.role=maintainer` reaffirmation behind complete valid acquisition, omit it for dry-run, and preserve
          the existing valid no-change reaffirmation behavior without allowing cancellation or invalid input to write.

    - `[ ]` **3.3.c Migrate bulk and per-file removal policy**
        - Route `packages/arc-framework/src/prompts/removal-prompts.ts` through typed acquisition while preserving
          classification-derived defaults: remove Framework files and retain Configurable or Scaffolded files.
        - Validate exactly one decision for every planned removal, with no duplicates, unknown paths, or classification
          mismatches, before changing the apply plan; incomplete or inconsistent sets refuse before any mutation.

    - `[ ]` **3.3.d Prove reconfiguration and removal mutation boundaries**
        - Build `test-first` (one behavior at a time):
            - Interactive choices and no-input defaults produce equivalent resolved plans where policy matches.
            - Cancellation, invalid input, and missing, duplicate, unknown, or mismatched removal decisions perform no
              apply, removal, manifest, skill, or Git-config mutation.
            - Dry-run never prompts for removal decisions, remains mutation-free, applies classification defaults to
              its effective preview, and distinguishes files that would be deleted from those kept or untracked.

## **Phase 4:** Work-unit and lifecycle command migration

_Purpose:_ Apply the substrate to lifecycle inputs without moving transition policy or weakening safety and
containment guards owned by the existing handlers.

### `[ ]` **4.1 Migrate `start` courtesy confirmation and safety override behavior**

- _Goal:_ Ordinary resolved starts proceed without prompting in no-input mode, while indeterminate lifecycle evidence
  still requires a distinct interactive affirmative that automation cannot forge or conflate with compatibility flags.

    - `[ ]` **4.1.a Define and register the `start` input contract**
        - Cover optional name, `--here`, `--from`, `--class`, `--new`, compatibility `--yes`, derived disposition, and
          the two distinct confirmation sites in `packages/arc-framework/src/handlers/start.ts`.
        - Resolve arm-dependent constraints after disposition is known: `--from` belongs to cold-start acquisition and
          `--class` to unresolved-stub graduation; reject options that the selected arm cannot consume rather than
          silently ignoring them.

    - `[ ]` **4.1.b Route the resolved-plan courtesy confirmation through acquisition policy**
        - Preserve interactive confirm/cancel behavior and let `--no-input`, CI, non-TTY, or legacy `start --yes`
          proceed only after all ordinary start inputs and lifecycle disposition are resolved.
        - Normalize legacy `--yes` at the adapter as a prompt-free alias, replacing `skipConfirm()` and direct
          environment checks instead of carrying the compatibility spelling into arm or domain APIs.

    - `[ ]` **4.1.c Keep indeterminate-oracle override interactive-only**
        - Represent the degraded-evidence affirmative as its own resolved input; do not set or reuse `yes` to authorize
          it or to communicate its result to later courtesy-confirmation handling.
        - Build `test-first` (one behavior at a time):
            - An interactive affirmative can authorize the existing degraded-evidence override.
            - Decline or cancellation stops before branch or ceremony mutation.
            - Every no-input signal, including `--yes`, refuses the override with actionable guidance.
            - Create, cold-start, graduate, resume, and refusal arms consume only their declared fields and reject
              incompatible option combinations.

### `[ ]` **4.2 Migrate `stub` and backlog-tier required-input behavior**

- _Goal:_ Stub creation and provisional promotion elicit unresolved commitment data interactively or refuse once with
  exact syntax, while promotion persists acquired Class through the lifecycle owner and both tier directions use the
  shared command-input boundary.

    - `[ ]` **4.2.a Define schemas for stub creation and backlog-tier moves**
        - Compose slug, priority, class, commitment tier, origin/design, and cohort constraints for `stub` and
          `promote`, plus the inverse `demote` target contract, without moving backlog placement or state-transition
          rules out of lifecycle modules.
        - Add `promote --class <value>` to the Commander boundary and project schema-inferred values into lifecycle
          requests rather than retaining handler-local string narrowing.

    - `[ ]` **4.2.b Acquire handler-required commitment, priority, and class**
        - Elicit missing `stub` commitment and priority only when interaction is allowed; otherwise aggregate
          `--commitment` and `--priority` requirements.
        - Reuse one Class acquisition mechanism for `promote` and `start` graduation: elicit or require `--class` only
          when the selected stub is `[TBD]`, reject a supplied value that conflicts with an already-resolved Class, and
          pass the result to the lifecycle-owned promotion operation.
        - Extend promotion so the acquired Class is persisted with the relocation before success is reported; do not
          bolt a separate pre- or post-command write onto the handler.

    - `[ ]` **4.2.c Prove refusal and atomic persistence boundaries**
        - Build `test-first` (one behavior at a time):
            - Invalid vocabulary fails before backlog writes.
            - All missing handler-level values appear in one diagnostic.
            - Cancellation, unavailable interaction, and conflicting Class input perform no stub, Class, promotion, or
              demotion mutation.
            - Successful unresolved-Class promotion leaves one relocated planned stub carrying the acquired Class.

### `[ ]` **4.3 Migrate required lifecycle and planning-ceremony inputs**

- _Goal:_ Lifecycle and planning verbs receive schema-validated command objects while their existing target resolution,
  state machine, containment, and ceremony side effects remain authoritative.

    - `[ ]` **4.3.a Migrate active-lifecycle transition inputs**
        - Define and apply command schemas for `activate`, `deactivate`, `park`, `integrate`, `reopen`, and `archive`,
          covering required type/task/action/orientation fields, normal-park `--reason`, the distinct `park --land`
          mode, reopen disposition, optional PR URL, and the safe current-date completion default.
        - Preserve the target-selection and candidate-reporting behavior currently owned by
          `resolveVerbTargetOrReport()` without freezing that helper's shape: resolve an explicit or context-defaulted
          slug through lifecycle policy, then include the validated semantic target in the complete command object.

    - `[ ]` **4.3.b Migrate worktree and decomposition lifecycle inputs**
        - Validate `decompose`, `resume`, `materialize`, and `teardown` operands/options, including exact receipt, branch,
          and husk syntax, before their existing mutators run.
        - Keep containment, ancestry, remote, and force policy in the owning lifecycle implementation.

    - `[ ]` **4.3.c Migrate planning-ceremony verb inputs**
        - Validate `set-stage`, `finalize`, and `repoint-design` through command-owned schemas while retaining stage,
          fire-point, class requirement, and meta-write policy in
          `packages/arc-framework/src/handlers/lifecycle.ts`.

    - `[ ]` **4.3.d Prove schema failures cannot cross lifecycle guards**
        - Build `test-first` (one behavior at a time):
            - Supplied and context-defaulted targets produce equivalent validated requests.
            - Syntax-invalid inputs fail before handler or lifecycle-query dispatch; conditional acquisition performs
              only the read-only target/state queries needed to discover requirements.
            - Invalid, cancelled, or unavailable outcomes never construct an executor or invoke a mutator or ceremony
              write.
            - Existing lifecycle-state and containment failures retain their user-facing behavior.

### `[ ]` **4.4 Migrate destructive and errand lifecycle authorities**

- _Goal:_ Destructive and errand commands distinguish validated data from explicit authority while preserving their
  impact-plan and containment safeguards.

    - `[ ]` **4.4.a Migrate `abandon` protected confirmation**
        - Keep the impact plan and all destructive cascade guards ahead of mutation, then require command-local `--yes`
          for every invocation; an interactive prompt is not a substitute for the settled flag-only guard.
        - Prove CI, non-TTY, machine-readable declarations, and `--no-input` cannot authorize abandonment by
          themselves.

    - `[ ]` **4.4.b Migrate errand open/link explicit-input contracts**
        - Validate slug, branch type, intent, inbox title, and the `--inbox-title-file` / compatibility alias relationship
          while preserving explicit `-` stdin data.
        - Normalize the compatibility alias at the adapter while counting each supplied spelling for conflict
          detection: `errand open` accepts zero or exactly one canonical adoption source across `--from-inbox`,
          `--inbox-title-file`, and `--inbox-entry-file`, while `errand link` requires exactly one.
        - Preserve zero-source `errand open` as a description-origin errand, and aggregate missing or conflicting link
          syntax before record or branch mutation.

    - `[ ]` **4.4.c Migrate errand promotion, close, and retire inputs**
        - Compose kernel priority/class/slug schemas for promotion and validate floor, target name, branch type, and
          close/retire options without moving errand-to-WU or containment policy out of
          `packages/arc-framework/src/handlers/errand.ts`.
        - Treat `errand close --force` as an explicit command-local containment override that environment and
          interaction state never imply; keep record-preservation and remote-head policy with the errand owner.

    - `[ ]` **4.4.d Prove authority and input failures leave errand state unchanged**
        - Build `test-first` (one behavior at a time):
            - Invalid values and unavailable required input create no record, branch, or meta.
            - Explicit stdin titles remain byte-compatible.
            - Alias combinations resolve once to the canonical title field or refuse before mutation.
            - Zero-source `errand open` preserves description-origin behavior, while zero-source `errand link` refuses
              with the exact accepted title syntax.
            - `abandon --yes` and `errand close --force` authorize only their named boundaries and never bypass the
              remaining impact, record-preservation, or containment guards.

## **Phase 5:** User-state and compound-sync command migration

_Purpose:_ Preserve phase-scoped effects while making overwrite, direction, and notes-push authority explicit across
the user-state and compound synchronization paths.

### `[ ]` **5.1 Migrate `user open`, `load`, and `pull` acquisition policy**

- _Goal:_ User workspace commands preserve local data unless their declared policy resolves, while non-destructive
  stale-subdirectory handling remains safe without requiring authority.

    - `[ ]` **5.1.a Migrate `user open` stale-subdirectory choice**
        - Define and register the `user open <wu-name>` command contract, validating the semantic work-unit target
          before retired-subdirectory reconciliation or workspace writes.
        - Route the existing stale-subdirectory prompt in `packages/arc-framework/src/handlers/user.ts` through typed
          acquisition, mapping cancellation and no-input execution to the declared `keep` default.
        - Preserve removal only for an explicit interactive `remove` choice; do not add a `--yes` authority path.

    - `[ ]` **5.1.b Migrate `user load` compatibility and `user pull` overwrite confirmation**
        - Keep `user load` deterministic and prompt-free, declaring inert `--yes` as a compatibility no-input alias
          without creating a schema identity solely for that boolean or adding a new overwrite confirmation.
        - Define the `user pull` schema and declaration for identity selection and overwrite authority across
          `packages/arc-framework/src/commands/user/`, `packages/arc-framework/src/handlers/user.ts`, and
          `packages/arc-framework/src/handlers/user-sync.ts`.
        - Require command-local `--yes` when no-input execution reaches a protected overwrite and preserve non-overwrite
          pulls without prompting.

    - `[ ]` **5.1.c Prove user-workspace mutation boundaries**
        - Build `test-first` (one behavior at a time):
            - `keep`, cancel, invalid identity, and unconfirmed overwrite preserve existing files.
            - Unconfirmed no-input pull performs no fetch, notes-ref update, or disk restore.
            - Interactive confirmation and `--yes` authorize only the overwrite site they name.
            - `user load` remains prompt-free with or without its inert `--yes` compatibility alias.
            - Machine-readable and no-input paths terminate without Clack reads.

### `[ ]` **5.2 Migrate contested `user sync` direction and confirmation policy**

- _Goal:_ Notes synchronization resolves contested direction, overwrite authority, and prompt-policy push authority as
  distinct typed fields so an earlier authorized local save can stand without granting a later remote or destructive
  effect.

    - `[ ]` **5.2.a Migrate contested-direction acquisition**
        - Route the direction select in `packages/arc-framework/src/handlers/user-sync.ts` through the shared resolver
          with `save-only` as the declared safe no-input default.
        - Keep `--yes` from choosing `push` or another domain direction.

    - `[ ]` **5.2.b Migrate local-overwrite confirmation**
        - Require explicit interactive confirmation or command-local `--yes` only when the resolved sync plan would
          overwrite local disk state.
        - Preserve decline/cancellation as a skipped pull/load rather than undoing an independently authorized save.

    - `[ ]` **5.2.c Migrate notes-push confirmation**
        - Preserve the configured policy matrix: `manual` saves only, `on-sync` pushes as standing configuration, and
          `prompt` asks interactively or requires command-local `--yes` under forbidden interaction.
        - Resolve prompt-policy remote-push authority separately after local save, leaving the saved note intact on
          decline, cancellation, or no-input execution without `--yes`.
        - Project direction, overwrite, and prompt-policy push outcomes into their named domain fields; remove generic
          `yes` from downstream direction parameters and handlers.

    - `[ ]` **5.2.d Prove phase-scoped user-sync effects**
        - Build `test-first` (one behavior at a time):
            - Each confirmation gates only its dependent mutation.
            - `save-only` and declined later phases retain earlier authorized state.
            - `manual`, `prompt`, and `on-sync` retain their configured semantics in interactive and no-input modes.
            - Unconfirmed overwrite performs no fetch, notes-ref update, or restore mutation.
            - No environment or machine-output signal selects direction or push authority.

### `[ ]` **5.3 Migrate phase-scoped top-level `sync` authority**

- _Goal:_ Compound `sync` uses the shared context across worktree and notes legs while preserving the orchestrator's
  existing partial-success and recovery semantics.

    - `[ ]` **5.3.a Replace sync-specific prompt-mode inference**
        - Thread `InteractionContext` through `packages/arc-framework/src/handlers/sync.ts`; narrow
          `packages/arc-framework/src/lib/sync-output.ts` to human/JSON presentation routing while moving confirm,
          select, cancellation, and JSON fallback behavior into shared acquisition outcomes.
        - Remove the generic `yes` field from sync execution context and update CLI help that currently claims `--yes`
          also accepts conflict merging; the flag authorizes only its declared prompt-policy sites.

    - `[ ]` **5.3.b Resolve notes-push authority at its existing phase boundary**
        - Preserve the configured `manual` / `prompt` / `on-sync` matrix, completed worktree legs, and note-save legs
          when a later prompt-policy push is declined or unavailable; require command-local authority only for that
          protected prompt-policy mutation.

    - `[ ]` **5.3.c Prove compound-sync output and effect compatibility**
        - Build `test-first` (one behavior at a time):
            - Human and JSON output channels retain their existing envelope/stderr contracts.
            - No-input runs terminate without prompts and keep independently authorized earlier effects.
            - Partial-push markers and recovery guidance remain unchanged.

### `[ ]` **5.4 Migrate remaining user inputs and explicit stdin payloads**

- _Goal:_ Every remaining value-bearing user command has a validated object contract, and caller-selected stdin data
  is never confused with prompt capability.

    - `[ ]` **5.4.a Migrate remaining user declarations and schema-owned inputs**
        - Register schemas for schema-owned add, close, inbox-removal, and `user fetch --identity` values in their
          owning `packages/arc-framework/src/commands/user/` modules, including the inbox title-file alias relationship.
        - Declare `push --force` authority and compact/status machine or boolean modes without registering boolean-only
          schemas unless a declared cross-field constraint requires one.
        - Normalize user-add and optional user-fetch identity through the shared command identity contract, and classify
          `user push --force` as an explicit command-local publication override that interaction or environment state
          never implies.

    - `[ ]` **5.4.b Preserve inbox-title stdin and identity semantics**
        - Reuse the canonical literal/file/compatibility-alias title acquisition from the errand slice, validating
          conflicts once and passing explicit `-` payloads through the dedicated stdin source.
        - Treat commands that acquire identity as semantic-input owners and bare identity preconditions elsewhere as
          ambient context.

    - `[ ]` **5.4.c Prove user command schema and output parity**
        - Build `test-first` (one behavior at a time):
            - Invalid input fails before filesystem or notes-ref mutation.
            - Invalid `user fetch --identity` fails before remote fetch or notes-ref updates, while omitted identity
              preserves the current-identity default.
            - Aliases parse to the canonical command object.
            - Registry membership includes the value-bearing `user fetch` contract and excludes boolean-only user paths.
            - `user push --force` is never inferred and does not bypass unrelated block-disposition guards.
            - JSON envelopes and explicit stdin byte handling remain compatible.

## **Phase 6:** Release and external-process command migration

_Purpose:_ Close the trust-sensitive release, pager, editor, and terminal-process boundaries without claiming domain
ownership over opaque passthrough arguments.

### `[ ]` **6.1 Migrate release-install idempotency, trust, and evidence inputs**

- _Goal:_ Release installation resolves idempotency action, trust acknowledgment, and workflow evidence as separate
  inputs whose authority cannot substitute for one another.

    - `[ ]` **6.1.a Define and register the release-install input contract**
        - Cover `--harness`, `--mode`, command-local `--yes`, `--workflow-verified`, and
          `--idempotency-action <exit|re-verify|update-markers|add-harness>` in
          `packages/arc-framework/src/handlers/release/setup/install.ts` and the release CLI adapter.
        - Replace nullable prompt-provider callbacks with adapter-owned typed acquisition, then pass one complete
          resolved input object into the installation orchestrator while preserving marker/config policy and output
          envelopes.

    - `[ ]` **6.1.b Migrate existing-install action acquisition**
        - Preserve `exit` as the no-input default and successful no-op, with explicit syntax for `re-verify`,
          `update-markers`, and `add-harness`.
        - Require `harness`, `mode`, trust acknowledgment, and workflow evidence only for fresh installation,
          state-mismatch recovery, or `add-harness`; `exit`, `re-verify`, and `update-markers` retain their existing
          non-install action behavior without acquiring unrelated inputs.

    - `[ ]` **6.1.c Separate trust confirmation from workflow evidence**
        - Require command-local `--yes` for trust acknowledgment and purpose-named `--workflow-verified` for external
          evidence; neither input may satisfy the other.

    - `[ ]` **6.1.d Prove release-install mutation ordering**
        - Build `test-first` (one behavior at a time):
            - Every independently knowable missing `harness`, `mode`, trust, or evidence requirement is reported
              together on an installation branch and stops before marker/config writes.
            - Existing-install actions apply the exact conditional requirement matrix without prompting for or
              requiring unrelated installation inputs.
            - Cancellation and no-input default exit perform no mutation.
            - Environment and machine-output signals confer neither trust nor evidence.
            - Commander-boundary cases preserve the versioned JSON envelope and exact accepted option syntax.

### `[ ]` **6.2 Migrate release-uninstall evidence refusal**

- _Goal:_ Release uninstall removes trust markers only after purpose-named cleanup evidence resolves successfully.

    - `[ ]` **6.2.a Define and apply the release-uninstall evidence contract**
        - Validate the command's setup target and `--cleanup-verified` input in
          `packages/arc-framework/src/handlers/release/setup/uninstall.ts`, mapping cancellation or false evidence to
          refusal.
        - Replace the nullable cleanup callback with adapter-owned typed evidence acquisition and pass the resolved
          uninstall object into the orchestrator; an unrecorded harness remains a successful no-op that does not
          require cleanup evidence.

    - `[ ]` **6.2.b Prove evidence cannot be inferred or substituted**
        - Build `test-first` (one behavior at a time):
            - Interactive affirmative and explicit evidence syntax produce the same resolved evidence value.
            - `--yes`, `--no-input`, CI, non-TTY, and machine modes cannot replace cleanup evidence.
            - Cancellation and false evidence refuse consistently, while refusal performs no marker removal or
              opt-out write.
            - An unrecorded harness performs no cleanup acquisition and preserves its existing successful no-op
              envelope.

### `[ ]` **6.3 Preserve release Git passthrough while gating editor and stdin behavior**

- _Goal:_ Release wrappers retain the established semantics of opaque Git arguments and exact selected message bytes
  while forbidden interaction blocks implicit editor and terminal reads before spawning Git.

    - `[ ]` **6.3.a Declare release commit/push as opaque passthrough paths**
        - Keep `[args...]` outside command schema ownership and registry identity while allowing the adapter to classify
          message source, stdin, editor, and interaction risk.
        - Preserve established wrapper-owned transformations: `--no-wrap` removal, commit-message snapshot routing,
          push-target pair normalization, and authorized `-u` injection do not make the remaining Git payload
          schema-owned.

    - `[ ]` **6.3.b Apply interaction policy in commit preflight**
        - Extend `packages/arc-framework/src/handlers/release/commit-message-preflight.ts` and `commit-cli.ts` so
          forbidden interaction requires an existing deterministic message source and rejects before Git can open an
          editor.
        - Under forbidden interaction, authorize spawning only when the classifier proves an editor-free deterministic
          source; conservatively refuse unsupported, ambiguous, source-free, and editor-requiring forms before spawn.
        - Preserve explicit `-F -` as caller-selected data.

    - `[ ]` **6.3.c Apply terminal policy to release Git execution**
        - Ensure release commit/push inherit the shared Git environment and stdio policy without weakening destructive
          flag refusal, interlock validation, audit recording, or upstream initialization.
        - Pass the invocation's resolved subprocess policy into each spawn rather than retaining ambient stdin or
          process-global interaction state; close child stdin and disable Git terminal/editor prompting when forbidden.

    - `[ ]` **6.3.d Prove passthrough and interaction compatibility**
        - Build `test-first` (one behavior at a time):
            - Unowned opaque tokens retain order and value through established wrapper normalization, while only the
              declared wrapper controls and message/target transports are transformed.
            - Missing, ambiguous, unsupported, and editor-requiring message sources fail boundedly with no editor
              spawn when interaction is forbidden.
            - `-F -` and file snapshots consume exact caller bytes while unrelated terminal input remains closed.
            - Timeout-bounded subprocess coverage proves commit editor and push credential paths terminate under
              forbidden interaction without weakening interactive behavior.

### `[ ]` **6.4 Migrate `view` pager and terminal-capable subprocess behavior**

- _Goal:_ Presentation and external-process commands choose terminal interaction only when the resolved context allows
  it, otherwise rendering or failing directly without suspension.

    - `[ ]` **6.4.a Migrate `view` input and pager policy**
        - Validate kind, project/current selectors, and target override through the command-owned view schema.
        - Preserve bare `--current` as `tasks`; allow `--current` only with `tasks`, `--project` only with `inbox`, and
          reject `--for` with identity-global `working-memory` or `inbox` before identity, clock, target, or artifact
          queries.
        - Replace the legacy `nonInteractive` boolean and downstream CI/TTY inference with presenter capability from
          `InteractionContext`, threading it into `packages/arc-framework/src/commands/view/run.ts` so forbidden
          interaction writes directly to stdout without selecting or spawning a pager.

    - `[ ]` **6.4.b Apply shared policy to remaining terminal-capable launches**
        - Use the generated inventory to migrate external tools that can prompt for credentials or inherit terminal
          input, while leaving non-interactive captured-output subprocesses unchanged.

    - `[ ]` **6.4.c Prove presenter and subprocess termination**
        - Build `test-first` (one behavior at a time):
            - Interactive `view` preserves pager behavior and pager exit returns control.
            - No-input `view` renders identical content directly.
            - Terminal-capable tools receive forbidden prompt/editor/pager settings before spawn.
            - Timeout-bounded subprocess tests cover pager return and direct rendering without a pager, editor, or
              credential read.

### `[ ]` **6.5 Close the remaining release inspection and setup adapters**

- _Goal:_ Every release command that owns typed values or machine-readable behavior participates in the same validated
  release slice rather than falling through to the generic closure phase.

    - `[ ]` **6.5.a Migrate release status and read-only setup contracts**
        - Add command-owned schemas and declarations for `release setup print-patterns` and `release setup verify`, and
          declare `release status --json` as machine-readable without registering a boolean-only schema.
        - Preserve `print-patterns` format defaults and abstract-contract fallback, optional verify filtering, existing
          output envelopes, and the absence of registry identities for value-free `release opt-in` / `opt-out`; do not
          narrow the harness field to today's named integrations because unknown values intentionally render the
          abstract contract.

    - `[ ]` **6.5.b Parse release inspection inputs before dependent reads**
        - Validate supplied harness and format values at the adapter before settings, identity, marker, or other
          command-dependent work, then project schema-inferred values into the existing read-only orchestrators.

    - `[ ]` **6.5.c Prove remaining release compatibility and registration**
        - Build `test-first` (one behavior at a time):
            - Invalid setup inspection values invoke no handler query or subprocess.
            - Human and machine-readable release status output remains byte-compatible.
            - Only schema-owned value paths register; boolean-only, value-free, helper, and opaque release paths do
              not.

## **Phase 7:** Command-contract closure and termination proof

_Purpose:_ Reconcile the remaining command surface against the generated oracle and prove exact registration,
behavioral compatibility, and bounded no-input termination across the complete CLI.

### `[ ]` **7.1 Migrate remaining value-bearing and machine-readable command adapters**

- _Goal:_ Every inventory-listed canonical path outside the migrated policy families validates its schema-owned values
  and declares machine-readable interaction behavior before invoking its existing handler.

    - `[ ]` **7.1.a Freeze and partition the outstanding canonical set**
        - Derive the exact remaining paths by subtracting the canonical paths assigned to Phases 3-6 from the complete
          generated inventory; fail on an unassigned or multiply assigned path, then partition the remainder into the
          bounded family slices below rather than maintaining a second hand-authored closure list.
        - Classify `packages/arc-framework/src/commands/constitution.ts` under canonical `status` and
          `packages/arc-framework/src/handlers/push-recovery.ts` under their canonical user/sync consumers; neither
          helper is a command path or registry identity.

    - `[ ]` **7.1.b Migrate status, config, and extension inspection**
        - Cover the inventory-outstanding composite `status`, `config status`, and `extensions status` values,
          constraints, and machine modes while preserving their established envelopes and helper-owned probes.

    - `[ ]` **7.1.c Migrate active and housekeep inspection**
        - Cover inventory-outstanding `active` inspection paths and `housekeep check`, including local/no-fetch aliases,
          machine modes, and existing repository-query policy.

    - `[ ]` **7.1.d Migrate base, plan, and recovery inspection**
        - Cover inventory-outstanding `base`, `plan check`, and `recover audit` inputs and machine modes without moving
          their repository or recovery policy into the command-input substrate.

    - `[ ]` **7.1.e Migrate check, log, and remaining simple maintenance paths**
        - Cover inventory-outstanding `check commit-msg`, `log standalone`, and any scanner-proven simple maintenance
          adapter while leaving zero-input and boolean-only paths unregistered unless a declared cross-field constraint
          makes an object schema necessary.

    - `[ ]` **7.1.f Resolve inventory-identified mixed and alias paths**
        - Register only schema-owned fields on mixed paths, share canonical schemas across aliases, and pass opaque
          payload segments separately.

    - `[ ]` **7.1.g Prove remaining adapters fail before dependent effects**
        - Build `test-first` (one behavior at a time):
            - Invalid values never invoke their handler or subprocess.
            - Machine-readable declarations forbid prompts without granting authority.
            - Existing output and exit-code contracts remain stable.

### `[ ]` **7.2 Prove exact registry membership, aliasing, and opaque-passthrough exclusions**

- _Goal:_ The command-input registry is an exact, reproducible projection of discovered schema-owned syntax plus
  declared semantic fields and constraints.

    - `[ ]` **7.2.a Derive the expected command ID set**
        - Union AST-discovered schema-owned value paths with declarations carrying semantic derived, handler-required,
          or cross-field values, then subtract declaration-classified opaque-only paths.

    - `[ ]` **7.2.b Assert exact command and complete registry membership**
        - Compare the command subset against the derived IDs and the complete registry against that set plus the four
          kernel identities, with deterministic order and metadata.

    - `[ ]` **7.2.c Prove alias sharing and publication isolation**
        - Build `test-first` (one behavior at a time):
            - Aliases resolve the canonical schema without duplicate identity.
            - Leaf helpers, ambient-only paths, and release opaque passthrough paths do not register.
            - Command registrations do not enter the shipped kernel JSON Schema bundle.

### `[ ]` **7.3 Prove bounded no-input behavior through real subprocess and CLI tests**

- _Goal:_ Real CLI processes demonstrate that every interaction-capable path terminates under automation and preserves
  explicitly selected stdin data without accidental mutation.

    - `[ ]` **7.3.a Build a bounded no-input subprocess matrix**
        - Exercise `--no-input`, CI, non-TTY prompt streams, and machine-readable modes across all declared prompt,
          presenter, editor, credential, and child-stdin sites with hard test deadlines.
        - Derive or exact-match the case set against generated inventory site identities so a newly declared
          interaction-capable site cannot remain absent from the real-process proof.

    - `[ ]` **7.3.b Cover explicit stdin and terminal-process exceptions**
        - Prove `check commit-msg - --json`, inbox-title file `-`, and `release commit -F -` consume caller-selected data
          while pager/editor/credential-capable subprocesses cannot consume ambient stdin.
        - Reuse or extend the existing timeout-bounded CLI and E2E spawn helpers; do not create a parallel generic
          subprocess-test mechanism.

    - `[ ]` **7.3.c Cover authority and compatibility aliases end to end**
        - Prove prompt-free compatibility for `init --yes`, `join --yes`, `start --yes`, and `user load --yes`,
          authority-bearing user/sync/release/abandon cases, and the interactive-only `start` override distinction.

    - `[ ]` **7.3.d Prove mutation boundaries with real command execution**
        - Assert unavailable, invalid, cancelled, and unconfirmed inputs cannot reach dependent filesystem, git, notes,
          lifecycle, or release mutations, including compound operations with valid earlier phases.

### `[ ]` **7.4 Close the AST-to-declaration reconciliation and remove bespoke residue**

- _Goal:_ The migrated CLI has no unclassified input or interaction site and no parallel reusable mechanism that can
  drift from the shared contract.

    - `[ ]` **7.4.a Run and reconcile the complete inventory**
        - Resolve every discovered-versus-declared mismatch and return to the RFC if a newly found site lacks a unique
          classification under the settled policy table.

    - `[ ]` **7.4.b Remove superseded reusable prompt and no-input helpers**
        - Remove `isNonInteractiveEnvironment()` after its final caller migrates and prove no downstream environment
          policy inference remains.
        - Move any still-useful pure init-default projection into the command-owned init acquisition module, then retire
          `packages/arc-framework/src/prompts/non-interactive.ts`; remove JSON-specific prompt shims, duplicated
          missing-string validation, and other parallel reusable input-policy mechanisms after all callers migrate.
        - Require the closing source scan to find no generic environment-policy helper, nullable prompt-provider seam,
          or second reusable command-input mechanism beside the shared substrate.
        - Route unrelated wholesale migration residue to `cli-substrate-complete-migration` rather than expanding this
          work unit.

    - `[ ]` **7.4.c Re-run cross-family compatibility and architecture checks**
        - Verify command ownership, `cli -> handlers/commands -> lib` dependency direction, kernel import boundaries,
          generated-inventory stability, and the procedure-substrate rule that deterministic policy lives in code.

## **Phase 8:** Verification

_Purpose:_ Verify the completed work unit against its design, task record, and project quality gates.

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The completed CLI command-input substrate satisfies `spec-cli-command-inputs.md`, preserves its compatibility
  and trust boundaries, and clears every work-unit quality and integration gate.

---

## Success Criteria

- `[ ]` Every in-scope input, prompt, mode, confirmation, stdin, editor, pager, and terminal-process site has one
  mechanically checked declaration and policy classification.
- `[ ]` Semantic command inputs and ambient execution context follow the spec's closed boundary.
- `[ ]` Every canonical command path with schema-owned input validates supplied and prompted values through one
  command-owned Zod object schema before dependent effects.
- `[ ]` Registry membership exactly matches the derived command set plus the kernel identities, excluding helper and
  opaque-only schemas.
- `[ ]` `--no-input`, CI, non-TTY prompt streams, and machine-readable modes terminate without unsolicited interaction
  or inferred affirmative authority.
- `[ ]` Missing handler-level inputs are aggregated with exact accepted syntax, and no required value is invented.
- `[ ]` Protected confirmations and evidence requirements accept only their declared command-local authority.
- `[ ]` Interactive-only safety overrides cannot be authorized by automation signals.
- `[ ]` Cancellation, invalid input, unavailable interaction, and successful resolution remain distinct outcomes.
- `[ ]` Explicit stdin payloads, output envelopes, lifecycle guards, safe defaults, and phase-scoped sync effects remain
  behaviorally compatible.
- `[ ]` The closing inventory reconciliation and bounded subprocess suite prove complete classification and termination.
- `[ ]` All quality gates pass (Markdown, TypeScript, and shell linting; `typecheck:all`; full tests; build)
- `[ ]` Ready for integration
