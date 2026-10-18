# Task List: Review Coverage Cadence

- **Design:** `spec-review-coverage-cadence.md`

---

## **Phase 1:** The shared next-pass rule, proven on an Errand

_Purpose:_ Land the rule every path inherits — the next-pass context and its chain proof at every composition,
convergence under `full-final`, the fix check's admission and instructions, and the local-only source after an
unconverged look — and carry it end to end on the smallest path, an Errand before and after its pull request.

_Mode:_ `slice` through Phase 4 — closes on the cadence exercisable on every path, the delta check included.

_Design decisions:_ The driver refuses a standard-lane request without the next-pass context, so the context reaches
every composition in this phase and the refusal lands last. One chain proof backs every correction scope and chain
re-confirmation: each named confirmation keeps its call site and today's grounds, then takes the shared proof, and a
confirmation that carries an earlier attempt to the current head never calls it. The shared context derives whether
the predecessor's response is due (`responseDue`); `terminalResponseSettled` stays pre-publication's own input. New
derivations live in modules of their own, since the compositions and the driver sit at or near the file-length gate.
The confirmation map is in `notes-review-coverage-cadence.md` § Chain confirmations, and the invariants
`seam-delivery-review` builds on in § Coordination; none changes here.

### `[x]` **1.1 Derive the next-pass context and require it on the driver's standard-lane request — § 4**

- _Goal:_ Every composition that builds the policy driver's standard-lane request derives the predecessor's
  convergence and the next look's admissible incremental basis from stored records, through one helper and one chain
  proof, including whether the predecessor's response is due; the driver refuses a standard-lane request that
  lacks the context.

    - `[x]` **1.1.a Build the performed-response test**
        - Added the shared change-set response proof over validated approval and lane performance at an unchanged
          base. Candidate record-only successors reuse the Candidate subject proof; later reviewable edits refuse.

    - `[x]` **1.1.b Build the next-pass context and its chain proof**
        - Added shared convergence, response-due, and fix-check scope derivation. Historical and current correction
          legs retain site grounds and prove change-set fixes through the performed response; delivery keeps its proof.

    - `[x]` **1.1.c Carry the context through the driver's request and the evidence binders**
        - Bound the internal standard-lane context through terminal, fresh, and additional-pass requests; frontline
          rejects it and the stored command schema remains unchanged. Extracted source eligibility from the driver.

    - `[x]` **1.1.d Derive it in Errand status and the `arc review resolve -` handler**
        - Errand status and ordinary resolve derive context from the terminal owner or live claim/Candidate history,
          including supersession ancestors. Standard resolve uses the continuation; a clean full-final fix check
          reaches its complete successor, while frontline retains direct evidence binding.

    - `[x]` **1.1.e Derive it in the work-unit compositions**
        - Wired shared context into hosted Errand/member/Candidate admission, reservation discharge, local prepare,
          pre-publication, and respond. Fresh hosted target and applicability modules preserve the existing proof
          grounds; historical producers remain available across head movement.

    - `[x]` **1.1.f Require the context on the standard lane**
        - Standard internal requests now refuse missing next-pass facts; frontline rejects them. Direct reducer and
          admission fixtures supply explicit internal context, while command requests retain their stored shape.

### `[x]` **1.2 Close a `full-final` lane only on a complete pass at the settled head — § 2.1, § 2.2, § 2.3**

- _Goal:_ Under `full-final`, the standard lane completes only on a complete pass at the final head whose approved
  dispositions fix no material finding: a converged fix check resolves to `coverage-required`, the composition then
  admits the complete pass with no selection, and an unconverged look surfaces `coverage-required`; `incremental`
  adequacy is unchanged.

    - `[x]` **1.2.a Report coverage adequate under `full-final` only for a complete terminal**
        - Full-final adequacy now requires the terminal's own complete coverage. Fix checks retain the coverage stop,
          and elective-pass authority refuses them; incremental policy retains its adequate-chain rule.

    - `[x]` **1.2.b Re-resolve to the complete pass after a converged look**
        - Continuation uses shared convergence and response state: converged full-final looks open the complete
          successor automatically, while unconverged looks retain the coverage stop until a choice. Its response flag
          now reports durable response state, and fresh successors retain caller authority.

    - `[x]` **1.2.c Admit the complete pass in local prepare without a selection after a converged look**
        - Local prepare consumes the shared convergence and scope directly. A converged full-final look admits
          complete coverage without a selection; a material fix whose chain is unavailable retains the complete-only
          stop, including when an earlier-head producer hint is present.

### `[x]` **1.3 Admit a fix check only after a fix, and carry what a memoryless reviewer lacks — § 3.1, § 3.2**

- _Goal:_ A fix check — the incremental local attempt, admitted only after an approved, performed response that fixed
  something — is offered after material fixes under `full-final` as under `incremental`, and its reviewer receives the
  correction scope, the earlier material findings at their loci, the four fix-check axes, and the sibling sweep.

    - `[x]` **1.3.a Bound incremental admission to a performed fix**
        - Response evidence now reports whether approval fixes anything. The correction-scope producer requires a
          performed fix; clean and no-fix predecessors offer none, while the coverage-chain walker still accepts their
          performed response state.

    - `[x]` **1.3.b Offer a fix check under `full-final` after a material fix**
        - Local coverage choices use the shared proven scope under both retrigger policies. A material fix under
          full-final now offers its fix check beside complete coverage; the duplicate scope derivation and routing-only
          full-final refusal were removed.

    - `[x]` **1.3.c Give the fix check's reviewer what it lacks**
        - Incremental reviewer instructions retain the exact range and earlier material findings, and name closure,
          behavioral grounding, propagation and completeness with a sibling sweep, and new failure. The axes apply
          without earlier material findings; complete-pass guidance is unchanged.

### `[x]` **1.4 Bind the terminal with its own scope and resolve the successor with its own — § 3.4**

- _Goal:_ A complete pass that follows a fix check at the same head resolves with its own scope instead of inheriting
  the fix check's, while the continuation still binds the terminal producer to the scope it recorded.

- _Outcome:_ Continuation binds the cached terminal under its recorded scope, then applies the caller's scope to
  fresh and authorized additional successors. Direct evidence binding retains its scope-mismatch refusal.

### `[x]` **1.5 Run the pass after an unconverged look on `delegated-agent` — § 7.1, § 7.2, § 7.3**

- _Goal:_ After a look whose approved fixes include a material one, the next pass runs on `delegated-agent` whichever
  coverage it takes — selected before any hosted-first reservation, a forced hosted source refused with a remedy naming
  the local pass, and a stop with both remedies where the configured list omits it — while after a converged look the
  configured rank picks the source.

    - `[x]` **1.5.a Restrict the driver's selection after an unconverged look**
        - Source selection now restricts fresh passes after material fixes to `delegated-agent` before hosted
          reservation, preserving the source list that binds recorded attempts and restoring configured rank after
          convergence. Forced hosted and missing-local-source selections carry distinct refusal diagnostics.

    - `[x]` **1.5.b Refuse a forced hosted source after an unconverged look**
        - Resolve, local prepare, and hosted admission preserve the material-fix diagnostic and name the required
          local pass, without changing the stored resolve envelope. A forced local source remains admissible.

    - `[x]` **1.5.c Stop where the configured list omits `delegated-agent`**
        - Selection checks the full configured list independently of a hosted provider's suffix. Missing local sources
          name configuration repair and, on supported surfaces, the Owner's stop with the unchecked-fix disclosure.
          Local prepare avoids an invalid default force and retains its empty-list fallback; configuration repair can
          resume admission.

    - `[x]` **1.5.d Split the continuation's binding list from its selection list**
        - Evidence binding carries independent selection and full-configuration lists. Errand terminal binding stays
          terminal-first while fresh and additional passes use configured order or the requested provider's suffix;
          earlier-head sources no longer receive priority. Production hosted admission accepts the complete successor
          of a converged local fix check with either source order.

    - `[x]` **1.5.e Name `delegated-agent` as the fix-check source in `arc-config.yml`**
        - Both standard-source comments and initial setup identify the local fix-check source and hosted complete-pass
          cadence; the project's configured source values remain intact.

### `[x]` **1.6 Prove a fix's leg at every chain confirmation, and break the chain on a base move — § 7.4, § 7.8**

- _Goal:_ Every confirmation that resolves a correction scope or re-confirms a chain proves a leg holding a fix through
  the chain proof, before a pull request and after; every confirmation that carries an earlier attempt to the current
  head stays as it is; and a base move after an unchecked fix breaks the chain on every path.

- _Context:_ Each leg is tested against the head that follows it, since the coverage chain re-confirms every earlier
  leg on each round (`resolveCoverageChain`, `incremental-coverage-basis.ts`). The confirmations, their callers, and
  which also serve a carry are mapped in `notes-review-coverage-cadence.md` § Chain confirmations.

    - `[x]` **1.6.a Route the chain confirmations through the chain proof**
        - Local prepare, resolve, respond, and pre-publication retain their contribution grounds and prove fix legs
          through the shared response proof. Delivery uses its exact member fix response and lane performance.
        - Real-record regressions cover Errands before and after publication, private and open-PR Candidates, and
          delivery fix checks with deferred minor findings. Pre-publication's historical carry stays unchanged.

    - `[x]` **1.6.b Prove the singleton's local fix leg in the discharge's confirmations**
        - Historical and current discharge confirmations now take the shared response proof with Candidate authority
          and real record readers. Local predecessors use `delegated-agent` without requiring a delivery admission.
        - Both production-reader boundaries prove the hosted material fix followed by a local fix check, including
          the Candidate's record-only commit. Full singleton routing remains Task 2.5.

    - `[x]` **1.6.c Break the chain on a base move after an unchecked fix**
        - Discharge's historical and current confirmations compare the retained producer's base with the successor's
          before accepting delivery's verified fix-response re-anchor. Changed base ref, commit, or tree requires review.
        - Real-Git Errand, Candidate, and member merges break fix legs; shared delivery applicability still carries a
          settled response through a mechanical base move. Ordinary contribution retention stays unchanged.

### `[x]` **1.7 Honor the Owner's terminus at `coverage-required` — § 8.2**

- _Goal:_ A supplied Owner-accepted terminus takes effect at `coverage-required` once any response the terminal pass
  requires is performed, before the composition admits the next pass.

- A supplied standard-lane terminus now resolves to `owner-accepted` before the coverage branch when the terminal's
  response is settled. Outstanding responses retain `coverage-required`; frontline still refuses a terminus.
- Direct reducer regressions cover clean and unconverged fix checks at the ceiling, pending responses, and frontline.

### `[x]` **1.8 Retire the Errand's hosted correction and predict its next pass by the rule — § 2.5, § 7.2, § 7.9**

- _Goal:_ An Errand's pass after a hosted pass with material fixes is a local fix check rather than a hosted incremental
  request, the complete pass after a converged look at a head that already holds a review reaches a hosted source by
  rank, and respond's predictions — the next pass's coverage and the fix consequence — follow the rule.

    - `[x]` **1.8.a Remove the Errand's hosted correction**
        - Removed hosted correction resolution, admission, and its obsolete remedy. Hosted Errand requests now take
          complete coverage only; direct incremental requests refuse before capacity with the local fix-check remedy.
        - Status names ordinary local prepare after material fixes and returns the ranked hosted complete action at a
          head with a converged fix check. Historical incremental records remain readable under `incremental`.
        - Both Errand integration suites pass, including direct complete-request refusal after material fixes and
          successful hosted continuation after the local check. Legacy fixtures now supply configured sources and
          repository-derived context; malformed identity refuses and succeeds after repair.

    - `[x]` **1.8.b Predict the Errand's next-pass coverage by the rule**
        - Errand fix coverage now depends on a configured local reviewer plus materiality or incremental retrigger;
          provider identity and retention no longer determine the prediction. Extracted the consequence projection.
        - The producer report cases and a focused policy matrix cover material and minor fixes under both retriggers,
          including missing local configuration and a removed reviewing source.

    - `[x]` **1.8.c Make the fix consequence follow convergence**
        - A delivery member's minor fix after a `full-final` fix check predicts a complete successor or a ceiling
          decision. Complete passes and incremental-policy minor fixes retain their existing lane closure.
        - Consequence regressions preserve the complete-pass and incremental closures; all 123 focused cases pass.

### `[x]` **1.9 Give `run-errand` its `coverage-required`, selection, and stop arms — § 2.4, § 2.5, § 6.5, § 8.2**

- _Goal:_ `run-errand` dispatches every state the rule now reaches — `coverage-required` before and after the response,
  the driver's `ready` after a converged look, local prepare's selection, and the Owner's stop from `coverage-required`
  — and an Errand's `full-final` lane runs end to end through a fix check to a closing complete pass, before and after
  its pull request.

- _Context:_ Workflow text changes in the package's `arc/` source and then in the `.arc/` copy, in the shipped
  register.

    - `[x]` **1.9.a Add the `coverage-required`, `ready`, and selection arms to the resolve dispatch**
        - Resolve dispatch sends response-due coverage to dispositions and settled coverage to ordinary local prepare;
          ready states follow the driver's source. Local coverage choices are shown and replayed before launch/attest.

    - `[x]` **1.9.b Admit the Owner's stop from `coverage-required`**
        - Settled-response coverage admits the existing open-PR conversational risk offer; pending responses still run
          first, and before PR creation the stop defers to the opened target. No durable terminus is recorded.

    - `[x]` **1.9.c Restate the rules the arms now follow**
        - `full-final` convergence distinguishes complete passes from fix checks. Hosted requests are complete; forced
          hosted selection ends at material fixes, whose declined successor uses the local route. Supplemental requests
          take status's complete pass. Package and installed workflow copies match; 87 workflow contract cases pass.

    - `[x]` **1.9.d Drive an Errand's `full-final` lane end to end**
        - Real-Git integration cases cover local pre-PR closure, the hosted-first pre-PR wait, and hosted material
          findings through a local fix check to ranked hosted complete closure. Completed local replay now matches
          coverage, allowing the same-head complete successor while preserving idempotent replay of its own pass.
        - All 33 Errand cases pass; workflow contracts check complete hosted requests and local coverage selection.

## **Phase 2:** The work-unit paths — pre-publication, the published singleton, and a delivery member

_Purpose:_ Carry the rule through the surfaces only the work-unit path has: pre-publication's dispatch, the chunk
measure, a delivery member's re-check, the work-unit coverage selection and its refusals, the published singleton's
local pass, the Owner's stop there, the removal of hosted incremental review, and the bounded check at an applicability
stop.

_Design decisions:_ The delivery re-check keeps its source (Task 2.3) before status's selection sends every delivery
pass after an unconverged one down that route (Task 2.4). Status carries a driver refusal as one remedy that re-runs
status, its text naming each option the route allows. Workflow and method text changes in the package's `arc/` source
first, then in the `.arc/` copy by targeted edit.

### `[x]` **2.1 Resolve pre-publication's next pass by the rule, and carry the chosen scope on — § 2.2, § 2.4, § 3.3**

- _Goal:_ Pre-publication re-resolves a converged look to the complete pass by rank and otherwise surfaces
  `coverage-required` as an unsettled standard state, `prepare-work-unit` dispatches it and local prepare's selection,
  and the scope the chunk gate chose reaches local prepare as it already reaches the procedure's `--lanes`.

    - `[x]` **2.1.a Re-resolve after a converged look, and pin `coverage-required` as unsettled**
        - Standard composition now uses the shared continuation binder. Converged fix checks admit complete review by
          configured rank; hosted-first review reserves the publication target. Unperformed minor and material responses
          retain the response route and its coverage policy; performed material responses retain the unsettled stop.
        - Four cadence cases cover both source ranks and response precedence. The rank cases failed before the change;
          reconstructing the response flag demonstrated the inherited response-due assertions fail before restoration.

    - `[x]` **2.1.b Add `prepare-work-unit`'s arms**
        - The workflow dispatches response-due coverage to dispositions and settled coverage to ordinary local prepare.
          Local selection shows the typed choices and recommendation, then replays the chosen admission before launch.
          Convergence and additional-pass rules distinguish a full-final fix check from a closing complete pass.

    - `[x]` **2.1.c Carry the chosen scope into local prepare**
        - The local-prepare arm carries the chunk gate's selection as `policyJudgment.scopeMode` and preserves it in
          procedure re-entry. Authoritative and installed workflow copies match.

### `[ ]` **2.2 Measure a fix check's chunks over its own range — § 3.3**

- _Goal:_ A fix check's chunk measure counts its own range, `predecessorHeadSha..headSha`, on and off the delivery
  path, taken once the pass's coverage is known, while a complete pass and a first pass measure the whole target.

    - `[ ]` **2.2.a Measure on the delivery path after the coverage choice**
        - Status passes the chosen coverage and its correction scope to `resolveDeliveryMemberScopeSelection`
          (`status-delivery-scope.ts`, called from `status-composition.ts`), which counts the fix range for a fix check
          and the whole member for a complete pass; local prepare's re-check measures the same way.
        - Build `test-first` (one behavior at a time):
            - A fix check on a large member with a small fix range is not chunked.
            - A complete pass on the same member measures the whole member.

    - `[ ]` **2.2.b Measure off the delivery path in the workflows**
        - `prepare-work-unit` and `integrate-work-unit`'s singleton route measure after the pick and before the call that
          carries it: for a fix check, `arc review changeset resolve -` names the correction scope's
          `predecessorHeadSha` as `diffBaseSha` (`resolveMemberCoordinates` takes the commits verbatim), and the gate's
          exact target is that range. `integrate-work-unit`'s singleton route gains the measure its chunk gate refers
          to.
        - A pre-publication fix check after materialization takes the fix-range measure; `deliver-stack`'s retained
          whole-member selection serves only a complete pass.

    - `[ ]` **2.2.c State status's measure as `deliver-stack`'s exact check**
        - `deliver-stack`'s "requires another exact check" sentence names status's measure as that check, and the chunk
          gate in `deliver-stack` and in `integrate-work-unit`'s delivery route reads one measure, taken after the
          coverage choice.

### `[ ]` **2.3 Pass a delivery admission's source through local prepare's re-check — § 7.6**

- _Goal:_ A delivery admission chosen with `--source delegated-agent`, or with a forced local source, survives local
  prepare's real re-check instead of coming back as `coverage-required`.

- _Note:_ A sibling-sweep fix outside the finding's cited file meets delivery's authoring rebind; see
  `notes-review-coverage-cadence.md` § Execution caution.

    - `validateDeliveryAdmission` (`runtime/local-prepare-composition.ts`) re-runs status with the admission's coverage
      but not its source, and the status port reads the source only from the request (`createReviewStatusPort`,
      `status-composition.ts`), so `selectReviewCoverageChoice` matches nothing; the re-check passes the admission's
      source.
    - Build `test-first` (one behavior at a time):
        - A test runs the real re-check with a source-bearing admission and admits it; today's integration test
          replaces the re-check (`review-fan-out-lifecycle.test.ts`) and `delivery-position-suite.ts` admits no
          selected source.

### `[ ]` **2.4 Ask the work-unit coverage question once, and refuse a choice it did not list — § 6.4, § 6.5, § 7.3**

- _Goal:_ On the work-unit path the coverage question is asked once at each moment — status after material fixes,
  offering `delegated-agent` alone; nothing after a converged look; local prepare never again on the delivery path —
  status refuses a `--source` and `--coverage` pair that matches no listed choice, and a driver refusal reaches the
  agent with its remedy.

    - `[ ]` **2.4.a Emit the discharge's selection after material fixes**
        - The discharge (`hosted-reservation-discharge.ts`) builds the selection (`ReviewCoverageSelectionActionSchema`)
          whenever a correction scope resolves after material fixes: where the ordered-source loop returns the next
          source with `correctionContext()`, which a complete pass's material-fix terminal reaches, and at the two
          existing `coverage-required` sites — the current-terminal branch and `retainedTerminalPolicyStop` — which an
          unconverged fix check reaches under `full-final`. Today it builds one only at `coverage-required` and status
          otherwise defaults to complete (`status.ts`). `coverageSelectionChoices` (`hosted-reservation-support.ts`)
          receives `delegated-agent` alone. Where the chain fails, the complete default stands.
        - The selection's prompt names the route that reached status and no `--json`, which `review status` rejects
          (`cli.ts`); today it always names `--work-unit`. Task 4.3.b adds its considerations.
        - Build `test-first` (one behavior at a time):
            - After a complete pass with material fixes, status offers a `delegated-agent` fix check and a local complete
              pass.
            - Where the chain fails after material fixes, status emits no selection and admits a local complete pass.
            - After a base move that follows an unchecked fix, a delivery member's next pass is a local complete one.
            - The prompt's command runs as written on the `--work-unit` route and on `deliver-stack`'s `--target` route.

    - `[ ]` **2.4.b Admit the complete pass with no selection after a converged look**
        - At the two `coverage-required` sites, the discharge admits complete coverage without emitting a selection when
          the context reads the predecessor converged under `full-final`, on a delivery member and on the singleton.
          On the singleton today `coverage-required` returns `nextSource: null`, `resolveSingletonRequest`
          (`status-singleton.ts`) builds no request, and the result falls to a bare `review-required` (`status.ts`).
        - Build `test-first` (one behavior at a time):
            - After a converged fix check on a delivery member, status emits no selection and names the complete pass by
              rank.
            - After a converged fix check on the singleton, status names a hosted complete pass by rank.

    - `[ ]` **2.4.c Refuse a pick that matches no listed choice**
        - Status re-emits the selection silently when `--source` and `--coverage` match no choice, in
          `status-composition.ts` and in `composeDeliveryReviewObligation` (`status.ts`); both refuse instead, naming the
          listed choices (`selectReviewCoverageChoice`). A lone `--coverage` that matches exactly one listed choice
          selects it, which keeps the existing `--coverage complete` remedy working. Status's `--source` naming a hosted
          source on the singleton (`resolveSingletonRequest`) meets Task 1.5.b's refusal.
        - Build `test-first` (one behavior at a time):
            - With no pair supplied, the selection is emitted.
            - A listed pair is admitted, and a lone `--coverage` matching one listed choice selects it.
            - An unlisted pair, or a lone `--coverage` matching none, is refused with the listed choices named.

    - `[ ]` **2.4.d Carry a driver refusal and its remedy through status**
        - Today a driver's non-ready admission becomes generic blocked text (`status.ts`), a thrown error becomes blocked
          detail (`status-composition.ts`), and a singleton `blocked` result maps to `status-unavailable` with a retry
          remedy. Status's refusal instead carries the driver's diagnostic code (Tasks 1.5.b, 1.5.c) and one remedy
          (`SpineRemedy`, `integration/spine-refusal.ts`) whose argv re-runs status, with `--source delegated-agent`
          where that is the fix.
        - The remedy text names each option the route allows: on the delivery work-unit route both of § 7.3's remedies;
          on the published singleton and in `deliver-stack`'s member review only adding `delegated-agent`, since neither
          takes a terminus.
        - Build `test-first` (one behavior at a time):
            - A forced hosted source after a material fix is refused on each status route with the code and the remedy.
            - With `delegated-agent` unlisted, the delivery work-unit route names both remedies and the singleton names
              one.

    - `[ ]` **2.4.e Add status's selection arm to `deliver-stack` and `integrate-work-unit`'s delivery route**
        - Each shows the choices with their text and a recommendation, takes the Owner's pick, and re-runs status with
          it, and each carries a refusal's remedy as Task 2.4.d returns it.

### `[ ]` **2.5 Run the published singleton's local pass through local prepare — § 7.5**

- _Goal:_ After an unconverged hosted pass, the published singleton's next pass runs as an ordinary local prepare over
  the work-unit branch, bound to the reservation's obligation and continuing the singleton's lane, and the discharge
  and hosted request admission read that local terminal, its source, and earlier local attempts.

    - `[ ]` **2.5.a Name local prepare from the singleton route**
        - `composeSingletonRequest` (`status.ts`) turns the driver's `ready / local-prepare` into a status result variant,
          beside the delivery one (`ReviewStatusLocalPrepareSchema`), that names an ordinary `arc review local prepare -`
          request with no member selector (`LocalPrepareRequestSchema`, `runtime/local-prepare.ts`): its target, the
          lineage boundary, and the reservation's obligation. The agent supplies `evaluatorIdentity`, as on delivery. It
          replaces a bare `review-required` whose `run-review` no workflow dispatches, is stored nowhere, and names local
          prepare only when the driver selects `delegated-agent` from the reservation's sources; Task 1.5.c's stop covers
          the rest.
        - Build `test-first` (one behavior at a time):
            - After a hosted singleton pass with a material fix, status names the local prepare request.

    - `[ ]` **2.5.b Bind the singleton's local request to the reservation's obligation**
        - With no `deliveryAdmission`, local prepare routes the obligation from the caller's `routingFacts`, and the
          discharge binds terminals to `reservation.obligation` (`resolveTerminalPolicy`), so a mismatch fails
          `resultMatchesPolicy` (`review-policy-evidence.ts`). When a hosted reservation binds the submission boundary
          and no `deliveryAdmission` is supplied, local prepare takes the obligation from the reservation, as
          `validateDeliveryAdmission` binds it for delivery, and refuses routing facts that route elsewhere.
        - Build `test-first` (one behavior at a time):
            - The singleton's local result's requirement equals `reservation.obligation`.
            - Routing facts that route to another obligation are refused.

    - `[ ]` **2.5.c Route the singleton's `coverage-required` to local prepare**
        - The discharge returns only a `detail` with `nextSource: null` there today, and status's fallback also serves
          other null-source discharges — conflicting coverage and incomplete earlier evidence. The discharge result
          gains its terminal policy state, and status routes only `coverage-required` to local prepare. It is reached
          only after an unconverged look, and no response is pending there, since the discharge resolves terminal policy
          only over a `clean` or `settled-findings` terminal.
        - Build `test-first` (one behavior at a time):
            - The singleton's `coverage-required` routes to local prepare.
            - The other null-source discharges keep their routes.

    - `[ ]` **2.5.d Read a vehicle-less local result in the discharge and hosted request admission**
        - On a subject with no vehicle, four readers accept a local result in the same lineage as `delegated-agent`
          without a `deliveryAdmission`: `admittedLocalTerminal` (`hosted-reservation-discharge.ts`),
          `confirmIncrementalPredecessorApplicability` (`hosted-reservation-support.ts`), `queryEarlierReviewAttempts`
          (`earlier-review-attempts.ts`), which counts the lineage's local passes from before the pull request as
          `readLaneProgressAcrossLineage` does and takes the pull request from its own selector, and
          `candidateCapacityAttemptMatchesTarget` (`hosted-reservation-admission.ts`), which feeds the singleton's hosted
          request admission (`assertEvidenceBoundCandidateHostedReservationPolicyAdmission`).
        - Build `test-first` (one behavior at a time):
            - The discharge reads a singleton's local fix check as its terminal and names `delegated-agent` as its
              source.
            - A local attempt at an earlier head, before or after the pull request, is found by the earlier-attempt
              query.
            - After a converged singleton local fix check, the hosted complete pass by rank is admitted at request time.

    - `[ ]` **2.5.e Dispatch it from `integrate-work-unit`**
        - An arm for the local prepare request replaces status's `run-review` result, which no workflow dispatches; the
          route's existing `review-local-prepare` arm passes its `action` as a `deliveryAdmission` and stays
          delivery-only. The new arm runs local prepare's launch, attest, reduce, and respond sequence for a request with
          no `deliveryAdmission`, and an arm for local prepare's selection follows it.
        - Local prepare resolves the Candidate lineage from the submission boundary (`resolveLineage`,
          `runtime/local-prepare-composition.ts`), so the pass continues the singleton's lane and asks the coverage
          question itself.
        - In § 2) Review iteration, for both the delivery and singleton routes, restate both rules: a converged result
          replays as complete under `full-final` only for a complete pass, and `--additional-pass` follows a converged
          complete pass; `convergedSignal` refuses one after a fix check under `full-final` (Task 1.2.a).

    - `[ ]` **2.5.f Drive the singleton's lane end to end**
        - Build `test-first` (one behavior at a time):
            - After a hosted pass with a material fix: a local fix check through local prepare, a converged fix check, and
              a hosted complete pass by rank closing the lane.
            - A base move after an unchecked fix makes the next pass a local complete one.

### `[ ]` **2.6 Offer and carry the Owner's stop at `coverage-required` on the work-unit path — § 8.2**

- _Goal:_ The Owner's stop is offered and carried at `coverage-required` on the delivery path's work-unit route and in
  pre-publication once the terminal's response is performed, as Task 1.7 lets the driver honor it.

    - `[ ]` **2.6.a Bind the delivery terminus offer at status's `coverage-required`**
        - After Task 2.4.b, status reaches `coverage-required` only after material fixes, so the offer
          `bindDeliveryReviewTerminusOffer` (`status.ts`) binds there is disclosed as resting on fixes no reviewer
          re-examined. After a converged fix check status names the complete pass, and the offer rides its request as
          today (`hasCompletedCompleteReviewPass`).
        - `isDeliveryReviewMemberDischargedByOwnerTerminus` stops counting a pending coverage selection, or the
          discharge's `nextSource: null` at `coverage-required`, as an intervention (`hasPendingIntervention`), and
          `ReviewStatusCoverageRequiredSchema` gains the offer.
        - Build `test-first` (one behavior at a time):
            - After material fixes, status's `coverage-required` carries the offer with its disclosure, and an accepted
              terminus discharges the member.
            - After a converged fix check, the offer rides the complete pass's request.

    - `[ ]` **2.6.b Pin pre-publication's terminus at `coverage-required`**
        - `pre-publication-procedure.ts` already takes a terminus from the driver's `owner-accepted`; after Task 1.7 the
          test passes with no change to the procedure.
        - Build `test-first` (one behavior at a time):
            - A supplied terminus after a clean converged fix check settles pre-publication's standard lane.

    - `[ ]` **2.6.c Offer the stop in `prepare-work-unit` and `integrate-work-unit`'s delivery route**
        - Each `coverage-required` arm offers the stop once the response is performed. The published singleton takes no
          new terminus after publication (§ 8.3), so `integrate-work-unit`'s singleton route offers none.

### `[ ]` **2.7 Remove hosted incremental review — § 7.9, § 7.10**

- _Goal:_ ARC never requests hosted incremental review: its writers are gone, every hosted admission and both hosted
  status routes refuse incremental coverage with a remedy naming the local fix check, a stored hosted record holding
  incremental coverage still parses and replays, and a request already in flight ends with a remedy.

- **Additional Context:** `notes-review-coverage-cadence.md` § Codex probe and § CodeRabbit probe

    - `[ ]` **2.7.a Delete the hosted incremental writers**
        - The correction-review capability (`hostedProviderAdmitsCoverage` and `hostedProviderReviewsIncrementally`,
          `hosted/correction-review-capability.ts`, and `correctionReview` in both registrations), with its users in
          `status.ts`, `hosted-reservation-admission.ts`, and `hosted-reservation-support.ts`; the Errand's users go in
          Task 1.8.
        - CodeRabbit's incremental request — `request()`'s incremental arm — and its range-evidence writer
          (`nativeIncrementalCoverageEvidence`, `hosted/coderabbit.ts`). `COMMANDS.incremental` stays, since
          `requestCommandCoverage` and `nextRequestBoundary` read it.
        - Codex's `commands.incremental` and the incremental arm of its `request()` (`hosted/codex.ts`), and
          `coverageSelectionChoices`' hosted incremental choice, whose hosted complete choice stays.

    - `[ ]` **2.7.b Refuse incremental hosted coverage at every admission**
        - `assertHostedCoverageAdmission` (`hosted-reservation-admission.ts`) refuses incremental coverage outright where
          the capability check stood, since the request schema (`hosted/request.ts`) and stored records
          (`requestedCoverage`, `core/operation-state-schema.ts`) keep parsing it. It covers `authorizeCapacity`'s
          delivery-member and Candidate branches; the Errand branch's refusal is Task 1.8.a's. The singleton and delivery
          routes in `status.ts` that compose a hosted action refuse it the same way, with a remedy naming the local fix
          check, carried as Task 2.4.d carries a refusal.
        - Build `test-first` (one behavior at a time):
            - A hand-composed incremental hosted request is refused in each `authorizeCapacity` branch with the remedy.
            - Status's singleton and delivery routes refuse an incremental request on a hosted source.

    - `[ ]` **2.7.c Keep the read side, and end a request already in flight**
        - CodeRabbit's observer keeps recognizing `@coderabbitai review` and its reply as a request generation
          (`requestCommandCoverage`, `earlierRequestGenerationsSettled`, `nextRequestBoundary`, `commandReplyCompleted`);
          the stored-record readers (`lane-attempt-validation.ts`, `hosts/local/review-result-reader.ts`,
          `recordHostedAwaitAttempt`) and `HostedCoverageEvidenceSchema` (`hosted/await.ts`) stay.
        - `validateHostedTerminalCoverage` (`hosted/await.ts`) requires coverage evidence on a CodeRabbit incremental
          terminal, which only the deleted writer produced, so an incremental request acknowledged before the change
          ends as a terminal failure with a remedy naming the complete pass or the local fix check.
        - Build `test-first` (one behavior at a time):
            - A stored hosted record with incremental coverage parses and replays.
            - A hand-typed `@coderabbitai review` stays a competing request generation that can fail ARC's request with
              `provider-request-generation-overlap` and never counts as a pass.
            - An incremental CodeRabbit request in flight ends with the remedy.

    - `[ ]` **2.7.d Update the help and the overview**
        - `cli.ts`'s "Requested hosted coverage" help changes; `HostedReviewCoverage` and the other type names stay with
          the stored schema. `integrate-work-unit`'s "only the explicit supplemental route below returns incremental
          coverage" goes with Task 2.8's removal.
        - `TECHNICAL-OVERVIEW.md` § Self-Hosting Review Gate, a project document, states that fix checks run locally
          and hosted sources run complete passes; its "standard-review stream" stays.

### `[ ]` **2.8 Run the bounded check at both applicability stops — § 7.7**

- _Goal:_ At both applicability stops over a bounded residual, a fresh-context local evaluator runs one check of what
  the movement changed before the Owner chooses, the supplemental `--coverage incremental` arms that ran nothing are
  gone, and a fix the check prompts lands by its own route outside and inside a bound delivery.

    - `[ ]` **2.8.a Give `assess-evidence-applicability` the bounded check**
        - What it reads: a merge's conflict resolution against Git's automatic merge (`git log --remerge-diff`) or a
          rewrite's interdiff (`git range-diff`), the residual's files, and dependencies across the two sides. It carries
          that context explicitly, since the evaluator remembers nothing of the earlier pass.
        - Where it runs: only at the two review-applicability stops — status's `resolve-review-applicability` and the
          Candidate checkpoint at the final reconcile — not at `run-errand`'s merge step or on a verification residual,
          which the method also serves. It does not run at a `residual-unbounded` stop — 200 paths or 16 KiB of path
          text (`classifyReviewContributionApplicability`; the Candidate checkpoint's own in
          `candidate-applicability.ts`) — nor where a complete pass follows a mid-round base move (Task 1.6.c). It is not
          a pass: no lane attempt, no ceiling, nothing stored beyond what the stop records.
        - What it returns: the method's `{ recommendation, residual, rationale }` contract stays, and the check's findings
          go to the Owner beside it as a complete disposition set. `supplemental` recommends `covered`, or
          `targeted-check` at the reconcile with the check as its evidence; `fresh` recommends `review-required`, or
          `changed` at the reconcile, which the agent recommends whenever the check finds a material defect or prompts a
          fix.

    - `[ ]` **2.8.b Fire it at `integrate-work-unit`'s pre-reconcile stop**
        - The route already declares the method and fires it after the reconcile; it gains the pre-reconcile fire-point
          where it says today that it does not. `deliver-stack`'s member-rewrite stop already fires it.

    - `[ ]` **2.8.c Remove the supplemental `--coverage incremental` arms**
        - In `deliver-stack` and `integrate-work-unit`'s delivery route, which end at `coverage-unsupported`
          (`status.ts`), and `integrate-work-unit`'s singleton arm, which ends at `status-unavailable` or a bare
          `review-required` that drops the coverage (`composeSingletonRequest`).

    - `[ ]` **2.8.d Land a prompted fix outside a bound delivery**
        - The fix is committed after `arc check gate commit` as an ordinary change, since the check leaves no review
          result for `arc review respond -` to bind. The Owner then chooses once, at the stop raised over the fixed head,
          and the check does not run again; `covered`, or `targeted-check`, is disclosed as resting on a fix no pass has
          read.

    - `[ ]` **2.8.e Land a prompted fix under a bound delivery**
        - The Owner chooses first, and the choice governs only until the fix lands. While an approved fix is unlanded
          the agent requests no pass for that member and takes it to no landing preparation. The fix takes the
          delivery's correction route — a correction task in the owning member's section, covered by a plan revision
          (`amend-design` § Under a bound delivery plan), through `arc delivery review-fix continue -` — authored only
          when the continuation holds no other correction: none from a pending review response (`inspectDeliveryEntry`'s
          `pending-review-response`, `lib/delivery/entry-inspection.ts`) or a pending verification
          (`review-fix-verification-required`).
        - Status then asks again over the fixed head, and the check does not run again; a `covered` choice there is
          disclosed as resting on a fix no pass has read.

    - `[ ]` **2.8.f Replace "focused supplementation" in the overview**
        - `TECHNICAL-OVERVIEW.md` § Self-Hosting Review Gate names the bounded check at an applicability stop instead.

## **Phase 3:** The delta check after a plain commit

_Purpose:_ Give a commit after a converged look that answers no finding a scoped local look whose range Git proves,
on an Errand before and after its pull request, in pre-publication, and on the published singleton, without letting
that proof carry an earlier review to a later head.

_Design decisions:_ The range proof is the chain proof's third ground (Task 1.1.b), returned as a `range-proven` result
of its own that only correction-scope resolution and chain re-confirmation accept; every other check of a confirmation's
result, and every consumer that carries an earlier attempt to the current head, treats it as not applicable. A
confirmation reports its ground; the context's `incremental.basis` reads `delta-check` when the current leg's ground is
the range proof. Workflow text changes in the package's `arc/` source first, then in the `.arc/` copy.

### `[ ]` **3.1 Prove a plain commit's range from Git, and report it as its own result — § 3.5**

- _Goal:_ A commit after a converged look has a range proof whenever its base ref, diff base, and diff-base tree equal
  the predecessor's and its head descends from the converged head with no merge commit between, and the chain proof
  reports it as `range-proven` only after today's grounds and the performed-response test, so every leg that holds today
  keeps its ground.

    - `[ ]` **3.1.a Build the range proof**
        - A new module. It takes the predecessor's convergence from the next-pass context and a Git exec bound to the
          checkout, and reads through `readAncestry` (`lib/work-unit/git-decomposition-object-readers.ts`) and
          `readCheckMerges` (`lib/checks/merged.ts`), which throws on failure, so the module catches it and fails closed.
          The head must differ from the predecessor's, so the proof never holds at the converged look's own head.
        - Build `test-first` (one behavior at a time):
            - A linear commit after a converged look at an unchanged base proves.
            - The converged look's own head, a moved base, a merge commit in range, a head that does not descend, an
              unconverged predecessor, and a Git failure each fail to prove.

    - `[ ]` **3.1.b Add it to the chain proof as its own result**
        - The chain proof tests any ground the site's confirmation accepts today — among them an equal subject digest
          (`noPullRequestCandidatePriorApplicability`, `pre-publication-composition.ts`), exact-target equality,
          contribution applicability (`projectGitReviewContributionApplicability`), mechanical carry
          (`projectMechanicalReviewApplicabilityCarry`), a recorded Candidate selection
          (`candidateReviewApplicabilitySelections`), the earlier-attempt read (`incrementalApplicabilityFromEarlierRead`),
          and delivery's contribution proof — then the performed-response test, and returns `range-proven` only when none
          holds.
        - `IncrementalPredecessorApplicability` (`incremental-coverage-basis.ts`) gains the result.
          `resolveIncrementalCorrectionScope` and `resolveCoverageChain` accept it, and every other check of a
          confirmation's result fails closed on it. The current leg's result sets the context's basis to `delta-check`;
          nothing stores it. `confirmDeliveryMemberIncrementalApplicability` never takes the range proof.
        - Build `test-first` (one behavior at a time):
            - A leg that holds today keeps its ground when the range proof would also hold.
            - A leg only the range proof supports returns `range-proven` and resolves a correction scope.
            - An existing consumer that checks for `applicable` treats `range-proven` as not applicable.

### `[ ]` **3.2 Admit a delta check's scope, recorded as a fix check's attempt — § 3.5**

- _Goal:_ After a converged predecessor whose head no response produced, a correction scope resolves only with its
  range proof, carrying the predecessor's required findings, and the coverage chain re-confirms that leg on every later
  round; the attempt and its instructions are a fix check's, less the closure axis.

    - `[ ]` **3.2.a Resolve the delta check's scope**
        - `buildIncrementalCorrectionScope`'s bound (Task 1.3.a) gains its sibling: a scope from the converged
          predecessor's head, with its required findings, when the current leg's result is `range-proven`.
          `resolveCoverageChain` re-confirms a delta leg on every later round. The attempt's record is the incremental
          attempt a fix check writes (`IncrementalReviewScopeSchema`, `LocalReviewCoverageAdmissionSchema`).
        - The next-pass context admits a delta check only where `delegated-agent` can run — listed, or the list empty and
          local prepare falling back to it — never on a delivery member, and under `full-final` only on an Errand with an
          open pull request and in pre-publication.
        - _Note:_ A plain commit whose leg holds on a ground of today's — an Errand's commit after its pull request that
          touches only non-reviewable paths, through contribution applicability — gets no delta scope, since its
          predecessor's response fixed nothing. It relies on `readCarriedErrandReview`'s carry, and a complete pass runs
          where that fails.
        - Build `test-first` (one behavior at a time):
            - A proven range after a converged look resolves a scope from its head with its required findings.
            - A later fix check over a delta leg resolves an adequate chain.
            - With `delegated-agent` unlisted, no delta check is admissible; nor is one on a delivery member.
            - Under `full-final`, a delta check is admissible on an Errand with an open pull request and in
              pre-publication only.

    - `[ ]` **3.2.b Give the delta check its instructions**
        - The context's basis reaches `publishLocalReviewPreparation` (`core/local-prepare.ts`) beside `guidance` in its
          dependencies, an instruction input that is never persisted, since nothing stored tells a delta check from a
          fix check. `localReviewerInstructions` gives a delta check the incremental prompt — the whole range reviewed,
          the clean rules applied — and the required findings' re-examination, without the closure axis, which needs a
          fix to close.
        - Build `test-first` (one behavior at a time):
            - A delta check's instructions omit the closure axis and keep the other three.
            - `LocalReviewSourceSchema`, `IncrementalReviewScopeSchema`, `LocalReviewCoverageAdmissionSchema`, and the
              operation-state schema are unchanged.

### `[ ]` **3.3 Run the delta check on `delegated-agent`, admitted without a selection — § 3.5, § 7.2**

- _Goal:_ Where a delta check is admissible, the driver selects `delegated-agent` whatever the configured rank and
  reserves no hosted source, refuses any other forced source with a remedy naming the delta check, and local prepare
  admits it without a selection, while complete coverage supplied in local prepare's request runs a local complete
  pass instead.

    - `resolveReviewPolicy`'s restriction (Task 1.5.a) also applies when the context admits a delta check; a forced
      source other than `delegated-agent` resolves to `unavailable / stop` with a diagnostic code of its own and a remedy
      naming the delta check, in Task 1.5.b's form.
    - Local prepare fixes its coverage default in `resolveLocalPreparationContext` (`runtime/local-prepare.ts`) before
      any predecessor is read, and replay checks against it. The selection's `ready` result
      (`resolveLocalReviewCoverageSelection`) instead returns the admitted coverage and scope, which
      `settleLocalPreparation` and its replay (`replayContextMatches`, `requireSharedLogicalPassCoverage`) adopt, so
      with no coverage supplied local prepare admits the delta check where one is admissible. Complete coverage supplied
      in `coverageAdmission` runs a local complete pass with no correction scope (`LocalReviewCoverageAdmissionSchema`
      refuses one), counted against the ceiling.
    - Build `test-first` (one behavior at a time):
        - With a hosted source ranked first, an admissible delta check runs on `delegated-agent` with no hosted-first
          reservation.
        - A forced hosted source is refused with the delta-check remedy.
        - Local prepare with no coverage supplied admits the delta check; with complete supplied, a local complete pass.
        - A replayed prepare after a delta check adopts the admitted coverage.

### `[ ]` **3.4 Keep the range proof out of every consumer that carries an earlier attempt — § 3.5**

- _Goal:_ No consumer that carries an earlier attempt from its own head to the current head accepts a leg only the range
  proof supports, so a converged look alone never closes the lane at a new head, while the delta check's own attempt, a
  carried attempt's own chain, and every carry that holds today on another ground are unaffected.

    - The exclusion is structural: no carry calls the chain proof, and the earlier-attempt read never sees
      `range-proven`. The consumers are pre-publication's historical-attempt carry (`applicableHistoricalAttempt`,
      `pre-publication-request.ts`, through the carry role of `confirmPriorProducerApplicability`); the discharge's
      branches that settle on an earlier attempt marked `retain-prior-attempt` (`cleanApplicable` and
      `settledApplicable`, `hosted-reservation-discharge.ts`), not its current-terminal branch, and hosted request
      admission's `applicabilityAction` (`handlers/review.ts`), both of which read the mark
      `projectEarlierReviewApplicability` (`earlier-review-applicability.ts`) sets, the discharge's guard locus; and
      Errand status's carry check (`readCarriedErrandReview`), whose contribution applicability never takes the range
      proof.
    - Build `test-first` (one behavior at a time):
        - Pre-publication's carry and the discharge's retained branches treat a range-proof-only leg as not applicable,
          and the earlier read still marks a plain commit's earlier attempt `stop`.
        - A delta check's own attempt at its head is admitted and, under `incremental`, closes the lane when it
          converges.
        - A carried attempt whose own chain holds a delta leg still carries; a carry on an equal subject digest still
          holds.
        - Errand status never carries an earlier review across a plain commit without a look.

### `[ ]` **3.5 Run the delta check on an Errand, before and after its pull request — § 3.5**

- _Goal:_ On an Errand, a plain commit after a converged look takes a delta check before and after its pull request
  under `incremental`, closing the lane when it converges; under `full-final` it runs only with a pull request open and
  is followed by the complete pass, and before the pull request the complete pass runs with no delta check first.

    - `[ ]` **3.5.a Reach every Errand chain confirmation**
        - Each refuses the leg today: it requires a findings predecessor (`exactErrandResponseContext`;
          `sharesCorrectionBase`) whose fix produced the current head, and with a pull request open contribution
          applicability returns `review-required`. The chain proof's range-proof ground reaches all of them: local
          prepare's (`confirmErrandFixResponseApplicability` before the pull request;
          `createLocalContributionConfirmation`, through `confirmNonDeliveryIncrementalApplicability`, after), the
          `arc review resolve -` handler's, Errand status's chain (`confirmErrandCorrectionPredecessor`) and its
          current-head proof (Task 1.1.d), respond's Errand chain (`runtime/respond-composition.ts`), and hosted request
          admission's Errand branch (`handlers/review.ts`).
        - Build `test-first` (one behavior at a time):
            - Each confirmation admits a delta leg before and after the pull request, so respond's prediction and local
              prepare's admission agree.

    - `[ ]` **3.5.b Close or continue the Errand's lane by its retrigger**
        - Under `incremental` a converged delta check closes the lane; a hosted complete pass after it runs through an
          additional pass (`additionalPassAuthorization`, which Errand status's lane request carries). Under
          `full-final` with a pull request open it runs as a lane attempt and the complete pass follows; before the pull
          request the complete pass runs.
        - Build `test-first` (one behavior at a time):
            - Under `incremental`, a plain commit after convergence takes a delta check that closes the lane, before and
              after the pull request.
            - Under `incremental`, a hosted additional pass after a converged delta check is admitted at hosted request
              admission.
            - Under `full-final` with a pull request open, the delta check runs and the complete pass follows.
            - Under `full-final` before the pull request, the complete pass runs with no delta check.

    - `[ ]` **3.5.c Say so in `run-errand`**
        - The workflow names the delta check after a plain commit and the Owner's outcomes in order: a local complete
          pass at once through `coverageAdmission`, then a hosted complete pass where the order reaches one.

### `[ ]` **3.6 Run the delta check in pre-publication once the Candidate checkpoint advances the same Candidate — § 3.5**

- _Goal:_ In pre-publication, after the Candidate checkpoint's `covered` or `targeted-check` advances the same Candidate
  to a plain commit's head, the next pass is a delta check, while `changed`, which roots a new Candidate, leaves the
  complete pass as today.

    - The checkpoint guards the Candidate's own currentness and stays as it is. The historical-attempt carry still drops
      the earlier attempt, since the subject changed. The next pass's scope resolves through
      `confirmPrivateCandidateCorrectionBasis`, which today refuses a predecessor without findings
      (`privateCandidateTargetsMatch`), and the composition's current leg (Task 1.1.e), both taking the range proof
      through the chain proof, so with a hosted source ranked first the driver reserves none; respond's chain
      confirmation (`confirmNoPullRequestCandidatePriorProducer`, `runtime/respond-composition.ts`) re-confirms the leg.
    - Under `incremental` a hosted complete pass after a converged delta check runs through an additional pass, which
      pre-publication's lane request carries; under `full-final` the delta check runs as a lane attempt and Task 4.6's
      arm follows it.
    - `prepare-work-unit` names the delta check after a plain commit.
    - Build `test-first` (one behavior at a time):
        - After `covered` advances the Candidate, the next pass is a delta check whose leg respond re-confirms, and with
          a hosted source ranked first no hosted source is reserved.
        - Under `full-final`, the complete pass follows the delta check; under `incremental`, a converged delta check
          settles the standard lane.
        - After `changed`, the complete pass runs.
        - A re-rooted Candidate admits no delta check.

### `[ ]` **3.7 Request the delta check from the published singleton's discharge under `incremental` — § 3.5**

- _Goal:_ Under `incremental`, the published singleton's discharge requests a delta check instead of the
  review-applicability stop when the earlier terminal converged and the range proof holds, carrying no source or
  invocation recovered from an earlier pass; under `full-final` the stop is unchanged, and status refuses a `--coverage`
  it cannot carry to the singleton's local pass.

    - `[ ]` **3.7.a Leave the stop branch for the delta check**
        - Today the discharge stops at `projectEarlierReviewApplicability` (`earlier-review-applicability.ts`) before
          coverage or the ceiling is read: `decision-required` maps to `stop` (`reviewApplicabilityConsumerAction`), and
          status composes `resolve-review-applicability` from the discharge's `applicability` (`status.ts`). Where the
          earlier terminal converged and the range proof holds, the discharge instead requests `delegated-agent` —
          whichever stop the plain commit's classification would raise, `decision-required` or an unbounded or
          unavailable one, since the delta check reviews the range itself — with the correction scope its
          `confirmCurrentApplicability` resolves.
        - The discharge's confirmations (`confirmCurrentApplicability`, `confirmIncrementalPredecessorApplicability`)
          test the range proof directly through the chain proof, never through the earlier-attempt read that maps a
          retained attempt to `applicable` (`incrementalApplicabilityFromEarlierRead`). The request carries no invocation
          recovered from an earlier attempt (`retainedOwnerCleanAttempt`, `hosted-reservation-support.ts`) and no source
          list cut from one (`configuredSourceSuffix`, `hosted-reservation-admission.ts`); the earlier attempt is never
          retained, and `covered` is not offered for a plain commit.
        - A converged delta check settles the lane, since the discharge takes no additional-pass authorization
          (`HostedReservationDischargeReaderArgs`); under `full-final` the stop is unchanged.
        - Build `test-first` (one behavior at a time):
            - Under `incremental`, a plain commit after a converged look requests a `delegated-agent` delta check, a
              commit whose residual is unbounded included.
            - A converged delta check discharges the singleton.
            - An earlier pass's forced hosted source neither reaches the driver nor drops `delegated-agent`.
            - Under `full-final`, the review-applicability stop returns.
            - A moved delivery member still meets the review-applicability stop with no delta check.

    - `[ ]` **3.7.b Refuse a `--coverage` status cannot carry**
        - Where status routes the singleton to its local prepare request (Task 2.5.a), it refuses a supplied
          `--coverage` (`resolveSingletonRequest`'s coverage, `status-singleton.ts`) with a remedy naming local prepare's
          `coverageAdmission`, rather than dropping it.
        - Build `test-first` (one behavior at a time):
            - A supplied `--coverage` on the singleton's local route is refused with the remedy.

    - `[ ]` **3.7.c Say so in `integrate-work-unit`**
        - The singleton route names the delta check under `incremental` and the local complete pass as the Owner's
          lighter alternative to re-rooting the Candidate.

## **Phase 4:** The next-pass offer, the lane read, and a complete pass's pointers

_Purpose:_ Give the Owner's decisions their facts and the agent's judgment its inputs — the offer's computed facts,
the read-only lane read, the offer's text, a complete pass's pointers, triage's rejection check, and the stop after a
clean fix check — then exercise the whole cadence across every path.

_Exit criterion:_ On an Errand before and after its pull request, in pre-publication, on the published singleton, and
on a delivery member, a `full-final` lane takes a local fix check after a material fix, does not close on a converged
fix check, and closes on a complete pass at the settled head with no material fix; and a plain commit after a
converged look takes a delta check wherever § 3.5 admits one and nowhere else.

_Design decisions:_ One typed facts shape, derived once, is what the offer text, the lane read, and the report render.
The lane read resolves its subject from the checkout as local prepare does, and the reviewer never receives its
rejections. Method and workflow text changes in the package's `arc/` source first, then in the `.arc/` copy.

### `[ ]` **4.1 Derive the next-pass offer's facts once — § 6.1**

- _Goal:_ One derivation computes the offer's facts from lane progress and disposition records — complete passes
  against the ceiling, fix-check rounds since the last complete pass and their results, the fix range's size against the
  target, whether the chain is proven, each round's two new-design signals, and the material trend — for the offer text,
  the report, and the lane read alike.

- _Note:_ Until Phase 5 the ceiling still counts every pass, so the facts report complete passes against the configured
  ceiling; Task 5.1 makes this derivation one of the readers that take the shared complete count.

    - A new module, with one typed result schema the three surfaces render (Tasks 4.2, 4.3, 6.4). It takes lane
      progress, the lineage's disposition records (`listDispositionRecords`, `core/ports.ts`), the next-pass context
      (Task 1.1.b), whose incremental fact is whether the chain is proven, and a Git exec bound to the checkout.
    - The material trend lists the lane's looks in order, each labeled a complete pass or a fix check by
      `effectiveCoverage` — a clean look included, though it writes no disposition record — with each look's verified
      material count from its disposition records and the proposed set marked provisional. A delta check reads as a fix
      check, since nothing stored tells them apart.
    - Each fix round's range is its performed response's heads (`originatingHeadSha..producedHeadSha`,
      `LaneResponsePerformanceSchema`, `core/operation-state-schema.ts`), tied to its disposition set by
      `dispositionSetId`. The new-design signals are computed per round — a round that changes a file no approved
      `fix` item's locus names, and a round that adds files — reading a locus's leading path token as the file it cites,
      a heuristic, since no record ties a fix to a finding.
    - Build `test-first` (one behavior at a time):
        - Complete passes and rounds since the last complete pass count from lane progress.
        - The material trend labels each look and marks the proposed set provisional.
        - A round touching a file outside its cited loci, or adding a file, raises its signal.
        - The chain reads as proven exactly when the next-pass context admits an incremental look.

### `[ ]` **4.2 Add the lane read — § 9.4**

- _Goal:_ A read-only CLI read returns, for the checkout's Errand claim, Candidate, or named delivery member, the
  lineage's rejected findings — each one's lane, locus, title, and reason — and Task 4.1's facts, a delivery member
  counted against its own ceiling, stores nothing, and refuses with a remedy when no subject resolves.

    - `arc review lane read -`, after its `<noun> <verb>` siblings (`arc review changeset resolve -`), registered in
      `cli.ts` with help. Its request, `{ schemaVersion: 1, memberHeadObjectId? }`, registers beside the other request
      schemas (`request-command-schemas.ts`).
    - It resolves the subject as local prepare does — the vehicle from the checkout's live context and an optional
      member selector (`resolveLocalReviewVehicle`, `hosts/local/review-authority.ts`), then the lineage
      (`resolveLineage`, `runtime/local-prepare-composition.ts`) — through one resolver both share, not a copy. A
      Candidate's read covers the Candidates its lane progress inherits from (`readCandidateInheritedLaneProgress`).
    - Its typed result carries the lineage; the rejections, from every lane of the lineage, each with its finding
      identity, locus, title where stored, its `rationale` as the reason, and its `sourceVerification`, so an
      unsupported observation reads as one (`DispositionReportItemSchema`, `core/disposition-records.ts`); Task 4.1's
      facts for the standard lane; and the last look's coverage and outcome, or none, which the workflow arms key on.
    - It reads the stored disposition records for the lineage's three kinds (`LaneSubjectLineageSchema`,
      `core/lane-admission.ts`) and counts a delivery member as status already does (`DeliveryReviewMemberProgressSchema`,
      `status.ts`).
    - Where no subject resolves (`LocalReviewAuthorityError`'s `vehicle-unresolved`, or a member selector that does not
      authenticate), it refuses with that reason as its code and a remedy naming the checkout or member head to use.
    - Build `test-first` (one behavior at a time):
        - The read returns an Errand's, a Candidate's, and a delivery member's rejections with their reasons, and a
          frontline rejection beside a standard one.
        - It returns the facts with the last look labeled a clean fix check after one.
        - It writes nothing to any store.
        - Outside a work unit's or an Errand's checkout it refuses with the remedy, and from that checkout the same
          request succeeds; an unbound member head is refused likewise.

### `[ ]` **4.3 State the next-pass offer as bounds, then considerations — § 6.3**

- _Goal:_ Every coverage offer states the allowed steps once, in plain words, then gives each consideration its reason
  and the condition under which it favors an option, and ends by asking for the recommendation — in local prepare and on
  the work-unit path alike.

    - `[ ]` **4.3.a Rewrite local prepare's selection text**
        - `localCoverageInteractionText` (`local-review-coverage-selection.ts`) takes Task 4.1's facts, which local
          prepare's composition derives and passes into the selection's input (`resolveLocalReviewCoverageSelection`).
          After material fixes it states the fix check first, the local complete pass still admitted and not a
          replacement for it; where the chain fails, the complete pass alone, with its instruction to check why.
        - Then one consideration per fact — complete passes against the ceiling, the range's size against the target,
          each round's new-design signals, and the material trend — each with its value, why it matters, and which
          option it favors. The new-design signals and the trend weigh the pass after the fix checks converge, never one
          in place of the fix check (§ 10.2).
        - Build `test-first` (one behavior at a time):
            - After material fixes the text lists the fix check first and says a complete pass does not replace it.
            - Each fact renders as a consideration with the option it favors.
            - Where the chain fails, the text names the complete pass and asks the agent to check why.

    - `[ ]` **4.3.b Replace the work-unit path's selection prompt**
        - The discharge's prompt (`hosted-reservation-discharge.ts`) has no considerations, names a `--json` flag that
          `review status` rejects (`cli.ts`), and always names `--work-unit`. The discharge has no route, so it emits the
          text with no command, and status's route composition appends the argv that re-runs status by the route that
          reached it, as Task 2.4.d's remedy does (`SpineRemedy`, `integration/spine-refusal.ts`).
        - Build `test-first` (one behavior at a time):
            - Each route's prompt names its own re-run command and no flag status rejects.

### `[ ]` **4.4 Give a complete pass pointers and withhold verdicts — § 9.1, § 9.2, § 9.3**

- _Goal:_ A local complete pass receives the lineage's earlier fixed findings as pointers — locus and defect class,
  labeled as previously reported and fixed with the fix and its surroundings still in scope — and the instruction to
  search independently and sweep for siblings, and receives no rejection, verdict, clean status, or claim that a fix
  closed its finding; hosted requests carry none.

    - `localReviewerInstructions` composes the pointers at prepare into `reviewerInstructions`, the string the local
      review operation already stores (`LocalReviewStateSchema`, `core/operation-state-schema.ts`) and replay reuses
      (`runtime/local-prepare.ts`); no shape changes. The pointers reach `publishLocalReviewPreparation` beside `guidance`
      in its dependencies, in the instruction input Task 3.2.b adds, which is never persisted.
    - The runtime reads them through Task 4.2's lineage disposition read: the verified findings approved as `fix`, from
      every lane, by locus and the disposition's title, which older stored items may lack; the finding's `sourceLabel`
      lives on the normalized finding (`finding-records.ts`), so some pointers carry a locus only. Deferred findings are
      not listed; rejected ones are withheld.
    - The withheld set also keeps everything the standard rubric withholds: author conclusions, preferred fixes,
      self-verification claims, and suspected weak spots.
    - Build `test-first` (one behavior at a time):
        - A complete pass after fixed findings lists each as a pointer with its label, and lists no deferred or rejected
          finding.
        - Its instructions carry no verdict, clean status, or closure claim.
        - A replayed prepare reuses the stored string.

### `[ ]` **4.5 Check new findings against the lineage's rejections in triage — § 9.4**

- _Goal:_ In `review-triage`'s source verification, the primary agent checks each new finding against the lineage's
  rejections from the lane read, asking whether each rejection's reason still holds against current source, with no
  verdict entering the evaluator's context.

    - Method prose in the package source, then the `.arc/` copy. The agent runs the lane read before verifying; the
      check applies to a lane's findings, not to a review run outside any lane, such as `verify-work-unit`'s
      self-review.

### `[ ]` **4.6 Stop for the Owner after a clean fix check when the judgment recommends stopping — § 6.2, § 8.3**

- _Goal:_ After a clean fix check on a `full-final` standard lane, each code-review workflow runs the lane read at its
  next-pass step and applies the judgment; where a surface takes the stop it stops before the complete pass is
  dispatched when the judgment recommends stopping, and where none does it states the recommendation and the limit and
  the complete pass runs.

- _Context:_ No typed state marks a pass as following a clean fix check, so each arm keys on the lane read's typed
  result rather than on memory. A delta check reads as a fix check there.

    - `[ ]` **4.6.a `run-errand` at the driver's `ready`**
        - At `ready / hosted-request` and `ready / local-prepare` with a pull request open, the arm stops and offers the
          Owner-directed review stop, which `run-errand` admits from those states and only at an open pull request.
          Before the pull request it states the recommendation and the limit, and the complete pass runs.

    - `[ ]` **4.6.b `prepare-work-unit` at `ready` and at the hosted-first reservation**
        - The driver's `awaiting-change-request` reserves the complete pass for a hosted source, and pre-publication
          shows it as a non-null `reservation` at `candidate-convergence-verification-pending` or
          `candidate-publish-ready`, before `run-convergence-verification` or `publish-candidate`
          (`projectPrePublicationReview`). The arm keys on that `reservation`, and the `awaiting-change-request /
          open-change-request` row, under a policy dispatch a null `policy` never reaches, moves there.
        - Before publication the stop rides `lanes.standard.terminus: { mode: "owner-accepted" }`, which the driver
          reads before it reserves a hosted source and the boundary carries through publication.

    - `[ ]` **4.6.c `integrate-work-unit` at `continue-pre-publication-review`, the delivery route, and the singleton**
        - The delivery work-unit route offers the stop; the published singleton takes no new terminus, so the arm states
          the recommendation and the limit there.

    - `[ ]` **4.6.d `deliver-stack`'s member review**
        - It takes no terminus, so the arm states the recommendation and the limit, and the complete pass runs.

    - `[ ]` **4.6.e Recommend from the same read at the ceiling**
        - At the ceiling each arm stops and recommends another pass or stopping, with its rationale, as
          `adversarial-review`'s cap recommendation does.

### `[ ]` **4.7 The cadence on every path** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on every path it names, each exercised through its real composition.

    - Scenarios: an Errand before and after its pull request, pre-publication, the published singleton, and a delivery
      member, each running a `full-final` lane through a material fix, a local fix check, a converged fix check that does
      not close it, and a closing complete pass at the settled head; and a plain commit after a converged look on each
      path, admitting a delta check where § 3.5 does and none on a delivery member or where the range proof fails.
    - Run `arc check segment`.

## **Phase 5:** The ceiling counts complete passes

_Purpose:_ Make `review.standard_max_passes` bound complete passes alone, so fix checks and delta checks run outside
it on the approvals that admit them, while `logicalPass` keeps numbering and binding every attempt.

_Mode:_ `slice` — closes on fix checks running at the ceiling with no override.

_Exit criterion:_ A lane at the ceiling runs fix checks with no override, a complete pass past the ceiling requires an
override or an extra pass that no fix check spends, and no text the Owner reads shows an attempt number as a pass.

_Design decisions:_ At the ceiling the driver returns `ready` while an incremental look is admissible and no complete
coverage is chosen, and `approval-required` once complete coverage is chosen; a ceiling override applies only to a
complete pass. Workflow, method, and configuration text changes in the package's `arc/` source first, then in the
`.arc/` copy by targeted edit.

### `[ ]` **5.1 Derive the complete count once, and give every ceiling reader that count — § 4, § 5.1**

- _Goal:_ The next-pass context carries the lane's complete count — its finished passes whose `effectiveCoverage` is
  `complete` — as the one derivation every ceiling read takes, so no ceiling read can disagree with the driver's.

    - The count is lane progress's `completePasses` (`countCompleteLogicalPasses`, `lane-progress.ts`), which a
      superseding Candidate already inherits (`readCandidateInheritedLaneProgress`, `lane-progress-supersession.ts`).
      The supersession module's own count (`completePasses`, yielding `inheritedCompletePasses`),
      `projectHostedReservationPolicyProgress`'s (`hosted-reservation-admission.ts`), which also requires a verdict
      outcome, has no frontline branch, and counts one delivery member's attempts, and Task 4.1's facts take it — the
      second over the same member's attempts.
    - The driver takes the count as an internal input; `composeDeliveryReviewObligation` (`status.ts`) still blocks a
      member when its ceiling read disagrees with the driver's.
    - Build `test-first` (one behavior at a time):
        - A lane with complete passes and fix checks counts only the complete passes, across supersession and on one
          delivery member alike.
        - A standard-lane request without the count is refused.

### `[ ]` **5.2 Compare against the ceiling by complete count, and bind attempts by `logicalPass` — § 5.2**

- _Goal:_ Every comparison against `review.standard_max_passes`, and every decision whether an override is needed, reads
  the complete count, while every site that numbers or binds an attempt keeps `logicalPass` and `validatePassCounts`
  still holds one finished outcome per logical pass.

    - `[ ]` **5.2.a Move the ceiling comparisons to the complete count**
        - The driver's `approval-required` and `ceilingOverrideApplied`, whose additional-pass arm also compares the
          ceiling; `resolveInvalidOverrideReason` (`review-policy-driver.ts`); `missingHistoricalResultObligation`
          (`status-errand.ts`), which also binds the next pass's number; `composeDeliveryReviewObligation` (`status.ts`);
          and `candidateContinuationRequest` (`hosted-reservation-admission.ts`), which synthesizes an override at the
          ceiling. Respond's ceiling reads are Task 5.3's.
        - `resolveInvalidOverrideReason` splits its one base, `completedPasses` less a recorded terminal: an override's
          `exhaustedPassCount` and `nextPass` still bind that `logicalPass` base, and `ceiling-not-exhausted` compares
          the complete count, less the terminal only when the terminal is a complete pass.
        - Build `test-first` (one behavior at a time):
            - A lane with two complete passes and three fix checks under a ceiling of two is at the ceiling, not past it.
            - An override binds attempt numbers by `logicalPass` while its ceiling test reads the complete count.
            - An override after a fix check terminal is not refused as `ceiling-not-exhausted` when the complete count
              is at the ceiling.

    - `[ ]` **5.2.b Keep `logicalPass` where an attempt is numbered or bound**
        - The driver's numbering (`completedPasses + 1`, a terminal state's `pass`, the consequence's
          `exhaustedPassCount` and `nextPass`); `buildLaneAttempt` and `buildNextLaneProgress` (`lane-progress.ts`);
          `recordHostedRequestAdmission` and `readHostedRequestAdmissionReplay` (`lane-progress-hosted-request.ts`);
          local prepare's numbering; `validateTerminalResult`, `correctedTerminalRequest`, and
          `compatibleTerminalGrants` (`review-policy-evidence.ts`); `validateApprovedResponsePolicyBinding`
          (`respond-command.ts`); the next-pass context's predecessor match (Task 1.1.b), which replaces
          `resolveOfferedCorrectionScope`'s own (Task 1.3.b); `requireCaptureProducer`,
          `bindConditionalPendingAdmission`, `validateAuthorizations`, and `ConditionalPassAuthorizationSchema`'s
          `nextPass` refinement; `invalidAdditionalPassReason`, `withCeilingOverride`,
          `verifyCandidateAdditionalPassPredecessor`, and `RespondApprovedRequestSchema`'s `exhaustedPassCount`; the
          terminus binding (`isDeliveryReviewMemberDischargedByOwnerTerminus`) and `completedPassesAtAdmission`
          (`hosts/local/hosted-request-owner-index.ts`).
        - `exhaustedPassCount` keeps its stored meaning, the producing attempt's `logicalPass`.
        - Build `test-first` (one behavior at a time):
            - Fix checks advance `logicalPass`, and `validatePassCounts` accepts a lane that interleaves them with
              complete passes.

### `[ ]` **5.3 Report respond's ceiling position and consequence from the complete count — § 5.2, § 5.3**

- _Goal:_ The respond envelope's provisional assessment states the ceiling position from the passes the ceiling counts
  once the admitted attempt finishes, and reports a ceiling decision only when no fix check will be admissible, so a
  fix check neither moves the position nor triggers the decision.

    - `[ ]` **5.3.a Give respond the facts, and the position its count**
        - Respond's dependencies gain one port, bound in `createRespondDependencies` (`runtime/respond-composition.ts`)
          from the next-pass context: Task 4.1's facts for the result's lane, whether the chain to this pass is adequate,
          and whether `delegated-agent` is selectable on this route by § 7.2's list. `projectProvisionalPassAssessment`
          (`respond-command.ts`) and `projectFixConsequence` stay pure over what it returns.
        - `ProvisionalPassAssessmentSchema` (`core/provisional-pass-assessment.ts`) gains `ceilingPassCount` — the
          complete count on the standard lane, `admittedLogicalPass` on the frontline lane — and `capPosition` compares
          it with `configuredMaxPasses`. The envelope is stored nowhere.
        - The consequence refinement: `ceiling-decision` requires a position at or above the ceiling; `next-pass` with
          `complete` or `null` coverage requires one below it; `next-pass` with `incremental-when-proven` holds at any
          position.
        - Build `test-first` (one behavior at a time):
            - A complete pass at the ceiling reports `capPosition` at the ceiling, and a fix check after it the same.
            - The frontline lane's position is unchanged.

    - `[ ]` **5.3.b Predict the ceiling decision**
        - `projectFixConsequence` reports a ceiling decision only when no fix check will be admissible. It runs on the
          first `arc review respond -` call, before any fix exists and before a correction scope can resolve
          (`buildIncrementalCorrectionScope` requires a performed response), so it tests predictively from the port:
          the chain to this pass is adequate and `delegated-agent` is selectable.
        - Build `test-first` (one behavior at a time):
            - Material fixes at the ceiling with `delegated-agent` selectable report `next-pass` with
              `incremental-when-proven`, not a ceiling decision.
            - With the chain inadequate, or `delegated-agent` not selectable, they report a ceiling decision.

### `[ ]` **5.4 Decide the ceiling after coverage is chosen — § 5.3**

- _Goal:_ At the ceiling, a lane whose next step is a fix check or a delta check gets that step with no override, and
  only a complete pass past the ceiling needs the ceiling override or an `additional` extra pass, so an override always
  binds to the complete pass that uses it.

    - `[ ]` **5.4.a Return `ready` at the ceiling while an incremental look is admissible**
        - The chosen coverage reaches the driver as an internal input beside the complete count. At the ceiling, when
          the context admits an incremental look and no complete coverage is chosen, the driver returns `ready`, and the
          composition's existing selection asks (§ 6.4) or admits a delta check; once `complete` is chosen it returns
          `approval-required`. `coverage-required` keeps its one meaning, an inadequate chain.
        - A ceiling override beside chosen incremental coverage is refused, as an invalid override is today, with its
          own diagnostic code and a remedy whose argv re-runs without it; with no coverage chosen the driver returns
          `ready` without applying it.
        - Build `test-first` (one behavior at a time):
            - At the ceiling after material fixes, the driver returns `ready`, not `approval-required`.
            - With `complete` chosen there, it returns `approval-required`, and an override or an extra pass admits it.
            - An override beside a fix check's coverage is refused with the remedy, and the re-run without it is admitted.

    - `[ ]` **5.4.b Supply the chosen coverage in each composition**
        - Local prepare passes its `coverageAdmission` (`runtime/local-prepare-composition.ts`). The hosted reservation
          admission (`hosted-reservation-admission.ts`) takes the chosen coverage its callers supply: status's delivery
          and singleton routes pass the pick or `--coverage` (`status-composition.ts`'s delivery `requestAdmission`;
          `status-singleton.ts`'s `resolveSingletonRequest`), and hosted request admission (the `authorizeCapacity`
          closure, `handlers/review.ts`) passes `complete`.
        - Errand status (`nextErrandPassObligation`) first resolves without chosen coverage; if that yields
          `ready / hosted-request`, it resolves again with `complete` before composing the hosted action.
          Pre-publication passes none, since it learns of a hosted reservation only from the driver's result; its
          hosted pass meets the ceiling at hosted request admission.
        - Build `test-first` (one behavior at a time):
            - Each composition at the ceiling admits a fix check with no override.
            - A hosted admission at the ceiling meets `approval-required`.

### `[ ]` **5.5 Bind a conditional next-pass authorization only to a complete pass — § 5.4**

- _Goal:_ A conditional next-pass authorization is offered only when a ceiling decision is reported and is spent only
  by a complete pass's admission, so no fix check or delta check spends it, and one a fix check overtakes lapses.

    - `bindConditionalPendingAdmission` (`lane-progress-conditional.ts`) refuses an admission whose pending attempt
      requests anything but `complete` coverage (`requestedCoverage`, on the attempt's `local` or `hosted` binding), with
      a remedy naming the complete pass or the authorization's withdrawal (`conditionalNextPassWithdrawal`). Its shape is
      unchanged.
    - An authorization stays pending until an admission names it, and only the binding and the withdrawal read it, so
      one a fix check overtakes lapses once the fix check moves `logicalPass` past its `nextPass`; the complete pass that
      follows takes a ceiling override at the driver's `approval-required`.
    - A fix check cites no extra-pass decision; its `correctionScope` names the response's result
      (`predecessorProducerId`), as a delta check's names the converged predecessor's.
    - Build `test-first` (one behavior at a time):
        - A fix check admitted at the produced head leaves the conditional authorization unspent.
        - An incremental admission naming the authorization is refused with the remedy.
        - A complete pass's admission spends it.

### `[ ]` **5.6 Show a pass as a complete pass against the ceiling, and a fix check as a round — § 5.5, § 13**

- _Goal:_ Everything the Owner reads shows a pass as a counted complete pass against the ceiling and a fix check in
  rounds since the last complete pass, each with its result, and never shows an attempt number as a pass; typed fields
  that carry the attempt number keep their shape and meaning.

    - `[ ]` **5.6.a Change the CLI text**
        - The response summary's "pass N of M" and next-pass number (`projectProvisionalPassAssessment`) and
          `fixConsequenceText`'s "needs standard pass N"; Errand status's "N of M configured standard-review passes",
          "used N standard-review passes", and `missingHistoricalResultObligation`'s ceiling text; the local selection
          text's "Either consumes one pass"; `hostedPassHold`'s "hosted pass N"; and `review-policy-remedy.ts`'s
          "Another pass exceeds the configured ceiling".
        - The round number comes from Task 4.1's facts, which respond reads through Task 5.3.a's port.
        - Build `test-first` (one behavior at a time):
            - A summary after a fix check reads "fix check, round N since pass M" and a complete pass reads
              "complete pass N of M".

    - `[ ]` **5.6.b Change the workflow and method text**
        - "A completed attempt consumes that pass" (`run-errand`, `integrate-work-unit`); "durable lane progress
          consumes the admitted pass" (`integrate-work-unit`, `deliver-stack`); `prepare-work-unit`'s "An incremental
          choice still spends one logical pass" and "inherited completed standard passes still count toward the
          ceiling"; every step that surfaces a ceiling override's or an additional pass's consequence; `review-triage`'s
          pass line and its example prompt, with the prompt's copy in `strategy-session-operations.md`
          § Disposition-Approval Release, in both copies; and `standard-review`'s "counts as one standard-review pass" —
          with the tests that pin them: `review-fix-release.test.ts`'s assertion on the example prompt,
          `review-gate-workflows.test.ts`'s assertions on the pass-line paragraph wherever the rewrite reaches them, and
          `pr-lifecycle.test.ts`'s on the pass phrase.

    - `[ ]` **5.6.c Change the ceiling comment in `arc-config.yml`**
        - The shared comment over `review.frontline_max_passes` and `review.standard_max_passes`, in both copies, states
          that the standard ceiling counts complete passes, with fix checks outside it, and that the frontline ceiling is
          unchanged.

### `[ ]` **5.7 Fix checks at the ceiling** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds through a real lane at the ceiling.

    - Scenario: a lane at its ceiling after material fixes runs fix checks with no override and converges, then needs an
      override for the complete pass past the ceiling; the summaries show complete passes against the ceiling and fix
      checks as rounds.
    - Run `arc check segment`.

## **Phase 6:** One pass model and its report

_Purpose:_ State the pass model once, in `review-model`, and give every review report one shape — an adversarial
pass, a fix-check round, and a code-review findings round alike — with the planning-review rules that follow from it.

_Mode:_ `layer` — closes on a settled `review-model` and a report shape both families render.

_Exit criterion:_ `review-model` is settled in both copies and reaches every project, and an adversarial pass, a
fix-check round, and a code-review findings round each render its report shape.

_Design decisions:_ A report labels findings in canonical order, so a label never moves between the proposal, the
approved report, and the replay; a fix's tag only orders the display, and is kept as an advisory note outside the
approved set. Method, workflow, and template text changes in the package's `arc/` source first, then in the `.arc/`
copy.

### `[ ]` **6.1 Add the `review-model` method — § 10.1**

- _Goal:_ One method defines the pass model both review families use — pass, fix check, cap, convergence, the
  re-inspection test, fold tags, cadence, and the loop reading — and reaches every project through its fire-point
  declarations.

- _Note:_ 6.1.a and 6.1.b land in one commit, since the method-trigger audit (`lint:arc:triggers`, a commit gate) fails
  a method no workflow declaration reaches.

    - `[ ]` **6.1.a Write the method**
        - In the package's `arc/system/methods/`, then the `.arc/` copy, in the shipped register. It states the model
          and keeps every constraint at its fire site: a fix check runs only with approval, a cap never authorizes,
          and a recommendation is not authorization. Records stay separate by design; an adversarial pass keeps its
          own record shape. Task 7.5.b adds the family map.

    - `[ ]` **6.1.b Make it reach every project**
        - Its registration: an `init-recipe.json` disposition; a `CONFIGURABLE_FILES` entry (`lib/classification.ts`);
          its line in `strategy-package-project-sync.md`'s Configurable inventory and that list's count; its `.arc/`
          copy among the `format:tables` check's inputs (`arc-checks.yml`), which name each method copy; its row in the
          methods `README.md` relationship table, in both copies; the init, update, and sync tests that enumerate the
          methods (`__tests__/unit/init.test.ts`, `__tests__/integration/init.test.ts`, `__tests__/e2e/init.e2e.test.ts`,
          `__tests__/integration/update.test.ts`, `__tests__/integration/framework-sync.test.ts`); and the regenerated
          manifest (`.arc/system/.internal/manifest.json`).
        - `adversarial-review`, `review-triage`, and `review-response` declare it at their fire-points; Task 7.5.a adds
          the three review-type methods' declarations. The method-trigger audit (`audit-method-triggers.ts`) finds it
          reachable.

### `[ ]` **6.2 Make a fix check and a successor pass separate decisions — § 10.2**

- _Goal:_ `review-model` and `adversarial-review` § Fold verification state that a fix check is recommended, with
  another round, whenever the last look's approved fixes include a material one, is declined only on the fixes' own
  merits, and is never traded for a following pass, approved or under the cap.

    - The four places `adversarial-review` teaches the trade change: the first-round rule recommending decline "when all
      folds are local corrections and a full pass will follow"; "the exit gate's re-inspection test may recommend a full
      pass instead"; repairs joining the next pass's `prior-findings`, which read as coverage; and "the next outer pass
      covers the last round's repairs".
    - The method says in words that a following pass is never a reason to decline; fix-check rounds converge before the
      successor pass launches, and the re-inspection test decides whether one follows, never whether it replaces them.

### `[ ]` **6.3 Render every review report in one shape — § 10.3**

- _Goal:_ An adversarial pass, a fix-check round, and a code-review findings round each render one shape — header line,
  a `#` / `Grade` / `Finding` / `Action` table, sections per finding with `**Fails:**`, one Decisions block, and a
  loop reading — with the loop reading's four readings defined in `review-model`, and with each finding's label the same
  in every render of one set.

    - `[ ]` **6.3.a Give `disposition-report` the shape, and render it in the CLI**
        - One subtask, since `review-triage` tells the agent the command renders the method's shape. The method takes the
          header line and the Decisions block as fields its caller supplies, the table, the order, and the sections —
          heading, a status line mirroring the row with the verdict, then `**Finding:**` (replacing `**Issue:**`),
          `**Fails:**`, `**Action:**`, and `**Detail:**`.
        - `renderDispositionReport` (`core/disposition-report.ts`) takes the header and the Decisions block as optional
          inputs. `reportEntries` assigns each label in canonical order — blocking first, then grade, unsupported last,
          then the source's order — and only then sorts the display, putting new-design fixes first within a grade
          where tags are given; the table, the open questions, the sections, and `renderDispositionEvidence` all take
          that label.
        - The table has no verdict column; `—` marks an unsupported finding; the rest of `renderVerdict`'s cell moves to
          the finding's section, and a `record-only` finding stays marked in its grade cell; a fix carries
          `FIX (new design)` or `FIX (local correction)` in its action where tags are given.
        - Build `test-first` (one behavior at a time):
            - A report renders the table, the order, and each section with its status line.
            - A `record-only` finding is marked in its grade cell; an unsupported one shows `—`.
            - With tags, a new-design fix leads its grade and keeps its canonical label, and the evidence block cites
              the same label; without tags, the same set renders in canonical order with the same labels.

    - `[ ]` **6.3.b Define the loop reading in `review-model`**
        - `baseline`, `converging`, `discovering` (taking precedence over `converging`), and `sustained
          non-convergence`, each with the decision it points to. In code review, the trend is Task 4.1's fact, new design
          is read from its signals beside the stored tags of earlier rounds and the current round's, a tag reading as
          the proposal's forecast and the signals as what the round was, origin is the agent's reading, and sustained
          non-convergence points to stopping for the Owner's decision on `amend-design`.

    - `[ ]` **6.3.c Render the shape in `adversarial-review`**
        - Its report gains the header, table, sections, Decisions block, and loop reading, new-design folds leading
          within a grade, and its report schema gains a `fails` field per finding naming the rubric item it fails in the
          review's own terms, `none` with its reason.

### `[ ]` **6.4 Carry the agent's report inputs on respond, keeping only the tags, as an advisory note — § 10.4**

- _Goal:_ The first `arc review respond -` call takes the agent's parts of the report — one tag per fix, one
  `**Fails:**` anchor per finding, the successor-pass recommendation, and the origin counts with the reading and its
  rationale — as inputs the CLI renders; the approved call carries the tags again and stores them beside the approved
  set, outside its identity, so the approved report and the replay order and tag the same way; nothing else is stored.

    - A `report` object sits on the proposal request beside `proposal` (`RespondProposalRequestSchema`,
      `respond-command.ts`), keyed by finding identity, never inside `AuthorDispositionSchema`, which
      `prepareDispositionProposal` spreads into the disposition set whose digest the approval binds: `tags`
      (`new-design` or `local-correction`, exactly one per fix), `fails` (a rubric item, or `none` with its reason,
      exactly one per finding), `successorRecommendation`, `origin` (counts by where the findings came from, and the
      new-design fixes among them), and `reading` (one of the four, with its rationale). A missing, extra, or duplicate
      key is refused with a remedy naming the identities.
    - The approved call (`RespondApprovedRequestSchema`) takes `tags` again, checked against the approved set's fixes
      the same way, and stores them on the record's lineage node (`ApprovedDispositionLineageNodeSchema`,
      `core/advisory-records.ts`) beside `approvedDisposition`, an optional field, so older records parse. Only that
      call writes them, at the response's first write; no later advance of the record changes them. The verified fix
      call and the settlement replay read them from there.
    - The CLI renders the header from its provisional assessment, one Decisions block from the approval, the open
      questions, and the bounded offers, and the trend from Task 4.1's fact. A tag renders as the agent's reading of
      what the fix implies, never as an approved judgment.
    - The local reviewer's prompt (`localReviewerInstructions`) asks for a `Fails:` line with each finding in its own
      report, which the result's `evidenceUrlOrId` references, since a local result's findings carry no text
      (`ReviewFindingContentSchema`, `core/finding-records.ts`); the agent lifts it into `fails`. For a hosted source
      the agent supplies it while verifying, marked as its reading.
    - Build `test-first` (one behavior at a time):
        - The first call renders the tags, anchors, recommendation, and reading; nothing of them reaches the stored
          disposition set, and its identity is the same with or without them.
        - A fix with no tag, a tag on a non-fix, or a finding with two anchors is refused with the remedy, and the
          corrected request succeeds.
        - The approved call stores the tags beside the set, and the approved report and the settlement replay render
          the header naming the approved set and the table and sections ordered and tagged as the proposal was, with
          no `**Fails:**`, Decisions block, or loop reading.
        - A record with no stored tags renders in canonical order.

### `[ ]` **6.5 Offer a return to shaping where no level is higher — § 10.5**

- _Goal:_ Where a floor-raising signal's own stage is already at `high`, `resolve-planning-depth` § Mid-stage re-entry
  and `adversarial-review`'s exit gate offer the top-level shape — a return to shaping for the named locus, the `Class`
  ratchet to `Novel`, or `assess-boundary-fit` — and never "re-enter higher".

    - A return to shaping ends the loop with the exit gate's `re-entered` stop reason; the locus goes through the stage's
      own authoring loop — in `draft-design` the facilitated shaping step, in `create-spec` its discovery step over the
      named section at the resolved form, at `generate-tasks` a return to grounding the named surface — then readiness
      re-runs (in `create-spec`, spec-review over that section), and a fresh loop starts with a fresh cap.
    - The fresh loop's first pass takes the ended loop's findings, not its folds, as `prior-findings`, labeled as the
      ended loop's and given as context rather than the search frontier: the one exception to `adversarial-review`'s
      rule that pass one takes none, stated there and in the `prior-findings` comment at the `draft-design`,
      `create-spec`, and `generate-tasks` fire-points.
    - The shape applies where the signal's stage is at `high`: `draft-design` for derivation, `create-spec` for a signal
      about the spec's form alone, and `generate-tasks` for scale; a derivation signal at `create-spec` whose direction
      is unshaped, or at `generate-tasks`, keeps its offer to route upstream.

### `[ ]` **6.6 Align the review methods' prose to the model — § 10.6, § 10.7**

- _Goal:_ `review-triage`, `review-response`, and `classify-review-risk`'s "What the call changes" state the model
  where they touch it, and the family says that human review follows out of band and is never a pass.

    - Package source first, then the `.arc/` copies.

## **Phase 7:** The review family and the renames

_Purpose:_ Give each review type one named method its sites call, place every review step in exactly one place, fix the
known drift between sites, and rename code review's three methods, measured against a step inventory taken before the
rewiring.

_Mode:_ `replication` — closes on every review step re-placed and the renamed methods moved everywhere they are named.

_Exit criterion:_ A step inventory re-derived on the then-current base shows every review step from before the
rewiring in exactly one place after it, every § 11.5 drift item is fixed, and no `frontline-review.md`,
`standard-review.md`, or `self-review.md` remains in either copy.

_Design decisions:_ A step is in exactly one place when one method or workflow section states it and every other site
cites that section by a reference link with the heading's fragment, which `lint:arc:links` checks, never by a prose `§`
alone. "Operation" stays the word for a stored CLI operation. Method, workflow, and template text changes in the
package's `arc/` source first, then in the `.arc/` copy.

### `[ ]` **7.1 Re-derive the review step inventory on the current base — § 11**

- _Goal:_ A before-inventory of every review step at every site, taken on the then-current base, gives the segment
  something to measure the rewiring against.

- **Additional Context:** `notes-review-coverage-cadence.md` § Review call sites

    - Re-derive it in `notes-review-coverage-cadence.md` § Review call sites against `packages/arc-framework/arc/system/`,
      including the arms Phases 1–6 added, as a table: the step; where it is stated today, each restatement by site and
      locus; its home section after the rewiring; and the sites that reach it.

### `[ ]` **7.2 Add `planning-review`, and call it from the four planning sites — § 11.2**

- _Goal:_ One `planning-review` method holds the stage-gate review `draft-design`, `create-spec`, and `generate-tasks`
  repeat today, and every planning site calls it with its artifact or depth: those three stages recommend the offer at
  `Heavy` and `Novel`, the amendment uses depth, and the post-settle re-read is the last step before each site's commit.

- _Note:_ 7.2.a and 7.2.b land in one commit, since the method-trigger audit (`lint:arc:triggers`, a commit gate) fails
  a method no workflow declares; 7.2.c can follow on its own.

    - `[ ]` **7.2.a Write the method**
        - `adversarial-review`'s contract shape: a When line naming its trigger — reviewing a planning artifact at its
          stage gate — rather than its sites, a Signature, a Contract, named inputs, and a return schema. Its
          registration is the one Task 6.1.b lists.
        - It runs the author checks its site runs right before the offer today, selected by the artifact: readiness for
          a draft (`assess-draft-readiness`), the proportionality re-run and `spec-review` for a spec, and `spec-review`
          over the footprint for an amendment; a task list takes none, since `generate-tasks` audits each phase in its
          own loop. Checks inside a site's authoring loop stay with the site, which declares them.
        - Then the offer callout, the orientation block, the authored-partition note, the fix-check sentence, the
          pass-record paragraph, and the post-settle re-read; the artifact also selects the rubric, the artifacts, the
          `Class`-scaled offer, and the pass cap.

    - `[ ]` **7.2.b Call it from `draft-design`, `create-spec`, and `generate-tasks`**
        - Each calls it with a YAML callsite keyed by `planning-review`, as `adversarial-review`'s callsites are, passing
          its artifact; `draft-design`'s offer moves from `Novel`-only to `Heavy` and `Novel`; `draft-design`'s and
          `generate-tasks`' misplaced re-reads go, the method running one before each commit. `generate-tasks` is a
          `.template.md` in the package.

    - `[ ]` **7.2.c Call it from `amend-design`**
        - With the same callsite, passing its depth: no offer at `low`, a neutral one at `medium`, a recommended one at
          `high`, with `Class` setting the pass cap; it gains the offer callout, signature block, and pass cap it lacks
          today.

### `[ ]` **7.3 Add `code-review`, and give each code site a thin dispatch — § 11.3**

- _Goal:_ One `code-review` method holds, as named sections, what the code sites clone today — the author check, the
  findings round, hosted await and settlement, and the common rules — and each site keeps a thin dispatch on its own
  command whose arms cite those sections.

- _Note:_ 7.3.a and 7.3.b land in one commit, for the trigger audit's reason in Task 7.2.

    - `[ ]` **7.3.a Write the method**
        - Its When line names its trigger, reviewing a change set, rather than its sites. Each section reads on its own:
          it opens with a one-line signature — when it fires, what it takes, and what it leaves — and leans on no text
          above it. Its registration is the one Task 6.1.b lists.
        - The author check: `self-review`, which Task 7.7 renames, over the aggregate diff, its findings through triage;
          `verify-work-unit` runs it before its merge gate, so its fixes land before verification's evidence, and
          `prepare-work-unit` runs it at pre-publication's `run-self-review` (Task 7.6.d).
        - The findings round: triage, the disposition report, complete-set approval, response, fix, verification, commit,
          the verified-fix replay (`respondToResolvedReviewCommand`; `reentryCommand: respond-verified-fix`) before any
          push interlock releases, push, settlement, and re-entry. Hosted await and settlement with the checks
          diagnostic. The common rules: convergence, the coverage selection arm, the chunk gate, the ceiling override,
          and the stop line, with the cadence and source selection as its defaults.

    - `[ ]` **7.3.b Rewire `run-errand`, `prepare-work-unit`, `integrate-work-unit`, and `deliver-stack`**
        - Each keeps its own command, state vocabulary, early stop, and fix verification; its arms cite the method's
          sections by reference link with the heading's fragment, and `verify-work-unit` cites the author check the same
          way. `drain-inbox`'s citation of `run-errand`'s reviewed-lane settlement follows it wherever it lands.

### `[ ]` **7.4 Add `verification-review`, and make `validate-criteria` its check — § 11.4**

- _Goal:_ `verification-review(scope)` runs the author's criteria walk and its independent companion at delivery-member
  and work-unit scope, `validate-criteria` becomes its pure check, and the two sites that want evidence without review
  call the check directly.

- _Note:_ 7.4.a and 7.4.b land in one commit, for the trigger audit's reason in Task 7.2.

    - `[ ]` **7.4.a Write the method and reduce `validate-criteria` to its check**
        - Its When line names its trigger, verifying a change against its success criteria, rather than its sites. Its
          registration is the one Task 6.1.b lists.
        - `validate-criteria` keeps criterion binding, the three-state model, immutability, and evidence; its
          `arc.methods: adversarial-review` declaration and § Adversarial companion move up into `verification-review`,
          stated once with `validate-criteria`'s current "decline proceeds normally" posture. Each companion finding
          names the criterion it fails.

    - `[ ]` **7.4.b Call it from `verify-work-unit` and `process-task-loop`**
        - Each with a YAML callsite keyed by `verification-review`, passing its scope; both stop restating the companion
          callout. `process-task-loop` is a `.template.md` in the package.

    - `[ ]` **7.4.c Call the check directly from `deliver-stack` and `amend-design`**
        - `deliver-stack`'s review-fix verification, whose exemption from the companion becomes structural, and
          `amend-design`'s closing criteria delta, whose independent pass is the `planning-review` over its footprint.

### `[ ]` **7.5 Declare what each site and review-type method fires, and map the family — § 11.1**

- _Goal:_ Every site declares the review-type method it calls and every review-type method the checks, vehicles,
  findings methods, and `review-model` it fires; methods' "Workflow:" callouts name their real callers; and
  `review-model` and the methods index map the family.

    - `[ ]` **7.5.a Set the declarations and callouts**
        - At the stage gate a site calls its type's method, never its checks. A site keeps declaring the checks it runs
          inside its own authoring loop, and `deliver-stack`'s and `amend-design`'s direct check calls and
          `decompose-work-unit`'s `spec-review` stay as they are. Ad-hoc doors — `arc-design-audit`, `arc-task-audit`,
          and `arc-amend-design` under `.internal/skills`, with their harness copies under `.claude/skills` — reach a
          review-type method or a check. The method-trigger audit (`audit-method-triggers.ts`) passes.

    - `[ ]` **7.5.b Map the family**
        - `review-model` lists the three review-type methods and places every review method in its layer — sites, the
          type's method, checks, and the vehicles, findings handling, and routing that serve them — with `self-review`
          as code review's author check and `assess-evidence-applicability` as the judgment at a moved target's stops;
          the methods index (`system/methods/README.md`) groups them.

### `[ ]` **7.6 Fix the drift between sites — § 11.5**

- _Goal:_ Every drift item § 11.5 lists, re-confirmed against source, is fixed.

    - `[ ]` **7.6.a Remove the contradictory frontline and ceiling-override text**
        - `deliver-stack`'s "Apply `frontline-review`, then `standard-review` or `implementation-audit` as applicable"
          goes; `integrate-work-unit` and `deliver-stack` stop passing a ceiling override into "the named hosted, local,
          or frontline admission", which stays in `run-errand`.

    - `[ ]` **7.6.b Fix the composer and naming drift**
        - `prepare-work-unit` has `review-triage` compose the proposal, as everywhere else; `create-spec` stops calling
          its `spec-review` pass "self-review" in five places; and `adversarial-review` § Pass record's "no …
          code-review operation" names the review gate's stored operation in words no reader takes for `code-review`.

    - `[ ]` **7.6.c Fix the declarations nothing fires and the fire-points nothing declares**
        - The list in § 11.5, re-derived on the current base, folded into Task 7.5's declarations.

    - `[ ]` **7.6.d Place the verified-fix replay and run the author check at `run-self-review`**
        - `run-errand` gains the replay, and the hosted arms of `run-errand` and `integrate-work-unit` replay before they
          push. `prepare-work-unit`'s dispatch gains an arm for pre-publication's `run-self-review`
          (`pre-publication-procedure.ts`) that runs `code-review`'s author check before re-entry, citing it as
          `verify-work-unit` does.

    - `[ ]` **7.6.e Fix the companion posture, the re-read placement, and the singleton's additional pass**
        - The companion posture lands once through Task 7.4; the post-settle re-reads through Task 7.2.
          `integrate-work-unit`'s `--additional-pass` paragraph states that the ordinary singleton's discharge takes no
          additional-pass authorization (`HostedReservationDischargeReaderArgs`), so status returns `settled` there
          (`composePublishedSingletonReview`).

### `[ ]` **7.7 Rename `frontline-review`, `standard-review`, and `self-review` — § 12**

- _Goal:_ The methods are `code-review-frontline`, `code-review-standard`, and `code-review-author` everywhere a method
  name is read — files, activation keys, classification, recipe, manifest, checks, declarations, prose, and tests — in
  both copies, while the lane vocabulary and every stored or schema literal and published schema ID that carries an old
  name stay.

    - `[ ]` **7.7.a Move the method files and their keys**
        - Each file's `name`, title, and `.override` and `.default` headings, in both copies; the activation-registry
          keys (`lib/method-activation-registry.ts`) and their caller's (`resolveMethodActivation`,
          `scripts/review-gate/policy/activity.ts`); `CONFIGURABLE_FILES` and the strategy's Configurable inventory;
          `init-recipe.json`'s `include_files` and the regenerated manifest; and `.arc/system/arc-checks.yml`'s
          table-format inputs. The activation diagnostics, built from the name as `method.<name>.*`
          (`lib/method-activation.ts`), move with it. The checks that tie a name to its file —
          `lib/frontmatter/method.ts`, `lib/method-activation.ts`, `validate-package-neutrality.ts`,
          `audit-method-triggers.ts`, and `hosts/local/method-files.ts` — pass.
        - _Note:_ No alias or migration, under the pre-release posture; this repository's `.arc/` copy of
          `frontline-review.md` moves with its `active: true`.

    - `[ ]` **7.7.b Move the references**
        - `related:` and `arc.methods:` entries as Task 7.5 leaves them, and the prose that names a method: `code-review`,
          `review-model`, `review-chunking`, `review-triage`, `design-audit`, `verify-work-unit`, `prepare-work-unit`,
          `integrate-external-content`, the `arc-design-audit` skill and its harness copy, the methods `README.md`,
          `AGENT-BRIEF.ARC.md`, `strategy-session-operations.md`'s method table, and
          `strategy-configurability-architecture.md`'s package-default line. A plain-English "self-review" that names no
          method stays, and `docs/` stays as it is.

    - `[ ]` **7.7.c Move the tests that pin a name**
        - The nineteen files that pin a method's file, registry key, or `method.<name>.*` diagnostic, each a `.test.ts`
          unless named in full:
            - under `__tests__/integration/`: `framework-sync`, `init`, `update`, `pr-lifecycle`,
              `pre-publication-frontline-policy-skip`, `prepublication-workflow`, `review-fix-release`,
              `review-gate-legacy-sweep`, and `review-gate-workflows`;
            - under `__tests__/unit/`: `frontmatter/method`, `scripts/audit-method-triggers`,
              `scripts/validate-package-neutrality`, and, under `scripts/review-gate/`, `hosts/local/method-files`,
              `planning-grooming-command`, `policy/activity`, and `policy/assurance`;
            - `__tests__/e2e/init.e2e.test.ts`, `__tests__/helpers/candidate-lineage-suite.ts`, and
              `__tests__/fixtures/review-triage/author-self-review/exercise.md`.
        - The tests that pin a kept literal, and those using "self-review" as a test-local label, stay as they are.

    - `[ ]` **7.7.d Keep every literal § 12.3 lists, and the lane vocabulary**
        - The requirement kind `"standard-review"` and its blocker code, `frontline-review/v1`,
          `standard-review-reservation/v1` and `arc.standard-review.reservation/v1`, the rubric literals and schema IDs,
          the `standard-review/v1` source qualifier, the `frontlineReview` and `selfReview` method-activity fields, the
          `authorSelfReview` routing and promotion fields, the `self-review-inactive` reason, the `run-self-review`
          boundary action, `arc review pre-publication`'s `--self-review settled` option, the rubric line in `AGENTS.md`
          and `.coderabbit.yaml`, and the method text "The baseline version is `standard-review/v1`".
        - The lane vocabulary: `review.standard_*` and `review.frontline_*`, `arc review frontline`, "the standard lane",
          and the review gate's `standard-review*.ts` modules.
        - Build `test-first` (one behavior at a time):
            - A stored record holding each kept literal parses after the rename.

### `[ ]` **7.8 Every review step in exactly one place** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds against Task 7.1's inventory.

    - Re-derive the inventory after the rewiring and fill each row's home: every row has one home section, and every
      old restatement is gone or replaced by a reference link carrying that section's fragment; confirm each § 11.5
      item is fixed and no old method file remains.
    - Run `arc check segment`.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A `full-final` lane does not close on a fix check: on an Errand before and after its pull request, in
  pre-publication, on the published singleton, and on a delivery member, the pass after a material fix offers a local
  fix check with a local complete pass also listed, a converged fix check resolves to `coverage-required`, the complete
  pass that follows at the same head is admitted with no selection, and a complete pass at the settled head with no
  material fix completes the lane; `incremental` adequacy is unchanged.

- `[ ]` No hosted source runs the pass after an unconverged one: the driver selects `delegated-agent`, refuses a forced
  hosted source with a remedy naming the local pass, and the work-unit offer lists only `delegated-agent`; without
  `delegated-agent` configured the lane stops with both remedies; after a converged pass the configured rank picks the
  source.

- `[ ]` A delta check runs on `delegated-agent` whatever the rank, with no hosted-first reservation; while one is
  admissible a forced hosted source is refused with a remedy naming it; complete coverage supplied in local prepare's
  request runs a local complete pass with no correction scope; without `delegated-agent` configured none is admitted.

- `[ ]` No incremental hosted request runs: hosted admission and both `status.ts` hosted routes refuse incremental
  coverage with a remedy naming the local fix check, the hosted incremental writers are gone, and a stored hosted record
  with incremental coverage still parses and replays.

- `[ ]` The fix-check chain proves on either side of the pull request — by the performed-response test at every
  confirmation, after a hosted pass at an open pull request, and on a Candidate whose record commit follows the fix —
  and breaks on a base move after an unchecked fix on every path, delivery included; no incremental pass is admitted
  after a clean predecessor except a delta check by its range proof.

- `[ ]` The published singleton runs its local pass: its route names an ordinary local prepare request in place of
  `run-review` and handles `coverage-required`, its discharge reads the local terminal, its source, and earlier local
  attempts with no `deliveryAdmission`, and a delivery admission chosen with `--source delegated-agent` survives local
  prepare's real re-check.

- `[ ]` The ceiling counts complete passes: a lane at the ceiling runs a fix check with no override; a complete pass
  past the ceiling requires an override or an extra pass that no fix check spends; a conditional next-pass
  authorization binds only to a complete pass's admission; `logicalPass` numbers every finished attempt and
  `validatePassCounts` holds; and no text the Owner reads shows an attempt number as a pass.

- `[ ]` Each coverage question is asked once: off the delivery path local prepare asks after material fixes; on it status
  asks and local prepare does not ask again; after a converged look under `full-final` nothing asks; and status refuses
  an unlisted `--source` and `--coverage` pair, and a `--coverage` where it routes the singleton to a local pass.

- `[ ]` The Owner's stop is reachable at `coverage-required` once the terminal's response is performed, on the delivery
  path's work-unit route, in pre-publication, and in `run-errand`.

- `[ ]` A fix check is chunked by its own range on and off the delivery path; `prepare-work-unit` and
  `integrate-work-unit`'s singleton route carry the chosen scope into local prepare and `--lanes`; and a complete pass
  after a fix check at the same head resolves with its own scope.

- `[ ]` A complete pass receives pointers and no verdicts, and the lane read serves triage and the agent's stop: triage
  reads the lineage's rejected findings and their reasons from the lane read; after a clean fix check under `full-final`,
  each workflow's arm runs the read before the complete pass is dispatched — before publication where pre-publication's
  envelope carries a hosted-first `reservation` — and offers the Owner's stop when the judgment recommends stopping,
  while `deliver-stack`'s member review and the published singleton report the limit instead.

- `[ ]` The bounded check runs at both applicability stops, with `assess-evidence-applicability` fired at
  `integrate-work-unit`'s pre-reconcile stop; the `--coverage incremental` supplemental arms are gone; and the arms that
  land a fix the check prompts follow its route outside and inside a bound delivery.

- `[ ]` The shared model is in one method, and every report renders it: `review-model` exists in both copies with its
  recipe disposition, Configurable entry, and fire-point declarations; `adversarial-review` § Fold verification says a
  following pass is never a reason to decline a fix check; an adversarial pass, a fix-check round, and a code-review
  findings round render one report shape, with `fails` in `adversarial-review`'s report schema, the render-only inputs
  persisted nowhere but each fix's tag, kept as an advisory note outside the approved set's identity, and each finding's
  label the same in every render of one set; and the top-level re-entry shape is offered where the signal's own stage is
  at `high`, with no offer to re-enter higher there.

- `[ ]` Each review step is in exactly one place: the after-inventory matches the before-inventory step for step; the
  three review-type methods exist in both copies with their recipe dispositions and Configurable entries, and every site
  calls its type's method; and every § 11.5 drift item is fixed.

- `[ ]` The renames are complete and nothing stored moved: no `frontline-review.md`, `standard-review.md`, or
  `self-review.md` remains in either copy; the activation keys, Configurable lists, recipe, generated manifest,
  `arc-checks.yml`, and every reference follow; and every § 12.3 literal is unchanged.

- `[ ]` One stored addition: no stored schema under the review gate, the store, or the operation records gains a field,
  kind, or literal but the optional fix-tag note on the disposition record's lineage node, outside the approved set's
  identity and written once by the approved respond call, and the next-pass context rides only the driver's internal
  request.

- `[ ]` A plain commit after convergence takes a delta check: on an Errand before and after its pull request, in
  pre-publication once the Candidate checkpoint advances the same Candidate, and on the published singleton, the next
  pass under `incremental` after a converged look and a linear commit at the same base is a local incremental look on
  `delegated-agent`, scoped from the converged head, outside the ceiling, admitted without a selection, and closing the
  lane when it converges; no consumer that carries an earlier attempt to the current head accepts the range proof, while
  the delta check's own attempt and every carry that holds today on another ground still stand; under `full-final` it
  runs only on an Errand with an open pull request and in pre-publication, never closes the lane, and is followed by the
  next-pass arm, while the published singleton returns the review-applicability stop; the converged look's own head, a
  moved base, a merge commit in range, or a re-rooted Candidate admits none; and the attempt it writes is a fix check's.

- `[ ]` All quality gates pass (tests, linting, type checking), with content integration tests run over the whole
  branch before its first push

- `[ ]` Ready for integration
