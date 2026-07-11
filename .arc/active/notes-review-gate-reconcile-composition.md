# Notes: review-gate-reconcile-composition

## Contents

- [Cutover state](#cutover-state)
- [Composition gap map](#composition-gap-map)
- [Postmortem working material](#postmortem-working-material)
- [Guard candidates](#guard-candidates)

## Cutover state

The enforcement cutover (`.github/review-gate.md`) is subsumed as this WU's final phase (spec Decision 9).
Progress checkpoints, so any session can resume at the right runbook step:

**Done (2026-07-11, pre-WU — during the aborted "cutover errand" Setup):**

- `review-gate` environment protected: `deployment_branch_policy: {protected_branches: true,
  custom_branch_policies: false}`, branch-policy protection rule active.
- Repo variables set + verified: `ARC_REVIEW_GATE_APP_CLIENT_ID`, `ARC_REVIEW_GATE_APP_ID` (=4268856).
- Env-scoped secret set + verified (metadata only): `ARC_REVIEW_GATE_APP_PRIVATE_KEY` on `review-gate`.
  Credential mutations were operator-run; key file at `$HOME/dev/arc-review-gate-andrewrcr.private-key.pem`,
  mode 600. Never place key/client-id in agent commands, logs, or config.
- Checkpoint store: `$HOME/dev/arc-review-gate-checkpoints/` (outside the repo, per runbook);
  `setup-before/` holds the reviewed create-mode baseline (environment.http/json, variables.json,
  secrets.json, checks.json). Required checks at baseline: `merge-ok` @ `app_id: null`, `strict: false`.
- `REVIEW_GATE_CONTEXT_MODE` variable: **not yet set** (first set to `shadow` at cutover step 1).

**Blocked, resumes after this WU's PR merges:** the runbook's authentication probes (a `main` dispatch runs
`main`'s code, which is stubbed until then — the discovery that spawned this WU).

**Remaining sequence:** authentication probes → provider/evidence probe matrix rows exercisable in shadow →
Normal Cutover 1 (shadow pair required) → 2 (alias-removal PR) → 3 (qualification decision) → 4 (dual) →
5 (final + closeout PR). Every step: before-state compare → mutate → exact-head proof, per the runbook.

## Composition gap map

Verified 2026-07-11 against source (paths under `packages/arc-framework/src/scripts/review-gate/`).

**Exists, unit-tested, zero production callers (wire only):**

- `publishGateCheck` + `GitHubRestCheckRunApi` — check-run POST/PATCH with stale-writer guards, duplicate
  convergence, deterministic external id (`check-runs.ts:98, 245`)
- `GitHubCommentReceiptStore implements ReviewReceiptStore` (`hosts/github/receipt-store.ts:101`)
- `CodeRabbitProviderAdapter implements ReviewProviderAdapter` (`providers/coderabbit/adapter.ts:140`)
- Core reducers: `reduceRequirementState` (`core/requirement-state.ts:46`), `reduceGateVerdict`
  (`core/verdict.ts:54`), `renderGateProjection` (`core/projection.ts:25`), `admitAutomaticRequest` /
  `admitRefresh` / `admitAlternate` (`core/admission.ts:24, 55, 65`), `executeReservedRequest`
  (`core/request-execution.ts:37`), `resolveSelfHostingDecision` (`policy/self-hosting/decision.ts:37`)
- Orchestrator `reconcile(runtime, now)` with re-read staleness guards (`runtime/reconcile.ts:37`)
- `projectContexts` mode→context-name mapping, `parseContextMode` fail-safe-to-shadow (`runtime/rollout.ts`)
- Host leaf functions: `resolveChangeRequest` (`hosts/github/change-request.ts:77`),
  `resolveActorCapabilities` (`hosts/github/actor.ts:105`), native-review reduction
  (`hosts/github/native-review.ts`), `resolvePullRequestFacts` (`hosts/github/pull-request.ts:101`),
  `resolveCoverageIdentity` (`hosts/github/coverage.ts:198`)

**Missing (must be written):**

- A `GitHostAdapter` implementation (port: `core/ports.ts:46`) — no implementor anywhere; `publishVerdict()` in
  particular is unimplemented, so nothing connects a verdict to the check write
- The core reduce assembly — canonical state + evidence + receipts + policy → `ReconcileDecision`; the leaf
  reducers exist but the chaining function does not
- A `ReconcileRuntime` implementation (interface: `runtime/reconcile.ts:20`)
- A composition-root factory (REST/GraphQL clients are only ever constructed in tests)
- The `run-reconcile.ts:60-66` `reconcile` branch rewrite (currently prints
  `{repositoryId, pullRequestNumber, wakeup: true}` and exits; imports only `runtime/discovery.js` and
  `runtime/wakeup.js`)
- The `run-attest.ts` rewrite — currently a 15-line echo stub (validates dispatch payload JSON, writes it to
  stdout, appends nothing). Attestation ingestion is the only enabled satisfying-evidence path
  (`policy/self-hosting/schema.ts`: `codex-cli` / `claude-code` / `coderabbit-cli`,
  `transport: "authenticated-attestation"`), so without this rewrite the cutover stalls at the probe matrix
  ("Agent/human attestation" row) and no reviewed-lane PR can reach a satisfying verdict. Compose
  `core/attestations.ts` validation with `GitHubCommentReceiptStore` append under the attest workflow's App
  token. (Surfaced by adversarial pass 1, 2026-07-11.)
- `providerIdentities` App-bot-id field — shipped `schema.ts:52` pins only `coderabbitBotUserId`, but the
  shipped design pins "expected App and provider bot account ids" in the versioned policy document
  (shipped-spec § 2; `receipt-auth.ts:27-28` documents `expectedBotId` as "pinned in versioned policy"). Add
  the field + the operator-resolved value. (Surfaced by adversarial pass 1, 2026-07-11.)
- Attestation validation-context policy fields — `AttestationValidationContext`
  (`core/attestations.ts:20-29`) requires `acceptedReviewerClaims`, `acceptedRuntimeKinds`, and
  `maxRunAgeMinutes`; none has any production source. Per spec Decision 5: pin `acceptedRuntimeKinds` +
  `maxRunAgeMinutes` as policy fields; derive `acceptedReviewerClaims` from the enabled
  `authenticated-attestation` qualifications' `sourceIdentity` values (already hashed into `policy_version`).
  Note the fourth enabled attestation source: `qualified-non-author-human` (`schema.ts:124-126`,
  `sourceKind: "human"`). Attest workflow env is `ARC_APP_TOKEN` + `ARC_REVIEW_GATE_APP_ID` +
  `ARC_DISPATCH_ACTOR_ID` (`review-gate-attest.yml:44-47`); PR number + attestation JSON arrive via the
  `workflow_dispatch` event payload, not env. (Surfaced by adversarial pass 2, 2026-07-11.)

**Workflow env already supplied to the reconcile job** (`.github/workflows/review-gate.yml:82-88`):
`ARC_REPOSITORY_ID`, `ARC_PULL_REQUEST_NUMBER`, `ARC_REVIEW_GATE_APP_ID`, `REVIEW_GATE_CONTEXT_MODE`,
`ARC_APP_TOKEN` — plus standard `GITHUB_REPOSITORY`. Expectation: no YAML change needed.

**Test-space note:** `packages/arc-framework/__tests__/integration/review-gate-controller-contract.test.ts`
calls `reduceGateVerdict` and `discoverCandidates` directly — despite the name, it composes nothing; the unit
test for `runtime/reconcile.ts` uses inline `vi.fn` mocks for all four runtime methods. No executable
specification of the intended assembly exists.

## Postmortem working material

How "the design intent isn't fulfilled" survived heavy adversarial review at every planning stage, per-phase
implementation reviews, and dual-agent final verification. Six factors, each a distinct blind spot:

1. **Plan-space review cannot catch execution holes.** Adversarial review of draft/spec/tasks attacks the
   design and decomposition — it never executes anything. A sound plan reviewed hard still ships a stub if
   nothing downstream exercises the composed system.
2. **Phase-scoped diff review normalizes seams.** Task 5.3's diff (workflow trust shell + thin entry modules)
   is correct *for that phase*; the reviewer's frame is "composition lands elsewhere." No phase review owns the
   question "does the whole now work?"
3. **The stub was laundered by an intentional-sounding comment.** "Adapter composition is deliberately reached
   through validated numeric coordinates only" reads as a decision, not a TODO. Green tests + confident comment
   = a hole indistinguishable from a wall, for human and adversarial reviewers alike.
4. **"End-to-end" tests that aren't.** The controller-contract fixtures test integrated *reducers*, not the
   entry point; the name manufactured false confidence. No test would fail on total non-emission.
5. **Verification validated criteria, not intent — and the load-bearing criterion was unverifiable.** "The
   controller emits `review-gate-shadow`" was only provable with live App credentials that did not exist
   pre-cutover; it was waved through as delivered and written into TECHNICAL-OVERVIEW + ADR-028 as
   present-tense fact.
6. **The deferred remainder was nobody's deliverable.** The WU assumed a trivial "cutover errand" would close
   the intent; the cutover was scoped as configuration. The composition fell into the seam between a WU and an
   under-classified follow-on — mis-classifying the follow-on created the seam.

Unifying lesson: the process proved *every piece is correct* and *the plan is sound*, then wrote *"it is
delivered"* — but never proved *the composed system fulfills the intent*, and let the intent-proof defer into
an untracked, under-scoped follow-on.

## Guard candidates

Inputs to the postmortem phase — final disposition (fold inline vs. route to the process-improvements stub)
decided there under the critical-small cap.

1. **Intent-level verification:** a WU's success criteria must include at least one executable check that fails
   if the composed system misses the top-level intent; criteria provable only post-deploy are marked explicit
   deferred verification with a named forcing function and owner. (Candidate homes: `verify-work-unit`,
   `create-spec`.)
2. **Composition-seam test requirement:** the entry point / composition root gets a test that drives it
   end-to-end (fakes acceptable); "all units green" declared insufficient. (Candidate homes: `generate-tasks`,
   testing-standards method.)
3. **Stub-at-a-seam review hazard:** placeholder/"deliberately X only" comments at composition boundaries
   trigger a mandatory reviewer question — where is the real composition, and what test proves it? (Candidate
   homes: adversarial-review / review-method family.)
4. **Docs-delivery integrity:** present-tense "delivered" architecture claims require a passing check or an
   explicit intended-not-yet-verified marker. (Candidate homes: `verify-work-unit`, TECHNICAL-OVERVIEW
   trigger guidance.)
5. **Follow-on classification discipline:** a WU deferring part of its intent validates the follow-on's
   classification and specification at WU close; essential unproven intent never rides an "errand" assumption.
   (Candidate homes: `integrate-work-unit` / `verify-work-unit` close checks.)
6. **Sanctioned follow-up-stub route:** codify "a WU stubs out its follow-up with sufficient explicit,
   ground-level detail" as the norm for deferred intent (vs. thin inbox capture) — needs deliberate design plus
   industry-precedent research; charter item for the stub, not a fold-in.
