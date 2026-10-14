# Task List: Retire extension points

- **Design:** `spec-retire-extension-points.md`

---

## **Phase 1:** Method and domain-rule validation prerequisites

_Purpose:_ Remove checks that would obstruct retirement while retaining the independent method and domain-rule gates.

_Mode:_ `layer` — closes on validation that no longer requires extension files or workflow fire points.

_Exit criterion:_ Method and domain-rule validators and method coverage pass without extension validation or coverage.

### `[x]` **1.1 Retire extension validators and hook branches — D4, D7**

- _Goal:_ Commit hooks continue validating methods and domain rules with no dependency on extension validation.

- _Outcome:_ Removed the marker validator and both hook invocations; frontmatter and package neutrality now
  select surviving methods and domain rules. Recorded the full retrieval revision and verified its source loci.

### `[x]` **1.2 Narrow trigger coverage to methods — D4**

- _Goal:_ Workflow validation retains method graph and coverage guarantees without requiring extension declarations
  or push fire points.

- _Outcome:_ Method enumeration, direct/transitive coverage, dependency diagnostics, and wiring-pending checks now
  operate without an extension directory or push contract. Declaration parsing remains until the workflow sweep
  closes.

## **Phase 2:** Runtime and session contract retirement

_Purpose:_ Remove the runtime mechanism and its session consumers while preserving locus and checkpoint authority.

_Mode:_ `slice` — closes on exercisable session, recovery, CLI, and checkpoint contracts without extension inputs.

_Exit criterion:_ Public status/recovery and schema discovery omit the mechanism, and preserved locus and checkpoint
scenarios pass against the revised contracts.

### `[x]` **2.1 Remove active-name inputs from locus and load-set composition — D2**

- _Goal:_ Exact locus, recovery, and workflow projections depend only on surviving session inputs.

- _Outcome:_ Removed active-name arguments from locus, recovery, load-set, and seed composition while retaining
  their exact subject/workflow projections. Renamed the mixed subject-projection suite. Removed the handoff probe
  early because its only consumer was the retired input.

### `[x]` **2.2 Remove extension probes and session dispatch — D2, D3**

- _Goal:_ Public session/status/recovery results and their agent consumers have no extension probe or active-set contract.

- _Outcome:_ Removed extension slots, callbacks, formatting, discovery registration, and seed inputs. Strict
  envelopes reject the obsolete field; seven fixtures retain surviving scenarios. Session dispatch is removed and
  its renumbered templates, contributor guidance, and probe references are rendered consistently.

### `[x]` **2.3 Remove the extension CLI and exclusive modules — D1, D2, D8**

- _Goal:_ The retired command, parser, and scanners have no reachable registration, importer, or executable surface.

- _Outcome:_ Removed command/help/input registration, the exclusive parser/scanners and runtime modules, and five
  exclusive suites. The public CLI rejects the command; surviving navigation, discovery, frontmatter, traversal, and
  load-set checks remain covered. Pruned the deleted handler baseline through the whole-project path.

### `[x]` **2.4 Remove checkpoint reports and final-head hook firing — D2, D3**

- _Goal:_ Final-head integration approval retains complete machine evidence and mutation prohibitions without a hook report.

- _Outcome:_ Removed the strict checkpoint report field and both final-head dispatch/rendering steps. The nine-
  signal machine surface, exact-head admission, host-review requirements, integration authorization, and WU/Errand
  mutation prohibitions remain intact.

### `[x]` **2.5 Exercise revised runtime contracts — D2, D8** — validate exit criterion at segment scope

- _Goal:_ The runtime segment is demonstrated through public results and surviving locus/checkpoint scenarios.

- _Outcome:_ Exercised public command/schema absence and session-init/recovery envelopes in disposable CLI fixtures;
  dirty-checkout recovery retained its refusal. Focused session, locus, load-set, compaction, schema, and checkpoint
  suites demonstrated preserved workflow selection, recovery transitions, complete machine evidence, and exact-head
  admission.

## **Phase 3:** Workflow retirement with preserved lifecycle rules

_Purpose:_ Exhaust the remaining workflow families without weakening PR creation, review, or lifecycle stops.

_Mode:_ `replication` through Phase 5 — closes on the complete live mechanism surface removed and batch-verified.

### `[ ]` **3.1 Retire PR hooks while preserving exact-target review — D3, D8**

- _Goal:_ PR creation, reuse, and review retain exact target authority after every PR hook is removed.

- _Note:_ See `notes-retire-extension-points.md` § Workflow and validator map.

    - In `integrate-work-unit` and `run-errand`, remove `proposedChangeRequest` and pre-create action blocks while
      preserving resolver dispatch, binding, merge-lock routing, and immediate pre-create `--require-remote` replay.
    - Remove the WU's hook-only `openedChangeRequest`; preserve binding to the resolver's open PR and typed Candidate
      and review targets. Retain the Errand payload, refresh after head movement, and planning-grooming target equality.
    - Remove all remaining PR/push hook qualifications, declarations, markers, and links from these workflows.
    - Rename `__tests__/integration/pr-open-extensions.test.ts` for the surviving PR lifecycle subject and update
      `local-vitest-runner.ts` routing. Keep mixed review-gate packaging coverage of surviving behavior.
    - Build `test-first` (one behavior at a time):
        - Creation still refuses an incorrect remote head; reuse/reopen/create dispatch binds the current exact PR.
        - Publication/lane ordering, review contracts, and Errand planning-grooming equality/refresh remain enforced.
        - Push authorization, release routing, approved review fixes, and final-head stops survive hook deletion.

### `[ ]` **3.2 Retire planning, task, and commit fire points — D3, D8**

- _Goal:_ Planning, task execution, and commit preparation retain their core procedures and stops without extension dispatch.

    - Sweep `draft-design`, `create-spec`, `generate-tasks`, `process-task-loop`, `prepare-commits`, and canonical
      `arc-commit` / `arc-task-review` skill content in package source and installed copies.
    - Remove declarations, action calls, markers, workflow-wide push contracts, caller-repeat instructions, hook-only
      skips/qualifiers, and link definitions. Preserve method fire-point loading, task/workflow review stops,
      commit/push approval, release routing, and independent recovery rules.
    - Render affected templates with the repository's configuration and refresh derived harness skill copies.
      Update existing workflow/packaging assertions with their changed contracts; add no tests that merely echo prose.

### `[ ]` **3.3 Retire lifecycle and setup fire points and repair citations — D3, D6, D8**

- _Goal:_ Lifecycle and setup procedures retain all independent transitions and references after numbered hook steps disappear.

    - Sweep activation/archive, init/deactivate/park/reopen/resume/decompose/delivery/handoff lifecycle paths and other
      workflow callers. Preserve transition prerequisites, absorption/cohort/ROADMAP work, review stops, and push rules.
    - Remove external setup's tracker-notify step and external-content integration's extension-adaptation substep;
      keep `Origin` linkage and independent setup/capture procedures.
    - Renumber/reletter activation, archive, and external setup/integration successors. Resolve local and cross-file
      `Step N` / `§ N` citations and heading links by target meaning, including the stale archival-commit citation.
    - Include workflow templates, contributor/companion documents, session-operations/work-organization references,
      and source comments; complete the live `arc.extensions` declaration sweep before Task 4.1.

## **Phase 4:** Installation membership and structural cleanup

_Purpose:_ Close the accepted workflow grammar and remove installed membership while proving unchanged update retention.

### `[ ]` **4.1 Reject retired workflow declarations — D4**

- _Goal:_ The workflow grammar admits surviving method declarations and rejects any leftover extension key.

    - Confirm no live packaged/installed workflow declaration remains; then remove `extensions` from
      `WORKFLOW_ARC_FRONTMATTER_FIELDS`, `WorkflowDeclarations`, and `parseWorkflowFrontmatter` results/array parsing.
    - Preserve `METHOD_ARC_FRONTMATTER_FIELDS`, method dependency parsing, and all surviving shape diagnostics.
    - Build `test-first` (one behavior at a time):
        - `arc.extensions`, even an empty array, reports an unknown workflow frontmatter field.
        - Valid methods, malformed/unknown method declarations, transitive graph coverage, and method schema rules
          retain their existing outcomes.
    - Run the mixed audit unit suite and `npm run -s lint:arc:triggers` over the real corpus.

### `[ ]` **4.2 Narrow integrity, check inputs, and audit routing — D4, D8**

- _Goal:_ Integrity, sensitive-content selection, and routing no longer require the retired directory while retaining
  every independent check.

- _Note:_ See `notes-retire-extension-points.md` § Installation and structural map.

    - Remove extension directory/frontmatter requirements from both `verify-integrity.sh` copies and integrity workflow
      instructions. Keep method validation and update the mixed integrity fixtures.
    - Remove extension-root table inputs from `.arc/system/arc-checks.yml` and patterns from `CODE_SURFACE_GLOBS` and
      `PACKAGED_CONTENT_SENSITIVE_GLOBS` in `change-facts.ts`; keep sensitive surviving packaged-content detection.
    - Remove `extension-root` and `arc-extensions-key` from the live coupling manifest; trim their `classIds`,
      `classEvidence`, `evidenceAnchors`, and `reportAnchors` from the mixed routing packet. Retain its six surviving
      classes and all unrelated packets.
    - Regenerate the affected packet's `id` and `contentDigest` using the existing canonical rules, preserving its
      historical `resultDigest` binding; validate with `parseRoutingLedger`. Change no check ID, deadline, or CI routing.
    - Build `test-first` (one behavior at a time):
        - Integrity succeeds without the directory and still rejects malformed surviving method structure.
        - `isCodeSurfacePath` / `isPackagedContentSensitivePath` retain method and other sensitive-content selection.
        - `parseRoutingLedger` accepts the narrowed packet with regenerated identity/digest and surviving routing intact;
          stale packet identity or content digest is rejected.

### `[ ]` **4.3 Remove extension files and installation membership — D1, D5, D8**

- _Goal:_ Fresh installations omit the directory and old installations retain only unmanaged Configurable residue.

- _Note:_ See `notes-retire-extension-points.md` § Installation and structural map.

    - Delete all eleven extension documents and README from package source and `.arc/` together with all twelve recipe
      paths, eleven `CONFIGURABLE_FILES` entries, and their self-hosted manifest keys. Preserve other manifest metadata.
    - Keep `buildChangePlan` and `applyChangePlan` unchanged; regenerate local derived state only as needed for manual
      package/render synchronization. Do not run `arc update` in this repository or add migration machinery.
    - Update mixed init/update/framework-sync tests; replace current-support assertions with absence/retention checks.
    - Build `test-first` (one behavior at a time):
        - Every supported `pm.mode` × `team.mode` recipe arm installs/records no extension path or directory.
        - An old manifest classifies eleven edited Configurable documents for retention and README for deletion;
          the resulting manifest and pristine store contain none of the twelve paths.
        - A subsequent update succeeds, leaves retained content untouched, and does not rediscover or read the residue.
        - Surviving method installation and rendered Framework/package agreement remain correct.

## **Phase 5:** Supported guidance, architectural record, and corpus closure

_Purpose:_ Make the supported customization boundary accurate and preserve the retired contracts as historical knowledge.

_Exit criterion:_ The live-reference and citation sweeps are exhausted under the closed allowlist; package rendering,
recipe membership, mixed contract coverage, and the historical event inventory agree.

### `[ ]` **5.1 Describe supported customization and external-PM boundaries — D6**

- _Goal:_ Current guidance names only supported customization channels and makes the insertion/notification gap explicit.

    - Update customization, session-operations, workflow-authoring, team-coordination, planning-module, and
      file-classification strategies; rules, briefs, indices, templates, methods/self-review guidance, and directory
      READMEs. Remove activation/loading/reserved-name/format/dispatch claims and dangling extension links.
    - Retain config, check declarations, method overrides, QUICK-REFERENCE commands, and project strategy/workflow/
      domain-rule channels. Preserve method fire-point declarations/loading and harness-native lifecycle hooks.
    - Keep the task-list checkbox and planning checkpoint convention rows; set their Configurability Path to **None**,
      remove the **Extension** definition, and add **None — the convention has no supported customization path**.
    - State that project workflows may run beside ARC workflows and use methods; claim no supported insertion or
      tracker-notification route. Add no planned replacement or internal work-unit pointer to shipped content.
    - Render Framework counterparts and target Configurable sections without overwriting project overrides.

### `[ ]` **5.2 Update internal inventories and recipe-derived counts — D6**

- _Goal:_ Current project and root-package descriptions agree with the implemented boundary and recipe-derived membership.

- _Note:_ See `notes-retire-extension-points.md` § Guidance, history, and final sweeps and
  § Installation and structural map.

    - Amend all four D6 loci in `strategy-pm-composition-evolution.md`, preserving provider authority, capability levels,
      typed integration, explicit failure, and standalone/composed independence. Use the settled interim-boundary text.
    - Update storage/procedure machinery inventories, including the point-scanner implication, `PROJECT-PRD.md`,
      `TECHNICAL-OVERVIEW.md`, package-project sync inventory, and root `README.md`.
    - Re-derive file/classification counts with `resolveFileList`, `classifyFile`, and the installed manifest; preserve
      conditional-arm and template membership accuracy. Keep unrelated generic extensibility and platform-hook senses.
    - Leave `docs/`, `mkdocs.yml`, sibling planning artifacts, and the storage-coupling register untouched.

### `[ ]` **5.3 Record the superseding ADR and event contracts — D7**

- _Goal:_ Architectural history preserves the complete retired event contracts and retrievable source without exposing
  a supported callable interface.

- **Additional Context:** `notes-retire-extension-points.md` § Retrieval revision; `template-adr.md`;
  `strategy-adr-methodology.md` § ADR Lifecycle and § Amending Accepted ADRs.

    - Resolve the next unused ADR number and document the settled retirement with the full pre-removal revision
      recorded in Task 1.1 and recoverable source paths; verify retrieval from that revision.
    - Inventory all eleven D7 events with placements, naming/frequency, authored order, failure/continuation behavior,
      augmentation limits, retry/idempotence, ready-head constraints, both opaque payloads, and caller/adapter authority.
    - Distinguish `pre-push-review`'s wrapper-wide promise from `auditPushExtensionCoverage`'s actual workflow enforcement.
      State the accepted customization/notification gap without reserving names or promising a replacement format/date.
    - Follow ADR acceptance/supersession conventions. Update only the specified ADR-003/008/013/009 status metadata,
      retaining prior annotations and all historical bodies; leave Proposed ADR-020 and other ADRs unchanged.

### `[ ]` **5.4 Close the live-reference and citation sweeps — D1, D3, D8**

- _Goal:_ Every remaining live mechanism reference and affected citation is resolved under the specification's closed
  corpus and sense allowances.

- _Note:_ Use `spec-retire-extension-points.md` § Reference-sweep corpus and closed allowlist exactly;
  `notes-retire-extension-points.md` § Guidance, history, and final sweeps gives implementation pointers.

    - Run the case-insensitive `extension` sweep, nine distinctive event-name searches, qualified `pre-merge` /
      `pre-activation` searches, all named runtime identifiers, and the two integration workflows' `hook` sense checks.
    - Independently search workflow-name-plus-step/section citations, bare local references, companion/source comments,
      and heading-slug links. Repair missed live sites against their intended post-removal target meanings.
    - Follow importers, registries, helpers, positive fixtures, and mixed assertions beyond the initial inventory;
      retain useful non-mechanism coverage. Delete no whole mixed suite or allowlist category by convenience.
    - Preserve legacy quality-hook extraction, suffix/parser/registry terminology, ordinary typed-interface and
      injected-capability augmentation, mechanically unchanged Candidate selection/endpoint extension, generic probe
      composition, and harness-native hooks.
    - Preserve hosted-review wait-duration extension, external CLI add-ons, optional data-schema fields, domain-rule
      additions, ordinary sample feature/API growth, and PM-mode module composition within the spec's bounded non-hook
      senses. Any additional allowed sense requires an explicit spec correction before acceptance.

### `[ ]` **5.5 Verify complete retirement — D1, D4, D5, D6, D7, D8** — validate exit criterion at segment scope

- _Goal:_ The complete transformation is exhausted and its installation, workflow, and history seams agree.

    - Run `npx arc check segment`; verify the completed reference/citation sweeps and package/render agreement.
    - Exercise the six recipe arms, old-manifest retention/second-update path, preserved mixed PR/readiness contracts,
      method/domain-rule validation, and unknown-field rejection through the relevant existing suites.
    - Verify eleven historical events, both payloads, full retrieval revision, and exactly four scoped status edits;
      verify installed manifest membership and inventory counts independently of prose estimates.
    - Record executed scenarios/results. Keep cleanup work in Task 5.4 or a revision parent before this verifier.

## **Phase 6:** Verification

_Purpose:_ Verify the work unit against its acceptance criteria and required quality gates.

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ All work-unit acceptance criteria and required checks have evidence, with any unresolved result accurately
  reported before integration.

---

## Success Criteria

- `[ ]` The live corpus sweeps under the spec's exclusions and closed allowlist find no supported mechanism file,
  activation/declaration/marker/action, command, scanner, validator, importer, registry entry, or positive execution fixture.

- `[ ]` Public full status/session-init/recovery outputs omit `extensions`; handoff/locus/load-set/recovery/seed inputs
  omit `activeExtensions`; schema discovery omits `extensions-session-init`; the CLI lacks `arc extensions`.

- `[ ]` The checkpoint surface omits `extensionReport` while preserved tests prove complete `machineEvidence`, exact-head
  authorization, and merge admission, including the independent final-head mutation prohibitions.

- `[ ]` Every supported recipe arm installs no extension directory or manifest entry; an old manifest retains edited
  Configurable documents, deletes README, drops all managed/pristine membership, and succeeds on a subsequent update
  without reading or changing retained residue.

- `[ ]` `parseWorkflowFrontmatter` rejects `arc.extensions`; method parsing/graph/coverage, package-method neutrality,
  domain-rule validation, and both commit hooks remain functional with no removed script invocation.

- `[ ]` Preserved mixed PR lifecycle tests prove exact remote-head validation before creation, resolver reuse/binding,
  publication/review ordering, and Errand `openedChangeRequest` refresh/equality with the planning-grooming target.

- `[ ]` Supported guidance retains all surviving customization channels, both convention rows with **None**, harness-native
  hooks, and `Origin` linkage, while claiming no workflow-step insertion or tracker notification through the mechanism.

- `[ ]` The superseding ADR preserves eleven events, naming/frequency, failure/continuation, payload/authority and retry/
  ready-head contracts, and a retrievable full pre-removal revision; exactly four scoped status edits preserve existing
  annotations and historical bodies.

- `[ ]` Every affected step/section citation and heading link resolves by target meaning; rendered Framework content
  agrees with package source; self-hosted manifest keys and inventory counts agree with recipe-derived membership.

- `[ ]` All required quality gates pass, including Markdown, source/test types, method-trigger coverage, applicable
  test tiers, and build, with no new suppression, skipped gate, or deadline change.

- `[ ]` Ready for integration with the intended scope complete and acceptance evidence recorded.

---
