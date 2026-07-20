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

### `[ ]` **2.1 Align shared display-width semantics and dependency parity**

- _Goal:_ All table producers measure and pad text with the same Unicode semantics that the pinned linter uses.

- **Additional Context:** `notes-markdown-formatting.md` § Width-Semantics Fixtures

    - Add `displayWidth(value)` and `padToDisplayWidth(value, width)` as a small CLI-library primitive; padding
      appends ASCII spaces and never truncates.
    - Pin the CLI's direct `string-width` dependency to the exact version resolved by pinned `markdownlint`;
      promote that exact `markdownlint` version to a direct root development dependency before parity tests or
      the later staged runner import its API.
    - Expose one loader-independent dependency-alignment check over the root and package manifests, lockfile
      resolutions, and actually imported versions; use it for both worktree verification and the later staged gate,
      then back the metadata assertion with aligned-`MD060` behavioral fixtures.
    - Consolidate `view-renderer.ts` on the primitive only where it removes duplicate width semantics without
      coupling table code to pager behavior.
    - Build `test-first` (one behavior at a time):
        - ASCII, CJK, combining marks, emoji variation selectors, and ZWJ sequences measure and pad correctly.
        - The known keycap and spacing-mark version differences run through both the primitive and aligned `MD060`.
        - Requests narrower than the input width leave content unchanged.

### `[ ]` **2.2 Normalize managed meta core tables without changing fields**

- _Goal:_ Lifecycle writes and explicit normalization produce one display-aligned meta core table while preserving
  every byte outside its three managed rows.

    - Factor one exact-span core-table locator that records source offsets and original line-ending spelling,
      requires exactly one recognized five-column table before managed bullets, and fails on absent, malformed,
      duplicated, or unrecognized core-table shapes.
    - Expose `normalizeMetaCoreTable(content)` through that locator and the existing core-table renderer rather than
      building a second meta formatter.
    - Route existing core-field setters through the same display-width-aware locator and renderer so field changes,
      no-field normalization, duplicate detection, and line-ending preservation cannot drift.
    - Build `test-first` (one behavior at a time):
        - A valid core table re-renders its header, delimiter, and value rows without changing any field value.
        - Missing, malformed, duplicated, and unrecognized core tables fail loudly.
        - A normalized input is byte-identical.
        - H1 text, bullets, continuations, ordering, narrative sections, line endings, and final-newline state remain
          byte-identical outside the three-row span.
        - Wide glyphs in every permitted core-value class align under display width.

### `[ ]` **2.3 Render status and readiness tables by display width**

- _Goal:_ `STATUS.USER` and project-readiness tables stay source-aligned for wide glyphs without changing row
  ordering or conditional-column behavior.

    - Move the shared status table formatter from code-unit length and `padEnd` to the display-width primitive.
    - Preserve current golden ordering, dependency rendering, and optional `Priority` column behavior.
    - Build `test-first` (one behavior at a time):
        - Existing ASCII golden output remains stable.
        - CJK, combining-mark, emoji-variation, and ZWJ rows align and pass aligned `MD060`.
        - Readiness composition continues to own derived output; no generic formatter write path is introduced.

### `[ ]` **2.4 Format explicit GFM tables through validated atomic replacements**

- _Goal:_ An explicit tracked-path command can normalize supported GFM tables by display width without changing
  unrelated bytes or leaving a partial validation pass.

    - `[ ]` **2.4.a Transform supported GFM table nodes test-first**
        - Declare `mdast-util-from-markdown`, `mdast-util-to-markdown`, `mdast-util-gfm-table`, and
          `micromark-extension-gfm-table` as direct package development dependencies; never import the copies
          currently present only through `markdownlint`.
        - Load input as bytes and decode with `TextDecoder("utf-8", { fatal: true, ignoreBOM: true })` so malformed
          input refuses and an initial BOM remains representable through re-encoding.
        - Build `test-first` (one behavior at a time):
            - Complete documents parse through declared micromark/mdast GFM dependencies, table source ranges
              serialize with `gfmTableToMarkdown({ stringLength: displayWidth })`, and replacements splice backward.
            - Top-level tables preserve escaped-pipe, code-span, and emphasis semantics; accepted delimiter
              canonicalization remains reported inside serializer-owned ranges, while CRLF and final-newline state
              remain byte-identical outside those ranges.
            - Ordered/unordered-list and block-quote tables recover one consistent container prefix; an inconsistent
              or unrecoverable prefix fails with path-and-line context.
            - Reparsed candidates retain position-free GFM syntax trees, ancestor structure, and byte equality
              outside original table ranges.
            - Malformed UTF-8 fails before parsing; BOMs and non-ASCII bytes outside table ranges survive exact
              re-encoding.

    - `[ ]` **2.4.b Route and validate complete explicit input sets**
        - For a package Framework source mapped by the evaluated current-install recipe to an existing Framework
          output, project the transformed in-memory source through `renderTemplate()` with stored install
          configuration and include its rendered `.arc` counterpart in the same validation and write plan. Format
          a package source with no current installed output source-only.
        - Expose the projection independently as
          `npm run render:framework -- <package-source> [<package-source> ...]` for later non-table source edits;
          restrict it to explicit installed Framework sources and leave manifest, pristine, skills, harness state,
          and Configurable files untouched.
        - Build `test-first` (one behavior at a time):
            - One or more explicit tracked Markdown paths resolve from the Git top level; empty input, directories,
              unsafe paths, any symbolic-link component, non-Markdown files, untracked files, and unmatched
              selections fail before content reads or writes.
            - Ordinary selected files route to table transformation, managed meta files to
              `normalizeMetaCoreTable`, rendered Framework instances refuse with their package-source remedy, and
              readiness output routes to its renderer command; rendered bytes never become package-source input.
            - Framework projection preserves stored-install token and conditional output while refusing
              Configurable, Scaffolded, project-owned, missing-output, contradictory, and source-only paths.
            - Recipe-mapped Framework outputs remain projectable across a stale missing per-file manifest entry;
              package sources outside the evaluated current install format source-only.
            - Every selected result computes before the first filesystem mutation and reports every changed table
              range.

    - `[ ]` **2.4.c Write validated files atomically and expose `format:tables`**
        - Wire `npm run format:tables -- <path> [<path> ...]` as the only public repository table remedy.
        - Reuse `atomicWriteFile()` for same-directory temporary replacement and inject the per-file writer at the
          multi-file orchestration boundary so partial operating-system failures are deterministic to test.
        - Build `test-first` (one behavior at a time):
            - Changed files replace through same-directory temporary files plus rename, with temporary residue
              cleaned after validation or write failure.
            - A later operating-system write failure reports successful paths, the failed path, and untouched
              remainder; idempotence makes explicit retry safe.
            - Multi-file validation-before-write, linked-worktree invocation, no-op runs, and idempotent retries
              preserve the operation contract.

## **Phase 3:** Aligned-table enforcement and migration

_Purpose:_ Prove table-only normalization mechanically, then enable aligned `MD060` in the same coupled increment
that migrates every selected authority class and regenerates derived output.

_Design decisions:_ The generic formatter never rewrites rendered Framework instances, managed meta tables, or
derived readiness output through the ordinary AST path; each class follows its owning writer.

### `[ ]` **3.1 Build the table migration proof audit**

- _Goal:_ Mechanical table passes carry reproducible evidence that all accepted changes are confined to table
  ranges and preserve rendered GFM structure.

    - Accept explicit tracked paths or the selector's emitted path list, resolve `HEAD` to one commit OID at audit
      start, and load every immutable baseline through `readGitBlobBytes()` against that OID.
    - Reuse the table transform's range reporting and position-free tree comparison while independently verifying
      bytes outside original table ranges.
    - Fail on untracked or unreadable baselines, missing range evidence, structural drift, or an unreported changed
      table.
    - Build `test-first` (one behavior at a time):
        - No-op, multiple-table, nested-table, and serializer-canonicalization fixtures pass with complete evidence.
        - Outside-range tampering, missing reports, and structural drift fail.
        - A settled migration reruns idempotently against its baseline.

### `[ ]` **3.2 Enable aligned `MD060` with source-first normalization and regeneration**

- _Goal:_ The selected current Markdown corpus reaches one aligned-table baseline without wrong-direction edits,
  unrelated syntax changes, or an interval where the enabled rule cannot pass.

- _Note:_ Treat rule enablement, normalization, and regeneration as one review increment.

    - Recompute the selected path inventory and migration counts before mutation; retain the result as review
      evidence rather than a permanent assertion.
    - Format authoritative package source first, then update recipe-mapped installed Framework instances through
      the selected projection while leaving package sources outside the current install source-only; edit
      Configurable copies independently and preserve project overrides.
    - Normalize managed meta tables through their public normalizer and regenerate tracked readiness output only
      after its renderer is display-width-aware.
    - Set `MD060` to `aligned`, expand the root lint scope to both authoritative package and rendered/project
      Markdown by updating the shared selector and its root-config declaration together, and preserve the
      deliberate completed/private/temporary exclusions.
    - Run the table migration audit over formatter-controlled Markdown, normalized meta tables, and projected
      Framework counterparts; inspect every reported serializer canonicalization and prove idempotence.
    - Verify readiness output through its renderer/regeneration assertion, review non-Markdown configuration and
      lockfile changes separately, and leave `npm run -s lint:md` green in the same increment.

## **Phase 4:** Emphasis enforcement and migration

_Purpose:_ Add delimiter-specific semantic proof before enabling deterministic emphasis rules and normalizing the
authority-selected corpus without mixing the pass with table churn.

### `[ ]` **4.1 Build the emphasis migration proof audit**

- _Goal:_ The emphasis pass can prove that its raw diff changes only permitted delimiter bytes while preserving
  the complete position-free GFM tree.

    - Declare `micromark-extension-gfm` and `mdast-util-gfm` as direct package development dependencies so the
      proof parses complete GFM rather than the table-only syntax configured by the formatter.
    - Reuse the table audit's exact-commit baseline loader for explicit authority-selected paths, parse both
      documents as full GFM, strip position metadata, and require structural equality.
    - Validate raw diff hunks as underscore-italic and asterisk-strong delimiter substitutions only; reject changes
      to text, code spans, links, HTML, task markers, line endings, or unrelated whitespace.
    - Build `test-first` (one behavior at a time):
        - Nested emphasis and escaped-marker fixtures permit only the selected delimiter substitutions.
        - Code, links, HTML, task markers, text, line endings, and unrelated whitespace remain byte-stable.
        - Forbidden drift and untracked baselines fail; repeated audits reproduce the same evidence, while rerunning
          the pinned fixer over migrated input produces no changes.

### `[ ]` **4.2 Enable `MD049` and `MD050` with source-first emphasis normalization**

- _Goal:_ Every selected current file satisfies pinned underscore-style `MD049` and asterisk-style `MD050`, including
  the linter-required asterisk exception for intraword emphasis, with syntax and non-emphasis bytes proven unchanged.

- _Note:_ Treat rule enablement, normalization, and selected Framework projection as one review increment.

    - Recompute the selected emphasis inventory before mutation and keep table normalization out of this pass.
    - Invoke the pinned markdownlint fixer only over explicit selector-emitted batches: authoritative package source
      first, then update recipe-mapped installed Framework instances through the selected projection, then migrate
      Configurable, Scaffolded, and project-owned copies independently; sources outside the current install remain
      source-only, and the fixer never runs root-wide across rendered Framework instances.
    - Set `MD049` to `underscore` and `MD050` to `asterisk` in the same increment as the corpus changes.
    - Run the emphasis audit across migrated Markdown paths, inspect the raw diff, prove fixer idempotence, review
      dependency, configuration, and implementation changes separately, and leave the full Markdown lint baseline
      green.

## **Phase 5:** Task descriptor contract and validation

_Purpose:_ Ship the semantic descriptor-cluster convention through authoritative framework content, enforce it
with one pure repository rule, and migrate the selected current task surface.

_Design decisions:_ Loose spacing is semantic ARC guidance, but the validator and its command wiring remain
repository-only. Singular `_Note:_` is the sole peer descriptor spelling.

### `[ ]` **5.1 Author the canonical task descriptor-cluster contract**

- _Goal:_ Generated and hand-maintained ARC task lists communicate one loose-spacing rule for wrapped root
  descriptors while accepting both tight and loose one-line clusters.

- **Additional Context:** `strategy-workflow-authoring.md` § Prose economy and
  `notes-markdown-formatting.md` § Migration Review Cautions

    - Update the package-source task-list strategy, task template, and generate-tasks template together.
    - Register the task template in `init-recipe.json` and the current self-host manifest through the existing
      `buildManifestFiles()` entry/hash machinery; prove a fresh initialization installs the workflow's linked
      template without expanding into general recipe/manifest inventory reconciliation.
    - Correct the template's relative links to the installed generate-tasks workflow and task-list strategy, and
      prove both targets resolve in the rendered fresh-init fixture.
    - Define the root cluster as `_Goal:_`, documented peer descriptors, and optional
      `**Additional Context:**` entries before operational children.
    - Require at least one blank line between every cluster entry when any entry spans multiple physical lines;
      permit all-one-line clusters to be either tight or loose, with existing `MD012` enforcement owning excess
      consecutive blank lines.
    - Preserve existing boundaries before operational children and `_Outcome:_`, and emit canonical singular
      `_Note:_` for inline references to a `notes-{name}.md` companion.
    - Add a representative wrapped peer-descriptor cluster to the canonical task template so the shipped example
      and repository fixture exercise the contract.
    - Update project instances through the selected Framework projection and verify framework parity without
      copying Configurable files wholesale.

### `[ ]` **5.2 Implement descriptor validation and focused fixtures**

- _Goal:_ A pure repository rule detects only malformed documented root descriptor clusters and leaves unrelated
  Markdown grammar outside its authority.

    - `[ ]` **5.2.a Share a fence-aware task-list structural scanner**
        - Factor the existing canonical parent/subtask grammar from the task-list cursor into a shared scanner
          that emits stable structural events for cursor navigation and descriptor validation.
        - Build `test-first` (one behavior at a time):
            - Preserve current cursor behavior and canonical parent, subtask, and completion-shape recognition.
            - Ignore canonical-looking task markers inside backtick and tilde fenced code blocks, including
              example markers in the canonical task template.

    - `[ ]` **5.2.b Validate documented root descriptor clusters**
        - Implement the pure `{ path, content }` rule over scanner events for parent boundaries, documented
          singular root descriptors, `Additional Context`, operational-child boundaries, and completion shapes;
          leave unknown list content outside its authority.
        - Build `test-first` (one behavior at a time):
            - All-one-line clusters may remain tight or loose.
            - Every supported descriptor position requires loose spacing when any cluster entry wraps.
            - `Additional Context`, completed tasks, operational children, `_Outcome:_`, nested list content, and
              fenced examples terminate or preserve the intended cluster boundary.
            - Canonical package-source template fixtures and current selected `tasks-*.md` paths are included.
            - Diagnostics name the file, parent task, offending descriptor pair, and required spacing.

### `[ ]` **5.3 Compose descriptor validation into worktree lint and normalize live tasks**

- _Goal:_ CI's existing Markdown command enforces descriptor spacing over selected worktree content using the same
  selector and pure validator that staged enforcement will consume.

    - Add a worktree content loader and `lint:md:descriptors` command over the complete selected task-list and
      canonical fixture surface.
    - Rename the markdownlint-only underlying script to `lint:md:markdownlint`, require root
      `globs`/`ignores`/`gitignore` values to match the shared selector structurally, reject those options in nested
      configs, and run `markdownlint-cli2 --no-globs` over explicit selector-emitted worktree paths. Make the public
      `lint:md` command run it before `lint:md:descriptors`; keep `lint:md:file`, `lint:md:fix`, and
      `lint:md:fix:file` markdownlint-only.
    - Normalize selected live task lists, including this work unit's task list, in a distinct descriptor-only
      migration and verify no task status, text, nesting, or completion semantics changed.
    - Integration-test selector parity, worktree diagnostic aggregation, composed-command order and short-circuit
      exit behavior, and a green current baseline.

## **Phase 6:** Exact-index enforcement and discoverability

_Purpose:_ Certify the candidate Git index under its indexed configuration, integrate the check into the
project-only Husky chain, and leave every failure surface pointing to the same explicit remedy.

_Design decisions:_ The staged gate is check-only and reads a complete indexed snapshot once. Its NUL-safe trigger
check stops irrelevant runs before corpus loading, and neither lint engine may substitute worktree bytes after it
fires.

### `[ ]` **6.1 Implement the exact-index Markdown runner test-first**

- _Goal:_ One staged command certifies selected indexed Markdown with the indexed configuration cascade through
  standard markdownlint and the shared descriptor rule.

    - `[ ]` **6.1.a Load one complete indexed Markdown snapshot**
        - Build `test-first` (one behavior at a time):
            - The complete selected tracked scope enumerates through NUL-safe Git plumbing and each candidate loads
              exactly once through the existing `readGitBlobBytes(cwd, null, path)` primitive.
            - Markdown bytes decode as fatal UTF-8; missing or invalid selected blobs fail without a worktree
              fallback or second `git show` reader.
            - Deletion, rename, spaces, unusual tracked names, and linked-worktree invocation remain safe.
            - Snapshot construction retains repository-relative paths and reads every selected blob once.

    - `[ ]` **6.1.b Resolve the indexed Markdown configuration cascade**
        - Enumerate the indexed `.markdownlint-cli2.{jsonc,yaml,cjs,mjs}` and
          `.markdownlint.{jsonc,json,yaml,yml,cjs,mjs}` filename families recognized by pinned
          `markdownlint-cli2`. Support only `.markdownlint-cli2.jsonc`; fail closed with a conversion diagnostic on
          every other recognized format rather than ignoring or evaluating it.
        - Declare `jsonc-parser` as a direct root development dependency and load every supported config through
          the same exact indexed-blob primitive; require the root config.
        - Validate parse errors, UTF-8, object shape, and the supported top-level option surface; reject missing,
          malformed, or unsupported configuration instead of silently changing semantics.
        - Treat root `globs`, `ignores`, and `gitignore` as an integrity mirror: require exact structural equality
          with the shared selector's canonical declaration, including array order; reject those options in nested
          configs, and never evaluate arbitrary indexed globs as a second path authority.
        - Merge ancestor `.config` rule objects by directory and group files by effective configuration, including
          the existing `docs/` override; keep selected-path authority in the shared selector.
        - Build `test-first` for root-only and nested inheritance, staged root/nested rule changes, canonical root
          path options, config-only selector drift, nested path-option refusal, every recognized unsupported
          filename family, empty supported options, unsupported executable options, deletion, malformed JSONC,
          and deterministic config groups.

    - `[ ]` **6.1.c Certify the indexed snapshot through both lint engines**
        - Build `test-first` (one behavior at a time):
            - The shared dependency-alignment check consumes indexed `package.json`,
              `packages/arc-framework/package.json`, and `package-lock.json` metadata plus the actually imported
              versions; candidate/runtime drift fails before Markdown linting.
            - `lint()` from `markdownlint/promise` processes each effective-config group in one runner process,
              while the shared descriptor validator consumes the same full indexed `{ path, content }` map; no
              `markdownlint-cli2` internals are imported.
            - An unstaged worktree fix cannot hide an invalid indexed blob, and an unstaged worktree violation
              cannot block a valid indexed blob.
            - Staged supported root and nested rule changes govern the candidate commit, while config-only or
              nested path-selection changes fail closed.
            - Standard lint and descriptor failures both fail with stable repository-relative diagnostics;
              aligned-table failures print `npm run format:tables -- <path>`.
            - A valid complete snapshot passes as one staged command.

### `[ ]` **6.2 Wire relevant-change gating into the project pre-commit chain**

- _Goal:_ Relevant staged Markdown or checker changes trigger exact-index certification before existing
  package-sync and TypeScript checks, while unrelated commits pay no Markdown-gate cost.

    - Expose the runner as `lint:md:staged`; inside it, read staged changes with NUL-safe Git plumbing and
      centralize the trigger set: selected Markdown, every configuration name recognized by pinned
      `markdownlint-cli2`, selector code, descriptor validation, staged-runner and configuration-loader code,
      canonical fixtures, `package.json`,
      `packages/arc-framework/package.json`, and `package-lock.json`.
    - Invoke the lightweight command unconditionally from the project Husky layer before package-sync and
      TypeScript checks; let the runner exit successfully before corpus loading when no trigger matches, and do not
      change ARC's shipped universal pre-commit hook.
    - Preserve check-only behavior: never rewrite, fix, or restage a partially staged file.
    - Build `test-first` (one behavior at a time):
        - Relevant Markdown, root/nested configuration, and checker changes fire full certification; unrelated
          commits stop after trigger detection.
        - A root path-selection change must accompany matching selector code, while config-only or nested
          path-selection drift fails closed in the candidate view.
        - A recognized unsupported configuration filename triggers a fail-closed conversion diagnostic rather than
          silently changing worktree-only lint behavior.
        - A dependency-only change fires the indexed alignment check, and an installed tree that does not match the
          candidate manifests or lockfile fails with an actionable dependency-install diagnostic.
        - Failure propagates through `set -e` before package-sync and TypeScript checks, while green runs preserve
          the established command order.
        - Real temporary Git repositories prove deletion, rename, partial staging, unusual tracked names, and
          linked-worktree commit paths retain check-only index semantics.

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
