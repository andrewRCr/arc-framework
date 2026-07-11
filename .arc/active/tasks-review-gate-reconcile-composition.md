# Task List: Review-Gate Reconcile Composition

- **Design:** `spec-review-gate-reconcile-composition.md`

---

## **Phase 1:** Pin policy identity and attestation-enforcement values

_Purpose:_ Land the versioned-policy additions composition consumes — App-bot identity, attestation enforcement,
and the lifecycle-bookkeeping-tail predicate — as one reviewed policy edit before runtime code reads them.

_Design decisions:_ Changing `policy_version` is legitimate and safe pre-live: the reducers and receipt store
have zero production callers, so no live requirement or receipt is invalidated (spec Decision 5). Values and
closed predicate identities are versioned — no dynamic lookup or new operator-pinned variables.

### `[x]` **1.1 Pin the App-bot account id in `providerIdentities`**

- _Goal:_ Receipt authentication's `expectedBotId` has a production source — the pinned, immutable bot account
  id resolves from the versioned policy document, matching how `receipt-auth.ts` documents it.

    - `[x]` **1.1.a Add the field to the policy schema and document**
        - Added the immutable App-bot user id `302312524` beside the CodeRabbit identity, with exact-key and
          numeric-string parser validation plus canonical round-trip and malformed-shape coverage.

- _Outcome:_ The private App slug recorded by repository operations resolves through GitHub to the same immutable
  bot identity already exercised by authenticated receipt fixtures, so policy now supplies the production pin.

### `[x]` **1.2 Pin attestation-enforcement policy fields and derive `acceptedReviewerClaims`**

- _Goal:_ Every `AttestationValidationContext` enforcement input has a production source: `acceptedRuntimeKinds`
  and `maxRunAgeMinutes` are pinned policy fields; `acceptedReviewerClaims` derives from the enabled
  `authenticated-attestation` qualifications rather than duplicating them.
    - `[x]` **1.2.a Add the enforcement fields to the policy schema and document**
        - Added the closed runtime-kind map and 60-minute run-age limit, validating positive integer age and
          requiring every mapped source to be an enabled authenticated-attestation agent qualification.

    - `[x]` **1.2.b Derive `acceptedReviewerClaims` from enabled qualifications**
        - Exported policy-driven claim derivation across enabled authenticated-attestation qualifications,
          including the asymmetric human source while excluding disabled and durable-record entries.

- _Outcome:_ All `AttestationValidationContext` enforcement inputs now originate in versioned policy: runtime and
  age values are pinned directly, while reviewer claims derive from the already-hashed qualification set.

### `[x]` **1.3 Pin the lifecycle-bookkeeping-tail predicate**

- _Goal:_ Review carry-forward is licensed by a closed, versioned policy rule rather than an implicit path
  exception that can drift independently of `policy_version`.

- _Outcome:_ Added the exact `lifecycle-bookkeeping-tail/v1` predicate without storage switches, with closed-shape
  rejection and a regression proof that the predicate changes `policy_version`.

## **Phase 2:** Reconcile-path core composition

_Purpose:_ Write the central missing production units — the core reduce assembly (the semantic risk center), the
`GitHostAdapter`, repository-local CodeRabbit boundary, human-command path, degraded-ledger projection, and
lifecycle-tail proof — including the load-bearing check-publication link and host state the verdict consumes.

_Design decisions:_ New code composes existing units to the shipped semantics while correcting the audited
production contracts: native review carries aggregate state rather than lossy `Evidence[]`; CodeRabbit approval
maps to clean provider evidence; commands are durable and current-scope; receipt corruption projects failure; and
only a closed lifecycle-tail proof can carry authority past a reviewed head. Shadow suppresses nothing — the full
pipeline runs; only context names differ (spec Decisions 1-4, 12, 14-15, 17, 20).

### `[x]` **2.1 Core reduce assembly (policy decision → admission → requirement state → verdict → projection)**

- _Goal:_ One production function turns canonical state (normalized change request, evidence, receipts,
  capacity, policy) into a `ReconcileDecision` — the chaining function the unit-tested leaf reducers never had.
- _Outcome:_ Added the production reduction chain with policy-qualified evidence filtering, closed automatic-source
  selection, admission history, finding/coverage/requirement reduction, and truthful verdict projection. Composition
  coverage also closed the policy-template gap that had made the declared non-author human source unreachable.

### `[x]` **2.2 `GitHostAdapter` implementation over the `hosts/github/*` leaf functions**

- _Goal:_ The host port has one production implementor composing the tested host leaves, including a contract that
  carries native-review state without loss — and a verdict actually reaches the check API: `publishVerdict()`
  maps the projection through `projectContexts(mode, …)` and writes one check per named context via
  `publishGateCheck`.
    - `[x]` **2.2.a Read-side methods and corrected native-review contract**
        - Added the pinned-scope GitHub read adapter, login-addressed immutable-id capability resolution, full
          change context, and lossless native review/provider dispositions without synthesizing review evidence.

    - `[x]` **2.2.b `publishVerdict()` — the missing link**
        - Added guarded per-context check publication through `projectContexts` and `publishGateCheck`; shadow,
          dual, and final modes preserve one projection while a moved head or change set prevents every write.

    - `[x]` **2.2.c CI-state reader**
        - Added a source-pinned `ci-ok` reader that maps the newest GitHub Actions check to pending, failure, or
          success and ignores same-name checks from other Apps.

    - `[x]` **2.2.d CodeRabbit decisive-review disposition reader**
        - Added pinned-bot decisive-review selection with durable provenance, current-head and verified-tail support,
          policy-qualified clean evidence mapping, and fail-closed handling for stale, foreign, missing, or ambiguous
          reviews. Completion checks remain outside the satisfaction path.

- _Outcome:_ The production GitHub adapter now composes lossless reads, source-pinned CI and provider authority,
  stale-safe context publication, and installation-token-compatible controller identity validation.

### `[x]` **2.3 Production CodeRabbit trigger and observation boundary**

- _Goal:_ The shipped `CodeRabbitProviderAdapter` has a real repository-local `CodeRabbitApi`; a policy-qualified
  request can trigger exactly once and later observation can correlate GitHub artifacts without inventing a vendor
  API or weakening ambiguous-delivery handling.

    - `[x]` **2.3.a Implement the GitHub-backed trigger methods**
        - Added the repository-pinned trigger API: a generation-zero label handshake, refresh command with durable
          comment provenance, current/replay/stale guard delegation, and terminal rejected-versus-ambiguous delivery.

    - `[x]` **2.3.b Implement observation and capacity methods**
        - Added GitHub-backed run-context, observation, and capacity reads that bind checks, reviews, comments,
          and thread resolutions to the pinned numeric bot id; malformed, stale, and foreign artifacts fail closed.
          Completion checks and provider-native conversations stay diagnostic, candidate-tail checks retain their
          observed SHA, and only a completed current-head quota signal reports exhausted capacity.

    - `[x]` **2.3.c Align project review coordination with provider-native conversations**
        - Updated the review coordinator and integration contract to triage controller findings and provider-native
          conversations separately: only normalized ids may dismiss, decisive provider state closes native work,
          completion checks only re-read canonical state, and a valid lifecycle tail settles without a refresh.

- _Outcome:_ Shipped the GitHub-backed CodeRabbit trigger and diagnostic-observation boundary with pinned bot
  provenance, terminal delivery semantics, and provider-native review coordination that never fabricates controller
  finding authority or spends a refresh after a valid lifecycle-tail settlement.

### `[x]` **2.4 Human command ingestion, authorization, and receipt reduction**

- _Goal:_ GitHub issue-comment wake-ups can actually execute the shipped strict command surface; require, waive,
  refresh, and dismiss are current-scope, permission-checked, durable, and replay-safe rather than inert parser code.

    - `[x]` **2.4.a Read and authorize canonical command comments**
        - Added a validated GitHub issue-comment reader and pure command reducer that retain immutable provenance,
          bind the mutable login to its numeric id for live capability checks, and emit only authorized current-scope
          command versions. Event identity combines comment node id, update time, and body digest, so exact replays
          are no-ops while edits remain explicit new events; malformed, stale, foreign, unauthorized, and unknown
          inputs remain non-persistent.

    - `[x]` **2.4.b Persist and reduce every command kind**
        - Added event-aware command receipt plans and ledger validation: `required` elevates the current obligation
          before ordinary generation-zero admission; refresh yields a full or exact incremental reservation; waivers
          expire outside their requirement scope; and dismissed receipts retain actor, reason, and durable-comment
          provenance while closing only the exact source/finding pair without manufacturing clean evidence.

- _Outcome:_ GitHub comment commands now form a strict, replay-safe authority path from immutable host version through
  live capability authorization to receipt-backed requirement, request, waiver, and finding reduction semantics.

### `[x]` **2.5 Degraded receipt-state failure projection**

- _Goal:_ A malformed, forked, unexpectedly disappeared, or unavailable receipt ledger replaces any prior green
  check with a current failure projection whenever check publication remains available; corruption never fails
  before verdict, while an initial empty ledger remains valid.

- _Outcome:_ Receipt reads now distinguish valid snapshots from degraded fail-closed state; corruption and
  unavailability publish a failure projection with unknown coordinates, suppress writes, and recover after repair.
  Coverage proves stale-green replacement, durable refusal and recovery, and independent check publication failure.

### `[ ]` **2.6 Lifecycle-bookkeeping-tail proof and review-authority carry-forward**

- _Goal:_ Completion composition and sweep can advance an exact reviewed PR to its mergeable bookkeeping head
  without purchasing another independent review, while any substantive or ambiguous tail still fails closed.
- _Note:_ Core is storage-neutral. The current Git adapter implements `lifecycle-bookkeeping-tail/v1`; under the
  future materialized backing store, operational-state writes advance no code head and this proof becomes a no-tail
  case (spec Decisions 17 and 20).
- **Additional Context:** `notes-review-gate-reconcile-composition.md` § Storage forward-compatibility check

    - `[x]` **2.6.a Define and consume the host/storage-neutral proof**
        - Added the diagnostic-bearing `LifecycleTailProof` and neutral resolution port. Coverage carries only an
          exact clean source chain across it; findings, native review, and proof-free paths retain ordinary authority.
          Projection names a clean bridge explicitly without treating the proof as evidence.

    - `[ ]` **2.6.b Implement the current in-repo Git predicate**
        - Resolve the exact reviewed-head → current-head diff without inferring WU identity from branch name. Require
          the reviewed meta to establish one artifact group and optional cohort path, then enforce a closed
          path/status grammar: archive-phase edits plus relocation for that WU's `meta-*` / `tasks-*`; the same plus
          optional deletion for `notes-*`; byte-identical relocation only for every other same-slug companion;
          documented final-member closeout/relocation for cohort documents bound by that path; and the single derived
          `.arc/backlog/ROADMAP.md` update.
        - Treat the proof as review-relevance classification, not provenance or bookkeeping-correctness attestation.
          Final-head required checks/hooks own archive structure and ROADMAP regeneration; the predicate neither
          guesses an "integration-owned" author nor attempts an unreconstructible historical local-ref render.
        - Reject code, `.github/`, `.arc/system/`, policy/config, unrelated/mixed WUs, authored-design content edits,
          base/merge-base/policy/rubric/source drift, and any unknown path/status. A behind-base merge or
          review-driven fix to a review-relevant surface is never a lifecycle tail.
        - Build `test-first` (one behavior at a time): every allowed artifact/status transition including notes/task
          cleanup and cohort closeout, mixed allowed operations, every reject class above, rename ambiguity,
          deleted/added spoofing, ROADMAP-plus-code mixing, and future-storage no-tail behavior at the port.

## **Phase 3:** Runtime, factory, and reconcile entry rewrite

_Purpose:_ Assemble the pieces into a live reconcile path: the `ReconcileRuntime`, shared infrastructure and
reconcile-specific factories, the `run-reconcile.ts` rewrite to a thin shell over an exported main, and the
end-to-end composition test that fails if the path stops emitting.

_Design decisions:_ `read()` re-resolves canonical state from the API — events (including dispatched
`head_sha`) are wake-up hints, never trusted snapshots (spec Decision 3). Stale writers are stopped by the
orchestrator's existing guards plus `publishGateCheck`'s current-state assert.

### `[ ]` **3.1 `ReconcileRuntime` implementation**

- _Goal:_ `reconcile(runtime, now)` has a production runtime whose four methods resolve live state and route
  effects through the composed adapters — the orchestrator's staleness guards operate on real API reads.
- _Shape:_ `read()` retains its full resolution (change request + context, evidence, receipts, capacity)
  internally and returns the canonical identity tuple; `reduce()` consumes the cached snapshot after asserting
  the tuple matches — preserving the orchestrator's read-then-reduce pairing. `permissionVersion` is a stable
  digest of the live-resolved author capability facts (actor identity + permission level), so
  permission-relevant movement flips the guard.

    - Build `test-first` (one behavior at a time):
        - `read()` assembles `CanonicalReconcileState` (head SHA, policy version, permission version, ledger
          version) from live API resolution, ignoring event-supplied values
        - `reduce()` uses the snapshot cached by the matching `read()`; a mismatched tuple fails closed
        - `permissionVersion` changes when the author's resolved permission changes, and only then
        - Current attestation-only policy reduces to `request: null`; with an enabled/qualified test policy,
          `execute()` runs `executeReservedRequest`'s reserve → confirm → invoke → acknowledge protocol through
          `CodeRabbitProviderAdapter`, including terminal-failure handling at the expected ledger version
        - Automatic requests set `actorIdentity` to policy `appBotUserId`; receipt `revalidate` authorizes that bot
          only through validated launch authority + current request identities, independent of PR-author permission
        - Fork/unknown PR authors do not block controller-authored reservation; wrong bot/current-state mismatch
          rejects the append. Human command/attestation writes retain live capability checks
        - `read()` includes canonical unreceipted command versions, degraded-ledger diagnostics, and any validated
          lifecycle-tail proof; `reduce()` applies commands and tail carry-forward before request/verdict reduction,
          and the effect stage executes at most the one admitted request selected for this ledger version
        - `publish()` delegates to the adapter's `publishVerdict()`

### `[ ]` **3.2 Shared infrastructure plus reconcile-specific factory**

- _Goal:_ Reconcile and attest share one validated infrastructure graph without pretending their runtime inputs or
  receipt authorization modes are identical; production clients are constructed once per entry through explicit
  returned shapes.

    - `[ ]` **3.2.a Build the shared infrastructure factory**
        - Inputs: repository owner/name + numeric id, PR number, App installation token, token-mint `app-slug`,
          expected App id, narrow git read token, and parsed policy — no context mode or dispatch actor.
        - Return launch authority; REST/GraphQL clients; argument-array authenticated `GitExec` + `baseRemote`;
          canonical change/policy resolver; `GitHostAdapter`; issue-comment API; and a receipt-store builder that
          requires an explicit controller- or human-revalidation strategy. Do not return a whole runtime.
        - Validate launch authority without `GET /app`: resolve `<app-slug>[bot]`, compare its immutable id to
          policy `appBotUserId`, and verify the installation token enumerates the current repository. Expected App
          id continues to pin authored checks/comments on readback; the App token never enters git transport.

    - `[ ]` **3.2.b Build the reconcile-specific factory**
        - Add required context mode, `GitHubRestCheckRunApi`/publisher, GitHub-backed `CodeRabbitApi`,
          `CodeRabbitProviderAdapter`, controller-authorized receipt store, command reader, and
          `ReconcileRuntime`. Policy keeps provider effects dormant until qualification enables them.
        - The controller store strategy authorizes policy `appBotUserId` only through launch authority/current
          identities; command receipts use the separately resolved human capability result.
    - Build `test-first` (one behavior at a time):
        - Shared factory returns the declared graph and cannot publish/invoke by itself
        - Reconcile factory requires context mode and yields a fully wired runtime (observable via injected fakes)
        - Missing/malformed shared or reconcile-only inputs fail closed before effects
        - Installation token never calls App-JWT-only endpoints; wrong slug/bot id or missing repository scope fails
        - Disabled policy exposes no provider effect; enabled/qualified policy wires the CodeRabbit boundary

### `[ ]` **3.3 `run-reconcile.ts` reconcile-branch rewrite — thin shell over exported main**

- _Goal:_ The `reconcile` operation actually reconciles: environment → factory → `reconcile()` → check write,
  with the shell holding nothing beyond input parsing and invocation (spec Decision 6; SC 1's shell clause).
- _Note:_ The workflow supplies the API inputs (`ARC_REPOSITORY_ID`, `ARC_PULL_REQUEST_NUMBER`,
  `ARC_REVIEW_GATE_APP_ID`, `REVIEW_GATE_CONTEXT_MODE`, `ARC_APP_TOKEN`, standard `GITHUB_REPOSITORY`). Add
  `ARC_APP_SLUG: ${{ steps.app-token.outputs.app-slug }}` as the pinned token-mint launch identity and
  `GITHUB_TOKEN: ${{ github.token }}` for git-transport fetches (the narrow read token; the job already holds
  `contents: read`). Pin both in the workflow integration test.

    - `[ ]` **3.3.a Export a dependency-injectable reconcile main** — module exporting a main that takes the
      environment record plus an injectable factory (production shell passes `process.env` and the real
      factory), runs `reconcile()`, and reports the `ReconcileResult` status.

    - `[ ]` **3.3.b Rewrite the shell** — replace the coordinate-echo stub in the `reconcile` branch with main
      invocation; discovery changes only through Task 3.5's bounded wake-up guards.

### `[ ]` **3.4 Reconcile e2e composition test (env → factory → runtime → `reconcile()` → check write)**

- _Goal:_ A test fails if the reconcile path regresses to non-emission: it drives the exported main against
  injected fakes and asserts a `review-gate-shadow` check is created/updated with truthful verdict content (SC 1).

    - Integration tier, beside `review-gate-workflows.test.ts`; fake the GitHub API boundary (reuse the
      `fetch-fake.ts` patterns from the unit host tests).
    - Assert shadow-mode emission end-to-end: check create on first run, convergent update on re-run, truthful
      pending conclusion under the attestation-only topology, and no provider request/effect. With a test policy
      enabling `coderabbit-pr`, assert generation-zero reserve/trigger/acknowledgement, then a pinned current-head
      approval yielding success while check-success alone stays pending.
    - Starting from clean CodeRabbit evidence and, separately, clean attested evidence at a substantive head, append
      a valid integration composition/sweep tail and assert the new exact-head projection stays successful with zero
      provider effect. Mutate one allowed class at a time into code/control/unrelated-WU/design-content or an
      unknown path/status and assert carry-forward fails closed; assert ROADMAP-only bookkeeping relies on final-head
      required checks rather than a historical-ref re-render inside the review predicate.
    - Drive authorized and unauthorized issue-comment commands through the same entry: exact command replay is
      inert; require/refresh admission, scoped waiver, and exact dismissal reach the published projection/receipt
      state. Drive a degraded ledger after an earlier green projection and assert the entry replaces it with failure.
    - Assert non-emission fails: a run that publishes nothing (or writes a wrong-named context) fails the test.

### `[ ]` **3.5 Wake-up guards — recursive self-check suppression and empty-candidate completion**

- _Goal:_ Wake-up discovery is bounded at both edges: controller-owned completed checks cannot recursively
  reconcile themselves, and a candidate-less wake-up completes quietly instead of failing the workflow run.
- _Context:_ The discover branch always writes `matrix={"include":[...]}`, even when empty; the reconcile
  job's `if` (`matrix != ''`) passes on that non-empty string, and matrix expansion over an empty `include`
  fails the run before any job is created. Diagnosed live 2026-07-11 — every wake-up with zero candidates
  fails and notifies.
- _Context:_ `review-gate.yml` subscribes to completed/rerequested `check_run` events. The shipped
  `isRecursiveControllerCheck` / `shouldHandleCheckRunEvent` helpers have no production caller, so publishing or
  updating the App's own `review-gate-shadow` / `merge-ok` check would otherwise trigger another reconcile
  indefinitely (spec Decision 4).

    - Before `normalizeWakeup` / candidate expansion, suppress only a completed controller-owned
      `review-gate-shadow` or `merge-ok` event whose immutable App id matches the configured expected App id;
      malformed, other-source, other-name, and rerequested events continue through the fail-closed/current-state
      path. Consolidate the duplicate helpers to one production rule rather than wiring divergent filters.
    - Emit the matrix output only when candidates exist; strengthen the reconcile job's condition in
      `review-gate.yml` to match (empty output → job skipped).
    - Build `test-first` (one behavior at a time):
        - Completed controller-owned shadow/final checks produce no candidate matrix
        - Same-name checks from another App, other check names, and rerequested events remain eligible wake-ups
        - Discover with zero candidates writes no matrix output
        - Discover with candidates writes the include matrix unchanged
        - The workflows integration test pins both the self-check suppression input and empty-guard condition

## **Phase 4:** Attest-path composition

_Purpose:_ Make the only enabled satisfying-evidence path live: rewrite `run-attest.ts` so an authenticated
dispatch appends a durable attestation receipt through the receipt store, with its own e2e composition test.

_Design decisions:_ `ingestAttestation` (`core/attestations.ts`) already owns validation, replay idempotency,
and receipt creation; the rewrite composes it with `GitHubCommentReceiptStore` under the attest workflow's App
token and resolves its `AttestationValidationContext` from live state. The receipt contract is corrected so the
validated normalized `Evidence` survives the process boundary and can be reduced by a later reconcile (spec
Decision 10); validation semantics do not change.

### `[ ]` **4.1 Persist authenticated normalized evidence in attestation receipts**

- _Goal:_ An authenticated App-comment receipt retains enough validated state to reconstruct coverage, findings,
  closures, and observation ordering exactly; reconciliation never mistakes a summary receipt for evidence.

    - Extend the receipt/envelope schema with an optional normalized `Evidence` payload allowed only for the
      attestation/unadmitted action; ordinary request lifecycle receipts carry none.
    - On parse, validate congruence between evidence and receipt request/result/reference/finding identities so a
      validly signed but internally inconsistent payload fails closed. Keep the bounded comment payload below the
      existing size limit.
    - Add a reducer that extracts evidence only from store-authenticated envelopes and feeds it into coverage,
      findings, requirement-state, and projection assembly.
    - Build `test-first` (one behavior at a time):
        - Full normalized evidence round-trips through receipt serialization/parsing unchanged
        - Missing evidence on an attestation receipt and evidence on an incompatible action fail closed
        - Request/evidence identity, result, reference, or finding mismatch fails closed
        - Authenticated extracted evidence satisfies coverage/findings reduction; a summary-only receipt cannot

### `[ ]` **4.2 `run-attest.ts` rewrite — validation + receipt-store append, thin shell over exported main**

- _Goal:_ An authenticated attest dispatch durably lands: context resolved live, manifest validated, receipt
  appended at the expected ledger version — replacing the 15-line echo stub.
- _Note:_ Workflow env is `ARC_APP_TOKEN` + `ARC_APP_SLUG` + `ARC_REVIEW_GATE_APP_ID` +
  `ARC_DISPATCH_ACTOR_ID` + narrow `GITHUB_TOKEN`; the PR number and attestation JSON arrive via the bounded
  `workflow_dispatch` event payload (`pull_request`, `payload` ≤ 16 KiB), not env. Uses Phase 3's shared graph
  through the attest-specific factory below; context mode/provider/publisher are not attest inputs.

    - `[ ]` **4.2.a Export a dependency-injectable attest main**
        - Add an attest-specific factory over Task 3.2.a's shared graph. Inputs add the dispatch actor login/id;
          outputs are canonical resolver, human-authorizing receipt store, and attestation dependencies only — no
          context mode, CodeRabbit provider, check publisher, or complete reconcile runtime.
        - Resolve the validation context: authenticated actor capabilities queried by the event payload's
          `sender.login` (addressing handle only) with `expectedActorId` = `ARC_DISPATCH_ACTOR_ID` failing
          closed on mismatch; the current change request + policy decision (yielding the requirement, the
          derived `acceptedReviewerClaims`, and `authorIdentity` as the PR author's numeric identity from the
          adapter's `ChangeContext` — the same identity space as `actorIdentity`); `usedRunIds` derived from
          prior receipts' `attestation:<runId>:` event-id prefixes; and the pinned enforcement fields (Phase 1).
        - Compose `ingestAttestation` with `GitHubCommentReceiptStore.appendReceipt`; surface the fail-closed
          diagnostic on validation failure and the replay case without a duplicate append. The attest store
          instance gets live `revalidate` / `stateExpected` implementations (write-time state + authorization
          re-check), never permissive stubs.
        - No direct reconcile call after the append: the App's receipt comment fires `issue_comment: created`,
          a `review-gate.yml` wake-up, and the gate check re-projects through the normal reconcile path.
        - Build `test-first` (one behavior at a time):
            - A valid manifest for the current change set appends exactly one receipt at the expected version
            - An exact replay returns the prior receipt without appending
            - A stale-scope, unaccepted-claim, or over-age manifest fails closed with the validator's diagnostic
            - A submitter below the required permission floor fails closed
            - A `sender.login` whose resolved numeric id mismatches `ARC_DISPATCH_ACTOR_ID` fails closed

    - `[ ]` **4.2.b Rewrite the shell and supply canonical-read inputs** — keep the existing bounded event-payload
      parsing (size caps, strict shape), then invoke the exported main; add the token-mint `app-slug` output and
      narrow `GITHUB_TOKEN: ${{ github.token }}` to the attest step. The workflows integration test pins both;
      no API-only or manifest-trusting resolver fallback is allowed.

### `[ ]` **4.3 Cross-path e2e test (dispatch → receipt → later reconcile → satisfied verdict)**

- _Goal:_ A test fails if either entry path or their durable handoff regresses: it drives the exported attest main,
  persists the receipt, starts a separate reconcile from store state, and observes a satisfied requirement and
  truthful shadow projection (SC 1).

    - Integration tier; fake the comment/API boundary; assert ledger version advances, the appended receipt carries
      normalized evidence, and a fresh runtime reads it into a `success` verdict/check.
    - Assert regressions fail: echo-only/no append, summary receipt without evidence, evidence not reloaded, or a
      reconcile that remains pending after valid attestation.

## **Phase 5:** Postmortem, guards, and record correction

_Purpose:_ Examine how an unfulfilled design intent shipped as "delivered", give the findings their authoritative
homes, align the review lifecycle vocabulary/triage contract before activation, and make the shipped docs true.

_Design decisions:_ Fold-in scope is capped at edits carrying no major-concern risk (spec Decision 7); the
process-improvements stub is the pressure valve. The clean `pre-merge` rename and `MINOR FIX` correction are
same-concern bounded exceptions settled by spec Decisions 18-19, not an invitation to broader method reform.

### `[ ]` **5.1 Record the refined postmortem findings**

- _Goal:_ The six-factor diagnosis is refined against the completed implementation experience and recorded
  durably as this WU's postmortem output — the ground truth the stub charter and guard dispositions cite.
- _Note:_ The findings' home is the notes companion's postmortem section, refined in place — not a new
  artifact.
- **Additional Context:** `notes-review-gate-reconcile-composition.md` § Postmortem working material

### `[ ]` **5.2 Scaffold the process-improvements backlog stub with rich charter**

- _Goal:_ A `backlog/` stub exists whose charter carries the process improvements with this WU's ground-level
  context — anchors, examples, the six-factor diagnosis — plus the sanctioned-follow-up-stub charter item with
  its industry-precedent research note, so the follow-on cannot repeat factor 6 (under-scoped, unowned).

    - Scaffold into `backlog/provisional/<slug>/` (`draft-*` + `meta-*`, `Class: [TBD]` — the charter carries
      an unresolved design question, so it grooms before it plans); slug chosen at execution.
    - Charter contents: the refined findings (5.1), the routed guard candidates (5.3), and the
      follow-up-stub-route design question.

### `[ ]` **5.3 Resolve and fold the critical-small guard set**

- _Goal:_ Each guard candidate has an explicit disposition — folded into this PR (critical-small, no
  major-concern risk) or routed to the stub with its context — and none is silently dropped (postmortem SC).
- **Additional Context:** `notes-review-gate-reconcile-composition.md` § Guard candidates

    - Assess the six candidates against the no-major-concern cap; record each disposition with a one-line
      rationale in the postmortem output.
    - Apply the fold-in edits for the accepted set; anything touching workflow/method semantics beyond the cap
      routes to the stub.

### `[ ]` **5.4 Rename the final lifecycle extension to `pre-merge` and align cutover activation**

- _Goal:_ The extension family names the final hook for its lifecycle event rather than one installed action, and
  the self-hosting runbook can activate/rollback the exact project hooks it actually uses.
- _Note:_ Clean forward rename only: ARC is pre-public-alpha and this repository is the only live consumer. No
  alias, updater migration, update guarantee, or compatibility note; completed historical artifacts remain
  historical.

    - Rename `system/extensions/pre-merge-review.md` → `pre-merge.md` in package and project copies with targeted
      Configurable edits, preserving the package placeholder and moving the project's inactive coordinator actions.
    - Cascade live product surfaces: extension declarations/fire points in `integrate-work-unit` and `run-errand`,
      extension README/configurability/session guidance, package classification/init recipe, reference inventories,
      project coordinator wording, and product-facing tests. Synthetic fixture names may stay arbitrary; no live
      non-historical product reference to `pre-merge-review` remains.
    - Update `.github/review-gate.md` checkpoint capture, cutover activation, explicit current-session invocation,
      rollback, and outage recovery to enable/disable `post-pr-open` + `pre-merge`. The project hooks remain inactive
      in this WU; the dependent cutover flips them only after shadow proof.
    - Verify package/project Configurable diffs retain only the intentional project `.actions` body and activation
      value; extend extension integrity, fresh-install/current-repository, and PR-open lifecycle tests for the
      renamed point. Do not add updater retirement behavior for unsupported pre-alpha installations.

### `[ ]` **5.5 Rename `SILENT FIX` review triage to `MINOR FIX`**

- _Goal:_ Every valid review finding has a neutral, explicit, documented disposition; low-impact nits remain concise
  without being framed as silent or overlapping material `FIX NOW` work.

    - Update package and project `review-triage` defaults to
      `FIX NOW | MINOR FIX | DEFER | REJECT`: materiality governs `FIX NOW`; valid low-impact safe-now work governs
      `MINOR FIX`; all dispositions are documented, with concise roll-up allowed for multiple self-evident minors.
    - Update `diff-review` and live reference surfaces/tests using the old enum. Preserve the Configurable override
      section exactly; do not redesign the broader review-method family.
    - Record a coordination capture for `review-method-family`, whose future charter currently assumes the old enum;
      do not edit that sibling WU's tracked planning artifacts from this branch.

### `[ ]` **5.6 Docs true-up — `TECHNICAL-OVERVIEW.md` verified true; ADR-028 gap-and-completion amendment**

- _Goal:_ The shipped record reads true at this boundary: `TECHNICAL-OVERVIEW.md` § Self-Hosting Review Gate
  describes the composed controller without claiming post-merge App emission or final cutover is already proven,
  and ADR-028 records the delivery gap, completion locus, and dependent live-proof owner (SC 10).

    - Verify each present-tense claim against the composed implementation; distinguish implemented from
      live-proven state. The cutover WU owns the final-architecture closeout update after its probes complete.
    - Author the ADR-028 amendment (dated, in the reserved section) — gap, discovery context, completion locus,
      and `review-gate-enforcement-cutover` as the live-proof/cutover owner.

### `[ ]` **5.7 Scaffold the dependent `review-gate-enforcement-cutover` work unit**

- _Goal:_ The post-merge work is an owned, dependency-linked WU rather than an assumed Errand or an impossible
  unchecked integration tail; it can start immediately after this composition PR merges (SC 12).

    - Create `backlog/planned/review-gate-enforcement-cutover/` with `meta-*` + rich `draft-*`: owner `andrew`,
      `Depends On: review-gate-reconcile-composition`, `Class: Heavy`, and the runbook-governed purpose. Regenerate
      `ROADMAP.md` in the same commit.
    - Carry the exact resume state from `notes-review-gate-reconcile-composition.md` § Cutover state: protected
      environment, variables/secret, `setup-before` checkpoint, disabled workflow, and authentication-probe entry.
    - Charter the full sequence: authentication probes; provider/evidence matrix; shadow → alias removal →
      qualification decision → dual → final; `post-pr-open` + `pre-merge` activation after shadow proof;
      checkpoint/rollback discipline; closeout PR; and the `finalize-parallelism` unpause condition.
    - Add a repository-rules checkpoint: snapshot rulesets/branch protection and verify the required review-gate
      check is the sole machine authority for CodeRabbit satisfaction. Remove any duplicate required CodeRabbit
      completion/native-current-head approval rule; qualify any retained human approval and stale-dismissal policy
      as a separate requirement that does not masquerade as controller coverage.
    - Document the CodeRabbit enforcement pattern and research-backed failure semantics:
        - Verify the tracked/resolved `reviews.request_changes_workflow` and exclusive `arc-review-gate` trigger;
          current-head `CHANGES_REQUESTED` blocks and `APPROVED` satisfies only after threads/error-mode checks clear;
          a prior approved/attested substantive head may satisfy the exact final head only through a verified
          lifecycle-bookkeeping-tail proof, with no second provider request
        - The `CodeRabbit` check is completion/wakeup only; success may include findings, rate-limit skips, or
          other non-clean outcomes and never satisfies independently
        - Missing applicable approval — including paused, rate-limited, skipped, oversized, stale, or ambiguous
          review state — remains pending/fails closed unless an earlier approval is bridged solely by a verified
          lifecycle tail; manual recovery may request `@coderabbitai full review`
        - Promote `coderabbit-pr` only if the live matrix passes; otherwise retain `coderabbit-cli` attestation
          and record the GitHub App path as non-satisfying

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` E2E composition tests drive both exported entry mains against fakes — shadow reconcile creates/updates a
  `review-gate-shadow` check with truthful verdict content; authenticated attest dispatch persists normalized
  evidence that a later reconcile consumes to satisfy the requirement — and each fails if either entry or the
  durable handoff regresses

- `[ ]` Entry shells contain no logic beyond input parsing and invocation

- `[ ]` Controller-owned completed checks are suppressed before discovery and candidate-less wake-ups complete
  quietly, regression-pinned in the workflows integration test

- `[ ]` The policy-pinned CodeRabbit bot's latest decisive applicable review maps `APPROVED` to clean and
  `CHANGES_REQUESTED` to native failure with no invalid empty-findings evidence; a current-head decision outranks a
  tail-start approval, while check-success alone and absent/stale/ambiguous review state remain pending

- `[ ]` A policy-qualified CodeRabbit request executes exactly once through label/full-review triggering and the
  receipt protocol; disabled policy is effect-free and stale/replayed/ambiguous delivery cannot duplicate a review

- `[ ]` Reconcile and attest both receive the narrow git read token; installation launch validation uses the pinned
  action's App slug + policy bot id without App-JWT-only endpoints, and controller receipts use the App bot actor

- `[ ]` Current-scope GitHub commands compose end to end: require/refresh admit correctly, waive affects only its
  requirement, dismiss closes only its named finding, and exact replay/stale/unauthorized input is effect-free

- `[ ]` Invalid or unavailable receipt state replaces any prior green check with a current failure projection and
  forbids writes until repaired

- `[ ]` Actor capability lookup carries login + immutable id, and reconcile/attest factories consume one shared
  validated graph without irrelevant inputs or divergent authorization

- `[ ]` Clean CodeRabbit or attested evidence at a substantive head carries across only a verified
  `lifecycle-bookkeeping-tail/v1` delta with no additional provider request; the exact WU operational/cohort/ROADMAP
  class is non-review-relevant, while every code/control/unrelated/design, mixed, spoofed, or ambiguous tail
  invalidates carry-forward

- `[ ]` Lifecycle-tail core contracts are storage-neutral and introduce no storage-mode/per-artifact axis; tracked
  `.arc/` classification is isolated to the current Git adapter and future materialized state is a no-tail case

- `[ ]` The final extension is `pre-merge` across package/project workflows, references, manifests, and tests;
  the cutover runbook activates and recovers `post-pr-open` + `pre-merge`, with no live product alias

- `[ ]` `review-triage` and `diff-review` expose `FIX NOW | MINOR FIX | DEFER | REJECT`, document every disposition,
  and keep the project override sections intact

- `[ ]` `TECHNICAL-OVERVIEW.md` distinguishes composed code from live-proven enforcement; ADR-028 records the
  delivery gap, completion locus, and dependent cutover owner

- `[ ]` Postmortem outputs delivered: recorded findings, scaffolded process-improvements stub with rich context,
  and every critical-small guard either landed in this PR or explicitly routed to the stub

- `[ ]` `review-gate-enforcement-cutover` is an owned Heavy WU depending on this WU, with runbook resume state,
  CodeRabbit request-changes probes/failure semantics, mode transitions, checkpoints, closeout, and unpause chartered

- `[ ]` The cutover charter audits repository rulesets/branch protection so no duplicate CodeRabbit completion or
  native current-head approval requirement defeats lifecycle-tail carry-forward; any human approval rule is explicit
  and separate

- `[ ]` All quality gates pass, including packaging assertions keeping the controller outside the published CLI

- `[ ]` Ready for integration
