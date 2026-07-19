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

- Add Zod 4 as the runtime-schema library and neverthrow as the result abstraction. Defer type-fest until a
  named utility-type consumer exists — the proven-sharing discipline the kernel applies to its own primitives
  (§Shared primitives) applies to an external utility dependency too; add it when a concrete use lands, not
  speculatively. `cli-git-executor` owns the execa dependency.
- Re-export the small Result surface the CLI consumes: `Result`, `ResultAsync`, `ok`, `err`, and boundary adapters.
  Callers should not import neverthrow throughout the tree; this seam keeps a future library swap bounded.
- Keep the kernel free of command behavior and subsystem-specific orchestration.

### Shared primitives

The kernel owns schemas and inferred types for the vocabulary shared across multiple subsystems:

- work-unit **persisted-state**, class, and priority values — the parse-boundary enums `WorkUnitState`
  (`Planning`/`Active`/`Integrating`/`Shipped`), `WorkClass`, and `Priority` that narrow the `**State:**`,
  `**Class:**`, and `**Priority:**` meta fields;
- work-unit, cohort, and other validated slugs;
- branch-name and artifact-prefix primitives;
- configuration primitives that are already stable across consumers.

**Explicitly out of scope** — owned by the lifecycle subsystem (→ `wu-lifecycle-state-model`), not the kernel:
the *derived* `LifecycleState` lattice and its `(phase, location)` position machinery — a computed projection,
not a parse boundary — and retirement/decompose **record identities** (receipt / preparation IDs). These are
subsystem domain logic that *consume* the kernel's canonical primitives; they do not migrate into the kernel.
Keeping them out is what holds the kernel clear of the state-machine behavior its Non-Goals fence off.

Subsystems compose these primitives into richer records. Entry is gated on **proven sharing**: a primitive
belongs in the kernel only once it has two or more real consumers in the current codebase — anticipated
fan-member need does not qualify a value while it still has a single consumer. Shared use alone is not
sufficient, either: a value whose semantics a fenced-off subsystem owns (the state lattice above) stays with that
subsystem even when many callers read it. The concrete initial inventory is enumerated at spec formalization by
applying both tests to today's tree.

### Schema registry and versioning

- Adopt Zod 4's native registry (`z.registry`) as the mechanism rather than building a bespoke one; the kernel
  wraps it thinly with a typed metadata contract (`z.registry<{ id; version; migrationPosture }>()`) so every
  registration is compile-time-checked.
- Registry entries carry a stable string identity, a schema version, and a migration posture — held in the
  registry entry's metadata, **not** in per-schema `.meta()` (Zod leaks unknown `.meta()` keys into JSON Schema
  output; registry metadata stays out of the emitted schema).
- The kernel records registered identities at registration time in a parallel structure: a `z.registry()` is not
  iterable, so identity enumeration cannot go through the registry object itself.
- Wire a version discriminator only where a persisted or emitted format already has one. Do not invent version
  fields solely to satisfy the registry.
- Record migration posture in registry metadata so consumers can distinguish strict current-format parsing from
  backward-compatible reads.
- Generate JSON Schema as a build artifact via Zod 4's native `z.toJSONSchema(registry, …)`, which emits a
  bundled `{ schemas }` map with stable `$id`s and cross-schema `$ref`s. The build step must be deterministic and
  test schema identity, metadata, and generation without making generated files the authoring source.

### Errors and results

- Evolve the existing `ArcError` base (`lib/errors.ts`) rather than minting a parallel one: it already carries a
  machine-readable `code` and pairs with `UserFacingError` + `formatError`. The kernel takes ownership of the base
  class, the shared/core code vocabulary, and the error/Result adapters. The terminal-presentation layer
  (`UserFacingError`, `formatError`) stays in the CLI — it is command-surface rendering, which the kernel's
  Non-Goals fence off; the kernel does not absorb it.
- Extend via **namespaced codes plus domain subclasses**: the kernel owns the base class, the code shape, and the
  shared/core codes; each domain subclasses `ArcError` and owns its own namespaced codes (`git.*`, `schema.*`, …),
  so a new variant never edits a shared central union. Per-domain exhaustiveness lives within each domain's own
  code type. `cli-git-executor` extends the base with executor-specific process failures.
- Open the base `code` type from today's closed 15-value `ArcErrorCode` union to a namespaced string so subclasses
  carry their own codes without editing a shared union. The existing `SCREAMING_SNAKE` codes stay verbatim
  (migrated only by their owner, per the seam rule below), coexisting with new lowercase-dotted namespaced codes;
  the heterogeneity is accepted, not reconciled.
- New fallible internal pipelines may use `Result` or `ResultAsync` (re-exported from neverthrow behind the kernel
  seam). Existing public seams change only when their owning member explicitly includes the migration.
- Error adapters preserve causes and boundary-safe details without relying on string matching.

### Canonical data

- Bless and re-export **only the pure canonical core** of `lib/canonical/`: `canonical-json.ts`
  (`canonicalDigest` / `digestBytes` / `CanonicalDigest`, `node:crypto`-only) and `managed-path.ts`
  (`ManagedPath`). These are dependency-minimal, byte-stable, and free of subsystem coupling.
- Leave the domain-shaped files in `lib/canonical/` **co-located with the retirement/decompose subsystem that
  owns them**: `receipt-id.ts` (retirement / preparation IDs; imports the git-layer `WorktreeSubject`) and
  `content-digest.ts` (artifact-set / patch shapes). They *consume* the kernel's canonical core rather than being
  re-exported by it — re-exporting them would drag git-layer and retirement/decompose semantics into a kernel
  whose Non-Goals fence exactly that.
- Do not create a second canonicalizer. Treat any requested change to canonical bytes, ordering, digests, or
  identity as separate design work.

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
- Zod, neverthrow, and generated-schema tooling increase install and build size.

## Unknowns and Assumptions

- Settle the final module name and directory during spec formalization; the ownership boundary above is fixed even
  if the physical name changes.
- The Zod 4 spike is done — run out-of-tree against `zod@4.4.3`: native `z.registry` + `z.toJSONSchema` cover
  typed registry metadata (held in the registry entry, not `.meta()`), non-iterable-registry identity enumeration,
  and deterministic bundled generation (with `$id`s and cross-schema `$ref`s), so the kernel wraps them thinly
  rather than building a registry. Re-confirm these behaviors against the pinned Zod version at implementation —
  the same pre-implementation re-check the neverthrow item below calls for. The remaining detail — the exact
  wrapper API surface — settles at spec formalization.
- Re-check neverthrow's maintenance status immediately before implementation. A negative result changes the
  library choice, not the Result seam.
- Assume the current canonical JSON behavior has adequate compatibility coverage; add characterization tests where
  that assumption is not already proven.

## Scope Estimate

Large (week+). Class `Heavy`: the shared contract and migration posture require deliberate design, and mistakes
would fan out across the cohort. Depends on `work-organization-reform`.
