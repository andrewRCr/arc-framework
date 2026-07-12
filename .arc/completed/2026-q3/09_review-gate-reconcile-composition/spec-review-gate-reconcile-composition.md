# Spec (`outline`): review-gate-reconcile-composition

- **Origin:** [internal]

- **Purpose:** Compose the shipped review-gate library into the live controller entry points — reconcile *and*
  attestation — so the shadow gate can emit `review-gate-shadow` and authenticated attestation evidence survives
  into the next reconciliation; prove the composed whole against the design intent with cross-path tests; then
  hand the post-merge enforcement cutover to an explicitly owned dependent work unit. A postmortem phase examines
  how an unfulfilled design intent shipped as "delivered" and routes the process guards.

---

## Problem / Context

`reviewed-lane-review-gate` (PR #224) shipped a complete, unit-tested review-gate library — core reducers, GitHub
host pieces, receipt store, CodeRabbit adapter, the `reconcile()` orchestrator, and the check-run writer — plus the
workflow trust shell (`review-gate.yml` discovery/token-mint/environment binding). `TECHNICAL-OVERVIEW.md`
§ Self-Hosting Review Gate states the delivered mode as fact — "the controller emits `review-gate-shadow`" — and
ADR-028 records the composed-gate decision cluster as accepted. It does not emit. The `reconcile` operation in
`run-reconcile.ts` is a stub that validates numeric coordinates and prints them; `run-attest.ts` echoes validated
payload JSON without appending anything to any receipt ledger — and authenticated attestations are the *only
enabled satisfying evidence sources* in the shipped policy (`codex-cli` / `claude-code` / `coderabbit-cli` /
`qualified-non-author-human`, all `transport: "authenticated-attestation"`), so both authoritative paths are
dead. No production code implements
the `GitHostAdapter` or `ReconcileRuntime` ports, no composition root exists, and nothing calls
`publishGateCheck` — the library has zero production consumers above the leaf level. No test would fail if the
entry points emitted nothing, because no test drives their composition; the "controller contract" fixtures call
leaf reducers directly.

Discovered 2026-07-11 during the enforcement-cutover Setup (`.github/review-gate.md`): the authentication probe
requires proving the emitted check's App source, and nothing emits. The entire cutover — and the paused work
gated on it (`finalize-parallelism`) — is blocked until composition lands and shadow emission is live-proven.

## Decisions

1. **Compose to the existing intent and correct audited contract gaps here.** The shipped spec's § 8
   (reconciliation semantics, conclusion mapping, identity pinning), § 12 (shadow rollout), and ADR-028 fix the
   intended behavior. Most code is assembly of tested units; adversarial review proved the production contracts
   incomplete across native-review transport, durable attestation evidence, CodeRabbit triggering/disposition,
   launch authority, human commands, degraded receipt state, entry-specific construction, and final-head lifecycle
   bookkeeping. Decisions 10-21 settle those corrections before implementation rather than improvising at the seam.
2. **Shadow runs the full pipeline; projection differs by name only.** Per shipped-spec § 12 ("Emit
   `review-gate-shadow`; do not emit controller-owned `merge-ok`") and `rollout.ts` (`projectContexts` — "Change
   only context names; verdict content remains identical"). No shadow-specific suppression of receipts, provider
   admission, or verdict content is designed in.
3. **`read()` re-resolves canonical state from the API.** Events (including dispatched `head_sha`) are wake-up
   hints, never trusted snapshots (shipped-spec § 8). The runtime resolves the current change set live; stale
   writers are stopped by the orchestrator's existing guards plus `publishGateCheck`'s current-state assert.
4. **New production units are exactly the gap map's missing layer, across both entry points:** a
   `GitHostAdapter` implementation composing the `hosts/github/*` leaf functions — including `publishVerdict()`
   → `projectContexts(mode, …)` → `publishGateCheck` (the load-bearing missing link) and a corrected host-neutral
   native-review result contract carrying the verdict block, peer approvals, and finding closures; strict human
   command ingestion/reduction over GitHub issue comments; the core reduce
   assembly (self-hosting policy decision → admission → requirement state → `reduceGateVerdict` →
   `renderGateProjection` — the policy decision first, since it produces the requirements admission consumes);
   degraded receipt-state failure projection; a host/storage-neutral lifecycle-tail proof with a current in-repo
   Git implementation; a `ReconcileRuntime` implementation; a shared infrastructure
   factory taking repository/PR coordinates, App token/slug/id pins, narrow git token, and policy, with separate
   reconcile and attest factories adding only their own runtime and authorization inputs; the `run-reconcile.ts`
   `reconcile`-branch rewrite to build its runtime and call `reconcile()`; and the `run-attest.ts` rewrite to
   compose attestation validation (`core/attestations.ts`) with the receipt store so an authenticated dispatch
   appends a durable attestation receipt containing the normalized evidence the next reconcile can recover. Each
   workflow supplies the base coordinates for its rewrite — reconcile via
   env (`ARC_APP_TOKEN`, `ARC_APP_SLUG`, `ARC_REVIEW_GATE_APP_ID`, `REVIEW_GATE_CONTEXT_MODE`, numeric
   coordinates, narrow `GITHUB_TOKEN`, plus standard `GITHUB_REPOSITORY`); attest via `ARC_APP_TOKEN`,
   `ARC_APP_SLUG`, `ARC_REVIEW_GATE_APP_ID`, narrow `GITHUB_TOKEN`,
   `ARC_DISPATCH_ACTOR_ID` (the authenticated submitter identity the validation consumes), and the
   `workflow_dispatch` event payload carrying the PR number and attestation JSON. Both workflows add the token
   mint's authenticated `app-slug` output and the narrow workflow read token (`GITHUB_TOKEN`): their shared
   canonical change resolver performs lane meta-reads and the trusted coverage fetch; the repo is private, so no
   anonymous path exists, and the App token never enters git transport by design. Two wake-up fixes are also
   required. First, discovery must suppress the controller App's own completed `review-gate-shadow` / `merge-ok`
   check events before candidate expansion; the shipped self-check
   helpers exist but have no production caller, so emission would otherwise recurse indefinitely. Second,
   discovery emits an empty `include` matrix on every candidate-less wake-up (the
   15-minute schedule sweep chief among them), the reconcile job's `matrix != ''` condition passes on that
   non-empty string, and empty-matrix expansion fails the run — a failure notification every tick (diagnosed
   live 2026-07-11). The discover output and the job condition are corrected so a no-candidate wake-up
   completes quietly.
5. **Identity and attestation-enforcement values are pinned in the versioned policy document.** The App-bot
   user id lands beside `coderabbitBotUserId` in `providerIdentities` — per the shipped design
   (`policy_version` hashes "pinned expected App and provider bot account ids", shipped-spec § 2;
   `receipt-auth.ts` documents `expectedBotId` as "pinned in versioned policy"). The attestation validation
   context's enforcement values get the same treatment: `acceptedRuntimeKinds` (source identity → accepted
   runtime kind) and `maxRunAgeMinutes` become pinned policy fields, while `acceptedReviewerClaims` is
   *derived* from the policy's enabled `authenticated-attestation` qualifications (their `sourceIdentity`
   values) — already inside `policy_version`, so no duplication. The shipped `schema.ts` lacks all of these
   fields — further delivery gaps this WU closes. The operator resolves the bot account id once; everything
   lands as one reviewed policy edit (legitimately changing `policy_version` pre-live, safe because the
   reducers and receipt store have zero production callers yet); no dynamic lookup, no new operator-pinned
   variables.
6. **Verification proves the composed whole, not just the parts** (dogfooding the postmortem's central lesson):
   entry files become thin shells over exported, dependency-injectable mains, and end-to-end composition tests
   drive the exported mains (env → factory → runtime → `reconcile()` → check write; dispatch payload →
   validation → receipt append → later reconcile → satisfied requirement) against injected fakes — failing if
   either path stops emitting or if persisted attestation evidence cannot affect the next verdict. The shells
   carry no logic beyond input parsing (environment and, for attest, the bounded dispatch event payload) and
   invocation. The live criterion — a real `review-gate-shadow` check from a `main` dispatch — belongs to the
   dependent cutover WU because it is only provable after this WU merges. This WU verifies the executable
   composition and the durable handoff; it does not mark an owned future cutover result as deferred completion.
7. **The postmortem is a dedicated phase, and its findings get an authoritative home.** Findings are recorded in
   this WU (postmortem phase output), and a new `backlog/` stub is scaffolded whose charter is the process
   improvements — written rich, with this WU's ground-level context (anchors, examples, the six-factor
   diagnosis). Only critical-small guards fold into this WU directly; the fold-in set is finalized during the
   postmortem phase, capped at edits that carry no major-concern risk. The "sanctioned follow-up-stub route"
   question itself joins the stub's charter (with an industry-precedent research note) rather than being
   codified here.
8. **Docs distinguish composed code from live-proven enforcement.** This WU corrects
   `TECHNICAL-OVERVIEW.md` so its claims are true of the merged composition without claiming that post-merge App
   emission or final cutover has already been proven. ADR-028 receives a dated amendment recording the missing
   composition layer, its completion locus, and the dependent live-proof owner. The cutover WU's closeout PR
   updates the overview to the proven final architecture after the live sequence completes.
9. **The enforcement cutover is a dependent WU, never an Errand or an integration tail.** ARC integration starts
   only after every task is complete and closes a merged WU; it cannot truthfully retain an unchecked post-merge
   phase. This WU therefore scaffolds `review-gate-enforcement-cutover` as an explicitly owned, spec-worthy,
   multi-session work unit depending on `review-gate-reconcile-composition`. Its charter carries the existing
   runbook state, authentication probes, provider/evidence matrix, mode transitions, checkpoint discipline, and
   closeout PR. Cutover Setup is already partially complete (recorded in the notes companion): protected
   environment, variables/secret, and the reviewed `setup-before` checkpoint baseline landed 2026-07-11; the
   dependent WU resumes at the authentication probes immediately after this WU merges.
10. **Authenticated evidence is stored, not summarized away.** `ingestAttestation()` produces normalized
    `Evidence`, while the current receipt schema retains too little to reconstruct coverage, finding history,
    closures, or observation time. Attestation receipts therefore carry the validated normalized evidence inside
    the authenticated App-comment envelope, with receipt/evidence identity congruence validated on parse. Normal
    request receipts carry no evidence. Reconcile reads the authenticated envelopes and feeds the recovered
    evidence into coverage, findings, requirement-state, and projection reduction.
11. **The provider boundary is implemented now and activated only by qualified policy.** Every currently enabled
    satisfying source is `authenticated-attestation`, so today's policy emits no provider request. This WU still
    completes the dormant production `CodeRabbitApi`, constructs `CodeRabbitProviderAdapter`, and wires
    `executeReservedRequest` end to end: generation zero applies the exclusive `arc-review-gate` label and removes
    it after acknowledgement; refresh posts `@coderabbitai full review`; stale/replayed state never triggers; and
    ambiguous delivery is terminal rather than retried. The source becomes invokable only when its policy
    declaration is enabled and live qualification proves the resolved trigger configuration. Automatic selection
    requires exactly one enabled, qualified, machine-invokable source; zero stays pending and multiple fail closed
    rather than choosing. Implementation is this WU's concern; only the post-merge evidence and policy flip belong
    to the cutover WU.
12. **CodeRabbit enforcement uses its GitHub review disposition, not its completion check.** CodeRabbit's
    documented `request_changes_workflow` is the native required-reviewer contract: actionable findings produce
    `CHANGES_REQUESTED`; resolving its threads and error-mode pre-merge checks produces `APPROVED`. Its separate
    `CodeRabbit` check means only that processing finished — findings, rate-limit skips, and other non-clean
    outcomes may still conclude `success` — so it is a wake-up/diagnostic signal, never clean evidence. The host
    adapter reads the latest decisive review from the policy-pinned bot id, binds its `commit_id` to the current
    head or a candidate lifecycle-tail start, ignores trailing `COMMENTED` noise, and normalizes
    `APPROVED` / `CHANGES_REQUESTED` / absent-applicable into a host-native provider disposition. A decisive current
    head always outranks a prior tail-start approval. Only an enabled, qualified `coderabbit-pr` declaration
    licenses policy-specific normalization into `Evidence` bound to the review's own commit/change identities, with
    the review node id as run identity, its durable URL, and `APPROVED` → `clean`. `CHANGES_REQUESTED` produces no
    provider `Evidence` because the evidence schema correctly requires named finding records for a `findings`
    result; it remains a native requested-changes failure while the requirement stays pending. Generic native
    review never becomes independent-analysis evidence. Current policy keeps `coderabbit-pr` disabled while this
    path burns in; `coderabbit-cli` remains satisfying through authenticated attestation. The dependent cutover WU
    verifies the tracked and resolved `request_changes_workflow` + exclusive-label configuration, probes
    approval/findings, stale-head, paused/rate-limited, skipped, and oversized cases, and may promote
    `coderabbit-pr` only when all
    qualification checks pass. The production `CodeRabbitApi` owns trigger transport and GitHub observation;
    GitHub's decisive review state owns satisfaction. No provider-issued finding lifecycle or structured quota
    guarantee is claimed — unobservable capacity stays `unknown`, and request idempotency comes from the
    controller's receipt protocol.
13. **Installation authority and controller-authored receipts use one explicit launch contract.** The workflows
    mint installation access tokens; GitHub's `GET /app` endpoint requires an App JWT and cannot verify those
    tokens. The pinned `actions/create-github-app-token` step instead supplies its authenticated `app-slug` output
    alongside the token. Runtime launch validation resolves `<app-slug>[bot]`, requires its immutable numeric id
    to equal policy `appBotUserId`, and verifies repository scope through installation-token repository access;
    expected numeric App id remains the source pin for authored checks/comments. Automatic controller requests
    and their receipts use `appBotUserId` as `actorIdentity`; receipt revalidation authorizes that bot only through
    the validated launch authority and current request identities, never through human collaborator permission.
    Human commands/attestations retain live capability checks. Fork authors therefore do not accidentally govern
    whether the controller can author its own reservation.
14. **Human commands are a first-class composition path.** Reconcile queries current PR issue comments and reduces
    strict `/review-gate require|waive|refresh|dismiss` commands by durable comment-version identity (comment node
    id + host update time + body digest). It binds the comment's addressing login to its immutable numeric actor id,
    re-resolves live capabilities, authorizes current change/policy/rubric scope, and ignores an exact receipted
    replay. `require` adds a `required` receipt/override then evaluates generation zero; `refresh` enters the normal
    reservation/effect protocol; `waive` supplies current requirement waiver; `dismiss` closes exactly the named
    source/finding pair through a receipt-aware findings reduction. Edits are new explicit command versions and do
    not erase earlier effects. Unknown, stale, malformed, unauthorized, or cross-source commands author nothing.
15. **Receipt-state corruption publishes failure instead of preserving a stale green check.** Receipt reads return
    a discriminated valid/degraded result rather than throwing away every diagnostic. Malformed/edited records,
    anchor disagreement, ledger fork/regression, disappearance, and unavailable reads map to stable inconsistency
    codes; the degraded snapshot carries a nullable observed ledger version and no trusted receipts. Reconcile still
    resolves current host/policy state, reduces a failure projection, and attempts to replace the prior check. Writes
    remain forbidden until the ledger is valid; a check-write outage is surfaced as the final independent failure.
16. **Reconcile and attest share infrastructure, not a mismatched whole-runtime factory.** One shared factory takes
    repository/PR coordinates, App token/slug/id pins, narrow git token, and policy to build launch authority,
    REST/GraphQL/git clients, canonical change resolution, host adapter, and a receipt-store builder. A reconcile
    factory adds context mode, provider adapter, publisher, and controller-authorized store; an attest factory adds
    dispatch actor context and the human-authorizing store, with no context mode or provider/publisher dependency.
    Both consume the same validated launch and canonical-read implementation.
17. **A verified lifecycle-bookkeeping tail carries review authority without another provider request.** The
    integration ceremony's completion composition, artifact sweep, and ROADMAP regeneration must not spend another
    independent review merely because they advance the PR head. A requirement is current when qualifying clean
    evidence covers the head directly, or when it ends at `reviewedThroughSha` and a valid `LifecycleTailProof`
    extends that authority to the current head under the versioned `lifecycle-bookkeeping-tail/v1` predicate. The
    proof is not review evidence and cannot close findings; it only establishes that no review-relevant surface
    changed after the reviewed head. The current Git implementation validates the exact
    `reviewedThroughSha..headSha` delta against a closed observable contract: base ref, diff base, policy, rubric,
    and source identity are unchanged; the reviewed meta establishes one WU artifact identity and optional cohort
    path; that WU's `meta-*` and `tasks-*` may receive archive-phase edits plus `active/` → `completed/` relocation,
    its `notes-*` may additionally be deleted, and every other same-slug companion may relocate only
    byte-identically; final-member cohort documents bound by the reviewed cohort path may receive the documented
    closeout and relocation; and `.arc/backlog/ROADMAP.md` may change as the derived lifecycle view. Every other path
    or status, including code, control surfaces, unrelated WUs, or authored-design mutation, rejects the proof. This
    predicate classifies review relevance; it does not claim that an agent was "integration-owned" or re-certify
    bookkeeping content.
    Final-head required checks and lifecycle hooks own structural and ROADMAP correctness. Failure or ambiguity
    returns to ordinary pending/failure semantics and may require fresh review. A behind-base merge or any
    review-driven fix to a review-relevant surface is never bookkeeping.
18. **The final lifecycle hook is `pre-merge`, not `pre-merge-review`.** Extension names describe hook points, not
    installed actions. This WU cleanly renames the inactive Configurable extension in package and project surfaces,
    updates `integrate-work-unit` / `run-errand` fire points and the live reference/test cascade, and moves this
    project's coordinator action to `pre-merge.actions`. The project action remains inactive until the dependent
    cutover WU enables `post-pr-open` and `pre-merge` after shadow proof; the runbook's snapshot, activation,
    rollback, and recovery instructions use those names. ARC is pre-public-alpha with no external migration
    contract, so no compatibility alias or updater migration path is introduced.
19. **Review triage names minor valid work without making it silent.** The source-neutral disposition set becomes
    `FIX NOW | MINOR FIX | DEFER | REJECT`. `FIX NOW` is material and must be corrected before proceeding;
    `MINOR FIX` is a valid low-impact nit/polish safely corrected now; `DEFER` is valid but deliberately later;
    `REJECT` is invalid, misunderstood, conflicting, or outside the review obligation. Every disposition remains
    explicit and documented; multiple self-evident minor fixes may be rolled up concisely. This WU updates the
    configurable method, its `diff-review` consumer, and live references without redesigning the review-method
    family.
20. **Lifecycle-tail proof is a current-storage adapter, not a permanent tracked-`.arc/` assumption.** Core consumes
    the host/storage-neutral proof and versioned predicate id; it never inspects `.arc/` paths or branches on
    `pm.mode` / storage mode. The in-repo Git adapter owns today's path/content proof. Under the future
    materialized-git-backing-store model, operational-state writes do not advance the code PR head, so the proof
    collapses to no tail while the backing store independently enforces version-checked writes and heal/reconcile.
    `storage.track_design_docs` remains the single authored-design knob: a tracked design relocation may qualify,
    but a late content mutation does not. No per-artifact flag, new storage axis, branch-coupled WU identity, or
    backend implementation is pulled into this WU.
21. **Cutover makes the controller check the sole machine authority for CodeRabbit satisfaction.** A separate
    required CodeRabbit completion check or native current-head approval rule would defeat lifecycle-tail
    carry-forward even when the controller correctly proves that no review-relevant surface changed. The dependent
    cutover therefore snapshots repository rulesets and branch protection, removes any duplicate CodeRabbit
    requirement, and qualifies native approval/stale-dismissal settings explicitly. Human approval may remain as a
    separate repository policy, but its current-head semantics are not silently attributed to CodeRabbit or the
    controller. The required review-gate check remains the one machine-enforced CodeRabbit contract.

## Scope boundary (No-gos)

- **The cutover is scaffolded here and executed by its dependent WU under the runbook.** This WU owns a durable,
  explicitly assigned handoff rather than an assumed follow-on; `.github/review-gate.md` owns *how* — every
  required-status-check mutation, mode transition, probe, checkpoint compare, and rollback follows the runbook
  verbatim, including its credential-handling constraint (operator-held key and client-id; never in agent
  commands, logs, or config). The composition semantics are fixed here; the dependent WU makes only the runbook's
  evidence-backed activation decisions.
- **No provider qualification activation in this composition WU.** `coderabbit-pr` remains non-satisfying
  (ADR-028 Decision 4); `coderabbit-cli` remains satisfying through authenticated attestation. The dormant
  production trigger/observation boundary lands here, while the dependent cutover WU may enable the declaration
  only after the runbook's live probes pass.
- **No published-CLI surface changes.** Controller code stays repo-local `tsx` input; the shipped packaging
  assertions (controller excluded from the npm package) must keep passing.
- **No broad ARC methodology reform.** Postmortem-driven workflow/method edits beyond the critical-small set
  route to the new backlog stub, not this PR. The `pre-merge` vocabulary correction and `MINOR FIX` triage cleanup
  are the explicitly bounded same-concern exceptions in Decisions 18-19.
- **No adapter productization.** This WU completes the repository-local provider boundary only. Cross-project
  productization remains `review-gate-github-adapter` (captured in USER-INBOX), gated on the live cutover.

## Consequences & Risks

- **Authoritative gate code lands as one WU.** Accepted: shadow is non-required through the whole window (CI
  `merge-ok` stays the sole required check), so a composition bug is visible, not merge-blocking. Mitigations:
  incremental build with per-increment review, the e2e composition test, independent adversarial review before
  PR, and the live probe before promotion.
- **The reduce assembly is the semantic risk center** — chaining reducers whose fixtures were only ever exercised
  in isolation. Mitigation: assemble strictly to shipped-spec § 8's conclusion mapping (pending/failure/success),
  reuse the unit fixtures' semantics, and target the adversarial pass at the assembly seams.
- **Live proof arrives only post-merge** (a `main` dispatch runs `main`'s code). The dependent cutover WU owns that
  proof and starts at the authentication probes immediately after this WU merges; this WU's own verification stays
  truthful and terminal.
- **Postmortem fold-in scope creep** is a real temptation. Capped by Decision 7; the stub is the pressure valve.
- **CodeRabbit PR authority is intentionally burn-in-gated, not deferred behind a new adapter.** Normal App
  reviews continue while `coderabbit-pr` is advisory; satisfying CodeRabbit evidence still has the
  `coderabbit-cli` attestation path. The cutover can promote the GitHub App path once its current-head decisive
  review behavior passes the live matrix. The gate deliberately stays pending on a missing applicable approval,
  including pause, rate-limit, skip, and oversize cases; the sole prior-head exception is a verified lifecycle tail.
  Requiring the `CodeRabbit` check directly would falsely accept successful-completion states.

## Success Criteria

1. End-to-end composition tests drive both exported entry mains against fakes: a shadow-mode reconcile run
   creates/updates a `review-gate-shadow` check with truthful verdict content, and an authenticated attest
   dispatch appends durable normalized evidence that a later reconcile consumes to satisfy the requirement. Each
   test fails if its entry path regresses to non-emission or if the attest-to-reconcile handoff loses evidence; the
   shells contain no logic beyond input parsing and invocation.
2. Full quality gates pass: existing unit suite (updates justified per-case), typecheck/lint, build, and the
   packaging assertions proving the controller remains outside the published CLI.
3. A controller-owned completed check event is suppressed before candidate expansion, and a candidate-less wake-up
   completes quietly; regression tests prove neither path can recurse or fail from an empty matrix.
4. The GitHub adapter reduces only a policy-pinned CodeRabbit bot's latest decisive review at the current head or
   at the start of a verified lifecycle-bookkeeping tail: `APPROVED` → clean evidence; `CHANGES_REQUESTED` → native
   failure with no fabricated provider evidence; absent/stale/ambiguous → pending. The `CodeRabbit` check cannot
   independently satisfy a requirement.
5. The production CodeRabbit boundary executes a qualified generation-zero label trigger and full-review refresh
   through the versioned receipt protocol, rejects stale/replayed requests, and fails ambiguous delivery without
   retry; disabled policy produces no provider effect.
6. Both authoritative workflows obtain the narrow git read token their shared canonical resolver needs; launch
   validation accepts installation-token semantics without calling App-JWT-only endpoints, and automatic receipts
   are authorized as the policy-pinned App bot rather than the PR author.
7. Strict current-scope human commands compose from GitHub comment through live authorization and durable receipt:
   require/refresh drive admission, waive affects only its requirement, dismiss closes only its named finding, and
   exact replay or stale/unauthorized input is effect-free.
8. Invalid/unavailable receipt state produces a current failure projection and cannot leave a prior green check
   authoritative; writes resume only after a valid ledger returns.
9. Actor capability lookup carries addressing login plus expected immutable id, and separate reconcile/attest
   factories consume one validated shared infrastructure graph without irrelevant inputs or divergent auth.
10. `TECHNICAL-OVERVIEW.md` § Self-Hosting Review Gate distinguishes composed behavior from live-proven final
   enforcement; ADR-028 carries the dated gap/completion/ownership amendment.
11. The postmortem phase has produced: recorded findings (the six-factor diagnosis, refined), the scaffolded
   process-improvements backlog stub with rich context, and the folded critical-small guard set — each guard
   either landed in this PR or explicitly routed to the stub.
12. `review-gate-enforcement-cutover` exists as an explicitly owned dependent WU with the live runbook state,
   authentication and provider/evidence probes, CodeRabbit hybrid, mode transitions, checkpoints, closeout PR,
   and `finalize-parallelism` unpause condition in its charter.
13. A qualifying review or attestation through a substantive head remains satisfying across an exact
    `lifecycle-bookkeeping-tail/v1` proof without another provider request; the closed WU/cohort/ROADMAP delta is
    treated as non-review-relevant, while code/control/unrelated-artifact changes, design-content mutation,
    base/merge-base/policy/rubric drift, or proof ambiguity cannot carry authority forward.
14. The extension family and cutover runbook use `pre-merge` as the final lifecycle hook, and the project activates
    it with `post-pr-open` only after shadow proof; no live non-historical `pre-merge-review` product reference remains.
15. `review-triage` exposes `FIX NOW | MINOR FIX | DEFER | REJECT`, documents every disposition, and keeps minor
    valid fixes concise without calling them silent.
16. The lifecycle-tail contract is storage-neutral: current tracked-`.arc/` classification stays in the Git adapter,
    while future materialized operational state advances no code head and requires no review-gate storage-mode branch.
17. Cutover verifies repository rulesets and branch protection do not impose a duplicate CodeRabbit completion or
    current-head approval requirement that defeats the controller's lifecycle-tail carry-forward.

## Open items

- The exact critical-small guard set to fold inline — resolved by the postmortem phase against the
  no-major-concern cap.
- The concrete numeric value of the App-bot account id — resolved once by the operator during implementation
  and pinned per Decision 5.
