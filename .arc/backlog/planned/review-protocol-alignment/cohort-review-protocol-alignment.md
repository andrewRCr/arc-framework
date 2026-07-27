# Cohort: `review-protocol-alignment`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Purpose:** Reconcile the review protocol's surfaces with the lean hosted-review protocol `review-gate-right-sizing`
shipped — so provider selection is authoritative in-band, provider capability is declared only where it is proven,
and the rules that already govern review are reachable from the point where the decision is made.

---

## Context

`review-gate-right-sizing` removed the resident controller, the GitHub App path, provider qualification, and the
guidance-evidence admission machinery. It did not reconcile every surface the removed machinery used to own. On PR #354
the residue produced a misdiagnosis that bypassed configured policy, and the diagnosis run surfaced three further gaps.

Four failures from that one integration:

1. **A skip was read as an attempt.** `.coderabbit.yaml` gated automatic review on a label that no longer existed, so
   every PR emitted a successful `review skipped` status. That was misread as a failed CodeRabbit attempt and led to a
   direct `@codex review`, bypassing the configured `coderabbit-pr, codex-pr, delegated-agent` preference. Nothing
   mechanical reads that status as review evidence — `main`'s required checks are `merge-ok` and `arc-cleared`, so a
   green skip cannot satisfy branch protection. The failure was entirely reader-side. The configuration half shipped
   separately as errand `coderabbit-manual-only`.
2. **Capability is advertised without being established.** The policy driver advertises `coderabbit-cli` for `chunked`
   frontline scope, but the frontline run request carries only target, resolution, and timeout, and the execution
   adapter always emits a whole-target `--base-commit` command. No partition, closure chunk, seam scope, or aggregation
   contract ever reaches the provider.
3. **Failure destroys its own evidence.** Two CodeRabbit CLI attempts on a 10,867-line target returned typed
   `execution-timeout` with no findings and no partial result; the saved provider prompts lived only inside the
   ephemeral detached worktree that cleanup removed. _(The fix belongs to `review-checkout-lifecycle`; the failure is
   recorded here as a third of the evidence establishing the root shape.)_
4. **The operator has no typed way to choose.** After the CLI timeouts, hosted Codex was chosen deliberately because it
   handles large diffs better. The driver still selects `coderabbit-pr` first and exposes no one-run source override, so
   a legitimate preference had to be expressed by going around the driver.

Underneath all four is one shape, and it is this work unit's design constraint: **the protocol's authority claims outrun
its evidence.** A configured preference that can be bypassed by going around the driver is not authoritative; a
capability declared in policy but absent from the request contract is not a capability; a typed failure outcome with no
retained diagnostic is not actionable.

### The second pattern — correct rules, unreachable at the decision point

A distinct shape recurs often enough to name separately, because it changes what a fix has to accomplish. In each case
the governing rule is present, correct, and well designed; what fails is that it cannot be reached from where the
decision is made.

| Rule                 | Its state                                   | Why it does not bite                                |
| -------------------- | ------------------------------------------- | --------------------------------------------------- |
| Review pass ceilings | implemented, wired to an approval interlock | the request that reaches them cannot be composed    |
| Triage severity      | contracted to be verified against source    | the verdict lands where the driver cannot read it   |
| Review obligation    | typed and routed                            | no verb exposes the router's output                 |
| Stop discipline      | stated precisely, with worked principles    | stated only in a shipped work unit's archived spec  |

None of these is a missing rule, so none is fixed by writing a better one. Each is fixed by making an existing rule
reachable — a producing verb, a field in the typed record, a statement carried into the workflow the agent loads. That
distinction decides the size of every design unit below: where the rule already exists, the work is plumbing, and
proposals that add governing machinery answer a question that was already answered.

## Shared Goals

- **Selection is authoritative in-band.** A legitimate one-run operator preference is expressible through the driver, so
  leaving the in-band path is never necessary.
- **Provenance separates by construction.** What was observed and what was intended never share a field, so no override
  path can manufacture an attempt outcome nobody observed.
- **Capability is declared only where it is backed.** Every lane / scope pair a source advertises is reachable through
  the request contract that source actually receives.
- **Provider facts live beside the provider.** A fact about a third-party product is declared with the adapter that
  implements it, not in a closed core constant.
- **Request shapes are reachable from the CLI.** A caller composes any review request from facts it legitimately holds,
  without reading schema modules — and never has to fabricate a field it cannot derive.
- **Load-bearing vocabulary is used exactly.** A term doing technical work carries one sense, so a magnitude scale
  reads as magnitudes and no defined term drifts locally.
- **An advisory signal states what it licenses.** A reported absence of findings carries a stated meaning and cannot be
  read as clearance.
- **Convergence is keyed to ARC's own verified severity**, uniformly across every lane.
- **The stop discipline is stated where the decision is made**, and review spend is opt-in per activity.

## Shared Boundaries

- **Serving a frontline run from the local carrier.** Granting `delegated-agent` the `frontline` lane requires
  authoring a frontline requirement type, or widening a literal that participates in a registered record's canonical
  identity. That is unsettled design and belongs with the work unit that needs the capability — see `D2`.
- **Building chunk partition transport.** Automated construction and transport of chunk scopes, per-chunk scope
  identities, and receipts were explicitly deferred to `chunk-scope-binding` and stay there.
- **Designing how a project supplies a review adapter.** The loading mechanism, its trust boundary, and
  registration-contract versioning are `review-adapter-extensibility`'s.
- **Settling the authority model.** Which rules yield to demonstrated judgment, who may override, and how an override is
  disclosed belong to `judgment-authority-model`. This work unit asks only whether the shipped workflow carries the
  discipline its own spec defined.
- **Bounding spawn context.** Bounding what a spawned worker receives belongs to `execution-delegation-doctrine`.
- **Preserving ephemeral-checkout diagnostics.** `review-checkout-lifecycle` owns that.
- **Rebuilding a review-budget ledger.** Rejected with reasoning under Alternatives.
- **Codifying "hosted providers are selected only by the driver."** Not a code-enforceable property; asserting it would
  create the unbacked authority claim this work unit exists to remove.

## Delivery Topology

Eight design units. `D6` sequences first (widest mechanical sweep), `D8` before `D2` (so the capability table is edited
once, in its new home), `D7`'s evaluator domain after `D8` (it queries the relocated declarations), and `D4` last (see
§ Sequencing and rollout). All source paths are under `packages/arc-framework/`.

**Every methodology, workflow, and config edit below is a two-copy edit.** This repository carries ARC content twice —
the package source at `packages/arc-framework/arc/**` and the project instance at `.arc/**` — and a Framework file
changed in one without the other fails the framework-sync integration test and trips a pre-commit warning. Where a
design unit names `adversarial-review.md`, `integrate-work-unit.md`, `session-init.md`, `generate-tasks.md`,
`drain-inbox.md`, or `arc-config.yml`, it means both copies. Stated once here rather than repeated per unit, because a
task list sized against one copy is sized at half its true surface.

## Shared Rationale

- **Codify "hosted providers are selected only by the driver" as a requirement** (`D1`). Rejected — the provider
  interface is a pull-request comment anyone can write, so no schema or check can enforce it. Asserting it would create
  exactly the unbacked authority claim this work unit exists to remove. The achievable form is completeness of the
  in-band path, which is why the missing override _is_ the cause of the PR #354 bypass rather than a separate concern.
- **Express an operator preference by recording a safe-unavailable attempt** (`D1`). Rejected — this is the laundering
  failure the design exists to prevent: an operator assertion entering the observed-attempt history destroys the
  provenance distinction permanently.
- **Express promotion as a skip** (`D1`). Rejected — skipping `coderabbit-pr` to reach `codex-pr` leaves a rate-limited
  `codex-pr` with nothing to fall back to within the pass, strictly less capable than the status quo the override exists
  to improve on.
- **Infer the chunking answer from the PR #354 timeouts** (`D2`). Rejected by the originating capture and still correct:
  two timeouts on one oversized target with confounded guidance cost establish nothing about capability.
- **Run a fresh three-arm A/B to settle the chunk carrier contract** (`D2`). Rejected as redundant — `review-chunking`
  already measured it under controlled conditions; re-running would spend costly reviews to reproduce a recorded result.
- **Keep `chunked` advertised for `coderabbit-cli` and build its projection transport here** (`D2`). Rejected — the
  transport is `chunk-scope-binding`'s by explicit prior deferral, and absorbing it would widen a work unit already
  flagged for sizing risk.
- **Pair the removal with a `frontline` grant to `delegated-agent`** (`D2`). An earlier reading treated this as forced,
  on the ground that removal alone deletes chunked frontline review with no configuration restoring it and leaves a
  chunked frontline request resolving `unavailable` / `stop`. **Rejected on both halves.** The stop is answered by
  `D2.2`'s skip arm, which converts it into a typed decline — so the objection's consequence no longer follows. And the
  grant is not bounded: the local path builds a requirement record whose `kind` is a literal inside two canonical
  digests, and whose obligation vocabulary is disjoint from the frontline lane's, so the grant requires authoring a
  record type nobody has designed. Taking it would have absorbed unsettled design into a work unit already flagged for
  sizing, to restore a capability that was never delivered.
- **Delete the guidance blocks outright** (`D3`). Rejected — they are the only channel carrying ARC's exact-scope and
  clean-result contract to a hosted reviewer, which is the half a provider genuinely cannot infer.
- **Regenerate both static copies from the typed projection** (`D3`). Rejected — that restores the generator
  right-sizing deliberately deleted, to maintain roughly four lines of content.
- **Restore the deleted admission machinery** to re-establish carrier authority. Rejected — right-sizing removed it
  deliberately as disproportionate, and the local carrier now injects a runtime-owned rubric binding rather than asking
  an evaluator to transcribe evidence-grade identities. Scoped precisely: this holds on the local path only, which is
  what makes the static carriers load-bearing rather than redundant.
- **Document the request shapes in prose** where the workflows already reference the verbs (`D4`). Cheaper and lands
  where the reader already is — rejected: prose drifts from the schemas by construction, and the drift is what
  reproduces the defect rather than fixing it.
- **Point the workflows at the shipped schema bundle instead of adding a flag** (`D4`). Rejected as an alternative and
  adopted as the substrate: the bundle already ships but is keyed by schema identity inside the installed package, so
  using it directly means a workflow naming an install path that varies by package manager and a caller mapping its verb
  onto an id.
- **Ship the flag over a hand-maintained verb-to-schema table** (`D4`). Rejected — it re-describes an association the
  schema registry exists to hold, which is `D8`'s defect at smaller scale.
- **A new emitting verb for the obligation projection, or for the composed review target** (`D4.4`). Rejected — an
  emitting verb leaves the hand-authored path open beside it, so a fabricated projection or `targetId` stays as easy
  as today; deriving from caller-held facts removes the path instead of documenting around it. **Extending the
  `frontline resolve` envelope** was likewise rejected: it would have a standard-lane caller invoking a
  frontline-named verb, coupling the lanes at the CLI surface.
- **Requiring the primary to verify every `withstood` entry** (`D5`). Rejected — defeats delegation; `withstood` is by
  design the larger list. **Splitting the schema into citation-checked versus inference-checked**, or **requiring the
  reviewer to declare which check it performed**: both ask an untrusted evaluator to attest its own rigor.
  **Scoping the obligation to entries the primary will relay**: the observed failure _was_ relaying on the strength of
  the label, so the trigger is unreliable. **Deleting the field**: discards real coverage signal to fix a wording gap.
- **A second driver call after triage** (`D6.4`). Rejected — it works only if the caller knows not to advance its own
  pass count between the two calls, an ordering rule the driver cannot enforce, added to fix an ordering problem.
- **Shipping a caller-computed confirmed-severity scalar on the hosted lane only** (`D6.4`). The smallest change, and
  rejected twice over: the detached scalar discards the approved set's bindings, and it reproduces this work unit's
  own thesis — a correct convergence rule reachable at one decision point and not at the other two.
- **Feed bare approved disposition sets to the driver** (`D6.3`). Rejected — approval and current-target validation
  do not establish which review result the set covers or that every result finding is present. Reuse the existing
  source-bound approved disposition record so an earlier same-target set or an omitted chunk cannot produce false
  convergence.
- **A `Class`-threshold key on `adversarial-review`** (`D7.2`). Rejected — it contradicts the method's identity contract
  (the caller owns launch policy), gates unrelated activities through one knob, and constrains a mechanism built to be
  reused.
- **Split the adjacent surfaces (`D4`, `D5`) into their own work units.** Rejected — both are small once settled;
  `D5` carries an independent-ship escape hatch, and `D4`'s discoverability and derivability halves must ship together.
  Distinct from the decomposition that did fire, which cut on subject orthogonality rather than size.
- **A durable multidimensional review-budget ledger** — logical passes, evaluator invocations, and token budget
  accumulated across a work unit's whole integration lineage. Proposed from a sibling work unit's integration, where
  four review waves and eighteen evaluator invocations ran without an effective bound. **Rejected as disproportionate to
  its own evidence:** roughly three quarters of the measured raw cost came from implementation workers inheriting full
  conversation history — a spawn default, not an accounting failure — and the caps that should have bounded the rest
  already exist and are already wired to an approval interlock; they went unenforced because the request that reaches
  them cannot be composed. Building an accounting mechanism first would elaborately measure a cost that mostly
  evaporates once the spawn default and the composability gap are fixed. The proportionate response is `D4.4`, `D6.2`,
  and a bounded spawn context — none of which is new machinery.

## Shared Coordination

**Trust boundaries.** `D1`'s provenance separation is the design's central safety property: the override never touches
`attempts`, so no operator input can manufacture an observed outcome. `D6.3` likewise derives its control-bearing
summary from source-bound approved disposition records whose producing boundary compared the complete result
one-for-one, instead of accepting either a detached scalar or an unbound approved set. `D8` moves third-party facts out
of core but adds no code-loading surface — adapters remain first-party, and the trust boundary around supplying one is
`review-adapter-extensibility`'s explicitly. `D4.4` narrows a trust boundary by removing a fabricable input rather than
widening one.

**Contract evolution.** The pre-public-release posture applies uniformly:

- `D6.1` changes every registered root, wire record, command envelope, digest preimage, fixture, generated schema, and
  methodology occurrence in the severity acceptance graph together, while existing version and domain identifiers
  remain the current baseline. There is no compatibility alias or migration path; development-only old records are
  cleared or regenerated.
- `D6.3` requires `reviewOperationIds` on findings attempts and resolves the referenced records from the existing
  durable store; the caller supplies neither record bodies nor derived severity. The derived count and maximum are
  internal normalized state, not new caller-controlled wire fields. The existing approved disposition source union
  gains the hosted-result variant in place.
- `D4.4` replaces `standardReview` with required `routingFacts` and removes caller-supplied `targetId` from the two
  target-taking request shapes. All repository-owned callers and fixtures move in the same change; no transitional
  reader or dual-input contract remains.
- `D4.5`'s rename touches a type name rather than a wire shape and changes repository references in place.
- `D2.1`'s capability narrowing means a project configuring `coderabbit-cli` with chunked frontline scope now skips
  rather than runs. That is the intended effect and is legible through the typed `source-scope-ineligible` diagnostic.
  No project loses a working capability, because the chunked path never reached the provider.

**Testing.** Existing coverage in `__tests__/unit/scripts/review-gate/policy/review-policy-driver.test.ts` already
exercises the safe-fallback rule (rate-limited attempts, `safe-fallback-exhausted`), so no characterization test is owed
before `D1` starts; the effective-order change needs its own cases, including the motivating one — configured order
`coderabbit-pr, codex-pr, delegated-agent`, `codex-pr` promoted, then falling through to `coderabbit-pr`, which must
validate under the effective order and would have failed under the configured one. A second-call case repeats that
same override with the first source already in attempt history and proves it remains valid without reselecting the
source. `D6.1` needs acceptance and rejection cases for `critical` and severity-position `blocker`, plus a generated
schema and non-severity-occurrence preservation check. `D6.3` needs command-boundary cases for an all-refuted record,
minors only, material findings, stale target/policy/rubric bindings, a missing or duplicate operation id, wrong source
or operation, an incomplete result binding, and a chunked terminal pass whose maximum spans multiple approved records.
Hosted coverage proves its result digest and exact finding comparison reject an unrelated or incomplete set; reducer
tests receive only the derived summary. `D7.3` proves audit config domains follow `auditActivities`, not `nextAction`.
`D8.3` preserves the fallback resolver's `unknown-pr` → `invalid-source-list` case after hosted ids become lexical.
`D4.3`'s completeness test is the anchor that keeps the registration set honest as verbs are added. `D3.2`'s parity
check runs in the `lint:arc:*` family and is required in CI alongside the rest of that family.

**Performance.** One narrow observation is worth taking after `D3.1` lands: whether a trimmed-guidance whole-target
hosted review still times out at the ~10.8k-line scale that failed on PR #354. A single observation, not an experiment,
and on no design unit's critical path.

**Sequencing and rollout.** `D6.1` rewrites the unpublished baseline and clears or regenerates development-only old
records. It sequences first so no later diff carries the rename. `D8` precedes `D2` so the capability table is edited
once, in its relocated home, and `D7.3` follows `D8` because it queries those declarations. `D2.1` and `D2.2` land
together — the removal without the skip arm turns a chunked frontline request into a halt. `D4.1`, `D4.2`, and `D4.4`
ship together, and **`D4` sequences last**: it is the unit most exposed if the review gate's request contracts are later
reduced, nothing else depends on it, so ordering it last costs nothing and preserves the option. `D4.5` may follow
separately. `D3` and `D5` are independent and may land at any point, and `D5` retains an independent-ship escape hatch
as an errand if the provider-protocol work runs long.

**Coordination.** `integrate-work-unit.md` is edited in three places by this work unit — `D6.4`'s reorder at the lane
dispatch and the hosted findings arm, and `D7.1`'s statement at the review-applicability step — while
`integration-boundary-accuracy` rewrites the final merge step. Different regions, so neither blocks the other; if both
run concurrently, sequence the edits rather than merging blind. `chunk-scope-binding` receives `D2.3`'s handoff, now
including the frontline-obligation question.
`judgment-authority-model`, `execution-delegation-doctrine`, `review-checkout-lifecycle`, and
`review-adapter-extensibility` are coordination-only, with no dependency edge recorded.

## Closeout Criteria

1. An operator expresses a one-run source preference through `arc review resolve` and it is honored, including the
   promote-then-fall-through case that the configured-order invariant would have rejected; no override path can add an
   entry to the observed attempt history, repeating the pass-level override after a fallback remains valid without
   reselecting an attempted source, and deselecting every source yields a typed stop that names the operator as the
   cause rather than reporting provider unavailability.
2. `coderabbit-cli` no longer advertises `chunked`, and a chunked frontline request — which consequently has no
   eligible source — resolves `skipped` carrying a `source-scope-ineligible` diagnostic rather than halting
   integration. A mixed diagnostic set containing `unknown-source` never takes that skip. Whole-target frontline
   review through `coderabbit-cli` still runs, and the restoration condition plus the frontline-obligation question
   are recorded for `chunk-scope-binding`.
3. Both static guidance blocks carry the same four items and no `Rubric:` line; `lint:arc:review-guidance` fails when
   they diverge or when the typed coverage, clean-rule, or evaluator-boundary fields stop matching, and states in its
   own output that item 4 alone is unbacked.
4. `arc review <verb> --schema` prints a registered JSON Schema for each of the fourteen request-file verbs, and a verb
   added without a registered schema at its derived id fails the build. No review request requires a field its caller
   cannot produce: `arc review resolve` accepts the five judgment facts and derives, echoes, and never _requires_ a
   hand-authored obligation projection without acquiring an evaluator identity, and the target-taking verbs compute
   `targetId` from caller-held fields rather than demanding the digest. No workflow or test composes a projection or a
   `targetId` by hand. The old `standardReview` and caller-supplied `targetId` inputs are not retained as compatibility
   paths. The two `ReviewTargetSchema` definitions no longer share a name.
5. `adversarial-review.md` states what reporting a `withstood` entry means and what it does not license, bounds the
   field to decision-relevant coverage, and states the primary-side risk gradient by claim type.
6. `critical` names the review severity across the review-gate source and the methodology corpus, with the meta
   impediment field, `GateBlocker` / `GateVerdict.blockers`, the work-unit impediment sense in workflow prose, and the
   `blocked` resolution state provably untouched. The unpublished strict-current baseline changes in place without
   compatibility aliases or version advancement. The exit gate and convergence are stated as two rules; and a pass
   whose triage-confirmed findings top out at `minor` resolves `pass-complete` on every lane, with each lane's driver
   call sited between triage and response. The findings-bearing pass-closing attempt references exact source-bound
   review operation ids, and the command derives confirmed count and maximum severity from the validated,
   current-target records — including `null` for an all-refuted pass — while accepting no caller-computed severity
   scalar or unbound disposition set.
7. A project that has not set `review.planning_audit` / `review.verification_audit` is never offered a planning or
   verification pass; valid evaluator domains derive from the registrations' explicit audit activities, and naming a
   provider that declares no matching activity is a typed validation error. The verification fire-point fires without
   another permission turn when its configured evaluator and declared workflow fire-point coincide, while the planning
   fire-points still converge with the developer first. Configuration alone authorizes no spawn, every dispatch is
   bounded and read-only, and `integrate-work-unit.md` states the stop discipline the shipped spec defined.
8. Each third-party provider's lanes, scopes, pull-request dependence, and dispatch action live beside its adapter, and
   every source id has exactly one production declaration in its owning registration. Every finite provider domain and
   capability decision derives from the composed registrations: the config and hosted-request schemas accept a
   well-formed registry id, and their command boundaries validate membership and lane compatibility from the injected
   sets rather than restating provider lists. Hosted fallback validates membership against that same set before
   dispatch and preserves its typed unknown-provider result. The driver _and its request schema_ resolve against an
   injected capability set assembled at a named seam; the registration contract validates through the shipped schema
   bundle; and an unregistered source still fails safe as `unknown-source`.

---
