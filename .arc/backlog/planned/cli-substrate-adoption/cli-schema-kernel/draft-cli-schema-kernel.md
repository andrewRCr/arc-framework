# Draft: cli-schema-kernel

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Establish the shared runtime-schema, result, error, and canonical-data vocabulary used by the
  CLI substrate cohort.

---

## Problem / Motivation

The CLI currently repeats structural types and boundary parsing conventions across commands and libraries. That
leaves external data insufficiently validated, permits runtime shapes and TypeScript types to drift, and makes
later schema introspection depend on incidental module layout. The cohort needs one deliberately small kernel
before its members can migrate their own boundaries without minting competing primitives.

This member is the cohort's head dependency. It also provides the stable vocabulary needed by
`session-locus-model` and `schema-introspection-layer` without absorbing either work unit's domain behavior.

## Goals

- Make Zod schemas the source of truth for shared runtime shapes and derive TypeScript types with `z.infer`.
- Provide a discoverable, version-aware registry for subsystem-owned schemas.
- Standardize typed success/failure composition and a base CLI error taxonomy.
- Preserve existing canonical JSON semantics while exposing them through the shared substrate.
- Keep subsystem schemas co-located with the code that owns their semantics.

## Non-Goals

- Build a schema-introspection command or user-facing schema catalog.
- Migrate every subsystem boundary; sibling cohort members own the selected migrations.
- Define session state-machine behavior, configuration-axis reform, or storage policy.
- Change canonical JSON ordering, digesting, or serialization semantics.
- Use the TypeScript compiler API to derive runtime schemas.

## Design Decisions

### Dependencies and exports

- Add Zod 4 as the runtime-schema library, neverthrow as the result abstraction, and type-fest v5 for narrow
  shared utility types. `cli-git-executor` owns the execa dependency.
- Re-export the small Result surface the CLI consumes: `Result`, `ResultAsync`, `ok`, `err`, and boundary adapters.
  Callers should not import neverthrow throughout the tree; this seam keeps a future library swap bounded.
- Keep the kernel free of command behavior and subsystem-specific orchestration.

### Shared primitives

The kernel owns schemas and inferred types for the vocabulary shared across multiple subsystems:

- work-unit state and class values;
- work-unit, cohort, and other validated slugs;
- branch-name and artifact-prefix primitives;
- lifecycle placements and record identities;
- configuration primitives that are already stable across consumers.

Subsystems compose these primitives into richer records. A value used by only one subsystem stays with that
subsystem until a second real consumer establishes shared ownership.

### Schema registry and versioning

- Provide an explicit registry API through which subsystem modules register named schemas plus metadata.
- Registry entries carry a schema version and a stable identity suitable for later introspection.
- Wire a version discriminator only where a persisted or emitted format already has one. Do not invent version
  fields solely to satisfy the registry.
- Record migration posture in registry metadata so consumers can distinguish strict current-format parsing from
  backward-compatible reads.
- Generate JSON Schema as a build artifact from registered Zod schemas. The build mechanism must be deterministic
  and test schema identity, metadata, and generation without making generated files the authoring source.

### Errors and results

- Define an `ArcError` base taxonomy with stable machine-readable kinds and human-readable context.
- Domain members extend the taxonomy with their own variants; executor-specific process failures remain owned by
  `cli-git-executor`.
- New fallible internal pipelines may use `Result` or `ResultAsync`. Existing public seams change only when their
  owning member explicitly includes the migration.
- Error adapters preserve causes and boundary-safe details without relying on string matching.

### Canonical data

- Bless the current `lib/canonical/` implementation as the canonical JSON core.
- Re-export or adapt that core through the kernel rather than creating a second canonicalizer.
- Treat any requested change to canonical bytes, ordering, digests, or identity as separate design work.

### TypeScript evolution

Runtime schemas remain ordinary TypeScript modules. `z.infer` supplies static types, so the architecture does not
depend on compiler internals and stays insulated from the TypeScript 7 native-port transition.

## Delivery and Verification

- Land this member before the five fan-out members.
- Add unit coverage for every shared primitive, registry duplicate/invalid registration, version metadata, error
  adaptation, Result adapters, and deterministic JSON Schema generation.
- Add compile-time assertions where an inferred public type could silently widen or narrow.
- Measure package and build-output growth after adding the dependencies; unexpected material growth is a stop-and-
  investigate signal, not an automatic rollback.

## Alternatives

- **Schemas centralized by domain:** rejected because it separates boundary contracts from their semantic owners
  and turns the kernel into a monolith.
- **TypeScript types as source plus generated validators:** rejected because it needs compiler coupling and makes
  runtime behavior secondary.
- **Hand-written discriminated result unions:** viable but rejected in favor of neverthrow's mature composition;
  the narrow adapter surface preserves reversibility.
- **Replace the canonical JSON implementation:** rejected because the cohort needs adoption, not a wire-format
  redesign.

## Risks

- A broadly named kernel can attract unrelated helpers and become a dependency magnet.
- neverthrow's maintenance trajectory may warrant replacement; the adapter boundary must stay real.
- Schema/type drift can recur if authors hand-write exported types instead of inferring them.
- Registry version policy can become ceremony if it is applied to transient internal values.
- Zod, neverthrow, type-fest, and generated-schema tooling increase install and build size.

## Unknowns and Assumptions

- Settle the final module name and directory during spec formalization; the ownership boundary above is fixed even
  if the physical name changes.
- Settle the registry's exact API and JSON Schema generator after a source-level spike against Zod 4.
- Re-check neverthrow's maintenance status immediately before implementation. A negative result changes the
  library choice, not the Result seam.
- Assume the current canonical JSON behavior has adequate compatibility coverage; add characterization tests where
  that assumption is not already proven.

## Scope Estimate

Large (week+). Class `Heavy`: the shared contract and migration posture require deliberate design, and mistakes
would fan out across the cohort. Depends on `work-organization-reform`.
