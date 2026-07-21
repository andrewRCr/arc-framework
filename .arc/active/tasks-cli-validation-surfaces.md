# Task List: CLI validation surfaces

- **Design:** `spec-cli-validation-surfaces.md`

---

## **Phase 1:** Audit-entry validation authority

_Purpose:_ Establish the release audit record as a strict schema-owned boundary before expanding the shared
registry to include it.

### `[x]` **1.1 Establish the audit-entry schema authority**

- _Goal:_ Every valid version-2 audit cell has one runtime and TypeScript authority, and invalid cross-products
  are unrepresentable at the persistence boundary.

    - `[x]` **1.1.a Define the complete audit-entry schema family**
        - Added strict, projectable command/decision/outcome schemas, schema-derived compatibility types and refusal
          codes, and a reusable resolved-override schema factory. Producers now parse assembled entries so forbidden
          cross-products remain unrepresentable at compile time as well as runtime.

### `[x]` **1.2 Cut audit persistence over to the schema contract**

- _Goal:_ Audit writes reject programming defects before filesystem effects while preserving redaction and the
  existing non-masking I/O failure policy.

    - `[x]` **1.2.a Replace the handwritten write-boundary validator**
        - Replaced the handwritten validator and command/outcome tables with an `AuditEntrySchema` parse before I/O.
          Schema errors now report stable boundary paths without values; valid entries retain their JSONL bytes, and
          filesystem failures retain the non-masking `{ ok: false, error }` contract.

## **Phase 2:** Semantic meta-record authority

_Purpose:_ Separate semantic work-unit state from its Markdown projection, then move the broad consumer surface
onto stable code-facing fields without losing tolerant recovery.

### `[x]` **2.1 Establish semantic and projection meta schemas**

- _Goal:_ Meta state has a storage-agnostic strict record while the current Markdown format retains an explicit,
  independently validated compatibility representation.

    - `[x]` **2.1.a Define the semantic meta-record contract**
        - Added the strict storage-agnostic `MetaRecordSchema` with kernel vocabulary composition, semantic nullable
          fields and identifier arrays, deliberate `TBD`/`internal` values, and inferred structural types. Display
          sentinels and malformed or incomplete records are rejected without adding policy to open values.

    - `[x]` **2.1.b Define the Markdown projection contracts**
        - Added exact label-to-semantic-key identities to `META_FIELDS`, a strict 17-label tokenizer schema, and a
          tolerant code-facing parsed-record schema. Raw invalid closed-domain tokens and absent fields remain
          independently visible while malformed projection shapes and empty present values are rejected.

### `[x]` **2.2 Preserve Markdown parsing and canonical rendering through semantic records**

- _Goal:_ Both Markdown layouts parse to the same semantic fields, while canonical full-layout rendering and
  localized legacy mutations preserve their respective bytes, sentinel behavior, and field-level recovery.

    - `[x]` **2.2.a Return parsed semantic fields from the Markdown reader**
        - `parseMetaRecord()` now validates the exact tokenizer projection and returns normalized semantic keys,
          arrays, nulls, `TBD`, and `internal` while preserving raw invalid closed tokens and multiline narratives.
          Unmigrated consumers use an explicit temporary projection reader rather than weakening the semantic API.

    - `[x]` **2.2.b Validate and render complete semantic records**
        - Added nullable strict conversion and a schema-validated semantic renderer that preserves the established
          full-layout bytes while mapping nulls, empty arrays, `TBD`, and `internal` to their exact display forms.
          Localized projection mutators and the temporary projection renderer retain legacy byte behavior.

    - `[x]` **2.2.c Preserve narrow reader compatibility**
        - Kept `parseMetaFile()` and active-candidate reads on their established narrow result and warning contracts;
          the existing malformed-table, absent-marker, legacy-layout, and field-local degradation corpus remains
          green across the semantic reader and renderer cutovers.

### `[x]` **2.3 Migrate semantic meta writers and render producers**

- _Goal:_ Every full-record writer supplies semantic keys while localized Markdown mutations retain their explicit
  projection-level contract.

    - `[x]` **2.3.a Establish the semantic-writer compatibility boundary**
        - Replaced the dual-purpose override type with distinct semantic-render and projection-update contracts;
          localized Markdown setters retain their label-keyed projection API.

    - `[x]` **2.3.b Migrate direct creation-path renderers**
        - Migrated errand promotion, worktree scaffolding, and stub creation to schema-checked semantic overrides while
          preserving the established planning, active, and promoted metadata bytes.

    - `[x]` **2.3.c Migrate composed and transition render inputs**
        - Migrated pointer, decomposition, and park render composition to semantic keys and added a source-wide AST
          inventory guard against label-keyed semantic calls or the retired override contract.

- _Outcome:_ Full-record creation now crosses one strict semantic boundary, including pointer prevalidation before
  destructive park teardown, while localized projection mutations remain explicit and byte-compatible.

### `[x]` **2.4 Migrate work-unit lifecycle consumers to semantic fields**

- _Goal:_ Work-unit handlers, transitions, and projections consume one parsed semantic representation instead of
  display labels and repeated list parsing.

    - `[x]` **2.4.a Migrate start and planning handlers**
        - Moved start graduation and planning-entry resolution onto semantic class, state, and branch fields while
          retaining unresolved-class defaults, refusal text, and planning-route behavior.

    - `[x]` **2.4.b Migrate lifecycle and view handlers**
        - Moved lifecycle and explicit-view reads onto semantic fields and parsed design arrays, including the typed
          park handoff, while preserving transition selection, output text, narrow results, and warning behavior.

    - `[x]` **2.4.c Migrate activation and terminal transitions**
        - Migrated activation, deactivation, archive, and abandon reads to semantic branch and cohort fields while
          retaining localized projection writes and established transition refusals.

    - `[x]` **2.4.d Migrate decomposition readers and rewrites**
        - Moved decomposition origin, incoming-edge rewrite, and retirement reads onto semantic fields and parsed
          dependency arrays, removing repeated splitting without changing allocation or retirement policy.

    - `[x]` **2.4.e Migrate park and resume evidence consumers**
        - Moved park/resume, planning-landing, and retirement-proof reads onto semantic fields while preserving byte
          evidence, cohort routing, staged projections, dirty-worktree refusal, and successful pointer bytes.
        - Strict pointer composition now precedes teardown and rejects missing required fields without mutation;
          only pointer-write failure after successful teardown retains the partial-application result.

    - `[x]` **2.4.f Migrate lifecycle execution infrastructure**
        - Moved lifecycle indexing and executor-bound branch reads onto one semantic parse while retaining explicitly
          label-keyed projection override types at localized transition write seams.

    - `[x]` **2.4.g Migrate remaining transition and completion projections**
        - Migrated promote/demote, teardown, completed-index, and decomposition retirement projection reads to
          semantic class, branch, completion, and PR fields while preserving unresolved-class refusal and receipts.

- _Outcome:_ Lifecycle execution now shares one tolerant semantic representation across handlers, transitions,
  evidence, indexes, and completion reads; label-keyed access remains only where localized Markdown writes require it.

### `[x]` **2.5 Migrate status, session, validation, and review readers**

- _Goal:_ Read-heavy consumers share semantic field names while preserving each caller's independent degradation
  and warning authority.

    - `[x]` **2.5.a Migrate project and ready-work status sources**
        - Moved project-readiness and ready-work sources onto semantic fields and parsed dependency arrays while
          preserving public row shapes, ordering, malformed-record degradation, and validation fallbacks.

    - `[x]` **2.5.b Migrate active-work consistency readers**
        - Moved cohort and current-workflow consistency onto semantic cohort values and parsed design arrays while
          retaining active-status narrative parsing and the established warning text.

    - `[x]` **2.5.c Migrate Git roster and in-flight derivation**
        - Moved worktree roster and in-flight derivation onto semantic records while preserving display-facing
          unresolved values and field-level degradation when state is invalid or metadata is unreadable.

    - `[x]` **2.5.d Migrate base and session-resolution adapters**
        - Moved base-drift completion and session cohort resolution onto semantic completion, PR, and cohort fields
          while preserving malformed-meta degradation and externally visible record shapes.

    - `[x]` **2.5.e Migrate meta validators and foreign-write checks**
        - Moved lifecycle-state and staged-origin reads onto semantic fields while leaving design-shape, lifecycle,
          and active-location policy in their owning validators and advisory boundary.

    - `[x]` **2.5.f Migrate review-gate meta readers and close the read inventory**
        - Moved lifecycle-tail archive proofs and self-hosting ownership decisions onto semantic fields, with an AST
          inventory guard confining projection parsing and raw identifier-list normalization to their authorities.

- _Outcome:_ Status, session, validation, Git, and review-gate consumers now share one tolerant semantic record;
  projection labels and raw list parsing remain confined to Markdown projection and policy boundaries.

## **Phase 3:** Authorable configuration authority

_Purpose:_ Consolidate project configuration domains and defaults into one schema-backed catalog while preserving
the distinct recovery and precedence policies of existing adapters.

### `[x]` **3.1 Establish the configuration catalog and schema contracts**

- _Goal:_ Every active project-level key has one declared authoring domain, default, and policy classification,
  with schema-derived record types for raw, authorable, and completed views.

    - `[x]` **3.1.a Build the authoritative field catalog**
        - Added the 36-field `ARC_CONFIG_FIELDS` catalog with projectable Zod leaves, documented omission defaults,
          domain policy, and explicit quoted-empty posture. Exact string-integer bounds preserve leading zeros through
          `Number.MAX_SAFE_INTEGER`; open strings remain uncompiled and adapter normalization stays local.
        - Retired `hooks.subject_warn_length` from the installed known-key domain and removed the stale
          `hooks.code_extensions` comment in both framework and self-hosting validator copies.

    - `[x]` **3.1.b Define raw, authorable, and completed config schemas**
        - Added open raw, registered-authoring, and strict completed-projection schemas with inferred record types.
          The authoring root intersects the exact installed key grammar with catalog leaves while preserving matching
          unknown strings; the completed view proves only presence and string shape for its 24-key projection.
        - Re-exported inferred `ConfigSettings` through both established command import paths while leaving
          session-init and provenance records under their existing authorities.

- _Outcome:_ Project configuration now has one typed catalog for keys, defaults, authoring domains, and empty-value
  policy, plus distinct raw, authorable, and completed record contracts for the adapters that consume it.

### `[x]` **3.2 Rebase policy adapters on catalog domains and defaults**

- _Goal:_ Configuration consumers share field definitions without losing their distinct tolerance, precedence,
  normalization, and hard-error policies.

    - `[x]` **3.2.a Validate tokenizer output without changing syntax behavior**
        - `parseArcConfig()` now parses its assembled map through `RawArcConfigSchema` and returns the inferred type;
          the existing tokenizer corpus preserves broad names, line endings, quoting, colon values, and first-claim
          behavior for bare and quoted empty definitions without adding normalization.

    - `[x]` **3.2.b Migrate agent-consumable and precedence-aware readers**
        - Derived the agent projection, omission defaults, and existing tolerant policy checks from catalog
          descriptors, validating the assembled completed view before return while leaving `user.notes_push` raw
          until its catalog-backed dual-scope resolver applies git-config precedence and preserves provenance.
          Config rendering and generic YAML override resolution now use catalog-owned keys and defaults without
          introducing YAML tiers for per-developer-only settings.

    - `[x]` **3.2.c Migrate strict commit-check configuration**
        - Derived the eight-key projection, defaults, enum types and domains, and exact positive-integer validation
          from catalog descriptors while retaining commit-check-owned normalization and findings. Disabled hooks
          still short-circuit unrelated failures, custom patterns pass through unchanged, and invalid domains retain
          their existing `config.invalid-value` and `config.invalid-number` contracts.

    - `[x]` **3.2.d Migrate worktree configuration adapters**
        - Reused the catalog's location-template and normalized-directory leaves at the two worktree boundaries and
          sourced the registered-harness default from its descriptor. Token expansion stays pure; harness parsing
          retains ordered deduplication, trailing-separator normalization, reserved-name diagnostics, and throws;
          command execution and fallback policy remain with their existing callers.

- _Outcome:_ Agent, precedence, commit-check, and worktree adapters now share one catalog without collapsing their
  distinct tolerant, strict, dual-scope, and normalization policies into a global configuration normalizer.

### `[x]` **3.3 Deliver typed configuration validation behind the stable launcher**

- _Goal:_ One non-interactive TypeScript validator owns diagnostics and exit status while the installed shell path
  and custom-root behavior remain compatible.

    - `[x]` **3.3.a Implement the TypeScript validation service**
        - Added a side-effect-free selected-file service that inventories exact validator-grammar occurrences,
          validates first-definition values through `ArcConfigSchema`, and composes stable domain, cross-field, and
          occurrence-ordered unknown-key diagnostics. Structured results preserve line ordering, counts, summaries,
          selected path tokens, and severity-derived status without exposing pattern bodies; quoted-empty posture and
          exact positive-safe-integer boundaries follow the catalog.

    - `[x]` **3.3.b Add `arc config validate` command wiring**
        - Registered the optional `--file` command, exported the validation service through the stable config barrel,
          and added non-interactive line/status propagation. Default selection resolves the nearest ARC root while
          explicit relative and absolute paths resolve from the current directory without requiring a project root;
          process-level integration coverage pins nested defaults, preserved display tokens, and exit codes 0–2.

    - `[x]` **3.3.c Reduce `validate-config.sh` to the compatibility launcher**
        - Replaced both byte-identical installed copies with a sourced-library launcher that `exec`s the typed command
          using `ARC_CONFIG_FILE`. PATH-shim coverage pins default and absolute argv plus transparent stdout, stderr,
          and status forwarding; custom-`ARC_DIR` integrity verification proves its selected config reaches the CLI.

- _Outcome:_ Configuration validation now has one typed, non-interactive policy authority behind both the direct CLI
  and stable installed-script path, with explicit path selection and compatibility output preserved end to end.

### `[x]` **3.4 Prove catalog completeness and compatibility behavior**

- _Goal:_ The catalog demonstrably covers the shipped configuration surface exactly once, and every existing
  adapter retains its intended observable policy.

    - `[x]` **3.4.a Add a closed configuration inventory test**
        - Added ordered package-declaration parity, uniqueness, catalog-derived consumer projection, unowned literal,
          parallel-default, and shell-table guards. Full validation proves every registered field known while the
          retired warning-length key remains an ordinary extra; explicit full-validation and worktree projections now
          join the existing agent and commit-check subsets.

    - `[x]` **3.4.b Establish the shared compatibility corpus**
        - Added one data-only configuration corpus covering valid, invalid, missing, bare-empty, quoted-empty, unknown,
          duplicate, and git-over-yaml precedence inputs. Each stable case records expected tolerant-reader, resolved,
          commit-check, worktree, and validator observations, with a structural test guarding coverage and uniqueness.

    - `[x]` **3.4.c Prove tolerant and precedence-aware compatibility**
        - Drove every shared case through real temporary config files, asserting tolerant raw-value pass-through,
          omission-only default accounting, warning subsets, and resolved notes-push value/provenance. Git-config
          overrides remain authoritative over YAML while invalid and empty values retain their adapter fallbacks.

    - `[x]` **3.4.d Prove strict and worktree-adapter compatibility**
        - Ran every shared case through commit-policy resolution and the worktree location/harness adapters. Assertions
          pin hard finding order, omission fallbacks, first-definition masking, branch-token expansion, ordered harness
          deduplication, empty-list behavior, and invalid-template or reserved-directory throws.

    - `[x]` **3.4.e Prove validator and launcher compatibility**
        - Ran every shared case through the validation service, source CLI, and installed launcher, pinning diagnostic
          fragments, selected path tokens, counts, stream parity, and exit statuses. A copied package root with a corpus
          config also proves integrity validation forwards its custom `ARC_DIR` selection to the real CLI boundary.

- _Outcome:_ The packaged declaration, typed catalog, five adapter families, direct command, and installed compatibility
  path are now guarded by one closed inventory and one reusable data corpus without retaining a parallel policy helper.

## **Phase 4:** User-state and cross-work-unit contracts

_Purpose:_ Replace manual persisted-state and note-payload checks with schema-owned adapters while retaining
backward-compatible hydration, concurrent-write behavior, and lossless Markdown reconstruction.

### `[x]` **4.1 Establish versioned local sync-state schemas and normalization**

- _Goal:_ Persisted versions 2–4 enter through an explicit backward-compatible reader and hydrate to one strict
  version-4 internal record without rejecting tolerated extensions.

    - `[x]` **4.1.a Define persisted and normalized sync-state schemas**
        - Added a projectable loose union for persisted versions 2–4 and a strict normalized version-4 producer schema,
          sharing only the existing non-empty basis and operation requirements. Persisted extensions remain unknown and
          additive at ingress; strict marker, file-list, and provenance children derive the public record types.
        - Removed `machineId` from normalized state and preserved established imports through schema/type re-exports.
          Nineteen focused checks cover version acceptance, malformed required and extension fields, lexical tolerance,
          strict producer shape, inferred types, and refinement-free JSON Schema projection.

    - `[x]` **4.1.b Normalize tolerated persisted extensions**
        - Added `normalizeLocalSyncState()` as a fresh-record adapter that upgrades every persisted discriminant to
          version 4, independently narrows each known extension through its child schema, and validates the assembled
          producer record. Malformed extensions, unknown fields, and legacy `machineId` are discarded without losing
          valid base or sibling state; public compatibility barrels expose the normalizer.

- _Outcome:_ Persisted local state now has an acceptance-equivalent loose reader and one strict current record type;
  normalization preserves compatible extension state while preventing legacy or malformed data from escaping ingress.

### `[x]` **4.2 Preserve sync-state persistence and migration behavior**

- _Goal:_ Reads, atomic writes, and concurrent mutations use the schemas without changing missing/malformed versus
  I/O-failure behavior or dropping compatible state.

    - `[x]` **4.2.a Cut validated reads over to parse and normalize**
        - Replaced the manual record and extension checks with persisted-schema parsing followed by normalization,
          while leaving raw machine-id adoption independent. Preferred and legacy path tests pin valid precedence,
          `ENOENT` fallback, invalid-JSON termination, structurally unusable fallthrough, total absence, and immediate
          propagation of non-`ENOENT` failures; the existing save/load corpus continues to cover version hydration and
          one-time legacy machine-id adoption.

    - `[x]` **4.2.b Validate every version-4 persistence path**
        - Added strict producer parsing inside the shared compare-and-swap lock immediately before atomic persistence,
          covering save/load and both marker mutation families without altering retry behavior. Focused boundary tests
          prove invalid output leaves no state file and valid output persists as a strict record; the existing 75-case
          save/load and marker corpus remains green across carry, replace, clear, legacy-drop, and concurrent updates.

    - `[x]` **4.2.c Exercise the local record lifecycle in integration**
        - Added real-filesystem lifecycle coverage that hydrates a legacy version-2 record, rewrites save/load state at
          the preferred path while carrying file-list and provenance extensions, and races notes/errand marker updates
          through the actual advisory-lock and compare-and-swap path without losing either marker or sibling state.

    - `[x]` **4.2.d Exercise state-producing command and ref flows**
        - Extended built-CLI save/load and multi-machine partial-push E2E coverage to parse produced local records with
          `LocalSyncStateSchema`. Assertions pin version and operation rewrites plus notes-tip/partial-push linkage while
          the existing ref publication, reconciliation, fulfillment, and two-machine union cases remain unchanged.

- _Outcome:_ Every local sync-state ingress and producer now crosses the versioned schemas, while real-file, built-CLI,
  concurrent marker, and ref-backed tests preserve the existing migration, carry-forward, and recovery lifecycle.

### `[ ]` **4.3 Establish cross-work-unit note adapter schemas**

- _Goal:_ Cross-work-unit note parsing has schema-derived success and failure shapes while retaining title/header
  identity, no-throw recovery, and byte-lossless reconstruction.

    - `[x]` **4.3.a Define cross-work-unit entry and parse-result schemas**
        - Added strict `CrossWuEntrySchema` and discriminated `CrossWuEntryParseSchema` contracts, deriving the public
          entry/result types through compatibility re-exports while retaining handwritten `CrossWuShape`. Focused
          coverage pins all section and result arms plus rejection of empty, unknown, and additive fields.

    - `[x]` **4.3.b Cut cross-work-unit parsers over to schema-owned payloads**
        - Routed every internally assembled success and failure through `CrossWuEntryParseSchema` immediately before
          exposure, keeping authored malformation as no-throw data while schema defects throw. Characterization coverage
          pins exact reasons, full-header and section-scoped title identity, and raw bytes apart from trailing blanks.

    - `[ ]` **4.3.c Migrate merge and downstream parser consumers**
        - Move merge, inbox/session probes, and baseline entry extraction onto the inferred payloads without changing
          their caller-specific failure handling.
        - Preserve most-recent-note conflict resolution, tombstone precedence and expiry, malformed-reason
          deduplication, unknown-file fallback, and reconstructed output bytes.
        - Keep the materialized-baseline stamp and its handwritten validator unchanged; only its cross-WU parser input
          adopts the inferred entry type because that stamp remains owned by the cohort tail.
        - Build `test-first` (one behavior at a time):
            - preserve multi-note identity collisions, older-only union, and tombstone outcomes;
            - preserve lossless reconstructed Working Memory and User Inbox bytes;
            - preserve inbox counts/reminders and baseline entry hashes without converting the baseline stamp.

## **Phase 5:** Unregistered ingress contracts

_Purpose:_ Move the remaining adapter-local and graph-refined boundaries to schema authority without advertising
incomplete durable contracts through the registry.

### `[ ]` **5.1 Establish the decomposition cut-map schema authority**

- _Goal:_ Cut maps derive their structural types from one strict version-2 schema while retaining graph invariants,
  targeted diagnostics, canonical ordering, and receipt bytes.

    - `[ ]` **5.1.a Define the cut-map structural schema family**
        - Add `src/lib/work-unit/decompose-cut-map-schema.ts` with strict schemas for positions, locators,
          allocations, edge dispositions, target sets, and the complete version-2 record.
        - Compose `WorkClassSchema` and `SlugSchema`, narrow `WorkUnitStateSchema` to the currently accepted
          `Planning` / `Active` origin phases, and preserve canonical-digest branding through `isCanonicalDigest`.
        - Derive `DecomposeAllocationMap`, its position, locator, allocation, target, entry, and edge structural
          families with `z.infer`; keep decision/result unions and compatibility aliases outside schema authority.
        - Build `test-first` (one behavior at a time):
            - accept every position, locator, allocation, target, entry, and edge discriminated arm;
            - reject extra keys, unknown discriminants, unresolved Classes, unsafe slugs, and unsupported origin phases;
            - reject malformed canonical digests, managed document paths, artifact basenames, and locator fields;
            - preserve nullable or optional fields exactly without embedding canonical ordering in the root schema.

    - `[ ]` **5.1.b Preserve cross-record and graph invariants**
        - Express duplicate destination identities, cohort coordination, home/target coupling, source allocation,
          dependency recipient, internal-edge, transform-shape, parent-position, locator ownership, and target-set
          invariants through path-targeted runtime refinements without registering the schema.
        - Preserve normalized heading-source, NFC basename, managed-path, uniqueness, and direct self-dependency rules.
        - Keep `retirementAllocationRefusal()` as a separate retirement-policy decision so extraction remains a valid
          parsed map, and keep ordering out of schema acceptance so normalization runs only after successful parsing.
        - Build `test-first` (one behavior at a time):
            - reject duplicate destination ids or identities and invalid cohort-coordination cardinality or placement;
            - enforce symmetric, extraction, backlog-source, heterogeneous-home, and parent-position constraints;
            - require unique source allocations whose target locator belongs to an eligible declared destination;
            - reject unknown dependency recipients, duplicate edges, direct self-dependencies, and invalid target sets;
            - retain retirement-only ownership refusals outside `DecomposeAllocationMapSchema` acceptance.

    - `[ ]` **5.1.c Preserve the public no-throw adapter and type surface**
        - Rebase `parseCutMap()` on `safeParse`, retaining the handwritten `CutMapParseResult`, exact version-1 upgrade
          guidance, unknown-version refusal, and path-aware translation to the established version-2 boundary reasons.
        - Cut `parseDecomposeContentLocator()` over to its child schema while preserving its public null-return outcome.
        - Re-export the inferred structural types from `decompose-cut-map.ts`; retain `DecomposeParams` and `CutEntry`
          as compatibility aliases and remove the superseded handwritten structural declarations.
        - Migrate direct map constructors and imports to validated inferred values without bypassing `parseCutMap()`.
        - Build `test-first` (one behavior at a time):
            - preserve non-object, version-1, unknown-version, and representative version-2 rejection reasons;
            - accept unsorted valid maps and normalize every set-valued collection into canonical order;
            - preserve the locator helper's accepted values and null outcomes;
            - keep established type imports valid while eliminating parallel structural authorities.

    - `[ ]` **5.1.d Prove preparation, retirement, and receipt compatibility**
        - Exercise the inferred map through preparation decoding, retirement authorization and finalization, receipt
          decoding, and real-repository decomposition shapes without changing their caller-specific policy.
        - Build `test-first` (one behavior at a time):
            - preserve canonical preparation acceptance and rejection of non-canonical stored allocation order;
            - preserve retirement-only ownership, inventory, dependency, and result-validation outcomes;
            - keep cut-map digests, preparation records, retirement receipts, and existing fixtures byte-identical.

### `[ ]` **5.2 Extract and validate Git worktree porcelain records**

- _Goal:_ Successful Git output cannot silently discard malformed worktree stanzas, while process failures and
  caller-specific degradation remain distinct.

    - `[ ]` **5.2.a Create the tokenizer and record schema module**
        - Add `src/lib/git/worktree-porcelain.ts` with `GitWorktreePorcelainRecordSchema` and move stanza tokenization
          out of `worktree-roster.ts`.
        - Derive `GitWorktreePorcelainRecord` from the strict normalized record: non-empty path, nullable head, nullable
          local branch, and detached flag; discard unknown porcelain attributes during tokenization for Git-version
          forward compatibility rather than admitting them into the normalized record.
        - Tokenize the complete stdout in one pass without adding Git or filesystem reads.
        - Build `test-first` (one behavior at a time):
            - normalize ordinary branched, detached, and bare worktree stanzas;
            - preserve stanza order across multi-stanza output and ignore blank output;
            - ignore unknown attributes while retaining every recognized field;
            - reject extra normalized-record keys and an empty normalized path.

    - `[ ]` **5.2.b Introduce the domain validation error boundary**
        - Throw an `ArcError` carrying `git.worktree-porcelain.invalid` and stable stanza/field paths when successful
          Git output contains a non-empty stanza without a valid `worktree` anchor; do not echo the stanza or convert
          the domain failure into `GitProcessError`.
        - Replace `RawWorktree` in `worktree-roster.ts` with the inferred record and preserve each current policy:
          roster reads propagate failures, primary-path lookup degrades to `null`, branch-map lookup degrades to an
          unsuccessful empty map, and topology scan returns `{ok: false, message}` while still requiring a head.
        - Build `test-first` (one behavior at a time):
            - reject missing or empty worktree anchors in the first, middle, and final non-empty stanza;
            - expose stable issue paths and the domain code without leaking raw records;
            - distinguish malformed successful output from `GitProcessError` process failures;
            - preserve roster, primary-path, branch-map, topology-scan, detached, and missing-head outcomes.

### `[ ]` **5.3 Establish the cold-start input schema contract**

- _Goal:_ Every successful cold-start classification is schema-validated and type-derived while empty input remains
  the existing no-throw failure arm.

    - `[ ]` **5.3.a Define and adopt `ParsedSpecInputSchema`**
        - Add a strict discriminated union for the `arc-spec`, `issue`, `document`, and `description` arms beside the
          parser, require each arm's sole payload string to be non-empty, and derive `ParsedSpecInput` from the schema.
        - Parse internally assembled successes immediately before return while leaving the handwritten outer
          `SpecInputParse` no-throw union, empty-input reason, and existing lexical classification policy unchanged.
        - Build `test-first` (one behavior at a time):
            - preserve issue-before-pointer precedence, nested ARC spec paths, documents, and free-text descriptions;
            - preserve trimmed field assignments without introducing issue, URL, or path lexical validation;
            - reject missing, empty, mismatched, or extra success-arm fields and unknown discriminants;
            - retain the exact no-throw failure for empty and whitespace-only raw input.

## **Phase 6:** Validation registry composition

_Purpose:_ Compose the four externally meaningful schema roots only after their owning boundaries exist, keeping
registry discovery independent from kernel artifact publication.

### `[ ]` **6.1 Compose the validation-surfaces registry**

- _Goal:_ Consumers can discover exactly the four declared durable roots through a fresh kernel-derived registry
  without changing kernel-only build output.

    - `[ ]` **6.1.a Add the assembly-only registry factory**
        - Add `src/lib/validation-surfaces/registry.ts` following the kernel and session-envelope registry patterns.
        - Export `VALIDATION_SURFACE_SCHEMA_IDS` and register `audit-entry` version 2, `meta-record` version 1,
          `arc-config` version 1, and `local-sync-state` version 4 with their declared migration postures.
        - Keep subsystem schema semantics in their owning modules and return a fresh `createKernelRegistry()` extension
          on every call.
        - Build `test-first` (one behavior at a time):
            - expose each declared id at the exact schema instance and metadata tuple;
            - retain the four kernel vocabulary schemas and deterministic identity ordering;
            - isolate mutation of one returned registry from every later factory result;
            - preserve kernel duplicate-identity and duplicate-schema rejection.

    - `[ ]` **6.1.b Establish the internal-only composition boundary**
        - Export the ID map and factory only from the new internal source module for first-party and introspection
          follow-on imports; add no package export map, tsup entry, CLI command, or static schema artifact.
        - Keep `tsup.config.ts` calling `writeKernelSchemaArtifact()` without a registry override so
          `projectKernelSchemas()` continues to default to `createKernelRegistry()`.
        - Build `test-first` (one behavior at a time):
            - preserve the default kernel bundle bytes before and after in-memory validation-surface composition;
            - keep the build output inventory limited to `dist/schemas/kernel.json`;
            - prove composed projection remains opt-in through an explicit in-memory registry argument only.

### `[ ]` **6.2 Prove registry projection fidelity and closed membership**

- _Goal:_ Registry metadata, ordering, and JSON Schema acceptance are deterministic and cannot drift beyond the
  declared root set.

    - `[ ]` **6.2.a Validate runtime and projected acceptance independently**
        - Add Ajv 8 as a direct test-only dependency and configure its draft-2020-12 evaluator with every schema in the
          in-memory projected bundle registered by `$id`, including referenced kernel vocabulary.
        - Run one shared representative corpus for each root through both the owning Zod schema and Ajv, requiring the
          same acceptance result without using adapter normalization as projection evidence.
        - Build `test-first` (one behavior at a time):
            - compare valid command arms with invalid command/decision/outcome combinations for `audit-entry`;
            - compare complete semantic meta records with missing, extra, and invalid closed-domain fields;
            - compare valid known and unknown dotted config keys with invalid known values, malformed keys, and
              non-string unknown values;
            - compare sync-state versions 2–4, malformed required fields, malformed optional extensions, and unknown
              additive fields.

    - `[ ]` **6.2.b Prove closed membership and publication isolation**
        - Assert the exact sorted registry set is `arc-config`, `audit-entry`, `local-sync-state`, `meta-record`,
          `priority`, `slug`, `work-class`, and `work-unit-state`; this closed set proves exclusion without minting ids
          for unregistered cut-map, worktree-porcelain, cold-start, cross-WU, projection, or completed-config schemas.
        - Project the composed registry only in memory and verify its deterministic bytes and `$id` references.
        - Run the package build and confirm no composed artifact or additional schema file is emitted and the existing
          kernel-only artifact remains byte-identical.

## **Phase 7:** Review-gate canonicalization cutover

_Purpose:_ Adopt kernel canonical bytes for safely recomputable identities while preserving every durable
version-1 review-gate identity behind a repository-private frozen serializer.

### `[ ]` **7.1 Freeze the version-1 canonicalization seam**

- _Goal:_ Existing receipts, attestation event ids, checkpoints, and activation candidates remain verifiable with
  their original bytes after the shared helper adopts kernel canonicalization.

    - `[ ]` **7.1.a Extract the exact legacy serializer**
        - Add repository-private `core/legacy-canonical-v1.ts` with the current `normalizePlainJson()` algorithm
          copied exactly and exported only as `canonicalizeReviewGateV1`; do not add a package export or barrel
          re-export.
        - Preserve the existing `localeCompare()` comparator, unchanged strings, `Array.map()` traversal, ordinary
          `{}` accumulator, and `JSON.stringify()` output. Do not harden or normalize this compatibility seam.
        - Build `test-first` (one behavior at a time):
            - pin representative recursive ASCII bytes and the current locale-sensitive key order;
            - preserve composed and decomposed strings as distinct bytes and retain `JSON.stringify()`'s numeric
              ordering for integer-like object keys;
            - preserve lone-surrogate escaping, sparse-array holes serialized as `null`, and omission of an own
              `__proto__` key through the ordinary-object accumulator;
            - continue rejecting cycles, symbol keys, non-finite numbers, explicit `undefined`, functions, `bigint`,
              and non-plain objects.

    - `[ ]` **7.1.b Route receipt and attestation identities through the frozen seam**
        - In `core/request-key.ts`, use `canonicalizeReviewGateV1()` for both private receipt identity helpers so
          `createReceipt()` and `receiptIdentityValid()` create and verify the same version-1 bytes.
        - In `core/attestations.ts`, use the frozen serializer for the manifest digest embedded in each attestation
          event id and preserve exact replay/conflict classification.
        - Keep receipt hashes carried by later payloads opaque; do not recompute links or rewrite persisted receipts.
        - Build `test-first` (one behavior at a time):
            - validate a literal pre-cutover Unicode receipt with fixed idempotency and receipt hashes, and preserve
              the existing representative ASCII receipt fixture;
            - replay a literal pre-cutover attestation whose accepted Unicode manifest produces different legacy and
              kernel bytes, while a changed manifest with the same run id remains a conflict;
            - preserve later payloads that reference an existing receipt hash without interpreting or replacing it.

    - `[ ]` **7.1.c Route qualification identities through the frozen seam**
        - In `runtime/qualification-contract.ts`, use `canonicalizeReviewGateV1()` for scope digests, empty and
          appended checkpoint-chain hashes, resumed-chain verification, matrix digests, and serialized acceptance
          validation.
        - In `runtime/qualification-activation.ts`, use the frozen serializer for operation value digests, candidate
          digests, and the exact activation-operation equality check.
        - Build `test-first` (one behavior at a time):
            - resume and extend a literal pre-cutover checkpoint containing a Unicode divergence value without
              changing its scope or prior-chain hashes;
            - validate literal pre-cutover matrix and activation-candidate digests rather than regenerating expected
              values through the code under test;
            - accept byte-equivalent legacy activation operations and reject edits, additions, omissions, and values
              that are kernel-equivalent but distinct under legacy serialization.

### `[ ]` **7.2 Move recomputable identities to kernel canonical bytes**

- _Goal:_ Newly computed policy, permission, and repair-result identities share the kernel's canonicalization
  authority without adopting its digest wire prefix.

    - `[ ]` **7.2.a Delegate `canonicalizePlainJson()` to the kernel**
        - Retain the review-gate export and existing hash helpers, but replace its local normalization algorithm with
          direct kernel `canonicalize()` delegation.
        - Preserve digest formatting and keep `computeChangeSetId()` on its existing NUL-delimited identity contract.
        - Build `test-first` (one behavior at a time):
            - preserve representative recursive ASCII output while adopting Unicode-codepoint key order;
            - NFC-normalize string values and keys, and reject keys that collide after normalization;
            - reject malformed Unicode and sparse arrays through the review-gate compatibility export;
            - retain the existing unprefixed 64-hex digest shape and literal NUL-delimited `computeChangeSetId()`
              fixture.

    - `[ ]` **7.2.b Route the recomputable caller set**
        - Keep `computePolicyVersion()` directly on `canonicalizePlainJson()`, and retain
          `runtime/reconcile-runtime.ts` permission digests and `runtime/repair-main.ts` validation-result digests as
          the other two kernel-backed production callers.
        - Leave `computeRequirementKey()` and `computeRequestKey()` on their exact NUL-delimited formulas. They re-key
          only when supplied a newly computed policy version; they do not canonicalize policy content themselves.
        - Treat policy-version strings read from receipts and other stored records as authoritative inputs; do not
          recompute policy content during ledger reads or receipt validation.
        - Build `test-first` (one behavior at a time):
            - pin intentional policy-version re-keying for Unicode key order and normalization while retaining the
              representative ASCII digest;
            - prove request keys change only through a changed input policy-version string and remain unchanged for a
              stored pre-cutover string;
            - pin kernel-backed live permission and repair-result digests with accepted Unicode divergence values and
              retain their unprefixed 64-hex wire shape.

### `[ ]` **7.3 Prove identity compatibility and caller classification**

- _Goal:_ Fixtures and a closed inventory demonstrate that every review-gate identity uses the correct serializer
  and that no durable version-1 or kernel receipt contract changed accidentally.

    - `[ ]` **7.3.a Add divergent Unicode durability fixtures**
        - Use literal pre-cutover bytes and digest constants, never expected values generated by either serializer in
          the same test, for attestation replay, receipt validation, qualification checkpoint resume, acceptance
          validation, and activation equality.
        - Exercise values whose legacy and kernel bytes differ and confirm cross-record receipt links plus every
          stored version-1 identity remain valid without rewrite.
        - Keep divergence in accepted string values: the closed durable contracts expose only fixed ASCII property
          names, so no locale pin or replacement comparator may alter the frozen `localeCompare()` algorithm.

    - `[ ]` **7.3.b Add recomputable divergence and kernel-regression fixtures**
        - Build `test-first` (one behavior at a time):
            - pin policy, permission, and repair-result re-keying for Unicode order or normalization while retaining
              current ASCII outputs;
            - prove malformed Unicode, sparse arrays, and NFC key collisions fail through the kernel-backed helper;
            - re-run the existing kernel canonical receipt and digest golden fixtures unchanged.

    - `[ ]` **7.3.c Close the serializer caller inventory**
        - Inspect production files under `src/scripts/review-gate/**` and assert the exact direct caller set:
          `core/identity.ts`, `runtime/reconcile-runtime.ts`, and `runtime/repair-main.ts` for
          `canonicalizePlainJson()`; `core/request-key.ts`, `core/attestations.ts`,
          `runtime/qualification-contract.ts`, and `runtime/qualification-activation.ts` for
          `canonicalizeReviewGateV1()`.
        - Assert `core/identity.ts` is the review-gate's only direct kernel `canonicalize()` import and no third
          plain-JSON canonicalizer, duplicate normalizer, barrel export, or broad compatibility shim remains.
        - Exclude and preserve the intentional NUL-delimited `computeChangeSetId()`, `computeRequirementKey()`, and
          `computeRequestKey()` contracts; they are not plain-JSON serializer alternatives.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Every selected boundary validates through its owning Zod schema, and migrated structural exports are
  inferred rather than maintained in parallel.
- `[ ]` The composed registry exposes exactly the four declared roots with stable metadata and runtime/projection
  parity while the generated kernel-only artifact remains unchanged.
- `[ ]` Audit persistence rejects all invalid command, interlock, decision, refusal, and outcome combinations before
  I/O without changing redaction or returned filesystem failures.
- `[ ]` Both meta layouts parse to the same semantic fields, the canonical full layout round-trips exact absence
  tokens, localized legacy mutations preserve unrelated bytes, malformed tokens retain independent evidence, and
  strict pointer composition rejects before worktree teardown.
- `[ ]` The configuration catalog covers packaged and consumed keys exactly once while each adapter retains its
  defaults, precedence, warnings, hard errors, fallbacks, and normalization policy.
- `[ ]` `arc config validate` and the installed `validate-config.sh` path agree on diagnostics, summary counts,
  selected paths, custom `ARC_DIR` behavior, and exit codes; retired validator-only keys warn as unknown.
- `[ ]` Persisted sync-state versions 2–4 hydrate to strict version 4, preserve valid optional state through writes,
  and retain missing/malformed versus I/O-failure behavior.
- `[ ]` Cut maps retain all structural and graph invariants, targeted version diagnostics, canonical order, and
  receipt bytes without appearing in the registry.
- `[ ]` Malformed successful worktree porcelain produces a stable domain validation error distinct from Git process
  failure, while forward-compatible attributes and caller degradation remain supported.
- `[ ]` Cold-start and cross-work-unit adapters retain classification, merge identity, no-throw failures, and
  lossless raw reconstruction through schema-derived payloads.
- `[ ]` Recomputable review-gate identities adopt kernel bytes, durable version-1 identities remain verifiable through
  the frozen serializer, and the direct-caller inventory is closed.
- `[ ]` No in-scope handwritten structural authority, validator bypass, transitional shim, or parallel reusable test
  helper remains.
- `[ ]` All quality gates pass (focused and full tests, both typecheck surfaces, TypeScript and shell lint, Markdown
  lint, and package build).
- `[ ]` Ready for integration.
