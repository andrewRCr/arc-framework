# Task List: CLI Command Inputs

- **Design:** `spec-cli-command-inputs.md`

---

## **Phase 1:** Mechanically checked input inventory

_Purpose:_ Establish the typed declaration model and generated completeness oracle that every later migration slice
uses to prove its command-input coverage.

### `[x]` **1.1 Define canonical command-input declarations and inventory records**

- _Goal:_ Every command-input fact that syntax cannot reveal has one typed, command-owned declaration that can be
  validated and joined with discovered source sites.

    - `[x]` **1.1.a Define the declaration and inventory algebra**
        - Defined the declaration and inventory algebra.
    - `[x]` **1.1.b Add declarations beside canonical CLI adapters**
        - Added declarations beside canonical CLI adapters.
    - `[x]` **1.1.c Validate declaration identity and source-locus integrity**
        - Validated declaration identity and source-locus integrity.

### `[x]` **1.2 Extract Commander, prompt, mode, stdin, and subprocess sites from source**

- _Goal:_ The source scanner discovers every syntactic command-input and interaction-capable site without depending on
  a hand-maintained command list.

    - `[x]` **1.2.a Extract canonical Commander paths and value syntax**
        - Extracted canonical Commander paths and value syntax.
    - `[x]` **1.2.b Extract prompt and handler-level acquisition sites**
        - Extracted prompt and handler-level acquisition sites.
    - `[x]` **1.2.c Extract machine-output and explicit-stdin declarations**
        - Extracted machine-output and explicit-stdin declarations.
    - `[x]` **1.2.d Extract interaction-capable process launches**
        - Extracted interaction-capable process launches.

### `[x]` **1.3 Generate and enforce the authoritative site-policy inventory**

- _Goal:_ A generated inventory proves that every discovered site maps to exactly one policy declaration and every
  declaration maps back to live source.

    - `[x]` **1.3.a Join AST discoveries with typed declarations**
        - Joined AST discoveries with typed declarations.
    - `[x]` **1.3.b Render and check the inventory artifact**
        - Rendered and checked the inventory artifact.
    - `[x]` **1.3.c Pin inventory completeness in automated tests**
        - Pinned inventory completeness in automated tests.

## **Phase 2:** Shared interaction and acquisition substrate

_Purpose:_ Give every command one adapter-resolved interaction context, typed acquisition outcome, schema path, and
process policy before migrating command-owned behavior.

### `[x]` **2.1 Resolve one interaction and confirmation context at the CLI boundary**

- _Goal:_ Every command receives one adapter-resolved context whose interaction and affirmative-authority axes cannot
  be conflated by downstream handlers.

    - `[x]` **2.1.a Implement `InteractionContext` resolution**
        - Implemented `InteractionContext` resolution.
    - `[x]` **2.1.b Add the global no-input option and adapter factory**
        - Added the global no-input option and adapter factory.
    - `[x]` **2.1.c Bound environment-policy inference to the adapter contract**
        - Bound environment-policy inference to the adapter contract.

### `[x]` **2.2 Implement typed acquisition, confirmation, cancellation, and refusal outcomes**

- _Goal:_ Commands can acquire all independently knowable inputs before mutation and distinguish successful values,
  cancellation, unavailable input, and invalid input without nullable or thrown-string ambiguity.

    - `[x]` **2.2.a Define `InputResolution` and command-input diagnostics**
        - Defined `InputResolution` and command-input diagnostics.
    - `[x]` **2.2.b Resolve supplied, derived, defaulted, and handler-required values**
        - Resolved supplied, derived, defaulted, and handler-required values.
    - `[x]` **2.2.c Resolve courtesy, protected, safety-override, and evidence gates**
        - Resolved courtesy, protected, safety-override, and evidence gates.
    - `[x]` **2.2.d Adapt prompt cancellation before schema parsing**
        - Adapted prompt cancellation before schema parsing.

### `[x]` **2.3 Enforce prompt, explicit-stdin, presenter, and subprocess policy**

- _Goal:_ Forbidden interaction cannot suspend the process, while explicitly selected stdin data remains usable and
  existing process failures stay typed and actionable.

    - `[x]` **2.3.a Make prompt and presenter adapters context-aware**
        - Made prompt and presenter adapters context-aware.
    - `[x]` **2.3.b Apply terminal policy before child-process execution**
        - Applied terminal policy before child-process execution.
    - `[x]` **2.3.c Preserve explicit stdin as a separate payload source**
        - Preserved explicit stdin as a separate payload source.
    - `[x]` **2.3.d Prove bounded forbidden-interaction behavior**
        - Proved bounded forbidden-interaction behavior.

### `[x]` **2.4 Establish the command-schema adapter and registry substrate**

- _Goal:_ Family slices can add equivalent Commander/prompt schemas and registrations through one reusable contract
  without Phase 2 pre-implementing their command behavior or centralizing semantics in the kernel.

    - `[x]` **2.4.a Define schema parsing in the canonical adapter contract**
        - Defined schema parsing in the canonical adapter contract.
    - `[x]` **2.4.b Compose `createCommandInputRegistry()` from the kernel**
        - Composed `createCommandInputRegistry()` from the kernel.
    - `[x]` **2.4.c Prove Commander/prompt parity and registry isolation**
        - Proved Commander/prompt parity and registry isolation.

## **Phase 3:** Installation and workspace command migration

_Purpose:_ Migrate installation-time input families as vertical slices while preserving their safe defaults,
cancellation boundaries, and existing configuration semantics.

### `[x]` **3.1 Migrate `init` acquisition and validation as one vertical slice**

- _Goal:_ The `init` adapter resolves one complete validated command input before projecting fresh-install or
  reconfiguration values into the existing domain requests, retaining safe defaults without treating no-input
  execution as consent.

    - `[x]` **3.1.a Define and register the `init` command schema and declaration**
        - Defined and registered the `init` command schema and declaration.
    - `[x]` **3.1.b Unify supplied, prompted, derived, and defaulted init values**
        - Unified supplied, prompted, derived, and defaulted init values.
    - `[x]` **3.1.c Gate installation on complete resolved inputs**
        - Gated installation on complete resolved inputs.
    - `[x]` **3.1.d Prove interactive and no-input init parity**
        - Proved interactive and no-input init parity.

### `[x]` **3.2 Migrate `join` acquisition and validation as one vertical slice**

- _Goal:_ The `join` adapter resolves one validated command input for fresh setup or personal reconfiguration without
  allowing no-input signals to invent an identity or broaden workspace writes.

    - `[x]` **3.2.a Define and register the `join` command schema and declaration**
        - Defined and registered the `join` command schema and declaration.
    - `[x]` **3.2.b Route join acquisition through the shared resolver**
        - Routed join acquisition through the shared resolver.
    - `[x]` **3.2.c Prove join cancellation, parity, and no-input behavior**
        - Proved join cancellation, parity, and no-input behavior.

### `[x]` **3.3 Migrate reconfiguration and removal decisions as one vertical slice**

- _Goal:_ Reconfiguration resolves current-value defaults and removal decisions completely before applying changes,
  with non-interactive execution preserving Configurable and Scaffolded files.

    - `[x]` **3.3.a Define reconfiguration schemas and acquisition policy**
        - Defined reconfiguration schemas and acquisition policy.
    - `[x]` **3.3.b Unify interactive and no-input reconfiguration values**
        - Unified interactive and no-input reconfiguration values.
    - `[x]` **3.3.c Migrate bulk and per-file removal policy**
        - Migrated bulk and per-file removal policy.
    - `[x]` **3.3.d Prove reconfiguration and removal mutation boundaries**
        - Proved reconfiguration and removal mutation boundaries.

## **Phase 4:** Work-unit and lifecycle command migration

_Purpose:_ Apply the substrate to lifecycle inputs without moving transition policy or weakening safety and
containment guards owned by the existing handlers.

### `[x]` **4.1 Migrate `start` courtesy confirmation and safety override behavior**

- _Goal:_ Ordinary resolved starts proceed without prompting in no-input mode, while indeterminate lifecycle evidence
  still requires a distinct interactive affirmative that automation cannot forge or conflate with compatibility flags.

    - `[x]` **4.1.a Define and register the `start` input contract**
        - Defined and registered the `start` input contract.
    - `[x]` **4.1.b Route the resolved-plan courtesy confirmation through acquisition policy**
        - Routed the resolved-plan courtesy confirmation through acquisition policy.
    - `[x]` **4.1.c Keep indeterminate-oracle override interactive-only**
        - Kept indeterminate-oracle override interactive-only.

### `[x]` **4.2 Migrate `stub` and backlog-tier required-input behavior**

- _Goal:_ Stub creation and provisional promotion elicit unresolved commitment data interactively or refuse once with
  exact syntax, while promotion persists acquired Class through the lifecycle owner and both tier directions use the
  shared command-input boundary.

    - `[x]` **4.2.a Define schemas for stub creation and backlog-tier moves**
        - Defined schemas for stub creation and backlog-tier moves.
    - `[x]` **4.2.b Acquire handler-required commitment, priority, and class**
        - Acquired handler-required commitment, priority, and class.
    - `[x]` **4.2.c Prove refusal and atomic persistence boundaries**
        - Proved refusal and atomic persistence boundaries.

### `[x]` **4.3 Migrate required lifecycle and planning-ceremony inputs**

- _Goal:_ Lifecycle and planning verbs receive schema-validated command objects while their existing target resolution,
  state machine, containment, and ceremony side effects remain authoritative.

    - `[x]` **4.3.a Migrate active-lifecycle transition inputs**
        - Migrated active-lifecycle transition inputs.
    - `[x]` **4.3.b Migrate worktree and decomposition lifecycle inputs**
        - Migrated worktree and decomposition lifecycle inputs.
    - `[x]` **4.3.c Migrate planning-ceremony verb inputs**
        - Migrated planning-ceremony verb inputs.
    - `[x]` **4.3.d Prove schema failures cannot cross lifecycle guards**
        - Proved schema failures cannot cross lifecycle guards.

### `[x]` **4.4 Migrate destructive and errand lifecycle authorities**

- _Goal:_ Destructive and errand commands distinguish validated data from explicit authority while preserving their
  impact-plan and containment safeguards.

    - `[x]` **4.4.a Migrate `abandon` protected confirmation**
        - Migrated `abandon` protected confirmation.
    - `[x]` **4.4.b Migrate errand open/link explicit-input contracts**
        - Migrated errand open/link explicit-input contracts.
    - `[x]` **4.4.c Migrate errand promotion, close, and retire inputs**
        - Migrated errand promotion, close, and retire inputs.
    - `[x]` **4.4.d Prove authority and input failures leave errand state unchanged**
        - Proved authority and input failures leave errand state unchanged.

## **Phase 5:** User-state and compound-sync command migration

_Purpose:_ Preserve phase-scoped effects while making overwrite, direction, and notes-push authority explicit across
the user-state and compound synchronization paths.

### `[x]` **5.1 Migrate `user open`, `load`, and `pull` acquisition policy**

- _Goal:_ User workspace commands preserve local data unless their declared policy resolves, while non-destructive
  stale-subdirectory handling remains safe without requiring authority.

    - `[x]` **5.1.a Migrate `user open` stale-subdirectory choice**
        - Migrated `user open` stale-subdirectory choice.
    - `[x]` **5.1.b Migrate `user load` compatibility and `user pull` overwrite confirmation**
        - Migrated `user load` compatibility and `user pull` overwrite confirmation.
    - `[x]` **5.1.c Prove user-workspace mutation boundaries**
        - Proved user-workspace mutation boundaries.

### `[x]` **5.2 Migrate contested `user sync` direction and confirmation policy**

- _Goal:_ Notes synchronization resolves contested direction, overwrite authority, and prompt-policy push authority as
  distinct typed fields so an earlier authorized local save can stand without granting a later remote or destructive
  effect.

    - `[x]` **5.2.a Migrate contested-direction acquisition**
        - Migrated contested-direction acquisition.
    - `[x]` **5.2.b Migrate local-overwrite confirmation**
        - Migrated local-overwrite confirmation.
    - `[x]` **5.2.c Migrate notes-push confirmation**
        - Migrated notes-push confirmation.
    - `[x]` **5.2.d Prove phase-scoped user-sync effects**
        - Proved phase-scoped user-sync effects.

### `[x]` **5.3 Migrate phase-scoped top-level `sync` authority**

- _Goal:_ Compound `sync` uses the shared context across worktree and notes legs while preserving the orchestrator's
  existing partial-success and recovery semantics.

    - `[x]` **5.3.a Replace sync-specific prompt-mode inference**
        - Replaced sync-specific prompt-mode inference.
    - `[x]` **5.3.b Resolve notes-push authority at its existing phase boundary**
        - Resolved notes-push authority at its existing phase boundary.
    - `[x]` **5.3.c Prove compound-sync output and effect compatibility**
        - Proved compound-sync output and effect compatibility.

### `[x]` **5.4 Migrate remaining user inputs and explicit stdin payloads**

- _Goal:_ Every remaining value-bearing user command has a validated object contract, and caller-selected stdin data
  is never confused with prompt capability.

    - `[x]` **5.4.a Migrate remaining user declarations and schema-owned inputs**
        - Migrated remaining user declarations and schema-owned inputs.
    - `[x]` **5.4.b Preserve inbox-title stdin and identity semantics**
        - Preserved inbox-title stdin and identity semantics.
    - `[x]` **5.4.c Prove user command schema and output parity**
        - Proved user command schema and output parity.

## **Phase 6:** Release and external-process command migration

_Purpose:_ Close the trust-sensitive release, pager, editor, and terminal-process boundaries without claiming domain
ownership over opaque passthrough arguments.

### `[x]` **6.1 Migrate release-install idempotency, trust, and evidence inputs**

- _Goal:_ Release installation resolves idempotency action, trust acknowledgment, and workflow evidence as separate
  inputs whose authority cannot substitute for one another.

    - `[x]` **6.1.a Define and register the release-install input contract**
        - Defined and registered the release-install input contract.
    - `[x]` **6.1.b Migrate existing-install action acquisition**
        - Migrated existing-install action acquisition.
    - `[x]` **6.1.c Separate trust confirmation from workflow evidence**
        - Separated trust confirmation from workflow evidence.
    - `[x]` **6.1.d Prove release-install mutation ordering**
        - Proved release-install mutation ordering.

### `[x]` **6.2 Migrate release-uninstall evidence refusal**

- _Goal:_ Release uninstall removes trust markers only after purpose-named cleanup evidence resolves successfully.

    - `[x]` **6.2.a Define and apply the release-uninstall evidence contract**
        - Defined and applied the release-uninstall evidence contract.
    - `[x]` **6.2.b Prove evidence cannot be inferred or substituted**
        - Proved evidence cannot be inferred or substituted.

### `[x]` **6.3 Preserve release Git passthrough while gating editor and stdin behavior**

- _Goal:_ Release wrappers retain the established semantics of opaque Git arguments and exact selected message bytes
  while forbidden interaction blocks implicit editor and terminal reads before spawning Git.

    - `[x]` **6.3.a Declare release commit/push as opaque passthrough paths**
        - Declared release commit/push as opaque passthrough paths.
    - `[x]` **6.3.b Apply interaction policy in commit preflight**
        - Applied interaction policy in commit preflight.
    - `[x]` **6.3.c Apply terminal policy to release Git execution**
        - Applied terminal policy to release Git execution.
    - `[x]` **6.3.d Prove passthrough and interaction compatibility**
        - Proved passthrough and interaction compatibility.

### `[x]` **6.4 Migrate `view` pager and terminal-capable subprocess behavior**

- _Goal:_ Presentation and external-process commands choose terminal interaction only when the resolved context allows
  it, otherwise rendering or failing directly without suspension.

    - `[x]` **6.4.a Migrate `view` input and pager policy**
        - Migrated `view` input and pager policy.
    - `[x]` **6.4.b Apply shared policy to remaining terminal-capable launches**
        - Applied shared policy to remaining terminal-capable launches.
    - `[x]` **6.4.c Prove presenter and subprocess termination**
        - Proved presenter and subprocess termination.

### `[x]` **6.5 Close the remaining release inspection and setup adapters**

- _Goal:_ Every release command that owns typed values or machine-readable behavior participates in the same validated
  release slice rather than falling through to the generic closure phase.

    - `[x]` **6.5.a Migrate release status and read-only setup contracts**
        - Migrated release status and read-only setup contracts.
    - `[x]` **6.5.b Parse release inspection inputs before dependent reads**
        - Parsed release inspection inputs before dependent reads.
    - `[x]` **6.5.c Prove remaining release compatibility and registration**
        - Proved remaining release compatibility and registration.

## **Phase 7:** Command-contract closure and termination proof

_Purpose:_ Reconcile the remaining command surface against the generated oracle and prove exact registration,
behavioral compatibility, and bounded no-input termination across the complete CLI.

### `[x]` **7.1 Migrate remaining value-bearing and machine-readable command adapters**

- _Goal:_ Every inventory-listed canonical path outside the migrated policy families validates its schema-owned values
  and declares machine-readable interaction behavior before invoking its existing handler.

    - `[x]` **7.1.a Freeze and partition the outstanding canonical set**
        - Froze and partitioned the outstanding canonical set.
    - `[x]` **7.1.b Migrate status, config, and extension inspection**
        - Migrated status, config, and extension inspection.
    - `[x]` **7.1.c Migrate active and housekeep inspection**
        - Migrated active and housekeep inspection.
    - `[x]` **7.1.d Migrate base, plan, and recovery inspection**
        - Migrated base, plan, and recovery inspection.
    - `[x]` **7.1.e Migrate check, log, and remaining simple maintenance paths**
        - Migrated check, log, and remaining simple maintenance paths.
    - `[x]` **7.1.f Resolve inventory-identified mixed and alias paths**
        - Resolved inventory-identified mixed and alias paths.
    - `[x]` **7.1.g Prove remaining adapters fail before dependent effects**
        - Proved remaining adapters fail before dependent effects.

### `[x]` **7.2 Prove exact registry membership, aliasing, and opaque-passthrough exclusions**

- _Goal:_ The command-input registry is an exact, reproducible projection of discovered schema-owned syntax plus
  declared semantic fields and constraints.

    - `[x]` **7.2.a Derive the expected command ID set**
        - Completed derive the expected command ID set.
    - `[x]` **7.2.b Assert exact command and complete registry membership**
        - Completed assert exact command and complete registry membership.
    - `[x]` **7.2.c Prove alias sharing and publication isolation**
        - Proved alias sharing and publication isolation.

### `[x]` **7.3 Prove bounded no-input behavior through real subprocess and CLI tests**

- _Goal:_ Real CLI processes demonstrate that every interaction-capable path terminates under automation and preserves
  explicitly selected stdin data without accidental mutation.

    - `[x]` **7.3.a Build a bounded no-input subprocess matrix**
        - Completed build a bounded no-input subprocess matrix.
    - `[x]` **7.3.b Cover explicit stdin and terminal-process exceptions**
        - Covered explicit stdin and terminal-process exceptions.
    - `[x]` **7.3.c Cover authority and compatibility aliases end to end**
        - Covered authority and compatibility aliases end to end.
    - `[x]` **7.3.d Prove mutation boundaries with real command execution**
        - Proved mutation boundaries with real command execution.

### `[x]` **7.4 Close the AST-to-declaration reconciliation and remove bespoke residue**

- _Goal:_ The migrated CLI has no unclassified input or interaction site and no parallel reusable mechanism that can
  drift from the shared contract.

    - `[x]` **7.4.a Run and reconcile the complete inventory**
        - Ran and reconciled the complete inventory.
    - `[x]` **7.4.b Remove superseded reusable prompt and no-input helpers**
        - Removed superseded reusable prompt and no-input helpers.
    - `[x]` **7.4.c Re-run cross-family compatibility and architecture checks**
        - Re-ran cross-family compatibility and architecture checks.

## **Phase 8:** Verification

_Purpose:_ Verify the completed work unit against its design, task record, and project quality gates.

### `[x]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The completed CLI command-input substrate satisfies `spec-cli-command-inputs.md`, preserves its compatibility
  and trust boundaries, and clears every work-unit quality and integration gate.

    - `[x]` **8.1.a Replace synthesized inventory policy with command-owned declarations**
        - Made typed command declarations authoritative for schema fields and every interaction or semantic syntax
          policy; AST discovery now supplies only syntax facts and the exhaustive source-site oracle.
    - `[x]` **8.1.b Complete machine-mode and subprocess interaction propagation**
        - Routed every machine-readable adapter through the shared interaction boundary and bound Git subprocesses to
          the invocation policy across the active, status, recover, base, plan, housekeep, and errand surfaces.
    - `[x]` **8.1.c Strengthen the bounded no-input delivery proof**
        - Split explicit no-input, CI-on-TTY, and non-TTY execution; made timeouts observable, preserved explicit stdin,
          asserted protected worktree stability, and fixed Commander's negated `--no-input` decoding exposed by the test.

- _Quality gates:_ Markdown, TypeScript, and shell lint; source and test typecheck; 7,019 tests; and build all passed.
- _Success criteria:_ All 13 criteria met, including exact inventory reconciliation and bounded no-input termination.

---

## Success Criteria

- `[x]` Every in-scope input, prompt, mode, confirmation, stdin, editor, pager, and terminal-process site has one
  mechanically checked declaration and policy classification.
- `[x]` Semantic command inputs and ambient execution context follow the spec's closed boundary.
- `[x]` Every canonical command path with schema-owned input validates supplied and prompted values through one
  command-owned Zod object schema before dependent effects.
- `[x]` Registry membership exactly matches the derived command set plus the kernel identities, excluding helper and
  opaque-only schemas.
- `[x]` `--no-input`, CI, non-TTY prompt streams, and machine-readable modes terminate without unsolicited interaction
  or inferred affirmative authority.
- `[x]` Missing handler-level inputs are aggregated with exact accepted syntax, and no required value is invented.
- `[x]` Protected confirmations and evidence requirements accept only their declared command-local authority.
- `[x]` Interactive-only safety overrides cannot be authorized by automation signals.
- `[x]` Cancellation, invalid input, unavailable interaction, and successful resolution remain distinct outcomes.
- `[x]` Explicit stdin payloads, output envelopes, lifecycle guards, safe defaults, and phase-scoped sync effects remain
  behaviorally compatible.
- `[x]` The closing inventory reconciliation and bounded subprocess suite prove complete classification and termination.
- `[x]` All quality gates pass (Markdown, TypeScript, and shell linting; `typecheck:all`; full tests; build)
- `[x]` Ready for integration
