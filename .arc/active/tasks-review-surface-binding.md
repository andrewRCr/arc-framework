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

### `[ ]` **3.1 Method-activation resolution in production composition**

- _Goal:_ Production composition calls the shipped resolver (`resolveReviewMethodActivity`) for `self-review` and
  `frontline-review` instead of constructing literal booleans, preserving package-default fallback and surfacing
  activation diagnostics on the public result.

- _Note:_ `policy/activity.ts` already exposes `bindReviewMethodActivity` / `resolveReviewMethodActivity` and
  `ReviewMethodActivityResolution`; the production adapter reads the registered `self-review` and `frontline-review`
  method files.

    - Build `test-first` (one behavior at a time):
        - a project override of activation is reflected in the resolution
        - package-default activation is preserved when no project declaration exists
        - a malformed project declaration returns a diagnostic on the public result (not a throw)

### `[ ]` **3.2 `ReviewRubricBindingPort` production adapter and `review-augmentation` parse**

- _Goal:_ The production rubric adapter resolves the `Review Rubric` meta identity through the canonical method-file
  loader and parses one optional strict `review-augmentation` frontmatter field into `StandardReviewProjectAugmentation`
  (`rubricId` + sorted unique typed dimensions), never parsing method prose, and never from a command payload.

- _Note:_ `StandardReviewProjectAugmentation` and its schema already exist in `policy/standard-review-guidance.ts`
  (post-rename) — this task wires their parse into the production port and the method-frontmatter loader rather than
  defining them, confirming that module's D14 Consume disposition.

    - Build `test-first` (one behavior at a time):
        - a valid `review-augmentation` frontmatter parses into `StandardReviewProjectAugmentation` with sorted unique dimensions
        - `rubricId` must version the named method identity as `<identity>/vN`; a mismatch refuses
        - a command payload cannot supply an augmentation
        - the field extends the existing method-frontmatter schema/loader (no new registry, config axis, or doc family)

### `[ ]` **3.3 Overlay application and refusal diagnostics**

- _Goal:_ A resolved overlay augments the immutable baseline deterministically; a missing method, missing/malformed
  structured field, ambiguous lookup, or identity mismatch refuses the review request with a diagnostic, while an
  absent meta field uses the baseline unchanged.

    - Build `test-first` (one behavior at a time):
        - a resolved overlay augments the baseline deterministically (baseline `rubricVersion` + `rubricDigest` unchanged)
        - each refusal condition (missing / malformed / ambiguous / mismatch) returns a diagnostic
        - an absent `Review Rubric` field leaves the baseline unchanged

---

## **Phase 4:** Local review lane — prepare / attest / resume

_Purpose:_ Deliver the end-to-end local standard-review verbs — derive the canonical target and request, materialize
the immutable source under publish-first ordering, deliver the exact guidance, attest against the reviewed bytes, and
resume or recover — as the lane's durable-but-advisory trace.

_Design decisions:_ Publication precedes the pin (an orphan pin cannot arise from a live prepare); the operation record
is written once at admission and never advanced (publication state derives from the stores and the pin); the sweep runs
inline in prepare/resume, reaping both orphan and terminally-expired classes. Derivation, materialization, and
validation are test-first; the Commander wiring is test-after.

### `[ ]` **4.1 `arc review local prepare` — canonical target and request derivation**

- _Goal:_ `local prepare` derives the exact local target and request from trusted repository/vehicle/policy/runtime
  bindings — never a prebuilt target — and admits (or identical-retry-returns) one operation, emitting a `ready`
  payload with the typed reviewer payload.

- _Context:_ The only explicit caller selection is `evaluatorIdentity` (must differ from the author); repository
  preconditions (unborn, unresolved base, dirty index/worktree, non-commit HEAD) are `invalid-input`, not domain states.

- **Additional Context:** `spec-review-surface-binding.md` § D4 (derivation steps, identical-retry predicate)

    - `[ ]` **4.1.a Repository identity record** (`hosts/local/git-common-state.ts`)
        - Build `test-first`: mint-once then resolve-same; shared across sibling worktrees; survives checkout relocation

    - `[ ]` **4.1.b Target derivation and preconditions**
        - resolve `branch.base` → `refs/heads/<base>` + HEAD as commits, merge-base `diffBaseSha`, resolve trees
        - Build `test-first`: each precondition refusal → `invalid-input`; clean derivation; coordinates moving between
          derive and re-read before publish → `stale-target`

    - `[ ]` **4.1.c Vehicle / author / evaluator / runtime resolution**
        - WU meta owner (active identity must match) or Errand identity; evaluator differs from author; attesting
          runtime from the installed binding
        - Build `test-first`: WU vs Errand author; `evaluator == author` rejected; runtime derived, never caller-supplied

    - `[ ]` **4.1.d Deterministic operation identity and identical-retry predicate**
        - identity a pure function of derived `targetId` / requirement / actor bindings / request mechanism
        - Build `test-first`: identity determinism; identical retry returns the same `operationId` and re-verifies rather
          than rebuilds; any keyed-fact difference admits a new operation

    - `[ ]` **4.1.e Wire the `arc review local prepare` handler and command** — test-after (envelope in/out; `handleReviewLocalPrepare`)

### `[ ]` **4.2 Immutable local review source materialization**

- _Goal:_ After deriving the clean target, `local prepare` publishes the admitted operation first, then materializes
  the immutable source — operation-owned pin at `headSha`, detached exact-head checkout — verified by pre-launch
  proofs, so an orphan pin cannot arise from a live prepare and the reviewer never sees a mutable worktree.

- _Context:_ Publish-first ordering is a correctness requirement (the namespace lock is non-reentrant). Pre-launch
  proofs: detached `HEAD == headSha`, tree == `headTree`, both endpoints present, reachability ref == `headSha`, empty
  porcelain-v2 status.

- **Additional Context:** `spec-review-surface-binding.md` § D5 (publish-first ordering, proof-failure outcomes)

    - Build `test-first` (one behavior at a time):
        - publication precedes pin creation; a failure between publication and pin leaves a recoverable operation, not an
          unreachable ref
        - each pre-launch proof failure has its defined outcome — idempotent restore-in-place vs `corrupt-state` (pin to
          different bytes, or pruned objects)
        - the reviewer payload carries the review root + `diffBaseSha`/`headSha`/`sourceRef`/`sourceDigest`; no mutable
          caller-worktree path enters it
        - moving the original branch away and back during evaluation does not change the reviewed source

- _Note:_ `core/local-carrier.ts` materialization over the `hosts/local/git-common-state.ts` namespace lock.

### `[ ]` **4.3 Source-store sweep — orphan and terminally-expired reaping**

- _Goal:_ A sweep run inline inside `local prepare` / `local resume` reaps two pin classes — orphan (operation record
  absent) and terminally-expired (record present but cleanup-TTL-expired with no complete receipt) — so no abandoned
  pin blocks Git maintenance, and it never reaps a live unexpired operation's pin.

    - Build `test-first` (one behavior at a time):
        - a true orphan pin (no operation record) is reaped
        - an expired operation whose `operationId` is no longer derivable (HEAD moved) is reaped with its materialization
        - a live unexpired operation's pin is never reaped by a concurrent sweep

- _Note:_ No background process; the descriptor and receipt reference survive cleanup (SC 12).

### `[ ]` **4.4 Guidance delivery and the local policy binding**

- _Goal:_ `local prepare` projects the exact effective guidance (baseline + resolved overlay), computes its
  `guidanceDigest`, and binds source/admission policy through a strict `LocalReviewPolicyBinding` with its own canonical
  digest, validating the selected evaluator/carrier against it.

- _Context:_ The package default is opt-in — the local lane is one `delegated-agent` standard source, off until the
  driver selects it. `local prepare: unavailable` fires only when a present composition adapter's declared binding fails
  to parse or names an unregistered source; a no-adapter project takes the package default and never reaches it.

    - Build `test-first` (one behavior at a time):
        - `guidanceDigest` is computed over the delivered projection; baseline `rubricVersion` + `rubricDigest` unchanged
          by augmentation
        - the default binding permits `{ sourceKind: agent, qualifier: standard-review/v1 }` + `local-attestation`; a
          stricter binding narrows it
        - a present adapter with an unparseable/unregistered binding → `unavailable` (never a silent downgrade); no
          adapter → package default

### `[ ]` **4.5 `arc review local attest` — advisory receipt against reviewed bytes**

- _Goal:_ `local attest` accepts only the normalized result schema, re-derives runtime identity at the trusted
  boundary, re-verifies exact target / rubric / guidance-digest and the pin + detached checkout, and appends a single
  advisory `ReviewReceiptV2` — recording what was reviewed, appending no downstream-satisfying pair — returning the
  reduction transition.

- _Context:_ Attestation is gated on the materialization, not the clock; an already-recorded exact receipt replays
  idempotently; the `stale-target` result is a strict pre/post-append sub-union.

- **Additional Context:** `spec-review-surface-binding.md` § D12 (attest staleness sub-union, expiry semantics)

    - Build `test-first` (one behavior at a time):
        - a non-terminal or null-verdict-`complete` result is `not-attestable` and appends nothing
        - the result must echo `sourceDigest`; a result for different bytes is rejected regardless of matching identifiers
        - live unchanged target → `attested-current` + receipt ref; changed after append → `stale-target`
          (`receiptRecorded: true`, historical ref); reaped materialization, no receipt → `expired -> rerun-review`
          (`receiptRecorded: false`)
        - an already-recorded exact receipt replays identically (idempotent)

- _Note:_ extend `runtime/local-attestation.ts` `NormalizedLocalReviewResultSchema` with `sourceDigest` and
  `guidanceDigest` (net-new — it carries neither today) and add their attest re-verification; append via
  `hosts/local/receipt-store.ts`; `ReviewReceiptV2` used as shipped.

### `[ ]` **4.6 `arc review local resume` — re-acquisition and idempotent continuation**

- _Goal:_ `local resume` reads the durable operation record plus current repository facts and emits the next typed
  action, re-acquiring a lost `operationId` via the identical-retry derivation and completing an interrupted idempotent
  transition — deliberately not a read-only `status`.

    - Build `test-first` (one behavior at a time):
        - re-running `local prepare` from the same working tree returns the same `operationId` (the re-acquisition path)
        - `suspended -> wait` / `review-complete -> reduce` / `respond-to-findings -> respond` / `stale-target` / `expired`
          map from durable state + current facts
        - a lost checkout is recreated from the pinned objects; an absent pin whose objects remain is restored idempotently

    - `[ ]` **4.6.a Wire the `arc review local resume` handler and command** — test-after

---

## **Phase 5:** Frontline lane — exact-target execution and durable outcomes

_Purpose:_ Deliver the provider-effectful `frontline run` bound to the exact target head with durable outcomes, close
the two CodeRabbit adapter gaps, bound execution by an explicit timeout, and give the shipped `frontline resolve` its
explicit state/action projection. Execution binding, normalization, and timeout logic are test-first; wiring is
test-after.

### `[ ]` **5.1 `arc review frontline run` — pending publication, exact-head execution, durable outcome**

- _Goal:_ `frontline run` consumes one complete `ready` resolution plus the exact adapter-supplied target, revalidates
  the source, publishes the pending operation, prepares the exact-head checkout, resolves/interrogates/launches the
  executable, and durably records the full normalized outcome before advancing operation state.

- _Context:_ § D3 — `frontline run` is the one verb accepting a caller `target`; it re-derives the coordinates from the
  exact-head checkout and refuses on mismatch. `pass` comes from the `ready` resolution, never a request field.

    - `[ ]` **5.1.a Run choreography** (`policy/frontline-operation.ts`)
        - Build `test-first`: pending published before the carrier effect; outcome recorded before operation advance;
          every terminal returns `operationId` / `persistedVersion` / full `target` / `outcomeRef` + digest

    - `[ ]` **5.1.b Frontline target authority**
        - Build `test-first`: caller `target` validated then re-derived from the exact-head checkout; a mismatch refuses;
          `pass` taken from the `ready` resolution, not a request field

    - `[ ]` **5.1.c Wire the `arc review frontline run` handler and command** — test-after

### `[ ]` **5.2 CodeRabbit adapter — exact-head binding, executable-that-ran identity, `stale-head` normalization**

- _Goal:_ The CodeRabbit adapter binds both `diffBaseSha` and `headSha` (an immutable exact-head checkout, not a
  twice-observed mutable ref), records the digest + qualified version of the executable that actually ran, and
  normalizes its `stale-head` result to `stale-target` (retaining the provider-level result name).

- _Note:_ `providers/coderabbit/frontline-execution.ts`, `frontline-agent.ts`; the structured `--agent` parser already
  emits normalized findings and outcomes.

    - Build `test-first` (one behavior at a time):
        - execution binds to the exact-head checkout; a moved-and-returned ref is not accepted as proof
        - the executable is resolved once, interrogated for its version, and the same artifact launched; digest + version
          recorded from what ran
        - `stale-head` normalizes to `stale-target` (not `failed`)

### `[ ]` **5.3 Bounded provider execution — timeout, abort signal, adapter-failure mapping**

- _Goal:_ Provider execution runs under a plain execution timeout (an operation input with a framework default — not a
  new config axis); the runner passes remaining time + an abort signal and kills the spawned process on expiry, typing
  the result `timed-out`; unknown thrown errors map to the closed adapter-failure class.

    - Build `test-first` (one behavior at a time):
        - a hung provider is terminated at the timeout and returns `timed-out` (never normalized clean/findings)
        - an unknown thrown error maps to the adapter-failure class rather than an unbounded wait
        - remaining time and an abort signal are passed to the adapter

### `[ ]` **5.4 `frontline resolve` state/action projection and `invalid-input` rename**

- _Goal:_ The shipped `frontline resolve` gains its explicit `state`/`nextAction` projection (per the § D2 table)
  without operation/persistence padding, and its error code is renamed `invalid-request` → `invalid-input` so one
  strict union covers all seven verbs.

- _Note:_ `src/handlers/review.ts:46` currently emits `invalid-request`; resolver in `policy/frontline-command.ts`. The
  old code's consumers are rewritten in Task 7.5 (SC 11). The `ready` variant's authorized `pass` is a net-new field
  (`FrontlineSemanticRecord` carries only `maxPasses` today), derived per § D11 — pass 1 on a fresh resolution; the
  follow-up resolver authorizes pass 2 at the changed head.

    - Build `test-first` (one behavior at a time):
        - `skipped -> none`; `offered -> bind-source` (no source) / `obtain-authorization` (source resolved);
          `ready -> run-frontline`
        - the `ready` variant carries the authorized `pass` and effective allowance
        - the error envelope emits `invalid-input`

### `[ ]` **5.5 Frontline outcome recovery and reuse discrimination**

- _Goal:_ An interruption after outcome publication is repaired by validating that exact record and advancing operation
  state; reuse discriminates on review content — a review-concluding outcome (clean/findings/pass-cap-exhausted) is
  reused at unchanged coordinates, while every non-review terminal admits a fresh operation at an advanced generation
  with the same pass number.

    - Build `test-first` (one behavior at a time):
        - re-entry to a concluded operation returns the same durable outcome reference
        - a review-concluding outcome is reused at unchanged coordinates
        - a non-review terminal (`timed-out` / `unavailable` / `failed`) admits a new generation, same pass number;
          retry-vs-`operator-repair` is advice, not a persistence discriminator
        - if no record was published, re-entry retries the same operation and never promotes an inferred result

---

## **Phase 6:** Universal response and invocable reduction

_Purpose:_ Close the review loop — `respond` binds source-discriminated approved dispositions under the
agent-proposes / human-approves shape and drives the re-review-at-new-head fix path; read-only `reduce` composes the
shipped forward reducers over both lanes. Test-first (validation + reduction logic).

### `[ ]` **6.1 `arc review respond` — source-discriminated approved dispositions**

- _Goal:_ After the universal response checkpoint presents the source-verified report and obtains approval, `respond`
  accepts a strict `ApprovedDispositionSet` against either the attested-local receipt or one durable frontline outcome,
  revalidates every finding against the selected source, and appends one `ApprovedDispositionRecordV1` — idempotent on
  identical replay, conflict-refused on a divergent set.

- _Context:_ Approver = active local identity; proposer = composing runtime identity — both derived at the trusted
  boundary, so the shipped distinct-actor check structurally encodes agent-proposes / human-approves.

    - Build `test-first` (one behavior at a time):
        - source-discriminated authority: attested-local reloads receipt + immutable source; frontline reloads the exact
          outcome and rejects any non-findings outcome
        - `approver != proposer` enforced from trusted-boundary identities (never caller text)
        - identical replay is idempotent; a different record for the same disposition set is a conflict
        - `ready-to-fix` returns the record ref + validated `FixAuthorization`; `settled` / `already-settled` return
          the record ref

- _Note:_ `core/response-plan.ts` universal checkpoint; append via the disposition-record store (Task 2.6.a).

### `[ ]` **6.2 The fix path and frontline follow-up advice**

- _Goal:_ An approved fix is applied by the agent under the ordinary review-increment + commit interlock, producing a
  new head; the disposition record closes the old target's response obligation and the fixed change earns its own review
  at its own head, with `resolveFrontlineFollowUp` semantics surfaced as advice in `respond` / `reduce` output — never a
  durable fix ledger or fix-phase verb.

    - Build `test-first` (one behavior at a time):
        - nothing carries across a fix — re-entry is `local prepare` / `frontline resolve` at the new head
        - for a frontline source, follow-up worthwhileness surfaces as advisory text in `respond` / `reduce`, not a durable
          binding chain (`policy/frontline-follow-up.ts`)

### `[ ]` **6.3 `arc review reduce` — invocable reduction over both lanes**

- _Goal:_ `reduce` resolves its source from `operationId` and composes the shipped forward requirement / qualification /
  response / projection reducers read-only, mapping totally over both lanes to the § D10 states, with `corrupt-state` on
  missing/mismatched evidence — callers cannot supply a receipt, disposition record, target, or conclusion.

- **Additional Context:** `spec-review-surface-binding.md` § D10 (per-source reduction mapping)

    - Build `test-first` (one behavior at a time):
        - attested-local: clean receipt → `advisory-complete`; findings without a complete disposition → `findings` + refs;
          with a complete disposition → `settled`; a `failed`/`unavailable` receipt → `retryable`; changed target → `stale-target`
        - frontline: undispositioned findings → `findings`; clean/dispositioned/`pass-cap-exhausted` → `advisory-complete`;
          a non-review terminal → `retryable` (`frontline-run`); moved head → `stale-target`
        - read-only: completes no pending append and advances no operation state
        - a digest/reference mismatch is `corrupt-state`, never a reduction result

- _Note:_ `core/reduction.ts` forward reducers.

---

## **Phase 7:** Predecessor prune, documentation, and workflow reconciliation

_Purpose:_ Leave no dormant review module unclassified — consume, retire, or hand off each under the reachability walk —
and reconcile the shipped `arc review` surface in `TECHNICAL-OVERVIEW` and the two invoking workflows.

_Design decisions:_ Prune runs after the consuming lanes so the reachability walk is valid and the boundary-module
consumer test is decidable; the module hand-off, the doc § edit, and the workflow rewrites are append-only and
merge-order-coordinated with `review-gate-right-sizing`. The workflow rewrite (7.5) is the second half of the
shared-surface boundary returned to the sibling. Module deletion and prose are test-after; the reachability walk is a check.

### `[ ]` **7.1 Retire the superseded re-entry cluster and orphaned schema/ports**

- _Goal:_ The six no-consumer/no-claim modules and `core/review-reentry-schema.ts` are deleted with their tests, along
  with the now-orphaned `reconstructReviewSuspensionState` and the four wakeup port interfaces, leaving no unconsumed
  capability seam.

    - `[ ]` **7.1.a Delete the retire-set modules and tests**
        - `runtime/review-reentry.ts`, `review-reentry-fallback.ts`, `review-wakeup-capability.ts`,
          `providers/coderabbit/frontline-plain.ts`, `core/contract-version-dispatch.ts`, `core/forward-evidence-eligibility.ts`,
          `core/review-reentry-schema.ts`; drop the `review-reentry-result` schema registration

    - `[ ]` **7.1.b Remove orphaned symbols**
        - `reconstructReviewSuspensionState` and its sole consumer `CanonicalReviewSuspensionFactsSchema` (both in
          `hosts/local/operation-state-store.ts`; retain the store module)
        - the four `core/ports.ts` wakeup interfaces: `ReviewWakeupRequest`, `ReviewWakeupCapability`,
          `ReviewScheduledWakeupRequest`, `ReviewScheduledWakeupCapability`

    - `[ ]` **7.1.c Typecheck + full suite green** — no dangling imports after removal

### `[ ]` **7.2 Boundary-module consumer test and gate-cohort hand-off**

- _Goal:_ The two boundary `policy/standard-review*.ts` modules are dispositioned under the consumer test, and the three
  gate-cohort modules are left to `review-gate-right-sizing`'s cut under append-only merge-order coordination.

    - `[ ]` **7.2.a Confirm `policy/standard-review-guidance.ts` is consumed by Task 3.2 → keep**

    - `[ ]` **7.2.b Consumer-test `policy/standard-review.ts`** — **keep**: `standard-review-projection.ts` (a
      consume-set module) imports its `STANDARD_REVIEW_RUBRIC_IDENTITY`, so it is transitively consumed

    - `[ ]` **7.2.c Verify the gate-cohort modules remain unconsumed** — confirm `providers/coderabbit/config.ts`,
      `runtime/qualification-activation.ts`, and `runtime/operations.ts` are unconsumed by this WU; leave for the
      sibling's cut (whichever branch lands first removes them)

- _Note:_ Joint-confirm at build with `review-gate-right-sizing` § D4.

### `[ ]` **7.3 Reachability-walk re-run — every consume-set port has a production caller**

- _Goal:_ A re-run of the reachability walk from every production entry point (the CLI, the `run-*.ts` launchers, and
  schema registration) shows no consume-set module without a production caller and no dormant module unclassified.

    - `[ ]` **7.3.a Run and record the walk** — confirm the 14 consume-set modules are reachable and the retire/hand-off
      sets are gone or pending; pre-existing forward-contract interfaces this WU neither delivers nor touches are out
      of scope (Goal 6, SC 9)

### `[ ]` **7.4 `TECHNICAL-OVERVIEW` § 2 reconciliation**

- _Goal:_ `TECHNICAL-OVERVIEW` § 2 describes the shipped `arc review` CLI surface (the review tree is in the bundle) and
  preserves the statement that no host-side context is treated as operational merge authority.

- _Context:_ The review-controller text is repository-specific and lives in the rendered instance
  `.arc/reference/TECHNICAL-OVERVIEW.md` (its `### Self-Hosting Review Gate` section carries the "outside the tsup
  entry graph" inaccuracy) — the generic package-source template holds no such section, so content edits land in the
  rendered file directly, with no package-source projection. Merge-order-coordinated with the sibling's E2, which
  deletes the controller/check-run text.

    - `[ ]` **7.4.a Rewrite the review-gate section in `.arc/reference/TECHNICAL-OVERVIEW.md`** to the shipped
      surface; reconcile with the sibling's deletion by merge order; markdown lint green

### `[ ]` **7.5 `integrate-work-unit` / `run-errand` review-lane rewrite to verb invocations**

- _Goal:_ Both workflows reach the review lane exclusively through `arc review` verbs — no `ReviewOperationStateStore`
  or other library symbol, no `invalid-request` — with the local lane supplying only the five caller-owned routing
  facts (no `changeSetState`), authored as typed state/nextAction dispatch composable with the sibling's inline
  hosted-lane segment.

- _Context:_ § D16 — package-source-first; the second half of the shared-surface boundary returned to the sibling.
  Introduces no method/extension/config surface; the interlock structure of either workflow is unchanged.

    - `[ ]` **7.5.a Rewrite the frontline segment** — replace hand-composed operation-state prose with `arc review
      frontline run`; keep the routing-fact record composed for `frontline resolve`

    - `[ ]` **7.5.b Rewrite the local segment** — `local prepare` (five caller-owned facts, no `changeSetState`) /
      `attest` / `resume` + universal `respond` / `reduce`

    - `[ ]` **7.5.c Carry the `invalid-input` rename** — a grep for `ReviewOperationStateStore` / `invalid-request`
      across both copies of shipped workflow prose returns nothing (SC 11)

---

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A project on the `local` channel completes a standard review end to end through documented `arc review`
  commands with no hosted provider; clean, findings, and fully-dispositioned results reach their advisory reduction
  states, and a defer/reject-only set reaches durable local closure with no fix machinery
- `[ ]` The public path consumes effective method activation and a declared typed rubric augmentation; malformed or
  unavailable declarations produce visible fail-closed diagnostics, and the delivered guidance is re-verified at attestation
- `[ ]` The registered CodeRabbit source runs against the exact head through an immutable checkout, records the digest
  and qualified version of the executable that ran, persists the outcome durably, re-enters the response path after a
  crash, and returns `timed-out` on a hung provider
- `[ ]` No expected concurrency residue surfaces as an operator interrupt; the only `operator-repair` edges are the five
  the design enumerates (unresolvable source binding, unsupported capability, rejected authorization, invalid output,
  unparseable/unregistered policy binding)
- `[ ]` Failure-injection tests cover the recovery surface: dirty/unborn refusal, Git target/request derivation, pin
  loss/restore and pruned-object corruption, failure between publication and pin creation, attest staleness, disposition
  idempotent and conflicting replay, outcome-before-advance, re-admission after a non-review terminal, provider timeout,
  stale-run-never-evidence, target movement during attestation, and every reduction result
- `[ ]` A local evaluator sees only the detached exact-head checkout; moving the worktree away and back cannot change
  the source digest or satisfy attestation for different bytes; the pin keeps the range reachable through branch
  deletion and Git maintenance; resume recreates the identical review root
- `[ ]` Contract tests exercise every legal command-specific state/action pair, reject impossible fields, and prove
  per-state payloads, strict error variants, and domain outcomes retain their distinct field and exit semantics
- `[ ]` Integration tests enter through the CLI or a production launcher rather than composing library calls; every
  delivered port has a non-test production caller and a user-reachable path
- `[ ]` The prune-at-consumption pass leaves no dormant review module unclassified; a re-run reachability walk shows no
  consume-set module without a production caller, and the two boundary `policy/` modules are dispositioned under the
  consumer test
- `[ ]` `TECHNICAL-OVERVIEW` § 2 describes the shipped `arc review` surface, and no added behavior is represented as
  host-side enforcement; the required-check boundary remains explicit
- `[ ]` `integrate-work-unit` and `run-errand` reach the review lane exclusively through `arc review` verbs in both
  package source and the projected instance; a grep for `ReviewOperationStateStore` / `invalid-request` returns nothing,
  and neither supplies `changeSetState`
- `[ ]` No abandoned local review leaks its pin or checkout; the failure-injection suite proves both sweep classes and
  that a live unexpired operation's pin is never reaped by a concurrent sweep
- `[ ]` All quality gates pass (tests, linting, type checking, build)
- `[ ]` Ready for integration
