# Cohort: `cli-substrate-adoption`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Purpose:** Deliver the CLI's typed substrate as independently reviewable work units while preserving one
coherent architecture: a shared schema kernel, stable process-boundary contracts, one layout authority, systematic
runtime validation, a typed git executor, uniform command-input behavior, and a final adoption sweep. The kernel
ships first so downstream work can consume a real integration boundary; five members form a fan over that
foundation, then a tail member closes residual migration across the landed contracts.

---

## Coordination

```text
Stage 1: cli-schema-kernel
Stage 2 (dependency-independent fan; overlap-check at activation):
  cli-session-envelope · cli-layout-resolver · cli-validation-surfaces · cli-git-executor · cli-command-inputs
Stage 3: cli-substrate-complete-migration (depends on Stages 1–2)
```

Every fan member depends on `cli-schema-kernel`; no fan member otherwise gates another. All session-init, recovery,
and compaction-seed envelope-family schemas belong to `cli-session-envelope`, keeping
`cli-validation-surfaces` independent after the kernel lands. `cli-substrate-complete-migration` depends on all
six preceding members and performs the final audit and mechanical adoption against their landed contracts.

### Shared contracts

- **Schema vocabulary and registry:** owned by `cli-schema-kernel`; consumed by every sibling. The authoritative
  definition lives in its spec. Siblings compose registered subsystem schemas without redeclaring shared
  vocabulary.
- **Agent-facing envelope wire shape:** owned by `cli-session-envelope`; consumed by `session-locus-model` and the
  workflow corpus. Internal Result conversion must not change the emitted `{ok, value} | {ok, error}` contract.
- **Layout tokens and resolution:** owned by `cli-layout-resolver`; consumers request paths through its resolver
  rather than reproducing `.arc/` layout mechanics.
- **Git execution errors:** the taxonomy base belongs to `cli-schema-kernel`; executor-specific variants and the
  stable thrown-error contract belong to `cli-git-executor`.
- **Command-input behavior:** owned by `cli-command-inputs`; prompt and argument boundaries use kernel schemas,
  while stub-creation policy and lifecycle verbs remain with their existing owners.

### Soft coordination

- Zod schemas are the type authority at migrated boundaries; a sibling removes the corresponding handwritten
  type when it introduces the schema.
- The kernel owns shared vocabulary, not every subsystem schema. Subsystem schemas remain co-located and register
  through the kernel.
- Canonical serialization semantics remain byte-stable. Each sibling that owns a peripheral canonicalization
  outlier migrates that outlier without changing `lib/canonical/` receipts.
- Priority-surface scope is closed. Any newly discovered wholesale migration target routes to
  `cli-substrate-complete-migration` rather than expanding a contract-owning member.

### Cross-cohort

- **`session-locus-model`:** waits on `cli-schema-kernel` and `cli-session-envelope`, then refreshes its saved RFC
  against the landed record and result contracts.
- **`operational-state-docs`:** waits on `cli-validation-surfaces`, whose meta-record schema is the structural
  source of truth for the managed operational-state-document class. Its managed-document conversion remains
  outside `cli-substrate-complete-migration`; the tail owns only residual CLI code and test adoption.
- **`schema-introspection-layer`:** waits on `cli-schema-kernel` and publishes its registry and generated schema
  artifacts.
- **`composable-workflows`:** consumes the kernel for workflow contracts and the step vocabulary; it retains
  ownership of frontmatter contract mechanics and the workflow-markdown command question.
- **`wu-lifecycle-state-model`, `scalable-core`, and `lifecycle-transition-core`:** retain their respective state
  machine, config-axis, and lifecycle-policy ownership while consuming the kernel or command-input substrate.

### Closeout criteria

The cohort is complete when all seven members ship, their shared contracts agree, the named downstream dependency
edges point at their delivering members, and `cli-substrate-complete-migration` proves that no cohort-scoped
first-party importer, transitional shim, or parallel reusable test helper remains.

## Members

### `cli-schema-kernel`

_Exposes:_ shared vocabulary primitives, schema registry and versioning discipline, the error-taxonomy base,
Result insulation, canonicalization authority, and generated JSON Schema build machinery.

_Consumes:_ the landed state/meta model from `work-organization-reform`.

### `cli-session-envelope`

_Exposes:_ runtime-validated session-init, recovery, and compaction-seed envelope contracts plus internal
`Probe<T>` to `Result`/`ResultAsync` composition with the existing wire shape preserved.

_Consumes:_ kernel vocabulary, registry, and Result exports.

### `cli-layout-resolver`

_Exposes:_ the `.arc/` layout resolver and migrated code/test callers for the audit's 15 path classes, including
the tracked-planning git-operation boundary.

_Consumes:_ kernel layout tokens and the landed coupling-audit inventory.

### `cli-validation-surfaces`

_Exposes:_ schemas for the audit log, semantic meta records, authorable config, sync-state, cut maps, worktree
porcelain, cold-start inputs, cross-WU note payloads, and the remaining named priority validation targets.

_Consumes:_ kernel primitives and registry; the landed meta shape from `work-organization-reform`.

### `cli-git-executor`

_Exposes:_ execa-backed `GitExec` bindings, structured thrown git errors, and correct cancellation/timeout
classification without changing the stable injectable seam.

_Consumes:_ the kernel error base and adapters; no sibling executor implementation detail.

### `cli-command-inputs`

_Exposes:_ uniform non-interactive behavior, required-input elicitation/refusal, and kernel-schema validation for
Commander arguments and clack-provided values.

_Consumes:_ kernel schemas and the existing lifecycle/stub policy boundaries without taking ownership of them.

### `cli-substrate-complete-migration`

_Exposes:_ a reconciled post-cohort migration inventory, first-party consumers on their final owning modules,
retired transitional shims, and converged reusable test support.

_Consumes:_ all six landed member contracts. Managed operational-document conversion remains owned by
`operational-state-docs`.

---
