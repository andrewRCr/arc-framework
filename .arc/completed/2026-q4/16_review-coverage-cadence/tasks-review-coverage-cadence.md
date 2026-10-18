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

        - _Amended in:_ 4.R (A1)

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

### `[x]` **2.2 Measure a fix check's chunks over its own range — § 3.3**

- _Goal:_ A fix check's chunk measure counts its own range, `predecessorHeadSha..headSha`, on and off the delivery
  path, taken once the pass's coverage is known, while a complete pass and a first pass measure the whole target.

    - `[x]` **2.2.a Measure on the delivery path after the coverage choice**
        - Status passes selected coverage and correction scope to the chunk measure. Fix checks count the predecessor
          head through the current head; complete passes count the whole member, and missing fix ranges refuse.
        - Three unit cases and a real-Git integration case distinguish a two-line fix from its 100-line member. Narrow
          reconstruction demonstrated the complete-range preservation and real-Git assertions fail before restoration;
          the fix-range and missing-scope cases failed against the original implementation.

    - `[x]` **2.2.b Measure off the delivery path in the workflows**
        - Pre-publication and singleton integration measure after coverage selection and before the call carrying it.
          Fix checks bind the chunk gate to their predecessor-to-head range; first and complete passes use the whole
          target. Chosen scope rides into local prepare, and rematerialized private fix checks measure afresh.

    - `[x]` **2.2.c State status's measure as `deliver-stack`'s exact check**
        - Delivery workflows use status's post-choice measure as their exact check after head movement, without a
          second whole-member measure. Retained private whole-member selections serve complete review only.

### `[x]` **2.3 Pass a delivery admission's source through local prepare's re-check — § 7.6**

- _Goal:_ A delivery admission chosen with `--source delegated-agent`, or with a forced local source, survives local
  prepare's real re-check instead of coming back as `coverage-required`.

- The production re-check now forwards the admission's source in the status request, beside its coverage. Two existing
  real-Git response cases choose a forced local source behind a hosted source and use the production validator; their
  fixture supplies actual base tracking and host check-policy observations. Removing source forwarding makes both
  cases fail, and the restored implementation passes through attestation and response settlement.

### `[x]` **2.4 Ask the work-unit coverage question once, and refuse a choice it did not list — § 6.4, § 6.5, § 7.3**

- _Goal:_ On the work-unit path the coverage question is asked once at each moment — status after material fixes,
  offering `delegated-agent` alone; nothing after a converged look; local prepare never again on the delivery path —
  status refuses a `--source` and `--coverage` pair that matches no listed choice, and a driver refusal reaches the
  agent with its remedy.

    - `[x]` **2.4.a Emit the discharge's selection after material fixes**
        - The discharge offers only local fix-check and complete choices for a proven correction, preserving the
          original work-unit or exact-target status route in executable commands. An unproved chain, including a base
          move after an unchecked material fix, routes to local complete coverage without a selection.

    - `[x]` **2.4.b Admit the complete pass with no selection after a converged look**
        - Current and retained `coverage-required` terminals now continue to complete coverage by configured source
          rank when the shared context is converged and the response is settled. Delivery and singleton regressions
          cover both terminal sites without a coverage selection. Each continuation carries its completed-pass count
          and request-attempt context through production admission.

    - `[x]` **2.4.c Refuse a pick that matches no listed choice**
        - Selection distinguishes pending, selected, and refused choices. A unique coverage-only pick is admitted;
          unmatched or ambiguous picks name the allowed pairs. Refusals retain the member conjunction so work-unit
          status keeps the exact offered member rather than falling back to the terminal member.

    - `[x]` **2.4.d Carry a driver refusal and its remedy through status**
        - Typed refusals preserve the driver's code and one retry for the original route. Missing-source guidance
          includes Owner acceptance only on supported surfaces; singleton and member-target routes name configuration
          repair alone. Errand status now honors source selection and carries the same diagnostic and retry.

    - `[x]` **2.4.e Add status's selection arm to `deliver-stack` and `integrate-work-unit`'s delivery route**
        - Both workflow copies render the precomposed offer, recommend a listed choice, wait for the Owner's pick,
          and replay its command in the same scope. The resulting admission bypasses a second coverage question in
          local prepare; refusal dispatch preserves the supplied reason, detail, and structured remedy.

### `[x]` **2.5 Run the published singleton's local pass through local prepare — § 7.5**

- _Goal:_ After an unconverged hosted pass, the published singleton's next pass runs as an ordinary local prepare over
  the work-unit branch, bound to the reservation's obligation and continuing the singleton's lane, and the discharge
  and hosted request admission read that local terminal, its source, and earlier local attempts.

    - `[x]` **2.5.a Name local prepare from the singleton route**
        - Status emits `review-singleton-local-prepare` with an ordinary request seed, exact PR target, Candidate
          boundary, and reserved obligation. The seed preserves the selected invocation and approved pass authority;
          missing obligation metadata refuses the action.

    - `[x]` **2.5.b Bind the singleton's local request to the reservation's obligation**
        - Ordinary work-unit prepare binds the live reserved obligation and refuses conflicting routing facts.
          Pending and completed replay re-confirm it, and admission re-reads it under the existing locks.
          Candidate-bound attestation retains the reservation's normalized requirement.

    - `[x]` **2.5.c Route the singleton's `coverage-required` to local prepare**
        - Current and retained terminal discharges carry their policy state. Singleton status routes only settled
          coverage-required results to ordinary local prepare, preserving source refusals and other null-source routes.

    - `[x]` **2.5.d Read a vehicle-less local result in the discharge and hosted request admission**
        - Ordinary Candidate local terminals and pending attempts participate in discharge and hosted capacity.
          Earlier-attempt queries retain local history without a PR coordinate; the shared predecessor confirmation
          already names local producers as delegated-agent. Real records prove fix-check convergence and ranked admission.

    - `[x]` **2.5.e Dispatch it from `integrate-work-unit`**
        - Integration consumes the ordinary singleton request seed and local coverage choices before launch, attestation,
          reduction, and response. Both routes distinguish a converged fix check from complete full-final replay and
          carry additional-pass authority only after a converged complete pass.

    - `[x]` **2.5.f Drive the singleton's lane end to end**
        - Real Git and production handlers carry hosted material findings through an offered ordinary local fix check
          to ranked hosted complete closure. A base move after an unchecked fix offers only local complete coverage.

### `[x]` **2.6 Offer and carry the Owner's stop at `coverage-required` on the work-unit path — § 8.2**

- _Goal:_ The Owner's stop is offered and carried at `coverage-required` on the delivery path's work-unit route and in
  pre-publication once the terminal's response is performed, as Task 1.7 lets the driver honor it.

    - `[x]` **2.6.a Bind the delivery terminus offer at status's `coverage-required`**
        - Settled material-fix coverage carries the exact member offer with the unchecked-fix disclosure. Accepted
          termini preempt coverage choices and coverage-required null sources; converged fix checks retain the offer
          beside ranked complete requests. Offer projection lives outside the status reducer.

    - `[x]` **2.6.b Pin pre-publication's terminus at `coverage-required`**
        - A clean converged fix check with supplied Owner acceptance projects publication readiness, retains the
          accepted terminus, and clears the reservation without claiming complete review coverage.

    - `[x]` **2.6.c Offer the stop in `prepare-work-unit` and `integrate-work-unit`'s delivery route**
        - Settled coverage offers the existing pre-publication or exact delivery-member stop with a recommendation and
          unchecked-fix disclosure. Integration preserves its singleton limit and incremental additional-pass authority.

    - `[x]` **2.6.d Keep the unconfigured-source Owner-stop remedy executable — § 7.3**
        - Work-unit missing-source refusals retain the exact member cursor and disclosed acceptance offer. Acceptance
          settles its member with the source list unchanged; configuring the local source resumes the original route.
          Integration's refusal dispatch consumes the offered stop through the existing acceptance procedure.

### `[x]` **2.7 Remove hosted incremental review — § 7.9, § 7.10**

- _Goal:_ ARC never requests hosted incremental review: its writers are gone, every hosted admission and both hosted
  status routes refuse incremental coverage with a remedy naming the local fix check, a stored hosted record holding
  incremental coverage still parses and replays, and a request already in flight ends with a remedy.

    - `[x]` **2.7.a Delete the hosted incremental writers**
        - Hosted adapters refuse incremental requests before GitHub access and issue only bare complete commands.
          Correction capabilities, native range production, and hosted incremental choices are removed; local choices
          and CodeRabbit's request-generation readers remain.

    - `[x]` **2.7.b Refuse incremental hosted coverage at every admission**
        - Admission permits hosted complete coverage only. Fresh requests refuse incremental coverage through one
          typed remedy before capacity checks; retained request replays remain readable. Delivery and singleton status
          preserve the original route and name the local fix-check retry; complete requests still execute after refusal.

    - `[x]` **2.7.c Keep the read side, and end a request already in flight**
        - Incremental CodeRabbit terminals without native evidence now end with a complete-pass or local-fix-check
          remedy, consuming no pass and sealing no evidence. Existing incremental records still parse and replay;
          command-generation attribution and competing handwritten incremental requests retain their refusal behavior.

    - `[x]` **2.7.d Update the help and the overview**
        - Status help distinguishes review coverage from hosted complete-only coverage. The project overview names
          local fix checks, converged fixes before hosted complete passes, and bare provider commands; stored type names
          and the standard-review stream remain intact.

### `[x]` **2.8 Run the bounded check at both applicability stops — § 7.7**

- _Goal:_ At both applicability stops over a bounded residual, a fresh-context local evaluator runs one check of what
  the movement changed before the Owner chooses, the supplemental `--coverage incremental` arms that ran nothing are
  gone, and a fix the check prompts lands by its own route outside and inside a bound delivery.

    - `[x]` **2.8.a Give `assess-evidence-applicability` the bounded check**
        - The method directs one fresh local movement check at the two bounded review stops, with explicit merge or
          rewrite context and dependency inspection. Findings accompany the unchanged recommendation contract; scope
          exclusions, disposition approval, recommendation mapping, and post-fix disclosure remain explicit.

    - `[x]` **2.8.b Fire it at `integrate-work-unit`'s pre-reconcile stop**
        - Integration applies the declared method before the pre-reconcile applicability choice and presents its
          findings and recommendation. The post-reconcile fire-point remains; machine-final and merge-safety results
          retain their existing boundaries.

    - `[x]` **2.8.c Remove the supplemental `--coverage incremental` arms**
        - Delivery and integration dispatch typed coverage offers and applicability choices without requesting an
          incremental hosted supplement. Local fix-check selection remains on its ordinary admitted route.

    - `[x]` **2.8.d Land a prompted fix outside a bound delivery**
        - An unbound fix uses ordinary change and commit gates, then re-enters applicability over its fixed head for
          one Owner choice. The movement check does not repeat; retained or targeted evidence explicitly leaves the
          fix unchecked by a pass, and checkpoint dispatch reuses the completed movement check.

    - `[x]` **2.8.e Land a prompted fix under a bound delivery**
        - A bound fix takes the Owner's applicability choice first and blocks member review and landing while pending.
          The existing correction controller must be idle before a member-owned task and plan revision are authored;
          its continuation lands the fix, then the fixed-head choice repeats without rerunning the check.

    - `[x]` **2.8.f Replace "focused supplementation" in the overview**
        - The project overview names the fresh local movement check at bounded review applicability stops and leaves
          verification and complete-review continuations with their typed routes.

## **Phase 3:** The delta check after a plain commit

_Purpose:_ Give a commit after a converged look that answers no finding a scoped local look whose range Git proves,
on an Errand before and after its pull request, in pre-publication, and on the published singleton, without letting
that proof carry an earlier review to a later head.

_Design decisions:_ The range proof is the chain proof's third ground (Task 1.1.b), returned as a `range-proven` result
of its own that only correction-scope resolution and chain re-confirmation accept; every other check of a confirmation's
result, and every consumer that carries an earlier attempt to the current head, treats it as not applicable. A
confirmation reports its ground; the context's `incremental.basis` reads `delta-check` when the current leg's ground is
the range proof. Workflow text changes in the package's `arc/` source first, then in the `.arc/` copy.

### `[x]` **3.1 Prove a plain commit's range from Git, and report it as its own result — § 3.5**

- _Goal:_ A commit after a converged look has a range proof whenever its base ref, diff base, and diff-base tree equal
  the predecessor's and its head descends from the converged head with no merge commit between, and the chain proof
  reports it as `range-proven` only after today's grounds and the performed-response test, so every leg that holds today
  keeps its ground.

    - `[x]` **3.1.a Build the range proof**
        - The new range prover requires convergence, a changed descendant head, an exact unchanged base, and no merge
          in the Git range. It uses the existing ancestry and merge readers bound to the checkout and fails closed on
          unreadable evidence; real Git distinguishes linear commits from merged contribution.

    - `[x]` **3.1.b Add it to the chain proof as its own result**
        - The shared chain proof preserves existing grounds and performed-response proof before trying the range proof.
          Only correction scopes and chain re-confirmation accept `range-proven`; the current leg gives the context its
          transient `delta-check` basis. Delivery keeps its contribution proof, and historical carry rejects the new result.

### `[x]` **3.2 Admit a delta check's scope, recorded as a fix check's attempt — § 3.5**

- _Goal:_ After a converged predecessor whose head no response produced, a correction scope resolves only with its
  range proof, carrying the predecessor's required findings, and the coverage chain re-confirms that leg on every later
  round; the attempt and its instructions are a fix check's, less the closure axis.

    - `[x]` **3.2.a Resolve the delta check's scope**
        - Range-proven scopes accept converged clean and no-fix predecessors and retain their required findings. Later
          fix checks re-prove every delta leg from Git. Delta admission requires a local source and excludes delivery;
          under `full-final`, only pre-publication and an Errand with an open pull request qualify.

    - `[x]` **3.2.b Give the delta check its instructions**
        - Local preparation carries the current basis beside its guidance without persisting a marker. Delta instructions
          retain range coverage, clean rules, carried findings, and the three inspection axes while omitting repair
          closure. Source, scope, coverage-admission, and operation-state schemas are unchanged.

### `[x]` **3.3 Run the delta check on `delegated-agent`, admitted without a selection — § 3.5, § 7.2**

- _Goal:_ Where a delta check is admissible, the driver selects `delegated-agent` whatever the configured rank and
  reserves no hosted source, refuses any other forced source with a remedy naming the delta check, and local prepare
  admits it without a selection, while complete coverage supplied in local prepare's request runs a local complete
  pass instead.

- _Outcome:_ The driver selects `delegated-agent` for an admissible delta check and refuses other forced sources with
  a delta-specific remedy. Local coverage selection returns its admitted scope; preparation and replay adopt it when
  coverage is omitted, while an explicit complete choice publishes a complete local pass.

### `[x]` **3.4 Keep the range proof out of every consumer that carries an earlier attempt — § 3.5**

- _Goal:_ No consumer that carries an earlier attempt from its own head to the current head accepts a leg only the range
  proof supports, so a converged look alone never closes the lane at a new head, while the delta check's own attempt, a
  carried attempt's own chain, and every carry that holds today on another ground are unaffected.

- _Outcome:_ Carry readers remain separate from correction-chain proof. Regression coverage keeps a provable plain
  descendant at the earlier-read and Errand review stops, admits a delta attempt at its own head, and preserves a
  mechanically carried attempt whose own chain includes a delta leg. Equal-subject carry remains applicable.

### `[x]` **3.5 Run the delta check on an Errand, before and after its pull request — § 3.5**

- _Goal:_ On an Errand, a plain commit after a converged look takes a delta check before and after its pull request
  under `incremental`, closing the lane when it converges; under `full-final` it runs only with a pull request open and
  is followed by the complete pass, and before the pull request the complete pass runs with no delta check first.

    - `[x]` **3.5.a Reach every Errand chain confirmation**
        - Local prepare, resolve, respond, Errand status, and hosted admission prove delta ranges through the shared
          chain proof. Each composition supplies its configured sources and lifecycle surface; historical chain
          re-confirmation accepts the range ground while the earlier-review carry remains unchanged.
        - Private and open-PR preparation and chain rechecks agree; hosted admission refuses a due delta check and
          re-confirms a converged delta before admitting an authorized additional complete pass.

    - `[x]` **3.5.b Close or continue the Errand's lane by its retrigger**
        - Integration coverage closes incremental delta checks before and after publication, admits their authorized
          additional hosted pass, and preserves that authorization in status's request. Full-final takes a delta then
          the ranked complete successor with an open PR, and a complete pass directly before publication.

    - `[x]` **3.5.c Say so in `run-errand`**
        - The workflow names the delta check after a plain commit and its retrigger-specific closure. It gives the
          local complete alternative through explicit coverageAdmission first, then the hosted successor by rank or
          additional-pass authorization. Package source and installed workflow agree.

### `[x]` **3.6 Run the delta check in pre-publication once the Candidate checkpoint advances the same Candidate — § 3.5**

- _Goal:_ In pre-publication, after the Candidate checkpoint's `covered` or `targeted-check` advances the same Candidate
  to a plain commit's head, the next pass is a delta check, while `changed`, which roots a new Candidate, leaves the
  complete pass as today.

- _Outcome:_ Same-root `covered` and `targeted-check` selections lead to local delta coverage without reserving a
  hosted source. Private full-final admission binds the live Active work unit and matching Candidate boundary;
  changed roots keep complete coverage. Pre-publication and respond re-confirm delta chains, and the exact
  additional-pass authorization survives convergence. `prepare-work-unit` names the delta and complete alternative.

### `[x]` **3.7 Request the delta check from the published singleton's discharge under `incremental` — § 3.5**

- _Goal:_ Under `incremental`, the published singleton's discharge requests a delta check instead of the
  review-applicability stop when the earlier terminal converged and the range proof holds, carrying no source or
  invocation recovered from an earlier pass; under `full-final` the stop is unchanged, and status refuses a `--coverage`
  it cannot carry to the singleton's local pass.

    - `[x]` **3.7.a Leave the stop branch for the delta check**
        - Singleton discharge requests the proven local delta across bounded, unbounded, and unavailable residual
          classifications, using the full source list and no recovered invocation. Current and historical checks bind
          the shared range proof directly; the delta closes its lane while `full-final` and delivery keep their stops.

    - `[x]` **3.7.b Refuse a `--coverage` status cannot carry**
        - Singleton status refuses explicit coverage on fresh and settled local prepare routes, preserving the public
          status scope in its retry and naming local prepare's `coverageAdmission`. Omitted coverage keeps the local
          prepare action; the admission predicate is shared with action composition.

    - `[x]` **3.7.c Say so in `integrate-work-unit`**
        - The singleton's local action names the incremental delta check and its closure, keeps the full-final
          applicability stop, and offers a local complete pass as the lighter alternative to re-rooting.

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

### `[x]` **4.1 Derive the next-pass offer's facts once — § 6.1**

- _Goal:_ One derivation computes the offer's facts from lane progress and disposition records — complete passes
  against the ceiling, fix-check rounds since the last complete pass and their results, the fix range's size against the
  target, whether the chain is proven, each round's two new-design signals, and the material trend — for the offer text,
  the report, and the lane read alike.

- _Outcome:_ `deriveNextPassFacts` returns one typed, unstored shape for complete counts, fix-check results since the
  last complete look, verified material trends and provisional counts, proven-chain range sizes, and each performed
  round's path signals. Historical rounds join their exact approved sets; unavailable Git reads remain unknown.

### `[x]` **4.2 Add the lane read — § 9.4**

- _Goal:_ A read-only CLI read returns, for the checkout's Errand claim, Candidate, or named delivery member, the
  lineage's rejected findings — each one's lane, locus, title, and reason — and Task 4.1's facts, a delivery member
  counted against its own ceiling, stores nothing, and refuses with a remedy when no subject resolves.

- _Outcome:_ `review lane read` returns both lanes' rejections with their verification status, shared standard facts,
  and last-look coverage for Errand claims, current or inherited Candidates, and authenticated delivery members.
  It shares prepare's subject resolver, counts each member independently, and reads without initialization or
  publication locks. Refusals retain the exact request and a checkout or member-head remedy.

### `[x]` **4.3 State the next-pass offer as bounds, then considerations — § 6.3**

- _Goal:_ Every coverage offer states the allowed steps once, in plain words, then gives each consideration its reason
  and the condition under which it favors an option, and ends by asking for the recommendation — in local prepare and on
  the work-unit path alike.

    - `[x]` **4.3.a Rewrite local prepare's selection text**
        - Local prepare derives shared facts through the lane read's history adapter and renders bounds before
          considerations. The fix check comes first; a complete pass stays separate, and a failed chain names complete
          alone with a prompt to check why. Each fact supplies its value and decision condition before advisory judgment.

    - `[x]` **4.3.b Replace the work-unit path's selection prompt**
        - Hosted coverage offers render shared facts from the delivery member's own lane history, with admitted bounds
          before considerations and advisory judgment last. Discharge emits no command; status inserts executable retry
          commands for its original work-unit or target selector, using only accepted flags.

### `[x]` **4.4 Give a complete pass pointers and withhold verdicts — § 9.1, § 9.2, § 9.3**

- _Goal:_ A local complete pass receives the lineage's earlier fixed findings as pointers — locus and defect class,
  labeled as previously reported and fixed with the fix and its surroundings still in scope — and the instruction to
  search independently and sweep for siblings, and receives no rejection, verdict, clean status, or claim that a fix
  closed its finding; hosted requests carry none.

- _Outcome:_ Complete local reviews receive only loci and optional defect labels from both lanes' verified approved
  fixes, through the lane read's shared history adapter. Instructions keep repairs and surroundings in scope and call
  for independent search and sibling sweeps. The existing stored string survives replay and renewal; hosted requests
  and stored record shapes are unchanged.

### `[x]` **4.5 Check new findings against the lineage's rejections in triage — § 9.4**

- _Goal:_ In `review-triage`'s source verification, the primary agent checks each new finding against the lineage's
  rejections from the lane read, asking whether each rejection's reason still holds against current source, with no
  verdict entering the evaluator's context.

- _Outcome:_ Triage reads the lane before source verification, checks earlier rejection reasons against current source,
  and keeps rejection context with the primary agent. Delivery reads name the exact member head, refusals retain their
  remedies, and author self-review outside a lane skips the read. Package and project method copies match.

### `[x]` **4.6 Stop for the Owner after a clean fix check when the judgment recommends stopping — § 6.2, § 8.3**

- _Goal:_ After a clean fix check on a `full-final` standard lane, each code-review workflow runs the lane read at its
  next-pass step and applies the judgment; where a surface takes the stop it stops before the complete pass is
  dispatched when the judgment recommends stopping, and where none does it states the recommendation and the limit and
  the complete pass runs.

    - `[x]` **4.6.a `run-errand` at the driver's `ready`**
        - Both standard ready routes read typed lane facts before dispatch. A clean fix check prompts advisory
          successor judgment; a stop recommendation offers exact Owner risk acceptance at the open PR. Before the PR,
          the workflow states the limit and continues the complete pass without creating a terminus.

    - `[x]` **4.6.b `prepare-work-unit` at `ready` and at the hosted-first reservation**
        - The lane read precedes local preparation and a hosted-first reservation's convergence or publication action.
          Clean fix checks prompt advisory successor judgment, with explicit Owner acceptance carried through the
          existing terminus. Reservation dispatch now precedes the null-policy arm and preserves unchanged decisions.

    - `[x]` **4.6.c `integrate-work-unit` at `continue-pre-publication-review`, the delivery route, and the singleton**
        - The private continuation uses preparation's clean-fix-check protocol. Public ready actions read lane facts;
          the work-unit delivery route offers its exact member terminus when stopping is recommended. The published
          singleton states its limit and continues complete review, preserving prior exact successor decisions.

    - `[x]` **4.6.d `deliver-stack`'s member review**
        - Member review reads the selected head's lane facts before either request action. A clean fix check prompts
          advisory successor judgment; the workflow states that its target route takes no Owner terminus and follows
          the admitted complete pass without replacing repair verification.

    - `[x]` **4.6.e Recommend from the same read at the ceiling**
        - Every standard-lane ceiling arm reads the same subject's facts and recommends another pass or stopping with
          cost, expected signal, and the evidence that would change the recommendation. Exact consequence approval
          remains the authority for another pass.

### `[x]` **4.R Prepare the complete successor after a clean local fix check — A1**

- _Goal:_ Ordinary local preparation under `full-final` admits the complete successor after a clean fix check at the
  same head, while replay of an unfinished or explicitly named operation remains stable (A1).

- _Outcome:_ `replayPendingLocalAdmission` lets ordinary preparation advance beyond a clean incremental result under
  `full-final`, retaining explicit coverage and delivery replay. The private Candidate scenario reaches complete
  coverage and pre-publication convergence verification after the clean fix check.

### `[x]` **4.7 The cadence on every path** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on every path it names, each exercised through its real composition.

- _Outcome:_ Real-handler scenarios exercise material fix → local fix check → complete closure on both Errand
  surfaces, the private Candidate, the published singleton, and a delivery member. Plain commits take delta checks
  only on the admitted paths; delivery, moved bases, merge ranges, and re-rooted Candidates retain their exclusions.
  The private Candidate's missing successor is corrected in 4.R (A1); the rerun reaches closure on every path.

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

### `[x]` **5.1 Derive the complete count once, and give every ceiling reader that count — § 4, § 5.1**

- _Goal:_ The next-pass context carries the lane's complete count — its finished passes whose `effectiveCoverage` is
  `complete` — as the one derivation every ceiling read takes, so no ceiling read can disagree with the driver's.

- _Outcome:_ The internal next-pass context now requires the canonical complete count. Supersession and delivery
  projection share `countCompleteLogicalPasses`; resolve, admission, respond, and lane facts carry the same count,
  including validated Candidate ancestors. Interleaved histories retain their logical attempt numbering.

### `[x]` **5.2 Compare against the ceiling by complete count, and bind attempts by `logicalPass` — § 5.2**

- _Goal:_ Every comparison against `review.standard_max_passes`, and every decision whether an override is needed, reads
  the complete count, while every site that numbers or binds an attempt keeps `logicalPass` and `validatePassCounts`
  still holds one finished outcome per logical pass.

    - `[x]` **5.2.a Move the ceiling comparisons to the complete count**
        - Driver, Errand history, delivery consistency, and Candidate continuation compare the complete count.
          Terminal evidence retains its own coverage so override validation subtracts only a complete terminal;
          override coordinates continue to bind logical attempts.

    - `[x]` **5.2.b Keep `logicalPass` where an attempt is numbered or bound**
        - Audited numbering and authorization, terminal, terminus, and owner-index bindings against logical counts.
          Shared context now checks the predecessor's logical attempt against the finished count; lane readers carry
          both counts independently. Interleaved schema-backed histories retain one outcome per logical attempt.

### `[x]` **5.3 Report respond's ceiling position and consequence from the complete count — § 5.2, § 5.3**

- _Goal:_ The respond envelope's provisional assessment states the ceiling position from the passes the ceiling counts
  once the admitted attempt finishes, and reports a ceiling decision only when no fix check will be admissible, so a
  fix check neither moves the position nor triggers the decision.

    - _Amended in:_ 5.R (A2)

    - `[x]` **5.3.a Give respond the facts, and the position its count**
        - Respond reads lane facts, current-chain adequacy, and local-source selectability through one repository port.
          The pure assessment projects `ceilingPassCount` from complete standard looks or the recorded frontline pass;
          its schema admits incremental follow-up at any position while bounding complete follow-up by the ceiling.

    - `[x]` **5.3.b Predict the ceiling decision**
        - `projectFixConsequence` predicts incremental follow-up from current-chain adequacy and local selectability
          before testing the ceiling. Material fixes with either ground unavailable retain the complete-pass decision;
          the projection takes both grounds from respond's repository port.

### `[x]` **5.4 Decide the ceiling after coverage is chosen — § 5.3**

- _Goal:_ At the ceiling, a lane whose next step is a fix check or a delta check gets that step with no override, and
  only a complete pass past the ceiling needs the ceiling override or an `additional` extra pass, so an override always
  binds to the complete pass that uses it.

    - `[x]` **5.4.a Return `ready` at the ceiling while an incremental look is admissible**
        - The internal chosen coverage gates complete-pass ceiling admission and override application. Proven
          incremental looks remain ready; an override beside chosen incremental coverage refuses with its own code.
          Resolve and local-prepare remedies remove the override and retain the selected incremental scope.

    - `[x]` **5.4.b Supply the chosen coverage in each composition**
        - Local prepare checks the submitted choice and rechecks resolved coverage. Delivery and singleton status
          forward the selected coverage; hosted capacity always checks complete coverage. Errand status re-resolves
          a hosted action as complete before offering it, while pre-publication retains its unchosen continuation.

- _Outcome:_ Real capped member, singleton, and Errand routes admit fix checks without an override and require
  approval for chosen complete coverage. Errand hosted requests enforce that boundary again before capacity spend.

### `[x]` **5.5 Bind a conditional next-pass authorization only to a complete pass — § 5.4**

- _Goal:_ A conditional next-pass authorization is offered only when a ceiling decision is reported and is spent only
  by a complete pass's admission, so no fix check or delta check spends it, and one a fix check overtakes lapses.

- _Outcome:_ Named standard-lane admissions require a pending complete local or hosted binding before consuming
  conditional authority. Incremental requests name complete coverage or withdrawal as the remedy. An unnamed fix check
  leaves authority bound; after its terminal result advances the attempt count, that authority cannot admit the
  complete successor. Frontline binding retains its existing behavior.

### `[x]` **5.6 Show a pass as a complete pass against the ceiling, and a fix check as a round — § 5.5, § 13**

- _Goal:_ Everything the Owner reads shows a pass as a counted complete pass against the ceiling and a fix check in
  rounds since the last complete pass, each with its result, and never shows an attempt number as a pass; typed fields
  that carry the attempt number keep their shape and meaning.

    - `[x]` **5.6.a Change the CLI text**
        - Response summaries use counted complete passes and fix-check rounds from lane facts, with successors
          numbered in the same terms. Errand status uses the complete count; offers, trend labels, hosted failure
          holds, and ceiling remedies distinguish complete-pass spend from repair checks and attempt identities.

    - `[x]` **5.6.b Change the workflow and method text**
        - Both copies distinguish logical attempts from complete-pass spend, including inherited counts and
          conditional authority. Ceiling offers use lane facts; triage and its approval example name complete passes
          or fix-check rounds. Aggregate review counts toward the standard ceiling only with complete coverage.

    - `[x]` **5.6.c Change the ceiling comment in `arc-config.yml`**
        - Both comments define the standard ceiling as complete passes, with fix and delta checks outside it, and
          retain the frontline ceiling's completed-pass accounting and explicit approval beyond either ceiling.

### `[x]` **5.R Preserve historical member fix-chain proof in respond — A2**

- _Goal:_ Respond confirms historical delivery-member correction legs through their approved, performed fix-response
  proof, so a material fix check predicts the admissible next round outside the complete-pass ceiling (A2).

**Additional Context:** `notes-review-coverage-cadence.md` § A2 — Historical member fix-chain proof.

- _Outcome:_ Historical member legs reach the exact stored fix-response proof before live-head grounds can refuse
  them. The capped member scenario predicts and runs three material fix-check rounds, then requires approval for
  the complete successor; missing proof and changed-target refusals remain in the shared validator.

### `[x]` **5.7 Fix checks at the ceiling** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds through a real lane at the ceiling.

- _Outcome:_ A real member lane capped at one complete pass runs and predicts three fix-check rounds without an
  override. Its clean check leaves the lane open, and only an approved second complete pass discharges it; the
  summaries keep round numbers separate from complete-pass counts. This rerun revalidates A2.

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

### `[x]` **6.1 Add the `review-model` method — § 10.1**

- _Goal:_ One method defines the pass model both review families use — pass, fix check, cap, convergence, the
  re-inspection test, fold tags, cadence, and the loop reading — and reaches every project through its fire-point
  declarations.

    - `[x]` **6.1.a Write the method**
        - `review-model` defines complete passes, incremental rounds, convergence, permission, tags, re-inspection,
          cadence, and separate family records in both copies. Direct consumers load it at marked fire-points;
          their existing approval constraints remain at the invocation sites.

    - `[x]` **6.1.b Make it reach every project**
        - Registered the Configurable core method in the recipe, classifier, inventory, table inputs, relationship
          index, and generated manifest entry. Init, update, sync, and all PM/team recipe configurations exercise
          the installed method; the delivery correction E2E now expects the required local coverage choice.

- _Outcome:_ Every project installs the shared method, and the three current review consumers declare and invoke it
  at their fire-points. The method and its registration form one reachable installation change.

### `[x]` **6.2 Make a fix check and a successor pass separate decisions — § 10.2**

- _Goal:_ `review-model` and `adversarial-review` § Fold verification state that a fix check is recommended, with
  another round, whenever the last look's approved fixes include a material one, is declined only on the fixes' own
  merits, and is never traded for a following pass, approved or under the cap.

- _Outcome:_ The fold-verification recommendation applies materiality to the last look's approved fixes in every
  round. Successor approval or unused capacity never supports declining a check; rounds converge first, and
  `prior-findings` supplies context rather than evidence of repair verification.

### `[x]` **6.3 Render every review report in one shape — § 10.3**

- _Goal:_ An adversarial pass, a fix-check round, and a code-review findings round each render one shape — header line,
  a `#` / `Grade` / `Finding` / `Action` table, sections per finding with `**Fails:**`, one Decisions block, and a
  loop reading — with the loop reading's four readings defined in `review-model`, and with each finding's label the same
  in every render of one set.

    - `[x]` **6.3.a Give `disposition-report` the shape, and render it in the CLI**
        - Both method copies and the renderer use the four-column table, section status and Finding/Fails fields,
          optional header, and one Decisions block. Labels are assigned before advisory tag sorting and stay fixed
          across the table, questions, sections, and evidence; exact-text fixtures retain grading and escaping checks.

    - `[x]` **6.3.b Define the loop reading in `review-model`**
        - Both copies define the four advisory readings and their decisions, with discovery taking precedence over
          convergence. Code review distinguishes the computed trend and performed-round signals from forecast tags
          and the agent's origin reading; sustained new design calls for the Owner's amendment decision.

    - `[x]` **6.3.c Render the shape in `adversarial-review`**
        - The evaluator schema carries each finding's rubric anchor or reason for none. Primary-facing passes and
          fix-check rounds use the shared header, tagged table, sections, Decisions block, and advisory loop reading;
          canonical labels precede display sorting and provisional convergence waits for disposition approval.

### `[x]` **6.4 Carry the agent's report inputs on respond, keeping only the tags, as an advisory note — § 10.4**

- _Goal:_ The first `arc review respond -` call takes the agent's parts of the report — one tag per fix, one
  `**Fails:**` anchor per finding, the successor-pass recommendation, and the origin counts with the reading and its
  rationale — as inputs the CLI renders; the approved call carries the tags again and stores them beside the approved
  set, outside its identity, so the approved report and the replay order and tag the same way; nothing else is stored.

- _Outcome:_ Respond renders caller-owned anchors and loop judgments beside computed pass facts, keeping only
  immutable fix tags on the approved lineage node. First approval, verified member fixes, and Candidate settlement
  replay retain the tagged reduced report; identity refusals provide a corrected-request route. Local prompts ask
  reviewers for rubric anchors. Shared response fixtures keep the request migration outside the large test body.

### `[x]` **6.5 Offer a return to shaping where no level is higher — § 10.5**

- _Goal:_ Where a floor-raising signal's own stage is already at `high`, `resolve-planning-depth` § Mid-stage re-entry
  and `adversarial-review`'s exit gate offer the top-level shape — a return to shaping for the named locus, the `Class`
  ratchet to `Novel`, or `assess-boundary-fit` — and never "re-enter higher".

- _Outcome:_ The owning stage at `high` offers shaping, an invention ratchet, or boundary assessment. Accepted
  shaping ends the loop, returns through that stage's authoring and readiness, and starts a fresh cap with the
  ended loop's findings as context. All three planning call sites carry the first-pass exception; upstream
  derivation routing and deferred Class persistence remain intact.

### `[x]` **6.6 Align the review methods' prose to the model — § 10.6, § 10.7**

- _Goal:_ `review-triage`, `review-response`, and `classify-review-risk`'s "What the call changes" state the model
  where they touch it, and the family says that human review follows out of band and is never a pass.

- _Outcome:_ Triage and response carry the advisory report inputs and immutable tag note, distinct repair-check
  and successor decisions, and complete-pass accounting. Risk guidance describes fix checks before full-final
  closure; response guidance places human review outside the agentic pass model.

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

### `[x]` **7.1 Re-derive the review step inventory on the current base — § 11**

- _Goal:_ A before-inventory of every review step at every site, taken on the then-current base, gives the segment
  something to measure the rewiring against.

- _Outcome:_ `notes-review-coverage-cadence.md` § Review call sites records the before-inventory at `87b355ceb`,
  with every site restatement, proposed home, and reaching sites, including the new coverage and delta-check arms.
  It distinguishes shared review from authoring-loop checks and lifecycle steps that remain at their sites.

### `[x]` **7.2 Add `planning-review`, and call it from the four planning sites — § 11.2**

- _Goal:_ One `planning-review` method holds the stage-gate review `draft-design`, `create-spec`, and `generate-tasks`
  repeat today, and every planning site calls it with its artifact or depth: those three stages recommend the offer at
  `Heavy` and `Novel`, the amendment uses depth, and the post-settle re-read is the last step before each site's commit.

    - `[x]` **7.2.a Write the method**
        - Added the artifact/depth contract, selected author checks and independent rubrics, Class cap, common
          findings and pass record, and final reread. Registered the configurable core method for every project
          configuration, including recipe, manifest, inventory, checks, and installation oracles.

    - `[x]` **7.2.b Call it from `draft-design`, `create-spec`, and `generate-tasks`**
        - Replaced cloned stage-gate blocks with typed artifact call sites and fragment-bearing method links.
          Heavy drafts now receive the recommended offer; each stage invokes the shared reread immediately
          before its capture commit, including after task rendering.

    - `[x]` **7.2.c Call it from `amend-design`**
        - The capture step passes the amendment footprint, depth, Class, and recorded planning findings to the
          shared contract. The depth ladder keeps authoring at scope; the method owns the offer and Class cap,
          with the shared reread before every capture, task, or review-fix commit.

### `[x]` **7.3 Add `code-review`, and give each code site a thin dispatch — § 11.3**

- _Goal:_ One `code-review` method holds, as named sections, what the code sites clone today — the author check, the
  findings round, hosted await and settlement, and the common rules — and each site keeps a thin dispatch on its own
  command whose arms cite those sections.

    - `[x]` **7.3.a Write the method**
        - Added the registered `code-review` method with standalone section signatures for the author check, findings,
          hosted continuation, and common review decisions. The pure author check returns findings to its shared caller;
          approved response resumes retain identity, and committed verified-fix replay precedes push.

    - `[x]` **7.3.b Rewire `run-errand`, `prepare-work-unit`, `integrate-work-unit`, and `deliver-stack`**
        - Replaced cloned review procedures with used fragment links while retaining each caller's typed command,
          verification, and lifecycle. Verification and inbox routing reach the same homes; delivery description upkeep
          follows pushed corrections. Content assertions resolve actual links and reject replay after push.

### `[x]` **7.4 Add `verification-review`, and make `validate-criteria` its check — § 11.4**

- _Goal:_ `verification-review(scope)` runs the author's criteria walk and its independent companion at delivery-member
  and work-unit scope, `validate-criteria` becomes its pure check, and the two sites that want evidence without review
  call the check directly.

    - `[x]` **7.4.a Write the method and reduce `validate-criteria` to its check**
        - Registered `verification-review(scope)` with the author walk, Class-scaled companion, criterion-anchored
          findings, and evidence return. `validate-criteria` retains immutable binding, three states, and report deltas;
          the companion posture is stated once with decline proceeding normally.

    - `[x]` **7.4.b Call it from `verify-work-unit` and `process-task-loop`**
        - Both boundaries pass their full scope through named YAML calls and fragment links to the walk and companion.
          Their quality gates, unresolved stops, criterion marking, and lifecycle remain with the caller.

    - `[x]` **7.4.c Call the check directly from `deliver-stack` and `amend-design`**
        - Delivery corrections link directly to the pure criteria walk; amendment closure links to its delta section.
          Both retain direct check declarations and their exact evidence scope, structurally bypassing the independent
          review method.

### `[x]` **7.5 Declare what each site and review-type method fires, and map the family — § 11.1**

- _Goal:_ Every site declares the review-type method it calls and every review-type method the checks, vehicles,
  findings methods, and `review-model` it fires; methods' "Workflow:" callouts name their real callers; and
  `review-model` and the methods index map the family.

    - `[x]` **7.5.a Set the declarations and callouts**
        - Declarations now follow direct consumers: the planning authoring loops retain their checks, code and
          verification boundaries call their review methods, and lane methods declare their own evaluator and rubric.
          Caller callouts name those consumers; standalone audit doors and evidence-only checks remain reachable.

    - `[x]` **7.5.b Map the family**
        - `review-model` maps sites, three review types, checks, vehicles, findings handling, routing, and moved-target
          judgment. The methods index groups navigation by layer and identifies the pure author and criteria checks.

### `[x]` **7.6 Fix the drift between sites — § 11.5**

- _Goal:_ Every drift item § 11.5 lists, re-confirmed against source, is fixed.

    - `[x]` **7.6.a Remove the contradictory frontline and ceiling-override text**
        - Member review has no frontline invocation, and integration/member status carry ceiling consequences only
          through their supported routes. The Errand retains its explicit hosted, local, and frontline admissions;
          shared ceiling handling grants no unsupported caller capability.

    - `[x]` **7.6.b Fix the composer and naming drift**
        - The shared findings round assigns proposal composition to `review-triage`. Specification finalization names
          its spec check; three former naming sites disappeared with the shared planning call. Adversarial pass records
          now distinguish the stored review-gate operation from the `code-review` method.

    - `[x]` **7.6.c Fix the declarations nothing fires and the fire-points nothing declares**
        - Reconfirmed the source against the drift list: Task 7.5.a removes unused workflow declarations, declares
          authoring-loop grounding directly, routes member review through its type, and names the actual adversarial
          consumers. The method-trigger audit accepts the resulting graph.

    - `[x]` **7.6.d Place the verified-fix replay and run the author check at `run-self-review`**
        - Task 7.3 places committed verified-fix replay before every shared push release, including Errand and hosted
          integration paths. Pre-publication dispatch runs the shared author check before recording it settled;
          linked content checks reject a replay moved after push.

    - `[x]` **7.6.e Fix the companion posture, the re-read placement, and the singleton's additional pass**
        - Task 7.4 states companion posture once; Task 7.2 places the shared reread immediately before planning commits.
          Task 7.3 limits additional-pass authorization to delivery status and states that the ordinary singleton
          discharge takes none and returns settled.

### `[x]` **7.7 Rename `frontline-review`, `standard-review`, and `self-review` — § 12**

- _Goal:_ The methods are `code-review-frontline`, `code-review-standard`, and `code-review-author` everywhere a method
  name is read — files, activation keys, classification, recipe, manifest, checks, declarations, prose, and tests — in
  both copies, while the lane vocabulary and every stored or schema literal and published schema ID that carries an old
  name stay.

    - `[x]` **7.7.a Move the method files and their keys**
        - Moved all three files in both copies with their activation keys, classification, recipe, manifest, and table
          inputs. The project frontline activation remains true; package defaults and renamed diagnostics retain their
          behavior without aliases or migrations.

    - `[x]` **7.7.b Move the references**
        - Moved method declarations, links, headings, index groups, strategy tables, briefings, and the audit skill's
          method references. Author findings point to the shared caller's footer procedure; plain review prose and
          lane vocabulary remain unchanged.

    - `[x]` **7.7.c Move the tests that pin a name**
        - Updated method paths, fixture names, activation keys, and diagnostics across installation, carrier, and
          content tests, including the extracted code-review contracts. Sorted diagnostics follow the new names.

    - `[x]` **7.7.d Keep every literal § 12.3 lists, and the lane vocabulary**
        - Frozen public-producer records parse with the original requirement, rubric, frontline, reservation,
          guidance, activity, routing, promotion, and author-action literals. Identity preimages and published schema
          IDs remain bound; narrow negative controls reject renamed contracts and IDs.

### `[x]` **7.8 Every review step in exactly one place** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds against Task 7.1's inventory.

- _Outcome:_ The after-inventory in `notes-review-coverage-cadence.md` binds all 43 original rows to their actual
  home sections and reaching callers. Used fragments, direct evidence checks, every drift correction, both-copy
  registration, project activation, replay ordering, and absence of old method files close the replication boundary.

## **Phase 8:** Verification

### `[x]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Nineteen selected merge checks passed, including full build, lint, both type checks, 16,136 unit
  tests and 3,862 integration tests. Whole-branch content feedback passed; three CI-only checks were not selected locally.
- _Success criteria:_ All nineteen met. `notes-review-coverage-cadence.md` retains exact criterion digests, the verified
  span, source/test evidence, and the qualified six-context companion report with its three approved minor fixes.

---

## Success Criteria

- `[x]` A `full-final` lane does not close on a fix check: on an Errand before and after its pull request, in
  pre-publication, on the published singleton, and on a delivery member, the pass after a material fix offers a local
  fix check with a local complete pass also listed, a converged fix check resolves to `coverage-required`, the complete
  pass that follows at the same head is admitted with no selection, and a complete pass at the settled head with no
  material fix completes the lane; `incremental` adequacy is unchanged.

- `[x]` No hosted source runs the pass after an unconverged one: the driver selects `delegated-agent`, refuses a forced
  hosted source with a remedy naming the local pass, and the work-unit offer lists only `delegated-agent`; without
  `delegated-agent` configured the lane stops with both remedies; after a converged pass the configured rank picks the
  source.

- `[x]` A delta check runs on `delegated-agent` whatever the rank, with no hosted-first reservation; while one is
  admissible a forced hosted source is refused with a remedy naming it; complete coverage supplied in local prepare's
  request runs a local complete pass with no correction scope; without `delegated-agent` configured none is admitted.

- `[x]` No incremental hosted request runs: hosted admission and both `status.ts` hosted routes refuse incremental
  coverage with a remedy naming the local fix check, the hosted incremental writers are gone, and a stored hosted record
  with incremental coverage still parses and replays.

- `[x]` The fix-check chain proves on either side of the pull request — by the performed-response test at every
  confirmation, after a hosted pass at an open pull request, and on a Candidate whose record commit follows the fix —
  and breaks on a base move after an unchecked fix on every path, delivery included; no incremental pass is admitted
  after a clean predecessor except a delta check by its range proof.

- `[x]` The published singleton runs its local pass: its route names an ordinary local prepare request in place of
  `run-review` and handles `coverage-required`, its discharge reads the local terminal, its source, and earlier local
  attempts with no `deliveryAdmission`, and a delivery admission chosen with `--source delegated-agent` survives local
  prepare's real re-check.

- `[x]` The ceiling counts complete passes: a lane at the ceiling runs a fix check with no override; a complete pass
  past the ceiling requires an override or an extra pass that no fix check spends; a conditional next-pass
  authorization binds only to a complete pass's admission; `logicalPass` numbers every finished attempt and
  `validatePassCounts` holds; and no text the Owner reads shows an attempt number as a pass.

- `[x]` Each coverage question is asked once: off the delivery path local prepare asks after material fixes; on it status
  asks and local prepare does not ask again; after a converged look under `full-final` nothing asks; and status refuses
  an unlisted `--source` and `--coverage` pair, and a `--coverage` where it routes the singleton to a local pass.

- `[x]` The Owner's stop is reachable at `coverage-required` once the terminal's response is performed, on the delivery
  path's work-unit route, in pre-publication, and in `run-errand`.

- `[x]` A fix check is chunked by its own range on and off the delivery path; `prepare-work-unit` and
  `integrate-work-unit`'s singleton route carry the chosen scope into local prepare and `--lanes`; and a complete pass
  after a fix check at the same head resolves with its own scope.

- `[x]` A complete pass receives pointers and no verdicts, and the lane read serves triage and the agent's stop: triage
  reads the lineage's rejected findings and their reasons from the lane read; after a clean fix check under `full-final`,
  each workflow's arm runs the read before the complete pass is dispatched — before publication where pre-publication's
  envelope carries a hosted-first `reservation` — and offers the Owner's stop when the judgment recommends stopping,
  while `deliver-stack`'s member review and the published singleton report the limit instead.

- `[x]` The bounded check runs at both applicability stops, with `assess-evidence-applicability` fired at
  `integrate-work-unit`'s pre-reconcile stop; the `--coverage incremental` supplemental arms are gone; and the arms that
  land a fix the check prompts follow its route outside and inside a bound delivery.

- `[x]` The shared model is in one method, and every report renders it: `review-model` exists in both copies with its
  recipe disposition, Configurable entry, and fire-point declarations; `adversarial-review` § Fold verification says a
  following pass is never a reason to decline a fix check; an adversarial pass, a fix-check round, and a code-review
  findings round render one report shape, with `fails` in `adversarial-review`'s report schema, the render-only inputs
  persisted nowhere but each fix's tag, kept as an advisory note outside the approved set's identity, and each finding's
  label the same in every render of one set; and the top-level re-entry shape is offered where the signal's own stage is
  at `high`, with no offer to re-enter higher there.

- `[x]` Each review step is in exactly one place: the after-inventory matches the before-inventory step for step; the
  three review-type methods exist in both copies with their recipe dispositions and Configurable entries, and every site
  calls its type's method; and every § 11.5 drift item is fixed.

- `[x]` The renames are complete and nothing stored moved: no `frontline-review.md`, `standard-review.md`, or
  `self-review.md` remains in either copy; the activation keys, Configurable lists, recipe, generated manifest,
  `arc-checks.yml`, and every reference follow; and every § 12.3 literal is unchanged.

- `[x]` One stored addition: no stored schema under the review gate, the store, or the operation records gains a field,
  kind, or literal but the optional fix-tag note on the disposition record's lineage node, outside the approved set's
  identity and written once by the approved respond call, and the next-pass context rides only the driver's internal
  request.

- `[x]` A plain commit after convergence takes a delta check: on an Errand before and after its pull request, in
  pre-publication once the Candidate checkpoint advances the same Candidate, and on the published singleton, the next
  pass under `incremental` after a converged look and a linear commit at the same base is a local incremental look on
  `delegated-agent`, scoped from the converged head, outside the ceiling, admitted without a selection, and closing the
  lane when it converges; no consumer that carries an earlier attempt to the current head accepts the range proof, while
  the delta check's own attempt and every carry that holds today on another ground still stand; under `full-final` it
  runs only on an Errand with an open pull request and in pre-publication, never closes the lane, and is followed by the
  next-pass arm, while the published singleton returns the review-applicability stop; the converged look's own head, a
  moved base, a merge commit in range, or a re-rooted Candidate admits none; and the attempt it writes is a fix check's.

- `[x]` All quality gates pass (tests, linting, type checking), with content integration tests run over the whole
  branch before its first push

- `[x]` Ready for integration
