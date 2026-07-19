# Spec (`detailed` · `RFC`): cli-schema-kernel

- **Origin:** [internal]

- **Purpose:** Establish the CLI substrate cohort's shared kernel — one small, foundational module owning the
  runtime-schema vocabulary (Zod), a versioned schema registry with deterministic JSON Schema generation, the base
  error taxonomy, a bounded Result seam, and the blessed canonical-data core — so every fan-out sibling migrates its
  boundaries against a real integration surface instead of minting competing primitives.

---

## Introduction / Context

The CLI repeats structural types and boundary-parsing conventions across commands and libraries. External data is
insufficiently validated, runtime shapes and TypeScript types drift apart, and any later schema introspection would
depend on incidental module layout. The `cli-substrate-adoption` cohort needs one deliberately small kernel to land
first, so its members can migrate their own boundaries without minting competing primitives.

This member is the cohort's **head dependency**: every fan sibling — `cli-session-envelope`, `cli-layout-resolver`,
`cli-validation-surfaces`, `cli-git-executor`, `cli-command-inputs` — depends on it, and no fan member otherwise
gates another. It also supplies the stable vocabulary that the cross-cohort `session-locus-model` and
`schema-introspection-layer` consume, without absorbing either work unit's domain behavior. It must land before the
five fan-out members.

**Grounded starting state** (verified against the tree at spec time):

- No `zod` or `neverthrow` dependency exists today — both are clean adds. Current runtime deps: `@clack/prompts`,
  `commander`, `js-yaml`, `semver`, `string-width`.
- `ArcError` lives in `src/lib/errors.ts` with a **closed 15-value `ArcErrorCode`** union (all `SCREAMING_SNAKE`),
  paired with `UserFacingError` + `formatError` / `formatUnexpectedError` / `manifestMissingError` in the same file.
- The parse-boundary enums `WorkUnitState` / `WorkClass` / `Priority` and their `validateState` /
  `validatePriority` / `validateClass` narrowers live in `src/commands/active/types.ts` — a `commands/` module, i.e.
  **above** the lib layer — consumed by ~8 lib modules (`project-view`, `worktree-roster`, `set-phase`,
  `finalize-stage`, `in-flight-derivation`, `lifecycle-state`, …).
- Slug validation (`SLUG_PATTERN` / `isSlugSafe`) lives in `src/lib/work-unit/slug.ts` with ~10 consumers, and is
  **duplicated** inline only in `src/scripts/review-gate/hosts/github/lifecycle-tail.ts`
  (`decompose-cut-map.ts` imports the shared `isSlugSafe`, and its artifact-filename regexes are a different concern).
- The pure canonical core (`canonical-json.ts`, `managed-path.ts`) sits in `src/lib/canonical/` alongside the
  domain-coupled `receipt-id.ts` (imports git-layer `WorktreeSubject`) and `content-digest.ts`.

## Goals

The design is correct when it achieves:

- **Zod as the type authority.** Zod schemas are the source of truth for shared runtime shapes; TypeScript types
  derive from them via `z.infer`, so runtime validation and static typing never diverge.
- **A discoverable, version-aware registry.** Subsystem-owned schemas register under stable identities carrying a
  schema version and a migration posture, with deterministic JSON Schema generation as a build artifact.
- **An extensible error taxonomy.** A base CLI error type extends by namespaced codes plus domain subclasses, so a
  new variant never edits a shared central union.
- **Typed success/failure composition** behind a Result seam that centralizes the dependency on one module, so a
  future library change has a single upgrade point and reversibility is preserved.
- **Byte-stable canonical semantics** preserved exactly, while the pure canonical core is exposed through the kernel.
- **Co-location discipline.** Subsystem schemas stay with the code that owns their semantics; the kernel owns only
  proven-shared vocabulary.
- **Bottom-of-graph layering.** The kernel imports only external libraries and Node builtins — never from
  `commands/`, `prompts/`, or any other `src/` module. It sits at the absolute bottom of the dependency graph, so
  it cannot cycle or pull subsystem semantics inward. Every primitive it owns lives *inside* it; old locations
  re-export from the kernel (downward), never the reverse.

## Non-Goals

- Build a schema-introspection command or a user-facing schema catalog.
- Migrate every subsystem boundary. Siblings own their selected migrations; the closed priority surface routes any
  newly discovered wholesale target to the follow-up complete-migration work unit, not this kernel.
- Define session state-machine behavior, configuration-axis reform, or storage policy.
- Change canonical JSON ordering, digesting, or serialization semantics.
- Use the TypeScript compiler API to derive runtime schemas.
- Absorb terminal presentation (`UserFacingError` / `formatError`) or subsystem-owned records — the derived
  `LifecycleState` lattice and retirement/decompose record identities stay with their owning subsystems.

## Proposed Design

The kernel is `src/lib/kernel/` — a flat module under `lib/` (matching the existing flat `lib/` convention),
guarded by a strict entry gate rather than a folder namespace. The design has eight parts.

### 1. Module boundary and dependency direction

- **Location:** `src/lib/kernel/`, with internal sub-structure (`schema/`, `result.ts`, `errors.ts`, `canonical/`,
  a JSON Schema build entry). No `core/` parent tier — the kernel is the single shared substrate; its concerns are
  sub-modules inside it, not lateral peers. If a genuine second foundational module is ever proven, promotion to
  `core/kernel/` is a later `git mv`.
- **Dependency invariant (bottom of the graph):** the kernel imports only external libraries (`zod`, `neverthrow`)
  and Node builtins (`node:crypto`) — **nothing** from elsewhere in `src/` (`commands/`, `prompts/`, or any other
  `lib/` module). This is absolute: no carve-outs, so the check that enforces it needs no allow-list. It is *why*
  every primitive the kernel owns must live physically inside it — the shared vocabulary in
  `commands/active/types.ts`, the slug in `lib/work-unit/`, the error base in `lib/errors.ts`, and the pure
  canonical core in `lib/canonical/` all move **into** the kernel, each old location left as a downward re-export
  shim (§3, §6, §7). The kernel never reaches up or sideways to them.
- **Proven-sharing entry gate.** A value enters the kernel only once it has **two or more real consumers in the
  current codebase**. Anticipated fan-member need does not qualify a single-consumer value. Shared use alone is not
  sufficient either: a value whose semantics a fenced-off subsystem owns stays with that subsystem even when many
  callers read it. This gate — not the module name — is the control against the "dependency magnet" risk.

### 2. Dependencies and the Result seam

- Add **`zod@4`** (spec-time floor `4.4.3`, the version the registry mechanism was validated against) as the
  runtime-schema library and **`neverthrow`** as the Result abstraction. Defer `type-fest` until a named
  utility-type consumer lands — the same proven-sharing discipline, applied to an external dependency.
  `cli-git-executor` owns the `execa` dependency; the kernel does not add it.
- Re-export the small Result surface the CLI consumes — `Result`, `ResultAsync`, `ok`, `err`, and boundary adapters
  — from `kernel/result.ts`. **The kernel is the only module that imports `neverthrow`;** callers import the Result
  surface from the kernel. This centralizes the dependency edge and import path (one upgrade point, one place to
  find all usages) and preserves reversibility. It does **not** fully abstract neverthrow's method API
  (`.map` / `.andThen` / `.isOk()`), which consumers use directly — a wholesale library swap would still touch
  those call sites unless the seam later adapts the type behind its own interface.
- The kernel carries no command behavior or subsystem-specific orchestration.

### 3. Shared primitives (the vocabulary)

The kernel owns Zod schemas — with `z.infer` types and narrowers derived from them — for vocabulary shared across
multiple subsystems. The kernel becomes each primitive's authoritative owner, and the pattern is **uniform**: the
definition moves **into** the kernel, and the old location is left as a **thin re-export shim** so existing
importers compile unchanged while new/boundary consumers import from the kernel. (The kernel cannot import upward or
sideways per §1, so ownership *is* physical residence — a re-export from a primitive's old home would violate the
invariant.) Only genuinely subsystem-*owned* values stay put (the fencing clause above). Wholesale importer
migration off the shims is deferred to the complete-migration follow-up (closed priority surface).

**Confirmed today** — verified against the tree, each with 2+ real consumers:

- **Parse-boundary enums** `WorkUnitState` (`Planning` / `Active` / `Integrating` / `Shipped`), `WorkClass`, and
  `Priority` — the values that narrow the `**State:**`, `**Class:**`, and `**Priority:**` meta fields, plus the
  `validateState` / `validatePriority` / `validateClass` narrowers and `WORK_UNIT_STATE_ORDER`. Move from
  `commands/active/types.ts` into the kernel; `commands/active/types.ts` re-exports them and keeps its
  command-specific contracts (`ActiveLayout`, `MetaFileCandidate`, `ActiveSessionInitResult`, …).
- **Validated slugs** — the work-unit / cohort slug primitive (`SLUG_PATTERN` / `isSlugSafe`, ~10 consumers). Move
  from `lib/work-unit/slug.ts` into the kernel; `lib/work-unit/slug.ts` re-exports. The one inline duplicate
  (`lifecycle-tail.ts`) migrates opportunistically (not required by this WU).

**Candidates — membership gated at implementation** against the two-consumer test; direction is settled, the exact
set is open (see Open Questions):

- **Branch-name and artifact-prefix primitives.** Today these are *scattered* — local literals and per-call regexes
  (`CHEAP_BRANCH_PREFIX` local to `teardown.ts`, a non-exported `META_PREFIX` in `meta-reader.ts`, artifact-filename
  regexes in `decompose-cut-map.ts`) — with no single shared exported primitive. (Already well-owned *subsystem*
  primitives — e.g. the errand policy's exported `ERRAND_BRANCH_TYPES` — stay with their subsystem under the §1
  entry gate's fencing clause; they are neither scattered nor kernel candidates.) Consolidating the
  genuinely-scattered literals into a kernel primitive is a judgment made against the gate during implementation,
  not a confirmed move today.
- **Configuration primitives** already stable across consumers — the exact set confirmed against the gate during
  implementation.

**Explicitly fenced off** (subsystem-owned; they *consume* the kernel's primitives, they do not migrate in): the
derived `LifecycleState` lattice and its `(phase, location)` position machinery — a computed projection, not a parse
boundary → owned by `wu-lifecycle-state-model`; and retirement/decompose **record identities** (receipt / preparation
IDs). Keeping them out is what holds the kernel clear of the state-machine behavior its Non-Goals fence off.

### 4. Schema registry and versioning

Adopt Zod 4's native registry (`z.registry`) as the mechanism; the kernel wraps it thinly. The wrapper API — pinned
by a spike against `zod@4.4.3` — is:

```ts
type MigrationPosture = "strict-current" | "backward-compatible";

interface KernelSchemaMeta {
  id: string;              // stable string identity → maps to JSON Schema $id
  version: number;         // schema version (registry metadata; never emitted into JSON Schema)
  migrationPosture: MigrationPosture;
}

interface KernelRegistry {
  register<T extends z.ZodType>(schema: T, meta: KernelSchemaMeta): T; // throws on duplicate id
  get(id: string): z.ZodType | undefined;
  meta(id: string): KernelSchemaMeta | undefined;
  ids(): string[];         // from the parallel identity index (a z.registry() is not iterable)
  toJSONSchema(opts?: { uri?: (id: string) => string }): { schemas: Record<string, JSONSchema> };
}

function createRegistry(): KernelRegistry; // wraps z.registry<KernelSchemaMeta>()
```

Design points the spike validated:

- **Metadata stays out of emitted JSON Schema.** `id` / `version` / `migrationPosture` are held in the registry
  entry, **not** in per-schema `.meta()` — Zod leaks unknown `.meta()` keys into JSON Schema output, whereas custom
  registry metadata does not appear. Only `id` intentionally influences output (it maps to `$id`).
- **Identity enumeration via a parallel index.** A `z.registry()` is not iterable, so `ids()` reads a parallel `Map`
  the wrapper maintains at registration time; that same index enforces the duplicate-id guard (the registry object
  itself does not).
- **Version discriminator policy.** The registry-entry `version` is schema-evolution metadata. A data-level version
  *field* is wired only where a persisted or emitted format already carries one (e.g., the load-set manifest's
  `manifestVersion`). Do not invent version fields solely to satisfy the registry.
- **Migration posture** distinguishes strict current-format parsing (`strict-current`) from backward-compatible
  reads (`backward-compatible`), so consumers can branch on it.

### 5. JSON Schema build machinery

- Generate JSON Schema as a **build artifact** via `z.toJSONSchema(registry, { uri })`, which emits a bundled
  `{ schemas }` map with stable `$id`s and cross-schema `$ref`s (spike-confirmed: a schema referencing another
  registered schema emits `{ "$ref": "<id>.schema.json" }`).
- The build step is **deterministic** (spike-confirmed byte-identical across runs) and is tested for schema
  identity, metadata correctness, and generation stability. Generated files are an *artifact*, never the authoring
  source — the Zod schemas remain authoritative.

### 6. Error taxonomy

- **Evolve the existing `ArcError` base** rather than minting a parallel one. Move the base class, the code shape,
  and the shared/core code vocabulary into `kernel/errors.ts`. The kernel owns the base + the error/Result adapters.
- **Keep terminal presentation in the CLI.** `UserFacingError`, `formatError`, `formatUnexpectedError`, and
  `manifestMissingError` stay in `src/lib/errors.ts` (command-surface rendering the Non-Goals fence off), importing
  the base from the kernel. `src/lib/errors.ts` re-exports the base for existing importers (minimal churn).
- **Open the `code` type.** Change `ArcErrorCode` from today's closed 15-value union to a **namespaced string**. The
  existing `SCREAMING_SNAKE` codes stay verbatim (migrated only by their owner), coexisting with new
  lowercase-dotted namespaced codes (`git.*`, `schema.*`, …); the heterogeneity is accepted, not reconciled.
- **Extend via namespaced codes + domain subclasses.** Each domain subclasses `ArcError` and owns its own namespaced
  codes; per-domain exhaustiveness lives within each domain's own code type, so a new variant never edits a shared
  central union. `cli-git-executor` extends the base with executor-specific process failures.
- **Adapters preserve causes** and boundary-safe details without relying on string matching.

### 7. Canonical data

- **Move the pure canonical core into the kernel** — uniform with the other migrations (§3, §6). `canonical-json.ts`
  (`canonicalize`, `digestBytes`, `canonicalDigest`, `CanonicalDigest`, `isCanonicalDigest`, `assertCanonicalDigest`,
  `sortByCanonicalBytes`) and `managed-path.ts` (`ManagedPath`, `validateManagedPath`, `isManagedPath`) relocate to
  `kernel/canonical/`, and the kernel re-exports their full public surface. These are dependency-minimal
  (`node:crypto`-only), byte-stable, and free of subsystem coupling, so they carry nothing domain-shaped into the
  kernel.
- **Shim at the old paths.** `lib/canonical/canonical-json.ts` and `lib/canonical/managed-path.ts` become thin
  re-export shims pointing at the kernel, so every existing importer — including the co-located domain files below —
  keeps its `./canonical-json.js` / `./managed-path.js` import unchanged. Wholesale migration off the shims is the
  complete-migration follow-up's job.
- **Leave the domain-shaped files co-located** in `lib/canonical/`: `receipt-id.ts` (retirement / preparation IDs;
  imports git-layer `WorktreeSubject`) and `content-digest.ts` (artifact-set / patch shapes). They *consume* the
  kernel's canonical core through the shim; moving them into the kernel would drag git-layer and retirement/decompose
  semantics into it, which the Non-Goals fence off.
- **Byte-stable across the move.** Same implementations, new location: characterization tests assert digests and
  ordering are identical to the pre-move baseline (the cohort's "`lib/canonical/` receipts unchanged" contract).
- **No second canonicalizer.** Any requested change to canonical bytes, ordering, digests, or identity is separate
  design work, out of scope here.

### 8. TypeScript evolution

Runtime schemas remain ordinary TypeScript modules; `z.infer` supplies static types. The architecture depends on no
compiler internals and stays insulated from the TypeScript native-port transition.

## Alternatives & Rationale

- **Schemas centralized by domain (a schema monolith).** Rejected: it separates boundary contracts from their
  semantic owners and turns the kernel into the dependency magnet the design is built to avoid. Co-location + a
  proven-sharing gate keeps the kernel small.
- **TypeScript types as source, validators generated from them.** Rejected: it needs compiler-API coupling and makes
  runtime behavior secondary. Zod-as-source with `z.infer` inverts that correctly — runtime validation is primary,
  types are derived.
- **A bespoke schema registry.** Rejected in favor of Zod 4's native `z.registry` + `z.toJSONSchema`, which the
  spike confirmed cover typed metadata (held off the emitted schema), non-iterable-registry identity enumeration via
  a parallel index, and deterministic bundled generation with `$id`/`$ref`. The kernel wraps them thinly rather than
  reimplementing.
- **Hand-written discriminated result unions.** Viable but rejected in favor of neverthrow's mature composition; the
  narrow adapter seam preserves reversibility if neverthrow's trajectory ever warrants a swap.
- **Minting a parallel error base.** Rejected: `ArcError` already carries a machine-readable `code` and pairs with
  `UserFacingError` + `formatError`. Evolving it (opening the code type, subclassing) reuses the working base;
  a parallel base would fork the taxonomy.
- **Replacing the canonical JSON implementation.** Rejected: the cohort needs adoption of the existing byte-stable
  core, not a wire-format redesign.
- **A `core/` layering tier (`lib/core/kernel/`).** Rejected: `lib/` is flat today, a one-child `core/` advertises
  siblings that (by the "one small kernel" premise) don't exist, and a broader `core/` namespace worsens the
  dependency-magnet risk. The proven-sharing gate, not a folder, is the control.

## Cross-cutting Considerations

- **Migration / churn strategy.** Every primitive the kernel takes ownership of leaves a thin re-export shim at its
  old location, so the change compiles with no importer churn beyond the kernel's own needs. Wholesale importer
  migration is explicitly deferred to the complete-migration follow-up WU (the cohort's closed priority surface).
- **TECHNICAL-OVERVIEW update (pending).** Neither Zod 4 nor neverthrow appears in `TECHNICAL-OVERVIEW.md` today.
  Adding them is architecture-significant. Per the document's event-driven update trigger, the overview edit rides
  the implementation commit that adds `zod` + `neverthrow` to `package.json` — **not** this spec commit (nothing
  lands at spec time). This spec records the pending update so it is not lost.
- **Byte-stability / canonical compatibility.** Canonical digests and ordering must not change. Add characterization
  tests where existing coverage does not already prove the current behavior, and assert identical output across any
  re-export boundary the kernel introduces.
- **Testing.** Unit coverage for every shared primitive; registry duplicate/invalid registration; version metadata;
  error adaptation; Result adapters; and deterministic JSON Schema generation. Compile-time assertions where an
  inferred public type could silently widen or narrow. Test files typecheck under the separate test config — run
  `typecheck:all` before declaring types green.
- **Dependency-direction enforcement.** The kernel's bottom-of-graph invariant is verified — by an import audit or a
  dependency-lint rule — so a regression that makes the kernel import upward is caught.
- **Package / build size.** Measure package and build-output growth after adding the dependencies. Unexpected
  material growth is a stop-and-investigate signal, not an automatic rollback.
- **Pre-implementation re-checks.** Re-confirm the Zod registry behaviors against the pinned Zod version, and
  re-check neverthrow's maintenance status, immediately before implementation. A negative neverthrow result changes
  the library choice, not the Result seam.
- **User-facing impact.** None direct — this is internal CLI substrate. Error *rendering* is unchanged
  (`formatError` behavior preserved); only the code *type* opens.

## Success Criteria

Validated at work-unit completion:

- Zod schemas are the source of truth for every migrated shared primitive, with TypeScript types via `z.infer`; a
  compile-time assertion confirms no handwritten duplicate type remains for a migrated primitive.
- `createRegistry` supports `register` / `get` / `meta` / `ids` / `toJSONSchema`; duplicate-id registration is
  rejected; registry metadata (`version` / `migrationPosture`) is **absent** from generated JSON Schema.
- JSON Schema generation is deterministic (byte-identical across runs) and emits a bundled `{ schemas }` map with
  stable `$id`s and cross-schema `$ref`s; a test asserts identity, metadata, and stability.
- `ArcError`'s `code` type is a namespaced string; existing `SCREAMING_SNAKE` codes are preserved verbatim; a domain
  subclass adds namespaced codes without editing any shared union; `UserFacingError` / `formatError` behavior is
  unchanged.
- The Result surface (`Result` / `ResultAsync` / `ok` / `err` + adapters) is re-exported from the kernel, and the
  kernel is the **only** module importing `neverthrow`.
- The pure canonical core is owned by the kernel (moved in, re-exported), with shims preserving the old
  `lib/canonical/` paths; canonical digests and ordering are byte-identical to the pre-change baseline
  (characterization tests); `receipt-id.ts` and `content-digest.ts` remain co-located in `lib/canonical/`.
- The kernel imports nothing from elsewhere in `src/` (`commands/`, `prompts/`, or any other `lib/` module) — only
  external libraries and Node builtins — verified by the dependency-direction check (absolute, no allow-list).
- All quality gates pass: markdown lint, `typecheck:all`, `lint:ts`, full test suite, and build.

## Open Questions

Genuine implementation detail, resolved during the work — no settle-able design left open:

- **The exact set of gated-candidate primitives** — the configuration primitives, plus any branch-name /
  artifact-prefix value — that enters the kernel's initial inventory. Bounded, resolved by applying the two-consumer
  gate against the tree during implementation. (Direction is settled: only already-stable, proven-shared values,
  consolidated where they are scattered today; the open particular is which specific values clear the gate.)
- **The final internal file layout** inside `kernel/` (how `schema/` subdivides, whether `result` and `errors` are
  single files or folders) — an ordinary internal-structure choice, settled as the code takes shape.
