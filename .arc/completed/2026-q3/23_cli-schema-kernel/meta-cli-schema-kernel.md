# Metadata: cli-schema-kernel

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `cli-substrate-adoption`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-schema-kernel.md`
- **Task List:** `tasks-cli-schema-kernel.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/306>
- **Completed:** 2026-07-19

---

## Completion Notes

The CLI schema kernel establishes one bottom-of-graph runtime-contract layer for the substrate cohort. Zod-backed
schemas now own the shared work-unit vocabulary and branded slug contract; a versioned registry publishes
deterministic Draft 2020-12 JSON Schema; the error base supports namespaced domain extension; and neverthrow is
contained behind one bounded Result import seam. The pure canonical JSON, digest, and managed-path primitives now
live at the same foundational boundary.

The delivered boundary preserves existing callers through exact downward re-export shims while keeping subsystem
schemas, terminal error presentation, lifecycle projections, and retirement/decomposition records with their
semantic owners. The production build emits `dist/schemas/kernel.json` atomically, and the architecture overview
records the new kernel plus its Zod and neverthrow dependencies for downstream cohort members.

Implementation clarified two design details without widening the public contract. The native Zod registry remains
internal and load-bearing for direct schema-membership checks, while a parallel identity map provides enumeration
and a sorted ephemeral registry provides deterministic JSON Schema projection. The only behavioral hardening beyond
a literal canonical-core move rejects sparse arrays before they can emit invalid or colliding JSON and rejects
unpaired UTF-16 surrogates before managed paths reach filesystem encoding. Valid canonical bytes, ordering, and
digests remain unchanged.

All Tier 3 gates passed: markdown, TypeScript, and shell lint; source and test typechecking; 507 test files and
6,406 tests; and the production build, with one file and one test skipped as expected. Repeated builds produced the
same 924-byte schema bundle, package and install growth were fully attributed, the complete hosted CI matrix passed,
and incremental review approved the final code head with every discussion resolved.
