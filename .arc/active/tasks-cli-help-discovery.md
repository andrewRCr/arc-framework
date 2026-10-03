# Task List: CLI Help Discovery

- **Design:** `spec-cli-help-discovery.md`

---

## **Phase 1:** Prove representative help paths

_Purpose:_ Establish the shared presentation through the entry paths and two commands with difficult invocation
contracts before expanding it across the inventory.

_Mode:_ `slice` — closes on root help, bare introduction, status help, and review-resolution help working together.

_Exit criterion:_ The built CLI renders all four representative surfaces with correct syntax, grouping, examples,
inherited options, channels, and exit codes outside an initialized ARC project.

### `[x]` **1.1 Root help and bare introduction**

- _Goal:_ A reader can orient quickly at bare invocation and find every root operation through complete explicit
  help, without triggering operational work.

    - `[x]` **1.1.a Complete grouped root help**
        - Added a shared native-Commander formatter with ordered task groups, concise root summaries, purpose,
          examples, and documentation pointers. Registrations, hidden visibility, and lazy loading are preserved.

    - `[x]` **1.1.b Concise bare introduction and help contexts**
        - Bare invocation shows the shared introduction and help pointers on stderr with exit 1. Explicit root and
          child help retain stdout/exit 0, with inherited options and ordinary parser errors preserved.

### `[x]` **1.2 Status and review-resolution command pages**

- _Goal:_ The two representative multi-mode and structured-request commands explain enough of their contracts
  for a reader to select a valid invocation from help.

    - `[x]` **1.2.a Status page, defaults, and effects**
        - Added examples, ordered option groups, inherited flags, Defaults, and Choose one. Help now states mode
          exclusivity, refresh behavior, explicit JSON selection, and write conditions beside their flags.

    - `[x]` **1.2.b Review-resolution page and schema discovery**
        - Added schema-first file/stdin examples, conditional input guidance, automatic JSON and unsupported-flag
          notes, and parent help. Example columns are independent of native argument/option wrapping.

### `[x]` **1.3 Validate representative discovery** — validate exit criterion at segment scope

- _Goal:_ The pilot demonstrates that shared formatting composes with real CLI parsing, help contexts, and the
  two difficult invocation contracts before the larger metadata sweep.

- _Outcome:_ The representative exit scenario passed through the built CLI outside an initialized project,
  including 80-column root/status/resolve rendering, channels, exit codes, inherited flags, and schema discovery.
  Executed scenarios and source-traced request forms are recorded in `notes-cli-help-discovery.md`.

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
