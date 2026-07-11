# Spec (`outline`): review-gate-reconcile-composition

- **Origin:** [internal]

- **Purpose:** Compose the shipped review-gate library into the live controller entry points — reconcile *and*
  attestation — so the shadow gate actually emits `review-gate-shadow` and attestation evidence actually lands;
  prove the composed whole against the design intent (end-to-end test plus live emission); then carry the
  design intent to done by executing the enforcement cutover (`.github/review-gate.md`) through final mode. A
  postmortem phase examines how an unfulfilled design intent shipped as "delivered" and routes the process
  guards.

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

1. **Compose to the existing contract; author no new design.** The ports (`core/ports.ts`), the shipped spec's
   § 8 (reconciliation semantics, conclusion mapping, identity pinning) and § 12 (shadow rollout), and ADR-028 fix
   the intended behavior. New code is assembly of existing, tested units — any seam that turns out to require a
   genuine design decision routes back here before implementation.
2. **Shadow runs the full pipeline; projection differs by name only.** Per shipped-spec § 12 ("Emit
   `review-gate-shadow`; do not emit controller-owned `merge-ok`") and `rollout.ts` (`projectContexts` — "Change
   only context names; verdict content remains identical"). No shadow-specific suppression of receipts, provider
   admission, or verdict content is designed in.
3. **`read()` re-resolves canonical state from the API.** Events (including dispatched `head_sha`) are wake-up
   hints, never trusted snapshots (shipped-spec § 8). The runtime resolves the current change set live; stale
   writers are stopped by the orchestrator's existing guards plus `publishGateCheck`'s current-state assert.
4. **New production units are exactly the gap map's missing layer, across both entry points:** a
   `GitHostAdapter` implementation composing the `hosts/github/*` leaf functions — including `publishVerdict()`
   → `projectContexts(mode, …)` → `publishGateCheck` (the load-bearing missing link); the core reduce assembly
   (self-hosting policy decision → admission → requirement state → `reduceGateVerdict` →
   `renderGateProjection` — the policy decision first, since it produces the requirements admission consumes);
   a `ReconcileRuntime` implementation; a composition-root factory taking the repository coordinates
   (owner/name + numeric id), PR number, App token, expected App id, and context mode; the `run-reconcile.ts`
   `reconcile`-branch rewrite to build the runtime and call `reconcile()`; and the `run-attest.ts` rewrite to
   compose attestation validation (`core/attestations.ts`) with the receipt store so an authenticated dispatch
   appends a durable attestation receipt. Each workflow already supplies its rewrite's inputs — reconcile via
   env (`ARC_APP_TOKEN`, `ARC_REVIEW_GATE_APP_ID`, `REVIEW_GATE_CONTEXT_MODE`, numeric coordinates, plus
   standard `GITHUB_REPOSITORY`); attest via `ARC_APP_TOKEN`, `ARC_REVIEW_GATE_APP_ID`,
   `ARC_DISPATCH_ACTOR_ID` (the authenticated submitter identity the validation consumes), and the
   `workflow_dispatch` event payload carrying the PR number and attestation JSON. YAML changes only if
   implementation proves an input genuinely missing.
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
   validation → receipt append) against injected fakes — failing if either path stops emitting. The shells
   carry no logic beyond input parsing (environment and, for attest, the bounded dispatch event payload) and
   invocation. The live criterion — a real `review-gate-shadow` check
   from a `main` dispatch — is only provable post-merge, so it is recorded as **explicit deferred verification**
   with a named forcing function: the cutover Setup authentication probes, executed immediately after this WU's
   PR merges, before WU archival. The attest path's live proof is owned by the runbook's probe matrix
   ("Agent/human attestation" row) during the cutover proper.
7. **The postmortem is a dedicated phase, and its findings get an authoritative home.** Findings are recorded in
   this WU (postmortem phase output), and a new `backlog/` stub is scaffolded whose charter is the process
   improvements — written rich, with this WU's ground-level context (anchors, examples, the six-factor
   diagnosis). Only critical-small guards fold into this WU directly; the fold-in set is finalized during the
   postmortem phase, capped at edits that carry no major-concern risk. The "sanctioned follow-up-stub route"
   question itself joins the stub's charter (with an industry-precedent research note) rather than being
   codified here.
8. **Docs become true, and the gap is recorded where it durably belongs.** `TECHNICAL-OVERVIEW.md`'s
   delivered-shadow claims are verified true once composition lands; ADR-028 receives a dated amendment (its
   reserved post-implementation-learnings section) recording that delivery initially omitted the composition
   layer and where the completion landed.
9. **The enforcement cutover is subsumed as this WU's final phase.** The shipped spec deferred runbook
   execution to "a separate Errand" — the exact mis-classified, unowned follow-on the postmortem indicts
   (factor 6), and the cutover is not errand-shaped (multi-session, checkpointed, several narrow
   runbook-mandated PRs). This WU archives only after the runbook's Normal Cutover reaches `final` mode and
   the closeout PR merges. Execution happens in the integrate → archive window (the code must be on `main`),
   with the meta holding `Integrating` throughout — the window SC3 already opens, extended through the
   runbook's checkpoints. Cutover Setup is already partially complete (recorded in the notes companion):
   protected environment, variables/secret, and the reviewed `setup-before` checkpoint baseline landed
   2026-07-11; the runbook resumes at the authentication probes once composition merges.

## Scope boundary (No-gos)

- **The cutover is executed by this WU but governed by the runbook.** This WU owns *that* the cutover completes
  (a subsumed final phase in its integrate → archive window, direct application of postmortem factor 6 — the
  design intent is not left to an assumed follow-on); `.github/review-gate.md` owns *how* — every
  required-status-check mutation, mode transition, probe, checkpoint compare, and rollback follows the runbook
  verbatim, including its credential-handling constraint (operator-held key and client-id; never in agent
  commands, logs, or config). No gate semantics are decided in this WU outside the runbook's text.
- **No provider qualification changes.** CodeRabbit remains non-satisfying (ADR-028 Decision 4); no
  qualification or rubric edits. The only policy edits are Decision 5's identity/enforcement field additions —
  no disposition, lane, or acceptance semantics change.
- **No published-CLI surface changes.** Controller code stays repo-local `tsx` input; the shipped packaging
  assertions (controller excluded from the npm package) must keep passing.
- **No broad ARC methodology reform.** Postmortem-driven workflow/method edits beyond the critical-small set
  route to the new backlog stub, not this PR.
- **No adapter productization.** That is `review-gate-github-adapter` (captured in USER-INBOX), explicitly gated
  on the cutover this WU unblocks.

## Consequences & Risks

- **Authoritative gate code lands as one WU.** Accepted: shadow is non-required through the whole window (CI
  `merge-ok` stays the sole required check), so a composition bug is visible, not merge-blocking. Mitigations:
  incremental build with per-increment review, the e2e composition test, independent adversarial review before
  PR, and the live probe before promotion.
- **The reduce assembly is the semantic risk center** — chaining reducers whose fixtures were only ever exercised
  in isolation. Mitigation: assemble strictly to shipped-spec § 8's conclusion mapping (pending/failure/success),
  reuse the unit fixtures' semantics, and target the adversarial pass at the assembly seams.
- **Live proof arrives only post-merge** (a `main` dispatch runs `main`'s code). Accepted as designed-in deferred
  verification (Decision 6) — the residual window where composition is merged but unproven is bounded by running
  the Setup probes immediately after merge.
- **Postmortem fold-in scope creep** is a real temptation. Capped by Decision 7; the stub is the pressure valve.
- **A long-running integrate → archive window** (Decision 9): the WU stays `Integrating` across the cutover's
  checkpoints and its narrow runbook-mandated PRs (alias removal, qualification decision, closeout). Accepted:
  the runbook's compare-and-stop checkpointing makes the window resumable across sessions, and every
  intermediate state retains a truthful required gate — an interrupted cutover parks safely at its last proven
  checkpoint. The narrow PRs are runbook-governed operational steps, not deliverable decomposition.

## Success Criteria

1. End-to-end composition tests drive both exported entry mains against fakes: a shadow-mode reconcile run
   creates/updates a `review-gate-shadow` check with truthful verdict content, and an authenticated attest
   dispatch appends a durable attestation receipt through the receipt store. Each test fails if its entry path
   regresses to non-emission; the shells contain no logic beyond input parsing and invocation.
2. Full quality gates pass: existing unit suite (updates justified per-case), typecheck/lint, build, and the
   packaging assertions proving the controller remains outside the published CLI.
3. **Deferred verification (forcing function: cutover Setup probes, immediately post-merge, before WU
   archival):** a `main` dispatch of `review-gate.yml` yields a real `review-gate-shadow` check on the target PR
   head with `.app.id == 4268856` and a truthful conclusion; a non-default-ref dispatch still cannot enter the
   `review-gate` environment.
4. `TECHNICAL-OVERVIEW.md` § Self-Hosting Review Gate reads true against the merged implementation; ADR-028
   carries the dated gap-and-completion amendment.
5. The postmortem phase has produced: recorded findings (the six-factor diagnosis, refined), the scaffolded
   process-improvements backlog stub with rich context, and the folded critical-small guard set — each guard
   either landed in this PR or explicitly routed to the stub.
6. The runbook's Normal Cutover is complete: `REVIEW_GATE_CONTEXT_MODE=final`; the required checks are `ci-ok`
   (Actions-sourced) plus `merge-ok` pinned to App id 4268856 and nothing else; every checkpoint's
   before/after snapshots are recorded in the checkpoint store; the closeout PR (updating
   `TECHNICAL-OVERVIEW.md` to the proven final architecture) is merged through the final gate. The
   `finalize-parallelism` pause condition is thereby lifted.

## Open items

- The exact critical-small guard set to fold inline — resolved by the postmortem phase against the
  no-major-concern cap.
- Whether any workflow YAML input is genuinely missing for the entry-point rewrites — resolved at
  implementation; expectation is none.
- The concrete numeric value of the App-bot account id — resolved once by the operator during implementation
  and pinned per Decision 5.
