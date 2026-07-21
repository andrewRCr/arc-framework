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

### `[ ]` **2.4 Migrate work-unit lifecycle consumers to semantic fields**

- _Goal:_ Work-unit handlers, transitions, and projections consume one parsed semantic representation instead of
  display labels and repeated list parsing.

    - `[x]` **2.4.a Migrate start and planning handlers**
        - Moved start graduation and planning-entry resolution onto semantic class, state, and branch fields while
          retaining unresolved-class defaults, refusal text, and planning-route behavior.

    - `[x]` **2.4.b Migrate lifecycle and view handlers**
        - Moved lifecycle and explicit-view reads onto semantic fields and parsed design arrays, including the typed
          park handoff, while preserving transition selection, output text, narrow results, and warning behavior.

    - `[ ]` **2.4.c Migrate activation and terminal transitions**
        - Update `verbs/activate-deactivate.ts`, `verbs/archive.ts`, and `verbs/abandon.ts` in one characterized
          transition group, retaining projection writes and existing refusal behavior.

    - `[ ]` **2.4.d Migrate decomposition readers and rewrites**
        - Update `verbs/decompose.ts`, `decompose-sweep.ts`, and `decompose-retirement-driver.ts` to semantic lists
          without repeated comma splitting or changes to allocation and retirement policy.

    - `[ ]` **2.4.e Migrate park and resume evidence consumers**
        - Update `verbs/park-resume.ts`, `park-planning-landing.ts`, and `park-retirement-proof.ts`, preserving byte
          evidence, cohort routing, and staged projection behavior.
        - For `park@Active`, translate the carried source fields and compose the strict pointer record before
          `reconcileWorktree()` tears down the worktree; reject composition failures without invoking teardown or
          filesystem writes, while retaining teardown before the pointer write.
        - Build `test-first` (one behavior at a time):
            - reject missing or invalid required pointer fields before worktree or filesystem mutation;
            - retain the dirty-worktree guard with no pointer write and preserve successful pointer bytes;
            - preserve the partial-application result only for pointer-write failures after successful teardown.

    - `[ ]` **2.4.f Migrate lifecycle execution infrastructure**
        - Update `lifecycle-index.ts`, `lifecycle-executor.ts`, and `executor-context.ts` while retaining the explicit
          semantic-versus-projection write boundary.

    - `[ ]` **2.4.g Migrate remaining transition and completion projections**
        - Update `verbs/promote-demote.ts`, `verbs/teardown.ts`, and `completed-index.ts`; then migrate
          `decompose-retirement-projection.ts` with its focused retirement fixtures.

### `[ ]` **2.5 Migrate status, session, validation, and review readers**

- _Goal:_ Read-heavy consumers share semantic field names while preserving each caller's independent degradation
  and warning authority.

    - `[ ]` **2.5.a Migrate project and ready-work status sources**
        - Update `status/project-view.ts` and `status/ready-mine-source.ts` to semantic fields and parsed dependency
          arrays, preserving public result shapes, ordering, and fallbacks.

    - `[ ]` **2.5.b Migrate active-work consistency readers**
        - Update `commands/active/status.ts`, `active/cohort-consistency.ts`, and
          `active/current-workflow-consistency.ts` without changing warning text or narrative task parsing.

    - `[ ]` **2.5.c Migrate Git roster and in-flight derivation**
        - Update `git/worktree-roster.ts` and `git/in-flight-derivation.ts` while retaining field-level degradation:
          invalid state becomes `unknown` without discarding other scheduling or path evidence.

    - `[ ]` **2.5.d Migrate base and session-resolution adapters**
        - Update `base-drift/current-adapters.ts` and `session-init/cohort-doc.ts`, preserving their current fail or
          degrade policies and externally visible records.

    - `[ ]` **2.5.e Migrate meta validators and foreign-write checks**
        - Update `scripts/validate-meta-spec.ts` and `scripts/check-foreign-writes.ts` without coupling the structural
          schema to lifecycle- or location-specific managed-Markdown policy.

    - `[ ]` **2.5.f Migrate review-gate meta readers and close the read inventory**
        - Update the GitHub lifecycle-tail and self-hosting lane readers, then assert no first-party caller indexes
          display labels or reparses semantic dependency/design arrays.

## **Phase 3:** Authorable configuration authority

_Purpose:_ Consolidate project configuration domains and defaults into one schema-backed catalog while preserving
the distinct recovery and precedence policies of existing adapters.

### `[ ]` **3.1 Establish the configuration catalog and schema contracts**

- _Goal:_ Every active project-level key has one declared authoring domain, default, and policy classification,
  with schema-derived record types for raw, authorable, and completed views.

    - `[ ]` **3.1.a Build the authoritative field catalog**
        - Add `src/lib/config/schema.ts` with `ARC_CONFIG_FIELDS` derived from the packaged config, TypeScript
          consumers, and installed validator key sets.
        - Give every descriptor its key, projectable Zod string schema, documented omission default, and policy
          classification, including a quoted-empty posture of `default`, `unset`, or `invalid`; do not treat the
          currently configured package literal as the default authority.
        - Define enum, boolean-token, exact positive safe-integer, regex/pattern, branch, worktree-template,
          harness-directory, and shell-command leaf schemas with their existing minima and acceptance behavior.
        - Keep the registered leaves expressible by `z.toJSONSchema`: use structural string patterns rather than
          transforms or refinements, including the safe-integer ceiling, leading-zero behavior, and per-key minima.
        - Do not compile custom commit patterns or add lexical policy to branch, template, pattern, or command strings;
          adapter-only normalization remains outside the catalog.
        - Remove `hooks.subject_warn_length` from the known domain and retire the stale `hooks.code_extensions`
          validator comment without introducing new policy.
        - Build `test-first` (one behavior at a time):
            - accept every enum and boolean token while rejecting neighboring invalid values;
            - accept positive safe integers at each minimum and at `Number.MAX_SAFE_INTEGER`, including compatible
              leading-zero forms, while rejecting signs, non-decimal forms, overflow, and below-minimum values;
            - preserve the existing open-string and harness-directory domains without compiling pattern contents;
            - classify quoted-empty values per key, with positive-integer leaves always `invalid`;
            - prove descriptor keys and documented defaults are unique.

    - `[ ]` **3.1.b Define raw, authorable, and completed config schemas**
        - Define the unregistered open `RawArcConfigSchema`, registered `ArcConfigSchema`, and unregistered strict
          `ConfigSettingsSchema`; derive their exported structural types with `z.infer`.
        - Compose `ArcConfigSchema` from a string record whose keys match the installed validator's exact
          `^[a-z][a-z0-9_.]+$` discovery grammar, intersected with the catalog-generated known-key object, so matching
          unknown keys remain string-valued and known keys cannot bypass their leaf schemas.
        - Keep `ConfigSettingsSchema` limited to the complete agent-consumable projection and validate presence and
          string shape without falsely claiming that tolerant readers normalize every value.
        - Preserve the established `src/commands/config/types.ts` and `src/commands/config.ts` import paths through
          compatibility re-exports of inferred `ConfigSettings`; keep session-init and provenance records separate.
        - Build `test-first` (one behavior at a time):
            - accept omission-as-default and every valid catalog domain;
            - accept quoted empty only for `default` and `unset` leaves and reject it for `invalid` leaves;
            - preserve unknown string-valued names accepted by the shell grammar, including its undotted and
              repeated- or trailing-period forms;
            - reject uppercase, leading-digit, leading-underscore, one-character, or invalid-character unknown names,
              invalid known values, non-string raw values, and incomplete or extra completed projections;
            - project the authorable schema without transforms or refinements; composed runtime/projection parity
              remains owned by Phase 6.

### `[ ]` **3.2 Rebase policy adapters on catalog domains and defaults**

- _Goal:_ Configuration consumers share field definitions without losing their distinct tolerance, precedence,
  normalization, and hard-error policies.

    - `[ ]` **3.2.a Validate tokenizer output without changing syntax behavior**
        - Keep `parseArcConfig()` responsible for its broader `^[\w.]+` key capture, CRLF handling, quote stripping,
          first-definition wins, colon-bearing values, and bare-empty default selection.
        - Parse the resulting string map only through `RawArcConfigSchema`, return its inferred type, and introduce no
          global coercing normalizer.
        - Build `test-first` (one behavior at a time):
            - preserve broad tokenizer-only names, duplicate claims, bare-empty omission, quoted-empty presence,
              quoted and colon-bearing non-empty values, and CRLF input;
            - keep both empty forms first-definition-wins so neither permits a later value to replace it;
            - reject non-string records at the raw-schema boundary.

    - `[ ]` **3.2.b Migrate agent-consumable and precedence-aware readers**
        - Source the `readConfigSettings()` key projection, defaults, and tolerant enum checks from catalog-derived
          descriptors, then parse the assembled complete map through `ConfigSettingsSchema` before return.
        - Keep `user.notes_push` raw until the git-config precedence resolver validates it, and preserve provenance
          in resolved release-mode settings.
        - Migrate `buildConfigKeyOverrides()` and `resolveGitConfigOverride()` to catalog-owned key/default references
          without adding project YAML tiers to per-developer-only settings.
        - Build `test-first` (one behavior at a time):
            - preserve tolerant invalid-value degradation and omission defaults;
            - preserve git-config-over-YAML precedence, fallback warnings, and provenance.

    - `[ ]` **3.2.c Migrate strict commit-check configuration**
        - Derive the commit-check key subset and `COMMIT_CHECK_DEFAULTS` from catalog descriptors, then reuse the
          relevant leaves without moving commit-message policy into the authorable record schema.
        - Preserve the disabled-hook short circuit, numeric normalization, custom-pattern pass-through, and exact
          `config.invalid-value` / `config.invalid-number` findings.
        - Build `test-first` (one behavior at a time):
            - preserve disabled, active, and invalid policy resolutions;
            - preserve numeric boundary normalization and exact configuration findings.

    - `[ ]` **3.2.d Migrate worktree configuration adapters**
        - Reuse catalog leaves in `git/worktree-location.ts` and `git/worktree-harness-dirs.ts` while retaining token
          substitution, order-preserving deduplication, top-level-directory checks, reserved-name checks, and throws.
        - Keep post-create command execution and fallback authority at their current callers rather than introducing a
          global worktree normalizer.
        - Build `test-first` (one behavior at a time):
            - preserve location-token expansion without ambient Git or filesystem reads;
            - preserve every accepted, normalized, and rejected harness-directory form.

### `[ ]` **3.3 Deliver typed configuration validation behind the stable launcher**

- _Goal:_ One non-interactive TypeScript validator owns diagnostics and exit status while the installed shell path
  and custom-root behavior remain compatible.

    - `[ ]` **3.3.a Implement the TypeScript validation service**
        - Add `src/commands/config/validate.ts` with a service that accepts a resolved read path plus its selected
          display token and returns rendered lines, pass/warning/error counts, and exit code without writing output.
        - Compose catalog-domain errors, unknown-key warnings, and custom-pattern cross-field checks into stable
          `PASS` / `WARN` / `ERROR` lines, summary counts, and exit codes `0`, `1`, and `2`.
        - Inventory validatable key occurrences directly from raw content with the exact
          `^[a-z][a-z0-9_.]+:` shell line grammar; use `parseArcConfig()` for first-definition values and defaults,
          then validate the matching value map through `ArcConfigSchema`.
        - Keep diagnostics keyed to stable field paths and the selected path token; never echo complete configuration
          contents or pattern bodies.
        - Build `test-first` (one behavior at a time):
            - report missing files and malformed known values as errors;
            - warn for unknown keys, including `hooks.subject_warn_length`;
            - ignore tokenizer-only keys outside the installed validator grammar without changing counts or status;
            - preserve unknown bare-empty and duplicate-key warning lines, counts, and ordering from the raw key
              occurrence inventory;
            - render quoted-empty `default` fields as the existing absent/default pass, apply existing missing or
              ignored policy to `unset` fields, and reject quoted-empty `invalid` fields including numeric limits;
            - enforce custom format/footer dependencies and positive-integer minima;
            - preserve exact line ordering, counts, and severity-derived exit codes;
            - keep the service side-effect-free under injected file reads.

    - `[ ]` **3.3.b Add `arc config validate` command wiring**
        - Register the optional `--file <path>` surface in `src/cli.ts`, expose the orchestrator through the stable
          `src/commands/config.ts` barrel, and add non-interactive handling in `src/handlers/config.ts`.
        - Require `resolveArcRoot()` only for the default config path; resolve explicit paths from `process.cwd()`,
          preserve the supplied token in diagnostics, and allow validation outside a standard ARC root.
        - Have the handler write the returned lines and set `process.exitCode` from the structured service result.
        - Add integration coverage for nested-cwd default resolution, relative and absolute explicit paths outside an
          ARC root, selected-token diagnostics, and exit-code propagation.

    - `[ ]` **3.3.c Reduce `validate-config.sh` to the compatibility launcher**
        - Update the authoritative package-source script at its installed path, source `arc-lib.sh`, and `exec`
          `arc config validate --file "$ARC_CONFIG_FILE"` with transparent stdout, stderr, signal, and status
          forwarding.
        - Sync the Framework script to its byte-identical `.arc/` mirror after the package-source edit.
        - Characterize the thin launcher with a PATH-injected `arc` shim that pins argv plus stdout, stderr, and status
          forwarding; keep real built-CLI behavior in command-level integration or E2E coverage.
        - Cover direct default-path use, absolute temporary paths, and `verify-integrity.sh` with a custom `ARC_DIR`
          before removing every shell key/domain/default table.

### `[ ]` **3.4 Prove catalog completeness and compatibility behavior**

- _Goal:_ The catalog demonstrably covers the shipped configuration surface exactly once, and every existing
  adapter retains its intended observable policy.

    - `[ ]` **3.4.a Add a closed configuration inventory test**
        - Compare the exact catalog key set with declared keys in the packaged `arc-config.yml`; do not compare catalog
          defaults with configured package literals such as the init-overridden `pm.mode` value.
        - Require raw-reading and policy adapters to expose explicit catalog-derived key subsets instead of discovering
          consumed keys through source-text matching; allow only documented consumer-specific projections.
        - Detect duplicate descriptors, unowned consumed keys, stale validator-only keys, parallel default tables, and
          any remaining shell key/domain table; prove full validation recognizes every catalog key and warns on extras.

    - `[ ]` **3.4.b Establish the shared compatibility corpus**
        - Add reusable valid, invalid, absent, bare-empty, quoted-empty, unknown, duplicate, and precedence cases with
          expected outcomes per adapter; keep fixtures data-only so no parallel validation helper survives this work
          unit.

    - `[ ]` **3.4.c Prove tolerant and precedence-aware compatibility**
        - Run the shared corpus through status reads and resolved settings, preserving warning subsets, raw-value
          compatibility, defaults-applied semantics, override precedence, and provenance.

    - `[ ]` **3.4.d Prove strict and worktree-adapter compatibility**
        - Run the shared corpus through commit checks, worktree location, and harness-directory parsing, preserving
          hard findings, fallbacks, normalization, token expansion, and throws.

    - `[ ]` **3.4.e Prove validator and launcher compatibility**
        - Run the shared corpus through full validation, direct command invocation, the installed launcher, and custom
          `ARC_DIR` integrity validation, preserving diagnostics, selected path tokens, summary counts, and exit codes.

## **Phase 4:** User-state and cross-work-unit contracts

_Purpose:_ Replace manual persisted-state and note-payload checks with schema-owned adapters while retaining
backward-compatible hydration, concurrent-write behavior, and lossless Markdown reconstruction.

### `[ ]` **4.1 Establish versioned local sync-state schemas and normalization**

- _Goal:_ Persisted versions 2–4 enter through an explicit backward-compatible reader and hydrate to one strict
  version-4 internal record without rejecting tolerated extensions.

    - `[ ]` **4.1.a Define persisted and normalized sync-state schemas**
        - Add `src/lib/user-sync/schema.ts` with a projectable loose-object `PersistedLocalSyncStateSchema` union for
          versions 2, 3, and 4 plus strict `LocalSyncStateSchema` for normalized version 4.
        - Require non-empty `materializedManifestHash` and `sourceCommit` plus the `save` / `load` discriminant without
          adding timestamp, hash-format, or identifier policy that the current reader does not enforce.
        - Declare known persisted extension slots as optional `unknown` values and accept unknown additive fields so the
          registered runtime and JSON Schema domains remain acceptance-equivalent; normalization owns their narrowing.
        - Define strict child schemas for partial-push markers, string-array file lists, and object-map provenance;
          derive `LocalSyncState`, `PartialPushMarker`, and structural children with `z.infer`.
        - Keep legacy `machineId` outside `LocalSyncStateSchema` and confined to the raw one-time migration input.
        - Preserve established imports through compatibility re-exports from `sync-state.ts` and `user-sync/index.ts`.
        - Build `test-first` (one behavior at a time):
            - accept valid required identity and basis fields for versions 2–4;
            - reject malformed required fields and discriminants without imposing new lexical formats;
            - accept malformed known extensions and unknown additive fields at the persisted-reader boundary;
            - require exact version-4 fields and valid extensions at the normalized producer boundary;
            - project the persisted root without transforms or refinements.

    - `[ ]` **4.1.b Normalize tolerated persisted extensions**
        - Implement `normalizeLocalSyncState()` after persisted structural parsing, narrowing each known extension
          through its child schema and ignoring malformed extensions plus unknown additive fields.
        - Retain valid `savedAt`, `verifiedAt`, `notesRefTip`, `partialPush`, `partialPushErrand`, `priorFileList`, and
          `remoteMarkerProvenance` values while upgrading the discriminant to version 4.
        - Ensure normalized reads never expose legacy `machineId` and always satisfy `LocalSyncStateSchema`.
        - Build `test-first` (one behavior at a time):
            - hydrate each persisted version to the same strict version-4 base;
            - retain every valid known extension independently and in combination;
            - discard each malformed extension and unknown field without losing valid base or sibling state;
            - exclude `machineId` from every normalized result.

### `[ ]` **4.2 Preserve sync-state persistence and migration behavior**

- _Goal:_ Reads, atomic writes, and concurrent mutations use the schemas without changing missing/malformed versus
  I/O-failure behavior or dropping compatible state.

    - `[ ]` **4.2.a Cut validated reads over to parse and normalize**
        - Replace manual `parseLocalSyncState()` checks with the persisted schema and normalizer while retaining
          fallback to the legacy path and one-time machine-id migration.
        - Preserve current path precedence exactly: `ENOENT` continues to the legacy path, invalid JSON at the first
          readable path returns `null`, and a structurally unusable parsed value may continue to the legacy candidate.
        - Keep the raw one-time `machineId` reader independent from the full persisted schema so a machine-id-only
          legacy object remains adoptable without surfacing the field in validated current state.
        - Build `test-first` (one behavior at a time):
            - preserve preferred-path, legacy-path, invalid-JSON, structurally unusable, and both-path-absent outcomes;
            - rethrow non-`ENOENT` reads without attempting to mint or overwrite state;
            - hydrate versions 2–4 and adopt a valid raw legacy `machineId` through their separate paths.

    - `[ ]` **4.2.b Validate every version-4 persistence path**
        - Parse complete records with `LocalSyncStateSchema` immediately before atomic write in the shared mutation
          path so all producers receive the same invariant check.
        - Preserve the compare-and-swap lock/retry loop and fail schema-invalid producer output before filesystem
          mutation after the lock is acquired.
        - Pin the save/load matrix: clear `partialPush`; carry `partialPushErrand` and `remoteMarkerProvenance`; replace
          or retain `priorFileList`; preserve `notesRefTip` on `undefined` and clear it on `null`; drop `machineId`.
        - Pin marker mutation behavior: record or clear only its targeted marker while retaining every valid unrelated
          field, including `priorFileList` and provenance.
        - Build `test-first` (one behavior at a time):
            - reject invalid mutation output before `atomicWriteJson()` and persist valid normalized records;
            - preserve the complete save/load carry, replace, clear, and drop matrix;
            - preserve unrelated fields across notes and errand marker record/clear operations;
            - retain atomic JSON and retry behavior under concurrent updates.

    - `[ ]` **4.2.c Exercise the local record lifecycle in integration**
        - Cover preferred and legacy migrations, save/load rewrites, concurrent compare-and-swap mutation, and both
          marker families against real temporary files while preserving failure and carry-forward behavior.

    - `[ ]` **4.2.d Exercise state-producing command and ref flows**
        - Extend built-CLI and ref-backed coverage for save/load production, partial-push publication, reconciliation,
          and recovery so schema adoption does not alter externally visible sync behavior.

### `[ ]` **4.3 Establish cross-work-unit note adapter schemas**

- _Goal:_ Cross-work-unit note parsing has schema-derived success and failure shapes while retaining title/header
  identity, no-throw recovery, and byte-lossless reconstruction.

    - `[ ]` **4.3.a Define cross-work-unit entry and parse-result schemas**
        - Add `CrossWuEntrySchema` and the no-throw entry-result schema beside the user-sync adapters; derive
          `CrossWuEntry` and `EntryParse` while leaving the domain decision `CrossWuShape` handwritten.
        - Validate the `Memories` / `Errand` / `Work Unit` section domain, non-empty merge keys, non-empty preserved raw
          blocks, and non-empty failure reasons through strict success and failure arms.
        - Replace the structural declarations in `types.ts` with compatibility re-exports and preserve the public
          `user-sync/index.ts` type surface.
        - Build `test-first` (one behavior at a time):
            - accept each known section and both parse-result arms;
            - reject unknown sections, empty keys or raw blocks, empty reasons, and extra fields;
            - keep `CrossWuShape` outside the schema-derived structural record family.

    - `[ ]` **4.3.b Cut cross-work-unit parsers over to schema-owned payloads**
        - Validate each internally assembled success or failure through the result schema immediately before return;
          schema failure remains a programming defect while malformed authored entries remain no-throw data outcomes.
        - Preserve HTML-comment removal, section boundaries, Working Memory full-header identity, User Inbox bold-title
          identity scoped by section, and exact malformed-entry reasons.
        - Build `test-first` (one behavior at a time):
            - preserve malformed header and missing-trigger reasons without throwing;
            - preserve Working Memory header keys and User Inbox title/section keys exactly;
            - preserve raw entry blocks byte-for-byte apart from the existing trailing-blank trim.

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
