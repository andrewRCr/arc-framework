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

### `[x]` **3.4 Migrate archive and cohort-document projections**

- _Goal:_ Completed destinations and cohort documents project from caller-owned coordinates while allocation,
  membership, nesting, and closeout judgment remain with archive and cohort modules.

    - `[x]` **3.4.a Route allocated archive destinations through completed placement**
        - Kept quarter and sequence allocation with the completed index, then projected the completed container from
          validated coordinates and a branded work-unit slug without changing tree recognition or sidecar counting.

    - `[x]` **3.4.b Route archive artifacts and closeout sidecars through semantic addresses**
        - Projected completed meta artifacts and leaf/parent cohort closeout documents from allocated coordinates and
          validated cohort tuples while preserving membership, triggers, exact sources, and transition effects.

    - `[x]` **3.4.c Route planned cohort-document lookup through layout**
        - Parsed one- and two-segment cohort fields into branded coordinates and projected planned cohort documents,
          retaining exact active-meta reads, existence checks, and null-on-miss behavior.

- _Outcome:_ Archive allocation and lifecycle judgment remain with their established owners while completed WU and
  cohort-document naming now has one semantic projection authority across allocation, closeout, and session init.

### `[x]` **3.5 Preserve exact paths and carry semantic operands separately for `arc view`**

- _Goal:_ Lifecycle records and configured pointers remain authoritative while conventional viewing receives the
  branded identity and structured placement it needs without reverse-parsing those paths or changing the
  agent-facing session envelope.

    - `[x]` **3.5.a Lock lifecycle-index exact-path authority**
        - Kept caller-supplied record paths authoritative and the pathless lifecycle fallback synthetic, with explicit
          coverage for custom active, nested backlog, and coordinate-bearing archived paths.

    - `[x]` **3.5.b Carry semantic active candidates without changing the session envelope**
        - Added an internal active result carrying branded slugs and project/contributor placements alongside exact
          candidates; the public session envelope is projected separately and remains byte-identical.

    - `[x]` **3.5.c Add branded identity and structured placement to resolved view targets**
        - Added kernel `Slug` and layout-owned `WorkUnitPlacement` to resolved targets; ambient view consumes internal
          active semantics and explicit view validates record slug/cohort fields while preserving exact pointers.

    - `[x]` **3.5.d Resolve only conventional view siblings from placement**
        - Preserved exact meta and configured task-list pointers while projecting conventional task, spec, draft, and
          notes fallbacks from placement, with a custom meta path proving no directory inference remains.

    - `[x]` **3.5.e Lock cross-boundary behavior with integration tests**
        - Covered project and contributor active semantics, standalone and nested backlog targets, invalid operands,
          exact lifecycle/configured pointers, unchanged session JSON, and unsupported completed viewing.

- _Outcome:_ `arc view` now carries semantic coordinates separately from exact discovery and pointer evidence, so
  conventional fallback projection is canonical without altering the stable session-init wire contract.

## **Phase 4:** Remaining resolver consumers and compatibility coverage

_Purpose:_ Complete semantic adoption across root, procedure, readiness, and template surfaces while retaining
independent evidence and subsystem-owned descendant policy.

_Design decisions:_ Only an owner holding a repository root projects and materializes `arc-root`; an exact `arcDir`
parameter remains authoritative downstream. Project-root discovery, package-template roots, shell-hook literals,
scanner patterns, fixtures, prose examples, and golden strings stay outside layout and receive explicit residual
dispositions in Phase 5.

### `[x]` **4.1 Migrate installer and configuration root owners**

- _Goal:_ Installation and configuration entry points select `.arc` through one validated root projection while
  downstream helpers continue consuming their exact caller-supplied installation directory.

    - `[x]` **4.1.a Replace the root-bearing config segment helper**
        - Replaced the root-bearing constant with an ARC-root-relative config suffix and materialized the semantic
          root in both configuration readers without changing their read contracts.

    - `[x]` **4.1.b Migrate fresh-install root selection**
        - Materialized the selected ARC directory beneath the supplied repository root and retained the exact result
          through manifest, permission, existence, and post-init boundaries.

    - `[x]` **4.1.c Migrate join root selection**
        - Applied the same root boundary to installation detection and the downstream join directory while preserving
          Git, setup, identity, joined-tree, and already-installed behavior.

    - `[x]` **4.1.d Migrate update root selection**
        - Materialized the update root once and kept manifest, pristine-store, merge, and removal descendants local.

    - `[x]` **4.1.e Migrate reconfigure root selection**
        - Materialized the reconfigure root while retaining mode selection, removal planning, and manifest behavior.

    - `[x]` **4.1.f Migrate health root selection**
        - Materialized the health root and retained exact manifest and installed-file descendants and display strings.

    - `[x]` **4.1.g Migrate diff root selection**
        - Materialized the diff root and retained exact manifest, pristine, and current-file comparison descendants.

    - `[x]` **4.1.h Migrate commit-check repository binding**
        - Materialized the discovered repository's ARC root before config and artifact-resolver composition, preserving
          commit decoding, merge detection, and resolver behavior.

    - `[x]` **4.1.i Migrate init-handler internal-store binding**
        - Materialized the ARC root before composing the internal manifest store without changing diagnostics or mode
          selection.

    - `[x]` **4.1.j Migrate release record roots**
        - Anchored audit-log and release-marker identity descendants at a materialized ARC root while retaining exact
          filenames, current-worktree selection, append, cleanup, and error behavior.

    - `[x]` **4.1.k Migrate constitution status root selection**
        - Materialized the ARC root before composing the rules suffix, preserving filtering and output behavior.

    - `[x]` **4.1.l Preserve root recognition and package-source boundaries**
        - Kept project discovery, exact downstream roots, package templates, shell hooks, validation patterns,
          fixtures, and display prose under their existing recognition or external-evidence authorities.

- _Outcome:_ Repository-root owners now select `.arc` through one validated projection/materialization boundary,
  while every downstream subsystem continues to receive and own the exact installation directory it already used.

### `[x]` **4.2 Migrate actual runtime procedure-root consumers**

- _Goal:_ Runtime workflow lookup starts from the semantic procedure root while package-source enumeration,
  validation, and exact workflow pointers retain their existing authorities.

    - `[x]` **4.2.a Project workflow roots in the session load set**
        - Projected the workflow procedure root before appending closed planning, execution, or integration
          descendants, preserving load order and every exact status-supplied pointer.

    - `[x]` **4.2.b Project the workflow scan root for extension status**
        - Materialized the workflow procedure root for full extension status while preserving extension ownership,
          enumeration, orphan interpretation, and the session-init no-scan fast path.

    - `[x]` **4.2.c Preserve non-runtime procedure-root evidence**
        - Left template classification, caller-supplied system roots, dual-copy validators, shell hooks, and exact
          workflow pointers under their existing non-runtime authorities.

- _Outcome:_ Actual repository workflow consumers now use the semantic procedure root, while procedure recognition,
  package-source enumeration, and exact pointer evidence remain independent oracles for the final ledger.

### `[x]` **4.3 Migrate project-readiness document consumers by role**

- _Goal:_ Semantic readiness writers use the project-document address while status policy, exact Git evidence, and
  basename recognition preserve their stronger local contracts.

    - `[x]` **4.3.a Derive the status-domain readiness path from layout**
        - Derived the exported status-owned `ROADMAP_PATH` from the project-document address while preserving its
          managed-path type, remediation text, staged-index reads, marker checks, and independent diagnostics.

    - `[x]` **4.3.b Preserve status remedy and reconciliation consumers**
        - Kept the remedy and base-drift adapters on the status-owned path, materializing only the remedy's worktree
          write while leaving conflict policy, exact staged evidence, Git operands, and messages unchanged.

    - `[x]` **4.3.c Migrate lifecycle readiness regeneration**
        - Projected and materialized the readiness document beneath the supplied repository root while retaining the
          existing render, newline, parent-directory, native staging, and degraded-advisory behavior.

    - `[x]` **4.3.d Migrate start-handler readiness staging**
        - Reused one semantic readiness path for start-ceremony writes and exact staging, preserving active-meta order,
          Git arguments, and literal handler and integration expectations.

    - `[x]` **4.3.e Migrate direct-retirement readiness evidence**
        - Projected the exact blob, operation, staging, restore, and allowed-path operand; literal tests now cover
          changed-present, deleted, and unchanged readiness blobs without consulting the resolver.

    - `[x]` **4.3.f Migrate decompose-retirement readiness evidence**
        - Confirmed the decompose projection uses the semantic project document in its exact allowed set, preserving
          the placement and pointer boundaries established with its retirement migration.

    - `[x]` **4.3.g Migrate park-landing readiness evidence**
        - Confirmed park landing recognizes its one permitted readiness operation through the semantic project
          document while retaining exact diff evidence, policy, and literal accepted/rejected matrices.

    - `[x]` **4.3.h Migrate the review-gate lifecycle adapter**
        - Projected the lifecycle-tail readiness operand without changing exact changed-file evidence, lifecycle
          interpretation, Git behavior, or the adapter's literal unit expectations.

    - `[x]` **4.3.i Preserve readiness recognition and external evidence**
        - Preserved basename exclusion, status prose, hook mechanics, fixtures, and golden CLI strings as independent
          recognition/evidence; remaining readiness-name hits stay assigned to the Phase 5 ledger.

- _Outcome:_ Readiness consumers now share one semantic managed path and cross into native paths only for writes,
  while Git evidence, policy comparisons, basename recognition, diagnostics, and golden strings remain independent.

### `[x]` **4.4 Migrate template-output consumers without coupling source and destination roles**

- _Goal:_ Init and manifest planning share the validated suffix transform while rendering classification,
  provenance, and destination policy keep their established roles.

    - `[x]` **4.4.a Retire the parallel template-output helper**
        - Removed the internal parallel transform and its classification-owned tests; render/copy classification
          remains source-based, while the layout contract retains the transform matrix and branded output proof.

    - `[x]` **4.4.b Adopt the transform in fresh installation**
        - Fresh installation now validates every enumerated source before effects and uses the shared transform only
          for destinations, preserving source identity for classification, rendering, and manifest provenance.

    - `[x]` **4.4.c Adopt the transform in manifest planning**
        - Manifest planning validates source identities before constructing output maps and file-set diffs, retaining
          template provenance and existing update/apply behavior while rejecting unsafe enumerated inputs.

- _Outcome:_ Installation and update planning now share one validated binding transform without conflating package
  source identities, transformed destinations, rendering policy, classification, or manifest provenance.

### `[x]` **4.5 Preserve independent oracles and representative compatibility**

- _Goal:_ Cross-module evidence demonstrates unchanged valid behavior without reimplementing earlier unit coverage
  or turning the resolver into its own oracle.

    - `[x]` **4.5.a Exercise installation-root integrations**
        - Fresh install now explicitly proves literal outputs land beneath a supplied temporary repository distinct
          from ambient `cwd`; existing update and reconfigure integration/E2E cases remain green on literal paths.

    - `[x]` **4.5.b Exercise procedure-load integration**
        - Confirmed planning, execution, and integration load-set projections against independently authored workflow
          entries, including ordering, task-list slicing, and exact caller-supplied pointers.

    - `[x]` **4.5.c Exercise readiness integration**
        - Reused the real-Git archive transition to prove byte-stable readiness regeneration and the literal staged
          project-document operand, alongside the focused lifecycle cases established in Phase 3.

    - `[x]` **4.5.d Exercise template install/update integration**
        - Validated templated and copy-as-is install/update flows with literal destinations and source provenance;
          real-filesystem cases reject unsafe init and update inputs before creating or mutating installed files.

    - `[x]` **4.5.e Prove package and architecture compatibility**
        - Build metadata includes the public layout barrel with no dependency-manifest change, kernel schema output
          remains vocabulary-only, and architecture tests enforce both barrel-only consumers and the pure layout graph.

- _Outcome:_ Representative unit, integration, E2E, build, schema, and architecture evidence closes compatibility
  without making the resolver an oracle for literal destinations, Git operands, persisted bytes, or workflow entries.

## **Phase 5:** Deterministic migration proof and residual ownership

_Purpose:_ Bind the final indexed tree to a complete, reproducible disposition ledger and prove every selected
layout hit has exactly one semantic owner.

### `[x]` **5.1 Define the class-inventory and migration-ledger proof contracts**

- _Goal:_ The migration proof has a strict versioned data model and unambiguous canonical digest recipes for its
  disposition-independent source evidence and selected class-hit sets.

    - `[x]` **5.1.a Extract the deterministic class-inventory scan**
        - Added canonical disposition-independent class-inventory projection and composed the full scan from the same
          state, preserving duplicate-path checks, class evidence, report inputs, and stale-disposition failures.

    - `[x]` **5.1.b Add the version-1 ledger schemas and closed disposition vocabulary**
        - Added strict source, predicate, exact, bulk, and ledger schemas with the fixed fifteen-class tuple, seven
          dispositions, canonical identifiers, uniqueness checks, owners, reasons, and no public layout export.

    - `[x]` **5.1.c Implement class-aware hit-set hashing**
        - Added non-empty class-aware tuple hashing with strict class/digest validation, duplicate rejection, canonical
          byte ordering, and no implicit dedupe; fixed vectors freeze artifact-LF and set/value-no-LF recipes.

- _Outcome:_ The final migration proof now has a disposition-independent canonical source inventory and strict,
  class-aware ledger contracts without weakening the historical audit's candidate/disposition behavior.

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
