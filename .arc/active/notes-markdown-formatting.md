# Notes: Markdown Formatting Hygiene

## Grounded Baseline

Measurements taken against the tracked current-content surface on 2026-07-20:

- aligned `MD060` found 557 pipe-position violations across 15 of 461 checked Markdown files;
- underscore-style `MD049` found 3,792 violations across 146 project-lint files and another 580 violations across
  35 authoritative non-template package-source files;
- the combined emphasis migration surface was 4,372 conversions across 181 unique tracked files;
- `markdown-table-formatter --check` reported 182 files, mostly because it canonicalizes accepted spaced delimiter
  rows to an unspaced spelling rather than because their pipes violate aligned `MD060`;
- the full current worktree Markdown baseline was approximately 487 files and took roughly four seconds to lint.

Treat these counts as migration-sizing evidence, not permanent assertions; recompute them before writing task-list
completion criteria that rely on exact totals.

## Width-Semantics Fixtures

The pinned dependency graph at spec finalization resolved different `string-width` versions:

- `markdownlint` 0.40.0 / `MD060` resolved `string-width` 8.1.0;
- the CLI resolved `string-width` 8.2.2 through its direct dependency.

The versions disagree on at least these inputs and should remain explicit parity fixtures:

```text
1\u20e3  # unqualified keycap: 8.1.0 → 1, 8.2.2 → 2
क\u093e  # spacing-mark sequence: 8.1.0 → 1, 8.2.2 → 2
```

Keep the RFC's linter-authoritative exact-version rule and behavioral parity fixtures together; a version-only
assertion would not prove the table producer and `MD060` still agree.

## Existing Implementation Loci

- `packages/arc-framework/src/lib/active/meta-reader.ts` owns `renderCoreTable` and the private
  `setMetaCoreFields` content-preserving three-row rewrite engine.
- `packages/arc-framework/src/lib/status/render.ts` owns the shared status/readiness table formatter and currently
  measures cells with `.length` / `padEnd`.
- `packages/arc-framework/src/lib/view-renderer.ts` already imports `string-width`; consolidate it through the
  shared primitive only where that removes width-semantic duplication without coupling table code to pager logic.
- `packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md` contains the existing ordered-list
  nested table that grounds the container-prefix fixture.
- `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-handoff.template.md` contains an
  escaped pipe in a table cell that grounds serializer canonicalization coverage.
- `.husky/pre-commit` is the project-only enforcement chain; `.github/workflows/ci.yml` already invokes
  `npm run -s lint:md`.

## Migration Review Cautions

- A table pass proves bytes outside table-node ranges are stable and position-free GFM syntax trees are equal; it
  does not promise byte identity inside a serializer-owned table range.
- An emphasis pass needs its own raw-diff restriction in addition to syntax-tree equality because the permitted
  change is narrower than arbitrary Markdown canonicalization.
- Framework content migrates package-source first and renders/syncs to `.arc/`; configurable copies receive
  targeted edits independently; readiness output regenerates; meta tables use the three-row normalizer.
- The current plural `_Notes:_` instruction in `generate-tasks.template.md` is drift. Normalize it to canonical
  singular `_Note:_`; do not add plural as a second validator-recognized descriptor.

---
