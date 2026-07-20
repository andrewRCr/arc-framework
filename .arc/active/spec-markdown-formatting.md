# Spec (`detailed` · `RFC`): Markdown Formatting Hygiene

- **Origin:** [internal]

- **Purpose:** Make the repository's Markdown source deterministic and readable by aligning tables by display
  width, standardizing emphasis markers, and enforcing loose multi-line task descriptors across authoritative
  current content without exporting repository-specific style policy to ARC projects.

---

## Introduction / Context

Markdown is both ARC's delivery medium and a high-frequency editing surface. Small inconsistencies therefore
compound into recurring authoring and review cost: visually compact tables are hard to scan in source, emphasis
edits must follow whichever marker a file happened to use, and wrapped task descriptors currently contradict the
repository's preferred loose-list shape.

The current repository already contains most of the enforcement substrate but does not compose it into one
authority-aware contract:

- `markdownlint-cli2` 0.22.1 includes `MD060/table-column-style`, but `.markdownlint-cli2.jsonc` leaves it at the
  permissive default and excludes authoritative non-template package Markdown from the root lint scope.
- `string-width` is already a direct CLI dependency and is used by the view renderer, while meta and status table
  renderers still size cells with JavaScript string length.
- Meta core tables have a content-preserving three-row rewrite engine, but it is private and can only be reached
  through field-changing setters.
- The project Husky layer already composes repository-specific checks after ARC's shipped hook, but it has no
  Markdown check over exact staged blobs.
- Package-source Framework files, configurable project instances, scaffolded content, fully generated readiness
  output, and managed meta tables have different write authorities. A global formatter cannot safely treat them
  alike.

This RFC establishes one repository house style, one display-width model, authority-aware remediation, and local
plus CI enforcement. The semantic ARC task-list convention may ship in strategies and templates; the repository's
marker spelling and hook policy remain internal development choices.

## Goals

- Make every selected Markdown table satisfy source column-width alignment using the same Unicode display-width
  calculation in hand-authored fixes, meta rendering, and status/readiness rendering.
- Make `_underscore_` italics and `**asterisk**` strong emphasis deterministic throughout the repository's current
  authoritative lint surface.
- Make wrapped root descriptor clusters in ARC task lists loose while preserving compact one-line clusters.
- Normalize existing drift in reviewable mechanical passes with proof that unrelated bytes and rendered semantics
  did not change.
- Enforce the resulting contract in CI and against the exact Git index before commit, with actionable file-specific
  remediation.
- Preserve package/project authority, generated-artifact ownership, linked-worktree safety, and project autonomy.

## Non-Goals

- Ban emoji, symbols, combining characters, or other wide glyphs.
- Canonicalize whether GFM delimiter cells include spaces when either spelling aligns its pipes.
- Reformat prose or adopt a whole-document Markdown formatter.
- Continue `markdown-table-formatter` or `markdown-table-prettify` as the repository remedy.
- Build generalized staged-gate dispatch, pre-push orchestration, or index-safe auto-fix/restage machinery.
- Define which Markdown preferences ARC projects must adopt or how managed ARC content interoperates with every
  project linter.
- Absorb task-list grammar beyond descriptor-cluster spacing.
- Rewrite completed work-unit history, temporary artifacts, or private user state by default.

## Proposed Design

### 1. One display-width primitive

Add a small CLI-library primitive that exposes display width through the existing direct `string-width`
dependency. Table producers and formatting code depend on this primitive rather than importing `string-width`
independently or using `.length` / `padEnd` as width measurements.

The primitive owns two operations:

- `displayWidth(value)` returns the terminal display width used for column measurement.
- `padToDisplayWidth(value, width)` appends ASCII spaces until the requested display width is reached and never
  truncates content.

Move meta core-table rendering and status/readiness table rendering onto these operations. Refactor the existing
view-renderer use to the primitive where doing so avoids duplicate width semantics without coupling table code to
pager behavior. Fixtures cover ASCII, CJK, combining marks, emoji variation selectors, and ZWJ sequences.

`string-width` remains the single runtime dependency for width semantics; this work does not add a second Unicode
width implementation. The repository currently resolves different implementations: `MD060` reaches 8.1.0 while
the CLI reaches 8.2.2, and those versions disagree for some keycap and spacing-mark sequences. Treat the linter as
the version authority: pin the CLI's direct dependency to the exact `string-width` version resolved by the pinned
`markdownlint`, with no range, and make a dependency-alignment check fail when the two resolved versions differ.
An upgrade to either dependency therefore requires one deliberate paired update. Width fixtures run through both
the shared primitive and `MD060`, including known version-sensitive inputs, so equal package metadata is backed by
behavioral parity.

### 2. Table-only formatter

Add a repository command with the public shape:

```text
npm run format:tables -- <path> [<path> ...]
```

The command requires one or more explicit tracked Markdown paths. Empty invocation, directories, globs expanded to
no files, untracked paths, and non-Markdown paths fail without modifying the worktree. Paths resolve from the Git
top level so the same invocation behaves identically from the primary checkout and linked worktrees.

For ordinary authoritative files, the formatter:

1. parses the entire document with the standard micromark/mdast GFM-table extensions;
2. records each table node's exact source range;
3. serializes only that node with `gfmTableToMarkdown({ stringLength: displayWidth })`;
4. splices replacements from the end of the file toward the beginning; and
5. preserves every byte outside table ranges, including line endings and the final-newline state.

The parser and serializer packages become declared development dependencies; transitive copies brought in by
markdownlint are not treated as an API. The formatter is idempotent. Its delimiter-row spacing is an accepted
serialization choice, not the lint contract.

Parse errors, missing positional data, overlapping ranges, or unsupported table shapes fail the file before any
write. Multi-file invocation computes every result first and begins writing only after all selected paths validate,
so a bad later path cannot leave a partial validation pass. Each file is replaced atomically through a same-directory
temporary file plus rename. The command is not a multi-file transaction: if an operating-system write or rename
fails after earlier replacements, report the successfully written paths, the failed path, and the untouched
remainder. Idempotence makes the explicit invocation safe to retry.

Tables nested in list items or block quotes are supported. For every table node, derive the container prefix from
the source bytes between the start of its first line and `node.position.start.offset`. Require every subsequent
table row in the source range to carry the same prefix; apply that prefix after each newline in the serialized
replacement while leaving the first-line prefix outside the splice untouched. A nested table whose row prefixes
are inconsistent or cannot be recovered is an unsupported shape and fails with a path-and-line diagnostic.

After composing each candidate file, parse it again and compare the position-free GFM syntax tree with the input.
Bytes outside table-node ranges must be identical. Within a table range, the standard serializer may canonicalize
syntax-equivalent cell markup as well as padding and delimiter-row spelling; node content, alignment semantics, and
ancestor structure must remain identical. The command reports every changed table range so the mechanical-pass
review can inspect serializer canonicalization rather than implying a narrower byte guarantee. Fixtures include
top-level tables, the ordered-list nested table shape already present in `run-errand.md`, block-quoted tables,
escaped pipes, code spans, emphasis, and a rejected inconsistent-prefix case.

### 3. Authority-aware path routing

Centralize path classification behind the formatter rather than duplicating shell expressions across scripts and
documentation. Classification uses the repository Git top level plus the installed manifest's file classification
where a package/instance relationship exists.

Each selected path resolves to exactly one action:

- **Authoritative package Framework source:** format in `packages/arc-framework/arc/`; the rendered `.arc/` copy is
  updated through the existing render/sync path.
- **Rendered Framework instance:** refuse the wrong-direction edit and print the corresponding package-source path.
- **Configurable file:** allow only the selected copy; package framework sections and project-instance sections are
  migrated in separate source-first passes, never by copying the whole file.
- **Scaffolded or project-owned file:** format the selected repository path directly.
- **Fully derived project-readiness output:** refuse a generic rewrite and print the staged or worktree regeneration
  command owned by its renderer.
- **Managed meta file:** route to the meta-core normalizer described below rather than generic AST serialization.
- **Excluded completed, temporary, or personal surface:** refuse unless a future command explicitly opts into that
  surface; this WU adds no override.

Diagnostics name the supplied path, its resolved authority class, and the exact next command. Classification is a
pure, unit-tested decision surface; filesystem writes occur only after all decisions are known.

### 4. Content-preserving meta normalization

Expose a public `normalizeMetaCoreTable(content)` operation over the existing core-table rewrite engine. It parses
the five current core values and re-renders only the header, delimiter, and value rows using display-width padding.
It does not change a field value.

The operation preserves the H1, every bullet and continuation, field ordering, narrative sections, and trailing
bytes. It fails loudly when the core table is absent, malformed, duplicated, or cannot be recognized. A no-op is
byte-identical. Existing field setters continue to use the same engine, so normal lifecycle mutations and explicit
formatting cannot drift into different table shapes.

The table command invokes this operation for tracked `meta-*.md` files. Tests compare the before/after content
outside the three-row span byte-for-byte and cover wide glyphs in every core value class that permits them.

### 5. Generated status and readiness tables

Move the shared status-table formatter used by `STATUS.USER` and the project readiness view from code-unit length
to the display-width primitive. The renderer remains the sole authority for fully derived output; the repository
formatter never edits a derived readiness file directly.

Golden fixtures prove stable ordering and existing conditional-column behavior, then add wide-glyph rows and run
the emitted Markdown through aligned `MD060`. Regenerate tracked readiness output only after the renderer is fixed.

### 6. Lint contract and selected scope

Set the root Markdown rules explicitly:

```json
{
  "MD049": { "style": "underscore" },
  "MD050": { "style": "asterisk" },
  "MD060": { "style": "aligned" }
}
```

`npm run -s lint:md` remains the correctness authority. Expand its selected scope to include both authoritative
package Markdown and rendered/project Markdown while preserving exclusions for dependencies, completed WUs,
private identity-global files, and temporary artifacts. Duplicate checking of a Framework source and its rendered
copy is intentional: the source check protects what ships, and the instance check detects render or sync drift.

Keep targeted `lint:md:file` and fix commands available for explicit paths. Replace the interim table-tool guidance
in `DEV-RULES.PROJECT.md` and `QUICK-REFERENCE.md` with `format:tables`; a table-rule failure prints the same exact
command for the affected path.

The marker choices are repository policy. They are documented only in the project rule/configuration surfaces and
are not added to `DEV-RULES.ARC.md`, ARC configuration, or adopter hooks.

### 7. Exact-index pre-commit enforcement

Add a project-local Markdown runner to the Husky chain. It fires when the staged index changes any selected
Markdown file or Markdown-check configuration. The runner enumerates the complete selected tracked Markdown scope
from the index and reads each candidate with `git show :<path>`; it never substitutes worktree bytes.

Lint the resulting `{ path: indexedContent }` map in one process with the staged configuration and the declared
`markdownlint` API. Add direct development dependencies for APIs the runner imports, including JSONC parsing when
needed; do not import `markdownlint-cli2` internals. Failure output uses repository-relative paths and, for aligned
table failures, prints `npm run format:tables -- <path>` as the worktree remedy.

The gate is check-only. It never edits or stages files. Tests construct divergent index/worktree pairs and prove:

- an unstaged worktree fix cannot hide an invalid indexed blob;
- an unstaged worktree violation cannot block a valid indexed blob;
- a staged configuration change governs the candidate commit; and
- path deletion, rename, spaces, and linked-worktree invocation remain safe.

This runner lives in the repository Husky layer. ARC's shipped pre-commit hook remains limited to universal ARC
invariants. The runner composes both checks over the same indexed `{ path, content }` set: standard markdownlint and
the descriptor-cluster validator from the next section. A commit passes only when both pass.

### 8. Task descriptor spacing

Update the authoritative package-source task-list strategy, task template, and generate-tasks checklist together,
then render/sync their project instances. A parent task's root descriptor cluster contains `_Goal:_`, any peer
descriptor (`_Context:_`, `_Rationale:_`, `_Approach:_`, `_Shape:_`, `_Note:_`), and optional
`**Additional Context:**` entries before operational children.

Singular `_Note:_` is the canonical peer descriptor. Correct the existing generate-tasks instruction that emits
plural `_Notes:_` for a `notes-{name}.md` cross-reference to emit `_Note:_` instead; the validator recognizes only
the documented singular form. The plural spelling is source drift to normalize, not a second descriptor kind.

- If every cluster entry occupies one physical source line, entries may remain adjacent.
- If any entry has continuation content, every pair of cluster entries must be separated by one blank line.
- Existing blank-line boundaries before operational children and `_Outcome:_` remain unchanged.

Implement the focused repository check as a line-oriented validator over the stable task-list grammar, not as a
new universal Markdown parser rule. It recognizes task checkbox boundaries and only the documented root-level
descriptor labels; unknown list content is outside its authority and is left to normal Markdown linting. The check
covers current tracked `tasks-*.md` files outside excluded history/private surfaces, plus canonical package-source
template fixtures. Focused fixtures cover all-one-line clusters, each supported multi-line descriptor position,
`Additional Context`, operational-child boundaries, completed tasks, and nested list content.

Expose the validator as a pure `{ path, content }` operation and wire it through two named repository commands:

- `lint:md:descriptors` reads the selected worktree files and is composed into `lint:md`, so the existing CI
  `npm run -s lint:md` step enforces both markdownlint and descriptor spacing at the merge boundary.
- `lint:md:staged` reads the complete selected index snapshot once and runs both markdownlint and the same pure
  descriptor validator; Husky invokes this command before the existing package-sync and TypeScript checks.

The staged command fires for selected Markdown changes, Markdown configuration, the selector, or descriptor-rule
implementation/fixtures. The CI/worktree and pre-commit/index paths share selector and validation modules; only
their content loaders differ.

The strategy and generated examples communicate ARC's preferred document shape. The repository-only validator is
not shipped or described as a parser-required adopter invariant.

### 9. Mechanical migration and proof

Land normalization as separable review increments so semantic changes are not buried in corpus-wide churn:

1. authority selection, checks, and command interfaces;
2. display-width primitive, meta/status renderers, meta normalizer, and table formatter;
3. `MD060` enablement plus source-first table normalization and derived-output regeneration;
4. `MD049` / `MD050` enablement plus source-first emphasis normalization and render/sync;
5. descriptor guidance, canonical fixtures, validator, and live-task normalization;
6. exact-index Husky wiring and discoverability reconciliation.

The table formatter's source-range contract proves table-only changes by construction and unit tests. For the
one-time table pass, inspect the staged diff and run an audit that verifies bytes outside original table ranges are
unchanged, reports every changed table range, and proves position-free GFM syntax-tree equality across each file.
Syntax-equivalent serializer changes inside a table are permitted but remain visible for mechanical review.

For the emphasis pass, add a migration audit that compares each selected file's pre-migration Git blob with its
worktree result. It parses both as GFM, strips positional metadata, and requires structurally equal syntax trees;
the raw diff must contain only emphasis delimiter substitutions. Code spans, links, HTML, task checkbox structure,
and text content therefore remain unchanged. The audit takes explicit paths or the authority selector's emitted
path list and fails on an untracked or unreadable baseline.

Every migration pass is idempotent and is verified before it joins the next pass.

### 10. Coordination and ownership transfer

This WU owns repository-specific Markdown correctness now. Before planning closes, route durable `WU_Target`
captures through the personal inbox rather than editing sibling work-unit artifacts from this branch:

- `quality-gate-hooks` must drop its stale Markdown-table CI and commit-time auto-fix/emphasis/emoji ownership,
  retain generalized gate dispatch, pre-push/tier orchestration, and future index-safe auto-fix/restage machinery,
  and treat this WU's exact-index check-only runner as existing substrate.
- `task-list-conventions` must drop descriptor-cluster spacing while retaining requirement anchors, inserted-phase
  rules, interlock language, completion shape, and its other task-grammar concerns.

The captures are planning-close evidence, not implementation tasks. Until the sibling drafts consume them, this
RFC's narrower ownership statement is authoritative for the overlap.

## Alternatives & Rationale

### Keep permissive linting and format tables by convention

Rejected. It preserves the recurring attention cost and cannot keep generated output, hand-authored content, and
wide glyphs coherent. A standard lint rule now expresses the actual invariant.

### Use `markdown-table-formatter`

Rejected. Its width model differs from aligned `MD060`, especially for emoji and composed glyphs, and its check
contract treats accepted delimiter-row spellings as changes. That would create churn beyond the lint invariant.

### Use Prettier or another whole-document formatter

Rejected. Whole-document rewriting changes prose wrapping and list indentation outside the concern, including
ARC's stable nested-task shape. The formatter must splice table ranges only.

### Hand-roll table parsing or display width

Rejected. GFM escaping and Unicode display width have mature libraries already present in the ecosystem. Custom
implementations would create a second correctness contract and predictable edge-case drift.

### Lint worktree files in pre-commit

Rejected. Worktree linting gives the wrong answer under partial staging: an unstaged fix can mask a bad commit, and
an unstaged violation can block a clean one. The gate must certify indexed bytes and indexed configuration.

### Auto-fix and restage in the hook

Rejected for this WU. Mutating partially staged files safely belongs to the generalized hook architecture. The
local gate remains check-only and prints an explicit remedy.

### Ship the house style to ARC projects

Rejected. Marker spelling and repository hook policy are conventions, not ARC principles or parser invariants.
Projects retain their own lint policy; the separate adopter-contract work owns managed-content interoperability.

### Split formatting concerns into separate work units

Rejected. Tables, emphasis, descriptor spacing, selection, migration proof, and enforcement share one authoritative
Markdown scope and one rollout boundary. Splitting would duplicate classification and temporarily leave the corpus
with mutually inconsistent checks. The implementation remains reviewable through independent increments.

## Cross-cutting Considerations

### Security and trust boundaries

- Treat command-line paths and Git-index paths as untrusted input: normalize to repository-relative paths, reject
  traversal and out-of-repository resolution, and pass path arguments after `--` without shell interpolation.
- Use Git plumbing with NUL-delimited path lists where available so spaces and unusual tracked filenames remain
  safe.
- Parse Markdown and JSONC without evaluating repository content as JavaScript.
- Compute all formatter outputs before writes and use same-directory temporary-file replacement only for validated
  explicit paths; no recursive filesystem walk controls mutation scope.

### Performance

- A full selected-scope Markdown pass is expected at roughly the current four-second baseline and is acceptable
  when Markdown or its configuration is staged.
- Parse each document once per operation. Share selected-path enumeration and lint configuration across files.
- Skip the project-local Markdown gate entirely when no relevant staged path changed.

### Testing

- Unit-test display-width padding, GFM table range replacement, authority classification, meta normalization,
  descriptor validation, and migration audits.
- Integration-test explicit multi-file validation-before-write, per-file atomic replacement and mid-write failure
  reporting, Git-index linting, linked-worktree path resolution, generated readiness regeneration, and
  package/project synchronization.
- Exercise `MD049`, `MD050`, and `MD060` through the pinned linter rather than duplicating their acceptance logic.
- Keep existing status/meta golden behavior while adding wide-glyph fixtures and exact byte-preservation assertions.
- Exercise the descriptor validator through both `lint:md` worktree composition and `lint:md:staged` index
  composition so its pure rule cannot become a test-only or manually invoked check.

### Migration and rollout

- Source-first ordering is mandatory: package Framework content before rendered instances; generator before derived
  output; configurable copies edited independently.
- Enable each lint rule in the same review increment as its corresponding corpus normalization so the branch never
  knowingly ends an increment with an impossible baseline.
- Keep table and emphasis migrations separate from behavioral code and guidance changes.
- Preserve current exclusions unless a path is deliberately named by this RFC's selected-scope contract.

### Compatibility and audience

- The design uses the existing Node ≥24, strict TypeScript, npm workspace, Vitest, Husky, and markdownlint stack.
- Check against TECHNICAL-OVERVIEW § 2 Architecture Components: the width/format logic stays in the CLI library,
  command orchestration stays in repository scripts, and project-only enforcement stays in Husky.
- Check against TECHNICAL-OVERVIEW § 3 Infrastructure: no new runtime or build system is introduced; direct
  dependencies are declared at the layer that imports them.
- Check against PROJECT-PRD's _Operational friction down, judgment friction up_ principle: deterministic source
  hygiene becomes mechanical while review/commit gates remain explicit.
- Check against PROJECT-PRD's _Configurable methodology, open ecosystem_ principle: repository preferences do not
  become universal adopter policy.

### Documentation and package/project sync

- Framework methodology edits originate in `packages/arc-framework/arc/` and render/sync to `.arc/`.
- Configurable `DEV-RULES.PROJECT.md` and `QUICK-REFERENCE.md` copies receive targeted edits that preserve project
  overrides; whole-file copies are forbidden.
- Failure output is the point-of-need remedy. Reference docs list the command but do not duplicate formatter
  semantics.

## Success Criteria

- `npm run -s lint:md` passes with explicit underscore `MD049`, asterisk `MD050`, and aligned `MD060` across both
  authoritative package Markdown and rendered/project Markdown in the selected current scope.
- The explicit-path table formatter rejects empty or unauthorized input, validates every selected path before any
  write, replaces each file atomically, reports any partially completed multi-file write precisely, is safe to retry,
  and changes no bytes outside GFM table ranges.
- ASCII, CJK, combining-mark, emoji-variation, and ZWJ fixtures produce tables accepted by aligned `MD060` through
  the formatter, meta renderer, and status/readiness renderer using the same display-width primitive.
- The CLI and `MD060` resolve the same exact `string-width` version; dependency and version-sensitive behavioral
  checks fail if their width semantics drift.
- Top-level, list-nested, and block-quoted GFM tables retain position-free syntax-tree content and ancestor
  structure after formatting; inconsistent container prefixes fail before any selected file is written.
- Meta normalization changes only the three core-table rows and preserves all fields, prose, ordering, line-ending,
  and final-newline state outside that span.
- Fully derived readiness output is regenerated from its renderer; generic formatting refuses to rewrite it.
- The emphasis migration preserves position-free GFM syntax trees and changes only emphasis delimiter bytes across
  the authority-selected corpus.
- Multi-line root descriptor clusters are loose in authoritative guidance, templates, and current selected task
  lists; all-one-line clusters may remain tight; `lint:md` enforces the validator in CI and `lint:md:staged`
  enforces the same rule over exact indexed content before commit.
- Task guidance emits canonical singular `_Note:_` for inline references to `notes-{name}.md`; stale plural
  `_Notes:_` guidance is absent and is not accepted as a separate descriptor kind.
- The project pre-commit Markdown gate lints exact indexed files under exact indexed configuration, remains
  check-only, skips irrelevant commits, and passes the two inverse partial-staging tests.
- Package/project synchronization checks pass, and no completed, temporary, private-user, or otherwise excluded
  path changes during the default migration.
- `DEV-RULES.PROJECT.md`, `QUICK-REFERENCE.md`, and gate diagnostics agree on the width-aware remediation command;
  stale third-party formatter instructions are absent.
- The relevant TypeScript lint, source/test typechecks, unit/integration tests, Markdown lint, shell lint, build,
  and full repository test suite pass at the work-unit verification boundary.
- Durable coordination captures have been routed to `quality-gate-hooks` and `task-list-conventions` before
  planning closes.

## Open Questions

[none] — implementation may choose exact module filenames and fixture organization within the boundaries above;
those choices do not alter the design contract.
