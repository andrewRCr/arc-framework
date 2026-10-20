# Notes: Seam Decomposition

## Contents

- [Corrections to the consumer map](#corrections-to-the-consumer-map)
- [Destination locator semantics](#a1--destination-locator-semantics)
- [Refusal coverage](#refusal-coverage)
- [Verification evidence](#verification-evidence)

## Corrections to the consumer map

The storage contract's consumer map (`notes-storage-contract.md`, archived) is not edited. Its decomposition rows were
re-verified against the code at `5b82bb851`, and these corrections stand here. Under the spec, a row matters only as
carried or deleted (§ 1.5, § 13).

- **Dead in production:** `git-decompose-v3-retirement-delta.ts` has no production importer — the delta is computed in
  `decompose-v3-repository-plan.ts` from trees already read; and `repointDependsOn` (`decompose-sweep.ts`) has no
  production caller, though its import is that file's `store-raw-state` floor entry.
- **Not decomposition's:** `git-decomposition-object-readers.ts` has no decomposition importer; its ten callers are
  delivery, review, integration, status, and session-init modules. Its row's owner, `storage-cutover`, stands.
- **Misread:** `git-decompose-v3-destination-validation.ts` does no Git I/O despite its name, and serves extraction's
  finish alone; `--finish` refuses a retirement map (`map:authoring-shape`, `git-decompose-v3-finish.ts`) rather than
  passing over it.
- **Not shared after all:** `seam-lifecycle` changed teardown's injected removal callback
  (`tryCleanupDecomposeCandidate`, `verbs/teardown.ts`), not `git-owned-decompose-candidate-cleanup.ts`, and teardown's
  store arm (`runStoreTeardown`) handles no candidate. The store version stages no candidate, so the file leaves with
  the in-repo arm.
- **Unrowed but coupled:** `handlers/decompose.ts`, `decompose-v3-operation.ts`, `decompose-transition-record.ts`,
  `decompose-v3-repository-projections.ts`, `decompose-v3-materializer.ts`, `decompose-v3-finish-operation.ts`,
  `decompose-result-occupation.ts`, `decompose-candidate.ts`, and the candidate cleanup. `decompose-candidate.ts` has
  callers outside the machine: teardown and `lib/git/in-flight-derivation.ts`.
- **Sharer missing:** `terminal-transition-record-writer.ts`'s row names no sharer, though decomposition
  (`decompose-v3-operation.ts`, `git-decompose-v3-operation.ts`) and lifecycle (`verbs/abandon.ts`, `verbs/rename.ts`,
  `handlers/lifecycle.ts`, `commands/rename.ts`) both import it.

## A1 — destination locator semantics

The pre-implementation audit after merging `main` at `efd3442b4` found that spec § 8.4 promised more than the
unchanged scanner establishes. The approved correction keeps destination conservation as successful locator
resolution, with arbitrary authored bodies, and makes ordinal retargeting explicit. Task 3.3 realizes the correction;
task 5.3's revision tests use the same unresolved-locator condition, and the spec adds Success Criterion 9.

Superseded text from § 8.4 ¶1:

> A locator names a heading's text and level, its ancestors', and its
> occurrence among headings of the same text (`V3DecomposeLocatorSchema`), so renaming or re-leveling an allocated
> heading or any heading above it, merging it, or adding an earlier heading of the same text refuses, naming the
> allocation; the remedy is to update that allocation's target locator through a revision. Authoring may change anything
> else.

`scanV3DecomposeContent` assigns occurrence ordinals afresh, and `resolveV3DecomposeContentLocator` matches the
complete locator rather than a section's prior content (`decompose-content.ts`). A source probe scanned a destination
with `## Allocated` and body `Original content`, then inserted an earlier `## Allocated` with body `Inserted content`.
The saved occurrence-0 locator resolved successfully to `Inserted content`, and the original section moved to ordinal 1.
`validateProjectedContent` checks resolution alone (`git-decompose-v3-destination-validation.ts`).

Keeping persistent section identity would require additional destination evidence and a decision about which authored
edits preserve it. The approved correction composes the existing scanner and leaves that mechanism out of scope; the
distribution approval reviews the current content the locators name. The origin's content digests still bind the
source inventory between the batches, independently of destination authoring.

## Refusal coverage

Each row of the spec's § 14, by the tasks of `tasks-seam-decomposition.md` that build and test it. A row's tests show
the refusal firing where its condition holds and the cut completing after its remedy.

| Refusal                                                                         | Tasks                        |
| ------------------------------------------------------------------------------- | ---------------------------- |
| The origin holds a stored map, or another cut stores one first                  | 2.2, 2.6                     |
| The origin's inbound list holds entries                                         | 2.2, 2.4, 3.3                |
| The origin is Integrating or archived                                           | 2.2, 2.4, 5.2                |
| The origin is one no member can be made from                                    | 2.2, 2.4, 2.5, 3.2, 5.2, 5.3 |
| A task list the batch would copy carries a completed task                       | 2.5, 5.3                     |
| The origin's meta or a source record holds an open conflict                     | 2.2, 2.4, 3.3, 5.2           |
| The lifecycle listing is unreadable or incomplete                               | 2.2, 3.4, 5.1                |
| The map does not decode, or is version 3                                        | 1.2, 2.4, 5.3                |
| The map breaks a carried ownership, edge, or placement rule                     | 2.4, 5.3                     |
| The map's machine half differs from a fresh preflight                           | 2.4, 5.3                     |
| The wrong flag for the map's shape                                              | 2.4                          |
| A name is held, or taken before the batch lands                                 | 2.4, 2.6, 5.3                |
| An allocation into a file the operator may not edit                             | 2.4, 5.3                     |
| An existing home resolves to nothing, to a completed work unit, or to an Errand | 2.4, 3.1, 5.3                |
| A started home would take an edge, or a started dependent's edge would move     | 2.4, 3.3, 4.1, 4.3, 5.3      |
| A `document` home                                                               | 2.4, 5.3                     |
| An edge's provider does not resolve by slug                                     | 2.4, 3.3, 5.3                |
| A Purpose missing for a created document, or present for an existing one        | 2.4, 5.3                     |
| No stored map                                                                   | 3.1, 5.1, 5.3                |
| The origin's current kind is not the shape's                                    | 3.2                          |
| A member gone, a seeded field diverging, a locator unresolved, an origin moved  | 3.1, 3.2, 3.3, 4.3, 5.3      |
| An `at-cap` subcohort document holds a lone fan-out marker or a different block | 3.4, 4.3                     |
| The origin's checkout fails the removal check                                   | 3.4, 3.5                     |
| The apply authority is stale                                                    | 3.5, 4.3, 5.1, 5.3           |
| A started member would be removed, or its seeded field moved                    | 5.1, 5.3                     |
| An edge names a stub the batch removes                                          | 5.1, 5.3                     |
| A removed stub holds its own stored map, or inbound entries                     | 5.1, 5.3                     |
| An open work item or cohort document holds a cohort document the batch removes  | 5.1, 5.3                     |
| A member was renamed between the batches                                        | 3.2, 5.3                     |
| The cut has landed                                                              | 3.6, 4.3, 5.4                |
| The stored map is conflicted after a sync                                       | 5.5                          |
| A member is gone that the revised map keeps, or a revised `Parent` would change | 5.3                          |
| A placement names a cohort after the origin                                     | 2.4, 5.3                     |
| A retirement's member names the origin                                          | 3.2                          |
| `abandon` lineage for an origin holding a stored map                            | 1.5, 5.6                     |
| `--revise`, `--discard`, or `--finish` without its map, before the flip         | 6.1                          |
| `--advance-base` or `--finish <cut-map>` from the flip                          | 6.2                          |
| A version conflict at the batch                                                 | 2.6, 3.5, 4.3, 5.1, 5.3      |

## Verification evidence

The initial terminal criteria walk covers `tasks-seam-decomposition.md` → `Success Criteria`, ordinals 1–12. Criterion
identities below hash parsed text with layout whitespace normalized, excluding the root bullet and checkbox. Source
and test paths in this section are relative to `packages/arc-framework/`. Original criterion text is unchanged;
amendments A2 and A3 append criteria 13 and 14. The initial report below retains its original subject and observations.

### Shared span and review scope

- **Diff base:** `5c9cd97e18dab159314e3963dade059959a625a7` (`origin/main` merge base).
- **Reviewed head:** `f4f9aff6d25718c8972f73c412392c57b71cadd0`.
- **Reachable tree:** `ad8ab06deba240c57a55232a0c15911c3ae2f19c`.
- **Boundary-order deviation:** none.
- **Attention result:** `scope-selected / continue-review`; 16,033 changed lines across 242 files.
- **Selected route:** bounded chunks and a fresh seam aggregate. Substrate (55), additive (74), terminal (53), and
  revision/dispatch (60) form the exact changed-file union, without missing, duplicate, or extraneous assignments.
  Changed declarations owned by another chunk are explicit external dependencies; each chunk retains its tests.
- **Seams:** schema and identity, acquired versions and exact writes, source/conservation, batch provenance,
  capability dispatch and legacy compatibility, native refusal/remedy boundaries, and test/harness reachability.

### Criteria report

- **Success Criteria > 1:** `[x]`.
    - **Criterion digest:** `sha256:a72036d0062933e53bbb74999f315eac458556784309be4d13d6c45593f59d45`.
    - **Evidence:** Capability dispatch and dormant-mode handler tests preserve the in-repo arm. The unchanged version-3
      decoder/scanner tests passed in the unit gate; affected CLI scenarios passed local E2E feedback.
- **Success Criteria > 2:** `[x]`.
    - **Criterion digest:** `sha256:a1d104843fbe4f65f662945d1786dce84013c300a86c0cb8059949846e30b306`.
    - **Evidence:** `retirement-scenario.test.ts` exercises stub/started origins and cohort/at-cap placement through
      preflight, additive authoring, preview, apply, and teardown retry. It compares exact preview writes with one
      terminal batch; `lineage-plan.test.ts` separately checks nonempty exact retired branch links.
- **Success Criteria > 3:** `[x]`.
    - **Criterion digest:** `sha256:e3a7d4b28496e04c5aa6e6c7cd1e5eab06f1cfda557c26ee8282304bd560aacb`.
    - **Evidence:** `extraction-scenario.test.ts` exercises all four Planning placements plus Active/cohort, exact
      retained bytes, recipient edges, map removal, and no lineage. Both shapes share terminal admission and
      conservation.
- **Success Criteria > 4:** `[x]`.
    - **Criterion digest:** `sha256:250b9e7804ab1d350317325e8835de3af6b2f1ca20bc18d11a5e8b0fb28826e9`.
    - **Evidence:** `discard.test.ts`, `revision.test.ts`, and `revision-starter.test.ts` cover history-only removed
      groups, differential member/cohort changes, retained authoring and unseeded edges, and carried versus fresh
      authoring. Removal concurrency remains the separate criterion-5 failure.
- **Success Criteria > 5:** `[ ]`.
    - **Criterion digest:** `sha256:75fb8170d855217ad7fed51f70d2c417f290e14e0bfc075283200c53dfb53c84`.
    - **Evidence:** Not met: F1. A competing native write adds an unrelated survivor dependency immediately before
      discard or revision submits its batch. Both operations still return success and remove the named member; the
      surviving edge then resolves to no item. Existing ordinary refusal and authority tests pass but do not exercise
      this interleaving.
- **Success Criteria > 6:** `[ ]`.
    - **Criterion digest:** `sha256:44604808dfe3e0afd9a75e87eb6e3ec07a3a998e41354a66fe3a9e76f9b0d2a6`.
    - **Evidence:** Not met: F2. Preparing the same additive cut after zero versus four unrelated retirements issues one
      versus five history calls. `retired-lineage.ts` sends the whole lineage listing to `readTerminalReferenceAliases`;
      additive settlement, terminal seeded fields, and revision seeds reach this fallback. Current growth tests add
      unrelated live stubs and miss it.
- **Success Criteria > 7:** `[x]`.
    - **Criterion digest:** `sha256:8eebb03883545734a590116f4a222b09ba806a077335f7bc298c59ae91000240`.
    - **Evidence:** The production cut-map registration tests cover parsed writes, history, removal, and invalid maps.
      Registered-kind conformance and registry tests passed. `arc schema get cut-map` returns version 4; the legacy
      version-3 registration remains present.
- **Success Criteria > 8:** `[x]`.
    - **Criterion digest:** `sha256:23479b057a21f297ce6235f437c8630b0bfa5cf06d7d1b6c115830ea9affa65a`.
    - **Evidence:** The suppression file is unchanged from the merged base: store-raw-state 180, surface-names 148,
      work-unit-paths 57, with no per-file increase or lib/decompose entry. The full TypeScript lint gate passed. This
      is evidence against this base, to be refreshed if the landing base changes.
- **Success Criteria > 9:** `[x]`.
    - **Criterion digest:** `sha256:d1251ca9c62561860653ede048bdf24db89d5c8b0d29b28196bff6ae121bbf74`.
    - **Evidence:** The complete scoped source review and aggregate found no store-version import of a module designated
      for deletion by spec sections 1.5 and 13; retained scanner/renderer and lifecycle/store interfaces supply its
      external declarations.
- **Success Criteria > 10:** `[x]`.
    - **Criterion digest:** `sha256:5593b9f1ac7e795d091c38cf2074ed0f1542f562232da3a19ee68e48905a962c`.
    - **Evidence:** The forced local merge gate passed 19 selected checks, including both type checks, full lint, build,
      18,208 unit tests, integration, and ARC contracts. Affected local CLI E2E feedback also passed. Three CI-only
      enforcement suites were not selected locally and remain due in CI before merge.
- **Success Criteria > 11:** `[ ]`.
    - **Criterion digest:** `sha256:6e3400fca90dcb0c0f525a97a0a95374806d40ee0e68fea7e2323786a1b6f82f`.
    - **Evidence:** Not met: criteria 5 and 6 remain unresolved. Task 7.1 stays open; no Candidate was attested and no
      preparation or integration authority is claimed.
- **Success Criteria > 12:** `[x]`.
    - **Criterion digest:** `sha256:3bae7a9cf7bfc91e35102b994d204ffa5d1cb51648f1083374a6dbab7157ed82`.
    - **Evidence:** `conservation.test.ts` covers unresolved/restored locators, releveling and ancestry, earlier ordinal
      matches, and authored bodies. Retirement and extraction call the same resolver; `revision-repairs.test.ts` changes
      current destination locators through revision and then finishes.
**Summary:** 9 met, 0 superseded, 3 unresolved (5, 6, and integration readiness at 11).

### Independent pass and approved dispositions

Pass 1 of 2 used four fresh bounded contexts and one fresh seam/aggregate context over the same criteria and exact
subject. The primary criteria report and task markings were withheld. All four scoped reports were consumed; the
aggregate accounted for all twelve criteria and consolidated the repeated alias-resolution finding. Execution
evidence above comes from the primary-run checks, rather than a claim that the reviewers ran them.

- **F1 — surviving edges during removal:** confirmed major; criterion 5. **FIX** approved.
  At the reviewed head, `src/lib/decompose/removal-guards.ts` checks surviving dependencies and pause edges before publication,
  but `discard.ts` and `revision.ts` submit removals without preserving that admission at the atomic batch boundary.
  Native metadata and slug rules do not reject this removal. A checked-store competing-write probe reproduced
  successful discard and revision with a remaining outsider edge and a missing member.
- **F2 — unrelated terminal histories:** confirmed major; criterion 6. **FIX** approved.
  At the reviewed head, `src/lib/decompose/retired-lineage.ts` passes every terminal record to
  `src/lib/work-unit/terminal-reference-aliases.ts`, whose loop reads each terminal owner’s primary history.
  A checked-store additive preparation probe reproduced history counts of 1 and 5 with 0 and 4 unrelated retirements.
- **Response performance:** the atomic guard and bounded lookup corrections were implemented and checked in two
  independent fix rounds below. The original complete pass remains a two-major-finding result; later repairs do not
  retroactively make that pass clean.
- **Loop reading:** baseline; two material findings in the original implementation, with no prior fix rounds.
- **Disposition status:** both original findings and both round-1 follow-ups received approved fixes. Round 2
  returns zero findings over those follow-ups; its bounded convergence is recorded below.
- **Continuation approved:** repair both criteria without weakening their text, add focused regressions, and run
  one independent fix check over the performed corrections. No second complete pass is authorized; reconsider its
  value after the actual correction scope and fix-check result are known. A correction requiring a shared-contract
  or settled-design change returns through the amendment gate before that change is made.

### A2 and A3 — approved verification repairs

A2 supersedes § 9.3's statement: “No write check refuses removing a record an edge names.”
`checkMetaRemovalEdges` now checks the complete batch after-state for a decompose removal without terminal lineage.
The existing terminal path preserves its provider through lineage, so started dependents may retain their edges for
reconciliation. `removal-races.test.ts` covers concurrent dependency and pause additions for both discard and revision,
atomic refusal, and successful owner repair. `removal-edges-rule.test.ts` covers authenticated aliases and incomplete
or malformed surviving-edge observations.

A3 extends § 3.2's lineage lookup expectation: authenticated former names remain resolvable after the primary ends,
without listing all terminal records or walking unrelated histories. The existing input shape remains; exact UUID
requests select that generation, and slug requests prefer current terminal names before former-name candidates.
`readDecomposeRetiredLineage` delegates to that guarantee, and provider observations retain known UIDs through seeded
checks and revision reconciliation. `slug-edges` and `readWorkUnitLineage` validate returned lineage against its owner
rather than requiring its current name to equal a former-name query. The reference backend retains identity metadata
on the lineage record. The approved provider coordination was delivered to the live backend session, which accepted
the durable implementation obligation; no foreign checkout was edited.

Both amendments have low derivation depth: determinate corrections composed from the existing write-check and lookup
slots. The scoped author read retains the original refusal, terminal reconciliation, former-name, and flat-read
obligations. It changes no before-flip decomposition behavior, public input variant, record field, or migration reader.
The independent fix check covers the performed correction set; the amendment offer is omitted at low depth.

### Fix check, round 1 since verification pass 1

The fresh independent four-axis check consumed before/after copies of 26 implementation, test, contract, and design
files, with task markings and the primary criteria report withheld. Its runner was independent and loaded no
author-side session files. Source tracing and disposable checked-store probes confirmed F1's atomic refusal and
repair, same-batch retargeting/removal, and F2's bounded additive, terminal, and revision reads. The primary reran
the probes against the current implementation.

- **R1.F1 — terminal aliases escape lineage lookup:** confirmed major, introduced by F2's repair. Lineage creation
  copies aliases into `MemoryRecord.formerSlugs`; `indexIdentities`, `canonicalReference`, `listReference`, and
  `savedReference` consume that general alias evidence. A former-name draft read and listing now select the retired
  owner, and a version-bound write-back edits its draft without lineage lookup. The before-equivalent disposable
  namespace refuses the read and write and lists absent. Proposed **FIX (local correction):** isolate retained terminal
  alias evidence from generic owner resolution, preserve bounded lineage lookup, and add shared direct read/list/write
  boundary regressions, including saved states and imported or reconciled identity evidence.
- **R1.F2 — unheld ambiguous former names cannot be acquired:** author-identified and source-confirmed major,
  introduced by F2's lookup propagation. `priorTarget` turns an ambiguous lineage lookup into unavailable evidence
  before `checkSlugEdges` asks whether any edge survives. With no dependency or pause holders, creating a current
  generation still refuses, preventing current-name disambiguation. Proposed **FIX (local correction):** retain
  live-name and surviving-edge protection while admitting acquisition of an unheld historical alias; refuse genuine
  unavailable evidence. Cover held/unheld ambiguity and repair through the native checked store.
- **Quality feedback:** the focused 91-file run passed 1,960 tests (57 declared skips), and both type checks and ARC
  contracts passed after mechanical fixture type and complexity corrections. Broader related-unit feedback fails six
  tests: three setups collide with stronger alias acquisition guards, two inject unavailable global history or
  inventory that successful bounded lookup no longer reads, and one expects the old ambiguity message. Complete the
  shared-lookup test propagation with faithful ambiguous-history fixtures and failures at the required authority
  boundary. That round's full merge gate completed with 18 checks passed, the unit suite failed, and three CI-only
  suites not
  selected. The round-2 response below supplies the affected caller corrections.
- **Recommendation:** approve both local corrections, complete the affected tests, then one independent fix check
  round over the response. No second complete pass is proposed at this stop; the material signal is concentrated in
  the new alias semantics. Trend: pass 1 had two original major findings; round 1 found one repair regression and
  author verification found one adjacent propagation gap. Reading: converging on the shared lookup repair, with the
  round requiring approved response performance. Both corrections and round 2 were subsequently approved.

### Fix check, round 2 response

Both round-1 follow-up dispositions, their affected caller-test corrections, verification and commit, and one further
independent fix check were approved. Terminal lookup evidence now uses private `MemoryRecord.terminalFormerSlugs`
metadata, leaving the general owner index and saved-reference matching unchanged. Shared conformance cases exercise
direct read, owner-filtered list, version-bound write, and saved-state read locally and after synchronization, while
lineage lookup still resolves the former name.

`priorTarget` recognizes ambiguous terminal candidates without choosing one; `checkSlugEdges` still checks
surviving dependencies and pause waits before acquisition. It admits an unheld historical alias and preserves the
native live-name and unavailable-evidence guards. Native regression scenarios cover refusal with the named holder and
successful acquisition after owner repair. Ambiguous-history consumer fixtures reconcile independently retired
generations rather than acquiring a locally held name; fault cases inject unavailable lineage lookup authority.

The eight direct-operation boundaries and both acquisition cases failed before their corrections, and the two moved
caller fault cases failed against narrow refusal-ignoring reconstructions before restoration. The six affected test
files then passed 1,172 cases, with 57 declared skips. The previous full merge request completed with 18 checks passed,
one unit-suite failure (the six caller cases), and three CI-only suites not selected. That result belongs to the
round-1 subject; fresh validation of this response remains required.

Fresh response validation passed all 19 locally selected forced merge checks: both type checks, full TypeScript and
Markdown lint, unit and integration suites, ARC contracts, build, and the remaining declared local checks. The three
CI-only suites (`test:e2e`, `test:portability`, and `test:portability:macos`) were not selected and remain due before
merge. Increment validation passed 11 checks with six not selected; related unit feedback passed, and local E2E was
not selected for this response. The 78-file decomposition/native-guard selection passed 597 cases.

### Independent fix-check outcome

Round 2 inspected the 11-file follow-up delta over its kept before/after artifacts and governing spec/task context.
Its exact delta digest is `sha256:a3ab8ca0e6967bfa9ac243d2327099c92b687bc99f4614f314c7857cd50dac7d`. The runner was
independent, loaded no author-side session files, and returned `findings: []`. It verified all four axes: closure,
grounding, propagation, and new failure. This is a bounded fix check, with no complete work-unit re-review or review-lane
authority claimed.

The primary source check confirmed that only lineage lookup consumes private terminal alias metadata; general owner
indexing, saved references, public records, and direct operations do not. Ambiguous terminal lineage still requires
surviving-edge enumeration without selecting a generation. The independent checked-store probe retained a pause-edge
refusal after dependency-only settlement, then admitted acquisition when the same batch cleared both edges. Genuine
unavailable lookup or dependency inventory retained its refusal. The affected callers now exercise actual bounded
lookup and independent-generation synchronization.

Material trend: complete pass 1 had two original major findings; fix round 1 had one introduced major plus one
author-confirmed adjacent propagation gap; round 2 had zero findings. The two original amendments use existing check
and lookup slots; A3's shared-contract extension was approved explicitly, while both round-1 responses are local
corrections. Reading: converged fix rounds. Stop the optional independent criteria loop: the latest changes remain
within the repaired alias boundary and its callers, whose focused checks and fresh independent response check cover
the changed semantics. A second complete pass would largely repeat the unaffected original 242-file assessment. The
terminal author walk and quality gates still govern completion, and subsequent Candidate review remains separate.

### Proof boundary

The executable retirement and extraction scenarios fail if the composed store machine misses the cut’s batch and
conservation intent. They prove behavior over the checked reference backend, with scripted checkout boundaries and
write-back provenance. They do not prove a live ref-backend cut or the future projection’s public write-back handler.
The first representative real cut remains the `storage-cutover` rehearsal specified in
`spec-seam-decomposition.md` § 18; no essential proof is assigned to an assumed Errand.

---
