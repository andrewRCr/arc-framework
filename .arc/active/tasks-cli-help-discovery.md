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

### `[x]` **2.1 Namespace groups and command-list summaries**

- _Goal:_ Every visible operation can be found through a concise command list, and each busy namespace presents
  its full inventory in the settled task order.

    - `[x]` **2.1.a Five namespace grouping batches**
        - Applied the settled review/user/errand/release/delivery groups and member order, with generated help last.
          Source-derived guards and built-CLI checks prove exact coverage without changing registration order.

    - `[x]` **2.1.b Remaining visible command summaries**
        - Authored summaries for all 184 visible paths, preserving own-page purposes and qualifiers. Shared pages
          show inherited flags, native wrapping, file/stdin contracts, schema pointers, and accurate JSON modes.
          New visible registrations without summaries fail the test guard; hidden registrations are excluded.

### `[x]` **2.2 Remaining workflow examples and descriptions**

- _Goal:_ The initial example set resolves common invocation ambiguities for both audiences while preserving the
  actual command effects, context assumptions, and continuation contracts.

    - `[x]` **2.2.a Work launch and human-facing display examples**
        - Added planned/new and isolated/`--here` start examples, retaining branch, commit, and push effects before
          examples. View examples explain current tasks and an existing work unit's spec for human display.

    - `[x]` **2.2.b Errand and synchronization examples**
        - Added open/next, sync, and user-status examples with existing-title, dry-run, offline, and JSON assumptions.
          Long quoted invocations remain intact, with their explanations placed beneath them when columns are narrow.

    - `[x]` **2.2.c Hosted-request and release examples**
        - Added schema/file hosted-request examples with the emitted-action continuation, and the message-file commit
          example with validation, forwarded arguments, and required approval. Payload validity remains contextual.

### `[x]` **2.3 Validate complete discovery coverage** — validate exit criterion at segment scope

- _Goal:_ The completed presentation exhausts the registered inventory and helps a reader construct the specified
  human and agent invocations without reading implementation source.

- _Outcome:_ The complete discovery exit scenario passed: registered inventory, ordered groups, all ten example
  pages, and representative 80-column output are covered. A fresh help-only reader constructed the specified project,
  current-task, session-init JSON, and review schema/file/stdin invocations without material navigation ambiguity.
  Paths, context assumptions, invocations, and validation witnesses are recorded in `notes-cli-help-discovery.md`
  § Discovery evidence.

## **Phase 3:** Verification

### `[x]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The implementation satisfies the approved help-discovery contract with complete validation evidence and
  is ready for the work unit's integration review.

- _Quality gates:_ Whole-project Markdown/TypeScript/shell lint, both type checks, ARC contracts, 13,283 routine
  tests, and the full ESM/declaration build passed. The unchanged help E2E input retains its 27-test green result.

- _Success criteria:_ All eight met, with none superseded or unresolved. The fresh-context companion returned no
  findings (Pass 1 of 1, converged); complete criterion identities and evidence are in `notes-cli-help-discovery.md`
  § Verification evidence.

---

## Success Criteria

- `[x]` Root and the five grouped namespace outputs match the specified membership/order and exactly cover visible
  registrations, including intentional generated-help placement, with automated guards against omissions.

- `[x]` Bare root and explicit help forms pass built-CLI channel/exit checks outside an ARC project; help invokes no
  operational action or prompt, and registered syntax, hidden visibility, and lazy implementation loading are preserved.

- `[x]` All visible commands have intentional concise summaries and precise own-page purposes; representative output
  demonstrates the specified section order, native wrapping/default annotations, and applicable inherited flags.

- `[x]` All ten initial example pages contain the supported invocations with accurate assumptions, effects, and
  continuation guidance; schema discovery remains available without a duplicated request schema.

- `[x]` Status help correctly covers every local flag, mode exclusivity, refresh defaults, JSON selection, and write
  conditions/effects; review-resolve help correctly covers request/schema exclusivity, file/stdin input, automatic
  JSON, actual-state request facts, and unsupported `--json`.

- `[x]` Tracked discovery evidence records successful help paths and valid invocations for project work, human-facing
  current-task display, session-init JSON, and review schema/file/stdin use without implementation-source consultation.

- `[x]` All quality gates pass.

- `[x]` Ready for integration.

---
