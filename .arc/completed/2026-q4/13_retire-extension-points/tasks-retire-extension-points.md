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

### `[x]` **3.1 Retire PR hooks while preserving exact-target review — D3, D8**

- _Goal:_ PR creation, reuse, and review retain exact target authority after every PR hook is removed.

- _Outcome:_ Retired PR/push dispatch, proposed creation payloads, and the WU hook-only opened payload. Preserved
  immediate remote-head replay, resolver binding, merge locks, and Errand payload refresh/adapter equality. Renamed
  the mixed PR-lifecycle suite and routing, removed exclusive fixtures, and retained review, publication, reuse, and
  final-head checks.

### `[x]` **3.2 Retire planning, task, and commit fire points — D3, D8**

- _Goal:_ Planning, task execution, and commit preparation retain their core procedures and stops without extension dispatch.

- _Outcome:_ Removed spec-review, task-completion, and pre-commit dispatch from workflows and canonical skills,
  including hook-only skips and qualifications. Method loading, review stops, release routing, recovery, and
  delivery correction ordering remain covered. Rendered the changed source templates and refreshed derived harness
  skills.

### `[x]` **3.3 Retire lifecycle and setup fire points and repair citations — D3, D6, D8**

- _Goal:_ Lifecycle and setup procedures retain all independent transitions and references after numbered hook steps disappear.

- _Outcome:_ Removed remaining lifecycle/setup declarations and firing instructions, retaining transitions,
  push/review/merge controls, and tracker capture/method customization. Renumbered activation/archive and external-
  content/setup steps; repaired local, cross-file, and contributor citations by target meaning. Synchronized
  installed and static counterparts and preserved mixed release/reconcile coverage.

## **Phase 4:** Installation membership and structural cleanup

_Purpose:_ Close the accepted workflow grammar and remove installed membership while proving unchanged update retention.

### `[x]` **4.1 Reject retired workflow declarations — D4**

- _Goal:_ The workflow grammar admits surviving method declarations and rejects any leftover extension key.

- _Outcome:_ Closed workflow frontmatter to method declarations and removed extension fields from parse results.
  Empty, populated, and malformed obsolete declarations now report an unknown field; surviving method shapes,
  activation registry, dependency graph, and real-corpus coverage remain valid.

### `[x]` **4.2 Narrow integrity, check inputs, and audit routing — D4, D8**

- _Goal:_ Integrity, sensitive-content selection, and routing no longer require the retired directory while retaining
  every independent check.

- _Outcome:_ Narrowed integrity to method structure, removed retired check/classification inputs, and trimmed the
  live audit corpus and two extension-only classes. The mixed packet retains six classes with regenerated
  identity/digest and its historical result binding; unrelated packets remain unchanged. Preserved malformed-method
  rejection, surviving sensitive paths, and stale-packet refusals.

### `[x]` **4.3 Remove extension files and installation membership — D1, D5, D8**

- _Goal:_ Fresh installations omit the directory and old installations retain only unmanaged Configurable residue.

- _Outcome:_ Removed all twelve packaged and installed files, recipe/classification entries, and managed manifest
  keys. Fresh installations omit the directory in all supported recipe arms; legacy updates retain edited
  Configurable documents unmanaged, delete the README, and neither read nor rediscover residue on later updates. The
  updater remains unchanged.

## **Phase 5:** Supported guidance, architectural record, and corpus closure

_Purpose:_ Make the supported customization boundary accurate and preserve the retired contracts as historical knowledge.

_Exit criterion:_ The live-reference and citation sweeps are exhausted under the closed allowlist; package rendering,
recipe membership, mixed contract coverage, and the historical event inventory agree.

### `[x]` **5.1 Describe supported customization and external-PM boundaries — D6**

- _Goal:_ Current guidance names only supported customization channels and makes the insertion/notification gap explicit.

- _Outcome:_ Revised supported customization guidance to config, checks, method overrides, commands, and project
  content channels. Preserved method loading, native hooks, both conventions with None, and Origin linkage; made
  workflow insertion and tracker-notification gaps explicit. Rendered Framework copies and preserved Configurable
  overrides. One approved historical link now retrieves its unchanged target at the pre-removal revision.

### `[x]` **5.2 Update internal inventories and recipe-derived counts — D6**

- _Goal:_ Current project and root-package descriptions agree with the implemented boundary and recipe-derived membership.

- _Outcome:_ Updated all four external-PM composition loci and the storage/procedure, PRD, technical overview, and
  root-package descriptions. Preserved provider authority, distinct capability levels, typed integration/failure,
  and standalone/composed independence. Re-derived all six recipe arms and confirmed the installed 103 Framework, 35
  Configurable, and 4 Scaffolded records agree; membership inventory was synchronized with file removal.

### `[x]` **5.3 Record the superseding ADR and event contracts — D7**

- _Goal:_ Architectural history preserves the complete retired event contracts and retrievable source without exposing
  a supported callable interface.

- _Outcome:_ Added accepted ADR-038 with all eleven event contracts, frequency/naming, authored-order
  failure/continuation rules, augmentation limits, request payloads and adapter authority, ready-head constraints,
  and the full retrievable pre-removal revision. Distinguished the push file promise from workflow-audit
  enforcement; updated exactly four scoped status fields while preserving prior annotations and all historical
  bodies.

### `[x]` **5.4 Close the live-reference and citation sweeps — D1, D3, D8**

- _Goal:_ Every remaining live mechanism reference and affected citation is resolved under the specification's closed
  corpus and sense allowances.

- _Outcome:_ Exhausted live mechanism and independent citation/heading sweeps. Removed stale active-set source
  comments and test descriptions, corrected active-artifact step citations, and preserved only closed non-mechanism
  senses, negative assertions, and bounded legacy residue/extraction. The approved research amendment preserves
  eight unrelated occurrences; all 386 same-file fragment links across 274 Markdown files resolve, including top-of-
  page links.

### `[x]` **5.5 Verify complete retirement — D1, D4, D5, D6, D7, D8** — validate exit criterion at segment scope

- _Goal:_ The complete transformation is exhausted and its installation, workflow, and history seams agree.

- _Outcome:_ Exercised all six fresh-install arms, old-manifest retention and unread second-update residue, rendered
  Framework agreement, mixed PR/readiness contracts, method/domain-rule validation, and unknown-field rejection
  through eleven existing suites. Verified all eleven event contracts and both payloads at the full retrieval
  revision, exactly four status-only ADR edits with unchanged bodies, twelve removed managed keys with unrelated
  metadata preserved, and recipe-derived counts. Reference/citation and heading sweeps close without unresolved live
  sites.

## **Phase 6:** Verification

_Purpose:_ Verify the work unit against its acceptance criteria and required quality gates.

### `[x]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ All work-unit acceptance criteria and required checks have evidence, with any unresolved result accurately
  reported before integration.

- _Quality gates:_ All 17 selected local merge checks passed: table formatting, staged/full Markdown lint, method
  triggers, domain rules, section references, links, source lint, source/test types, shell lint, package sync, build,
  full unit/integration suites, and ARC contracts. Selected local E2E feedback also passed. Full E2E and portability
  gates remain CI-only and were not selected by the local merge request.
- _Success criteria:_ Eleven met, zero superseded, zero unresolved; the obsolete implementation-planning notes were
  removed. The primary walk and fresh adversarial companion found no remaining acceptance gap.
    - _Scope:_ work-unit; `Success Criteria` ordinals 1–11. Criterion digests exclude checkbox markers and fold
      whitespace without changing the criterion text.
    - _Span:_ complete diff from `b902b2bd70ea831936bc01e3f06d7887013cad24` through
      `6c438bebd05bc77d06208aea5db38cbd96bd2d32`, plus these verification records and obsolete-notes removal;
      reachability is the complete checkout at that head with those terminal documentation edits. No boundary-order
      deviation applies.
    - _Advisory companion:_ Pass 1 of 2; zero findings; stop reason `converged`. No successor pass was requested.
    - _Criterion:_ `Success Criteria > 1`; _criterion-digest:_
      `sha256:935c401aeed9355fcc3984987214dca0ca9f530625cfb6b319e7e30850679ec4`; _State:_ `[x]`; _Evidence:_
      case-insensitive mechanism/event/identifier sweeps across 3,119 live files resolve only permitted unrelated
      senses, negative assertions, and bounded legacy-update residue; no supported file, importer, or dispatch remains.
    - _Criterion:_ `Success Criteria > 2`; _criterion-digest:_
      `sha256:45da9ddfecc21fbda178b67a8a9faf199475f49376aef0ff98491f4c4cbc9bb0`; _State:_ `[x]`; _Evidence:_
      status/session/recovery, locus, load-set, seed, registry, and CLI source remove the retired contracts; passing
      status, strict-envelope, registry, retirement-contract, and CLI-help regressions prove absence and rejection.
    - _Criterion:_ `Success Criteria > 3`; _criterion-digest:_
      `sha256:8bf33e5dfa63f75285d64110bdd2b9e24410210fbeffc2c55a2a3f8c8d4fda40`; _State:_ `[x]`; _Evidence:_
      interlock-surface and checkpoint suites retain all nine machine signal kinds, exact-head admission, and obsolete
      report rejection; mixed lifecycle tests preserve the independent final-head mutation prohibitions.
    - _Criterion:_ `Success Criteria > 4`; _criterion-digest:_
      `sha256:1130f5c245410b8697828e686a8af6858cbdbd1bcfccbdbaaef793410b085d7e`; _State:_ `[x]`; _Evidence:_
      fresh-init tests cover all six PM/team recipe arms. The unchanged updater retains eleven edited Configurable
      documents, deletes README, drops manifest/pristine membership, and passes a guarded second update without reads.
    - _Criterion:_ `Success Criteria > 5`; _criterion-digest:_
      `sha256:25cec3dc23349fc36acf3b8f1ca29db7612f16aa5f00ae244b8f7c6b7535f7b2`; _State:_ `[x]`; _Evidence:_
      workflow-parser rejection and surviving graph/coverage, neutrality, frontmatter, and integrity suites pass;
      corpus audits and the correction commit's hooks run without the deleted validator in either hook copy.
    - _Criterion:_ `Success Criteria > 6`; _criterion-digest:_
      `sha256:254e09ad210497337a8dbedee4332f41005cdd892aa55e99fc1f39fc46100dc5`; _State:_ `[x]`; _Evidence:_
      passing PR lifecycle, review-gate, delivery, and release suites retain immediate remote-head replay, resolver
      binding/reuse, publication/review ordering, and Errand opened-target refresh and adapter equality.
    - _Criterion:_ `Success Criteria > 7`; _criterion-digest:_
      `sha256:10ca8c00c364e4323131753341c8b1c17c49b50571bb5a9341d5060d26dfdf84`; _State:_ `[x]`; _Evidence:_
      supported guidance retains config, checks, method overrides, commands, project content, both None conventions,
      native hooks, and Origin linkage while explicitly describing the insertion and tracker-notification gaps.
    - _Criterion:_ `Success Criteria > 8`; _criterion-digest:_
      `sha256:d1e4f0a8d14dade9361966867fd17bb96535af3e0da63bb81245a054d229ec05`; _State:_ `[x]`; _Evidence:_
      ADR-038 contains eleven event rows, sequencing/failure rules, payload/adapter authority, retry and ready-head
      constraints. Its full retrieval revision resolves all twelve old documents and scanner/audit/status source loci;
      the four prior ADR diffs alter only scoped status metadata and retain their bodies and prior annotations.
    - _Criterion:_ `Success Criteria > 9`; _criterion-digest:_
      `sha256:641852524bb24a233cbf521d556ad1f19229190ac10ca0e5ced0debd7c8ae59e`; _State:_ `[x]`; _Evidence:_
      the contributor citation correction is committed in `6c438bebd`; 386 same-file fragment links resolve, and the
      full link audit and rendered-Framework sync suite pass. Twelve deleted manifest keys leave all other metadata
      intact; recipe-derived membership is 142 files: 103 Framework, 35 Configurable, and four Scaffolded.
    - _Criterion:_ `Success Criteria > 10`; _criterion-digest:_
      `sha256:121d1820db02ffa80d79cfa6bddddf57aa17ca3def4211b43af07b0d95780277`; _State:_ `[x]`; _Evidence:_
      the successful local merge request covers all 17 selected checks, with selected local E2E feedback passing too.
      Check declarations retain their deadlines and CI-only policy; suppression changes only remove or reduce entries.
    - _Criterion:_ `Success Criteria > 11`; _criterion-digest:_
      `sha256:700da88b7dbb0277322a7c1ad2f3c684a6f11e58f005b19924950734ed3c3af7`; _State:_ `[x]`; _Evidence:_
      the complete spec/task/source walk and clean fresh-context pass close implementation acceptance with no deferred
      intent. This report records the acceptance evidence; Candidate preparation and public integration retain their
      own subsequent review, publication, CI, and authorization boundaries.

---

## Success Criteria

- `[x]` The live corpus sweeps under the spec's exclusions and closed allowlist find no supported mechanism file,
  activation/declaration/marker/action, command, scanner, validator, importer, registry entry, or positive execution fixture.

- `[x]` Public full status/session-init/recovery outputs omit `extensions`; handoff/locus/load-set/recovery/seed inputs
  omit `activeExtensions`; schema discovery omits `extensions-session-init`; the CLI lacks `arc extensions`.

- `[x]` The checkpoint surface omits `extensionReport` while preserved tests prove complete `machineEvidence`, exact-head
  authorization, and merge admission, including the independent final-head mutation prohibitions.

- `[x]` Every supported recipe arm installs no extension directory or manifest entry; an old manifest retains edited
  Configurable documents, deletes README, drops all managed/pristine membership, and succeeds on a subsequent update
  without reading or changing retained residue.

- `[x]` `parseWorkflowFrontmatter` rejects `arc.extensions`; method parsing/graph/coverage, package-method neutrality,
  domain-rule validation, and both commit hooks remain functional with no removed script invocation.

- `[x]` Preserved mixed PR lifecycle tests prove exact remote-head validation before creation, resolver reuse/binding,
  publication/review ordering, and Errand `openedChangeRequest` refresh/equality with the planning-grooming target.

- `[x]` Supported guidance retains all surviving customization channels, both convention rows with **None**, harness-native
  hooks, and `Origin` linkage, while claiming no workflow-step insertion or tracker notification through the mechanism.

- `[x]` The superseding ADR preserves eleven events, naming/frequency, failure/continuation, payload/authority and retry/
  ready-head contracts, and a retrievable full pre-removal revision; exactly four scoped status edits preserve existing
  annotations and historical bodies.

- `[x]` Every affected step/section citation and heading link resolves by target meaning; rendered Framework content
  agrees with package source; self-hosted manifest keys and inventory counts agree with recipe-derived membership.

- `[x]` All required quality gates pass, including Markdown, source/test types, method-trigger coverage, applicable
  test tiers, and build, with no new suppression, skipped gate, or deadline change.

- `[x]` Ready for integration with the intended scope complete and acceptance evidence recorded.

---
