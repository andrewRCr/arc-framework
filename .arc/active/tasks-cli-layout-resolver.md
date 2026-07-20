# Task List: cli-layout-resolver

- **Design:** `spec-cli-layout-resolver.md`

---

## **Phase 1:** Typed layout core

_Purpose:_ Establish the runtime-validated semantic address contract and its pure projection boundaries before any
caller migration begins.

### `[x]` **1.1 Define the layout schemas, address algebra, registry, and error contract**

- _Goal:_ Every public layout input is validated by a subsystem-owned runtime authority and discoverable through an
  isolated registry without moving layout vocabulary into the kernel.

    - `[x]` **1.1.a Add strict layout schemas and derived public types**
        - Added the strict semantic address, placement, archive, procedure, artifact, and distinctly branded template
          schemas with inferred public types and kernel-owned slug/managed-path validation at their boundaries.

    - `[x]` **1.1.b Add the local error and registry surfaces**
        - Added the four-code `LayoutError`, nine-root isolated registry composition, explicit public barrel, and an
          architecture test restricting layout dependencies to the kernel, Zod, host path semantics, and local code.

- _Outcome:_ The new layout subsystem is a runtime-authoritative, independently discoverable contract while the
  kernel remains bottom-of-graph and the kernel JSON Schema publication boundary is unchanged.

### `[x]` **1.2 Implement canonical semantic-address projection**

- _Goal:_ A complete semantic address deterministically produces the current repository-relative POSIX path without
  I/O, ambient-root dependence, or lifecycle inference.

    - Added exhaustive, synchronous projection for every semantic address family, including explicit active scopes,
      backlog cohorts, completed coordinates, cohort-closeout levels, procedures, readiness, and user documents.
    - Defensive parsing rejects unsafe runtime inputs with preserved causes, and every result passes the kernel's
      final managed-path validation without filesystem, Git, environment, clock, or ambient-root dependencies.

### `[x]` **1.3 Implement contained native-path materialization**

- _Goal:_ Filesystem callers can materialize canonical managed paths beneath an explicit fully qualified root with
  host-correct containment guarantees and no native separator leakage into canonical contracts.

    - Added host-native materialization over a deterministic internal POSIX/Windows seam, with fully qualified root
      validation, managed-path revalidation, drive-designator rejection, and an independent strict-descendant proof.
    - Covered POSIX, drive-qualified, and UNC success plus invalid root, unsafe cast, and Windows drive-switch paths;
      canonical operands remain POSIX managed paths until this filesystem boundary.

### `[x]` **1.4 Preserve the validated template binding transform**

- _Goal:_ Template installation retains its byte-stable suffix behavior while source-relative and output-relative
  paths gain distinct validated roles.

    - Added the stable binding suffix and a validated source-to-output transform with distinct template-relative
      brands, preserving templated and copy-as-is behavior without representing either role as a repository path.
    - Both transform boundaries validate independently, and unsafe source paths fail with the originating schema
      cause under the local template-path error code.

## **Phase 2:** Identity and user-document boundaries

_Purpose:_ Make configured identity a validated semantic input and route user-document construction through the
resolver without changing fallback or root-selection policy.

### `[x]` **2.1 Split configured identity reading from fallback resolution**

- _Goal:_ Present `arc.identity` values are preserved byte-for-byte and either become branded `Slug` values or fail
  with one actionable identity-domain error, while absent configuration retains existing fallback behavior.

    - Added a delimiter-preserving configured-only reader that returns a branded slug, distinguishes Git exit-1
      absence, rejects every present invalid value with the exact identity remediation, and propagates other failures.
    - The fallback resolver now retains derived/prompted slugification and cancellation behavior while returning only
      validated slugs; production Git integration proves canonical, padded, empty, and absent byte handling.

### `[x]` **2.2 Migrate configured-only identity readers with exact failure semantics**

- _Goal:_ Status, recovery, and project-readiness probes share the configured-only identity authority without
  accidentally acquiring interactive or `user.name` fallback semantics.

    - `[x]` **2.2.a Adopt the helper in composite status identity reads**
        - Composite status now uses the configured-only authority while leaving role normalization local; absence and
          prior read-failure degradation remain missing identity, while invalid present configuration stops early.

    - `[x]` **2.2.b Adopt the helper in recovery probes**
        - Recovery preserves its `identity-missing` stops for absence and read failure, propagates invalid configured
          identity before user-path resolution, and retains the existing recovery envelope shape.

    - `[x]` **2.2.c Adopt the helper in project-readiness errand records**
        - Project-readiness rendering preserves authoritative empty records for absence and degraded completeness for
          Git failure while surfacing invalid configuration; an architecture test enforces the single read owner.

- _Outcome:_ All configured-only consumers now distinguish absence, invalid presence, and executor failure through
  one byte-preserving identity authority without acquiring fallback semantics.

### `[x]` **2.3 Adopt semantic user-document addresses at user-surface owners**

- _Goal:_ Per-WU session notes and identity-global working memory use semantic addresses while current-versus-primary
  worktree selection remains exclusively owned by the user-surface resolver.

    - `[x]` **2.3.a Materialize user documents beneath caller-selected roots**
        - User surfaces now accept branded semantic operands and materialize conventional session notes beneath the
          current worktree and working memory beneath the topology-selected primary worktree; owners parse strings.
        - Arbitrary identity-global descendants remain local composition beneath the resolver-owned user root.

    - `[x]` **2.3.b Migrate conventional session-note producers**
        - Handoff, start seeding, and sync-status seed detection project and materialize complete conventional note
          addresses while recognition-only basenames and legacy-root handling remain with their existing owners.

    - `[x]` **2.3.c Preserve load-set path roles across current and primary worktrees**
        - Load-set projection uses semantic conventional note paths and consumes the exact working-memory path from
          the user-surface owner while exact meta, task, and cohort pointers remain unchanged.

- _Outcome:_ Conventional user documents now cross one semantic projection boundary without moving worktree-root
  selection or arbitrary identity-global descendant policy into layout.

## **Phase 3:** Work-unit and lifecycle address migration

_Purpose:_ Replace distributed placement and artifact construction in lifecycle-owned code while preserving exact
discovery, record, manifest, and configured-pointer authority.

_Design decisions:_ Existing semantic owners parse dynamic slugs and cohort fields into kernel brands before layout
projection and preserve their domain-specific rejection behavior. Project lifecycle owners always supply explicit
project-active scope; contributor discovery supplies contributor-active scope plus branded identity. Exact paths
remain exact evidence; comparison code may project an expected path from independently parsed semantic fields but
never recover operands from the discovered path merely to call layout.

### `[x]` **3.1 Migrate active-work-unit verb projections**

- _Goal:_ Every active lifecycle verb obtains its conventional meta and companion paths from validated
  project-active placement while preserving its current transition semantics and stored filename contracts.

    - `[x]` **3.1.a Migrate `activate` and `deactivate` paths**
        - Parsed work-unit names at the verb boundary and projected project-active meta artifacts; invalid names now
          retain the rejected-result contract while short-circuiting before file reads or transition dispatch.

    - `[x]` **3.1.b Migrate `set-stage` paths**
        - Projected the active meta path from the existing branded slug guard without changing stage validation,
          transition inputs, or literal result paths.

    - `[x]` **3.1.c Migrate `finalize-stage` paths**
        - Projected the active meta artifact while preserving bare task-list and design filenames in stored fields
          across both finalize stages and all rejection paths.

    - `[x]` **3.1.d Migrate `repoint-design` paths**
        - Projected active meta and design artifacts from one branded slug, retaining bare-field storage,
          deduplication, and existing invalid-name behavior.

    - `[x]` **3.1.e Migrate `integrate` paths**
        - Projected the active meta artifact after successful transition checks, leaving integration judgment,
          guards, and Git effects unchanged and covering invalid and rejected transitions independently.

    - `[x]` **3.1.f Migrate `reopen` paths**
        - Projected the active meta artifact after successful transition checks while preserving PR withdrawal,
          lifecycle guards, and invalid-name rejection behavior.

- _Outcome:_ Active lifecycle verbs now share the semantic project-active projection contract while their branch,
  field-storage, transition, and side-effect policies remain owned by the existing verb and executor boundaries.

### `[x]` **3.2 Migrate backlog placement producers**

- _Goal:_ Backlog creation and relocation project destinations from validated commitment, cohort, and slug facts
  without weakening exact-source or lifecycle-index authority.

    - `[x]` **3.2.a Migrate stub creation paths**
        - Projected selected-commitment containers and meta artifacts from branded work-unit and cohort operands,
          preserving stub policy, scaffold behavior, and literal returned paths.

    - `[x]` **3.2.b Migrate promotion and demotion destinations**
        - Replaced tier-prefix rewriting with semantic destination projection from lifecycle-record slug and cohort
          fields while retaining exact indexed sources and their directories for relocation and pruning.

    - `[x]` **3.2.c Migrate park and resume destinations**
        - Projected project-active and planned destinations from validated operands while preserving exact discovered
          pointer paths, retirement evidence, worktree behavior, and partial-application reporting.

    - `[x]` **3.2.d Migrate decompose scaffold destinations**
        - Projected planned member containers and conventional meta/draft artifacts from validated allocation
          operands while leaving existing-home paths and allocation judgment with the decompose owner.

- _Outcome:_ Backlog producers now distinguish semantic destinations from exact source evidence, including declared
  cohort placement that can intentionally differ from a legacy source directory without reverse-parsing that path.

### `[x]` **3.3 Migrate executor and retirement comparison projections**

- _Goal:_ Executor and retirement code share canonical expected-path projection without converting exact Git/index
  evidence or recognition policy into inferred layout state.

    - `[x]` **3.3.a Migrate executor side-effect paths**
        - Projected project-active meta artifacts at dependency-discharge and PR-withdrawal boundaries while
          preserving cwd-relative managed paths and all side-effect policy.

    - `[x]` **3.3.b Migrate park-landing comparison paths**
        - Projected lifecycle roots and the expected planned container from receipt identity and declared cohort,
          retaining tree entries, staged paths, receipt paths, and blob paths as exact Git evidence.

    - `[x]` **3.3.c Migrate park-retirement proof comparisons**
        - Projected the expected planned container from the declared meta cohort and compared its exact directory
          directly, removing cohort recovery from discovered paths while preserving artifact-map keys and refusals.

    - `[x]` **3.3.d Split semantic and exact decompose-retirement targets**
        - Projected only conventional new-member artifacts and cohort documents, leaving lifecycle-index homes,
          explicit document targets, dependent meta paths, and other existing pointers exact.

- _Outcome:_ Retirement and executor boundaries now use layout as an expected-path projector only; committed Git,
  lifecycle-index, and configured evidence remains authoritative and is never reverse-parsed into semantic state.

### `[ ]` **3.4 Migrate archive and cohort-document projections**

- _Goal:_ Completed destinations and cohort documents project from caller-owned coordinates while allocation,
  membership, nesting, and closeout judgment remain with archive and cohort modules.

    - `[ ]` **3.4.a Route allocated archive destinations through completed placement**
        - Update `src/lib/work-unit/completed-index.ts` so it continues to allocate quarter and sequence, then passes
          those coordinates plus a branded work-unit slug to layout for the completed container.
        - Preserve completed-tree scanning, entry recognition, and closeout-sidecar counting; cover allocation and
          invalid-slug behavior with literal destination strings.

    - `[ ]` **3.4.b Route archive artifacts and closeout sidecars through semantic addresses**
        - Update `src/lib/work-unit/verbs/archive.ts` to project the completed work-unit artifact group and completed
          cohort documents from the allocated coordinates, validated cohort tuple, and explicit `leaf | parent`
          closeout fact.
        - Preserve membership checks, nested-parent selection, archival triggers, exact source paths, and transition
          effects; cover standalone, leaf-closeout, and parent-closeout paths independently.

    - `[ ]` **3.4.c Route planned cohort-document lookup through layout**
        - Update `src/lib/session-init/cohort-doc.ts` to parse the owner-supplied one- or two-segment cohort field and
          project its planned cohort document without changing active-meta reading, membership policy, or existence
          checks.
        - Cover top-level, nested, absent, unsafe, and missing-document outcomes with literal path expectations.

### `[ ]` **3.5 Preserve exact paths and carry semantic operands separately for `arc view`**

- _Goal:_ Lifecycle records and configured pointers remain authoritative while conventional viewing receives the
  branded identity and structured placement it needs without reverse-parsing those paths or changing the
  agent-facing session envelope.

    - `[ ]` **3.5.a Lock lifecycle-index exact-path authority**
        - Keep caller-supplied `path` values authoritative in `buildLifecycleIndexFromRecords()` and both production
          adapters; retain the pathless fallback as lifecycle-owned synthetic diagnostic projection.
        - Extend lifecycle-index coverage for custom, nested, and archived record paths without forcing incomplete
          archive coordinates through layout.

    - `[ ]` **3.5.b Carry semantic active candidates without changing the session envelope**
        - Extend the active-meta discovery/resolution internals to validate the recognized conventional filename into
          a branded `Slug` and retain it with explicit project- or contributor-active `WorkUnitPlacement` beside the
          exact candidate path through single and unique-current-branch selection.
        - Derive contributor scope only from the already-resolved role and branded configured identity, never from
          the discovered path; preserve the existing missing-identity short circuit.
        - Keep `ActiveSessionInitResult` and its serialized JSON byte-shape unchanged by explicitly projecting away
          the internal semantic field; do not add a slug to the agent-facing single-result arm.
        - Cover invalid recognized slugs, single and multiple resolution, contributor roots, and unchanged
          session-init JSON output before migrating the view adapter.

    - `[ ]` **3.5.c Add branded identity and structured placement to resolved view targets**
        - Change `ResolvedViewTarget.slug` in `src/lib/view/types.ts` to kernel `Slug` and add
          `WorkUnitPlacement`, using the layout-owned type instead of a parallel view descriptor while retaining
          `location`, exact `metaPath`, and exact configured `taskListPath` fields.
        - Update `src/handlers/view.ts` so ambient targets consume the internal semantic active result, including its
          project or contributor scope; explicit targets parse the lifecycle index's `entry.slug` and `entry.cohort`
          fields and preserve `entry.path`.
        - Fail closed on invalid semantic fields and extend handler tests for active, planned, provisional, nested,
          invalid, contributor, and exact-pointer targets.

    - `[ ]` **3.5.d Resolve only conventional view siblings from placement**
        - Update `src/lib/view-artifact.ts` to preserve exact meta and configured task-list pointers, but use the
          target's structured placement and branded slug for conventional task/spec/draft/notes fallbacks.
        - Extend focused artifact tests so configured pointers win unchanged, conventional siblings use placement,
          and no fallback derives placement with `dirname(metaPath)`.

    - `[ ]` **3.5.e Lock cross-boundary behavior with integration tests**
        - Preserve custom discovery, lifecycle record, and configured-pointer paths end to end while covering active,
          contributor-active, standalone backlog, nested backlog, and unsupported completed viewing.
        - Prove no migrated lifecycle or view caller reverse-parses an exact path solely to reconstruct an address,
          the session-init envelope remains unchanged, and all expected path strings stay independent from the
          resolver under test.

## **Phase 4:** Remaining resolver consumers and compatibility coverage

_Purpose:_ Complete semantic adoption across root, procedure, readiness, and template surfaces while retaining
independent evidence and subsystem-owned descendant policy.

_Design decisions:_ Only an owner holding a repository root projects and materializes `arc-root`; an exact `arcDir`
parameter remains authoritative downstream. Project-root discovery, package-template roots, shell-hook literals,
scanner patterns, fixtures, prose examples, and golden strings stay outside layout and receive explicit residual
dispositions in Phase 5.

### `[ ]` **4.1 Migrate installer and configuration root owners**

- _Goal:_ Installation and configuration entry points select `.arc` through one validated root projection while
  downstream helpers continue consuming their exact caller-supplied installation directory.

    - `[ ]` **4.1.a Replace the root-bearing config segment helper**
        - Retire `ARC_CONFIG_SEGMENTS` from `src/lib/constants.ts`; retain only the template- or ARC-root-relative
          config suffix owned by configuration code.
        - Update `src/lib/config/status-reader.ts` and `src/lib/config/resolve-override.ts` to project and materialize
          `arc-root` beneath their repository root before composing the validated config suffix.
        - Cover absolute materialization and unchanged config-read behavior with literal path expectations.

    - `[ ]` **4.1.b Migrate fresh-install root selection**
        - Update `src/commands/init.ts` to materialize the selected ARC directory beneath `cwd`, then keep passing that
          exact `arcDir` to manifest, permission, and post-init helpers.
        - Preserve pre-install existence checks, installed output, user messages, recipe policy, and focused unit/E2E
          expectations.

    - `[ ]` **4.1.c Migrate join root selection**
        - Update `src/commands/join.ts` to use the same root boundary for installation detection and its exact
          downstream `arcDir`, without changing Git/setup or identity behavior.
        - Preserve joined-tree and already-installed outcomes with independent expected paths.

    - `[ ]` **4.1.d Migrate update root selection**
        - Adopt repository-root materialization in `src/commands/update.ts`; keep its exact `arcDir` and owner-local
          manifest, pristine-store, merge, and removal descendants.
        - Preserve update result contracts, conflict behavior, and fixtures with literal installed paths.

    - `[ ]` **4.1.e Migrate reconfigure root selection**
        - Adopt repository-root materialization in `src/commands/reconfigure.ts` while preserving its exact downstream
          `arcDir`, mode selection, removal plan, and manifest behavior.
        - Cover retained, removed, and restored files without using layout to produce expected values.

    - `[ ]` **4.1.f Migrate health root selection**
        - Adopt repository-root materialization in `src/commands/health.ts`, then retain its exact `arcDir` plus local
          manifest and installed-file descendants.
        - Keep health classification and display strings unchanged.

    - `[ ]` **4.1.g Migrate diff root selection**
        - Adopt repository-root materialization in `src/commands/diff.ts`, then retain its exact `arcDir` plus local
          manifest, pristine, and current-file descendants.
        - Keep comparison semantics and literal display paths unchanged.

    - `[ ]` **4.1.h Migrate commit-check repository binding**
        - Update `src/lib/commit-check/repository.ts` to materialize `arc-root` beneath the already-discovered project
          root before reading config or constructing its exact artifact-resolver boundary.
        - Preserve commit decoding, configuration, merge detection, and resolver behavior in focused tests.

    - `[ ]` **4.1.i Migrate init-handler internal-store binding**
        - Update `src/handlers/init.ts` to materialize `arc-root` beneath its repository root before composing the
          owner-local `.internal` manifest descendant.
        - Preserve installation-mode selection and existing user-facing diagnostics verbatim.

    - `[ ]` **4.1.j Migrate release record roots**
        - Update `src/lib/release/audit-log.ts` and `src/lib/release/setup-marker.ts` to start owner-local identity
          descendants from a materialized `arc-root` while retaining current-worktree selection and exact filenames.
        - Keep append, marker, cleanup, and error behavior unchanged with literal expected native paths.

    - `[ ]` **4.1.k Migrate constitution status root selection**
        - Update `src/commands/constitution/status.ts` to materialize `arc-root` before composing its owner-local
          rules-directory suffix; preserve frontmatter filtering and output behavior.
        - Cover repository-root independence with literal native paths.

    - `[ ]` **4.1.l Preserve root recognition and package-source boundaries**
        - Keep `resolveArcRoot()` in `src/lib/paths.ts` as project discovery that checks for `.arc`, not as semantic
          address projection, and preserve exact roots passed into manifest, setup, permission, and hook helpers.
        - Leave shell hooks, package-template paths, validation regexes, fixture paths, and public display prose as
          recognition, external-owner, or independent-evidence residuals rather than adding a non-TypeScript shim.

### `[ ]` **4.2 Migrate actual runtime procedure-root consumers**

- _Goal:_ Runtime workflow lookup starts from the semantic procedure root while package-source enumeration,
  validation, and exact workflow pointers retain their existing authorities.

    - `[ ]` **4.2.a Project workflow roots in the session load set**
        - Update `src/lib/load-set/projection.ts` to resolve the workflow procedure root, then append only its closed
          planning-stage or fixed execution/integration descendants.
        - Keep load-set ordering, exact status/meta/task/cohort pointers, and already-migrated user paths unchanged;
          cover all three session types with literal expected entries.

    - `[ ]` **4.2.b Project the workflow scan root for extension status**
        - Update `src/commands/extensions/status.ts` to materialize the workflow procedure root beneath `cwd` while
          leaving the sibling extension directory, workflow enumeration, and orphan interpretation locally owned.
        - Preserve session-init's no-workflow-scan fast path and full-status behavior.

    - `[ ]` **4.2.c Preserve non-runtime procedure-root evidence**
        - Keep template-relative `system/methods` classification, caller-supplied system roots in
          `audit-method-triggers.ts`, dual package/instance recognition in validators, shell-hook paths, and exact
          workflow pointers outside layout.
        - Require the final ledger to distinguish these residuals from the runtime workflow consumers; the absence
          of a production repository-path method consumer does not weaken unit coverage for the `methods` variant.

### `[ ]` **4.3 Migrate project-readiness document consumers by role**

- _Goal:_ Semantic readiness writers use the project-document address while status policy, exact Git evidence, and
  basename recognition preserve their stronger local contracts.

    - `[ ]` **4.3.a Derive the status-domain readiness path from layout**
        - Initialize the exported `ROADMAP_PATH` contract in `src/lib/status/roadmap-regeneration-assert.ts` from the
          project-document address, retaining its `ManagedPath` value and current remediation strings.
        - Keep assertion inputs, marker checks, staged-index reads, and golden diagnostics independent from the
          resolver implementation.

    - `[ ]` **4.3.b Preserve status remedy and reconciliation consumers**
        - Continue consuming the status-owned `ROADMAP_PATH` in `src/lib/status/roadmap-conflict-auto-remedy.ts` and
          `src/lib/base-drift/current-adapters.ts`; materialize it only at the filesystem boundary.
        - Preserve exact staged/unmerged paths, conflict policy, Git arguments, and user-facing messages.

    - `[ ]` **4.3.c Migrate lifecycle readiness regeneration**
        - Update `src/lib/work-unit/side-effects/readiness-regen.ts` to project the project document and materialize it
          beneath the supplied repository root while keeping render, newline, directory-creation, advisory, and
          staging behavior local.
        - Cover successful and degraded regeneration with literal native and managed path expectations.

    - `[ ]` **4.3.d Migrate start-handler readiness staging**
        - Update `src/handlers/start.ts` to use the project-document address wherever a successful start result stages
          the readiness view; preserve active-meta ordering and exact Git argument behavior.
        - Keep literal stage-path expectations in handler and dispatch integration tests.

    - `[ ]` **4.3.e Migrate direct-retirement readiness evidence**
        - Update `src/lib/work-unit/direct-retirement-driver.ts` to use the project-document address for exact blob,
          operation, and allowed-path operands without changing its retirement proof or canonical inventories.
        - Cover present, deleted, and unchanged readiness blobs with independent managed paths.

    - `[ ]` **4.3.f Migrate decompose-retirement readiness evidence**
        - Update `src/lib/work-unit/decompose-retirement-projection.ts` to add the semantic project-document path to
          its exact allowed set while preserving all Phase 3 placement/pointer boundaries.
        - Cover the resulting canonical inventory through focused retirement and decompose-shape tests.

    - `[ ]` **4.3.g Migrate park-landing readiness evidence**
        - Update `src/lib/work-unit/park-planning-landing.ts` to use the project-document address when recognizing the
          one permitted readiness operation, without changing exact diff paths or landing policy.
        - Preserve accepted and rejected operation matrices with literal expected paths.

    - `[ ]` **4.3.h Migrate the review-gate lifecycle adapter**
        - Update `src/scripts/review-gate/hosts/github/lifecycle-tail.ts` to project its semantic readiness operand
          without changing exact changed-file evidence, lifecycle interpretation, or GitHub behavior.
        - Cover literal staging and destination expectations in its focused unit and integration tests.

    - `[ ]` **4.3.i Preserve readiness recognition and external evidence**
        - Keep `ROADMAP.md` basename exclusion in `decompose-inventory.ts`, status-render prose, shell-hook mechanics,
          fixtures, and golden CLI strings as local recognition or independent evidence.
        - Require Phase 5 to account for each remaining `roadmap-name` hit without rewriting shipped procedure prose
          or forward-referencing a future readiness-view rename.

### `[ ]` **4.4 Migrate template-output consumers without coupling source and destination roles**

- _Goal:_ Init and manifest planning share the validated suffix transform while rendering classification,
  provenance, and destination policy keep their established roles.

    - `[ ]` **4.4.a Retire the parallel template-output helper**
        - Remove internal-only `toOutputPath()` from `src/lib/classification.ts`; keep `needsRendering()` as the
          independent source-role classifier rather than deriving it from transformed output.
        - Move transform-focused tests to the layout contract and retain classification tests for render/copy policy.

    - `[ ]` **4.4.b Adopt the transform in fresh installation**
        - Update `src/commands/init.ts` to parse enumerated template-relative paths and call
          `resolveTemplateOutputPath()` for destinations while preserving the original source path for
          classification, rendering, and manifest provenance.
        - Cover templated, untemplated, nested, and unsafe inputs with literal output expectations.

    - `[ ]` **4.4.c Adopt the transform in manifest planning**
        - Update `src/lib/manifest/plan.ts` so output-to-template maps and new-output sets use validated transformed
          destinations while template identities remain unchanged.
        - Preserve update/apply behavior and reject unsafe enumerated input before a plan reaches filesystem effects.

### `[ ]` **4.5 Preserve independent oracles and representative compatibility**

- _Goal:_ Cross-module evidence demonstrates unchanged valid behavior without reimplementing earlier unit coverage
  or turning the resolver into its own oracle.

    - `[ ]` **4.5.a Exercise installation-root integrations**
        - Cover fresh install and update/reconfigure in separate integration or E2E cases using literal persisted
          paths and public outputs.
        - Include a non-repository ambient working directory so materialization cannot accidentally depend on
          process `cwd` instead of the supplied root.

    - `[ ]` **4.5.b Exercise procedure-load integration**
        - Cover planning, execution, and integration load-set workflow selection with independently authored expected
          entries while preserving ordering and exact status-supplied pointers.

    - `[ ]` **4.5.c Exercise readiness integration**
        - Cover readiness regeneration and staging end to end with byte-stable output, exact Git operands, and a
          literal expected project-document path.
        - Reuse lifecycle cases attached to Phase 3 rather than duplicating their full matrix.

    - `[ ]` **4.5.d Exercise template install/update integration**
        - Cover templated and untemplated install/update flows while asserting original source provenance and literal
          transformed destinations.
        - Include unsafe enumerated input rejection before filesystem writes.

    - `[ ]` **4.5.e Prove package and architecture compatibility**
        - Verify the public layout barrel is packaged through the existing build, no new runtime dependency lands,
          and kernel JSON Schema generation does not publish layout roots.
        - Extend import-boundary tests so commands and handlers consume downward into the pure/injectable library
          layer and layout remains free of lifecycle, discovery, user-root, prompt, and storage imports.

## **Phase 5:** Deterministic migration proof and residual ownership

_Purpose:_ Bind the final indexed tree to a complete, reproducible disposition ledger and prove every selected
layout hit has exactly one semantic owner.

### `[ ]` **5.1 Define the class-inventory and migration-ledger proof contracts**

- _Goal:_ The migration proof has a strict versioned data model and unambiguous canonical digest recipes for its
  disposition-independent source evidence and selected class-hit sets.

    - `[ ]` **5.1.a Extract the deterministic class-inventory scan**
        - Add a shared `scanClassInventory` primitive that returns manifest/corpus source metadata and canonical
          `classes[].hits` before catch-all disposition partitioning.
        - Compose the existing `scanCorpus` from that primitive without weakening or changing its stale-disposition
          behavior, and cover equivalence of the full scan's class projection.

    - `[ ]` **5.1.b Add the version-1 ledger schemas and closed disposition vocabulary**
        - Implement `src/lib/coupling-audit/layout-migration-ledger.ts` with exact/bulk entries, closed predicates,
          `classInventoryDigest` source metadata, owner/reason fields, and the fixed fifteen-class identity set.
        - Keep this audit-only surface out of the public layout barrel.

    - `[ ]` **5.1.c Implement class-aware hit-set hashing**
        - Define hit keys as `[classId, evidenceDigest]`, reject duplicates and empty bulk sets, order through
          `sortByCanonicalBytes`, and hash the canonical JSON preimage without delimiter joining or implicit dedupe.
        - Build `test-first` (one behavior at a time):
            - Distinguish the same evidence digest under different classes.
            - Reject malformed digests, duplicate tuples, and empty member sets.
            - Freeze trailing-LF versus no-trailing-LF digest recipes for every source field.

### `[ ]` **5.2 Implement the index-pinned migration assertion and command surface**

- _Goal:_ The pending implementation commit and a clean CI checkout are certified from the same Git-index bytes,
  with relevant untracked files and evidence drift failing closed.

    - `[ ]` **5.2.a Build a staged-tree coupling-audit input seam**
        - Enumerate `git ls-files --cached`, require indexed manifest and ledger inputs, and read exact bytes through
          the existing `readGitBlobBytes` adapter rather than ordinary trimmed `GitExec` output.
        - Refuse untracked paths selected by the corpus membership/exclusion rules, add the ledger itself to the
          manifest's excluded derived-bookkeeping set, and exercise staged bytes that differ from working-tree bytes.

    - `[ ]` **5.2.b Validate canonical indexed inputs and source digests**
        - Fatal-decode and validate the indexed manifest and ledger, then require the ledger bytes to equal
          `canonicalJson(validatedLedger)` exactly, including its trailing LF.
        - Rerun `scanClassInventory` from indexed corpus bytes and verify the manifest, corpus, class-inventory,
          selected-class, selected-count, and selected-hit-set fields against the frozen digest recipes.

    - `[ ]` **5.2.c Assert exactly-one disposition coverage**
        - Derive hit keys from `classInventory.classes[].hits`, reject duplicates, and expand exact and bulk entries.
        - Reject exact misses, zero-member or drifted bulk rules, overlaps, and unmatched hits.

    - `[ ]` **5.2.d Expose deterministic diagnostics and the root package script**
        - Add `src/scripts/assert-layout-migration.ts` and the repository-root `package.json` script
          `npm run audit:layout-migration`, with per-class residual counts and owners suitable for the cohort tail.
        - Build `test-first` (one behavior at a time) across clean command success and failures from missing indexed
          inputs, relevant untracked files, non-canonical ledger bytes, and source or coverage drift.

### `[ ]` **5.3 Populate exact and bulk dispositions for the final selected-hit universe**

- _Goal:_ Every current hit in the fifteen audited layout classes is either migrated or assigned one precise,
  reproducible residual owner with no catch-all omissions.

    - `[ ]` **5.3.a Refresh the final selected-class evidence from the indexed tree**
        - Record the fixed historical result digest plus final manifest, corpus, class-inventory, selected-count, and
          selected-hit-set digests in `audits/coupling-blast-radius/layout-migration-ledger.json`.
        - Use authoritative class hit inventories rather than `candidates.classified`.

    - `[ ]` **5.3.b Populate closed bulk residual cohorts**
        - Group independently verifiable layout definitions, root-only owners, pre-resolved paths,
          scanner false-positives, independent evidence, and external owners only where closed predicates express a
          stable semantic cohort.
        - Bind every bulk rule to its exact member-set digest so future hits cannot be silently absorbed.

    - `[ ]` **5.3.c Populate semantic and exact residual dispositions**
        - Assign `layout-definition`, `root-only-owner`, `pre-resolved-path`, `semantic-policy-owner`,
          `scanner-false-positive`, `independent-evidence`, or `external-owner` with explicit owner and reason.
        - Use exact entries wherever a hit does not belong to a stable closed cohort; do not create a broad residual
          rule merely to reduce ledger size.

    - `[ ]` **5.3.d Close all unexplained construction and verify the ledger**
        - Migrate any remaining covered semantic producer, narrow an overbroad rule, or record a justified residual
          until the assertion reports exactly one disposition for every selected hit.
        - Preserve no generic compatibility shim or second reusable layout-construction surface.

### `[ ]` **5.4 Reconcile the tracked-planning Git packet and external-owner residuals**

- _Goal:_ The internal migration proof assigns non-layout hits to their established owners without adding migration
  narration, future-work references, or ARC-development context to packaged guidance.

    - Verify `src/lib/work-unit/mutators/relocate-artifacts.ts` continues through the shipped injectable `GitExec`
      seam and receives canonical path operands without a layout-specific Git adapter.
    - Classify the pre-commit hook's read-only index inspection as hook-owned independent behavior in the internal
      migration ledger.
    - Classify guarded draft-retirement hits from `activate-work-unit.md` and `strategy-work-planning.md` as the
      internally routed `composable-workflows` residual in the migration ledger only.
    - Make no content change to those packaged workflow/strategy files solely for ledger classification, and never
      insert work-unit names, migration narration, or future-scope pointers into their prose.
    - Confirm the internal cohort-tail diagnostic names these owners and no unassigned tracked-planning operation
      remains.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The public layout subsystem exposes strict schemas, derived types, nine isolated registry roots, pure
  semantic projection across project- and contributor-active scopes, contained native materialization, validated
  template transformation, and only the four specified local error codes without introducing kernel or
  storage-policy coupling.
- `[ ]` Every semantic address projects to the current canonical POSIX path, every unsafe operand and native-root
  escape is rejected, and canonical Git, persisted, digest, and wire values never contain host separators.
- `[ ]` Configured identity reads preserve exact bytes and distinguish absence from invalid presence; status,
  recovery, and readiness callers retain their established missing/error behavior while rejecting invalid identity
  before user-path construction.
- `[ ]` Covered lifecycle, cohort, archive, procedure, readiness, template, and user-document producers consume the
  resolver while exact discovery, record, manifest, and configured-pointer paths remain authoritative.
- `[ ]` Project- and contributor-active viewing resolve conventional siblings from branded identity and placement,
  preserve exact pointers, and leave the agent-facing `ActiveSessionInitResult` serialization unchanged.
- `[ ]` The final index-pinned ledger binds the canonical class inventory and accounts for every hit in all fifteen
  selected classes exactly once, rejects evidence, canonical-byte, or member-set drift, and reports deterministic
  residual counts and semantic owners.
- `[ ]` The tracked-planning Git packet introduces no layout-owned executor; hook and procedure residuals remain
  explicitly owned and the existing `GitExec` relocation seam stays authoritative.
- `[ ]` Golden expectations remain independent of the resolver under test, and unit plus representative integration
  coverage exercises all address families, invalid inputs, identity behavior, registry composition, native
  materialization, consumer migrations, and residual enforcement.
- `[ ]` No storage mode, tracking boolean, lifecycle inference, existence probe, worktree-root policy, procedure
  identity, reverse parser, generic descendant join, or reusable compatibility shim enters the layout API.
- `[ ]` All quality gates pass (tests, linting, type checking, shell lint where applicable, Markdown linting, and
  build).
- `[ ]` Ready for integration.
