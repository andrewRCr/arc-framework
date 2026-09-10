# Task List: Review Signal Convergence

- **Design:** `spec-review-signal-convergence.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `2`
- **Plan Digest:** `sha256:e71cadb7bce7b7c7dccedfcdd1d665402e135852dfcc17e9b7eeda13b7b9d52f`
- **Projection:** `stack-to-main`
- **Landability:** All members are `independently-landable`.

### Members

| #   | Member                                                 | Chunk key                        |
| --- | ------------------------------------------------------ | -------------------------------- |
| 1   | Review vocabulary and advisory loops                   | `review-vocabulary`              |
| 2   | Native review admission and accounting                 | `native-review-admission`        |
| 3   | Immutable producer evidence and approval binding       | `sealed-review-evidence`         |
| 4   | Verified judgment and recognizable reports             | `verified-finding-reports`       |
| 5   | Evidence-derived convergence and response continuation | `evidence-driven-convergence`    |
| 6   | Incremental coverage and member progression            | `incremental-review-convergence` |
| 7   | Publication continuation and attestation ordering      | `publication-continuation`       |

#### Member coverage

| #   | Tasks                                      | Design elements                                                                |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| 1   | `1.1`, `1.2`, `1.3`, `1.4`                 | `rfc:design-1`, `rfc:design-2`, `rfc:design-3`, `rfc:design-7`                 |
| 2   | `2.1`, `2.2`, `2.3`, `2.4`, `2.5`, `2.6`   | `rfc:design-3`, `rfc:design-5`, `rfc:design-7`                                 |
| 3   | `3.1`, `3.2`, `3.3`, `3.4`                 | `rfc:design-4`, `rfc:design-5`                                                 |
| 4   | `4.1`, `4.2`, `4.3`, `4.4`, `4.5`, `4.R`   | `rfc:design-4`, `rfc:design-7`                                                 |
| 5   | `5.1`, `5.1.R`, `5.2`, `5.3`, `5.4`, `5.5` | `rfc:design-3`, `rfc:design-4`, `rfc:design-5`, `rfc:design-6`, `rfc:design-7` |
| 6   | `6.1`, `6.2`, `6.3`, `6.4`, `6.5`          | `rfc:design-3`, `rfc:design-5`, `rfc:design-6`, `rfc:design-7`                 |
| 7   | `7.1`, `7.2`, `7.3`, `7.4`                 | `rfc:design-7`, `rfc:design-8`                                                 |

### Named seams

| #   | Seam                                    | Members | Owner | Design elements                                                |
| --- | --------------------------------------- | ------- | ----- | -------------------------------------------------------------- |
| 1   | Coverage to member progression          | 5, 6    | 6     | `rfc:design-3`, `rfc:design-5`, `rfc:design-6`, `rfc:design-7` |
| 2   | Native admission to immutable evidence  | 2, 3    | 3     | `rfc:design-3`, `rfc:design-5`                                 |
| 3   | Review through publication readiness    | 5, 6, 7 | 7     | `rfc:design-7`, `rfc:design-8`                                 |
| 4   | Approved judgment to convergence signal | 3, 4, 5 | 5     | `rfc:design-4`, `rfc:design-5`, `rfc:design-6`, `rfc:design-7` |

#### Acceptance

- **1. Coverage to member progression:** Adequate complete or predecessor-backed incremental evidence uses one
  convergence rule and advances the first outstanding member only after response performance. Partial evidence,
  settlement, or applicability alone cannot erase material signal. Logical pass, complete coverage, and exact Owner
  acceptance stay distinct.

- **2. Native admission to immutable evidence:** Every terminal producer retains its exact admitted lineage, pass,
  source, and coverage through sealing and read-side resolution. Replay and interrupted writes repair the same
  producer/count without competing terminal authority.

- **3. Review through publication readiness:** Returned public actions preserve approved responses, applicable evidence,
  and count-neutral re-entry through convergence attestation and readiness. At-cap completion incurs no extra evaluator
  call; premature commits stop, explicit recovery grants no clearance, and post-readiness replay preserves advanced
  authority.

- **4. Approved judgment to convergence signal:** The exact complete producer-bound current approved finding set
  survives correction and supplies verified-only materiality to every policy/discharge path. Clean needs no empty
  disposition; provider completion is not clearance, report styling is not authority, and no approved response is
  discarded.
<!-- arc:delivery-plan:end -->

## **Phase 1:** Establish review vocabulary and advisory loop semantics

**Delivery member:** 1 — `review-vocabulary`

_Purpose:_ Close the severity graph and advisory attention, completeness, convergence, and cap semantics independently
of code-review persistence.

### `[x]` **1.1 Migrate the complete review-severity acceptance graph**

- _Goal:_ Review severity is uniformly `critical > major > minor`, while impediment and blocked-state vocabulary is
  unchanged.

    - `[x]` **1.1.a Transform the classified severity graph**

        - Replaced ARC-owned top-grade severity with `critical` across schemas, adapters, policy, and both Framework
          method copies. CodeRabbit agent events retain native `blocker` and event-based identity before normalization;
          acceptance, strict-rejection, provider-mapping, lower-grade, nested-record, and command-input tests cover the
          changed graph while impediment and `blocked` vocabulary remain untouched.

    - `[x]` **1.1.b Verify strict-current closure**

        - Proved strict rejection through primitive, hosted, disposition, receipt, settlement, and command-input
          boundaries; generated schemas expose only `critical | major | minor`. Provider-native top grades normalize
          without changing lower mappings, both type domains close, Framework copies stay synchronized, and the
          independent `blocked` state remains present.

- _Outcome:_ ARC-owned review severity now has one strict `critical > major > minor` graph from provider boundaries
  through durable records, generated schemas, and review prose, while native provider and impediment vocabularies stay
  independently intact.

### `[x]` **1.2 Clarify advisory coverage and preserve claim-type verification**

- _Goal:_ A `withstood` entry communicates attention without licensing correctness or clearance.

    - `[x]` **1.2.a Clarify the claim and primary verification gradient**

        - Defined `withstood` in the method and embedded prompt as selective, decision-relevant attention without a
          finding—not correctness, completeness, clearance, or evidence. The primary spot-checks externally verifiable
          source, behavior, and diff claims without pretending subjective reviewer judgments or every attention entry
          can be independently verified; dual-copy contract tests lock the boundary.

    - `[x]` **1.2.b Exercise a contradicted source claim**

        - Retained a bounded false-source fixture, hidden expected behavior, and actual shipped method/caller inputs.
          An attended no-history evaluator inspected `source.ts`, rejected the contradicted `withstood` claim, denied
          correctness and evidence authority, and recommended renewed validation; `notes-review-signal-convergence.md`
          records the verbatim output, no observed deviation, and the single-run limitation.

- _Outcome:_ `withstood` now reports selective reviewer attention only, with proportional primary-side verification and
  one source-grounded behavioral observation demonstrating that a contradicted entry is not relayed as clearance.

### `[x]` **1.3 Close advisory convergence, cap reporting, and caller fire-points**

- _Goal:_ Advisory loops complete approved dispositions, distinguish fresh signal from settlement, and stop at the pass
  cap.

    - `[x]` **1.3.a Close advisory loop and authority instructions**

        - Separated complete approved dispositions from pass-result convergence, added `Pass N of M` and named stop
          reasons, kept cap state outside evaluator context, and made every successor pass require explicit named
          authorization. Conditional permission remains pending through unfinished response work, is invalidated by
          withdrawal or supersession, and is consumed once without creating lane-progress state.

    - `[x]` **1.3.b Verify invocation reachability and behavior**

        - Contract checks cover both Framework copies, direct declarations/fire-points, installation, the inactive
          override, and evaluator-context exclusion. Four attended fresh-context exercises covered unsupported and
          fixed material findings, over-cap refusal, pending/withdrawn permission, and one-use continuation; verbatim
          results and the corrected fixed-material oracle are retained in `notes-review-signal-convergence.md`.

- _Outcome:_ Planning and criteria callers now retain complete advisory judgment, response, pass, and conditional
  permission evidence without acquiring producer-backed review state. Fresh signal alone establishes convergence;
  settlement, unused capacity, and confirmed `minor` observations grant no successor pass.

### `[x]` **1.4 Verify vocabulary and advisory loop behavior** — validate criteria at member scope

- _Goal:_ Vocabulary and advisory-loop criteria have traceable static and observed behavioral evidence.

- _Outcome:_ The Member 1 report in `notes-review-signal-convergence.md` binds both immutable criteria to the exact
  three-commit span and resolves both `[x]` with no boundary deviation. Its fresh companion returned no findings at
  `Pass 1 of 2`; the primary verified its source claims, and both Success Criteria markers remain unchanged.

## **Phase 2:** Admit native producer passes and preserve truthful coverage

**Delivery member:** 2 — `native-review-admission`

_Purpose:_ Close native admission through execution and progress consumers. Shared lane admission supplies pass
identity; native bindings preserve exactness without a generic persisted execution object.

### `[x]` **2.1 Compose shared logical-pass admission with native local request and operation identity**

- _Goal:_ Local execution has runtime-issued lineage/pass identity: retries reuse admission and a fresh same-target pass
  differs.

    - `[x]` **2.1.a Compose shared admission with the complete local binding graph**

        - Added one version-checked owner per runtime-resolved lineage, moved head and change-request facts onto attempts,
          and bound native local request and operation identities to lineage, logical pass, and retry generation.

    - `[x]` **2.1.b Preserve pending admission across re-entry**

        - Pending and completed operations replay from admitted context before current selection; failed reruns advance
          only native retry generation, while receipts and version-conflict recovery repair the original producer/count.

- _Outcome:_ Local execution now carries one replay-safe logical-pass identity from trusted lineage resolution through
  preparation, attestation, resume, receipt lookup, and lane accounting without a second admission ledger.

### `[x]` **2.2 Bind frontline pass identity while retaining retry-generation semantics**

- _Goal:_ Frontline retries preserve their logical pass, while fresh same-target passes cannot reuse an earlier outcome.

- _Outcome:_ Frontline resolve now derives target, lineage, allowance, logical pass, and retry generation before
  persisting one complete-coverage admission. Run revalidates that exact pending admission before effects; exact
  terminal replay is idempotent, while failed deliberate reruns advance only retry generation and contradictory
  target, source, policy, lineage, pass, or outcome bindings fail closed.

### `[x]` **2.3 Persist hosted admission before dispatch and preserve request/await context**

- _Goal:_ Hosted execution is durably admitted before an external request and retains original context through pending
  replay.

    - `[x]` **2.3.a Bind native request admission before external effects**

        - Singleton, Errand, and delivery-member requests now persist lineage-owned source/pass/scope admission before
          provider effects, and bind successful handles back to that exact attempt with version-checked acknowledgment.

    - `[x]` **2.3.b Preserve admission through await and fallback**

        - Restart resolves durable admission before current policy, actor, or member selection; acknowledged requests
          replay their stored await action, while unacknowledged requests stop as ambiguous without redispatch.

- _Outcome:_ Hosted request and await now retain immutable requirement, actor, pass, and requested/effective coverage
  through restart and safe fallback without manufacturing provider exactly-once or reconciliation capability.

### `[x]` **2.4 Derive logical counts and truthful coverage across history and progress consumers**

- _Goal:_ Every progress consumer counts logical terminal passes once and reports complete coverage separately across
  member heads.

- _Outcome:_ Lane-progress, reservation, history, status, and checkpoint consumers count unique terminal logical passes
  independently of effective complete coverage. Local and hosted coverage survives fallback and head movement without
  changing source selection, while exact Owner acceptance remains a separate terminus fact.

### `[x]` **2.5 Exercise public admission, fallback, retry, moved-member history, and exact cap authority**

- _Goal:_ Public execution paths demonstrate admitted identity and correct allowance without caller reconstruction.

- _Outcome:_ Public status, local, hosted, and frontline paths now exercise durable admission through restart, fallback,
  retry, and member movement. Exact ref/member lookup keeps shared-head siblings on distinct operation, request, and
  admission identities; failed local reruns advance only native generation and complete logical pass 1 once.

### `[x]` **2.6 Verify native admission and shared accounting** — validate criteria at member scope

- _Goal:_ Native admission, coverage, and accounting criteria are proven at this delivery boundary.

    - `[x]` **2.6.R.a Enforce cap authority at every native public producer admission**

        - Local delivery members now require and revalidate their exact status-issued admission. Other local and every
          hosted vehicle re-run the standard-lane driver from live progress and configuration before fresh producer
          effects; replay stays first, and an override binds only its exact exhausted count and next pass.

    - `[x]` **2.6.R.b Revalidate the repaired Member 2 boundary** — validate criteria at member scope

        - The cumulative Member 2 walk resolves all four criteria through `b5489ba54`; Pass 5's local concurrency,
          receipt-recovery, and lane-authority responses are complete. The full Tier 2 gate passed on the reconciled
          tree, and every Success Criteria marker remains unchanged for terminal verification.

- _Outcome:_ Native admission now closes at one lineage owner across local, frontline, and hosted producers. Every
  capacity-spend boundary revalidates exact live authority before effects; interrupted or concurrent local transitions
  repair one producer with truthful coverage, and unattached operation residue cannot execute.

## **Phase 3:** Seal terminal evidence and bind approval to its producer

**Delivery member:** 3 — `sealed-review-evidence`

_Purpose:_ Close immutable hosted publication and replay with every direct reader, then use native evidence in real
proposal and approval commands. Existing disposition shapes can acquire stronger source binding before their grade
migration.

### `[x]` **3.1 Seal hosted evidence through publisher, writers, readers, and await replay**

- _Goal:_ Hosted terminal content is immutable, and replay returns it before observation even after settlement.

    - `[x]` **3.1.a Close the strict sealed-snapshot graph**

        - Hosted clean and findings results now seal one canonical identity over their admission, acknowledged handle,
          target, coverage, review URL, and ordered findings. Settlement remains mutable outside that snapshot, and all
          terminal writers, direct readers, and fixtures consume the sealed result.

    - `[x]` **3.1.b Enforce publisher transitions and replay before observation**

        - The operation publisher now refuses hosted admission or seal mutation and disappearance, while canonical
          attempt identities and unique admissions close direct schema-valid rewrites. Equal concurrent publication and
          settled replay return the current winner without replacing newer settlement, counts, or sibling attempts;
          hosted await returns the stored result and source reference before configuration or provider observation.

- _Outcome:_ Hosted terminal authority is now one immutable producer snapshot across persistence, settlement, and public
  replay, with mutable progress preserved independently around it.

### `[x]` **3.2 Compose immutable source reads and bind proposals to exact producer content**

- _Goal:_ Every proposal and approved replay binds exactly the immutable local/frontline/hosted result it describes.

    - `[x]` **3.2.a Resolve complete native producer evidence**

        - A storage-neutral reader now composes exact local receipt/source/admission, frontline outcome/admission, and
          hosted sealed-attempt records. It retains native references and coverage, derives the local content identity,
          reuses native frontline/hosted digests, and fails distinctly on missing, ambiguous, or corrupt evidence.

    - `[x]` **3.2.b Bind canonical proposal and approval to producer content**

        - Canonical proposals and approved records now bind the exact producer ID and immutable result digest, validate
          findings one-for-one, reject substituted producer content, and require no disposition for clean results.
          Response, reduction, local resume, and delivery replay retain that binding through settlement.

- _Outcome:_ Response, reduction, and resume now share one immutable-result composition and producer-bound validator
  across local, frontline, and hosted evidence. Native result identity survives findings settlement, while durable-only
  source fields are projected deliberately at narrower public request boundaries.

### `[x]` **3.3 Exercise concurrent terminal writes, settled replay, and stale approval refusal**

- _Goal:_ Immutable evidence and approval binding survive real-store interruption, concurrency, and settlement replay.

- _Outcome:_ Real-store fault injection proves effect-before-acknowledgment loss replays the original seal without
  provider observation or recounting, while pre-seal interruption retains acknowledged admission and re-observes into
  the same producer/pass. Existing concurrency, immutable-transition, settlement, and source-bound approval cases cover
  the remaining adversarial paths.

### `[x]` **3.4 Verify immutable evidence and approval identity** — validate criteria at member scope

- _Goal:_ Immutable evidence and exact producer-approval criteria are proven through the real storage/command path.

- _Outcome:_ The Member 3 criteria report resolves both immutable-evidence criteria across the bounded member diff and
  cumulative tree. Its fresh-context companion converged with zero findings; the exact report and primary source
  spot-checks are retained in `notes-review-signal-convergence.md` while Success Criteria markers remain unchanged.

## **Phase 4:** Unify verified dispositions and recognizable finding reports

**Delivery member:** 4 — `verified-finding-reports`

_Purpose:_ Migrate verified judgment through its complete acceptance graph and join native producer navigation to the
canonical report. Required fields, capture sites, renderer, and designated callers land with their owning semantic
changes.

### `[x]` **4.1 Migrate verified disposition schemas and their complete consumer graph**

- _Goal:_ Canonical records and all response consumers preserve reported observation separately from approved verified
  judgment.

- _Outcome:_ Canonical dispositions now retain producer-reported and approved verified judgments independently, derive
  gating only from the verified judgment, and reject omitted or invalid unsupported judgments. Proposal, approval,
  response, reduction, resume, frontline, and shared fixture consumers migrated together without compatibility aliases.

### `[x]` **4.2 Preserve native finding labels and capture ordinals through all producers**

- _Goal:_ Each finding remains recognizable in source order even when canonical disposition order differs.

- _Outcome:_ Normalized, local, frontline, and hosted findings now retain validated one-based capture ordinals and
  genuine bounded source labels, with hosted numbering applied after thread/body combination. Complete producer
  boundaries refuse reordered metadata; projections and replay preserve native identity without renumbering. Navigation
  participates in each producer's immutable result identity and approval binding while remaining outside dispositions.

### `[x]` **4.3 Render canonical proposed and approved reports in the public response command**

- _Goal:_ The public response command returns one deterministic, standalone report for proposal, approval, and replay.

- _Outcome:_ Canonical proposals now bind an approver-selected verification scope into immutable set identity and return
  one producer-joined report across proposal, approval, and replay. Reports preserve native navigation,
  verified-before-reported assessment, complete response narratives, and exact correspondence. Post-fix settlement
  rejects narrower verification and forwards the approved scope as `approvedVerification` without changing Candidate
  consumption.

### `[x]` **4.4 Close presentation callers and exercise producer-backed and self-review approval**

- _Goal:_ Default callers present faithful approval reports without making author self-review impersonate an independent
  producer.

    - `[x]` **4.4.a Close default report consumption and invocation ownership**

        - Default prepare, integrate, delivery, and private/public Errand callers now consume the two-command report
          sequence, while direct self-review remains non-producer. Ready-to-fix authorization and changed-target
          continuation preserve `approvedVerification`.

    - `[x]` **4.4.b Exercise the human-facing report and self-review path**

        - Real command output with native label `N-7` and an unsupported finding, plus standalone author self-review,
          was exercised in fresh contexts. The exercise exposed a missing stable locus; the renderer was corrected,
          the regenerated output reviewed cleanly, and the evidence was recorded in `notes-review-signal-convergence.md`.

- _Outcome:_ Production callers preserve approval and response ownership together with approver-selected verification
  scope. Fresh-context exercises establish faithful standalone reports without synthetic producer identity and close
  the discovered renderer omission at its source.

### `[x]` **4.R Close Member 4 verification findings**

- _Goal:_ Producer-backed proposals preserve reported judgment and effective gating while their human report remains
  structurally inert.

    - `[x]` **4.R.a Preserve hosted provider nit judgments**

        - CodeRabbit supplemental and explicit thread nitpick markers now survive hosted validation, immutable result
          identity, and proposal/report projection as reported judgment while verified severity still controls gating.

    - `[x]` **4.R.b Apply the effective severity-gating policy**

        - Public proposals now require the existing `severityGatingPolicy`; command construction derives ordinary
          verified-minor gating from that effective policy while verified nits remain record-only.

    - `[x]` **4.R.c Render source references as inert report text**

        - Report projection now collapses source-reference whitespace and escapes Markdown/HTML punctuation, preventing
          injected fields or separators while canonical producer content and identity remain unchanged.

    - `[x]` **4.R.d Retire the collapsed settlement contract**

        - Removed the unused registered `finding-settlement` schema instead of preserving a second settlement record
          whose collapsed severity could not represent the canonical reported/verified judgment split.

    - `[x]` **4.R.e Render producer display fields as inert single-line text**

        - One shared projection now collapses line breaks and escapes markup across native labels, evidence references,
          and loci, preventing any producer-owned field from injecting report structure.

    - `[x]` **4.R.f Refuse canonically ambiguous finding identities**

        - Require one NFC spelling for finding identities across producer, disposition, authorization, response, and
          hosted carriers so canonical hashing, duplicate checks, approval binding, and report joins share one key.

- _Outcome:_ Canonical proposal provenance, effective gating, structurally inert reporting, and finding identity now
  share the same approval-bearing representation without a conflicting settlement contract; all source-confirmed
  Member 4 corrections are complete.

### `[x]` **4.5 Verify judgment provenance and finding presentation** — validate criteria at member scope

- _Goal:_ Verified judgment and report ergonomics criteria are supported by canonical and observed behavior evidence.

- _Outcome:_ The Member 4 boundary report in `notes-review-signal-convergence.md` resolves all three immutable criteria
  over `005f2104d..3069d7e30` and the cumulative tree. It records the complete three-pass fresh-context companion,
  source-confirmed corrections, final-fold residual, and observed producer-backed and self-review evidence while
  leaving the Success Criteria markers unchanged.

## **Phase 5:** Activate evidence-derived convergence through every caller

**Delivery member:** 5 — `evidence-driven-convergence`

_Purpose:_ Switch terminal evidence, verified materiality, discharge, and response-first continuation as one boundary.
No local-only activation leaves hosted/member settlement-as-clearance in place.

### `[x]` **5.1 Admit one terminal producer and derive verified signal for the shared policy**

- _Goal:_ Policy accepts terminal signal only from an exact complete producer and, for findings, its complete approved
  record.

- _Outcome:_ Terminal policy inputs now retain one immutable producer and derive verified-only severity and coverage from
  exact native results plus complete approved dispositions. Settlement projects back to its original findings producer,
  partial chunks remain nonterminal, and unbased incremental evidence selects coverage while retaining response intent.

### `[x]` **5.1.R Close live terminal-normalization and approved-correction gaps**

- _Goal:_ Hosted completion retains every request-bound observation, and a disproved approved judgment has one typed,
  auditable successor path before incompatible response consumption.

    - `[x]` **5.1.R.a Preserve CodeRabbit observations across one terminal review sequence**

        - Request-bound observation now composes supplemental reviews with a later completion marker, deduplicates stable
          provider identities in capture order, excludes later request generations and other heads, and refuses a closed
          request window with no attributable terminal result. Handle-less inspection retains its newest-review boundary;
          fixture identity remains independent of production exports.

    - `[x]` **5.1.R.b Add immutable approved-set lineage and successor publication**

        - Approved advisory records now retain an ordered, source-stable lineage with one current pointer, and every
          response/continuation selector resolves only that node. Git-common stores accept exact replay or one current
          successor, refuse stale/conflicting/consumed advances, and preserve immutable historical evidence.

        - Hosted bindings retain each approved action plan and exact performed settlement receipt. Successors carry only
          unchanged disposition/channel actions, reopen changed actions, and reject unattributable or rewritten history.

- _Outcome:_ Hosted terminal observations and approved corrections now remain complete, replayable evidence instead of
  mutable lane state. Provider findings survive completion markers, while a disproved judgment advances through one
  immutable successor without reviving predecessor authority or repeating compatible settlement.

### `[x]` **5.2 Close direct policy callers, independent discharge, status, and checkpoint**

- _Goal:_ All policy, discharge, status, and checkpoint paths apply the same verified signal and preserve outstanding
  work.

    - `[x]` **5.2.a Switch the complete control graph**

        - Capacity-spend admission, local preparation, status, and checkpoint composition now bind terminal attempts to
          immutable producer results and the current approved disposition node. Historical clean evidence requires its
          original target plus current applicability; missing evidence refuses instead of clearing the obligation.

    - `[x]` **5.2.b Preserve member conjunction and existing authority**

        - Discharge classifies current and retained terminal results through verified policy while preserving source
          order, member conjunction, exact Owner termini, cap overrides, and applicability-based reuse. Performed
          material responses enter a fresh pass; unsettled or inadequately covered signal remains outstanding.

- _Outcome:_ Every review-control path now derives convergence from immutable producer evidence and the current approved
  disposition successor. Operational settlement records response performance without becoming clearance, so status and
  checkpoint retain the same first outstanding member and authority boundaries.

### `[x]` **5.3 Compose policy inside approved respond and preserve response-first continuations**

- _Goal:_ An approved response command selects policy internally and returns approved response work before continuation;
  subsequent response completion resumes only current-target action.

    - `[x]` **5.3.a Compose approval, policy, and selected response action**

        - Approved respond now appends current immutable evidence before resolving the caller's exact policy request and
          returns response-first fix, hosted-settlement, or delivery actions. Explicit conditional pass consent persists
          with its terminal lane producer, while capture failure dispatches nothing. Exact-head correction publishes one
          immutable successor, invalidates predecessor continuation, and carries or reopens attributable hosted work
          under the shared review-operation lock; predictable conflicts return typed refusal envelopes.

    - `[x]` **5.3.b Resume or reroute after response performance**

        - Response completion records the exact produced head, binds and consumes conditional pass authority under the
          lane owner's version check, and replays durable policy inputs across Candidate, Errand, and delivery paths.
          Stale, superseded, consumed, or mismatched continuations refuse before dispatch.

- _Outcome:_ Approved response is one response-first state machine: immutable approval and its exact policy judgment
  persist before work, performed settlement or fixes bind their resulting head, and every public continuation resumes
  from that durable evidence without recreating authority or losing compatible hosted settlement.

### `[x]` **5.4 Exercise all-lane convergence, manual aggregates, cap stops, and public response replay**

- _Goal:_ Real public paths prove all-lane convergence, response precedence, and count-neutral interrupted re-entry.

- _Outcome:_ Producer-backed local and hosted paths now prove that approved nonmaterial responses settle before member
  advancement, while material or unfinished work remains outstanding across restart. Public hosted settlement plans
  carry the persisted provider actor identity unchanged, so callers replay exact actions without translating logins or
  inventing identifiers; the accumulated lane, aggregate, cap, supersession, and checkpoint matrix closes the boundary.

### `[x]` **5.5.R Close Member 5 adversarial conformance gaps**

- _Goal:_ Terminal scope and conditional pass authority remain exact through production response, supersession,
  withdrawal, concurrency, and earlier-evidence carry.

    - `[x]` **5.5.R.a Retain exact scope through every supported producer and earlier carry**

        - Persisted ordinary local scope through operation identity, state, lane admission, and immutable result
          evidence; confined Frontline to whole-target capability; and carried prior scope plus aggregate completion
          through earlier-applicability policy reconstruction without adding chunk transport.

    - `[x]` **5.5.R.b Compose prospective conditional consent through production respond**

        - Resolve the terminal findings response without treating its prospective next-pass override as authority for
          the completed pass, then prove the real composition and public command path.

    - `[x]` **5.5.R.c Prevent stale conditional authority across successor publication**

        - Serialized successor publication and local, Frontline, and hosted pass admission through the canonical lane
          operation lock; consumption now confirms the exact disposition set is still current, preventing crash or
          race replay from spending predecessor authority.

    - `[x]` **5.5.R.d Add explicit pending-authority withdrawal**

        - Added a strict `conditionalNextPassWithdrawal` response arm that revokes exact pending or bound authority,
          preserves the invalidation as audit evidence, and returns typed success, replay, or refusal without target-head
          movement blocking a legitimate post-fix withdrawal.

    - `[x]` **5.5.R.e Serialize head-surviving continuation and append successor authority**

        - Added a stable continuation-owner lock identity across head movement and routed respond plus every production
          admission through the existing repository advisory lock. Conditional authority now retains ordered history
          with one current pointer, allowing an exact successor after predecessor invalidation without revival.

    - `[x]` **5.5.R.f Persist response performance independently and join hosted completion**

        - Persisted performed-fix evidence independently of conditional pass authority and made hosted completion join
          exact response performance with channel settlement in either order. Record-only fixes need no provider receipt;
          host-addressable fixes require the produced response head, and settlement shares the stable continuation lock.

    - `[x]` **5.5.R.g Publish supersession choreography and close the regression boundary**

        - Published the two-call supersession flow, carry/reopen actions, expected-fix dirt allowance, and typed replay
          and refusal rules in both installed `review-response` copies. Public command and real-store coverage now spans
          stable continuation locking, successor authority, independent performance, and partial hosted settlement.

- _Outcome:_ Exact producer scope and next-pass authority now survive every supported response continuation without
  conflating approval, performance, or settlement. Stable owner locking, append-only successor authority, explicit
  withdrawal, independent response evidence, and public supersession choreography close both adversarial passes.

### `[ ]` **5.5 Verify convergence and response precedence** — validate criteria at member scope

- _Goal:_ Every lane/member control path meets the convergence and response-precedence boundary criteria.

- _Note:_ Spec §§ 6–7; SC 8–10, 14, 17, and 18.

- _Approach:_ Load `validate-criteria.md` for this member's criterion group and record the boundary report. Consume
  preceding task evidence, run applicable quality gates, and report unresolved or unavailable evidence. Leave criterion
  markers unchanged; route any corrective work through normal task review, not this verifier.

## **Phase 6:** Complete incremental scope evidence and member progression

**Delivery member:** 6 — `incremental-review-convergence`

_Purpose:_ Use fresh correction evidence with a validated predecessor basis, retaining narrow reviews where supported.
Coverage labels and contribution applicability cannot substitute for evaluator scope.

### `[ ]` **6.1 Resolve predecessor coverage, current applicability, and material re-examination scope**

- _Goal:_ Incremental convergence has a validated complete predecessor basis and fresh evidence for every required
  correction.

- _Note:_ Spec § 5 Coverage and incremental continuation; SC 8, 12, and 13.

- _Approach:_ Extend existing contribution applicability and native result reads; retain the optional predecessor in
  source admission. Resolve explicit producers through `ReviewResultReader` against the complete snapshot, separately
  from source-filtered or settlement-truncated selection history. Memoize traversal without a new history ledger.

    - Build `test-first` (one behavior at a time):

        - Complete basis plus compatible successive corrections validates exact endpoints, lineage, policy/rubric, and
          applicability.

        - Missing links, cycles, gaps, stale targets, incompatible bindings, and unavailable applicability fail closed.

        - Earlier findings have approved performed responses; supported material loci outside the delta cannot
          disappear.

        - Reviewed endpoints come from immutable producers, not performed-fix retention projections. Review at A,
          performed fix at B, and correction review at C must include the unreviewed A→B change in required scope.
          Preserve equivalent-head applicability and covered-decision carry without treating response completion as
          coverage.

        - Same-head and cross-source predecessors remain discoverable by explicit identity. Validate each source's
          admission and shared lane/lineage/policy compatibility; no source-selection filter may hide a valid basis.

        - Fresh verified signal controls convergence rather than a lifetime severity maximum; selecting a prior result
          never rewrites its target or drops response obligations.

### `[ ]` **6.2 Carry exact correction scope through local materialization and adapter admission**

- _Goal:_ A correction review receives its admitted exact range and material re-examination instructions, or returns
  truthful limits.

- _Note:_ Spec § 5 Coverage and incremental continuation; SC 12, 13, and 17.

- _Approach:_ Extend local review materialization separately from whole-target identity. Preserve existing adapter
  selection and coverage upgrades; capability labels do not establish exact evaluator scope. Close endpoint pinning,
  source verification, sweep enumeration, and cleanup together under existing operation lifetime rules.

    - Build `test-first` (one behavior at a time):

        - Local source/payload preparation binds prior/current endpoints and complete required finding instructions.

        - Public status/admission permits incremental local review only when the returned action carries the validated
          correction scope into materialization; replace its current blanket local-incremental refusal coherently.

        - The current operation pins all required correction endpoints, including a nonancestor prior head. Verify
          them on prepare/replay/attest; predecessor cleanup cannot release current pins. Extend existing ref ownership
          and sweep enumeration coherently, with terminal/expiry cleanup and no permanent history-retention mechanism.

        - After predecessor cleanup and Git maintenance, an admitted nonancestor correction remains reproducible.
          Already-missing objects produce typed scope unavailability, not a claimed complete basis or silent review.

        - Frontline remains whole-target complete; hosted Codex's explicit complete upgrade remains truthful.

        - CodeRabbit's fixed incremental command cannot establish arbitrary correction range/material instructions from
          its label alone; insufficient scope returns capable-source/coverage selection without silent complete
          dispatch.

        - An incremental result can be triaged/responded to and counted even when its coverage cannot close the member.

### `[ ]` **6.3 Compose adequate incremental signal with member selection and distinct Owner authority**

- _Goal:_ Adequate fresh incremental signal advances the right member without confusing convergence, Owner acceptance,
  or pass authority.

- _Note:_ Spec §§ 6–7; SC 9, 13, 14, and 17.

- _Approach:_ Use the common policy/discharge path from Member 5. Replace its conservative inadequate-basis result only
  when the predecessor/scope validator supplies adequate evidence; retain refusal for every invalid basis.

    - Build `test-first` (one behavior at a time):

        - Complete-plus-incremental no-material evidence may advance; material settlement cannot.

        - Same/member-head movement preserves logical counts, coverage, and ordered sibling selection.

        - Hosted complete evidence can support a compatible local incremental successor, including at the same head.
          Use the common explicit producer resolver; preserve separate source histories and reject incompatible bases.

        - Exact Owner acceptance stays accepted risk rather than clean evidence; a one-pass override permits only that
          pass.

### `[ ]` **6.4 Exercise multi-pass members, insufficient scope, sibling completion, and exact overrides**

- _Goal:_ The motivating member sequence and coverage failures are reproducible through returned public actions.

- _Note:_ Spec §§ 3, 5, and 7; SC 12–14 and 17.

- _Approach:_ Extend the existing fan-out and delivery scenarios with predecessor evidence and real correction payloads;
  keep provider simulation at the external boundary.

    - Build `test-first` (one behavior at a time):

        - The five-pass `6, 7, 5, 2, 3` material sequence remains outstanding, while a one-pass-clean sibling is not
          re-reviewed.

        - A fresh adequate no-material correction can advance; an incremental-only or unreviewed material locus cannot.

        - Local incremental coverage remains incremental in stored result, history, status, and displayed counts.

        - Interrupted/missing/gapped predecessor state, explicit complete upgrade, and exact cap/Owner paths remain
          distinct.

        - Returned actions drive hosted-complete → local-incremental review without losing the predecessor. Exercise
          the A-review/B-fix/C-correction scope and nonancestor endpoint retention, including missing-object refusal.

### `[ ]` **6.5 Verify incremental coverage and member progression** — validate criteria at member scope

- _Goal:_ Incremental scope and member progression criteria hold without unsupported coverage or authority claims.

- _Note:_ Spec §§ 5–7; SC 12–14.

- _Approach:_ Load `validate-criteria.md` for this member's criterion group and record the boundary report. Consume
  preceding task evidence, run applicable quality gates, and report unresolved or unavailable evidence. Leave criterion
  markers unchanged; route any corrective work through normal task review, not this verifier.

## **Phase 7:** Carry convergence attestation into publication readiness

**Delivery member:** 7 — `publication-continuation`

_Purpose:_ Close the public-command sequence from reviewed Candidate through staged attestation and publication,
including interrupted writes and premature-commit refusal, without changing review or merge authority.

### `[ ]` **7.1 Persist post-attest continuation with exact prepublication replay judgments**

- _Goal:_ Prepublication re-entry retains reviewed-head ordering and exact continuation until readiness or explicit
  recovery, without regressing advanced authority.

- _Note:_ Spec § 8; SC 16 and 17.

- _Approach:_ Extend the existing publication boundary action in `integration-boundary-locus.ts` and prepublication
  composition. Use existing opaque resume transport and `keep-staged-until-publication`, not another receipt.

    - Build `test-first` (one behavior at a time):

        - Convergence action preserves prior review judgments, scope/coverage, reservation/Owner context, and consumed
          override.

        - Continuation is replay input, not a clean assertion; current authority still resolves from durable records.

        - The resumed Candidate boundary retains reviewed-head/projection context after replacing the convergence
          action. Plain prepublication and token re-entry enforce the same pending ordering guard; readiness advances
          past it, and later retries cannot reinstall it or regress the boundary.

        - Initial root/re-root attestation remains unchanged and acquires no fictional reviewed-head evidence.

### `[ ]` **7.2 Reconcile attestation repair, readiness admission, and prepare/verify dispatch**

- _Goal:_ Attestation repair resumes readiness without consuming another review, while premature head changes refuse
  before dispatch.

- _Note:_ Spec § 8; SC 16–18.

- _Approach:_ Update `handlers/lifecycle.ts`, prepublication readiness, and paired prepare/verify wording together.
  Follow the returned continuation with projections staged until the existing publication transition.

    - Build `test-first` (one behavior at a time):

        - Candidate persistence followed by boundary interruption repairs idempotently and retains the exact
          continuation.

        - Same Candidate/subject/reviewed head resumes; changed reviewable content reroutes under existing authority.

        - Same subject with a premature head-changing commit returns ordering conflict before policy or pass
          consumption.

        - Explicit current-head recovery uses normal applicability/cap gates; post-readiness subject-stable commits
          remain valid; no reset, automatic evaluator launch, receipt rebinding, or new Git hook is introduced.

        - The diagnostic returns an explicit `attestationOrderingRecovery` variant in existing resume transport,
          binding Candidate/subject, reviewed/current heads, and boundary version. Only selected, revalidated recovery
          replaces the pending guard through the version-checked boundary write. Stale input refuses; ordinary re-entry
          cannot bypass the guard. Preserve equivalent-head review reuse and valid carried judgments.

### `[ ]` **7.3 Exercise clean-at-cap publication, interrupted re-entry, and head movement**

- _Goal:_ The public publication spine reaches readiness at the cap and publishes with one lifecycle projection commit.

- _Note:_ Spec § 8; SC 16 and 17.

- _Approach:_ Extend `publication-spine.e2e.test.ts` with real Git and CLI calls, using returned resume input verbatim.
  Build the CLI first; reuse preceding members' admitted producer/receipt/count fixtures. Use existing handler/store
  test seams for precise write failures alongside subprocess re-entry; add no production failpoint mechanism.

    - Build `test-first` (one behavior at a time):

        - A clean-at-cap result flows through convergence verification, staged attest, readiness, and publish without
          another pass.

        - Non-default replay judgments survive actual failure after Candidate persistence: separately fail the boundary
          write and later metadata/staging work, then retry and inspect the repaired continuation, metadata, and index.
          Restoring an old boundary after a successful command is not a substitute for these failure cases.

        - Compare durable pass counts and evaluator invocations before/after continuation, failed-write retry, and
          repeated ordering-conflict status. Preserve non-default scope/invocation/ceiling judgments from real admitted
          evidence, not only a synthetic convergence envelope.

        - Premature projection commit refuses before review spend; changed content reroutes; post-readiness projection
          is allowed.

        - Explicit recovery reuses applicable equivalent-head evidence; stale recovery cannot replace a newer boundary.
          Replaying the originally returned token after readiness preserves advanced authority and never reinstalls
          the pending guard. Reuse existing post-readiness operational-commit coverage as the positive control.

### `[ ]` **7.4 Verify publication continuation** — validate criteria at member scope

- _Goal:_ Publication continuation criteria hold through real CLI re-entry and exact-head ordering failures.

- _Note:_ Spec § 8; SC 16 and 17.

- _Approach:_ Load `validate-criteria.md` for this member's criterion group and record the boundary report. Consume
  preceding task evidence, run applicable quality gates, and report unresolved or unavailable evidence. Leave criterion
  markers unchanged; route any corrective work through normal task review, not this verifier.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The full work unit satisfies its spec and integration readiness criteria with all member evidence reconciled.

- _Note:_ Spec SC 1–18; Testing and Rollout order.

- _Approach:_ Load and follow `verify-work-unit.md`; consume member reports, validate cross-member seams and union
  coherence, and run the applicable whole-unit quality gates. This is the sole terminal WU verification task.

---

## Success Criteria

Member verifiers consume their group's evidence; only terminal verification changes these markers.

### Member 1 — `review-vocabulary`

- `[ ]` Every review-severity acceptance root uses `critical`; occurrence-sensitive checks preserve impediment uses.

- `[ ]` The advisory method and prompt define attention-only `withstood`, separate disposition completeness from signal,
  expose `Pass N of M` and the stop reason, present the pass recommendation with the disposition report, keep a
  confirmed minor from buying a pass or raising severity, and stop at the cap without named one-pass authority.
  Bounded agent exercises record adherence.

### Member 2 — `native-review-admission`

- `[ ]` Local/frontline/hosted public actions validate durable native admission; same-attempt replay is idempotent,
  failed local rerun advances native generation within one pass, and another same-target pass is distinct.
  Same-head sibling members cannot share requests or receipts; pending drift cannot replace admitted authority.

- `[ ]` Hosted admission precedes external effects on singleton, Errand, and member paths. Acknowledged replay returns
  stored await inputs; uncertain unacknowledged dispatch stops without redispatch, fallback, or a fresh pass.

- `[ ]` Complete and incremental terminal reviews each count once across member head movement; requested/effective
  coverage and complete-review counts are truthful in history, status, admission, and checkpoint.

- `[ ]` Fallback, unavailable attempts, partial chunk observations, replay, and status consume no extra pass; exact
  one-pass ceiling authority is checked before invocation.

### Member 3 — `sealed-review-evidence`

- `[ ]` Hosted terminal replay returns the original durable result before observation, including after settlement and
  concurrent publication; schema-valid direct rewrites cannot alter sealed content.

- `[ ]` Local/frontline/hosted proposals bind immutable native producer content through existing stores; same-looking
  findings from another pass cannot reuse approval.

### Member 4 — `verified-finding-reports`

- `[ ]` Public proposals and response consumers preserve reported versus verified severity/nit, reject unsupported
  allegations with null verified severity, and derive gating only from verified judgment.

- `[ ]` Command-produced proposed and approved reports stand alone and preserve native references and capture order
  through canonical sorting, clipping, escaping, duplicates, titleless results, and replay.

- `[ ]` Report styling changes no canonical identity; producer metadata changes do. Self-review retains complete-set
  approval and its non-producer report without a synthetic receipt or renderer command.

### Member 5 — `evidence-driven-convergence`

- `[ ]` Every durable lane admits its exact terminal producer and, for findings, its complete approved disposition set;
  missing, ambiguous, wrong-pass/source/scope, stale, incomplete, and unbound evidence fails closed.

- `[ ]` All-refuted/minors-only adequately covered results converge; supported material findings cannot converge merely
  through fix, defer, reject, or settlement. A complete manual chunk aggregate includes every finding; partial-only
  results cannot converge and no independent producer union is accepted.

- `[ ]` The approved response command internally composes policy and returns the selected action without another
  agent-invoked policy round trip; every continuation/Owner/cap/coverage arm preserves outstanding approved work.

- `[ ]` Explicit conditional next-pass consent survives pending work and restart, binds only the completed response's
  exact target, and is consumed with one admitted pass. Withdrawal, supersession, stale bindings, concurrent replay,
  and failed writes cannot create or revive permission; disposition approval alone is insufficient.

- `[ ]` Head-surviving continuation mutations share one stable advisory-lock identity, and successor approval may append
  one distinct current authorization while immutable predecessor history remains invalidated and unreplayable.

- `[ ]` Performed fixes persist independently of optional next-pass consent. Hosted completion joins exact response
  performance with every required provider action in either order; record-only fixes require no provider receipt, and
  host-addressable fix settlement matches the produced head.

- `[ ]` Installed response guidance exposes fresh proposal and approval for supersession, returned carry/reopen work,
  expected authorized fix dirt, exact replay, and typed refusal without direct state surgery.

- `[ ]` Changed-target fixes reroute without inherited clearance; status and checkpoint agree on the first outstanding
  member and distinguish exact Owner acceptance. Validated equivalent-head evidence and carried judgments remain usable
  without another review or pass; missing applicability cannot clear. Inadequate incremental evidence selects coverage.

### Member 6 — `incremental-review-convergence`

- `[ ]` A complete predecessor basis plus fresh narrow material-correction evidence can converge; missing, incompatible,
  cyclic, gapped, stale, or insufficient history cannot. Historical severity is not a lifetime maximum.

- `[ ]` Local correction payloads carry admitted endpoints and material finding instructions. Unsupported hosted scope
  cannot claim coverage from a label; explicit complete upgrades remain truthful and no expensive pass starts silently.

- `[ ]` The captured material multi-pass member remains outstanding until fresh adequate no-material evidence or exact
  Owner acceptance; its one-pass-clean sibling is not re-reviewed. Ordered progression, convergence, Owner acceptance,
  and one-pass override remain distinct through head movement and re-entry.

### Member 7 — `publication-continuation`

- `[ ]` Public commands carry clean-at-cap convergence through staged attestation, publish-readiness, and one projection
  commit without another evaluator call or reconstructed private state.

- `[ ]` Actual boundary and later metadata/staging failures after Candidate persistence repair idempotently. Plain and
  token re-entry preserve the ordering guard; premature projection commits refuse before review spend. Explicit recovery
  retains applicable evidence; stale recovery and later replay cannot regress readiness. Changed content reroutes, and
  post-readiness subject-stable commits retain existing authority.

### Cross-member seams

- `[ ]` Public lifecycle re-entry uses returned actions and durable references, without caller-invented digests,
  producer identities, counters, or severity summaries.

- `[ ]` Every mandatory lifecycle has its production caller and executable scenario at the earliest visible member;
  verifiers consume evidence rather than accumulating corrective implementation.

- `[ ]` All strict-current callers, generated schema validation, installed declarations/fire-points, and both
  methodology copies agree; no temporary convergence bypass or compatibility reader remains.

- `[ ]` All quality gates pass.

- `[ ]` Ready for integration.
