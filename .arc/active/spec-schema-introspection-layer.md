# Spec (`detailed` · `RFC`): schema-introspection-layer

- **Origin:** [internal]

- **Purpose:** Publish ARC's registered contracts where their consumers can reach them: an `arc schema` verb that
  returns any contract the production registry composes, with its registry metadata, and self-contained documents
  installed per checkout for editor completion and validation. The projection behind both emits schemas at their real
  size, on the side their authors write, and valid against the 2020-12 metaschema, and the build stops shipping a
  second projection beside it.

---

## Introduction / Context

ARC's CLI registers 138 schemas in one composed registry, `createProductionSchemaRegistry()`
(`production-schema-registry.ts`): kernel vocabulary, review, delivery, and session envelope. Every build projects it
into `dist/schemas/kernel.json` (`generateRuntimeSchema` in `src/scripts/build-schema.ts`, through
`writeKernelSchemaArtifact`), which ships in the package. Four gaps keep those contracts out of reach.

1. **No contract is addressable by name.** Nothing reads the bundle except the build's own completeness checks
   (`hasKernelSchemas`, called by `validateStagedOutput` in `build-publication.ts` and `requireLiveArtifacts` in
   `build-qualification.ts`). Reading it directly means knowing an install path that varies by package manager. Two
   command-local surfaces exist, and they disagree:
    - fifteen review verbs take `--schema` through `handleReviewRequestSchema` (`handlers/review.ts`), which builds a
      review-only registry per call and prints `{rootId, schemas}` from `projectKernelSchemaClosure`, with no version
      or posture;
    - `arc delivery plan inventory schema` (`handleDeliveryPlanInventorySchema`, `handlers/delivery.ts`) builds its
      own delivery registry and emits `{id, version, schema}` in the delivery envelope, root document only, so its
      `$ref` to `slug.schema.json` dangles.
2. **The projection is about twenty times larger than the contracts, and parts of it are wrong.**
    - `KernelRegistry.toJSONSchema` calls `z.toJSONSchema` without the `reused` option, so Zod's default (`"inline"`)
      copies every reused subschema at each use site, and the copies compound through nested envelopes. The bundle is
      21.2 MB pretty-printed (5.4 MB compact, 0.7 MB gzipped), 16.8 MB of it `review-status-result`; as compact JSON,
      that root's closure is 4.2 MB and `session-init-envelope`'s 374 KB.
    - Every root projects in Zod's default `io: "output"` mode, which describes a value after parsing. For a contract
      a caller authors that is the wrong side: a defaulted field reads as required. Five of the 138 roots differ
      between the two modes; among them `review-resolve-request` demands `frontlineActive`, which the CLI defaults
      (`z.boolean().default(false)` in `review-policy-driver.ts`).
    - `z.tuple([])` (`ChangeSetSchema`, `change-facts.schema.ts`) projects as `prefixItems: []`, which the 2020-12
      metaschema rejects and which accepts any array. Five roots fail metaschema validation, `session-init-envelope`
      and `review-status-result` among them, and a review policy test (`pre-publication-procedure.test.ts`) and a
      review e2e test (`review-cli-surfaces.e2e.test.ts`) compile with `validateSchema: false` to get past them.
      Non-empty tuples carry no length bounds either, so a fixed-length `argv` such as `["arc", "start", <name>]` in
      `session-init-envelope` accepts an array of any length, and Ajv's strict mode refuses six roots for it.
3. **Editors can use none of it.** Every document refers into sibling documents by relative `$ref`
   (`slug.schema.json` alone 2,662 times), and no document sits anywhere a project file can point to. Project files
   ARC defines need a JSON Schema document at a stable installed location, referenced through `$schema` or a YAML
   language-server modeline, so editors offer completion and validation as they do for Turborepo and lefthook
   configuration. The first such file planned is a check-declaration file beside `arc-config.yml`.
4. **The bundle is a second projection with no reader.** Every build loads a separate producer beside the compiler
   (`loadSchemaProducer`), records its source graph and a second input identity in the build evidence
   (`BuildEvidenceSchema`), and qualifies output for testing only when the bundle is present (`readBuildQualification`
   with `"runtimeSchema"`). Once authored roots project on their input side (D1), an output-side bundle would render
   them differently from the verb, so one identity would carry two documents.

**Design principle.** Publication is a projection over the kernel registry's Zod values, never a TypeScript-compiler
analysis pass, so this work is free of the compiler API by construction and TypeScript 7's API break cannot reach it.

## Goals

1. Any contract the production registry composes is retrievable by its identity through one CLI verb, with its
   registry version and migration posture.
2. Every published document is self-contained, with no external `$ref`, carries an absolute identity, is projected on
   the side its authors write, passes 2020-12 metaschema validation, and compiles under Ajv's strict mode.
3. Published documents are proportionate to their contracts: no reused subschema is copied at each use site.
4. A schema marked as an editor document is installed in each checkout at a stable path a tracked project file can
   reference, ignored by Git, and written wherever ARC provisions a checkout someone edits in.
5. The decompose cut map's structural contract is published and reachable from the step where an agent authors it.
6. The registry has one publication surface: the build ships no second projection.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **No version selection and no versioning model.** The verb serves the one active schema per identity the registry
  holds, with its registry metadata. It does not reconcile the registry's `version` with stored records' format
  versions or with in-content `schemaVersion` fields.
- **No publication of** `arc-config`, `meta-record`, `local-sync-state`, `audit-entry`, the command-input registry, or
  the layout registry; D3 gives each reason.
- **No schemas for managed operational-state documents.** `meta-record` is the only one that exists as Zod, and it
  stays unpublished (D3).
- **No retirement or reshaping of the existing emitters.** The fifteen review `--schema` flags and
  `arc delivery plan inventory schema` keep their verbs and envelopes. Only what D1 would otherwise break or leave
  inconsistent changes in them (§ D1, Emitters).
- **No change to the managed `.gitignore` block** or the entry lists that write it.
- **No CLI-wide output convention.** Machine-mode failure framing and `--json` handling outside `arc schema` are
  unchanged.
- **No repair of the configuration reader.** `arc-config.yml` stays read line by line as strings.
- **No hosted schema URLs**, SchemaStore registration, or other external publication.
- **No routine agent consumption:** no brief entry, session-start read, or workflow call beyond the decompose
  workflow's pointer to its cut map (D5).
- **Not here:** schema migration tooling, code generation from schemas, and consumer-side contract enforcement.

## Proposed Design

### D1 — Projection at real size, on the authored side, valid

- **Shared subschemas by reference.** `KernelRegistry.toJSONSchema` passes `reused: "ref"`. Reused, unregistered
  subschemas move into the `$defs` of the `__shared` document the registry already normalizes.
- **One self-contained document per contract.** The closure follows references at fragment granularity and folds
  what the root reaches, registered documents and `__shared` definitions alike, into the root's `$defs`, rewriting
  every reference to a local `#/$defs/…` pointer. The root keeps its `$id` and `$schema`; folded definitions drop
  both. Without its `$id` a definition is no longer a resource root, and 2020-12 forbids `$schema` anywhere else, so
  nothing in the document resolves against another one, and two contracts load into one validator without colliding.
    - **Fold keys:** a folded registered document sits at `$defs/<id>`, and a folded shared definition at
      `$defs/__<name>` under its generated name (`__schema12`). Registered ids are slugs, which cannot begin with `_`,
      so the two never collide; the fold throws on any other key collision rather than overwrite a definition, and on
      a reference in neither form (`urn:arc:schema:<id>` or `urn:arc:schema:__shared#/$defs/<name>`).
- The first two changes are one decision. `reused: "ref"` alone gathers 973 definitions into a 266 KB `__shared`, and
  a document-granular closure then drags all of it, plus every registered document it references, into every result.
  A pruned `__shared` per root would carry one identity with different contents per root.
- **Projection side.** A schema whose documents are authored, as a request a caller composes or a file a person edits,
  projects with `io: "input"`, where a defaulted field stays optional and a transform shows the type it accepts. Every
  other schema keeps `io: "output"`.
    - `KernelSchemaMeta` gains one optional field, `authored: "request" | "editor-document"`, that declares it.
      Registration states it and no list duplicates it; `validateMetadata` refuses any other value with
      `schema.registry.invalid-metadata`.
    - The fifteen public review request roots (`REVIEW_PUBLIC_REQUEST_SCHEMA_PATHS`, `handlers/review.ts`), the
      caller-supplied delivery design inventory (`delivery-design-inventory-input`), and the decompose cut map (D3)
      carry `request`. `editor-document` is D4's marker.
    - The registry projects a whole side at a time. `KernelRegistry.toJSONSchema` and `projectKernelSchemas` take
      the side (`io`) as a required argument and return that side's multi-document bundle: every registered schema
      plus that side's `__shared`. No projection defaults its side, so none projects a request root on the wrong one
      unnoticed. The bundle is an internal intermediate and is never published; both sides' `__shared` carry the same
      internal identity, so the two bundles are never loaded together.
    - `foldKernelSchemaClosure(bundle, id)` folds one root out of an already-projected side bundle into its
      self-contained document. `projectKernelSchemaClosure(registry, id)` projects the root's declared side and folds
      it. The shared lookup (D2) and every emitter use `projectKernelSchemaClosure`, so a lookup of one root projects
      only that root's side; the writer (D4) projects the input side once and folds each marked root from it, and
      projects nothing while no schema is marked.
    - Every registered schema must project on both sides. The test below enforces it, since a schema that throws on
      one side breaks that side's projection for every root.
- **Valid, bounded documents.** Through `z.toJSONSchema`'s `override` hook, every tuple carries the bounds Zod
  enforces on the side being projected.
    - `minItems` is one past its last element that is not optional on that side (Zod's own tuple minimum,
      `getTupleOptStart`), and `maxItems` is its length when it has no rest element.
    - An empty tuple drops `prefixItems`, taking `maxItems: 0` when it has no rest element.
    - Ajv's strict mode admits a tuple only when `minItems` and `maxItems` both equal its length. None registered
      today has other bounds (19 output-side and 17 input-side tuples, all fixed-length on both sides); a later
      registration whose tuple does fails the test below and settles its projection there.
- **The projection test.** One unit test projects every registered schema on both sides. It checks that every
  registered root's document passes 2020-12 metaschema validation and compiles in
  `new Ajv2020({ strict: true, validateFormats: false })`, the repository's strict convention with formats as
  annotations (2020-12's default; ARC registers no format validators). The `validateSchema: false` workarounds in
  `pre-publication-procedure.test.ts` and `review-cli-surfaces.e2e.test.ts` go.
- **Absolute identities.** The default URI mapping in `KernelRegistry.toJSONSchema` changes from the relative
  `<id>.schema.json` to `urn:arc:schema:<id>`.
    - `arc schema get` writes to standard output, which gives no retrieval URI for a relative `$id` to resolve
      against, so the identity names the contract rather than a file.
    - A namespaced URN cannot collide with another tool's `slug.schema.json` in a shared validator, and 2020-12 says
      a root `$id` should be absolute.
    - The one function that builds the old form, `handleReviewRequestSchema`, in the `rootId` of both its result and
      its refusal, moves with it, as do the tests that pin today's identities. The mapping, the side, and
      `reused: "ref"` live in `KernelRegistry.toJSONSchema`, so they reach every registry built on the kernel's:
      `createValidationSurfacesRegistry` projects through it, and `CommandInputRegistry` passes its options through.
- **Determinism.** Zod numbers the generated `__shared` definitions (`schema0`, `schema1`, …), and after the fold they
  are document-local names, not identities. Verified at spec: the production projection is byte-identical across
  separate processes on both sides, while inserting the same schemas in reverse order renumbers them. The registry's
  sorted projection order (`compareIdentity`) is what keeps the names stable. The test that compares bytes across
  opposite registration orders (`kernel/schema-generation.test.ts`) gains registrations that share an unregistered
  subschema, so it covers the generated names. A change to the registry's composition can renumber an unchanged
  contract's definitions, so nothing may key on these names.
- The header comment in `lib/session-envelope/registry.ts`, which says registration does not publish, is corrected:
  production composition publishes the session-envelope roots.

**Emitters.** Every closure consumer inherits the result.

- The review `--schema` emitters keep their `{rootId, schemas}` shape. `schemas` holds the one self-contained
  document under its schema id, and `rootId` is that document's `$id`, `urn:arc:schema:<id>`; a refusal carries the
  same `rootId` with `schemas: {}`. `handleReviewRequestSchema` composes `createProductionSchemaRegistry()` instead
  of its own review-only registry, which would number the shared definitions differently, so one identity yields one
  document from either verb.
- `handleDeliveryPlanInventorySchema` keeps its verb and envelope but takes its `schema` and `version` from D2's shared
  lookup over `createProductionSchemaRegistry()`, instead of the root of a delivery-only projection and a version
  constant. Under `reused: "ref"` that root would point into an unpublished `__shared`, and a delivery-only
  composition would number its definitions differently from `get`. The change also ends the dangling `slug`
  reference, and its e2e test asserts the document carries no external `$ref`.

Measured in memory over the production registry (non-mutating probes, compact JSON, as the CLI emits them). The first
two columns use today's relative identities; the last is D1's document, with the request root on the input side:

| Contract                 | Today (`inline`) | `reused: "ref"` only | D1 document |
| ------------------------ | ---------------- | -------------------- | ----------- |
| `review-resolve-request` | 6.5 KB           | 314 KB               | 6.2 KB      |
| `compaction-seed`        | 2.9 KB           | 315 KB               | 2.9 KB      |
| `session-init-envelope`  | 374 KB           | 317 KB               | 116 KB      |
| `review-status-result`   | 4.2 MB           | 340 KB               | 63 KB       |

Under D1, all 138 of today's documents pass metaschema validation and compile under those options. Without the tuple
bounds, nine fail on each side: an empty tuple's `prefixItems` fails the metaschema, and a fixed-length tuple without
both bounds fails strict compilation. Without `validateFormats: false`, 27 fail on unknown formats (`date-time`,
`uri`, `uuid`).

### D2 — The `arc schema` verb

- **Name:** `arc schema`. It matches the `--schema` flag on fifteen review verbs and the kernel's
  `KernelRegistry` vocabulary, and no top-level `schema` command exists.
- **`arc schema list`:** every registered id with its `version` and `migrationPosture` from `KernelRegistry.meta`,
  never schema content. Plain lines by default; with `--json`, `{status: "ok", schemas: [{id, version,
  migrationPosture, editorDocument}]}`, in the registry's sorted id order.
- **`arc schema get <id>`:** always JSON, `{status: "ok", id, version, migrationPosture, editorDocument, schema}`,
  where `schema` is D1's self-contained document, projected on the side its registration declares; its `$id` carries
  the identity. It takes no `--json`, and the CLI parser refuses one as an unknown option.
- **`arc schema install`:** runs D4's writer for the current checkout. Plain output lists the written paths, one per
  line; with `--json`, `{status: "ok", documents: [path]}`. It is the remedy after a CLI upgrade and for a checkout
  provisioned before the writer existed (D4, Channel).
- **Serialization:** every JSON result is compact single-line JSON, as the review `--schema` emitter writes it.
- **Unknown id:** `get` exits 1 with `{status: "refused", reason: "unknown-schema-id", id, remedy: "arc schema list"}`.
  It is terminal for that id, and the remedy lists the valid ones.
- **Outside a project:** `install` exits 1 with `{status: "refused", reason: "arc-project-root-unresolved"}`, the
  reason the delivery handlers already return (`resolveDeliveryContext` in `handlers/delivery.ts`, and its
  counterparts in `delivery-execution.ts` and `delivery-transfer.ts`). It resolves the root with `resolveArcRoot`
  (`lib/paths.ts`), not `requireArcProjectRoot`, which also logs a human-readable line ahead of any JSON; plain output
  prints the canonical message (`ARC_PROJECT_ROOT_ERROR`).
- **Unwritable:** when the writer cannot write, `install` exits 1 with
  `{status: "refused", reason: "editor-documents-unwritable", target, path, detail, remedy}`.
    - `target` is `"documents"` or `"exclude"`, the write that failed.
    - `path` names what could not be written, as an absolute path, since a linked worktree's `info/exclude` lies
      outside the checkout. It is absent only when Git cannot resolve the clone's `info/exclude`
      (`git rev-parse --git-path info/exclude`, as `ensureWorktreeMarkerIgnored` resolves it).
    - `detail` carries the underlying error's message.
    - `remedy` says to correct the reported cause and rerun `arc schema install`.
    - Plain output prints `detail` and the remedy.
- **Closed refusal set:** `schema-refusal-envelope` admits exactly `unknown-schema-id`, `arc-project-root-unresolved`,
  and `editor-documents-unwritable`. A projection failure is a defect, not a refusal; it exits through the CLI's
  ordinary error path, and D1's projection test stops it before merge.
- **Editor document path:** `editorDocument` is `{path}`, checkout-relative, for a schema registered with
  `authored: "editor-document"`, and `null` otherwise. A consumer reads the location from the CLI instead of restating
  it.
- **Typed results:** every result is a Zod schema registered in the production registry, as the review command
  envelopes are (`review-command-envelope-registry.ts`): `schema-list-envelope`, `schema-get-envelope`,
  `schema-install-envelope`, and `schema-refusal-envelope`. They live in `lib/schema-command/envelope.ts`, whose
  `registerSchemaCommandSchemas` is chained into `createProductionSchemaRegistry()`, so the production composition
  imports no handler. The handler validates its output against them, and `arc schema get` describes the verb itself,
  so no document restates the shapes.
- **Shared lookup:** `lookupKernelSchema(registry, id)`, beside `projectKernelSchemaClosure`, maps an id to a typed
  result: `{status: "found", meta, schema}` with the folded document, or `{status: "unknown"}`. `get` and the
  delivery inventory emitter use it (D1).
- **Source registry:** `createProductionSchemaRegistry()` as composed under D3.
- **Wiring:**
    - `cli.ts` registers the command; each action runs through `withInteractionContext`, machine-readable under
      `--json` for `list` and `install` and always for `get`, as the always-JSON review verbs are.
    - A new `handlers/schema.ts` serves the subcommands.
    - Help: summaries in `COMMAND_SUMMARIES` (`lib/cli-help-summaries.ts`) feed the `COMMAND_HELP` table that
      `cli-help-coverage.test.ts` checks against every visible command, and `schema` joins the root help group "Set up
      and maintain ARC:" in `HELP_GROUPS` (`lib/cli-help-content.ts`), which the same test requires to cover every
      top-level command.
    - Input: `handlers/schema.ts` exports a `CommandInputRegistration` per subcommand, mapping `list`'s and
      `install`'s `--json` and `get`'s `<id>` operand to schema fields, and a machine-mode `--json` policy declaration
      for each subcommand that takes the flag. `src/command-input-registrations.ts` collects both, as it does each
      command family's, and the repository-inventory test reconciles them against every live syntax site.
- These shapes are project-owned and unpublished. A later CLI-wide output convention changes them in place under the
  pre-release posture (`DEV-RULES.PROJECT` § Engineering Standards).

### D3 — What publishes

- **Exactly what `createProductionSchemaRegistry()` composes.** That set publishes as composed; this work sets no
  criterion it must meet.
- **Adding a family is a mechanism that needs a named consumer.** This work adds two things to production: the verb's
  own result schemas (D2), which the verb uses, and the decompose cut map, whose consumer is named and unserved. A
  later family enters the same way, registered in production for its consumer, as the planned check-declaration type
  will. `strategy-procedure-evolution` § One schema kernel points toward introspection exposing the whole schema
  module; each widening is taken with its consumer.
- **The decompose cut map composes.** Its consumer is an agent validating the cut map it authors against a published
  contract, and nothing serves that agent today: the starter map `arc decompose --preflight` emits holds only
  `{ status: "author" }` placeholders in its authoring slots (`StarterAuthoringSchema`), and `--execute` and
  `--extract` reduce a decode refusal to its path (`decodeCanonicalMap`).
    - `V3DecomposeCutMapSchema` registers as `decompose-cut-map`, version 3 (its `schemaVersion`), `strict-current`,
      `authored: "request"`, through `registerDecomposeSchemas`, beside the schema in `decompose-v3-schema.ts` as
      `registerDeliveryAuthoringSchemas` sits beside its own, chained into `createProductionSchemaRegistry()`.
    - Its slug fields strip the kernel slug's brand with an identity transform (`DecomposeSlugSchema`), which Zod
      refuses to project on the output side, and the registry's output side projects every registered schema (D1).
      The brand exists only in the type, so a type annotation replaces the transform: `DecomposeSlugSchema` becomes
      the kernel's registered `SlugSchema` instance typed `z.ZodType<string, string>`. It parses as before, leaves the
      map's inferred types unchanged, and references the registered `slug` directly on both sides.
    - Refinements and the decoder's cross-field checks (`decodeV3DecomposeCutMap`) stay with the CLI.
- **Registered schemas production does not compose**, and where each stands:
    - `arc-config`: its schema describes the all-string record ARC's line reader produces, not the values the file
      holds. `parseArcConfig` and the githooks' `arc_config_get` match each line and keep every value as a string, as
      ADR-003 chose so hooks could read the file with `grep` and `cut`, and the field catalog (`ARC_CONFIG_FIELDS`)
      records each key's real type as a policy over that string. A YAML parser reads `hooks.subject_max_length: 72` as
      a number and `review.frontline_sources: []` as a list, and the line reader keeps an inline comment in its value
      and takes the first of two duplicate keys, where YAML strips the one and rejects the other. A published document
      would flag valid configuration. The schema composes once the reader yields typed values;
    - `meta-record`: it describes the tracked meta file, which ADR-035 moves into the state store under a new record
      identity, so it is not the contract a consumer would need;
    - `local-sync-state`: it records Git-notes sync, which ADR-035 retires (its item 8);
    - `audit-entry`: no consumer of its schema is named;
    - the command-input registry: it describes command flags, which each verb's `--help` documents, and no consumer of
      its schemas is named;
    - the layout registry: no consumer of its schemas is named.

### D4 — Editor documents

- **Marker:** `authored: "editor-document"` (D1) declares that a registered schema publishes as an editor document,
  projected on the input side.
- **Faithfulness:** a marked schema must describe its document as a standard YAML or JSON parser yields it, with real
  numbers, booleans, and lists; `arc-config`'s string record is the counterexample (D3).
    - It rejects unknown keys itself (`z.strictObject`) wherever the CLI rejects them, since the input side leaves an
      ordinary object open.
    - A type whose files may be JSON admits a `$schema` key.
    - An editor then never flags a file the CLI accepts and flags unknown keys exactly where the CLI does. The
      guarantee runs one way: refinements do not project and stay with the CLI, so an editor can accept a file the CLI
      refuses on one.
- **Form:** D1's self-contained document on draft 2020-12, written as is, so an editor resolves it from one path with
  no sibling files.
    - Verified at spec against `vscode-json-languageservice` 5.7.2, the stable release of VS Code's JSON language
      service, and `yaml-language-server` 1.24.0, with D1 documents and a synthetic marked type. Both accepted the
      documents, resolved a relative `$schema` value and a relative modeline, and reported no diagnostics on valid
      files. On invalid files each flagged all six seeded faults, including a pattern reached through a `$defs`
      pointer, an unknown key in a strict object, and an over-long tuple. Both completed properties inside a
      referenced definition.
    - The YAML server labels object snippets with a definition's key, so a shared definition appears in completion
      under its fold key (`__<name>`; the probe's documents keyed it by the bare name, `schema947`). That label is
      cosmetic and is accepted.
- **Location:** `.arc/system/.internal/schemas/<id>.schema.json`. `strategy-file-classification` § Intra-`system/`
  tiering places CLI-managed, do-not-edit machinery under `system/.internal/`. Projects reference these files and
  never edit them; a file beside `arc-config.yml` points at `./.internal/schemas/<id>.schema.json`. The directory is
  wholly CLI-owned: each write replaces its contents, so a schema that loses its marker loses its document. Registered
  ids are slugs (`validateMetadata`), so a file name built from one stays inside the directory.
- **One binding for the path:** the location is two layout-resolver addresses, paired as `work-unit-container` and
  `work-unit-artifact` are: `{kind: "editor-document-root"}` for the directory and
  `{kind: "editor-document", schema: <id>}` for one schema's document in it. Both are declared in
  `ArcLayoutAddressSchema` (`lib/layout/schema.ts`) beside `candidate-record` and `transition-record` and projected in
  `lib/layout/projection.ts`. The writer resolves the directory and its exclude entry from the root even when no
  schema is marked, and the writer and the verb (D2) resolve each document's path from the other. `schema` is a slug,
  so `resolveArcPath` refuses any other value with `layout.invalid-address`, as it does every malformed address.
- **Writer and reference function:** `writeEditorDocuments` and `editorDocumentReference`, in
  `lib/schema-command/editor-documents.ts` beside the verb's result schemas (D2). The writer returns the
  checkout-relative paths it wrote, or the failure `{target, path, detail}` the install refusal reports.
- **Reference function:** a shared function takes a schema id and the checkout-relative path of the file that will
  reference it, and returns the reference text, with the path relative to that file's directory: the YAML
  language-server modeline (`# yaml-language-server: $schema=<path>`) for a YAML file, named by a `.yaml` or `.yml`
  extension, and the `$schema` value for a JSON one, named by `.json`. For an id without the marker it returns a typed
  not-an-editor-document result whatever the file, and for a marked id referenced from a file with any other extension a
  typed unsupported-file result; each caller applies its own policy. A consumer that writes a reference into a project
  file, such as a bootstrap that scaffolds a declaration file, calls it instead of embedding the path. A reference is
  relative to its file, so moving that file or the directory breaks it; under the pre-release posture such a move
  updates its references in place, without shims.
- **Storage class:** derived and never stored. Under `strategy-storage-evolution`'s tracked-versus-stored line they sit
  beside the `system/.internal/` records that move to the store, but they are regenerated per checkout like the
  derived views.
- **Channel:** generated from the live registry by one writer, run wherever ARC provisions a checkout someone edits
  in, so a relative reference in a tracked file resolves in each checkout.
    - **Ignored per clone:** the writer adds the directory to the clone's shared `info/exclude`, as
      `ensureWorktreeMarkerIgnored` (`lib/git/worktree-marker.ts`) does for the worktree marker, and as
      `strategy-storage-evolution` sets provisioning to write exclude entries once per clone. The entry is the root
      address's directory pattern, `.arc/system/.internal/schemas/`. The marker and the writer share one exclude
      helper in `lib/git/`, which appends a given pattern once and reports the exclude path it resolved. The writer
      owns its ignore entry, so the tracked `.gitignore` block is untouched, and a repository whose block ARC does not
      keep current still ignores the documents. This repository never runs `arc update` against itself, and its block
      already lacks the worktree marker.
    - **Primary checkout:** `arc init`, `arc update`, and `arc join` run the writer; a fresh clone regains the
      documents at `arc join`.
    - **Linked worktrees:** every site that provisions an ARC-owned editing checkout runs the writer: work-unit
      spawns (`reconcile-work-unit-worktree.ts`, which atomic graduation also reaches), transient provisioning
      (`provisioning-runtime.ts`), decomposition (`git-decompose-v3-operation.ts`), and the cold-start scaffold
      `arc start --here` runs into a worktree ARC did not create (`runColdStart`, `commands/start.ts`), which writes no
      marker. The primary's generated files do not reach linked worktrees (`pristine.json` is absent from this work
      unit's own worktree), so these writers are required.
    - Marker rewrites on an existing checkout (teardown, rename, errand promotion) provision nothing and run no writer.
      The worktrees ARC creates as tool-owned targets (review materialization, base synchronization, delivery refresh,
      the review-fix candidate gate) get no documents.
    - **Failure at a provisioning site:** the writer fails closed. It writes the exclude entry before the documents, as
      the marker's exclude entry precedes the marker, so a failure never leaves the directory unignored. Every
      provisioning site calls `writeEditorDocumentsOrThrow`, which throws an `EditorDocumentsWriteError` carrying the
      writer's `{target, path, detail}`, because each path below is reached by a throw; `arc schema install` keeps the
      typed result. Each site runs it where a failure takes a path the site already has:
        - **Work-unit spawn and atomic graduation:** in `provisionSpawnedWorktree` (`reconcile-work-unit-worktree.ts`),
          after `ensureWorktreeMarkerIgnored`. A spawn rolls back through `rollbackFreshSpawn`, and a graduation
          through `atomicGraduate`'s own rollback.
        - **Transient provisioning:** inside the `createMarker` dependency (`provisioning-runtime.ts`), after
          `ensureWorktreeMarkerIgnored`. A spawned checkout rolls back through `rollbackSpawnFailure`, reached from
          `establishReadyMarker`'s error arm, and a primary allocation fails before its marker exists.
        - **Cold-start scaffold:** in `runColdStart`'s scaffold `try` (`commands/start.ts`), after
          `scaffoldIntoWorktree`, so a failure runs `rollbackColdStart` and the command refuses with its existing
          `could not scaffold the work unit` reason. The worktree is not ARC's to remove, so any ignored documents
          already written stay, and the next writer run replaces them.
        - **Primary-checkout commands:** `arc init`, `arc update`, and `arc join` fail like any other write they make.
        - **Decomposition:** in both modes' `occupy` hooks (`git-decompose-v3-operation.ts`), once
          `occupyDecomposeResult` returns `occupied` with `protection: "full"`. First creation and re-entry both pass
          there, since an existing owned candidate returns `occupied` without `ensureCandidate`. A throw there becomes
          the `occupation-failed` refusal (`prepareV3Operation`), whose remedy retries the selected mode, and the retry
          re-enters `occupied` and runs the writer again. That refusal drops the underlying error, as it does for any
          occupation adapter failure. Partial protection creates no worktree and runs no writer.
        - Its write targets sit beside writes each site already makes. At the marker-writing sites, the clone's
          `info/exclude` and the checkout's `.arc/system/.internal/` are the marker's own targets. At `arc init` and
          `arc update` the directory sits beside `pristine.json`. At those commands, `arc join`, and the cold-start
          scaffold, the exclude entry is a new write for that site, but it lands inside the `.git` directory every
          commit already writes. Failing closed therefore adds no practical failure condition except a projection
          defect, which D1's projection test stops before merge.
        - `arc schema install` refuses on a failed write (D2).
    - **Refresh:** `arc schema install` (D2) reruns the writer in the current checkout. Between runs, an existing
      checkout's documents can trail the installed CLI or the checkout's own branch. That staleness is accepted: the
      CLI's own validation stays authoritative, and the remedy is one command.
    - **Precedent:** `.arc/system/.internal/pristine.json`, which `arc init` and `arc update` generate with no
      `init-recipe.json` entry. Generated rather than shipped, the documents likewise take no recipe entry.
- **First consumer:** none ships with this work; no production schema carries the marker when it lands. A schema
  registered later with `authored: "editor-document"` gets its document at the next provisioning or
  `arc schema install`, with no change to the writer. Until then the writer still writes the exclude entry and an
  empty directory.

### D5 — Agent discovery

- On demand only. `arc schema` is documented in QUICK-REFERENCE § ARC CLI Commands (both copies) and in its own
  `--help`. The documentation names the verb as the way to retrieve a registered contract and the `editorDocument`
  field as the way to find an editor document; it restates neither the directory nor the result shapes.
- It is not added to `AGENT-BRIEF.ARC.md` or read at session start. Even after D1, `session-init-envelope`'s document
  is 116 KB, and growth of always-loaded context is governed by the findings in `analysis-load-set-scoping`.
- One workflow names it, for the consumer D3 composes the cut map for. § 2 of `decompose-work-unit.md`, where an agent
  completes the map, gains a line in both copies naming `arc schema get decompose-cut-map` as the map's structural
  contract: each authoring slot's shape, discriminators, and allowed constants. Refinements and the decoder's
  cross-field checks stay with `arc decompose` (D3).
    - The line is inline prose with the bare `arc` invocation, not a fenced command block, because
      `decompose-workflow-contract.test.ts` pins the workflow's fenced bash blocks and forbids `npx arc` in it.
    - That workflow loads only when decomposing, so the line adds nothing to always-loaded context.

### D6 — Retire the build's schema bundle

The build stops generating, verifying, and shipping `dist/schemas/kernel.json`. The registry's publication surface is
`arc schema` (D2) and the editor documents (D4), both read from the live registry.

- **Producer:** `src/scripts/build-schema.ts` (`generateRuntimeSchema`) goes, with `loadSchemaProducer`, its
  `LoadedSchemaProducer` type, and `writeBuildArtifacts` (`build-producers.ts`), the `onSuccess` hook in
  `tsup.config.ts` that calls it, and the one `compileCapturedStaging` (`build-compiler-control.ts`) passes.
  `writeKernelSchemaArtifact` and `SchemaArtifactFileSystem` leave `lib/kernel/schema/generate.ts`; `projectKernelSchemas`,
  `projectKernelSchemaClosure`, and `serializeKernelSchemaBundle` stay, and the module's header stops describing
  artifact publication. `hasKernelSchemas` goes, with the bundle checks that call it in `validateStagedOutput` and
  `requireLiveArtifacts`.
- **Build evidence** (`BuildEvidenceSchema`, `build-evidence.ts`):
    - `graphs` loses `schema`, as does the `BuildInputGraphs` type; `compileCapturedStaging` returns the CLI graph
      with an empty control list for the bootstrap to fill, as now.
    - The record carries one input identity over the CLI and control graphs, which is today's `runtime` identity;
      `runtimeSchema` and `BuildInputIdentities`' second member go.
    - `qualification` loses `runtimeSchema` and keeps `published` and `declarations`.
    - `schemaVersion` becomes 3. The format changes in place, with no reader for version 2 (§ Cross-cutting,
      Migration and rollout).
- **Qualification tiers** (`BuildRequirement`, `build-qualification.ts`):
    - `runtime` is unchanged: the CLI entry alone, read by the stale-build check (`createDevCheckDeps`).
    - The middle tier, which test preparation requires (`ensureOwnedRuntimeArtifacts`,
      `validateRuntimeBuildEvidence`), requires the CLI entry and the esbuild metafile `metafile-esm.json`, and is
      renamed `runtimeMetafile` for what it now requires. The metafile stays required because an integration test
      reads it from the live output (`store-reference-packaging.test.ts`).
    - `full` adds the declarations, as now.
    - `validateStagedOutput` (`build-publication.ts`) requires `cli.js`, `metafile-esm.json`, and in full mode
      `cli.d.ts`.
- **Projection gate:** the build failed when a registered schema could not project. D1's projection test is that gate
  now, in the unit tier.
- **Wording:** the messages, names, and documents that say "runtime/schema" or "runtime and schema", or name the schema
  producer or the kernel schema artifact, say what is now prepared:
    - the error messages and doc comments in `build-entry.ts` and `build-runtime-setup.ts`;
    - the header of `build-producers.ts`, which keeps loading the repository's build configurations;
    - the header of `build-compiler-control.ts` and the `@returns` of `compileCapturedStaging`, which name schema
      loading and schema keys;
    - the comments in `tsup.fast.config.ts`, `build-compiler.config.ts`, and `.github/workflows/ci.yml`;
    - the headers of `__tests__/e2e/global-setup.ts` and `__tests__/integration/global-setup.ts`;
    - the doc comments of `native-build-fixture.ts` and `native-build-controller.ts`, which change with the
      fixture-owned hook below;
    - the test names in `build-generation.test.ts` and `vitest-runtime-fixture.ts`, and the `describe` title in
      `kernel/schema-generation.test.ts`, whose `writeKernelSchemaArtifact` cases go with that function;
    - the header and composer doc comment of `production-schema-registry.ts`, which say the build emits the
      composition;
    - `DEV-RULES.PROJECT` § Selecting what to run;
    - QUICK-REFERENCE § Testing and § Building, in this repository's copy (the shipped template carries neither).

  The `npm run build:fast` remedy is unchanged.
- **Tests:**
    - The e2e test that checks the bundle and its presence in `npm pack --dry-run` (`schema-artifact.e2e.test.ts`)
      goes.
    - `PRODUCTION_SCHEMA_IDS` stays with the unit test that already checks the production composition against it
      (`kernel/schema-generation.test.ts`), and gains the ids this work registers. Its helper,
      `__tests__/helpers/schema-artifact.ts`, is renamed `production-schema-ids.ts` for what it holds, with its header.
      The build tests that compare it with the bundle stop.
    - Build tests stop asserting the bundle, the schema graph, and the second identity. The review workflow test that
      checks the review CLI stays inside the published graph (`review-gate-workflows.test.ts`) drops its read of the
      producer and its assertion that `tsup.config.ts` calls `writeBuildArtifacts`, and keeps its assertions on the
      production composition; the review `--schema` emitter's move onto that composition (D1) is tested where it
      lands. The test that the fast and full builds share one success hook
      (`build-config.test.ts`) goes with the hook, and the test that keeps the producer's sources out of the shared
      configuration graph (`build-inputs.test.ts`) goes with the producer: without the hook, the configurations
      reference no schema source.
    - Four sites use the schema producer as a hook that runs during compilation: blocking a build in progress
      (`native-build-controller.ts`), changing an input mid-generation (`build-coordinator.test.ts`), checking that the
      prior CLI survives compilation (`dev-build-refresh.test.ts`), and checking that direct preparation owns its
      artifacts (`vitest-direct-runtime.test.ts`). `build-coordinator.test.ts` also injects an ancillary publication
      fault on the bundle. Each behavior keeps its coverage through a hook the test fixture owns, and the ancillary
      fault moves to `metafile-esm.json`; none is deleted with the producer.
    - The bundle is the only nested file a build stages, and the test that publication handles nested output under
      Windows relative keys (`build-publication-paths.test.ts`) publishes it. That test stages its own nested file
      instead, so the behavior keeps its coverage without the bundle.
- **Order:** the retirement lands before D1's projection change, so no bundle test is updated for the new projection
  only to be deleted.
- _Changed at spec, 2026-10-07:_ the design first kept the bundle as a non-contract artifact, with its authored roots
  diverging from the verb. Tracing its readers at spec found none beyond the build's own completeness checks, and the
  purpose it was built for, publishing the registry to introspection consumers, passes to `arc schema`, which reads
  the live registry. Owner-approved.

### Delivery shape

- **Boundary: stays one work unit, a delivery-plan candidate.** What publishes, in what form, and where is one design:
  the editor documents depend on D1 and D3, and the retirement is this design's decision, the verb replacing the
  bundle as the registry's publication surface. Its three chunks are each independently landable on `main` in order,
  which makes the work a candidate for a delivery plan. This records the fit and binds no delivery state.
- **Three review chunks, in order:**
    1. the bundle retirement (D6);
    2. the projection (D1), the cut map's composition (D3), the verb's `list` and `get` (D2), the `editor-document`
       marker value with the layout address its `editorDocument` path resolves through (D4), and the documentation
       and workflow line (D5);
    3. the editor documents (D4): the writer, the reference function, the provisioning sites, and
       `arc schema install`.
- **`Class`: `Heavy`.**
    - Derivation fires on D1 (the fragment-granular fold and the projection side) and on D4 (the marker, the
      faithfulness rule, and the per-clone install channel).
    - Scale does not fire. The work comprises the kernel registry and projection with the identity change's test
      updates; one optional metadata field set on seventeen registrations; one composer registering the cut map with
      a type annotation in place of its slug transform; one new handler with three subcommands; two existing emitters
      adjusted; one writer called from the existing provisioning paths; and documentation, including one line in the
      decompose workflow.
    - The retirement removes a producer, a source graph, and an identity from build machinery whose ownership,
      publication, and qualification logic it does not change, and it moves four test hooks to a fixture-owned
      seam.
    - Not `Novel`: the design composes registry metadata, the existing closure projection, `pristine.json`'s
      generated-file pattern, and the worktree marker's per-clone exclude.

## Alternatives & Rationale

- **Verb name:** `arc introspect` is vaguer and suggests more than schemas; `arc contracts` sidesteps the overloaded
  word but breaks the vocabulary of `--schema` and `KernelRegistry`.
- **Output shape:** the review `{rootId, schemas}` closure as-is carries no metadata; the delivery
  `{id, version, schema}` envelope returns the root alone, with dangling references. D2 keeps the delivery shape's
  single `schema`, made self-contained, and adds the posture.
- **Leave the projection as it is:** `arc schema get` would print up to 4.2 MB, and five roots would stay invalid
  against the metaschema.
- **A pruned `__shared` document per closure:** each carries the one `__shared` identity with different contents, so
  two contracts cannot load into one validator; measured, Ajv refuses the second.
- **One projection side for every root:** the output side marks a request's defaulted fields required, and an editor
  document built from it would flag a valid file that omits one; the input side would describe results and envelopes
  as the CLI accepts rather than emits them.
- **Keep relative `$id`s, or use an `https` URL:** standard output gives a relative identity no retrieval URI to
  resolve against, and a bare filename can collide with another tool's; an `https` URL on a domain ARC does not own
  would imply a hosted schema that does not exist.
- **Keep shipping the bundle beside the verb:** it has no reader, and as an output-side projection it would render
  authored roots differently from `get` (`review-resolve-request` would require `frontlineActive` there and not from
  the verb), publishing two documents under one identity. It keeps costing a producer loaded on every build, a source
  graph and identity in the build evidence, and a qualification tier.
- **Retire the bundle as its own work unit:** it would work, and it lands first as chunk 1 can. It would separate the
  removal of the registry's publication surface from the design of the surface that replaces it, and it saves no work:
  landing the chunks separately needs no second work unit, since each lands on `main` in order under one design.
- **Editor publication elsewhere:** a verb-only design leaves project files ARC defines without an editor document. A
  separate change splits one publication design, covering what is published, in what form, and where. Hosted URLs or
  SchemaStore registration need a public release and add an external seam.
- **Sibling files instead of one document:** it avoids rewriting references, but each root's pruned `__shared` differs,
  so roots sharing a flat directory collide on `__shared.schema.json` unless each gets its own subdirectory, and the
  editor must then resolve relative references across files, which editors handle less uniformly than local `$defs`
  pointers.
- **Editor documents on `draft-07`:** Zod also emits it, but both editor services accept 2020-12 (D4), and one target
  keeps the editor document identical to the verb's.
- **Publish `arc-config` now:** its schema describes the line reader's all-string record, so the published contract
  would disagree with every YAML tool reading the file, and no consumer of it is named. Repairing the reader first lets
  the schema publish as the file reads.
- **Repair the configuration reader here:** the reader, the githooks' shell lookup, the line-based writers, and
  ADR-003's constraint are one concern of their own, and this work ships without them.
- **Leave the cut map unpublished:** its consumer is named and unserved, and what blocks its output side is a
  transform that only strips a type brand.
- **Ignore through the managed `.gitignore` block:** every command that writes the block would carry the entry, from
  five hand-copied lists today, and a repository whose block ARC does not keep current, this one included, would leave
  the generated documents untracked but not ignored.
- **Treat a failed write as advisory at provisioning sites:** each site would need the writer placed outside its
  rollback or `catch` scope and its own channel to report the failure, for a failure that coincides with writes those
  sites already make.
- **Automatic refresh:** no existing trigger runs in every checkout often enough to earn a guarded rewrite of an
  advisory aid; the explicit `arc schema install` covers the cases the provisioning writers miss.
- **Tracked installation through `init-recipe.json`:** every `arc update` would dirty the working tree with generated
  output that no one edits.
- **Top-level `system/schemas/`:** the top level of `system/` is the customization tier, and these files are not
  edited.
- **A list of editor-facing ids:** a second hand-kept list beside the registration, the drift pattern the install
  recipe already shows.

## Cross-cutting Considerations

**Trust boundaries.** `list` and `get` are read-only over the in-process registry. The `<id>` operand selects a
registry entry or refuses; it never forms a path. The writer forms file names only from registered ids, which
registration validates as slugs, and writes only under its CLI-owned directory and to the clone's `info/exclude`.

**Performance.** Projecting the whole production registry takes about 0.25 to 0.3 s per side (measured in memory,
three runs each), about what today's inline projection takes. A `get` projects only its root's side, `list` projects
nothing, and the writer projects the input side once, or not at all while no schema is marked. The build drops the
producer it loaded and ran on every build.

**Testing.**

- Unit: D1's projection test over every registered root on both sides; tuple bounds on each side, including optional
  elements and a rest element; the fold's self-containment, with no external `$ref` and no `$id` or `$schema` in
  `$defs`; `authored` metadata validation; the shared lookup's found and unknown results; the reference function for
  YAML, JSON, a file with any other extension, and an unmarked id; the cut map's parse behavior under the type
  annotation; the production id pin.
- Integration: the writer in a temporary repository with a registry holding a marked test schema, covering the document,
  the exclude entry, `git check-ignore`, a clean `git status`, the directory's replacement, an unmarked schema's
  absence, an empty directory with no projection when none is marked, a failed write's refusal for each `target`, naming
  the absolute path it could not write, and an `exclude` failure with no `path` when Git cannot resolve `info/exclude`;
  an injected writer failure at a work-unit spawn, which rolls the spawn back, and at decomposition, which refuses with
  `occupation-failed`, after which a retry of the mode re-enters the candidate and writes its documents.
- E2E: `arc schema list`, `get` (including a request root on the input side and the unknown-id refusal), and
  `install` against the built CLI, including `install --json` outside a project, whose output is the refusal alone;
  each provisioning path D4 names writes the exclude entry and the directory; the delivery inventory emitter's document
  has no external reference; the review `--schema` emitter's URN `rootId`.
- The build tests keep every coordination behavior they cover (D6).

**Migration and rollout.**

- Build evidence changes format in place. An old record fails the strict parse, and its owner regenerates it: test
  preparation does so itself, and a CLI run reports the stale build with the existing `npm run build:fast` remedy.
  Each checkout rebuilds once after merging the change, as after any source change, and that rebuild's publication
  removes the old `dist/schemas/kernel.json` along with every other file the new generation does not produce
  (`publishStagedBuild`). Publication removes files, not directories (`listRelativeFiles` lists files only), so an
  existing checkout keeps an empty `dist/schemas/`; it is inert and nothing reads it. CI builds and consumes evidence
  within one run, so it needs nothing.
- Under the pre-release posture the identity change, the `rootId` change, and the removal of the packaged bundle take
  effect in place, with no aliases.
- Existing checkouts get no editor documents until their next provisioning or `arc schema install`; with no marked
  schema at landing, that is only the empty directory and its exclude entry.

**User-facing impact.** A new `arc schema` command, documented in QUICK-REFERENCE and `--help`; smaller and valid
documents from the review `--schema` flags and the delivery inventory emitter; a `.arc/system/.internal/schemas/`
directory in each provisioned checkout, ignored by Git; and a package without `dist/schemas/kernel.json`.

## Success Criteria

- `arc schema get session-init-envelope` returns one self-contained document of about 116 KB with its version and
  posture, where today's closure is 374 KB, and `get review-status-result` about 63 KB, where today's is 4.2 MB.
- Every registered root's `get` document passes 2020-12 metaschema validation and compiles in
  `new Ajv2020({ strict: true, validateFormats: false })`, and no test compiles a projected document with
  `validateSchema: false`.
- `get review-resolve-request` leaves `frontlineActive` optional; `arc delivery plan inventory schema` returns a
  document with no external reference; a review `--schema` result's `rootId` is `urn:arc:schema:<id>`, the `$id` of
  the one document it holds.
- `arc schema get decompose-cut-map` returns the map's input-side document, and the decompose workflow's § 2 names it.
- `arc schema get <unknown>` refuses with `unknown-schema-id` and exit 1, naming `arc schema list` as the remedy.
- `arc schema list --json` lists every production id with its version, posture, and `editorDocument`, and every
  result the verb emits validates against its registered envelope.
- In a temporary repository, given a registry holding a marked test schema, the writer produces a self-contained
  document under `.arc/system/.internal/schemas/` that validates a sample file with no unresolved reference;
  `git check-ignore` reports it ignored and `git status` stays clean; an unmarked schema gets none; and an unwritable
  directory makes `arc schema install` refuse with `editor-documents-unwritable` and exit 1.
- On each provisioning path D4 names, and after `arc schema install` in an existing checkout, the built CLI writes the
  directory and its exclude entry and leaves the managed `.gitignore` block unchanged.
- After `npm run build` and `npm run build:fast` into a fresh `dist/`, it contains no `schemas/` directory; the build
  evidence carries one input identity and no schema graph; and test preparation qualifies on the CLI entry and the
  metafile.
- No source, test, build or CI configuration, rule, or reference document refers to `dist/schemas/kernel.json`,
  `generateRuntimeSchema`, or `hasKernelSchemas`, or says "runtime/schema", "runtime and schema", "schema producer",
  or "schema artifact", and every build-coordination behavior the schema producer hosted keeps a test.
- An injected writer failure fails a work-unit spawn and rolls it back as a failed marker exclude does; at
  decomposition it refuses with `occupation-failed`, and retrying the mode re-enters the candidate and writes its
  documents.
- `arc schema install --json` outside an ARC project prints only the `arc-project-root-unresolved` refusal and exits 1.

## Open Questions

[none]
