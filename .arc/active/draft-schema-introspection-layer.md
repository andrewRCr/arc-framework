# Draft: Schema-Driven CLI Introspection Layer

- **Origin:** [internal] — surfaced 2026-05-17 beside the zod substrate plan (`cli-substrate-adoption`); re-groomed
  2026-10-07 against the schema kernel that shipped since, with `quality-gate-hooks` as a named editor consumer.
- **Purpose:** Publish ARC's registered contracts where their consumers can reach them: a CLI verb that returns any
  schema the production registry composes, with its registry metadata, and self-contained per-schema documents
  installed at a stable project path for editor completion and validation. The projection behind both first emits
  schemas at their real size, on the side their authors write, and valid against the metaschema.

---

## Problem / Motivation

ARC's CLI registers 138 schemas in one composed registry, `createProductionSchemaRegistry()`
(`production-schema-registry.ts`): kernel vocabulary, review, delivery, and session envelope. The build projects it
into the shipped `dist/schemas/kernel.json` (`generateRuntimeSchema` → `writeKernelSchemaArtifact`). Three gaps keep
those contracts out of reach:

1. **No contract is addressable by name.** Nothing reads the bundle at runtime except the build's completeness gates
   (`hasKernelSchemas` in `build-publication.ts` and `build-qualification.ts`), and using it directly means knowing an
   install path that varies by package manager. Two command-local surfaces exist, and they disagree:
    - fifteen review verbs take `--schema` through `handleReviewRequestSchema` (`handlers/review.ts`), which builds a
      review-only registry per call and prints `{rootId, schemas}` from `projectKernelSchemaClosure`, with no version
      or posture;
    - `arc delivery plan inventory schema` (`handleDeliveryPlanInventorySchema`, `handlers/delivery.ts`) builds its
      own delivery registry and emits `{id, version, schema}` in the delivery envelope, root document only, so its
      `$ref` to `slug.schema.json` dangles (observed by running it, 2026-10-07).
2. **The projection is about twenty times larger than the contracts, and parts of it are wrong.**
    - `KernelRegistry.toJSONSchema` calls `z.toJSONSchema` without the `reused` option, so zod's default (`"inline"`)
      copies every reused subschema at each use site, and the copies compound through nested envelopes. The shipped
      bundle is 21.2 MB pretty-printed (5.4 MB compact, 0.7 MB gzipped), 16.8 MB of it `review-status-result`; as
      compact JSON, that root's closure is 4.2 MB and `session-init-envelope`'s 374 KB. `cli-schema-kernel`'s spec
      settled that registered composition emits `$ref`s rather than inline copies; reuse of unregistered subschemas
      was never decided.
    - Every root projects in zod's default `io: "output"` mode, which describes a value after parsing. For a contract
      a caller authors that is the wrong side: a defaulted field reads as required. Five of the 138 roots differ
      between the two modes today; among them `review-resolve-request` demands `frontlineActive`, which the CLI
      defaults (`z.boolean().default(false)` in `review-policy-driver.ts`).
    - `z.tuple([])` (`ChangeSetSchema`, `change-facts.schema.ts`) projects as `prefixItems: []`, which the 2020-12
      metaschema rejects and which accepts any array. Five roots fail metaschema validation, `session-init-envelope`
      and `review-status-result` among them, and a review policy test (`pre-publication-procedure.test.ts`) loads the
      review-only bundle with `validateSchema: false`, citing these tuple projections. Non-empty tuples carry no
      length bounds either, so a fixed-length `argv` such as `["arc", "start", <name>]` in `session-init-envelope`
      accepts an array of any length, and Ajv's strict mode refuses six roots for it.
3. **Editors can use none of it.** Every document refers into sibling documents by relative `$ref`
   (`slug.schema.json` alone 2,662 times), and no document sits anywhere a project file can point to.
   `quality-gate-hooks` adds a check-declaration file beside `arc-config.yml`, registers its type in the production
   registry, and needs a JSON Schema document for that type at a stable, installed location, referenced through
   `$schema` or a YAML language-server modeline, so editors offer completion and validation as Turborepo and lefthook
   do (requirement routed from its planning session, 2026-10-07).

**Design principle.** Publication is a projection over the kernel registry's Zod values, never a TypeScript-compiler
analysis pass, so this work is free of the compiler API by construction and TypeScript 7's API break cannot reach it.

## Decisions

### D1 — Project at real size, on the right side, validly

- **Shared subschemas by reference.** `KernelRegistry.toJSONSchema` passes `reused: "ref"`. Reused, unregistered
  subschemas move into the `$defs` of the `__shared` document the registry already normalizes.
- **One self-contained document per contract.** `projectKernelSchemaClosure` follows references at fragment
  granularity and folds what the root reaches — registered documents and `__shared` definitions alike — into the
  root's `$defs`, rewriting every reference to a local `#/$defs/…` pointer. The root keeps its `$id` and `$schema`;
  folded definitions drop both — without its `$id` a definition is no longer a resource root, and 2020-12 forbids
  `$schema` anywhere else — so nothing in the document resolves against another one, and two contracts load into one
  validator without colliding.
- The first two changes are one decision. `reused: "ref"` alone gathers 973 definitions into a 266 KB `__shared`, and a
  document-granular closure then drags all of it, plus every registered document it references, into every result.
  A pruned `__shared` per root would carry one identity with different contents per root.
- **Projection side.** A schema whose documents are authored — a request a caller composes, a file a person edits —
  projects with `io: "input"`, where a defaulted field stays optional and a transform shows the type it accepts.
  Every other schema keeps `io: "output"`. `KernelSchemaMeta` gains one optional field,
  `authored: "request" | "editor-document"`, that declares it; registration states it and no list duplicates it. The
  fifteen public review request roots (`REVIEW_PUBLIC_REQUEST_SCHEMA_PATHS`, `handlers/review.ts`), the
  caller-supplied delivery design inventory (`delivery-design-inventory-input`), and the decompose cut map (D3) carry
  `request`, and `editor-document` is D4's marker. The registry projects once per side and takes each root's document
  from its own side.
- **Valid, bounded documents.** Through `z.toJSONSchema`'s `override` hook, every tuple carries the bounds Zod
  enforces on the side being projected: `minItems` is one past its last element that is not optional on that side
  (Zod's own tuple minimum, `getTupleOptStart`), and `maxItems` is its length when it has no rest element. An empty
  tuple drops `prefixItems`, taking `maxItems: 0` when it has no rest element. A test checks that every registered
  root's document passes 2020-12 metaschema validation and compiles in
  `new Ajv2020({ strict: true, validateFormats: false })` — the repository's strict convention, with formats as
  annotations (2020-12's default; ARC registers no format validators). Ajv's strict mode admits a tuple only when
  `minItems` and `maxItems` both equal its length, so the test fails on a registration whose tuple has any other
  bounds, and the registration settles its projection there; none is registered today (19 output-side and 17
  input-side tuples, all fixed-length on both sides). The `validateSchema: false` workarounds in the pre-publication
  policy test and the review e2e test go.
- **Absolute identities.** The default URI mapping in `KernelRegistry.toJSONSchema` changes from the relative
  `<id>.schema.json` to `urn:arc:schema:<id>`. `arc schema get` writes to standard output, which gives no retrieval URI
  for a relative `$id` to resolve against, so the identity should name the contract rather than a file. A namespaced
  URN cannot collide with another tool's `slug.schema.json` in a shared validator, 2020-12 says a root `$id` should be
  absolute, and the contract is cheapest to rename before it is first published. The one place that builds the old form,
  `handleReviewRequestSchema`'s `rootId`, moves with it, as do the tests in ten files that pin today's identities.
- **The bundle** keeps its multi-document form: `dist/schemas/kernel.json` is one output-side projection with a single
  full `__shared`. It ships in the package but is not a contract surface: its only reader is the build's completeness
  check (`hasKernelSchemas`), and `arc schema get` is the contract surface (D5). An authored root therefore reads
  differently in the two — `review-resolve-request` requires `frontlineActive` in the bundle and not from `get` — and
  that divergence is accepted.

Measured in memory over the production registry (non-mutating probes, 2026-10-07). Contract rows are compact JSON, as
the CLI emits them; the bundle row is pretty-printed, as shipped. The first two columns use today's relative
identities; the last is the settled projection, with the request root on the input side:

| Projection                     | Today (`inline`) | `reused: "ref"` only | D1 document |
| ------------------------------ | ---------------- | -------------------- | ----------- |
| Bundle                         | 21.2 MB          | 1.2 MB               | 1.2 MB      |
| `review-resolve-request`       | 6.5 KB           | 314 KB               | 6.2 KB      |
| `compaction-seed`              | 2.9 KB           | 315 KB               | 2.9 KB      |
| `session-init-envelope`        | 374 KB           | 317 KB               | 116 KB      |
| `review-status-result`         | 4.2 MB           | 340 KB               | 63 KB       |

Under the settled projection, all 138 of today's documents pass metaschema validation and compile under those
options. Without the tuple bounds, six fail strict compilation; without `validateFormats: false`, 27 fail on unknown
formats (`date-time`, `uri`, `uuid`).

- Every closure consumer inherits the result. The review `--schema` emitters keep their `{rootId, schemas}` shape,
  now holding the one self-contained document. `handleReviewRequestSchema` composes
  `createProductionSchemaRegistry()` instead of its own review-only registry, which numbers the shared definitions
  differently, so one identity yields one document from either verb.
- `handleDeliveryPlanInventorySchema` keeps its verb and envelope but takes its `schema` and `version` from D2's shared
  lookup over `createProductionSchemaRegistry()`, instead of the root of a delivery-only bundle and a version
  constant. Under `reused: "ref"` that root would point into an unpublished `__shared`, and a delivery-only
  composition would number its definitions differently from `get`. The change also ends today's dangling `slug`
  reference, and its e2e test asserts the document carries no external `$ref`.
- Zod numbers the generated `__shared` definitions (`schema0`, `schema1`, …). After the fold they are document-local
  names, not identities; the registry projects in sorted-identity order, so they are expected to stay deterministic
  (§ Unknowns).
- The header comment in `lib/session-envelope/registry.ts`, which says registration does not publish to the bundle, is
  corrected: production composition publishes the session-envelope roots.

### D2 — The `arc schema` verb

- **Name:** `arc schema`. It matches the `--schema` flag on fifteen review verbs and the shipped `schemas/` artifact,
  and no top-level `schema` command exists.
- **`arc schema list`:** every registered id with its `version` and `migrationPosture` from `KernelRegistry.meta`,
  never schema content. Plain lines by default; with `--json`, `{status: "ok", schemas: [{id, version,
  migrationPosture, editorDocument}]}`.
- **`arc schema get <id>`:** always JSON, `{status: "ok", id, version, migrationPosture, editorDocument, schema}`,
  where `schema` is D1's self-contained document, projected on the side its registration declares; its `$id` carries
  the identity. Metadata comes from the live registry, since the bundle carries none.
- **`arc schema install`:** runs D4's writer for the current checkout and, with `--json`, reports
  `{status: "ok", documents: [path]}`. It is the remedy after a CLI upgrade and for a checkout provisioned before the
  writer existed (D4 § Channel).
- **Serialization:** every JSON result is compact single-line JSON, as the review `--schema` emitter writes it.
- **Unknown id:** exit 1 with `{status: "refused", reason: "unknown-schema-id", id, remedy: "arc schema list"}` —
  terminal for that id, with the remedy that lists the valid ones.
- **Editor document path:** `editorDocument` is `{path}`, checkout-relative, for a schema registered with
  `authored: "editor-document"`, and `null` otherwise. A consumer reads the location from the CLI instead of
  restating it.
- **Typed results:** every result is a Zod schema registered in the production registry, as the review command
  envelopes are (`review-command-envelope-registry.ts`). The handler validates its output against them, and
  `arc schema get` describes the verb itself, so no document restates the shapes.
- **Shared lookup:** one library function over a registry maps an id to a typed result — found, with metadata and
  document, or unknown. `get` and the delivery inventory emitter use it (D1); whether the review emitter adopts it,
  and whether either emitter gives way to `arc schema`, belongs to their owners (§ Coordination).
- **Source registry:** `createProductionSchemaRegistry()` as composed under D3.
- **Wiring:** `cli.ts`; a new `handlers/schema.ts`; summaries in `COMMAND_SUMMARIES` (`lib/cli-help-summaries.ts`),
  which feed the `COMMAND_HELP` table that `cli-help-coverage.test.ts` checks against every visible command; and a
  `CommandInputRegistration` for the `<id>` operand plus a `--json` policy declaration, collected in
  `src/command-input-registrations.ts`, which the repository-inventory test reconciles against every live syntax site.
- `cli-output-contract` redesigns machine-mode failure framing and the `--json` convention CLI-wide; under the
  pre-release posture it changes these shapes in place.

### D3 — What publishes

- **Exactly what `createProductionSchemaRegistry()` composes** — the set the shipped bundle carries, so
  `arc schema get` and `dist/schemas/kernel.json` publish the same ids. That set publishes as composed; this work unit
  sets no criterion it must meet.
- **Adding a family is a mechanism that needs a named consumer.** This work unit adds two things to production: the
  verb's own result schemas (D2), which the verb uses, and one family deferred to it (§ Coordination), the decompose
  cut map, whose consumer is named and unserved. A later family enters as `quality-gate-hooks`' declaration type will,
  registered in production for its consumer. `strategy-procedure-evolution`'s one-schema-kernel doctrine points toward
  exposing the whole schema module; each widening is taken with its consumer.
- **The decompose cut map composes.** `decompose-matrix` named its consumer, an agent validating the cut map it
  authors against a published contract, and nothing serves that agent today: the starter `arc decompose --preflight`
  emits holds only `{ status: "author" }` placeholders in its authoring slots (`StarterAuthoringSchema`), and
  `--execute` and `--extract` reduce a decode refusal to its path (`decodeCanonicalMap`). `V3DecomposeCutMapSchema`
  registers as `decompose-cut-map`, version 3 (its `schemaVersion`), `strict-current`, `authored: "request"`, through
  a decompose composer chained into `createProductionSchemaRegistry()`. Its slug fields strip the kernel slug's brand
  with an identity transform (`DecomposeSlugSchema`), which Zod refuses to project on the output side, and both the
  bundle and the registry's output-side pass project every registered schema. The brand exists only in the type, so a
  type annotation replaces the transform: `DecomposeSlugSchema` becomes the kernel's registered `SlugSchema` instance
  typed `z.ZodType<string, string>`, which parses as before, leaves the map's inferred types unchanged, and keeps its
  references to the registered `slug` on both sides. Refinements and the decoder's cross-field checks
  (`decodeV3DecomposeCutMap`) stay with the CLI.
- Registered schemas production does not compose, and where each stands:
    - `arc-config` — its schema describes the all-string record ARC's line reader produces, not the values the file
      holds, so publishing it now would publish a contract every YAML consumer contradicts. The reader's repair is
      routed to `config-storage-architecture`; the schema composes after it (§ Won't Do);
    - `meta-record` — its owner is replacing it: `storage-contract` leaves each family's field schema, the meta's among
      them, to the storage work that builds its parser;
    - `local-sync-state` — deleted with the notes machinery at the storage cutover;
    - `audit-entry` — no consumer of its schema is named;
    - the command-input registry — it describes command flags, which each verb's `--help` documents, and no consumer
      of its schemas is named;
    - the layout registry — no consumer of its schemas is named.

### D4 — Editor documents

- **Marker:** `authored: "editor-document"` (D1) declares that a registered schema publishes as an editor document,
  on the input side. `quality-gate-hooks` sets it on its declaration type.
- **Faithfulness:** a marked schema must describe its document as a standard YAML or JSON parser yields it;
  `arc-config`'s string-typed record is the counterexample (§ Won't Do). It rejects unknown keys itself
  (`z.strictObject`) wherever the CLI rejects them, since the input side leaves an ordinary object open. An editor
  then never flags a file the CLI accepts and flags unknown keys exactly where the CLI does; checks the projection
  cannot carry — refinements — stay with the CLI. A type whose files may be JSON admits a `$schema` key.
- **Form:** D1's self-contained document, written as is, so an editor resolves it from one path with no sibling files.
- **Location:** `.arc/system/.internal/schemas/<id>.schema.json`. `strategy-file-classification` § Intra-`system/`
  tiering places CLI-managed, do-not-edit machinery under `system/.internal/`. Projects reference these files and
  never edit them; a file beside `arc-config.yml` points at `./.internal/schemas/<id>.schema.json`. The directory is
  wholly CLI-owned: each write replaces its contents, so a schema that loses its marker loses its document.
- **One binding for the path:** the location is a layout-resolver address, a new `ArcLayoutAddress` kind beside
  `candidate-record` and `transition-record` (`lib/layout/projection.ts`). The writer and the verb (D2) resolve it
  there. A shared function composes the reference text for a given referencing file — the YAML language-server
  modeline for a YAML file, the `$schema` value for a JSON one — so a consumer that writes a reference into a project
  file (such as a `quality-gate-hooks` bootstrap) calls it instead of embedding the path.
- **Storage class:** derived and never stored. Under `strategy-storage-evolution`'s tracked-versus-stored line, they sit
  beside the `system/.internal/` records that move to the store, but they are regenerated per checkout like the
  derived views.
- **Channel:** generated from the live registry by one writer, run wherever ARC provisions a checkout someone edits
  in, so a relative reference in a tracked file resolves in each checkout.
    - **Ignored per clone:** the writer adds the directory to the clone's shared `info/exclude`, as
      `ensureWorktreeMarkerIgnored` (`lib/git/worktree-marker.ts`) does for the worktree marker, and as
      `strategy-storage-evolution` sets provisioning to write exclude entries once per clone. The writer owns its
      ignore entry, so the tracked `.gitignore` block is untouched, and a repository whose block ARC does not keep
      current still ignores the documents — this one never runs `arc update` against itself, and its block already
      lacks the worktree marker.
    - **Primary checkout:** `arc init`, `arc update`, and `arc join` run the writer; a fresh clone regains the
      documents at `arc join`.
    - **Linked worktrees:** every site that provisions an ARC-owned editing checkout runs the writer — work-unit
      spawns (`reconcile-work-unit-worktree.ts`, which atomic graduation also reaches), transient provisioning
      (`provisioning-runtime.ts`), decomposition (`git-decompose-v3-operation-io.ts`), and the cold-start scaffold
      `arc start --here` runs into a worktree ARC did not create (`worktree-scaffold.ts`), which writes no marker. The
      primary's generated files do not reach linked worktrees — `pristine.json` is absent from this work unit's own
      worktree — so these writers are required. Marker rewrites on an existing checkout (teardown, rename, errand
      promotion) provision nothing and run no writer. The worktrees ARC creates as tool-owned targets — review
      materialization, base synchronization, delivery refresh, the review-fix candidate gate — get no documents.
    - **Refresh:** `arc schema install` (D2) reruns the writer in the current checkout. Between runs, an existing
      checkout's documents can trail the installed CLI or the checkout's own branch. That staleness is accepted: an
      editor document is an advisory aid, the CLI's own validation stays authoritative, and the remedy is one command.
    - **Precedent:** `.arc/system/.internal/pristine.json`, which `arc init` and `arc update` generate with no
      `init-recipe.json` entry. Generated rather than shipped, the documents likewise take no recipe entry.
- **First consumer:** the `quality-gate-hooks` declaration type, when that work unit registers it. Until then no
  production schema carries the marker. Its own worktree predates the writer, so it takes its documents through
  `arc schema install`.
- **Verification:** the writer takes the registry it projects, so an integration test drives it in a temporary
  repository with a registry holding a marked test schema — the document, the exclude entry, `git check-ignore`
  reporting the written document ignored with `git status` clean, the directory's replacement, and an unmarked
  schema's absence. End-to-end tests run the built CLI, which composes only the production registry, so they check
  that each provisioning path § Channel names, and `arc schema install`, writes the exclude entry and the directory;
  a real marked type is exercised end to end once `quality-gate-hooks` registers one.

### D5 — Agent discovery

- On demand only. `arc schema` is documented in QUICK-REFERENCE § ARC CLI Commands (both copies) and in its own
  `--help`. The documentation names the verb as the contract surface, not the packaged `schemas/kernel.json`, and the
  `editorDocument` field as the way to find an editor document; it restates neither the directory nor the result
  shapes.
- It is not added to `AGENT-BRIEF.ARC.md` or read at session start. Even after D1, `session-init-envelope`'s
  document is 116 KB, and growth of always-loaded context is governed by the `analysis-load-set-scoping` findings that
  `composable-workflows` inherits.
- One workflow names it, for the consumer D3 composes the cut map for: § 2 of `decompose-work-unit.md`, where an
  agent completes the map, gains a line in both copies naming `arc schema get decompose-cut-map` as the map's
  structural contract — each authoring slot's shape, discriminators, and allowed constants — while refinements and
  the decoder's cross-field checks stay with `arc decompose` (D3). That workflow loads only when decomposing, so the
  line adds nothing to always-loaded context. How review workflows reach their request contracts is settled by
  `review-request-contracts` (§ Coordination).

## Alternatives

- **Verb name:** `arc introspect` is vaguer and suggests more than schemas; `arc contracts` sidesteps the overloaded
  word but breaks the vocabulary of `--schema`, `KernelRegistry`, and `schemas/kernel.json`.
- **Output shape:** the review `{rootId, schemas}` closure as-is carries no metadata; the delivery `{id, version,
  schema}` envelope returns the root alone, with dangling references. D2 keeps the delivery shape's single `schema`,
  made self-contained, and adds the posture.
- **Leave the projection as it is:** `arc schema get` would print up to 4.2 MB, and every install carries 21 MB.
- **A pruned `__shared` document per closure:** each carries the one `__shared` identity with different contents, so
  two contracts cannot load into one validator — measured, Ajv refuses the second.
- **One projection side for every root:** the output side marks a request's defaulted fields required, and an editor
  document built from it would flag a valid file that omits one; the input side would describe results and envelopes
  as the CLI accepts rather than emits them.
- **Keep relative `$id`s, or use an `https` URL:** standard output gives a relative identity no retrieval URI to
  resolve against, and a bare filename can collide with another tool's; an `https` URL on a domain ARC does not own
  would imply a hosted schema that does not exist.
- **Editor publication elsewhere:** a verb-only design leaves `quality-gate-hooks` unserved. A separate stub splits one
  publication design — what is published, in what form, and where — across two work units. Hosted URLs or SchemaStore
  registration need a public release and add an external seam.
- **Sibling files instead of one document:** it avoids rewriting references, but each root's pruned `__shared` differs,
  so roots sharing a flat directory collide on `__shared.schema.json` unless each gets its own subdirectory; and the
  editor must then resolve relative references across files, which editors handle less uniformly than local `$defs`
  pointers.
- **Publish `arc-config` now:** its schema describes the line reader's all-string record, so the published contract
  would disagree with every YAML tool reading the file, and no consumer of it is named. Repairing the reader first lets
  the schema publish as the file reads.
- **Repair the configuration reader here:** the reader, the githooks' shell lookup, the line-based writers, and
  ADR-003's constraint are one concern of their own, and this work unit ships without them. The `configuration`
  cohort record gives `config-storage-architecture` the file/schema boundary, where the file's rename and the per-user
  file's format are already open (§ Coordination).
- **Leave the cut map unpublished:** its consumer is named and unserved, and what blocks its output side is a
  transform that only strips a type brand.
- **Ignore through the managed `.gitignore` block:** every command that writes the block would carry the entry —
  five hand-copied lists today — and a repository whose block ARC does not keep current, this one included, would
  leave the generated documents untracked but not ignored.
- **Automatic refresh:** no existing trigger runs in every checkout often enough to earn a guarded rewrite of an
  advisory aid; the explicit `arc schema install` covers the cases the provisioning writers miss.
- **Tracked installation through `init-recipe.json`:** every `arc update` would dirty the working tree with generated
  output, against the direction `framework-core-from-package` sets for framework content (gitignored copies from the
  installed package).
- **Top-level `system/schemas/`:** the top level of `system/` is the customization tier, and these files are not
  edited.
- **A list of editor-facing ids:** a second hand-kept list beside the registration, the drift pattern the install
  recipe already shows.

## Success signal

- The shipped bundle drops from 21.2 MB to about 1.2 MB, and `arc schema get session-init-envelope` returns one
  self-contained document of about 116 KB with its version and posture, where today's closure is 374 KB.
- Every registered root's `get` document passes 2020-12 metaschema validation and compiles in
  `new Ajv2020({ strict: true, validateFormats: false })`; `get review-resolve-request` leaves `frontlineActive`
  optional; and `arc delivery plan inventory schema` returns a document with no external reference.
- `arc schema get <unknown>` refuses with `unknown-schema-id` and exit 1.
- In a temporary repository, given a registry holding a marked test schema, the writer produces a self-contained
  document under `.arc/system/.internal/schemas/` that validates a sample file with no unresolved reference,
  `git check-ignore` reports it ignored and `git status` stays clean, and an unmarked schema gets none. On each
  provisioning path D4 names, and after `arc schema install` in an existing checkout, the built CLI writes the
  directory and its exclude entry and leaves the managed `.gitignore` block unchanged.

## Class and boundary

- **`Class`: `Heavy`.** Derivation fires on D1 — the fragment-granular fold and the projection side — and on D4's
  marker, faithfulness rule, and per-clone install channel. Scale does not fire: the kernel registry and projection
  (with the identity change's test updates), one optional metadata field set on seventeen registrations, one
  composer registering the cut map with a type annotation in place of its slug transform, one new handler with three
  subcommands, two existing emitters adjusted, one writer called from the existing provisioning paths, and
  documentation, including one line in the decompose workflow. Not `Novel`: the design composes registry metadata, the
  existing closure projection, `pristine.json`'s generated-file pattern, and the worktree marker's per-clone exclude.
- **Boundary: stays one work unit.** What publishes, in what form, and where is one design, and the editor documents
  depend on D1 and D3. Two review chunks: the projection with the verb's `list` and `get`, then the
  editor documents with `arc schema install`.

## Unknowns and assumptions

- **Determinism holds under `reused: "ref"`.** The kernel test that compares bytes across opposite registration orders
  should still pass, since projection order is sorted and the generated `__shared` names follow it. Verify at spec.
- **Editors accept the documents.** Whether VS Code's JSON service and the YAML language server accept draft 2020-12,
  the target `KernelRegistry.toJSONSchema` uses, and resolve its local `#/$defs/…` pointers is unverified. If they
  fall short, editor documents take an older target that zod also emits (`draft-07`). Probe at spec.
- **The reference path couples locations.** A modeline path relative to the declaring file breaks if either that file
  or the schema directory moves. Under the pre-release posture such a move changes in place, without shims.

## Scope boundary (Won't Do)

- **No `--version` and no versioning model.** Three version axes exist: the registry's `version` metadata, the store's
  per-record format version kept beside each record, and in-content `schemaVersion` fields. Reconciling them belongs
  after the storage seam; the verb emits registry metadata only, over the one active schema per id the registry holds.
- **No schemas for managed operational-state documents** (ADR-022): `meta-record` is the only one that exists as Zod,
  and its owner is replacing it (D3); `storage-seam` builds the others' parsers and `operational-state-docs` follows.
- **No migration of the existing emitters.** Whether the review `--schema` flags stay, and how the delivery inventory
  command reaches the shared lookup, belong to `review-request-contracts` and `delivery-rebuild-continuity`. This work
  unit changes only what D1 would otherwise break or leave inconsistent in them: the review emitter's `rootId` and
  composed registry, and the delivery emitter's document source and version.
- **No consolidation of the managed `.gitignore` entry lists.** D4 ignores its documents per clone and leaves the
  block alone; the hand-copied lists route to `framework-core-from-package` (§ Coordination).
- **No CLI-wide output contract.** Machine-mode failure framing and the `--json` / `--output` convention belong to
  `cli-output-contract`.
- **No `arc-config` publication** (D3). `arc-config.yml` parses as valid YAML, but ARC does not read it as YAML:
  `parseArcConfig` and the githooks' `arc_config_get` match each line and keep every value as a string, as ADR-003
  chose so hooks could read it with `grep` and `cut`, and the field catalog (`ARC_CONFIG_FIELDS`) records each key's
  real type as a policy over that string. `ArcConfigSchema` describes the string record. A YAML parser reads
  `hooks.subject_max_length: 72` as a number and `review.frontline_sources: []` as a list, so a document built from
  the schema would flag valid configuration; and the line reader keeps an inline comment in its value and takes the
  first of two duplicate keys, where YAML strips the one and rejects the other. Repairing the reader is routed to
  `config-storage-architecture` (§ Coordination).
- **No `audit-entry` publication** (D3): no consumer of its schema is named.
- **No hosted schema URLs** and no SchemaStore registration.
- **No routine agent consumption** — no brief entry, session-start read, or workflow call beyond decomposition's
  pointer to its cut map (D5).
- **Not here:** schema migration tooling, code generation from schemas, and consumer-side contract enforcement.

## Coordination

Routed at draft close through `USER-INBOX` captures, never by editing sibling work units:

- **`quality-gate-hooks`** — no capture needed. Its requirement is taken in and the D4 outcome goes to its planning
  session directly: it points its coordination note here, registers its declaration type with
  `authored: "editor-document"`, carries D4's faithfulness rule (parser-faithful, `strictObject` where the CLI rejects
  unknown keys, `$schema` admitted for JSON files) into its spec, and writes any reference through D4's shared
  function.
- **`review-request-contracts`** — a design question, not a wrapper request. Its per-verb `--schema` (its D4.2) made
  the request operand optional across the review family, while its own identity convention derives fourteen of the
  fifteen ids from the command path, so `arc schema get review-resolve-request` serves the same need. The exception,
  `review changeset resolve` → `review-chunking-resolve-request`, means callers cannot rely on derivation alone.
  Lean: retire the flags for `arc schema` plus a pointer in each verb's `--help` naming its id; keeping them means
  thin wrappers over the shared lookup. Either way, from this work unit its request roots carry
  `authored: "request"` and its emitter returns one self-contained, URN-identified document composed from the
  production registry.
- **`delivery-rebuild-continuity`** — this work unit routes `arc delivery plan inventory schema` through the shared
  lookup, ending its dangling `$ref`, and marks its input `request`; whether the verb stays or gives way to
  `arc schema get delivery-design-inventory-input` is its call.
- **`config-storage-architecture`** — the configuration reader, as a capture that widens its draft; the
  `configuration` cohort record gives it the file/schema boundary. ARC reads `arc-config.yml` line by line as strings
  (§ Won't Do) under ADR-003's constraint that hooks read it without a YAML library. That premise has weakened,
  unevenly. Each hook reads its gates in shell — its enable check, and `pre-commit`'s `pm.mode` — and moving them
  behind the CLI makes a hook depend on it where it does not today. Past its gate, `commit-msg` already does: it fails
  the commit when the CLI cannot be resolved, and `arc check commit-msg` reads its own settings
  (`lib/commit-check/config.ts`). So does `pre-commit` under `arc-in-git`, where each run calls
  `arc hook-remedy-roadmap-conflict` (from source in this repository), so its other reads could move behind the CLI
  there at no new cost; outside `arc-in-git` it calls no CLI, and moving them adds that dependency. `pre-push` reads
  only its enable check. The capture hands over that decision: whether the reader becomes a YAML parser with the hooks
  reading resolved values through the CLI (its `arc config get` probe), and the ADR-003 amendment that follows. Once
  values are typed, the configuration schema composes into production and publishes through `arc schema`, and the
  file can take an editor document under D4.
- **Deferrals to this work unit** — no capture needed; D3 answers each:
    - `compaction-recovery` (the seed, task-cursor, and recovery-audit contracts), `cli-session-envelope` (the envelope
      roots), and `review-architecture` (the review contracts): already composed in production, so they publish;
    - `cli-validation-surfaces` (publish the validation registry): `arc-config` publishes after the reader repair,
      `meta-record` and `local-sync-state` stay with the storage program, and `audit-entry` stays unpublished;
    - `worktree-foundation` and `class-model-foundation` (the meta record's surface): with `meta-record`, to the
      storage program;
    - `cli-command-inputs` (publish command schemas through `arc schema`): unpublished, since each verb's `--help`
      documents its flags and no consumer of the schemas is named;
    - `session-locus-model` (project the locus registry): moot — no locus schema is registered (`lib/locus/schema/`);
    - `decompose-matrix` (publish the cut-map contract): composed by this work unit (D3).
- **`framework-core-from-package`** — two items. The generated `.internal/schemas/` documents join its projection's
  path list, ignored per clone as its storage direction sets. And the managed `.gitignore` block is written from five
  identical hand-copied entry lists (`init.ts`, `update.ts`, `reconfigure.ts`, and twice in `join.ts`) for its ignore
  strategy to consolidate; no layout address covers today's entries (`pristine.json`, `worktree-marker.json`, the
  `.arc/user/*/` glob, harness skill paths), and this repository's block, which no command maintains here, already
  lacks `worktree-marker.json`.
- **`composable-workflows`** — its envelope-schema generation can lift onto `arc schema`.
- **ADR-022** — its coordination line for this work unit predates the 2026-09-29 file-as-record amendment.
- **Errand** — decide which config-catalog assertions stay hand-maintained: shares the configuration domain but shapes
  no decision here.

## Status

- **Readiness:** formalization-ready — D1 through D5 settled; the unknowns above are probes for spec, not open
  design.
- **Next:** `create-spec`.
