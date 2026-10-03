# Task List: CLI Help Discovery

- **Design:** `spec-cli-help-discovery.md`

---

## **Phase 1:** Prove representative help paths

_Purpose:_ Establish the shared presentation through the entry paths and two commands with difficult invocation
contracts before expanding it across the inventory.

_Mode:_ `slice` — closes on root help, bare introduction, status help, and review-resolution help working together.

_Exit criterion:_ The built CLI renders all four representative surfaces with correct syntax, grouping, examples,
inherited options, channels, and exit codes outside an initialized ARC project.

### `[ ]` **1.1 Root help and bare introduction**

- _Goal:_ A reader can orient quickly at bare invocation and find every root operation through complete explicit
  help, without triggering operational work.

- _Context:_ `spec-cli-help-discovery.md` § Entry help and root navigation; § Command pages and summaries.

- _Note:_ See `notes-cli-help-discovery.md` § Root help and § Bare invocation for the representative renderings.

- _Note:_ `Command.copyInheritedSettings` copies help configuration when children are created; install shared
  configuration before child registrations to preserve inheritance and registration order.

    - Add a cohesive presentation helper under `packages/arc-framework/src/lib/` (new module) and wire it into
      `program` in `packages/arc-framework/src/cli.ts`. Keep command registrations in place and implementation
      modules lazy, as checked by `cli-loading-boundary.test.ts`.
    - Reuse `Command.summary`, `Command.helpGroup`, and native `Help` formatting/visibility helpers. Keep syntax,
      option defaults, and command routing owned by the registered tree.

    - `[ ]` **1.1.a Complete grouped root help**
        - Build `test-first` (one behavior at a time):
            - Explicit `-h`, `--help`, and `arc help` show the orchestration purpose, three examples, existing
              options, all six task groups in the chosen order, final Help placement, and documentation pointers.
            - Every visible root command appears once with a concise summary; hidden entries stay hidden, and
              command terms still come from Commander registrations.
            - Rendering at 80 columns preserves syntax and meaningful qualifiers through native wrapping.
        - Use focused helper tests plus built-CLI assertions through `runCli` to prove the helper is wired into
          the real entry point; avoid whole-output snapshots that make harmless wrapping changes brittle.

    - `[ ]` **1.1.b Concise bare introduction and help contexts**
        - Build `test-first` (one behavior at a time):
            - True bare root invocation reuses the purpose, examples, and global options, displays help pointers,
              and omits the command inventory with stderr/exit 1.
            - Explicit root help retains complete stdout/exit-0 output; child help and ordinary parser errors keep
              their existing help behavior.
            - Help paths work outside an initialized project and reach no operational action hooks or prompts.
        - Preserve `Command._parseCommand` / `Command.help` semantics; use presentation hooks rather than install
          a root operational action to produce the introduction.

### `[ ]` **1.2 Status and review-resolution command pages**

- _Goal:_ The two representative multi-mode and structured-request commands explain enough of their contracts
  for a reader to select a valid invocation from help.

- _Context:_ `spec-cli-help-discovery.md` § Representative contracts; § Command pages and summaries.

- _Note:_ See `notes-cli-help-discovery.md` § Status command help and § Review resolution help.

    - `[ ]` **1.2.a Status page, defaults, and effects**
        - Apply the specified section order, three examples, local-option groups, inherited flags, Defaults, and
          Choose one sections through the presentation helper and `program` metadata.
        - Describe the modes, refresh defaults, JSON selection, and write requirements established by `handleStatus`
          and `StatusCommandInputSchema`; retain every existing local flag and positional argument.
        - Extend built-CLI help assertions in `run-cli.e2e.test.ts` to check those contracts and group order. This
          presentation metadata can use tests after the edit; existing operation behavior is preserved.

    - `[ ]` **1.2.b Review-resolution page and schema discovery**
        - Place schema discovery before file/stdin examples; retain the current Usage, conditional input description,
          applicable inherited flags, Input and output notes, and parent-help pointer.
        - Reflect `handleReviewResolve`, `handleReviewRequestSchema`, `reviewDiscoverableCommandInputSchema`, and
          `rejectUnsupportedReviewJson`: schema versus request exclusivity, automatic JSON, and unsupported `--json`.
        - Check rendered help after the presentation edit and probe existing `--schema` output without request
          execution. Cover file/stdin example syntax using existing fixtures or source tracing; do not create a
          handwritten request-schema copy or fabricate review-authority fields.

### `[ ]` **1.3 Validate representative discovery** — validate exit criterion at segment scope

- _Goal:_ The pilot demonstrates that shared formatting composes with real CLI parsing, help contexts, and the
  two difficult invocation contracts before the larger metadata sweep.

- _Context:_ `spec-cli-help-discovery.md` § Entry help and root navigation; § Representative contracts.

    - Exercise bare root, all explicit root-help forms, status help, and review-resolve help through the built CLI in
      an empty temporary directory. Inspect the root/status/resolve rendering at 80 columns.
    - Confirm the expected channels and exit codes, group/section order, exact terms, representative examples, and
      inherited options. Check the existing lazy-loading boundary and applicable focused quality gates.
    - Record the executed scenarios and results against the phase exit criterion. Route any corrective work to the
      producing task rather than turn this verification task into an implementation task.

## **Phase 2:** Complete command discovery coverage

_Purpose:_ Apply the proven presentation to the full visible tree, the five busy namespaces, and the remaining
example pages, then demonstrate complete discovery coverage.

_Mode:_ `replication` — closes on the visible command tree and initial example set being exhausted and batch-verified.

_Exit criterion:_ Every visible command has a concise summary; root and namespace groups cover the registered
inventory exactly; all ten example pages and the human/agent discovery exercises pass.

### `[ ]` **2.1 Namespace groups and command-list summaries**

- _Goal:_ Every visible operation can be found through a concise command list, and each busy namespace presents
  its full inventory in the settled task order.

- _Context:_ `spec-cli-help-discovery.md` § Namespace navigation; § Command pages and summaries.

    - `scanCommanderSource` in `src/lib/command-input/source-scanner.ts` currently discovers 185 registrations,
      including 184 visible commands and 47 visible root commands. Reuse this existing discovery in coverage tests
      where useful; it is not a new runtime registry or a replacement grammar.

    - `[ ]` **2.1.a Five namespace grouping batches**
        - Build `test-first` (one behavior at a time):
            - `review`, `user`, `errand`, `release`, and `delivery` show their specified headings, membership, and
              display order, including final generated-help placement.
            - Root and these namespace lists cover their applicable children exactly once; an omitted assignment
              is detected when the registered set changes.
        - Apply each grouping batch through the proven presentation hooks. Keep registration/routing order
          unchanged; other small namespaces retain their single Commands group. Derive coverage from the live tree
          or existing source discovery and check the rendered CLI output.

    - `[ ]` **2.1.b Remaining visible command summaries**
        - Build `test-first` (one behavior at a time):
            - Every remaining visible path has an intentional nonempty list summary; hidden paths are excluded,
              and a new visible registration without a summary fails the coverage guard.
            - Deep namespace lists retain precise own-page purposes and meaningful qualifiers, with inherited
              flags and existing hidden visibility preserved.
        - Author concise, verb-first summaries for the remaining paths, grouping test and content edits into
          repeatable command-family batches. Keep the guard in tests, without adding a startup refusal.
        - Extend the shared page convention and applicable inherited-option display across the visible tree.
          Derive command terms and option annotations from Commander rather than repeat their syntax in metadata.
        - Inspect representative deep namespace help and long command terms after the edit; preserve schema and
          continuation pointers already registered on those pages.

### `[ ]` **2.2 Remaining workflow examples and descriptions**

- _Goal:_ The initial example set resolves common invocation ambiguities for both audiences while preserving the
  actual command effects, context assumptions, and continuation contracts.

- _Context:_ `spec-cli-help-discovery.md` § Initial example coverage; § Command pages and summaries.

    - These are presentation/content batches; add targeted assertions after each edit. Preserve the status and
      review-resolve examples delivered in Phase 1, and avoid duplicate tutorials on namespace overview pages.

    - `[ ]` **2.2.a Work launch and human-facing display examples**
        - Add the listed `start` and `view` examples. Explain planned versus fresh targets, isolated checkout versus
          `--here`, and the human-facing artifact display.
        - Retain `program`'s start branch/commit/push effects in the purpose before examples; verify every displayed
          spelling against registrations without executing start ceremonies.

    - `[ ]` **2.2.b Errand and synchronization examples**
        - Add the listed `errand open`, `errand next`, `sync`, and `user status` examples with their existing-title,
          dry-run, offline, and JSON assumptions described accurately.
        - Verify their actual flags and purpose from `program` and scoped help. Trace mutating examples or use
          disposable fixtures; no example invocation should alter the development checkout or its user notes.

    - `[ ]` **2.2.c Hosted-request and release examples**
        - Add schema and file examples to `review hosted request`, preserving its existing instruction to submit
          the emitted action unchanged to `arc review hosted await -`.
        - Add `arc release commit -F message.txt`, explaining the valid-message-file assumption while retaining
          existing forwarded Git arguments, validation, and approval requirements.
        - Keep request/message payloads as valid contextual inputs rather than fabricated help content; schema
          structure remains discoverable through the registered schema command.

### `[ ]` **2.3 Validate complete discovery coverage** — validate exit criterion at segment scope

- _Goal:_ The completed presentation exhausts the registered inventory and helps a reader construct the specified
  human and agent invocations without reading implementation source.

- _Context:_ `spec-cli-help-discovery.md` § Success Criteria; § Initial example coverage.

    - Run the coverage guards and focused built-CLI help suite over the completed root, namespaces, representative
      pages, and all ten example pages. Inspect representative 80-column output, including long syntax.
    - Start from root help and record help paths and valid resulting invocations for project inspection, current-task
      display, session-init JSON, and review schema/file/stdin use, with valid contextual inputs supplied.
    - Save discovery evidence in `notes-cli-help-discovery.md` § Discovery evidence so terminal verification can
      assess it. Discovery exercises need not execute mutating operations to demonstrate a valid invocation.
    - Record the phase exit result, including any remaining usability gap, and run the applicable quality checkpoint.
      Route corrections to the producing tasks; retain the spec's presentation-only scope.

## **Phase 3:** Verification

### `[ ]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The implementation satisfies the approved help-discovery contract with complete validation evidence and
  is ready for the work unit's integration review.

---

## Success Criteria

- `[ ]` Root and the five grouped namespace outputs match the specified membership/order and exactly cover visible
  registrations, including intentional generated-help placement, with automated guards against omissions.

- `[ ]` Bare root and explicit help forms pass built-CLI channel/exit checks outside an ARC project; help invokes no
  operational action or prompt, and registered syntax, hidden visibility, and lazy implementation loading are preserved.

- `[ ]` All visible commands have intentional concise summaries and precise own-page purposes; representative output
  demonstrates the specified section order, native wrapping/default annotations, and applicable inherited flags.

- `[ ]` All ten initial example pages contain the supported invocations with accurate assumptions, effects, and
  continuation guidance; schema discovery remains available without a duplicated request schema.

- `[ ]` Status help correctly covers every local flag, mode exclusivity, refresh defaults, JSON selection, and write
  conditions/effects; review-resolve help correctly covers request/schema exclusivity, file/stdin input, automatic
  JSON, actual-state request facts, and unsupported `--json`.

- `[ ]` Tracked discovery evidence records successful help paths and valid invocations for project work, human-facing
  current-task display, session-init JSON, and review schema/file/stdin use without implementation-source consultation.

- `[ ]` All quality gates pass.

- `[ ]` Ready for integration.

---
