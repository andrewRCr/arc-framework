# Task List: CLI Schema Kernel

- **Design:** `spec-cli-schema-kernel.md`

---

## **Phase 1:** Kernel boundary and dependency seam

_Purpose:_ Establish the bottom-of-graph module, its dependency baseline, and the bounded Result surface before
moving shared primitives into it.

### `[x]` **1.1 Establish the kernel package boundary and dependency baseline**

- _Goal:_ The CLI has a buildable, documented kernel entry point backed by validated dependency choices and a
  reproducible pre-change footprint baseline.

    - `[x]` **1.1.a Capture the pre-kernel build and package baseline**
        - At `acb2619aa6c4a42509bf87ea1b11350dc623dbcd` with Node `v26.3.0` and npm `11.16.0`, the clean build
          produced a 1,388,051-byte `dist/cli.js` and 5,396,824 total `dist/` bytes. Its metafile attributed
          1,373,373 output bytes across 351 inputs. The dry-run package contained 166 files totaling 1,663,152
          packed and 6,699,230 unpacked bytes. An isolated production install occupied 513,008 bytes across 15
          packages.

    - `[x]` **1.1.b Reconfirm and add the runtime dependencies**
        - Reconfirmed Zod `4.4.3` metadata isolation, duplicate identity control, `$id`/external `$ref` projection,
          and deterministic sorted output in an isolated spike. Neverthrow `8.2.0` remains maintained, supports
          Node 18+, and typechecks under the CLI's Node16/TypeScript 6 configuration. Added only `zod@^4.4.3` and
          `neverthrow@^8.2.0` to the CLI workspace and root lockfile.

    - `[x]` **1.1.c Establish the kernel entry surface and architecture record**
        - Added the explicit `src/lib/kernel/index.ts` public boundary and documented the bottom-of-graph kernel,
          Zod schema authority, and bounded neverthrow seam in `TECHNICAL-OVERVIEW.md`; internal subdirectories
          remain demand-created as their owning modules land.

- _Outcome:_ The CLI now has a buildable kernel boundary, validated runtime dependencies, and a reproducible
  pre-change artifact/install baseline for the Phase 6 footprint comparison.

### `[x]` **1.2 Expose the bounded Result seam and boundary adapters**

- _Goal:_ CLI modules can compose typed success and failure through one kernel-owned import path without importing
  `neverthrow` directly or committing the codebase to an imagined full abstraction.

    - `[x]` **1.2.a Define the kernel Result export contract**
        - Added the explicit `result.ts` and kernel-barrel exports for `Result`, `ResultAsync`, `ok`, `err`,
          `fromThrowable`, and `fromAsyncThrowable`, with type and runtime coverage for synchronous/asynchronous
          narrowing and ordinary Result transformations.

    - `[x]` **1.2.b Add exception-to-Result boundary adapters**
        - Kept exception adaptation on neverthrow's native safe-function constructors and verified unchanged success
          values plus exact mapper inputs for synchronous throws, pre-promise throws, and promise rejections.

- _Outcome:_ All typed success/failure composition now enters through one kernel-owned path while retaining the
  dependency's ordinary method API and caller-owned error mapping.

### `[x]` **1.3 Enforce bottom-of-graph kernel imports**

- _Goal:_ Any kernel import that reaches another `src/` module fails automatically, while kernel-internal, Node
  builtin, and approved external-library imports remain valid.

    - `[x]` **1.3.a Build a resolved import-boundary audit**
        - Added a test-only TypeScript AST and Node16-resolution audit covering nested kernel imports, every named
          static/dynamic/type/re-export form, forbidden CommonJS and `createRequire` loader escape forms, approved
          external packages, and repository-wide neverthrow seam enforcement.

    - `[x]` **1.3.b Wire the live kernel graph into the ordinary test gate**
        - The ordinary unit suite now audits every live kernel source and reports stable file/specifier/reason
          findings without an internal-path allow-list.

- _Outcome:_ The kernel's bottom-of-graph contract and single neverthrow import edge are executable invariants in
  the default unit-test gate rather than architectural convention alone.

## **Phase 2:** Schema-backed shared vocabulary

_Purpose:_ Move only proven-shared primitives into the kernel as Zod-authoritative contracts while preserving every
existing import path through temporary downward re-exports. `cli-substrate-complete-migration` owns the later
first-party importer migration and removal of these rollout seams.

### `[ ]` **2.1 Migrate work-unit state, class, and priority vocabulary**

- _Goal:_ Work-unit metadata vocabulary has one runtime-validating Zod authority whose inferred types and existing
  narrowers preserve every current parse behavior.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §3's confirmed parse-boundary enums.

    - `[ ]` **2.1.a Move lifecycle-state vocabulary into kernel schemas**
        - Define `WorkUnitStateSchema`, derive `WorkUnitState` with `z.infer`, and move
          `WORK_UNIT_STATE_ORDER` into the kernel; retain exact casing and the
          `Planning` → `Active` → `Integrating` → `Shipped` ordering.
        - Implement `validateState()` through `WorkUnitStateSchema.safeParse()` so the schema is the runtime
          authority while the narrower preserves its `unknown` fallback.
        - Build `test-first` (one behavior at a time):
            - Every codified value parses and infers as `WorkUnitState`.
            - `In Progress`, `Paused`, `Complete`, `Superseded`, lowercase, empty, whitespace, and missing values
              still narrow to `unknown` through `validateState()`.
            - The ordering record is exhaustive over the schema-inferred type.

    - `[ ]` **2.1.b Move Class and Priority vocabulary into kernel schemas**
        - Define `WorkClassSchema` and `PrioritySchema`, derive their types with `z.infer`, and keep the narrowers'
          established normalization/defaulting semantics separate from strict schema parsing.
        - Delegate final recognition to the schemas: derive `validateClass()`'s case-insensitive display-value match
          from `WorkClassSchema.options`, and implement `validatePriority()` through `PrioritySchema.safeParse()`.
        - Build `test-first` (one behavior at a time):
            - Strict schemas accept only their codified display values.
            - `validateClass()` remains trim- and case-insensitive and returns `[TBD]` for missing/unknown input.
            - `validatePriority()` remains case-sensitive and defaults missing/malformed input to `P3`.

    - `[ ]` **2.1.c Convert the command module to a temporary downward re-export**
        - Re-export the migrated schemas, inferred types, narrowers, and ordering from
          `packages/arc-framework/src/commands/active/types.ts`; retain command-specific interfaces there.
        - Keep existing importers compiling unchanged and add direct-kernel plus old-path equivalence assertions.
        - Use `expectTypeOf` to prove the old and kernel paths expose the same schema-derived types; the old module
          must contain re-exports rather than local declarations for every migrated primitive.

### `[ ]` **2.2 Migrate the validated slug primitive**

- _Goal:_ Work-unit and cohort slugs share one schema-backed path-safety contract while all established callers keep
  their current import path and boolean guard behavior.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §3's validated-slug primitive.

    - `[ ]` **2.2.a Define and validate the kernel slug contract**
        - Move `SLUG_PATTERN` into the kernel, define
          `SlugSchema = z.string().regex(SLUG_PATTERN).brand<"Slug">()`, derive `Slug` with `z.infer`, and implement
          `isSlugSafe(value: string): value is Slug` through `SlugSchema.safeParse()`.
        - Build `test-first` (one behavior at a time):
            - Lowercase alphanumeric segments joined by single hyphens parse successfully.
            - Empty values, uppercase characters, separators, dot segments, and repeated/edge hyphens fail.
            - `isSlugSafe()` agrees with schema success for the complete valid/invalid table.
            - A raw `string` is not assignable to `Slug`; parsed and guard-narrowed values are.

    - `[ ]` **2.2.b Preserve the work-unit import path**
        - Replace `packages/arc-framework/src/lib/work-unit/slug.ts` with a thin downward re-export and keep all
          existing work-unit consumers compiling unchanged.
        - Leave the duplicate slug regex in `src/scripts/review-gate/hosts/github/lifecycle-tail.ts` unchanged;
          `cli-substrate-complete-migration` owns residual duplicate-validator adoption after the contract members
          land.

## **Phase 3:** Versioned registry and generated schemas

_Purpose:_ Provide the discoverable schema registry and deterministic JSON Schema artifact that downstream cohort
members can compose without centralizing their domain-owned schemas.

### `[ ]` **3.1 Implement the versioned kernel registry contract**

- _Goal:_ Callers can register, discover, and inspect schemas through the pinned wrapper API, with stable identities
  and migration metadata enforced independently of Zod's non-iterable registry.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §4.

    - `[ ]` **3.1.a Define registry metadata and migration posture**
        - Implement `MigrationPosture`, readonly `KernelSchemaMeta`, `KernelJSONSchema`, `KernelJSONSchemaBundle`,
          and the public `KernelRegistry` contract in the kernel. One active schema may occupy an identity;
          `version` describes that schema's evolution rather than selecting retained historical versions or
          inventing data-level version fields.
        - Build `test-first` (one behavior at a time):
            - `strict-current` and `backward-compatible` are the only migration postures.
            - Registered metadata is retrievable by schema identity and is not stored through schema `.meta()`.
            - Identities must match the lowercase ASCII `SLUG_PATTERN`; empty, padded, internally spaced,
              URI-delimited, non-ASCII, or ill-formed Unicode identities are rejected before registry mutation.
            - Non-positive-safe-integer versions and invalid postures are rejected before registry mutation.

    - `[ ]` **3.1.b Implement registration, lookup, and identity enumeration**
        - Wrap `z.registry<KernelSchemaMeta>()` with the parallel identity index used by `register()`, `get()`,
          `meta()`, and `ids()`; preflight wrapper invariants instead of relying on Zod's version-sensitive duplicate
          handling.
        - Build `test-first` (one behavior at a time):
            - Registration returns the same schema instance and all lookup methods agree.
            - Duplicate identities and a schema instance registered under another identity throw before either the
              Zod registry or parallel index mutates.
            - Metadata is copied and frozen, caller mutation cannot change it, and `ids()` returns a fresh,
              code-point-sorted readonly view. The validated ASCII identity grammar makes that ordering portable;
              tests cover differently prefixed and segmented valid identities.

### `[ ]` **3.2 Register kernel schemas and produce deterministic JSON Schema**

- _Goal:_ Kernel-owned schemas emit one version-aware, bundled JSON Schema projection with stable identities,
  references, and byte-for-byte repeatability.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §§4-5.

    - `[ ]` **3.2.a Register the kernel-owned vocabulary under stable identities**
        - Expose empty `createRegistry()` and fresh preloaded `createKernelRegistry()` factories; do not expose a
          mutable built-in singleton. Keep subsystem-owned schemas outside the built-in assembly while allowing a
          caller to register them into its fresh composed registry.
        - Register `WorkUnitStateSchema`, `WorkClassSchema`, `PrioritySchema`, and `SlugSchema` under
          `work-unit-state`, `work-class`, `priority`, and `slug`, respectively, each at version `1` with
          `strict-current` posture.

    - `[ ]` **3.2.b Implement bundled JSON Schema conversion**
        - Sort identities by code point, copy the schemas into an ephemeral `z.registry<{ id: string }>()`, and pass
          that projection to `z.toJSONSchema()` with Draft 2020-12 and the caller's URI mapping or the default
          mapping that appends `.schema.json` directly to the validated ASCII `id`; do not add an encoding or
          normalization layer.
        - Build `test-first` (one behavior at a time):
            - Output is a bundled `{ schemas }` record with stable `$id` values under default and custom URI maps.
            - A test-only registered parent/child composition emits `$ref` rather than duplicate inline definitions;
              the independent built-in vocabulary stays free of an artificial composite.
            - `version` and `migrationPosture` never leak into generated schema content.
            - Registries containing the same schemas and metadata produce byte-identical output when registered in
              opposite orders.

### `[ ]` **3.3 Integrate the generated schema artifact with the build**

- _Goal:_ Every production build emits the deterministic kernel schema bundle inside the published `dist/` output,
  and stale or nondeterministic generation fails visibly.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §5 and the package/build-size cross-cutting
  requirement.

    - `[ ]` **3.3.a Build an injectable schema-generation entry**
        - Add an injectable writer that serializes the built-in registry with two-space indentation and one terminal
          newline at `dist/schemas/kernel.json`; separate projection and byte serialization from filesystem writing.
        - Build `test-first` (one behavior at a time):
            - Projection returns the expected schema map without touching disk.
            - File emission creates the parent directory and writes the exact projected bytes.
            - The writer uses a same-directory temporary file plus atomic rename, and generation failure leaves no
              partial final artifact reported as current.

    - `[ ]` **3.3.b Wire schema generation after the clean TypeScript build**
        - Import the writer from `packages/arc-framework/tsup.config.ts` and invoke it through tsup's async
          `onSuccess` callback after the clean JavaScript build; keep the package and root `build` scripts unchanged
          and add no TypeScript runner dependency.
        - Keep the generated file under `dist/` so the existing package `files` allowlist publishes it without
          checking generated output into source control.

    - `[ ]` **3.3.c Prove build-artifact repeatability**
        - Use isolated temporary directories to compare exact serialized bytes and `$id` values across opposite
          registration orders; keep `$ref` target assertions with the test-only composition in Task 3.2.b.
        - Extend the existing E2E global build precondition to require both `dist/cli.js` and
          `dist/schemas/kernel.json` after either path: the one local package build or the
          `ARC_E2E_SKIP_BUILD=1` path that consumes CI's downloaded build artifact. The skip flag bypasses only the
          build invocation, never the artifact assertions.
        - Do not spawn a nested build from an integration test that can race the shared `dist/` directory.

## **Phase 4:** Extensible errors

_Purpose:_ Evolve the existing error base into an open, namespaced taxonomy without moving terminal presentation
into the kernel or changing current user-facing formatting.

### `[ ]` **4.1 Move and open the ArcError base contract**

- _Goal:_ The CLI has one kernel-owned error base that accepts existing and namespaced domain codes without a shared
  union edit, while existing `ArcError` construction remains source-compatible.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §6.

    - `[ ]` **4.1.a Relocate the base error and open its code contract**
        - Move `ArcError` and `ArcErrorCode` into the kernel. Define the frozen existing 15-literal vocabulary as
          internal `LegacyArcErrorCode`, define the public `ArcErrorCode` as that type plus
          `` `${Lowercase<string>}.${Lowercase<string>}` ``, and preserve the two-argument constructor while
          accepting optional third-argument `ErrorOptions` for native cause support.
        - Build `test-first` (one behavior at a time):
            - All 15 existing `SCREAMING_SNAKE` codes remain accepted verbatim.
            - Lowercase-dotted namespaced codes are accepted without editing a shared union, while a new bare code
              is rejected at compile time.
            - Two-argument construction retains `message`, `name`, and `code`; a third `ErrorOptions` argument
              retains its original `Error` as `cause`.

    - `[ ]` **4.1.b Expose the base through the existing error module**
        - Re-export the base and code type from `packages/arc-framework/src/lib/errors.ts` while keeping terminal
          presentation definitions in that file.
        - Replace the previous shared exhaustive-switch test with compile-time legacy/namespaced acceptance and
          bare-code rejection assertions. Assert the old-path and direct-kernel exports are the same constructor and
          that `UserFacingError` remains an instance of it.

### `[ ]` **4.2 Prove namespaced domain extension and cause-preserving adapters**

- _Goal:_ A domain can add exhaustive local error variants and convert unknown failures safely without widening or
  centralizing the shared error vocabulary.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §§2 and 6.

    - `[ ]` **4.2.a Add a representative schema-domain error contract**
        - Define and export `SchemaErrorCode` and `SchemaError` beside the registry with
          `schema.registry.duplicate-identity`, `schema.registry.duplicate-schema`, and
          `schema.registry.invalid-metadata`. Give `SchemaError` a readonly `code: SchemaErrorCode`, set
          `name = "SchemaError"`, and mirror the base constructor as
          `(message: string, code: SchemaErrorCode, options?: ErrorOptions)`; route the corresponding Phase 3
          registration failures through it.
        - Build `test-first` (one behavior at a time):
            - An `assertNever`-style switch over a `SchemaError` instance's `code` proves the three local codes are
              exhaustive within the schema domain.
            - Construction rejects legacy and other-domain codes at compile time, preserves the selected schema
              code and `SchemaError` name, and retains an optional native `Error` cause.
            - Adding the subclass requires no edit to the base `ArcErrorCode` contract.
            - Duplicate identity, duplicate schema instance, and invalid metadata failures expose their stable codes
              without changing the registry's public success types.

    - `[ ]` **4.2.b Add a boundary-safe unknown-error adapter**
        - Export `toArcError(value, { code, message })` from the kernel. Return an existing `ArcError` unchanged;
          otherwise create the caller's stable fallback and retain `value` as `cause` only when it is an `Error`.
        - Build `test-first` (one behavior at a time):
            - Existing `ArcError` values retain their exact object and machine-readable identity.
            - Plain `Error` values remain available through `cause` under the supplied stable code/message.
            - Strings, objects, and nullish throws produce the stable fallback without stringification,
              property-copying, or cause retention.

### `[ ]` **4.3 Preserve terminal presentation in the existing error module**

- _Goal:_ `UserFacingError`, `formatError()`, `formatUnexpectedError()`, and `manifestMissingError()` render exactly
  as before while consuming the kernel-owned base.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §6's presentation boundary.

    - `[ ]` **4.3.a Reground presentation on the moved base**
        - Keep presentation classes/functions in `packages/arc-framework/src/lib/errors.ts` and update only their
          downward dependency on the kernel.
        - Keep the exact output assertions in `packages/arc-framework/__tests__/unit/errors.test.ts` running through
          the old path; add direct-kernel assertions only for constructor identity, base fields, and cause behavior.

    - `[ ]` **4.3.b Validate command and handler compatibility**
        - Typecheck every existing `UserFacingError` and `ArcErrorCode` consumer without wholesale import migration.
        - Confirm unexpected-error formatting emits no stack, cause message, or cause details and current terminal
          strings remain unchanged.

## **Phase 5:** Canonical-data relocation

_Purpose:_ Place the pure canonical trust core inside the kernel with byte-stable behavior and temporary old-path
re-exports, while leaving retirement and decomposition semantics with their current owners.

### `[ ]` **5.1 Characterize and relocate the canonical JSON core**

- _Goal:_ Canonical serialization, digesting, validation, and set ordering are kernel-owned with every existing byte
  vector and old import path preserved exactly.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §7's canonical JSON move and byte-stability
  requirement.

    - `[ ]` **5.1.a Freeze the canonical public contract before relocation**
        - Extend the current old-path golden vectors only where needed to cover every exported function and type;
          do not create the kernel path yet or redesign canonical semantics.
        - Build `test-first` (one behavior at a time):
            - Unicode normalization/order, plain-data rejection, array preservation, and cyclic-input failures remain
              byte-identical.
            - `digestBytes()` has an exact raw-byte digest vector; `canonicalDigest()` and the digest guards preserve
              the `sha256:` wire format.
            - `isCanonicalDigest()` and `assertCanonicalDigest()` narrow accepted values to `CanonicalDigest` while
              malformed values remain rejected at runtime.
            - `sortByCanonicalBytes()` remains deterministic across input permutations.

    - `[ ]` **5.1.b Move the implementation and leave a temporary old-path re-export**
        - Relocate `canonical-json.ts` into `packages/arc-framework/src/lib/kernel/canonical/` without behavior edits;
          the kernel copy may import only `node:crypto` and kernel-local modules.
        - Re-export the complete surface through the public kernel barrel, and replace
          `src/lib/canonical/canonical-json.ts` with a full thin re-export of the exact kernel file so all current
          importers compile and execute unchanged.
        - Assert the old path and kernel barrel expose the same runtime function objects and equivalent
          `CanonicalDigest` types.

### `[ ]` **5.2 Characterize and relocate managed-path validation**

- _Goal:_ Managed paths retain their total repository-relative safety gate and branded type through both the kernel
  authority and old canonical import path.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §7's managed-path move.

    - `[ ]` **5.2.a Freeze managed-path validation and type behavior**
        - Characterize the current old-path contract before creating the kernel path.
        - Build `test-first` (one behavior at a time):
            - Valid repository-relative POSIX paths return unchanged and infer as `ManagedPath`.
            - Absolute, drive-prefixed, empty-segment, leading/interior dot-segment, backslash, NUL, and non-NFC
              paths fail.
            - A raw `string` is not assignable to `ManagedPath`; validated and guard-narrowed strings are.
            - `isManagedPath()` agrees with `validateManagedPath()` without throwing for the valid/invalid table.

    - `[ ]` **5.2.b Move the implementation and leave a temporary old-path re-export**
        - Relocate `managed-path.ts` into the kernel canonical module and replace the old file with a full thin
          re-export of the exact kernel file; export the complete surface through the public kernel barrel.
        - Prove the old path and kernel barrel expose the same runtime functions and equivalent branded
          `ManagedPath` types without changing consumers.

### `[ ]` **5.3 Validate canonical compatibility across downstream consumers**

- _Goal:_ Retirement, decomposition, coupling-audit, and script consumers retain identical behavior while their
  domain-shaped canonical modules remain outside the kernel.
- _Context:_ Implements `spec-cli-schema-kernel.md` Proposed Design §7's domain fencing and migration strategy.

    - `[ ]` **5.3.a Preserve domain ownership and shim-mediated imports**
        - Keep `content-digest.ts` and `receipt-id.ts` in `src/lib/canonical/` with their existing relative imports
          flowing through the shims; do not pull `WorktreeSubject`, artifact sets, or patch shapes into the kernel.
        - Confirm no consumer migration is required beyond any same-concern fix needed to maintain compilation.

    - `[ ]` **5.3.b Run the canonical downstream integration checkpoint**
        - Run targeted canonical, content-digest, receipt, retirement, decomposition, worktree-marker,
          coupling-audit, `validate-decompose-record`, and lifecycle-exit tests plus `npm run typecheck:all` and the
          build before leaving the phase.
        - Treat any digest, ordering, receipt ID, or serialized-record delta as a blocker requiring diagnosis rather
          than an expected relocation effect.

## **Phase 6:** Substrate integration and hardening

_Purpose:_ Exercise the completed kernel as one coherent integration boundary, close exclusivity and compatibility
claims, and assess the dependency and build-output cost before full verification.

### `[ ]` **6.1 Validate kernel exports, rollout seams, and TypeScript authority**

- _Goal:_ The completed kernel is consumable through its intended entry surface, temporary existing-path
  re-exports remain intact for the cohort rollout, and automated checks prove the dependency/type-authority claims
  across the whole substrate.
- _Context:_ Integrates `spec-cli-schema-kernel.md` Proposed Design §§1-8.

    - `[ ]` **6.1.a Close export and dependency exclusivity checks**
        - Keep `packages/arc-framework/src/lib/kernel/index.ts` an explicit named-export barrel and extend the
          test-only source audit with an exact value/type export allow-list covering only:
            - the six Result exports from Task 1.2;
            - the schemas, inferred types, narrowers, ordering, and slug surface from Phase 2;
            - the public registry metadata/contracts and `createRegistry()` / `createKernelRegistry()` factories
              from Phase 3;
            - `ArcError`, `ArcErrorCode`, `SchemaError`, `SchemaErrorCode`, and `toArcError()` from Phase 4; and
            - the complete canonical JSON and managed-path surface from Phase 5.
        - Reject wildcard barrel exports. Keep `LegacyArcErrorCode`, the native Zod registry/projection, the schema
          artifact writer, and domain-owned records internal; documented Zod types inside the public registry
          signatures are allowed and do not constitute an exported Zod registry surface.
        - Extend the Task 1.3 TypeScript-based audit across every TypeScript source beneath
          `packages/arc-framework/src/`, allowing `neverthrow` only in `src/lib/kernel/result.ts`. Cover literal
          module references carried by ES imports/re-exports, import types, dynamic imports, TypeScript external
          import-equals declarations, CommonJS `require()` / `module.require()`, and functions returned by
          `createRequire()`. Retain the existing live kernel-root assertion—including its rejection of unsupported
          loader forms—for the absolute no-upward-import invariant rather than adding a second dependency-check
          mechanism or globally banning unrelated computed imports outside the kernel.

    - `[ ]` **6.1.b Run the substrate integration checkpoint**
        - Rely on the direct/old-path equivalence and type assertions from the owning migration tasks rather than
          adding a redundant omnibus compatibility test.
        - Run `npm run test:unit`, `npm run test:integration`, `npm run lint:ts`, `npm run typecheck:all`, and
          `npm run build`; fix cross-module or declaration-output failures before Task 6.2. E2E remains part of the
          full work-unit verification after Phase 3 has strengthened its global build precondition.

### `[ ]` **6.2 Measure and reconcile dependency and build-output growth**

- _Goal:_ The completed substrate has reproducible schema output and an understood package/build cost, with any
  unexplained expansion corrected before full work-unit verification.
- _Context:_ Implements `spec-cli-schema-kernel.md` Cross-cutting Considerations §§ Package / build size and Testing.

    - `[ ]` **6.2.a Compare the completed build with the recorded baseline**
        - Re-run the Task 1.1 build and
          `npm pack --workspace @arc-framework/cli --dry-run --json` under the recorded toolchain; report absolute
          and percentage changes for `dist/cli.js`, total `dist/`, packed size, unpacked size, and package file count.
        - Recreate Task 1.1's isolated minimal workspace from the completed manifests and lockfile, run
          `npm ci --omit=dev --ignore-scripts`, and report the absolute and percentage changes in installed
          dependency bytes and production package count.
        - Preserve the first build's `dist/schemas/kernel.json` bytes outside `dist/`, run the ordinary build again
          so tsup's existing `clean: true` supplies the second clean output, and compare the two artifacts byte for
          byte. Do not add a separate destructive cleanup step.
        - Inspect the workspace pack result's `files[].path` values and require the exact
          `dist/schemas/kernel.json` path.

    - `[ ]` **6.2.b Explain or resolve build and package growth**
        - Compare the completed `dist/metafile-esm.json` input set and byte attribution with the Task 1.1 baseline.
          Confirm `zod` and `neverthrow` remain external or tree-shaken runtime dependencies rather than vendored
          `node_modules` inputs to `dist/cli.js`; bundled dependency code is accidental entry-graph growth.
        - Attribute the remaining explained changes to kernel source, source maps/declarations, generated schemas,
          package metadata, or the exact installed `zod` / `neverthrow` versions and their transitive production
          dependencies rather than treating raw size alone as failure.
        - Report every absolute and percentage change at the task review interlock. Apply no arbitrary numerical
          threshold: explained growth is review evidence, while any unexplained input, unexpected package file, or
          accidental dependency bundling must be corrected before proceeding.

## **Phase 7:** Verification

_Purpose:_ Verify the complete work unit against its design, success criteria, and project quality standards.

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The completed kernel satisfies `spec-cli-schema-kernel.md`, retains all compatibility promises, and clears
  every work-unit quality and integration gate.

---

## Success Criteria

- `[ ]` `WorkUnitStateSchema`, `WorkClassSchema`, `PrioritySchema`, and branded `SlugSchema` are the runtime
  authorities for the closed initial vocabulary; their types derive through `z.infer`, while existing narrowers and
  import paths preserve established behavior during the cohort rollout.
- `[ ]` `createRegistry()` implements registration, lookup, metadata, stable identity enumeration, and bundled JSON
  Schema conversion; duplicate or invalid registration fails without partial mutation.
- `[ ]` Generated JSON Schema has stable `$id`/`$ref` links, excludes registry-only metadata, is byte-identical
  across repeated builds, and ships inside the package's `dist/` output.
- `[ ]` `ArcError` supports unchanged existing codes and domain-owned namespaced codes without a central union edit;
  causes are preserved safely and terminal presentation remains byte-for-byte compatible.
- `[ ]` The explicit kernel barrel exposes only the designed Result, vocabulary, registry, error, and canonical
  contracts; internal Zod machinery, build writers, legacy type helpers, and domain-owned records do not leak.
- `[ ]` `Result`, `ResultAsync`, `ok`, `err`, and boundary adapters are consumed through the kernel, and no source
  outside `src/lib/kernel/result.ts` imports `neverthrow`.
- `[ ]` Canonical JSON and managed-path primitives are kernel-owned with temporary old-path re-exports; all digest,
  ordering, receipt, and serialized-record compatibility vectors remain unchanged. First-party importer migration
  and removal of these rollout seams are explicitly owned by `cli-substrate-complete-migration`.
- `[ ]` Automated tests prove the kernel imports only kernel-local modules, approved external libraries, and Node
  builtins, with no allow-listed escape into another `src/` module.
- `[ ]` The package/build growth assessment reconciles the completed metafile and package file list with the
  baseline plus the isolated production-install footprint; no unexplained input, unexpected packaged file,
  accidentally bundled dependency, or unattributed installed dependency remains.
- `[ ]` `.arc/reference/TECHNICAL-OVERVIEW.md` accurately records the runtime-schema, Result, and kernel architecture.
- `[ ]` All quality gates pass: Markdown lint, TypeScript lint, `typecheck:all`, full tests, and build.
- `[ ]` Ready for integration.
