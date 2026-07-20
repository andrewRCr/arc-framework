# Metadata: classify-change-granularity

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-classify-change-granularity.md`
- **Task List:** `tasks-classify-change-granularity.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 4.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/307>
- **Completed:** 2026-07-19

## Release Notes Entry

Repository CI now gives ordinary packaged ARC guidance edits a focused light path without weakening coverage for
tree-shape or behavior-bearing changes. Classification and verified-tree reuse share validated Git facts and a
layered identity, while review routing remains conservative.

### Added

- A focused `test:arc-contracts` command covers package synchronization and repository review wiring on light runs.

### Changed

- Content-only modifications to ordinary `100644` packaged Markdown now classify light; additions, deletions,
  renames, copies, mode or type changes, templates, extensions, internal machinery, malformed inputs, and mixed
  change sets remain heavy.

### Fixed

- Tree identity now rejects malformed or incomplete Git records and sorts raw path bytes portably across supported
  platforms.

### Infrastructure

- Light CI runs execute the focused ARC contract slice, while heavy-verification reuse ignores only ordinary
  packaged-prose blob changes and remains sensitive to packaged tree shape and content-sensitive surfaces.

## Completion Notes

CI weight now resolves a canonical NUL-safe Git change set covering additions, modifications, deletions, renames,
copies, and type changes with exact endpoint and mode validation. An all-facts projection classifies only ordinary
packaged `100644` Markdown modifications as light; ambiguous, malformed, mixed-heavy, membership, mode/type, and
registered content-sensitive changes fail closed to heavy. The path-only classifier, merge lane, portability
targeting, and interim review-risk routing retain their conservative behavior.

Verified-tree reuse now derives from a versioned two-layer identity: content-sensitive entries retain blob identity,
while the packaged-tree shape records paths, modes, and object types independently. Both layers share the packaged
content-sensitivity registry, and light runs execute a pinned focused contract slice for package synchronization and
review wiring. Review follow-up tightened endpoint and Git-record validation, pinned complete heavy-lane conditions,
and replaced GNU-specific NUL sorting with portable raw-byte ordering through Node buffers.

The final reviewed scope aligns with the project principles and the documented GitHub Actions, Git, Bash, Node, and
Vitest architecture without introducing a new component or dependency. Local post-reconciliation verification passed
507 test files and 6,463 tests with one expected skip, together with Markdown, TypeScript, and shell lint, source and
test type checking, focused contracts, and build. The exact-head hosted suite also passed Windows, macOS, and Ubuntu
portability, unit, integration, all end-to-end shards, lint/typecheck, `ci-ok`, and `merge-ok`; the sole review thread
was resolved and CodeRabbit approved the final code head.

---
