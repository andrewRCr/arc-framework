# Notes: review-gate-reconcile-composition

## Contents

- [Cutover state](#cutover-state)
- [Task 3.4 e2e coverage and deferrals](#task-34-e2e-coverage-and-deferrals)
- [Composition gap map](#composition-gap-map)
- [CodeRabbit enforcement research](#coderabbit-enforcement-research)
- [Storage forward-compatibility check](#storage-forward-compatibility-check)
- [Postmortem working material](#postmortem-working-material)
- [Guard candidates](#guard-candidates)

## Cutover state

The enforcement cutover (`.github/review-gate.md`) is owned by the dependent
`review-gate-enforcement-cutover` WU scaffolded by this WU (spec Decision 9). Progress checkpoints, so its first
session can resume at the right runbook step:

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

**Blocked, resumes in the dependent WU after this WU's PR merges:** the runbook's authentication probes (a `main`
dispatch runs `main`'s code, which is stubbed until then — the discovery that spawned this WU).

**Interim state (2026-07-11):** `review-gate.yml` is `disabled_manually` (`gh workflow disable`) to stop the
empty-candidate failure-notification spam (see § Composition gap map) while the fix rides this WU. Re-enable
(`gh workflow enable review-gate.yml`) as the first action of the authentication probes; a disabled workflow
refuses `workflow_dispatch`. `review-gate-wakeup.yml` and `review-gate-attest.yml` remain active.

**Remaining sequence:** authentication probes → provider/evidence probe matrix rows exercisable in shadow →
Normal Cutover 1 (shadow pair required) → 2 (alias-removal PR) → 3 (qualification decision) → 4 (dual) →
5 (final + closeout PR). After shadow proof, the cutover PR activates project `post-pr-open` + `pre-merge` and
explicitly coordinates its own possibly stale extension snapshot. Before promotion, a repository-rules checkpoint
removes any duplicate machine CodeRabbit requirement and qualifies retained human approval/stale-dismissal policy.
Every step follows before-state compare → mutate → exact-head proof per the runbook.

## Task 3.4 e2e coverage and deferrals

The reconcile e2e (`__tests__/integration/review-gate-reconcile-composition.test.ts` +
`.fakes.ts`) drives the real `createReconcileRuntime` factory through `runReconcileMain`, faking only the
`fetch` (URL/method-routing, order-tolerant) and git `exec` (subcommand-routing) boundaries over one stateful
in-memory GitHub world — so re-reads, receipt appends, and check create-then-update converge as production would.

**Covered:** shadow attestation-only run → `review-gate-shadow` check created `in_progress`/pending with no
provider effect; re-run converges (update, not duplicate); shadow projects only its own context (no `merge-ok`);
`coderabbit-pr`-enabled current-head `APPROVED` → `success`; degraded ledger (tampered receipt) → `failure`
replacing an earlier green check; authorized `require` command (comment → live capability read → projection)
flips a routine success to pending, an under-permissioned author is inert.

**Two deferrals, both intentional Phase-3 boundaries, not gaps — surfaced while authoring the e2e:**

1. **Lifecycle-tail carry-forward e2e → Phase 4 (Task 4.3).** `SelfHostingReconcileRuntime.resolveLifecycleTail`
   passes `reviewedThroughSha === currentHeadSha === changeRequest.headSha`, and `classifyTail` short-circuits to
   `null` when they are equal, so the composed reconcile path never produces a non-trivial tail. The prior
   reviewed head that would make a carry-forward observable comes only from recovered evidence, which Task 3.1
   explicitly deferred to Phase 4 (Task 4.1's evidence-extraction reducer). The carry-forward *mechanism* is built
   and unit-tested (Phase 2, Tasks 2.4/2.6); its live wiring — and the exact-head-stays-successful-across-tail
   assertions — belong to the Phase 4 cross-path e2e once evidence recovery lands, and to Phase 6 verification.
2. **CodeRabbit gen-0 acknowledgement is dormant by design.** The factory wires
   `CODERABBIT_SHADOW_CAPABILITIES` (`resolvedConfiguration: false`), so an enabled-`coderabbit-pr` gen-0 request
   *reserves* through the receipt protocol but `request()` throws `configuration-unresolved` before any label
   write → terminal-failure → the gate projects `failure` (fail-closed, not a false green). The e2e asserts this
   true dormant-boundary behavior (reserve happens, no acknowledgement). Live gen-0 label acknowledgement requires
   qualified capabilities the cutover WU proves; it is not drivable through the Phase-3 factory.

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
- Production construction for the shared infrastructure and entry-specific factories (REST/GraphQL clients are
  only ever constructed in tests)
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

- A CI-state reader — nothing in `hosts/` resolves `reduceGateVerdict`'s `ci.state`. Shipped-spec § 8 feeds CI
  in as `ci-ok` (emitted by `ci.yml` today; stable across the cutover — only the `merge-ok` alias is removed).
  Read the `ci-ok` check on the current head, source-filtered to the GitHub Actions App id (runbook-verified
  `15368`), mapped `pending`/`failure`/`success`. (Surfaced by the Phase 2 grounding audit, 2026-07-11.)
- Git-transport auth for lane/coverage — `resolveAutoLane` reads metas at refs and `resolveCoverageIdentity`
  fetches `refs/pull/<n>/head` from the base remote, but the repo is **private** (no anonymous fetch), the
  checkout is `persist-credentials: false`, and the App token is barred from git transport (runbook) with no
  contents permission anyway. The shipped spec's "narrow read token" is the workflow `GITHUB_TOKEN` — the
  reconcile step's env must add it (proven-missing YAML input per spec Decision 4). (Phase 2 audit, 2026-07-11.)
- The empty-candidate wake-up guard — `run-reconcile.ts:57` unconditionally writes
  `matrix={"include":[...]}`; `review-gate.yml:53`'s `if: needs.discover.outputs.matrix != ''` passes on the
  non-empty string, and expanding a zero-vector matrix fails the run before the reconcile job exists. With no
  open PRs, every schedule tick (`*/15`), non-PR `workflow_run`, and bare `status` event produces a failed run
  and a notification. Verified live 2026-07-11 (e.g. run 29163319470: `discover` success, run conclusion
  failure, no reconcile job; `gh pr list` empty). Fix rides the entry rewrite phase. (Surfaced by operator
  notification spam, 2026-07-11.)

- The recursive self-check wake-up guard — `review-gate.yml` subscribes to completed/rerequested `check_run`
  events; `runtime/wakeup.ts` normalizes every check event into candidates, while
  `isRecursiveControllerCheck` / `shouldHandleCheckRunEvent` have no production caller. Once composition emits
  `review-gate-shadow`, every controller update can wake another update indefinitely. Discovery must suppress a
  completed controller-owned `review-gate-shadow` / `merge-ok` before candidate expansion and regression-test
  other-source/name/rerequested events. (Adversarial review pass 1, 2026-07-11.)

- Durable attestation evidence — `ingestAttestation()` returns normalized `Evidence`, but the persisted
  `ReviewReceipt` retains only result/reference/finding ids. The next process cannot reconstruct coverage,
  findings, closures, or observation time; `unadmitted` receipts do not satisfy requirement state. Attestation
  receipts must carry congruence-validated normalized evidence, and the cross-path test must append then reconcile
  to success. (Adversarial review pass 1, 2026-07-11.)

- Native-review contract mismatch — `GitHostAdapter.observeNativeEvidence()` currently returns `Evidence[]`,
  while `reduceNativeReview()` produces the separate aggregate verdict block, peer approvals, and closures that
  `reduceGateVerdict()` needs. Correct the port to a host-neutral native-review result; never synthesize lossy
  independent-analysis evidence. (Adversarial review pass 1, 2026-07-11.)

- Provider construction/source topology — `CodeRabbitProviderAdapter` requires a `CodeRabbitApi`, but no
  production implementation exists. The trigger design is already settled and configured: tracked config enables
  request-changes, restricts automatic review to `arc-review-gate`, disables automatic incremental review, and the
  adapter selects label for generation zero / `@coderabbitai full review` for refresh. This WU implements the
  missing GitHub-backed API and factory/runtime wiring now, dormant behind the disabled `coderabbit-pr`
  declaration; the cutover WU owns only live qualification and activation. Hosted satisfaction reads the
  GitHub-native decisive review disposition (research below), not the completion check or reconstructed provider
  findings. (Adversarial review pass 1 + research, 2026-07-11.)

- Installation-token identity check — `verifyAppIdentity()` sends the workflow's installation access token to
  `GET /app`, but GitHub requires an App JWT for that endpoint. The pinned token-mint action already outputs the
  authenticated App slug. Replace the invalid probe with launch-authority validation: resolve
  `<app-slug>[bot]`, compare its immutable id to policy `appBotUserId`, verify repository scope through
  installation-token repository access, and retain expected App id as the authored check/comment source pin.
  Automatic controller receipts use `appBotUserId` as actor and a controller-specific revalidation branch; they
  never depend on PR-author collaborator permission. (Adversarial review pass 2, 2026-07-11.)

- Attest git transport — the attest main reuses canonical change resolution, which unconditionally fetches the
  trusted base and `refs/pull/<n>/head`. Its workflow disables persisted checkout credentials and currently omits
  `GITHUB_TOKEN`, so the private-repo fetch cannot succeed. Add the same narrow workflow token used by reconcile;
  pin both env additions in workflow tests. (Adversarial review pass 2, 2026-07-11.)

- Provider-disposition reduction seam — the native reader's CodeRabbit disposition must not bypass
  `reduceRequirementState` or remain an unconsumed parallel type. Only an enabled/qualified `coderabbit-pr`
  declaration licenses `APPROVED` at the current head or the start of a verified lifecycle tail to map into clean
  `Evidence` bound to the review's own change/policy/rubric (review node run id, durable URL). `CHANGES_REQUESTED`
  cannot map to a `findings` result without named finding records, so it produces no provider evidence; it remains
  a native-review failure while the requirement stays pending. Generic reviews map to no evidence. The existing
  coverage, findings, requirement, and projection reducers remain authoritative. (Adversarial review passes 2-3,
  2026-07-11.)

- Human-command composition — `issue_comment` wakes reconciliation, and strict parsers/authorization helpers
  exist, but no production path lists comments, constructs durable command-version identity, re-resolves actor
  capability, or reduces `require`, `waive`, `refresh`, and `dismiss` into receipts and gate state. Reconcile must
  bind addressing login to immutable user id, treat edits as new explicit versions, and make exact receipted
  replays inert. (Adversarial review pass 3, 2026-07-11.)

- Degraded receipt-state projection — current ledger inconsistency errors can abort before a new verdict is
  published, leaving an earlier green check visible. Receipt reads need a discriminated valid/degraded result;
  malformed, unexpectedly disappeared, forked/regressed, or unavailable state reduces to a current failure
  projection while all receipt writes remain forbidden. An initial empty ledger remains valid. (Adversarial
  review pass 3, 2026-07-11.)

- Actor addressing contract — GitHub capability lookup is login-addressed, but trust is numeric-id-bound. The
  port must accept `{ login, expectedActorId }`, resolve by login, and reject an immutable-id mismatch; callers
  cannot derive or cache a numeric-id-to-login guess. (Adversarial review pass 3, 2026-07-11.)

- Composition-factory shape — reconcile and attest need the same authenticated clients, canonical change reads,
  host adapter, and receipt-store construction, but not the same whole runtime or authorization strategy. Use a
  shared infrastructure factory plus separate reconcile and attest factories so neither entry receives irrelevant
  inputs or silently diverges on launch validation. (Adversarial review pass 3, 2026-07-11.)

- Final lifecycle bookkeeping invalidates exact-head evidence — `integrate-work-unit` composes completion content,
  sweeps WU artifacts, and regenerates ROADMAP only after initial review settlement. Those changes advance
  `head_sha` / `change_set_id`; the shipped coverage rule makes prior review stale, and the current CodeRabbit
  adapter rejects incremental requests, so final coordination would purchase another full review for bookkeeping.
  Add a closed, versioned lifecycle-tail proof that carries clean review/attestation authority only across the exact
  non-review-relevant WU/cohort/ROADMAP delta; any substantive or ambiguous tail fails closed. (Targeted workflow
  ownership sweep, 2026-07-11.)

- Review coordinator assumes normalized finding ids — `coordinate-pr-review.md` fetches only controller findings
  and offers `/review-gate dismiss` for every item. CodeRabbit's corrected model intentionally retains native
  comments/conversations without fabricating provider finding records. The coordinator must triage both surfaces,
  restrict dismissals to normalized ids, and use decisive review/conversation state for native closure. (Targeted
  workflow ownership sweep, 2026-07-11.)

- Final extension name describes an action, not its hook — `pre-merge-review` is the outlier in the lifecycle-event
  naming family and can host actions beyond review settlement. Cleanly rename the inactive Configurable point to
  `pre-merge` before cutover, cascade package/project workflows and live references/tests, and update runbook
  activation/rollback/recovery with no alias or migration layer. (Planning amendment, 2026-07-11.)

- Review triage contradicts its explicit-disposition contract — `SILENT FIX` makes documentation optional even
  though the method says no finding is silently ignored. Replace it with documented `MINOR FIX`, separate material
  `FIX NOW` from low-impact valid work, and permit concise grouped minor-fix reporting. (Planning amendment,
  2026-07-11.)

- Lifecycle-tail authorship is not observable from Git — a broad "integration-owned" allowance cannot distinguish
  intended composition from another edit on the same Markdown surface. Define the predicate as a closed
  review-relevance classifier instead: one reviewed WU identity, its exact operational companions, optional bound
  cohort closeout, byte-identical authored-design relocation, and ROADMAP. Final-head checks/hooks certify
  bookkeeping correctness; any other path/status fails closed. (Targeted adversarial pass, 2026-07-11.)

- Historical ROADMAP output is not reconstructible from the final PR head — the renderer combines a staged tree,
  then-local refs, and a pre-commit HEAD stamp, with an indeterminate warn-and-allow arm. The tail predicate must not
  pretend to re-render that historical snapshot. ROADMAP is a derived non-review-relevant path; final-head required
  checks and the lifecycle regen hook own correctness. (Targeted adversarial pass, 2026-07-11.)

- Configurable-file removal is deliberately retained by `arc update` — a clean rename cannot both promise update
  support and forbid migration behavior. This pre-public-alpha repository is the only supported live consumer, so
  the WU performs the current-repo rename and updates fresh-install/product tests only. It adds no updater retirement
  rule, alias, or migration note. (Targeted adversarial pass, 2026-07-11.)

- Duplicate host enforcement can nullify tail carry-forward — a required CodeRabbit completion check or native
  approval rule with current-head/stale-dismissal semantics would still block after bookkeeping. The cutover must
  audit rulesets/branch protection and make the required review-gate check the sole machine CodeRabbit authority;
  retained human approval remains explicit and orthogonal. (Targeted adversarial pass, 2026-07-11.)

**Workflow env gaps:** reconcile already receives `ARC_REPOSITORY_ID`, `ARC_PULL_REQUEST_NUMBER`,
`ARC_REVIEW_GATE_APP_ID`, `REVIEW_GATE_CONTEXT_MODE`, `ARC_APP_TOKEN`, and standard `GITHUB_REPOSITORY`; add the
token-mint `ARC_APP_SLUG` output and narrow `GITHUB_TOKEN`. Attest receives App id/token + dispatch actor; add the
same App slug and narrow git token because it reuses the canonical resolver.

**Test-space note:** `packages/arc-framework/__tests__/integration/review-gate-controller-contract.test.ts`
calls `reduceGateVerdict` and `discoverCandidates` directly — despite the name, it composes nothing; the unit
test for `runtime/reconcile.ts` uses inline `vi.fn` mocks for all four runtime methods. No executable
specification of the intended assembly exists.

## CodeRabbit enforcement research

Bounded external research on 2026-07-11 resolved the apparent mismatch between CodeRabbit's popularity as a
required reviewer and its weak completion check:

- CodeRabbit exposes two different GitHub signals. The `CodeRabbit` check reports processing completion; observed
  public runs conclude `success` both with actionable findings and when rate-limited/skipped. Requiring that check
  alone proves neither clean review nor complete coverage. GitHub also treats `skipped` / `neutral` required checks
  as acceptable, reinforcing the mismatch.
- CodeRabbit's documented enforcement path is `reviews.request_changes_workflow: true`: actionable findings submit
  `CHANGES_REQUESTED`; after CodeRabbit threads resolve and error-mode pre-merge checks clear, it submits
  `APPROVED`. CodeRabbit explicitly positions this as the required-reviewer workflow. This repository already has
  that setting enabled, with exclusive `arc-review-gate` label triggering and automatic incremental review off.
- Public repositories use the common pattern: automatic/incremental CodeRabbit reviews with request-changes
  workflow, one required approval, stale-review dismissal, and resolved threads. Public custom gates additionally
  read the latest decisive CodeRabbit review, ignore trailing `COMMENTED` noise, and publish their own stable status.
  ARC adopts the decisive-review behavior behind its controller check, but not a duplicate native current-head
  approval requirement: stale-dismissal would otherwise force another review for the allowed lifecycle tail.
- ARC should build on that native review disposition rather than parse the check as a clean result or reconstruct
  CodeRabbit's internal finding lifecycle. Bind the policy-pinned bot id and review `commit_id` to the current head
  or the reviewed-through head of a verified lifecycle tail: `APPROVED` → clean evidence; `CHANGES_REQUESTED` →
  native-review failure and no provider evidence; no applicable decisive review → pending. Check completion remains
  a wake-up/diagnostic only. Trigger transport remains
  valuable and belongs in this WU: the production API applies the configured label or posts the full-review
  command through the controller's receipt/idempotency protocol.
- Fail closed when auto/incremental review is paused, filtered, rate-limited, skipped, oversized, stale, or
  ambiguous. `@coderabbitai full review` is the manual recovery path. The dependent cutover WU proves these cases
  before enabling `coderabbit-pr`; `coderabbit-cli` attestation remains the satisfying fallback.

Primary references:

- CodeRabbit configuration: `https://docs.coderabbit.ai/reference/configuration#param-request-changes-workflow`
- CodeRabbit request-changes semantics: `https://docs.coderabbit.ai/reference/glossary#request-changes-workflow`
- Automatic/incremental controls: `https://docs.coderabbit.ai/configuration/auto-review`
- Pre-merge checks: `https://docs.coderabbit.ai/pr-reviews/pre-merge-checks`
- Review commands: `https://docs.coderabbit.ai/reference/review-commands`
- GitHub required-check semantics:
  `https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging`
- GitHub's pinned token-mint action outputs installation token, installation id, and App slug:
  `https://github.com/actions/create-github-app-token`
- GitHub App endpoints document that `GET /app` / authenticated-App installation lookup requires JWT and rejects
  installation access tokens: `https://docs.github.com/en/rest/apps/apps`

Public pattern evidence:

- `acgetchell/calendar-analyzer` enables request-changes and uses a ruleset requiring CodeRabbit status, one
  approval, stale-review dismissal, and resolved threads:
  `https://github.com/acgetchell/calendar-analyzer/blob/main/.coderabbit.yml`
- A custom latest-decisive-review gate:
  `https://github.com/kimjhyun0627/getit-9th-mentoring/blob/main/.github/workflows/coderabbit-approval-gate.yml`

## Storage forward-compatibility check

Checked 2026-07-11 against `strategy-storage-evolution.md` and the `draft-arc-backend.md` north star.

The future materialized-git-backing-store model moves operational state (`meta-*`, `tasks-*`, notes, ROADMAP) out
of the code repository. Those lifecycle writes therefore stop advancing the PR head, eliminating the common
bookkeeping-tail case rather than requiring permanent special treatment. The current in-repo tier still needs a
safe bridge until that architecture exists.

Forward-compatible boundary:

- Core consumes a host/storage-neutral `LifecycleTailProof` plus the versioned predicate id. It does not inspect
  `.arc/` paths, infer WU identity from branch names, or branch on `pm.mode` / storage configuration.
- The current Git adapter owns `lifecycle-bookkeeping-tail/v1`: exact reviewed-head → current-head diff, one
  already-reviewed WU artifact identity, archive-phase meta/task edits, notes cleanup, byte-identical relocation of
  all other companions, bound cohort closeout, and the derived ROADMAP path. It classifies review relevance rather
  than author provenance or bookkeeping correctness; final-head checks/hooks own the latter. Unknown, mixed, and
  substantive surfaces fail.
- Under materialized storage, operational-state updates use their own version-checked backing-store writes and
  heal/reconcile contract. Because the code head does not move, review reduction sees no tail; cross-repo state
  freshness is not encoded as review evidence.
- `storage.track_design_docs` remains the one authored-design knob. Tracked relocation may qualify; late content
  mutation does not. No per-artifact flags or new storage axis enter review policy.
- The final `pre-merge` hook remains useful in every storage tier: it validates the exact code head, native review,
  conversations, and any adapter-supplied tail proof without assuming that validation must invoke a provider.

This WU implements only the current Git adapter and neutral core contract. It neither pulls the backing store
forward nor adds backend-specific behavior.

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
