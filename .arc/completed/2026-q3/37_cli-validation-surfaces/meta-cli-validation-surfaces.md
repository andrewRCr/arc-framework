# Metadata: cli-validation-surfaces

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `cli-substrate-adoption`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-validation-surfaces.md`
- **Task List:** `tasks-cli-validation-surfaces.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/354>
- **Completed:** 2026-07-25

## Release Notes Entry

ARC's priority non-session trust boundaries now share schema-backed runtime and TypeScript contracts while retaining
their established compatibility, recovery, and failure behavior.

### Added

- `arc config validate [--file <path>]`, with the installed `validate-config.sh` path retained as a thin
  compatibility launcher.
- Schema authorities for release audit entries, semantic work-unit metadata, project configuration, local sync
  state, decomposition cut maps, Git worktree porcelain, cold-start inputs, and cross-work-unit note payloads.
- A composed internal validation registry with acceptance-equivalent Zod and JSON Schema projections for its four
  externally meaningful roots.

### Changed

- Configuration keys, defaults, authoring domains, and empty-value policies now derive from one typed catalog while
  tolerant readers, strict policy adapters, and precedence-aware resolution retain their distinct behavior.
- Work-unit metadata consumers now use semantic fields rather than display labels, with legacy and canonical
  Markdown layouts remaining readable and localized mutations remaining byte-preserving.
- Safely recomputable review identities now use the shared canonicalization authority while durable version-one
  receipt identities retain their original byte contract.

### Fixed

- Malformed non-empty Git worktree porcelain stanzas now produce a domain validation error instead of being silently
  discarded.
- Configuration validation now preserves exact safe-integer domains, stable diagnostics and exit codes, selected-file
  behavior, and custom ARC-root forwarding.
- Metadata creation preserves accepted sentinel values while validating the semantic record before rendering.

## Completion Notes

cli-validation-surfaces delivered schema ownership across the selected release, metadata, configuration, user-state,
decomposition, Git, cold-start, and cross-work-unit boundaries. Structural types now derive from their owning Zod
schemas, compatibility normalization remains at adapter edges, and the composed registry advertises only roots whose
runtime acceptance can be represented faithfully in JSON Schema. The generated kernel-only schema artifact remains
unchanged.

The configuration migration consolidated 36 active keys into one catalog and moved full validation into the
TypeScript CLI without changing the installed shell entry point. Semantic metadata replaced repeated display-label
parsing across lifecycle, status, session, Git, and review consumers while preserving tolerant field-level recovery
and legacy projection bytes. Local sync-state versions 2–4, cut-map graph invariants, worktree porcelain, cold-start
classification, and cross-work-unit Markdown payloads now cross explicit schema boundaries with their established
failure policies intact.

The reconciled base retired the controller-era review identity domains described by the original design. The
surviving durable version-one receipt seam remains frozen and inventory-guarded; recomputable identities use the
kernel canonicalizer. Review corrections also closed promotion validation, zero-padded integer, tolerant metadata,
unexpected validator-exit, sentinel-projection, and complete safe-integer-domain compatibility gaps.

Verification passed the full test suite with 7,771 tests passing and one intentional skip, both TypeScript typecheck
surfaces, TypeScript and shell lint, Markdown lint, ARC contract checks, and the package build. Independent projection
parity coverage exercises registered roots through both Zod and Ajv, including the exact safe-integer boundary.

---
