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
  newly discovered wholesale target to `cli-substrate-complete-migration`, not this kernel.
- Define session state-machine behavior, configuration-axis reform, or storage policy.
- Change canonical JSON ordering, digesting, or serialization semantics.
- Use the TypeScript compiler API to derive runtime schemas.
- Absorb terminal presentation (`UserFacingError` / `formatError`) or subsystem-owned records — the derived
  `LifecycleState` lattice and retirement/decompose record identities stay with their owning subsystems.

## Proposed Design

The kernel is `src/lib/kernel/` — a flat module under `lib/` (matching the existing flat `lib/` convention),
guarded by a strict vocabulary gate rather than a folder namespace. The design has eight parts.

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
  canonical core in `lib/canonical/` all move **into** the kernel, each old location temporarily left as a downward
  re-export shim (§3, §6, §7). The kernel never reaches up or sideways to them.
- **Proven-sharing vocabulary gate.** A domain value, schema, type, literal, or validator enters the shared
  vocabulary only once it has **two or more real consumers in the current codebase**. Anticipated fan-member need
  does not qualify a single-consumer vocabulary candidate, and shared use does not override a fenced-off semantic
  owner. Explicitly chartered infrastructure in this design—the registry, Result seam, error base/adapters, and
  artifact machinery—establishes new cohort boundaries and is not a vocabulary candidate. This gate, not the module
  name, controls dependency-magnet growth without contradicting the kernel's foundational purpose.
- **Explicit public barrel.** `kernel/index.ts` uses named exports for only the Result seam, schema-backed shared
  vocabulary, public registry contracts/factories, public error contracts/adapters, and pure canonical surface
  specified in §§2-7. A test-only source allow-list covers both values and type-only exports and rejects wildcard
  exports. Native Zod registry/projection objects, the schema artifact writer, `LegacyArcErrorCode`, and
  domain-owned records remain internal. Documented Zod types inside `KernelRegistry` signatures are part of that
  wrapper contract, not a re-export of Zod's registry surface.

### 2. Dependencies and the Result seam

- Add **`zod@4`** (spec-time floor `4.4.3`, the version the registry mechanism was validated against) as the
  runtime-schema library and **`neverthrow`** as the Result abstraction. Defer `type-fest` until a named
  utility-type consumer lands — the same proven-sharing discipline, applied to an external dependency.
  `cli-git-executor` owns the `execa` dependency; the kernel does not add it.
- Re-export the small Result surface the CLI consumes — `Result`, `ResultAsync`, `ok`, `err`, `fromThrowable`, and
  `fromAsyncThrowable` — from `kernel/result.ts`. The adapters are neverthrow's native safe-function constructors,
  not custom eager wrappers: callers supply the mapper from the exact thrown or rejected `unknown` into their error
  type. Cause preservation belongs to that mapped error contract rather than the generic Result adapter.
  **`kernel/result.ts` is the only source module that imports `neverthrow`;** callers import the Result surface from
  the kernel. This centralizes the dependency edge and import path (one upgrade point, one place to find all usages)
  and preserves reversibility. It does **not** fully abstract neverthrow's method API
  (`.map` / `.andThen` / `.isOk()`), which consumers use directly — a wholesale library swap would still touch
  those call sites unless the seam later adapts the type behind its own interface.
- The kernel carries no command behavior or subsystem-specific orchestration.

### 3. Shared primitives (the vocabulary)

The kernel owns Zod schemas — with `z.infer` types and narrowers derived from them — for vocabulary shared across
multiple subsystems. The kernel becomes each primitive's authoritative owner, and the pattern is **uniform**: the
definition moves **into** the kernel, and the old location is temporarily left as a **thin re-export shim** so existing
importers compile unchanged while new/boundary consumers import from the kernel. (The kernel cannot import upward or
sideways per §1, so ownership *is* physical residence — a re-export from a primitive's old home would violate the
invariant.) Only genuinely subsystem-*owned* values stay put (the fencing clause above). These are rollout seams,
not permanent compatibility policy: `cli-substrate-complete-migration` migrates all remaining first-party importers
and removes the re-exports after the six contract-owning members land.

**Confirmed today** — verified against the tree, each with 2+ real consumers:

- **Parse-boundary enums.** Export `WorkUnitStateSchema` (`Planning` / `Active` / `Integrating` / `Shipped`),
  `WorkClassSchema`, and `PrioritySchema`; derive `WorkUnitState`, `WorkClass`, and `Priority` with `z.infer`. Move
  the `validateState` / `validatePriority` / `validateClass` narrowers and `WORK_UNIT_STATE_ORDER` from
  `commands/active/types.ts` into the kernel. Strict recognition delegates to the schemas; `validateClass()` derives
  its case-insensitive display-value matching from `WorkClassSchema.options`. `commands/active/types.ts` re-exports
  the migrated surface and keeps its command-specific contracts (`ActiveLayout`, `MetaFileCandidate`,
  `ActiveSessionInitResult`, …).
- **Validated slugs.** Export `SLUG_PATTERN`,
  `SlugSchema = z.string().regex(SLUG_PATTERN).brand<"Slug">()`, the schema-inferred `Slug` type, and
  `isSlugSafe(value: string): value is Slug`. The guard delegates to `SlugSchema.safeParse()`, so parsed and
  guard-narrowed values carry the static brand without changing the runtime string. Move the work-unit / cohort slug
  primitive from `lib/work-unit/slug.ts` into the kernel; `lib/work-unit/slug.ts` re-exports it.

The initial kernel vocabulary is closed to those confirmed primitives. Two consumers alone do not establish neutral
ownership:

- `META_PREFIX`, `CHEAP_BRANCH_PREFIX`, and other local branch/artifact literals stay with their current subsystems.
- `cli-layout-resolver` owns placement, prefix, suffix, and path-token schemas plus their resolver; it composes the
  neutral kernel `Slug` rather than sourcing layout vocabulary from the kernel.
- Configuration-boundary schemas remain with `cli-validation-surfaces`, while existing config, recipe, manifest,
  and path constants remain with their current semantic owners.
- The duplicate slug regex in `lifecycle-tail.ts` remains for the contract-owning WU; the post-cohort
  `cli-substrate-complete-migration` sweep owns its mechanical replacement.

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
  readonly id: string;              // stable string identity → maps to JSON Schema $id
  readonly version: number;         // schema version (registry metadata; never emitted into JSON Schema)
  readonly migrationPosture: MigrationPosture;
}

type KernelJSONSchema = z.core.JSONSchema.BaseSchema;
interface KernelJSONSchemaBundle {
  schemas: Record<string, KernelJSONSchema>;
}

interface KernelRegistry {
  register<T extends z.ZodType>(schema: T, meta: KernelSchemaMeta): T;
  get(id: string): z.ZodType | undefined;
  meta(id: string): KernelSchemaMeta | undefined;
  ids(): readonly string[];
  toJSONSchema(opts?: { uri?: (id: string) => string }): KernelJSONSchemaBundle;
}

function createRegistry(): KernelRegistry;       // empty registry
function createKernelRegistry(): KernelRegistry; // fresh registry containing the built-in vocabulary
```

Design points the spike validated:

- **Metadata stays out of emitted JSON Schema.** `id` / `version` / `migrationPosture` are held in the registry
  entry, **not** in per-schema `.meta()` — Zod leaks unknown `.meta()` keys into JSON Schema output, whereas custom
  registry metadata does not appear. Only `id` intentionally influences output (it maps to `$id`).
- **Validated, atomic registration.** Before either store mutates, registration requires `id` to match the existing
  lowercase ASCII `SLUG_PATTERN` and rejects an invalid `id`, a `version` that is not a positive safe integer, an
  unsupported migration posture, a duplicate `id`, or a schema instance already registered under another identity.
  The safe identity grammar makes direct `.schema.json` URI projection unambiguous and makes lexicographic,
  code-point, and UTF-8 byte ordering agree. The wrapper owns these guarantees rather than relying on
  version-sensitive Zod duplicate handling. It stores a frozen metadata copy, returns that immutable value from
  `meta()`, and returns a fresh code-point-sorted array from `ids()`.
- **Identity enumeration via a parallel index.** A `z.registry()` does not expose public iteration, so `get()`,
  `meta()`, and `ids()` read a parallel `Map` maintained with the native registry at registration time.
- **One active schema per identity.** The registry-entry `version` describes evolution of the one schema currently
  registered under an `id`; the kernel does not retain historical versions. A data-level version *field* is wired
  only where a persisted or emitted format already carries one (e.g., the load-set manifest's `manifestVersion`).
  Do not invent version fields solely to satisfy the registry. A future consumer that needs historical-version
  selection owns that catalog above this kernel.
- **Migration posture** distinguishes strict current-format parsing (`strict-current`) from backward-compatible
  reads (`backward-compatible`), so consumers can branch on it.
- **Fresh composition.** `createRegistry()` returns an empty wrapper. `createKernelRegistry()` returns a new wrapper
  on every call, preloaded with the built-ins below, so downstream composition and tests never mutate a singleton.

| Built-in identity  | Schema                | Version | Migration posture |
| ------------------ | --------------------- | ------- | ----------------- |
| `work-unit-state`  | `WorkUnitStateSchema` | `1`     | `strict-current`  |
| `work-class`       | `WorkClassSchema`     | `1`     | `strict-current`  |
| `priority`         | `PrioritySchema`      | `1`     | `strict-current`  |
| `slug`             | `SlugSchema`          | `1`     | `strict-current`  |

### 5. JSON Schema build machinery

- `KernelRegistry.toJSONSchema()` sorts the registered identities by code point, builds an ephemeral
  `z.registry<{ id: string }>()` projection in that order, and passes it to `z.toJSONSchema()` with an explicit
  Draft 2020-12 target. The projection makes JSON Schema identity the only registry metadata visible to the
  converter and makes registration order irrelevant.
- The wrapper's default URI mapping appends `.schema.json` directly to the registered ASCII `id`; no normalization
  or encoding layer is needed. A caller may supply another deterministic mapping. Registered cross-schema
  composition therefore emits stable external `$ref`s instead of duplicate inline definitions. The initial four
  independent built-ins do not invent an artificial composite merely to put a `$ref` in the artifact; a test-only
  parent/child registry proves reference behavior.
- The generated artifact is `dist/schemas/kernel.json`, serialized with two-space indentation and one terminal
  newline. The writer creates its parent directory, writes a same-directory temporary file, and atomically renames
  it into place, so failed generation never leaves a partial artifact reported as current.
- `tsup.config.ts` invokes the writer through its async `onSuccess` callback after the clean JavaScript build. The
  package and root `build` script shapes remain unchanged, and no additional TypeScript runner dependency is needed.
- Unit tests generate into isolated temporary directories and compare exact bytes across reversed registration
  orders. The existing E2E global build setup asserts that both `dist/cli.js` and `dist/schemas/kernel.json` exist
  after either its local build or CI's `ARC_E2E_SKIP_BUILD=1` path; the flag skips only the build invocation. Tests
  do not launch a nested build that races the shared `dist/` directory. Generated files are artifacts, never
  authoring sources — the Zod schemas remain authoritative.

### 6. Error taxonomy

- **Evolve the existing `ArcError` base** rather than minting a parallel one. Move the base class, the code shape,
  and the shared/core code vocabulary into `kernel/errors.ts`. The kernel owns the base + the error/Result adapters.
- **Keep terminal presentation in the CLI.** `UserFacingError`, `formatError`, `formatUnexpectedError`, and
  `manifestMissingError` stay in `src/lib/errors.ts` (command-surface rendering the Non-Goals fence off), importing
  the base from the kernel. `src/lib/errors.ts` re-exports the base for existing importers (minimal churn).
- **Open the `code` type without discarding typo safety.** Keep today's 15 `SCREAMING_SNAKE` literals as the frozen
  internal `LegacyArcErrorCode` vocabulary and define the public `ArcErrorCode` as that union plus
  `` `${Lowercase<string>}.${Lowercase<string>}` ``. Existing codes stay verbatim, while every new shared or domain
  code must carry a lowercase dotted namespace; an accidental new bare code is not assignable.
- **Preserve the constructor and add idiomatic cause support.** `ArcError` keeps
  `new ArcError(message, code)` source-compatible and accepts an optional third `ErrorOptions` argument, passed to
  the native `Error` constructor. The old-path re-export and direct kernel export are the same constructor object,
  so `UserFacingError instanceof ArcError` continues to work across either import path.
- **Extend via namespaced codes + domain subclasses.** Each domain subclasses `ArcError` and owns its own closed
  namespaced code type; per-domain exhaustiveness lives there, so a new variant never edits the shared base type.
  The registry proves the pattern with exported `SchemaError` / `SchemaErrorCode` and the exact codes
  `schema.registry.duplicate-identity`, `schema.registry.duplicate-schema`, and
  `schema.registry.invalid-metadata`. `SchemaError` narrows its readonly `code` to `SchemaErrorCode`, sets its name to
  `SchemaError`, and mirrors the base constructor as
  `(message: string, code: SchemaErrorCode, options?: ErrorOptions)`, including native cause support.
  `cli-git-executor` later extends the base with executor-specific failures.
- **Adapt unknown failures without leaking them.** Export
  `toArcError(value, { code, message })`: an existing `ArcError` is returned by identity, a plain `Error` is retained
  as the `cause` of a new stable fallback error, and a string, object, or nullish thrown value produces the fallback
  without being stringified, copied into public fields, or retained as a cause. Terminal formatters never render
  cause or stack details.

### 7. Canonical data

- **Move the pure canonical core into the kernel** — uniform with the other migrations (§3, §6). `canonical-json.ts`
  (`canonicalize`, `digestBytes`, `canonicalDigest`, `CanonicalDigest`, `isCanonicalDigest`, `assertCanonicalDigest`,
  `sortByCanonicalBytes`) and `managed-path.ts` (`ManagedPath`, `validateManagedPath`, `isManagedPath`) relocate to
  `kernel/canonical/`, and the kernel re-exports their full public surface. These are dependency-minimal
  (`node:crypto`-only), byte-stable, and free of subsystem coupling, so they carry nothing domain-shaped into the
  kernel.
- **Temporary re-exports at the old paths.** `lib/canonical/canonical-json.ts` and
  `lib/canonical/managed-path.ts` become thin
  re-export shims pointing at the kernel, so every existing importer — including the co-located domain files below —
  keeps its `./canonical-json.js` / `./managed-path.js` import unchanged. `cli-substrate-complete-migration` owns
  wholesale migration off and removal of these rollout seams.
- **One public binding through both paths.** The kernel barrel re-exports the complete canonical surface, while each
  old-path shim re-exports its exact kernel file. Old and direct imports therefore resolve to the same runtime
  functions and equivalent `CanonicalDigest` / `ManagedPath` types rather than parallel wrappers or declarations.
- **Leave the domain-shaped files co-located** in `lib/canonical/`: `receipt-id.ts` (retirement / preparation IDs;
  imports git-layer `WorktreeSubject`) and `content-digest.ts` (artifact-set / patch shapes). They *consume* the
  kernel's canonical core through the shim; moving them into the kernel would drag git-layer and retirement/decompose
  semantics into it, which the Non-Goals fence off.
- **Byte-stable across the move.** Same implementations, new location: characterization tests assert digests and
  ordering are identical to the pre-move baseline (the cohort's "`lib/canonical/` receipts unchanged" contract).
  Characterization runs against the current path before relocation; cross-path identity and type-equivalence tests
  land with the shims after the kernel path exists.
- **No second canonicalizer.** Any requested change to canonical bytes, ordering, digests, or identity is separate
  design work, out of scope here.

### 8. TypeScript evolution

Runtime schemas remain ordinary TypeScript modules; `z.infer` supplies static types. The architecture depends on no
compiler internals and stays insulated from the TypeScript native-port transition.

## Alternatives & Rationale

- **Schemas centralized by domain (a schema monolith).** Rejected: it separates boundary contracts from their
  semantic owners and turns the kernel into the dependency magnet the design is built to avoid. Co-location + a
  proven-sharing vocabulary gate keeps the kernel small.
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
  dependency-magnet risk. The proven-sharing vocabulary gate, not a folder, is the control.

## Cross-cutting Considerations

- **Migration / churn strategy.** Every primitive the kernel takes ownership of leaves a temporary thin re-export
  at its old location, so this head member compiles without coupling five fan branches to importer churn.
  `cli-substrate-complete-migration` then migrates all remaining first-party consumers and removes the rollout seams
  before the cohort can close.
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
- **Dependency-direction enforcement.** A test-only TypeScript parser and Node16 resolver audit scans ordinary
  imports plus TypeScript/CommonJS loader forms. Inside the kernel it rejects non-literal dynamic imports, external
  import-equals declarations, `require()` / `module.require()`, and `createRequire()` acquisition rather than
  leaving unchecked escape forms. Across all TypeScript under `src/`, it recognizes literal module references in
  ES, TypeScript, and CommonJS forms and permits `neverthrow` only in `src/lib/kernel/result.ts`. It adds no
  production script or runtime dependency and does not globally forbid unrelated computed imports outside the
  kernel.
- **Package / build size.** Measure the CLI workspace package and build-output growth after adding the dependencies,
  using the completed esbuild metafile to reconcile input attribution. A minimal temporary workspace created from
  the exact manifests and lockfile measures the production-install footprint with
  `npm ci --omit=dev --ignore-scripts`, so external dependency bytes and package count remain visible. `zod` and
  `neverthrow` stay external or tree-shaken rather than becoming vendored `node_modules` inputs to `dist/cli.js`.
  Report every absolute and percentage change without an arbitrary numerical threshold; unexplained inputs,
  unexpected package files, accidental dependency bundling, or unattributed installed dependencies stop for
  correction, while explained growth is review evidence rather than an automatic rollback.
- **Pre-implementation re-checks.** Re-confirm the Zod registry behaviors against the pinned Zod version, and
  re-check neverthrow's maintenance status, immediately before implementation. A negative neverthrow result changes
  the library choice, not the Result seam.
- **User-facing impact.** None direct — this is internal CLI substrate. Error *rendering* is unchanged
  (`formatError` behavior preserved); only the code *type* opens.

## Success Criteria

Validated at work-unit completion:

- `WorkUnitStateSchema`, `WorkClassSchema`, `PrioritySchema`, and branded `SlugSchema` are the runtime authorities for
  the closed initial vocabulary; their TypeScript types derive through `z.infer`, and old paths contain re-exports
  rather than handwritten duplicate declarations.
- `createRegistry` supports `register` / `get` / `meta` / `ids` / `toJSONSchema`; duplicate identities and schema
  instances are rejected before mutation, identities obey the ASCII slug grammar, and registry metadata is
  immutable and absent from generated JSON Schema.
- `createKernelRegistry` returns a fresh registry containing the four named version-1 built-ins. JSON Schema
  generation is byte-identical across registration orders, emits stable `$id`s, and emits stable cross-schema
  `$ref`s for composed registered schemas; the build publishes the exact bundle at `dist/schemas/kernel.json`.
- `ArcErrorCode` preserves the 15 legacy literals and accepts lowercase dotted extensions while rejecting new bare
  codes. `SchemaError` adds its three local registry codes without editing the base, `toArcError` preserves only
  safe causes, `SchemaError.code` remains narrowed to its local code type, and the old-path constructor identity plus
  `UserFacingError` / `formatError` behavior are unchanged.
- `kernel/index.ts` exposes only the explicit named Result, vocabulary, registry, error, and canonical contracts;
  native Zod registry/projection objects, the artifact writer, `LegacyArcErrorCode`, and domain-owned records remain
  internal.
- The Result surface (`Result` / `ResultAsync` / `ok` / `err` / `fromThrowable` / `fromAsyncThrowable`) is
  re-exported from the kernel, and `src/lib/kernel/result.ts` is the **only** source module importing `neverthrow`.
- The pure canonical core is owned by the kernel (moved in, re-exported), with temporary shims preserving the old
  `lib/canonical/` paths; canonical digests and ordering are byte-identical to the pre-change baseline
  (characterization tests); `receipt-id.ts` and `content-digest.ts` remain co-located in `lib/canonical/`. The
  remaining first-party importer migration and shim removal belong to `cli-substrate-complete-migration`.
- The kernel imports nothing from elsewhere in `src/` (`commands/`, `prompts/`, or any other `lib/` module) — only
  external libraries and Node builtins — verified by the dependency-direction check (absolute, no allow-list).
- The completed metafile, package file list, and isolated production-install footprint reconcile with the pre-change
  baseline; no unexplained input, unexpected packaged file, accidentally bundled dependency, or unattributed
  installed dependency remains.
- All quality gates pass: markdown lint, `typecheck:all`, `lint:ts`, full test suite, and build.

## Open Questions

Genuine implementation detail, resolved during the work — no settle-able design left open:

- **The final internal file layout** inside `kernel/` (how `schema/` subdivides, whether `result` and `errors` are
  single files or folders) — an ordinary internal-structure choice, settled as the code takes shape.
