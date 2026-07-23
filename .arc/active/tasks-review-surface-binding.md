# Task List: review-surface-binding

- **Design:** `spec-review-surface-binding.md`

---

## **Phase 1:** Coordinated live-closure rename (`independent-analysis` → `standard-review`)

_Purpose:_ Land the pre-GA forward rename and the singular→ordered frontline-source change as the first
implementation increment — a pure identity/config-shape edit with no behavior change — so it can integrate ahead of
`review-gate-right-sizing` consuming the renamed surface.

_Design decisions:_ Self-contained and commit-clean at every step (no dangling identity references left for a later
phase); the D16 workflow _invocation-prose_ rewrite is a distinct concern deferred to Phase 7 and does not re-touch
these identity names. This phase plus the Phase 7 workflow edits are the shared-surface boundary returned to
`review-gate-right-sizing`. Not test-first: a mechanical rename whose regression guard is the existing suite staying
green under the new names.

### `[x]` **1.1 Rename the `standard-review` code identity and modules**

- _Goal:_ The `standard-review` role name replaces `independent-analysis` across every code identity — the obligation
  field/type `standardReview`, the method/rubric identity `standard-review/v1`, and the `policy/standard-review*.ts`
  modules — with the full suite green under the new names and no behavior change.

    - `[x]` **1.1.a Rename the five `policy/independent-analysis*.ts` modules and their tests**
        - Renamed the five policy modules and three matching unit-test modules to `standard-review*`.

    - `[x]` **1.1.b Rename the obligation field/type, identity string, and constants across the core surface**
        - Renamed the obligation field/type, rubric identity, schema IDs, symbols, prose identities, and their dependent
          golden digests across production code and tests.

    - `[x]` **1.1.c Update imports and re-verify green**
        - Repointed every TypeScript import and symbol reference to the renamed modules and identities.

- _Outcome:_ The complete code surface now exposes only the clean-forward `standard-review` identity, including
  regenerated domain-separated rubric, policy, request, receipt, and guidance fixtures.

### `[x]` **1.2 Rename the method/rubric doc and its cross-references**

- _Goal:_ The shipped method/rubric document and every methodology cross-reference name `standard-review`, so the
  renamed identity resolves with no dangling reference.

    - `[x]` **1.2.a `git mv` the method file and update its own identity**
        - Renamed the packaged and self-hosted method to `standard-review.md` and updated its identity and rubric digest.

    - `[x]` **1.2.b Update methodology cross-references (identity only)**
        - Updated the method registry, related methods, strategies, workflow identity references, hosted guidance, and
          public customization docs without performing the deferred invocation-prose rewrite.

    - `[x]` **1.2.c Update the shipped `init-recipe.json` manifest**
        - Replaced and alphabetized the method entry in the shipped recipe and self-hosting manifest.

    - `[x]` **1.2.d Markdown lint green**
        - Reprojected package-source tables and normalized the renamed method references in both framework copies.

- _Outcome:_ Packaged installs, self-hosting guidance, manifests, and durable methodology references resolve the
  renamed method with no live cross-surface reference to the retired identity.

### `[x]` **1.3 Convert singular `review.frontline_source` to ordered `review.frontline_sources`**

- _Goal:_ The frontline-source config accepts an ordered list (`review.frontline_sources` / `arc.frontlineSources`)
  and the resolver reads it in order, so the sibling's driver can own ordered fallback; a single-source config
  resolves identically to today.

    - `[x]` **1.3.a Rename the config key to a list**
        - Renamed the project and developer keys, represented project defaults as inline ordered lists, and taught config
          validation to validate every list entry.

    - `[x]` **1.3.b Update the resolver to read the ordered list**
        - The preference port and local adapter now read ordered developer/project lists and select the first registered
          source in tier order while retaining diagnostics for rejected earlier entries.

- _Outcome:_ A one-entry list preserves prior selection behavior, while both configuration tiers can now carry
  deterministic ordered source preferences for the sibling driver's fallback policy.

---

## **Phase 2:** Registered-record and envelope contract foundation

_Purpose:_ Establish the typed contract authority the seven verbs derive from — the shared envelope/error unions, the
new and extended registered records, and the storage/rubric ports — as the single Zod source of truth before any
handler is wired against them.

_Design decisions:_ A dedicated contract-foundation phase (rather than distributing each record to its consuming
lane) keeps the schema-inventory registration coherent — D6's `local-review` variant and `frontline-run`
outcome-enum extension are mandated to land as one inventory change — and lets the later lane phases build on settled
types. Command parsers, emitted JSON schema, and reference projections all derive from these types. Schemas are
test-first (contract tests: legal-pair round-trips, impossible-field rejection — SC 7).

### `[x]` **2.1 Shared envelope header, result vocabulary, and strict error union**

- _Goal:_ Every verb has a registered discriminated-union contract for its success envelopes (each a single legal
  `state`→`nextAction` pair) plus a shared strict error union (`invalid-input | corrupt-state | unexpected-failure`),
  so parsers, emitted schema, and projections derive from one authority.

- _Outcome:_ Added and registered strict success envelopes for all seven verbs plus the shared error union, with
  exact state/action pairings, reason-class action splits, attestation terminal checks, and typed repository
  precondition diagnostics.

### `[x]` **2.2 `local-review` operation-state variant and `frontline-run` outcome-enum extension**

- _Goal:_ `ReviewOperationStateSchema` gains a third `local-review` variant carrying the admission-fixed envelope, and
  `FrontlineRunState.outcome` extends with `timed-out` and `stale-target`, registered as one strict-current inventory
  change so persistence no longer throws on those two terminals.

- _Outcome:_ Registered the strict admission-fixed `local-review` state and extended `frontline-run` persistence
  with `timed-out` and `stale-target`; the closed operation union now discriminates all three variants.

### `[x]` **2.3 Normalized frontline outcome union — `timed-out` / `stale-target` terminals and reason classes**

- _Goal:_ The provider-neutral normalized outcome union makes `timed-out` and `stale-target` first-class alongside
  clean/findings/unavailable/failed/pass-cap-exhausted, each non-clean terminal carrying a non-null typed `reason`
  under the shipped refinement, with the closed reason classes § D2 names.

- _Outcome:_ Recast normalized outcomes as a strict discriminated union with closed typed reasons, added timeout
  and stale-target terminals, and made CodeRabbit stale-head observations retain the expected and observed heads.

### `[x]` **2.4 `LocalReviewSourceV1` descriptor and semantic digest**

- _Goal:_ A registered `LocalReviewSourceV1` descriptor binds the exact Git-object range — repo/target identities,
  object format, `diffBaseSha`/`headSha`, `diffBaseTree`/`headTree`, opaque `reachabilityRef`/`materializationRef`,
  and a domain-separated `sourceDigest` over the semantic fields only.

- _Outcome:_ Added the strict Git-object-range descriptor, object-format width validation, and a registered
  domain-separated digest preimage that excludes both operational locators and the digest itself.

### `[x]` **2.5 Advisory record schemas — disposition, frontline-outcome, and reduction projection**

- _Goal:_ Three registered advisory records exist — `ApprovedDispositionRecordV1`, `FrontlineOutcomeRecordV1`, and
  `ReviewReductionProjectionV1` — consuming the shipped disposition/approval/fix-authorization contracts as-is, with
  no parallel authority store.

- _Outcome:_ Added registered advisory disposition, digest-bound frontline outcome, and strict reduction
  projection records; source authority is discriminated and executable identity is enforced against launch status.

### `[x]` **2.6 Storage ports, rubric-binding port, and schema-inventory registration**

- _Goal:_ The local-source, disposition-record, frontline-outcome, and reduction storage ports are declared as
  path/ref-agnostic abstractions, the boolean `ReviewRubricAvailabilityPort` is replaced by an identity-keyed
  `ReviewRubricBindingPort`, and every new record/variant is registered in the closed durable-record inventory.

    - `[x]` **2.6.a Declare the new storage ports** — added path-agnostic local-source,
      disposition-record, versioned frontline-outcome, and read-only reduction interfaces.

    - `[x]` **2.6.b Replace the rubric port** — assurance now resolves an identity-keyed binding and treats missing,
      mismatched, or failed resolution as unavailable.

    - `[x]` **2.6.c Register records in the closed inventory**
        - Composed the new source, advisory, outcome, command-envelope, and operation schemas through the kernel
          registry and updated durable inventory variants plus generated-schema assertions.

- _Outcome:_ The contract family now composes from one registry into stable generated schema artifacts while its
  storage and rubric seams remain implementation-neutral.

---

## **Phase 3:** Assurance and rubric composition

_Purpose:_ Wire production composition to the shipped method-activation resolver and replace the boolean rubric
availability with an identity-keyed binding that parses a typed frontmatter overlay, with fail-closed diagnostics
surfaced on the public result. All test-first (business logic + parsing/validation).

### `[x]` **3.1 Method-activation resolution in production composition**

- _Goal:_ Production composition calls the shipped resolver (`resolveReviewMethodActivity`) for `self-review` and
  `frontline-review` instead of constructing literal booleans, preserving package-default fallback and surfacing
  activation diagnostics on the public result.

- _Outcome:_ Added production assurance composition over the existing activity resolver and a local adapter for the
  two managed method files; effective project/default activity and malformed-declaration diagnostics now travel
  together on the composed result.

### `[x]` **3.2 `ReviewRubricBindingPort` production adapter and `review-augmentation` parse**

- _Goal:_ The production rubric adapter resolves the `Review Rubric` meta identity through the canonical method-file
  loader and parses one optional strict `review-augmentation` frontmatter field into `StandardReviewProjectAugmentation`
  (`rubricId` + sorted unique typed dimensions), never parsing method prose, and never from a command payload.

- _Outcome:_ Extended the canonical method-frontmatter loader with the structured field and added an exact-identity
  local binding adapter that validates through `StandardReviewProjectAugmentationSchema`, canonicalizes dimension
  order, rejects duplicates or mismatched versioned identities, and keeps command payloads and method prose inert.

### `[x]` **3.3 Overlay application and refusal diagnostics**

- _Goal:_ A resolved overlay augments the immutable baseline deterministically; a missing method, missing/malformed
  structured field, ambiguous lookup, or identity mismatch refuses the review request with a diagnostic, while an
  absent meta field uses the baseline unchanged.

- _Outcome:_ Production composition now returns the effective typed guidance for absent or resolved declarations and
  a fail-closed refusal for unusable declared rubrics. Baseline identity and dimensions remain immutable while
  missing, ambiguous, malformed, incomplete, and mismatched bindings surface stable diagnostics.

---

## **Phase 4:** Local review lane — prepare / attest / resume

_Purpose:_ Deliver the end-to-end local standard-review verbs — derive the canonical target and request, materialize
the immutable source under publish-first ordering, deliver the exact guidance, attest against the reviewed bytes, and
resume or recover — as the lane's durable-but-advisory trace.

_Design decisions:_ Publication precedes the pin (an orphan pin cannot arise from a live prepare); the operation record
is written once at admission and never advanced (publication state derives from the stores and the pin); the sweep runs
inline in prepare/resume, reaping both orphan and terminally-expired classes. Derivation, materialization, and
validation are test-first; the Commander wiring is test-after.

### `[x]` **4.1 `arc review local prepare` — canonical target and request derivation**

- _Goal:_ `local prepare` derives the exact local target and request from trusted repository/vehicle/policy/runtime
  bindings — never a prebuilt target — and admits (or identical-retry-returns) one operation, emitting a `ready`
  payload with the typed reviewer payload.

    - `[x]` **4.1.a Repository identity record** (`hosts/local/git-common-state.ts`)
        - Added a locked, schema-validated repository UUID record under the Git common directory; a real-Git
          integration test proves mint-once resolution across sibling worktrees and checkout relocation

    - `[x]` **4.1.b Target derivation and preconditions**
        - Derives the configured local base and `HEAD` as commits, computes the merge base and exact trees, and refuses
          unborn, unresolved-base, dirty, or non-commit repositories as `invalid-input`
        - Re-derives the canonical target before publication and returns the attempted/current pair as `stale-target`

    - `[x]` **4.1.c Vehicle / author / evaluator / runtime resolution**
        - Resolves the WU owner (requiring the active identity to match) or Errand author from live ARC context,
          rejects self-review, and derives the attesting runtime through the installed-runtime boundary
        - The evaluator remains the only caller-selected actor; runtime identity never enters the request input

    - `[x]` **4.1.d Deterministic operation identity and identical-retry predicate**
        - Derives the request and `operationId` from the exact target, requirement, actor bindings, policy binding, and
          request mechanism; identical facts reproduce byte-identical admission records
        - An identical retry returns and re-verifies the persisted operation without publishing or rebuilding, while
          any keyed-fact difference derives a new operation identity

    - `[x]` **4.1.e Wire the `arc review local prepare` handler and command**
        - Added the production prepare composition and the file/stdin handler seam, registered `review local prepare`,
          and emit only validated success or typed error envelopes

- _Outcome:_ The command now derives every target, actor, assurance, policy, request, source, and retry fact through
  trusted local bindings; callers supply only evaluator identity, routing facts, and an optional freshness bound.

### `[x]` **4.2 Immutable local review source materialization**

- _Goal:_ After deriving the clean target, `local prepare` publishes the admitted operation first, then materializes
  the immutable source — operation-owned pin at `headSha`, detached exact-head checkout — verified by pre-launch
  proofs, so an orphan pin cannot arise from a live prepare and the reviewer never sees a mutable worktree.

- _Outcome:_ Added append-only source descriptors, publish-before-pin operation choreography, and an operation-owned
  Git ref plus repairable detached checkout. Exact-head/tree/range/ref/cleanliness proofs fail closed on mismatched
  bytes, while the evaluator payload exposes only immutable source coordinates.

### `[x]` **4.3 Source-store sweep — orphan and terminally-expired reaping**

- _Goal:_ A sweep run inline inside `local prepare` / `local resume` reaps two pin classes — orphan (operation record
  absent) and terminally-expired (record present but cleanup-TTL-expired with no complete receipt) — so no abandoned
  pin blocks Git maintenance, and it never reaps a live unexpired operation's pin.

- _Outcome:_ Added a pin-enumerating sweep that releases only absent-record or TTL-expired/no-receipt operations.
  Live and receipt-complete operations remain protected; descriptor and receipt stores are untouched.

### `[x]` **4.4 Guidance delivery and the local policy binding**

- _Goal:_ `local prepare` projects the exact effective guidance (baseline + resolved overlay), computes its
  `guidanceDigest`, and binds source/admission policy through a strict `LocalReviewPolicyBinding` with its own canonical
  digest, validating the selected evaluator/carrier against it.

- _Outcome:_ Added registered, digest-bound local policy records and exact delivered-guidance projection. The package
  default permits the standard agent source with `local-attestation`; present malformed or unregistered adapters fail
  unavailable without fallback, while augmentation changes only `guidanceDigest`, not baseline rubric identity.

### `[x]` **4.5 `arc review local attest` — advisory receipt against reviewed bytes**

- _Goal:_ `local attest` accepts only the normalized result schema, re-derives runtime identity at the trusted
  boundary, re-verifies exact target / rubric / guidance-digest and the pin + detached checkout, and appends a single
  advisory `ReviewReceiptV2` — recording what was reviewed, appending no downstream-satisfying pair — returning the
  reduction transition.

- _Outcome:_ Added the normalized source/guidance-bound result, write-once admission snapshot, non-repairing
  materialization proof, idempotent exact-receipt replay, and strict pre/post-append stale outcomes. The public
  handler emits only registered attestation or typed error envelopes.

### `[x]` **4.6 `arc review local resume` — re-acquisition and idempotent continuation**

- _Goal:_ `local resume` reads the durable operation record plus current repository facts and emits the next typed
  action, re-acquiring a lost `operationId` via the identical-retry derivation and completing an interrupted idempotent
  transition — deliberately not a read-only `status`.

    - `[x]` **4.6.a Wire the `arc review local resume` handler and command**
        - Registered the file/stdin handler and public command over the production Git-common operation, source, receipt,
          disposition, target, sweep, and materialization adapters.

- _Outcome:_ Resume now reconstructs the next action from immutable admission plus current durable stores, recovers
  released checkout locators while the cleanup bound remains live, replays exact receipts to recover opaque references,
  and distinguishes waiting, findings-response, complete, stale, and expired states without mutating operation phase.

---

## **Phase 5:** Frontline lane — exact-target execution and durable outcomes

_Purpose:_ Deliver the provider-effectful `frontline run` bound to the exact target head with durable outcomes, close
the two CodeRabbit adapter gaps, bound execution by an explicit timeout, and give the shipped `frontline resolve` its
explicit state/action projection. Execution binding, normalization, and timeout logic are test-first; wiring is
test-after.

### `[x]` **5.1 `arc review frontline run` — pending publication, exact-head execution, durable outcome**

- _Goal:_ `frontline run` consumes one complete `ready` resolution plus the exact adapter-supplied target, revalidates
  the source, publishes the pending operation, prepares the exact-head checkout, resolves/interrogates/launches the
  executable, and durably records the full normalized outcome before advancing operation state.

    - `[x]` **5.1.a Run choreography** (`policy/frontline-operation.ts`)
        - Published pending before the carrier effect, appended the digest-bound outcome before the terminal operation
          state, and returned the full durable operation, target, and outcome coordinates.

    - `[x]` **5.1.b Frontline target authority**
        - Validated the caller target, independently re-derived it inside an ephemeral detached checkout using the
          repository-common identity, refused mismatches, and accepted pass only from the ready resolution.

    - `[x]` **5.1.c Wire the `arc review frontline run` handler and command** — test-after
        - Added the production composition, strict file/stdin handler, and public `review frontline run` command.

- _Outcome:_ Frontline execution now crosses one durable transaction boundary from pending publication through an
  immutable target checkout and append-only outcome record to terminal operation state.

### `[x]` **5.2 CodeRabbit adapter — exact-head binding, executable-that-ran identity, `stale-head` normalization**

- _Goal:_ The CodeRabbit adapter binds both `diffBaseSha` and `headSha` (an immutable exact-head checkout, not a
  twice-observed mutable ref), records the digest + qualified version of the executable that actually ran, and
  normalizes its `stale-head` result to `stale-target` (retaining the provider-level result name).

- _Outcome:_ CodeRabbit runs from the detached target checkout against the exact diff base; its PATH entry is resolved
  once, and the same canonical artifact is hashed, versioned, and launched. Provider `stale-head` remains preserved
  while its provider-neutral outcome is `stale-target`.

### `[x]` **5.3 Bounded provider execution — timeout, abort signal, adapter-failure mapping**

- _Goal:_ Provider execution runs under a plain execution timeout (an operation input with a framework default — not a
  new config axis); the runner passes remaining time + an abort signal and kills the spawned process on expiry, typing
  the result `timed-out`; unknown thrown errors map to the closed adapter-failure class.

- _Outcome:_ A framework-default or request timeout now supplies remaining time and one abort signal through the
  adapter to the direct process runner, whose expiry terminates the child and wins over late clean output. Unknown
  process failures persist as the closed `unexpected-adapter-failure` outcome.

### `[x]` **5.4 `frontline resolve` state/action projection and `invalid-input` rename**

- _Goal:_ The shipped `frontline resolve` gains its explicit `state`/`nextAction` projection (per the § D2 table)
  without operation/persistence padding, and its error code is renamed `invalid-request` → `invalid-input` so one
  strict union covers all seven verbs.

- _Outcome:_ The effect-free resolver now emits only the four legal state/action variants with routing and semantic
  data in the success payload; fresh ready results authorize pass 1 with the effective allowance. Malformed input
  uses the shared strict `invalid-input` error envelope.

### `[x]` **5.5 Frontline outcome recovery and reuse discrimination**

- _Goal:_ An interruption after outcome publication is repaired by validating that exact record and advancing operation
  state; reuse discriminates on review content — a review-concluding outcome (clean/findings/pass-cap-exhausted) is
  reused at unchanged coordinates, while every non-review terminal admits a fresh operation at an advanced generation
  with the same pass number.

- _Outcome:_ Re-entry now validates and repairs an exactly bound published outcome, or retries the same pending operation
  when no record exists. Review conclusions retain their durable reference; every retryable non-review result advances
  generation at the same pass, independent of its follow-up advice.

---

## **Phase 6:** Universal response and invocable reduction

_Purpose:_ Close the review loop — `respond` binds source-discriminated approved dispositions under the
agent-proposes / human-approves shape and drives the re-review-at-new-head fix path; read-only `reduce` composes the
shipped forward reducers over both lanes. Test-first (validation + reduction logic).

### `[x]` **6.1 `arc review respond` — source-discriminated approved dispositions**

- _Goal:_ After the universal response checkpoint presents the source-verified report and obtains approval, `respond`
  accepts a strict `ApprovedDispositionSet` against either the attested-local receipt or one durable frontline outcome,
  revalidates every finding against the selected source, and appends one `ApprovedDispositionRecordV1` — idempotent on
  identical replay, conflict-refused on a divergent set.

- _Outcome:_ The public command reloads an operation-bound exact receipt/source or frontline outcome, revalidates every
  disposition and trusted actor through the universal response checkpoint, and appends one idempotent advisory record.
  Fix responses return the validated authorization; non-fix and replay responses return their durable record reference.

### `[x]` **6.2 The fix path and frontline follow-up advice**

- _Goal:_ An approved fix is applied by the agent under the ordinary review-increment + commit interlock, producing a
  new head; the disposition record closes the old target's response obligation and the fixed change earns its own review
  at its own head, with `resolveFrontlineFollowUp` semantics surfaced as advice in `respond` / `reduce` output — never a
  durable fix ledger or fix-phase verb.

- _Outcome:_ A fix authorization now names only the old target and directs fresh-head re-entry through `local prepare`
  or `frontline resolve`; no fix ledger or carried operation is introduced. Frontline responses project material-fix
  and pass-cap eligibility as non-durable follow-up advice, sharing the resolver's policy.

### `[x]` **6.3 `arc review reduce` — invocable reduction over both lanes**

- _Goal:_ `reduce` resolves its source from `operationId` and composes the shipped forward requirement / qualification /
  response / projection reducers read-only, mapping totally over both lanes to the § D10 states, with `corrupt-state` on
  missing/mismatched evidence — callers cannot supply a receipt, disposition record, target, or conclusion.

- _Outcome:_ The public read-only reducer now resolves either durable lane solely from `operationId`, revalidates the
  complete source chain and approved response before projecting every terminal state, and fails closed when a
  completion claim, digest, or exact reference cannot be proven. Frontline results also surface bounded follow-up
  advice without advancing operation state.

---

## **Phase 7:** Predecessor prune, documentation, and workflow reconciliation

_Purpose:_ Leave no dormant review module unclassified — consume, retire, or hand off each under the reachability walk —
and reconcile the shipped `arc review` surface in `TECHNICAL-OVERVIEW` and the two invoking workflows.

_Design decisions:_ Prune runs after the consuming lanes so the reachability walk is valid and the boundary-module
consumer test is decidable; the module hand-off, the doc § edit, and the workflow rewrites are append-only and
merge-order-coordinated with `review-gate-right-sizing`. The workflow rewrite (7.5) is the second half of the
shared-surface boundary returned to the sibling. Module deletion and prose are test-after; the reachability walk is a check.

### `[x]` **7.1 Retire the superseded re-entry cluster and orphaned schema/ports**

- _Goal:_ The six no-consumer/no-claim modules and `core/review-reentry-schema.ts` are deleted with their tests, along
  with the now-orphaned `reconstructReviewSuspensionState` and the four wakeup port interfaces, leaving no unconsumed
  capability seam.

    - `[x]` **7.1.a Delete the retire-set modules and tests**
        - Deleted the seven re-entry, wakeup, plain-output, legacy-dispatch, eligibility, and schema modules; removed
          their six dedicated test files and retire-only sections from surviving cross-layer and schema tests.

    - `[x]` **7.1.b Remove orphaned symbols**
        - Removed suspension reconstruction and its canonical-facts schema while retaining the operation store; removed
          the four unbound wakeup and scheduled-wakeup port interfaces.

    - `[x]` **7.1.c Typecheck + full suite green**
        - Confirmed the retire-set vocabulary has no remaining production or test references and the surviving
          mixed-purpose tests retain their unrelated coverage.

- _Outcome:_ The dormant re-entry capability cluster, its schema registration, legacy receipt-dispatch bridge, and
  unbound wakeup ports are gone without changing the live operation store or current review command surface.

### `[x]` **7.2 Boundary-module consumer test and gate-cohort hand-off**

- _Goal:_ The two boundary `policy/standard-review*.ts` modules are dispositioned under the consumer test, and the three
  gate-cohort modules are left to `review-gate-right-sizing`'s cut under append-only merge-order coordination.

    - `[x]` **7.2.a Confirm `policy/standard-review-guidance.ts` is consumed by Task 3.2 → keep**
        - Kept the guidance module: the production assurance, rubric-binding, assurance-schema, and local-guidance
          paths consume its augmentation and baseline contracts.

    - `[x]` **7.2.b Consumer-test `policy/standard-review.ts`**
        - Kept the standard-review module: production obligation projection imports its rubric identity, while
          local-guidance and provider paths consume its baseline contract.

    - `[x]` **7.2.c Verify the gate-cohort modules remain unconsumed**
        - Confirmed `providers/coderabbit/config.ts`, `runtime/qualification-activation.ts`, and
          `runtime/operations.ts` have no production import from this WU and remain assigned to the sibling cut.

- _Outcome:_ Both boundary policy modules remain production-consumed, while all three gate-cohort modules retain a
  clean no-production-consumer hand-off to the coordinated sibling cut.

### `[x]` **7.3 Reachability-walk re-run — every consume-set port has a production caller**

- _Goal:_ A re-run of the reachability walk from every production entry point (the CLI, the `run-*.ts` launchers, and
  schema registration) shows no consume-set module without a production caller and no dormant module unclassified.

    - `[x]` **7.3.a Run and record the walk**
        - Traced all 14 consume-set modules from the CLI, legacy launchers, or schema registration. Wired carrier
          preparation into exact-target frontline execution, frontline findings through the response adapter, and
          durable-inventory/version validation into schema composition; retire-set references remain absent and the
          three gate-cohort modules retain no production consumer.

- _Outcome:_ Every D14 consume-set module now has a substantive production caller, while the retire and coordinated
  hand-off sets remain completely classified.

### `[x]` **7.4 `TECHNICAL-OVERVIEW` § 2 reconciliation**

- _Goal:_ `TECHNICAL-OVERVIEW` § 2 describes the shipped `arc review` CLI surface (the review tree is in the bundle) and
  preserves the statement that no host-side context is treated as operational merge authority.

- _Context:_ The review-controller text is repository-specific and lives in the rendered instance
  `.arc/reference/TECHNICAL-OVERVIEW.md` (its `### Self-Hosting Review Gate` section carries the "outside the tsup
  entry graph" inaccuracy) — the generic package-source template holds no such section, so content edits land in the
  rendered file directly, with no package-source projection. Merge-order-coordinated with the sibling's E2, which
  deletes the controller/check-run text.

    - `[x]` **7.4.a Rewrite the review-gate section in `.arc/reference/TECHNICAL-OVERVIEW.md`**
        - Replaced the inaccurate outside-the-bundle controller narrative with the shipped frontline, delegated-local,
          response, and reduction command surface; retained the current hosted-controller boundary without granting
          its records or projections merge authority.

- _Outcome:_ The project-owned overview now describes the executable advisory CLI contract while leaving a clean
  merge-order seam for the sibling's later controller deletion and thin-guard architecture.

### `[x]` **7.5 `integrate-work-unit` / `run-errand` review-lane rewrite to verb invocations**

- _Goal:_ Both workflows reach the review lane exclusively through `arc review` verbs — no `ReviewOperationStateStore`
  or other library symbol, no `invalid-request` — with the local lane supplying only the five caller-owned routing
  facts (no `changeSetState`), authored as typed state/nextAction dispatch composable with the sibling's inline
  hosted-lane segment.

    - `[x]` **7.5.a Rewrite the frontline segment**
        - Replaced hand-composed operation-state prose with typed `frontline resolve` / `frontline run` dispatch while
          retaining the caller-composed routing facts and exact-target re-entry.

    - `[x]` **7.5.b Rewrite the local segment**
        - Routed delegated local review through `prepare` / `attest` / `resume` and universal `respond` / `reduce`,
          with only the five caller-owned facts supplied to preparation and command errors stopping the lane.

    - `[x]` **7.5.c Carry the `invalid-input` rename**
        - Kept both package/project workflow pairs byte-identical and removed every
          `ReviewOperationStateStore` / `invalid-request` reference from the shipped prose.

- _Outcome:_ The integration and Errand workflows now expose one provider-neutral, typed review loop entirely through
  the seven public CLI verbs, leaving the sibling a source-selection-free seam for its hosted segment.

---

## **Phase 8:** Verification

### `[x]` **8.R Close verification gaps**

- _Goal:_ The public review protocol satisfies its strict authority, concurrency, exact-target, timeout, cleanup,
  reachability, and composed-system verification contracts without adding machinery beyond those guarantees.

    - `[x]` **8.R.a Enforce caller authority and typed command envelopes**
        - Local preparation now rejects derived routing keys while preserving conservative normalization for malformed
          caller-owned values; frontline and local-ready envelopes plus generated JSON schema carry complete strict
          routing, semantic, request, and reviewer-payload contracts

    - `[x]` **8.R.b Self-heal expected concurrent publication conflicts**
        - Local attestation and frontline execution now reload and retry bounded expected version conflicts at the
          handler boundary, converging exact publications while preserving divergent-record refusal

    - `[x]` **8.R.c Make frontline failure outcomes truthful and reachable**
        - Frontline execution now durably maps exact-head drift, stale source registration, missing executable
          capability, rejected launch authorization, and invalid provider output to their closed public outcomes while
          retaining the detached-checkout boundary

    - `[x]` **8.R.d Bound executable resolution and provider execution**
        - The frontline deadline now shrinks across executable lookup, version interrogation, and provider launch;
          abort-aware races convert hung interrogation or execution to durable `timed-out` outcomes

    - `[x]` **8.R.e Close the completed-source cleanup lifecycle**
        - Durable receipt publication now releases the exact checkout and pin immediately; the serialized sweep derives
          completion from the receipt store to recover interrupted release while retaining live sources and reaping
          orphaned or expired ones

    - `[x]` **8.R.f Wire reduction through its production port**
        - Production composition now constructs the durable `ReviewReductionPort`; the validated command consumes
          its complete typed result while the adapter remains read-only and passes storage references through as
          opaque values

    - `[x]` **8.R.g Prove the composed public protocol and recovery matrix**
        - Built-CLI tests now complete clean and findings-bearing local flows through resume, attestation, approved
          disposition replay, and reduction, and execute an exact-head frontline provider through durable re-entry
        - Integration tests prove pinned restoration after branch deletion and Git pruning, typed corruption for a
          pruned unpinned source, physical completed/expired release, and serialized concurrent sweeps

- _Outcome:_ The public protocol now enforces its typed authority and exact-target contracts through production
  ports, bounds and durably classifies frontline execution, self-heals expected concurrency, releases completed or
  expired sources, and is exercised through built commands across its complete advisory and recovery matrix.

### `[x]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Markdown, TypeScript, and shell lint; full typecheck; 645 test files / 8,057 tests; build — all
  passed, with one skipped test file and test
- _Success criteria:_ 14 criteria met with no deviations, supersessions, or remaining gaps

---

## Success Criteria

- `[x]` A project on the `local` channel completes a standard review end to end through documented `arc review`
  commands with no hosted provider; clean, findings, and fully-dispositioned results reach their advisory reduction
  states, and a defer/reject-only set reaches durable local closure with no fix machinery
- `[x]` The public path consumes effective method activation and a declared typed rubric augmentation; malformed or
  unavailable declarations produce visible fail-closed diagnostics, and the delivered guidance is re-verified at attestation
- `[x]` The registered CodeRabbit source runs against the exact head through an immutable checkout, records the digest
  and qualified version of the executable that ran, persists the outcome durably, re-enters the response path after a
  crash, and returns `timed-out` on a hung provider
- `[x]` No expected concurrency residue surfaces as an operator interrupt; the only `operator-repair` edges are the five
  the design enumerates (unresolvable source binding, unsupported capability, rejected authorization, invalid output,
  unparseable/unregistered policy binding)
- `[x]` Failure-injection tests cover the recovery surface: dirty/unborn refusal, Git target/request derivation, pin
  loss/restore and pruned-object corruption, failure between publication and pin creation, attest staleness, disposition
  idempotent and conflicting replay, outcome-before-advance, re-admission after a non-review terminal, provider timeout,
  stale-run-never-evidence, target movement during attestation, and every reduction result
- `[x]` A local evaluator sees only the detached exact-head checkout; moving the worktree away and back cannot change
  the source digest or satisfy attestation for different bytes; the pin keeps the range reachable through branch
  deletion and Git maintenance; resume recreates the identical review root
- `[x]` Contract tests exercise every legal command-specific state/action pair, reject impossible fields, and prove
  per-state payloads, strict error variants, and domain outcomes retain their distinct field and exit semantics
- `[x]` Integration tests enter through the CLI or a production launcher rather than composing library calls; every
  delivered port has a non-test production caller and a user-reachable path
- `[x]` The prune-at-consumption pass leaves no dormant review module unclassified; a re-run reachability walk shows no
  consume-set module without a production caller, and the two boundary `policy/` modules are dispositioned under the
  consumer test
- `[x]` `TECHNICAL-OVERVIEW` § 2 describes the shipped `arc review` surface, and no added behavior is represented as
  host-side enforcement; the required-check boundary remains explicit
- `[x]` `integrate-work-unit` and `run-errand` reach the review lane exclusively through `arc review` verbs in both
  package source and the projected instance; a grep for `ReviewOperationStateStore` / `invalid-request` returns nothing,
  and neither supplies `changeSetState`
- `[x]` No abandoned local review leaks its pin or checkout; the failure-injection suite proves both sweep classes and
  that a live unexpired operation's pin is never reaped by a concurrent sweep
- `[x]` All quality gates pass (tests, linting, type checking, build)
- `[x]` Ready for integration
