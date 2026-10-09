# Task List: Schema-Driven CLI Introspection Layer

- **Design:** `spec-schema-introspection-layer.md`

---

## **Phase 1:** Retire the build's schema bundle

_Purpose:_ Remove the second projection before the projection changes, so the build compiles, records, and
qualifies output without a schema producer and no bundle test outlives it.

_Mode:_ `layer` — closes on a settled build pipeline with one input identity and no schema artifact.

_Exit criterion:_ Full and fast builds into a fresh `dist/` produce no `schemas/` directory, record evidence with
one input identity and no schema graph, and test preparation qualifies on the CLI entry and the metafile, with
every build behavior the producer or its bundle hosted still under test.

### `[x]` **1.1 Qualify and stage build output without the bundle — D6**

- _Goal:_ Qualification and staged publication accept a generation from its CLI entry, its metafile, and — in full
  mode — its declarations, so a build that writes no `schemas/kernel.json` still qualifies and publishes.

- _Outcome:_ Qualification uses `runtimeMetafile`; staged publication no longer requires the bundle. The staged
  fixture holds only runtime output, and metafile refusal, ownership loss, and Windows nested publication keep their
  coverage. The second input identity remains until the producer is retired.

### `[x]` **1.2 Remove the schema producer and its evidence graph, re-seating the hooks it hosted — D6**

- _Goal:_ Builds compile with no schema producer, record one input identity over the CLI and control graphs, and
  every build-coordination behavior the producer hosted keeps its test through a hook the test fixture owns.

    - `[x]` **1.2.a Take the producer out of compilation**

        - Compilation passes captured options through with only the owned output directory overridden. The producer,
          its configuration hook, bundle assertions, and bundle E2E suite are removed; CLI and control capture remain.

    - `[x]` **1.2.b Record one input identity**

        - Version 3 evidence records CLI and control graphs, one runtime identity, and publication/declaration facts.
          Every tier checks that identity; version 2 records refuse qualification and regenerate through the owner.
          Compiler, shared, and control inputs retain invalidation coverage.

    - `[x]` **1.2.c Re-seat the producer-hosted behaviors on a fixture-owned hook**

        - Native fixtures import a success hook from `fixture-build-hook.ts`. The blocking barrier, compiler lifetime,
          mid-generation input change, prior-CLI survival, and direct-preparation ownership checks run through it;
          ancillary publication faults target the metafile. The ready record retains its PID and staging directory.

### `[x]` **1.3 Retire the artifact writer and the bundle's identity pin — D6**

- _Goal:_ No source or test publishes, names, or pins the kernel schema artifact, while the production composition
  stays pinned against its expected ids.

- _Outcome:_ Removed artifact publication and its filesystem seam; deterministic registry projection remains. Production
  composition stays pinned through the renamed production-schema-ids helper.

### `[x]` **1.4 Name what the build now prepares — D6**

- _Goal:_ Every message, name, and document that described the build as preparing runtime and schema output, or
  named the schema producer or artifact, says what is prepared now — the CLI entry, its metafile, and in full mode its
  declarations.

    - `[x]` **1.4.a Source messages, names, and comments**

        - Build preparation and qualification messages describe the CLI and metafile; compiler, fast-build, CI,
          registry-composition, and test-setup comments describe their current outputs and responsibilities.

    - `[x]` **1.4.b Rules and reference documents**

        - Repository rules and reference describe fast preparation without declarations. The retirement search
          finds no obsolete producer or artifact references outside preserved planning and historical records.

## **Phase 2:** Project contracts at real size, on the authored side, valid

_Purpose:_ Settle the projection every publication surface reads: one self-contained, bounded, metaschema-valid
document per contract, on the side its authors write, with the cut map composed into production.

_Mode:_ `layer` — closes on a settled projection layer that every consumer reads.

_Exit criterion:_ Every production root, the cut map included, folds into one self-contained document on each side
that passes 2020-12 metaschema validation and compiles under strict Ajv, and both existing emitters return those
documents.

### `[x]` **2.1 Declare each schema's authored side in its registration — D1**

- _Goal:_ A registration states whether its documents are authored — a request a caller composes or a file a person
  edits — and the registry keeps and validates that declaration, so no list beside the registrations restates it.

- _Outcome:_ Registrations retain and validate an optional authored side in immutable metadata. The sixteen public
  review and delivery request roots declare request; unmarked roots retain no authored field.

### `[x]` **2.2 Project each side with shared subschemas by reference under absolute identities — D1**

- _Goal:_ The registry projects one side at a time, named by every caller, into a bundle where a reused subschema
  appears once, in `__shared`, and every document is identified by `urn:arc:schema:<id>`.

- _Outcome:_ Every registry projection requires its input or output side, extracts reused subschemas into shared
  definitions, and uses absolute URN identities. Sorted projection preserves shared-definition names across registration
  orders; callers and contract assertions name their side and resolve references.

### `[x]` **2.3 Fold each root into one self-contained document on its declared side — D1**

- _Goal:_ Any registered root yields one document that resolves entirely within itself, on the side its registration
  declares, so a document loads alone and two contracts load into one validator without colliding.

- _Outcome:_ Root closures choose their declared side and fold reachable registered and shared dependencies into local
  definitions without resource identities or unreachable shared definitions. Review schema flags retain their envelope
  while carrying one self-contained document.

### `[x]` **2.4 Serve both emitters from the production projection through one lookup — D1, D2**

- _Goal:_ One identity yields one document from every surface: the review `--schema` flags and
  `arc delivery plan inventory schema` return the self-contained documents the verb will, with no external reference.

- _Outcome:_ The shared lookup returns registry metadata and the canonical folded document, or unknown without
  projection. Review discovery and delivery inventory use the production composition; delivery reads its version from
  registry metadata and emits no external references.

### `[x]` **2.5 Bound tuples and prove every root projects valid on both sides — D1**

- _Goal:_ Every registered root's document, on either side, passes 2020-12 metaschema validation and compiles under
  strict Ajv, and one unit test stops any later registration that breaks either.

- _Outcome:_ Tuple projection follows each side’s optional tail, bounds fixed tuples, leaves rest tuples unbounded
  above, and removes empty prefixes. Every production root is validated and strictly compiled on both sides; the review
  projection workarounds are removed.

### `[x]` **2.6 Compose the decompose cut map into production — D3**

- _Goal:_ The cut map an agent authors is a registered production contract, projectable on both sides, while the CLI
  parses it exactly as before.

- _Outcome:_ The production registry composes decompose-cut-map at version 3 on its request side. Its slug fields use
  the registered kernel schema without a runtime transform, preserving parsing and decoder checks while supporting both
  projections and local slug references.

## **Phase 3:** The `arc schema list` and `get` verb

_Purpose:_ Make every registered contract retrievable by identity through one verb, with its registry metadata and
its editor-document location, and name the verb where agents look it up.

_Mode:_ `slice` — closes on `arc schema list` and `get` exercisable end to end against the built CLI.

_Exit criterion:_ Against the built CLI, `arc schema list --json` lists every production id with its metadata,
`get` returns a request root on its input side and the cut map's document, an unknown id refuses with its remedy,
and every result validates against its registered envelope.

### `[x]` **3.1 Resolve the editor-document location through the layout resolver — D4**

- _Goal:_ The editor-document directory and each marked schema's document path have one binding, the layout resolver,
  which the verb reads now and the writer reads later, including when no schema is marked.

- _Outcome:_ The layout resolver owns paired directory and document addresses under one binding, validates schema
  coordinates as slugs, and returns managed checkout-relative paths. User-document projection moved into a helper to
  retain the complexity limit.

### `[x]` **3.2 Produce typed `list` and `get` results — D2**

- _Goal:_ `list` and `get` answer from the production registry in shapes registered beside it and validated before
  emission, and an unknown id is a typed refusal naming the command that lists valid ones.

- _Outcome:_ Registered and production-composed strict list, get, and unknown-ID envelopes. Both handlers validate
  compact JSON before emission, share production lookup and layout paths, and leave metadata-only listing independent of
  projection.

### `[x]` **3.3 Wire `arc schema` into the CLI — D2**

- _Goal:_ `arc schema list` and `arc schema get <id>` run from the built CLI, with help and input declarations the
  repository's inventory and help-coverage tests reconcile.

- _Outcome:_ The lazy-loaded schema command runs list and always-JSON get through interaction contexts, with reconciled
  help, input registrations, and machine-mode policy. Built-CLI tests cover discovery outside a project, authored
  requests, the cut map, unknown identities, and unsupported flags.

### `[ ]` **3.4 Name the verb where agents look it up — D5**

- _Goal:_ An agent finds a registered contract on demand through `arc schema`, and an agent completing a decompose
  cut map is pointed at its structural contract, with nothing added to always-loaded context.

    - `[ ]` **3.4.a QUICK-REFERENCE § ARC CLI Commands, both copies**

        - Package source first (`arc/reference/QUICK-REFERENCE.template.md`, a configurable template), then the
          project copy (`.arc/reference/QUICK-REFERENCE.md`).
        - Names `arc schema` as the way to retrieve a registered contract and the `editorDocument` field as the way
          to find an editor document; restates neither the directory nor the result shapes.

    - `[ ]` **3.4.b `decompose-work-unit.md` § 2, both copies**

        - One inline line where the agent completes the map names `arc schema get decompose-cut-map` as the map's
          structural contract — each authoring slot's shape, discriminators, and allowed constants — and says the
          refinements and cross-field checks stay with `arc decompose`.
        - Inline prose with the bare `arc` invocation, not a fenced block: `decompose-workflow-contract.test.ts` pins
          the workflow's fenced bash blocks, forbids `npx arc`, and holds the two copies byte-equal.

### `[ ]` **3.5 Exercise `list` and `get` against the built CLI** — validate exit criterion at segment scope

- _Goal:_ Phase 3's exit criterion is shown against a fresh build of the CLI, with the scenario and its result
  recorded.

## **Phase 4:** Write editor documents and install them on demand

_Purpose:_ Prove the editor-document channel in one checkout: the writer, the reference a project file uses, and
the explicit `arc schema install` that reruns it.

_Mode:_ `slice` — closes on `arc schema install` exercisable end to end in an existing checkout.

_Exit criterion:_ In an existing checkout, `arc schema install` writes the editor-document directory behind its
clone-level exclude entry, `git status` stays clean and the managed `.gitignore` block is unchanged, and each
refusal exits 1 with its typed envelope.

### `[ ]` **4.1 Write a checkout's editor documents behind their own exclude entry — D4**

- _Goal:_ One writer leaves a checkout's CLI-owned directory holding exactly one self-contained document per marked
  schema, ignored through the clone's own exclude entry written first, and reports what it wrote or a typed failure
  naming what failed.

    - The idempotent append in `ensureWorktreeMarkerIgnored` (`lib/git/worktree-marker.ts`) moves into a helper in
      `lib/git/` that takes the pattern, resolves the clone's shared `info/exclude` with
      `git rev-parse --git-path info/exclude` run with `cwd` set to the checkout root, appends the pattern once, and
      reports the absolute path it resolved against that root, on success and on any failure after Git answers:
      reading the file, creating its directory, or writing it. The marker calls it with its own pattern, and its tests
      keep passing unchanged.
    - `writeEditorDocuments` (`lib/schema-command/editor-documents.ts`) takes the checkout root, the caller's
      `GitExec`, an `EditorDocumentsFs` that extends `WorktreeMarkerIgnoreFs` with a recursive `rm` (a node adapter
      sits beside it), and an optional registry. It resolves the directory through Task 3.1's root address, adds its
      pattern `.arc/system/.internal/schemas/` through the helper before writing any document, projects the input
      side once when any schema is marked, and folds each marked root from that bundle into the document address's
      path.
    - Each write replaces the directory's contents, so a schema that loses its marker loses its document; with no
      marked schema the writer leaves the exclude entry and an empty directory without projecting.
    - Success returns the checkout-relative paths written. A failure returns `{target, path, detail}`: `target` is
      `"documents"` or `"exclude"`; `path` is absolute, since a linked worktree's `info/exclude` lies outside the
      checkout, and absent only when Git cannot resolve `info/exclude`; and `detail` carries the underlying message.
      Each caller applies its own failure policy.
    - `writeEditorDocumentsOrThrow`, beside it, serves the provisioning sites, whose rollback paths are all reached by
      a throw. It takes the same inputs and an optional writer of `writeEditorDocuments`' type, defaulting to it, and
      throws an `EditorDocumentsWriteError` carrying a returned failure's `{target, path, detail}`. A site's seam is
      that optional writer, so an injected failure throws exactly as a production one does.
    - The generated files take no `init-recipe.json` entry, as `pristine.json` takes none.
    - Integration tests run in a temporary repository with a registry holding a marked test schema.

    - Build `test-first` (one behavior at a time):
        - The written document validates a sample file with no unresolved reference
        - `git check-ignore` reports the document ignored and `git status` stays clean
        - An unmarked schema gets no document
        - With no marked schema, the writer projects nothing and leaves the exclude entry and an empty directory
        - A rerun removes a document whose schema lost its marker
        - The exclude entry is written once and before any document
        - An unwritable directory returns a `documents` failure naming its absolute path
        - An unreadable `info/exclude` and an unwritable one each return an `exclude` failure naming its absolute
          path, and write no document
        - A failing `git rev-parse` returns an `exclude` failure with no `path`, and writes no document
        - The throwing form calls the writer it is given, throws `EditorDocumentsWriteError` carrying a returned
          failure, and returns the paths otherwise

### `[ ]` **4.2 Compose the reference a project file uses — D4**

- _Goal:_ A consumer that writes a schema reference into a project file gets the exact reference text, relative to
  that file, or a typed result saying why there is none, without restating the directory.

- _Note:_ compute the relative path with `path.posix`, since `path.relative` yields backslashes on Windows that break
  a `$schema` value, and prefix `./` unless it already starts with `../`, which `posix.relative` omits.

    - `editorDocumentReference(id, referencingPath, registry?)` (`lib/schema-command/editor-documents.ts`) takes a
      schema id and the checkout-relative path of the referencing file; it returns the YAML language-server modeline
      (`# yaml-language-server: $schema=<path>`) for a file ending `.yaml` or `.yml` and the `$schema` value for one
      ending `.json`, with the path relative to that file's directory, resolved through Task 3.1's document address.
    - An unmarked id returns a typed not-an-editor-document result whatever the file, and a marked id referenced from
      a file with any other extension returns a typed unsupported-file result.

    - Build `test-first` (one behavior at a time):
        - A YAML file beside `arc-config.yml` gets the modeline `./.internal/schemas/<id>.schema.json`
        - A JSON file elsewhere in the checkout gets its relative `$schema` value
        - An unmarked id returns not-an-editor-document
        - A marked id referenced from a file that is neither YAML nor JSON returns unsupported-file

### `[ ]` **4.3 Produce typed `install` results — D2, D4**

- _Goal:_ `install` runs the writer for the current checkout and reports the written paths, or refuses with a typed
  envelope and exit 1 when it is outside a project or cannot write.

- _Note:_ `command-surface-documentation.test.ts` fails on the remedy's backticked `arc schema install` until Task 4.4
  registers the subcommand; Tasks 4.3 and 4.4 close as one review increment.

    - `schema-install-envelope` joins the other result schemas in `lib/schema-command/envelope.ts` and
      `registerSchemaCommandSchemas`, and `schema-refusal-envelope` admits `arc-project-root-unresolved` and
      `editor-documents-unwritable`, closing its set at three. `PRODUCTION_SCHEMA_IDS` gains the new envelope.
    - The project root resolves through `resolveArcRoot` (`lib/paths.ts`), not `requireArcProjectRoot`
      (`handlers/shared.ts`), which logs a human-readable line ahead of any JSON; outside a project, plain output prints
      `ARC_PROJECT_ROOT_ERROR`.
    - A writer failure maps to `{status: "refused", reason: "editor-documents-unwritable", target, path, detail,
      remedy}`, whose remedy says to correct the reported cause and rerun `arc schema install`; plain output prints
      `detail` and the remedy. The refusal carries `path` only when the writer's failure does, so
      `schema-refusal-envelope` declares it optional.
    - Success emits the writer's checkout-relative paths: `{status: "ok", documents: [path]}` with `--json`, and one
      path per line otherwise.

    - Build `test-first` (one behavior at a time):
        - `install` in a project returns the written document paths
        - `install --json` outside a project emits only the `arc-project-root-unresolved` refusal, exit 1
        - A `documents` failure and an `exclude` failure each refuse with `editor-documents-unwritable`, their
          target, and exit 1
        - `install` in an ARC project that is not a Git checkout refuses with an `exclude` failure and no `path`, and
          the refusal validates against `schema-refusal-envelope`
        - Every result `install` emits validates against its registered envelope

### `[ ]` **4.4 Wire and document `arc schema install` — D2, D5**

- _Goal:_ `arc schema install` runs from the built CLI, and the command reference names it as the refresh for a
  checkout's editor documents.

    - `cli.ts` gains the subcommand, its action running through `withInteractionContext`, machine-readable under
      `--json`; `COMMAND_SUMMARIES` gains `schema install`.
    - `handlers/schema.ts` adds a `CommandInputRegistration` for `install`'s `--json` field and a machine-mode
      `--json` policy declaration, which `src/command-input-registrations.ts` already collects.
    - QUICK-REFERENCE § ARC CLI Commands, both copies, names `arc schema install` as the refresh after a CLI upgrade
      or in a checkout provisioned before it existed.
    - An e2e test runs `install` in a project checkout and `install --json` outside a project against the built CLI.

### `[ ]` **4.5 Exercise `arc schema install` in an existing checkout** — validate exit criterion at segment scope

- _Goal:_ Phase 4's exit criterion is shown against a fresh build of the CLI in an existing checkout, with the
  scenario and its result recorded.

## **Phase 5:** Provision editor documents wherever ARC provisions an editing checkout

_Purpose:_ Run the writer at every site that provisions an ARC-owned editing checkout, each failing closed through
the path the site already has.

_Mode:_ `replication` — closes when every provisioning site D4 names runs the writer, batch-verified.

_Exit criterion:_ Each provisioning path D4 names writes the exclude entry and the editor-document directory through
the built CLI, and an injected writer failure rolls back a work-unit spawn and refuses decomposition with a
retryable `occupation-failed`.

_Design decisions:_ `notes-schema-introspection-layer.md` § Provisioning-site failure and test seam.

### `[ ]` **5.1 Primary-checkout commands: `arc init`, `arc update`, `arc join` — D4**

- _Goal:_ A primary checkout has its editor documents after `arc init`, `arc update`, or `arc join`, and a failed
  write fails the command like any other write it makes.

- **Additional Context:** `notes-schema-introspection-layer.md` § Provisioning-site test inventory, the rows for
  Task 5.1.

    - `runInit` and `runUpdate` write the directory beside `pristine.json`; `runJoin` restores the documents to a
      fresh clone. `runJoinReconfigure` reselects tools, provisions nothing, and runs no writer.
    - The seam rides each command's existing `io` context; `makeIOContext` (`helpers/integration.ts`) and the
      `mockIO` builders in `unit/init.test.ts` and `unit/join.test.ts` inject a writer that does nothing.
    - The managed `.gitignore` block and the entry lists that write it are untouched.
    - An e2e assertion checks the directory and the exclude entry after `arc init` (`init.e2e.test.ts`), after
      `arc update` once the test removes both (`update.e2e.test.ts`), and after `arc join` in a clone of an
      initialized repository (a new `init.e2e.test.ts` case).

    - Build `test-first` (one behavior at a time):
        - Each command leaves the directory and its exclude entry, with the managed `.gitignore` block unchanged
        - A writer failure fails each command with its ordinary error

### `[ ]` **5.2 Work-unit spawn and atomic graduation — D4**

- _Goal:_ A spawned work-unit worktree, including one atomic graduation reaches, has its editor documents, and a
  failed write rolls the spawn or graduation back as a failed marker exclude does.

- **Additional Context:** `notes-schema-introspection-layer.md` § Provisioning-site test inventory, the rows for
  Task 5.2.

    - The writer runs in `provisionSpawnedWorktree` (`reconcile-work-unit-worktree.ts`) after
      `ensureWorktreeMarkerIgnored`; a spawn rolls back through `rollbackFreshSpawn`, a graduation through
      `atomicGraduate`'s own rollback, which reaches it through `deps.provisionSpawnedWorktree`.
    - The seam rides `ReconcileWorkUnitWorktreeContext`, and `SpawnWorktreeContext` (`worktree-scaffold.ts`) gains it
      too: `runCreateNew` (`commands/start.ts`) builds the reconcile context inline and passes `SpawnWorktreeContext`'s
      seam into it. The reconcile unit test's `buildCtx`, the graduation context in `atomic-graduation.test.ts`,
      `ctx(io)` in `unit/commands/start.test.ts`, and the inline `runCreateNew` contexts in `start-dispatch.test.ts`
      inject a writer that does nothing.
    - An e2e assertion checks the directory and the exclude entry, once the test removes the exclude line first, in
      the worktree that `rename.e2e.test.ts`'s create-new case spawns and in the one `lifecycle-exit.e2e.test.ts`'s
      decomposition fixture graduates.

    - Build `test-first` (one behavior at a time):
        - A spawned worktree has the directory and its exclude entry
        - An injected writer failure fails the spawn and rolls it back
        - An injected writer failure during atomic graduation rolls the graduation back

### `[ ]` **5.3 Transient provisioning — D4**

- _Goal:_ A checkout provisioned for transient work has its editor documents, and a failed write takes the
  provisioning failure path that exists today.

- **Additional Context:** `notes-schema-introspection-layer.md` § Provisioning-site test inventory, the rows for
  Task 5.3.

    - The writer runs inside the `createMarker` dependency (`createNodeProvisioningDependencies`,
      `provisioning-runtime.ts`) after `ensureWorktreeMarkerIgnored`; a spawned checkout rolls back through
      `rollbackSpawnFailure`, reached from `establishReadyMarker`'s error arm, and a primary allocation fails before
      its marker exists.
    - The seam rides `NodeProvisioningRuntimeOptions`.
    - An e2e assertion checks the directory and the exclude entry, once the test removes the exclude line first, in
      the checkout `errand materialize` spawns (`locus-errand-roundtrip.e2e.test.ts`), and, once it also removes the
      directory, in the primary checkout an `errand open` allocates (`errand.e2e.test.ts`).

    - Build `test-first` (one behavior at a time):
        - A spawned transient checkout has the directory and its exclude entry
        - An injected writer failure rolls a spawned transient checkout back
        - An injected writer failure fails a primary allocation before its marker exists

### `[ ]` **5.4 Decomposition — D4**

- _Goal:_ A decomposition candidate under full protection has its editor documents, and a failed write refuses with
  a retryable `occupation-failed` whose retry re-enters the candidate and writes them.

- _Note:_ `executeGitV3DecomposeOperation` sits at 95 of the gate's 100 lines per function; both `occupy` hooks call
  one helper that runs the writer, so neither operation grows.

- **Additional Context:** `notes-schema-introspection-layer.md` § Provisioning-site test inventory, the rows for
  Task 5.4.

    - The writer runs in both modes' `occupy` hooks (`git-decompose-v3-operation.ts`) once `occupyDecomposeResult`
      returns `occupied` with `protection: "full"`, which first creation and re-entry both pass; a throw becomes the
      `occupation-failed` refusal (`prepareV3Operation`). Candidate creation in `git-decompose-v3-operation-io.ts`
      writes the marker's exclude entry, but re-entry skips it, so the writer does not run there. Partial protection
      creates no worktree and runs no writer.
    - The seam rides the operation's dependencies; `repositoryDependencies` in
      `decompose-v3-repository-plan.test.ts` injects a writer that does nothing.
    - An e2e assertion checks the candidate's directory and the exclude entry after execute and after extract in
      `decompose-command-modes.e2e.test.ts`.

    - Build `test-first` (one behavior at a time):
        - A full-protection candidate has the directory and its exclude entry
        - An injected writer failure refuses with `occupation-failed`
        - Retrying the mode after the failure re-enters the candidate and writes its documents
        - Partial protection writes nothing

### `[ ]` **5.5 Cold-start scaffold — D4**

- _Goal:_ A worktree that `arc start --here` scaffolds into has its editor documents, and a failed write refuses
  through the scaffold's existing rollback and reason.

- _Note:_ `runColdStart` sits at cyclomatic complexity 15 of the gate's 15, with no suppression; it passes its seam
  to `writeEditorDocumentsOrThrow` as is, adding no branch.

- **Additional Context:** `notes-schema-introspection-layer.md` § Provisioning-site test inventory, the rows for
  Task 5.5.

    - The writer runs in `runColdStart`'s scaffold `try` (`commands/start.ts`) after `scaffoldIntoWorktree`, so a
      failure runs `rollbackColdStart` and the command refuses with `could not scaffold the work unit: <message>`,
      the message naming what failed. Ignored documents already written stay: the worktree is not ARC's to remove,
      and `rollbackColdStart`'s `git clean -f` leaves ignored files.
    - `runColdStart` passes the seam Task 5.2 gives `SpawnWorktreeContext`. `ctx(io)` in `unit/commands/start.test.ts`
      already injects a writer that does nothing; the inline `runColdStart` context in `start-dispatch.test.ts` now
      injects one.
    - An e2e assertion checks the directory and the exclude entry after `start --here` in `rename.e2e.test.ts`'s
      `startInPlace`, once the test removes both first.

    - Build `test-first` (one behavior at a time):
        - A cold-start scaffold leaves the directory and its exclude entry
        - An injected writer failure refuses with the existing scaffold reason after rollback

### `[ ]` **5.6 Exercise every provisioning path** — validate exit criterion at segment scope

- _Goal:_ Phase 5's exit criterion is shown through the built CLI on every provisioning path D4 names, with the
  scenario and its result recorded.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` After `npm run build` and `npm run build:fast` into a fresh `dist/`, it contains no `schemas/` directory

- `[ ]` The build evidence carries one input identity and no schema graph, and test preparation qualifies on the CLI
  entry and the metafile

- `[ ]` No source, test, build or CI configuration, rule, or reference document refers to `dist/schemas/kernel.json`,
  `generateRuntimeSchema`, or `hasKernelSchemas`, or says "runtime/schema", "runtime and schema", "schema
  producer", or "schema artifact"

- `[ ]` Every build-coordination behavior the schema producer hosted keeps a test

- `[ ]` `arc schema get session-init-envelope` returns one self-contained document of about 116 KB with its version
  and posture, and `get review-status-result` one of about 63 KB

- `[ ]` Every registered root's `get` document passes 2020-12 metaschema validation and compiles in
  `new Ajv2020({ strict: true, validateFormats: false })`, and no test compiles a projected document with
  `validateSchema: false`

- `[ ]` `get review-resolve-request` leaves `frontlineActive` optional

- `[ ]` `arc delivery plan inventory schema` returns a document with no external reference

- `[ ]` A review `--schema` result's `rootId` is `urn:arc:schema:<id>`, the `$id` of the one document it holds

- `[ ]` `arc schema get decompose-cut-map` returns the map's input-side document, and the decompose workflow's § 2
  names it

- `[ ]` `arc schema get <unknown>` refuses with `unknown-schema-id` and exit 1, naming `arc schema list` as the
  remedy

- `[ ]` `arc schema list --json` lists every production id with its version, posture, and `editorDocument`

- `[ ]` Every `list` and `get` result validates against its registered envelope

- `[ ]` In a temporary repository, given a registry holding a marked test schema, the writer produces a
  self-contained document under `.arc/system/.internal/schemas/` that validates a sample file with no unresolved
  reference

- `[ ]` `git check-ignore` reports the written document ignored, `git status` stays clean, and an unmarked schema
  gets no document

- `[ ]` An unwritable directory makes `arc schema install` refuse with `editor-documents-unwritable` and exit 1

- `[ ]` `arc schema install --json` outside an ARC project prints only the `arc-project-root-unresolved` refusal and
  exits 1

- `[ ]` Every `install` result validates against its registered envelope

- `[ ]` On each provisioning path D4 names, and after `arc schema install` in an existing checkout, the built CLI
  writes the directory and its exclude entry and leaves the managed `.gitignore` block unchanged

- `[ ]` An injected writer failure fails a work-unit spawn and rolls it back as a failed marker exclude does

- `[ ]` An injected writer failure at decomposition refuses with `occupation-failed`, and retrying the mode
  re-enters the candidate and writes its documents

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
