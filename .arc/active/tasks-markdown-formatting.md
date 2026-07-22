# Task List: Markdown Formatting Hygiene

- **Design:** `spec-markdown-formatting.md`

---

## **Phase 1:** Authority and command substrate

_Purpose:_ Establish one repository-relative selection and routing contract before any formatter, migration, or
gate can act on Markdown content.

_Design decisions:_ Path identity is one pure shared operation. Formatting and linting derive separate policies
from that identity, and worktree/index content loaders never reimplement authority rules.

### `[x]` **1.1 Centralize authoritative Markdown selection and path routing**

- _Goal:_ Every Markdown operation receives one repository-relative authority identity, then derives its own
  deterministic action or refusal before reading or writing content.

- _Outcome:_ Added shared Markdown authority and selection APIs for Git-root resolution, current-install
  package↔instance mapping, source-first routing, config alignment, NUL-safe lint scope enumeration, and
  pre-content containment validation. Root lint now covers both authoritative package and rendered/project Markdown.

### `[x]` **1.2 Define Markdown operation contracts and diagnostics**

- _Goal:_ Formatter and lint entry points compose narrow operation contracts over shared identity and diagnostic
  primitives without landing incomplete public commands or a cross-operation result hierarchy.

- _Outcome:_ Added independent explicit-format, worktree-lint, and staged-lint contracts with operation-specific
  results, stable path-preserving diagnostic aggregation, centralized exact remedies, and `UserFacingError`
  adaptation.

## **Phase 2:** Display-width and table machinery

_Purpose:_ Give every managed and explicit table producer one Unicode width model and content-preserving rewrite
path before aligned-table enforcement begins.

### `[x]` **2.1 Align shared display-width semantics and dependency parity**

- _Goal:_ All table producers measure and pad text with the same Unicode semantics that the pinned linter uses.

- **Additional Context:** `notes-markdown-formatting.md` § Width-Semantics Fixtures

- _Outcome:_ Added shared display-width measurement and padding, aligned the CLI and pinned linter on
  `string-width` 8.1.0, and introduced reusable declared/locked/runtime dependency verification. Worktree lint now
  certifies dependency alignment, and Unicode parity fixtures exercise the same values through aligned `MD060`.

### `[x]` **2.2 Normalize managed meta core tables without changing fields**

- _Goal:_ Lifecycle writes and explicit normalization produce one display-aligned meta core table while preserving
  every byte outside its three managed rows.

- _Outcome:_ Added an exact-span, line-ending-preserving managed-table locator and routed normalization plus all
  core-field setters through one display-width renderer. Structural drift fails loudly, while field values and
  every byte outside the three managed rows remain unchanged.

### `[x]` **2.3 Render status and readiness tables by display width**

- _Goal:_ `STATUS.USER` and project-readiness tables stay source-aligned for wide glyphs without changing row
  ordering or conditional-column behavior.

- _Outcome:_ Moved the shared status/readiness table renderer to Unicode display-width padding without changing
  ASCII goldens, row ordering, dependency rendering, or conditional columns. User-status and derived readiness
  composition now produce aligned-`MD060` tables for CJK, combining-mark, emoji-variation, and ZWJ values.

### `[x]` **2.4 Format explicit GFM tables through validated atomic replacements**

- _Goal:_ An explicit tracked-path command can normalize supported GFM tables by display width without changing
  unrelated bytes or leaving a partial validation pass.

    - `[x]` **2.4.a Transform supported GFM table nodes test-first**
        - Added a byte-oriented GFM transformer using declared micromark/mdast dependencies, display-width
          serialization, backward range splicing, container-prefix validation, syntax-tree equivalence checks, and
          exact outside-range preservation for UTF-8, BOM, line-ending, and final-newline inputs.

    - `[x]` **2.4.b Route and validate complete explicit input sets**
        - Added complete in-memory planning for ordinary, managed-meta, source-only, and installed Framework paths;
          installed Framework sources project through `renderTemplate()` with stored configuration. The independent
          `render:framework` command accepts only installed Framework sources and refuses all other authority classes
          before selected content is read.

    - `[x]` **2.4.c Write validated files atomically and expose `format:tables`**
        - Added injectable, sequential execution over fully validated plans, byte-capable same-directory atomic
          replacement, deterministic partial-failure reporting, and the public `format:tables` command. Real Git
          coverage verifies linked-worktree resolution, validation-before-write, cleanup, no-op runs, and retries.

## **Phase 3:** Aligned-table enforcement and migration

_Purpose:_ Prove table-only normalization mechanically, then enable aligned `MD060` in the same coupled increment
that migrates every selected authority class and regenerates derived output.

_Design decisions:_ The generic formatter never rewrites rendered Framework instances, managed meta tables, or
derived readiness output through the ordinary AST path; each class follows its owning writer.

### `[x]` **3.1 Build the table migration proof audit**

- _Goal:_ Mechanical table passes carry reproducible evidence that all accepted changes are confined to table
  ranges and preserve rendered GFM structure.

- _Outcome:_ Added `audit:tables` with explicit-path or complete-selector input, one pinned `HEAD` baseline, exact Git
  blob loading, shared position-free GFM comparison, complete changed-range evidence, and independent outside-table
  byte verification. Real-Git and focused fixtures cover retries, nested/canonicalized tables, and fail-closed drift.

### `[x]` **3.2 Enable aligned `MD060` with source-first normalization and regeneration**

- _Goal:_ The selected current Markdown corpus reaches one aligned-table baseline without wrong-direction edits,
  unrelated syntax changes, or an interval where the enabled rule cannot pass.

- _Outcome:_ Enabled aligned `MD060` across the shared repository selection and normalized the 16 violating files
  from a 599-file tracked inventory, projecting both installed Framework counterparts from package source. The
  migration is table-range-only and idempotent; managed meta values now remain byte-faithful, and `ROADMAP` was
  regenerated through its display-width-aware renderer.

## **Phase 4:** Emphasis enforcement and migration

_Purpose:_ Add delimiter-specific semantic proof before enabling deterministic emphasis rules and normalizing the
authority-selected corpus without mixing the pass with table churn.

### `[x]` **4.1 Build the emphasis migration proof audit**

- _Goal:_ The emphasis pass can prove that its raw diff changes only permitted delimiter bytes while preserving
  the complete position-free GFM tree.

- _Outcome:_ `audit:emphasis` now shares the exact-commit migration loader, proves full position-free GFM equality,
  and restricts raw changes to parser-identified underscore-italic and asterisk-strong delimiter bytes. Integration
  coverage reproduces the evidence from Git and proves the pinned fixer is idempotent.

### `[x]` **4.2 Enable `MD049` and `MD050` with source-first emphasis normalization**

- _Goal:_ Every selected current file satisfies pinned underscore-style `MD049` and asterisk-style `MD050`, including
  the linter-required asterisk exception for intraword emphasis, with syntax and non-emphasis bytes proven unchanged.

- _Outcome:_ The pinned fixer migrated 4,324 delimiters across 180 files through source-first Framework projection
  and independent authority copies; `MD049` and `MD050` now enforce the result. The exact-commit audit proved full
  GFM equivalence and delimiter-only bytes, including an explicitly authorized four-delimiter backlog-meta exception,
  while local harness copies were refreshed from the same canonical style.

## **Phase 5:** Task descriptor contract and validation

_Purpose:_ Ship the semantic descriptor-cluster convention through authoritative framework content, enforce it
with one pure repository rule, and migrate the selected current task surface.

_Design decisions:_ Loose spacing is semantic ARC guidance, but the validator and its command wiring remain
repository-only. Singular `_Note:_` is the sole peer descriptor spelling.

### `[x]` **5.1 Author the canonical task descriptor-cluster contract**

- _Goal:_ Generated and hand-maintained ARC task lists communicate one loose-spacing rule for wrapped root
  descriptors while accepting both tight and loose one-line clusters.

- _Outcome:_ Canonical strategy, workflow, and template guidance now agree on wrapped-cluster spacing and singular
  `_Note:_`; fresh initialization installs the registered task template with both framework links resolving.

### `[x]` **5.2 Implement descriptor validation and focused fixtures**

- _Goal:_ A pure repository rule detects only malformed documented root descriptor clusters and leaves unrelated
  Markdown grammar outside its authority.

    - `[x]` **5.2.a Share a fence-aware task-list structural scanner**
        - Extracted canonical task grammar into stable phase, parent, subtask, section, fence, and content events;
          cursor analysis and region extraction now ignore backtick- and tilde-fenced task examples.

    - `[x]` **5.2.b Validate documented root descriptor clusters**
        - Added a pure scanner-event validator with path-, parent-, and descriptor-pair diagnostics; focused
          fixtures cover every supported label, loose one-line clusters, completion and operational boundaries,
          fenced examples, the canonical template, and the current work-unit task list.

### `[x]` **5.3 Compose descriptor validation into worktree lint and normalize live tasks**

- _Goal:_ CI's existing Markdown command enforces descriptor spacing over selected worktree content using the same
  selector and pure validator that staged enforcement will consume.

- _Outcome:_ The public command now validates config/selector parity, runs markdownlint over 599 explicit tracked
  paths, then checks 82 selected task/fixture paths; the live descriptor migration audited as a no-op because the
  selected baseline, including this work unit, was already canonical.

## **Phase 6:** Exact-index enforcement and discoverability

_Purpose:_ Certify the candidate Git index under its indexed configuration, integrate the check into the
project-only Husky chain, and leave every failure surface pointing to the same explicit remedy.

_Design decisions:_ The staged gate is check-only and reads a complete indexed snapshot once. Its NUL-safe trigger
check stops irrelevant runs before corpus loading, and neither lint engine may substitute worktree bytes after it
fires.

### `[x]` **6.1 Implement the exact-index Markdown runner test-first**

- _Goal:_ One staged command certifies selected indexed Markdown with the indexed configuration cascade through
  standard markdownlint and the shared descriptor rule.

    - `[x]` **6.1.a Load one complete indexed Markdown snapshot**
        - Added a deterministic repository-relative content map that NUL-safely enumerates the selected index,
          reads each blob once through the injected exact-index primitive, decodes fatal UTF-8, and refuses missing
          blobs. Real repositories cover divergent worktree bytes, deletion, rename, unusual names, and linked
          worktree indexes.

    - `[x]` **6.1.b Resolve the indexed Markdown configuration cascade**
        - Added exact-index discovery and one-read loading for every recognized configuration name, with fatal
          parsing and fail-closed handling for unsupported formats or executable options. Root selector parity and
          nested rule-only boundaries are enforced before deterministic ancestor inheritance groups the selected
          Markdown paths, including staged `docs/` overrides.

    - `[x]` **6.1.c Certify the indexed snapshot through both lint engines**
        - Added in-process dependency alignment, effective-group `markdownlint/promise` execution, and descriptor
          validation over the shared indexed content map. Stable diagnostics carry explicit table remedies, and
          divergent worktree content cannot change either passing or failing candidate results.

- _Outcome:_ The staged entry point now certifies one complete candidate from indexed dependencies, configuration,
  and Markdown bytes without importing CLI internals or consulting the worktree after repository-root resolution.

### `[x]` **6.2 Wire relevant-change gating into the project pre-commit chain**

- _Goal:_ Relevant staged Markdown or checker changes trigger exact-index certification before existing
  package-sync and TypeScript checks, while unrelated commits pay no Markdown-gate cost.

- _Outcome:_ `lint:md:staged` now exits after NUL-safe changed-path detection for unrelated candidates and otherwise
  certifies the full index before package-sync and TypeScript checks. Central trigger ownership covers selected
  Markdown, recognized configs, dependencies, fixtures, and checker code; executing checker bytes must match the
  index, and real Git tests cover rename, deletion, partial staging, unusual names, and linked worktrees.

### `[ ]` **6.3 Reconcile formatting remedies and command discoverability**

- _Goal:_ Contributors encounter one width-aware table remedy at reference and failure surfaces, with no stale
  third-party formatter guidance or duplicate policy.

    - Replace the interim table-tool guidance only in the project-instance `.arc/system/rules/DEV-RULES.PROJECT.md`
      and `.arc/reference/QUICK-REFERENCE.md` through targeted Configurable edits that preserve overrides; keep the
      generic package templates unchanged.
    - Align lint, formatter, authority-refusal, and staged-gate diagnostics on
      `npm run format:tables -- <path>`; keep semantic details in the implementation rather than duplicating them
      across reference docs.
    - Search the selected current surface for stale `markdown-table-formatter` and
      `markdown-table-prettify` remedies, preserving historical/excluded references.
    - Run framework-sync and package-neutrality checks, verify root script discoverability, and reconcile the final
      selected-scope inventory.

### `[ ]` **6.4 Keep copied harness projections inside their worktree**

- _Goal:_ A linked worktree's registered harness directories cannot redirect normalization or other writes into the
  primary checkout through copied symlinks.

    - Preserve relative symbolic-link targets when copying registered harness directories from the primary checkout,
      so canonical skill links resolve through the destination worktree's own `.arc/` tree.
    - Build `test-first` with a real filesystem copy proving a source-relative skill link remains relative and resolves
      inside the destination worktree; retain existing behavior for ordinary directories and files.
    - Audit Markdown normalization and projection entry points for primary-worktree or escaping-realpath resolution,
      and repair this worktree's affected local harness links without committing generated harness state.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Selected package and project Markdown passes explicit underscore `MD049`, asterisk `MD050`, and aligned
  `MD060` rules.
- `[ ]` The explicit-path table formatter rejects unsafe input, validates all selected paths before writing,
  replaces each file atomically, reports partial operating-system failures precisely, and is idempotent.
- `[ ]` Formatter input rejects every symbolic-link component and malformed UTF-8 before content mutation, while
  preserving BOM and non-ASCII bytes outside table ranges exactly.
- `[ ]` Package sources outside the evaluated current install format source-only; current installed Framework
  sources project to existing `.arc/` outputs despite stale missing per-file manifest entries, while rendered
  inputs, missing outputs, and contradictory relationships refuse safely.
- `[ ]` The formatter, meta renderer, and status/readiness renderer share display-width behavior that matches the
  exact `string-width` version resolved by `MD060` across ASCII and wide-glyph fixtures.
- `[ ]` Top-level and nested GFM tables preserve position-free syntax-tree content and ancestor structure, while
  inconsistent container prefixes fail before any selected file is written.
- `[ ]` Meta normalization changes only the three core-table rows and preserves all content outside that span.
- `[ ]` Fully derived readiness output is regenerated by its renderer and refused by the generic formatter.
- `[ ]` Emphasis normalization preserves position-free GFM syntax trees and changes only emphasis delimiter bytes.
- `[ ]` Multi-line root descriptor clusters are loose across authoritative guidance, templates, and selected live
  task lists; one-line clusters may be tight or loose.
- `[ ]` Task guidance and validation use singular `_Note:_` as the only peer descriptor spelling.
- `[ ]` Fresh initialization installs the canonical task template linked by generate-tasks, and its targeted
  self-host manifest registration is valid; the template's rendered workflow and strategy links resolve.
- `[ ]` Worktree and staged Markdown commands share one selector, selection-config alignment check, and descriptor
  validator while retaining operation-specific content, configuration, and lint adapters.
- `[ ]` Root Markdown path-selection options remain structurally aligned with the shared selector in worktree and
  staged views; nested or config-only path-selection drift fails closed.
- `[ ]` The project pre-commit gate certifies exact indexed Markdown under the indexed root and nested
  configuration cascade, skips irrelevant commits, remains check-only, and passes inverse partial-staging and
  linked-worktree cases.
- `[ ]` Every configuration filename recognized by pinned `markdownlint-cli2` triggers staged certification;
  unsupported formats fail closed instead of being ignored or evaluated.
- `[ ]` Dependency-only changes trigger indexed lint/width alignment, and the gate rejects candidate metadata that
  does not match the installed `markdownlint` and `string-width` versions.
- `[ ]` Package/project synchronization remains valid, derived output is regenerated, and excluded completed,
  temporary, and private-user surfaces remain untouched by default migrations.
- `[ ]` Project-instance documentation and gate diagnostics agree on `npm run format:tables -- <path>` and contain
  no stale third-party table-formatter remedy.
- `[ ]` All quality gates pass (tests, linting, type checking, shell checks, and build).
- `[ ]` Ready for integration.
