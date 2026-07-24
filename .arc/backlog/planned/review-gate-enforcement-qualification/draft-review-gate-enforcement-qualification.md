# Draft: Review Gate Enforcement Qualification

- **Purpose:** Qualify the shipped inactive review controller from immutable default-branch code and activate only
  baseline-proven hosted provider declarations without changing required-check or project-hook authority.
- **Depends On:** `review-gate-enforcement-cutover` — its inactive controller, provider adapters, qualification
  runner, protected workflow, activation compiler, diff validator, and sanitized evidence schema must ship first.
- **Likely Class:** Heavy — live hosted-provider probes, protected App execution, private checkpoint evidence, and a
  generated policy activation require durable sequencing even though the implementation contracts are inherited.
- **Planning boundary:** Create the spec and task list only after `review-gate-enforcement-cutover` ships, so the
  qualification plan binds to the delivered schemas, workflow revisions, and refusal states rather than assumptions.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Bind qualification to the complete local review surface**

- _Routed from:_ two `USER-INBOX § Work Unit` captures, housekeep drain (2026-07-21); captured during
  `review-architecture` task generation and `review-surface-binding` draft review.
- _Concern:_ qualification still points only at the shipped cutover and claims strict-parser work now owned by
  `review-architecture`. It also lacks the live dependency on `review-surface-binding`, whose local target/request
  derivation, guidance-digest proof, receipt, attestation, and settlement path must exist before a local review can
  count as shared satisfying evidence.
- _Fold-in:_ replace the stale dependency/action with `Depends On: review-surface-binding`; consume the finalized
  review projection and local attested path without rebuilding their parsers; retain lifecycle-readiness,
  live-provider qualification, required-check authority, and the promotion handoff here. Reconcile the go/no-go and
  required-output language so hosted-provider absence can be satisfied by one fully bound local path.

### `[ ]` **Evaluate the `integration/review-gate/` test layout against the test-architecture principle**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-15); captured during `cli-test-hardening`
  create-spec planning close.
- _Concern:_ `cli-test-hardening` (spec Decision 11) codifies the test-architecture principle — layouts named by
  production surfaces, mocks at system boundaries, assertions on observable outcomes, scenario suites split only
  at independently navigable behavior — and applies it to files it touches, but defers the full
  `integration/review-gate/` layout evaluation: the surface is half-built with a three-WU chain pending
  (qualification → promotion → github-adapter), so restructuring its tests now would churn under active
  downstream work. Ride the layout evaluation on this chain — at qualification, or later at planning discretion —
  where the surface is being reworked anyway and the evaluation lands without independent churn.

### `[ ]` **Consume the review-lane vocabulary rather than minting a parallel classification**

> _Superseded 2026-07-19 — `review-architecture`'s settled `exempt / recommended / required` obligation model
> replaces this channel-combination lane vocabulary; see "Repoint the review-gate trigger seam to
> review-architecture's settled obligation contract" below. Repoint (don't accumulate) at this WU's next planning
> iteration._

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-07-16); captured during FP
  wave-3 external-budget contention analysis — CodeRabbit adaptive-limit hit; metering data in
  `notes-finalize-parallelism.md` § Day-2 evidence.
- _Concern:_ the holistic review WU (rescoped `review-method-family` — grooming pending) will define a review-lane
  vocabulary (roughly `none / local-only / local+pr / pr-only`) that decides which changes spend a metered PR
  review. The review-gate must consume that enum as its trigger policy — "don't request a PR review when the lane
  says it shouldn't" — rather than minting a parallel classification. Routed here as the next WU in the chain to
  groom the trigger surface; re-route along the chain (`-promotion` / `-github-adapter`) if grooming order changes.
  The reciprocal seam will be recorded in the review WU's draft § Cross-cutting.

### `[ ]` **Reduce Review Gate Wakeup relay billing overhead**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-07-16); captured during FP
  wave-3 external-budget contention analysis; run-rate data in `notes-finalize-parallelism.md` § Day-2 evidence.
- _Concern:_ the wakeup relay (`review-gate-wakeup.yml`) is an echo-only job firing per review-comment event
  (`pull_request_review`, `pull_request_review_comment`) and bills GitHub's one-minute-per-job minimum each run —
  49 runs (~50 billable no-op minutes) in wave-3 day 1's 27-hour sample, comparable to a dozen heavy CI runs.
  Concurrency already collapses bursts within a PR (one running, one pending); chatty reviews across parallel PRs
  multiply it anyway.
- _Approach:_ review-gate-owned design input, not a freestanding errand — the relay is the unprivileged-event →
  privileged-controller bridge, so any change (controller subscribing to review events directly, harder
  debouncing, batching) needs gate-architecture judgment.

### `[ ]` **Adopt the attestation-first fallback as the qualification go/no-go decision rule**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-gate-enforcement-qualification`), housekeep drain
  (2026-07-18); captured during post-FP wave-planning discussion, 2026-07-18.
- _Concern:_ qualification requires at least one hosted adapter proven **satisfying**, and both hosted providers
  ship `partial` pre-qualification (`coderabbit-pr` cannot close findings, `codex-pr` is parser-only —
  `policy/self-hosting/schema.ts`). It is plausible neither proves satisfying under live probes, and no third
  hosted service is likely to expose better primitives. That would falsify the product bet ("hosted AI reviewers
  can be promoted to merge authority"), **not** the design: the core is provider-agnostic by construction
  (injected ports, independently qualified adapters), and a provider failing its capability matrix is the
  qualification system working as intended.
- _Approach — the decision rule:_ two softening axes with opposite answers. (1) **Never soften the evidence
  discipline** — exact-head, authenticated, fail-closed; weakening it rebuilds the decorative-green hole the gate
  exists to close. (2) **Reshaping the evidence class is legitimate:** pivot to an **attestation-first gate** —
  promote the already-enabled attestation identities (`claude-code` / `codex-cli` / `coderabbit-cli`) from
  repair-authorization scope to primary satisfying evidence ("an attested review ran at this exact head, findings
  triaged, human dispositions settled"), and demote hosted PR providers to advisory finding-sources within their
  proven partial capabilities (the coordinator already owns closure for providers that cannot). Bounded
  adapter/policy design change inside this WU's remit, not a rebuild — and arguably the better product: the
  disposition invariant makes human triage the real gate, it works with no hosted subscriptions, and local-lane
  reviews become gate-admissible evidence. Residual value survives either way (generic bot approvals stay zero,
  choreography automation and the receipt ledger are evidence-source-independent).

### `[ ]` **Require lifecycle completion before the review gate can report merge-ready**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-gate-enforcement-qualification`), housekeep drain
  (2026-07-18); captured during `base-drift-guidance` post-merge lifecycle repair and the PR #288 merge gate,
  2026-07-18.
- _Concern:_ the current `lifecycle-bookkeeping-tail/v1` predicate can carry exact-head review evidence across a
  valid archival tail, but it does not make that tail mandatory. A reviewed, CI-green ARC work-unit head can
  therefore satisfy the gate before Release Notes, Completion Notes, and the `with-integration` archive sweep
  exist; a maintainer can press Merge early and bypass the remaining ARC integration ceremony. PR #287
  demonstrated the gap and required lifecycle-only repair PR #288.
- _Approach:_ add a storage-neutral lifecycle-readiness obligation distinct from review-evidence carry-forward.
  When the host adapter can unambiguously classify a PR as an ARC work unit, fail closed until the
  cadence-required products are present at the exact head: composition always, and a valid `Shipped`/completed
  artifact group under `with-integration`. Qualification must prove that the pre-composition reviewed head cannot
  emit the required green check, that the composed/archived head can, and that ambiguous, manual-cadence, non-WU,
  repair, and future-storage cases have explicit applicability behavior. If the shipped controller lacks the
  capability, treat that as a qualification defect requiring a separate repair before activation, not as an
  accepted limitation.
- _Coordination:_ `review-gate-enforcement-promotion` must consume this qualification proof before making the App
  check authoritative; `review-gate-github-adapter` should productize the neutral obligation and expose
  setup/doctor coverage rather than defining a GitHub-only lifecycle rule.

---

### `[ ]` **Repoint the review-gate trigger seam to review-architecture's settled obligation contract**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-gate-enforcement-qualification`), housekeep drain
  (2026-07-19); captured during `review-architecture`'s `create-spec` re-examination, 2026-07-19 (reciprocal to that
  WU's Cross-cutting "Review-gate qualification seam").
- _Supersedes:_ the **"Consume the review-lane vocabulary rather than minting a parallel classification"** item above
  — **repoint, do not accumulate.** `review-architecture` (rescoped `review-method-family`) re-settled at its
  2026-07-19 `create-spec` re-examination and **rejected** the channel-combination lane vocabulary
  (`none / local-only / local+pr / pr-only`) that the stale item still tells the gate to consume. The settled model
  is `exempt / recommended / required` **independent-analysis obligations**, derived from a closed ARC routing record
  (change-set state / content / review risk, ownership relation, artifact authority, work context, change
  determinacy, `Class`) and **projected to the gate by review-architecture's gate-projection contract** — not a lane
  enum, not a parallel classification.
- _Fold-in:_ at this WU's next planning iteration, supersede (repoint) the stale lane item rather than accumulating a
  second one. The gate's trigger policy consumes the projected `independentAnalysis` record —
  `obligation: exempt | recommended | required`, typed `reasons`, `rubricVersion` + `rubricDigest`,
  `retrigger: none | incremental | full-final` — via a **forward-only v2 gate-contract bump** (current v1 receipts
  ineligible rather than silently upgraded; safe while the controller is not merge authority). `exempt` emits no
  requirement; `recommended` a visible non-blocking one; `required` a blocking one. PR count never multiplies
  requirements — one per normalized change set (the multi-PR assurance-group binding routes to `chunked-delivery`,
  not enforced here).
- _Convergence:_ stress-test against the existing **"Adopt the attestation-first fallback…"** item — a local
  fresh-agent attested pass and a hosted-provider attestation should satisfy one shared satisfying-evidence contract,
  so qualification's go/no-go holds even when no hosted provider qualifies.
- _Dependency:_ add `Depends On: review-architecture` at grooming (currently only `review-gate-enforcement-cutover`),
  before launch — per `review-architecture`'s Cross-cutting seam.
- _Scope:_ `review-architecture` owns the obligation vocabulary, the closed routing record, and the gate-projection
  contract; this WU owns live-provider qualification, required-check authority, project-hook activation, the
  strict-parser migration, and the go/no-go decision rule — consuming the projected record as typed input, not
  re-deriving routing.

## Role in the three-work-unit sequence

This work unit owns baseline qualification and hosted-provider policy activation, not controller construction or
required-check promotion. Its single PR contains only the deterministic activation compiler's baseline-proven provider
declarations and provisional sanitized evidence values. Disposable probe PRs are qualification fixtures, not work-unit
delivery PRs.

The dependency leaves legacy CI `merge-ok` required, project `post-pr-open` and `pre-merge` inactive, CodeRabbit native
request-changes enabled, and every hosted provider non-authoritative until proven. Qualification runs the shipped
matrix from a clean checkout at an immutable remote default-branch SHA, retains raw non-secret evidence in the private
checkpoint store, and refuses activation unless at least one hosted adapter has a complete satisfying baseline.

After this work's activation PR merges, `review-gate-enforcement-promotion` reruns the complete matrix through the
enabled immutable default-branch policy before any enforcement mutation. That second pass belongs to promotion so
both work units retain one-PR lifecycles; it converts the provisional baseline manifest into the final
`CutoverAcceptanceProof` alongside the enforcement closeout.

## Qualification and activation sequence

1. Resolve the exact shipped controller/workflow SHA, App and provider identities, policy/rubric/guidance/parser
   versions, protected environment, repository selection, and private checkpoint locus.
2. Run the complete baseline matrix against disposable exact-head PRs through the shipped qualification coordinator.
   Cover pending-first ordering, trigger lifecycle, CodeRabbit and Codex outcomes, fallback, passive waiting, event
   repair, finding settlement, receipt-ledger reconstruction, both token formats, and outage repair authority.
3. Fail closed on changed default branch, wrong actor, dirty checkout, missing or mismatched checkpoint, incomplete
   cells, fixture substitution, contaminated effects, credential-shaped output, or any result produced by unshipped
   code. Route implementation defects to a separate Errand or work unit and rerun only after the repair ships.
4. Require at least one hosted satisfying adapter. Retain partial/non-satisfying capabilities only when the typed
   baseline proves they cannot grant authority or permit illegal fallback.
5. Compile the accepted baseline into exact provider-policy declarations and a provisional sanitized manifest. Bind
   source/actor ids, capability outcomes, terminal-unavailable mode, default-branch SHA, workflow revisions, version
   digests, evidence ids, and raw-checkpoint hashes.
6. Validate the delivery diff against the compiler candidate. Reject manual additions, omissions, version drift,
   extra paths, raw responses, secrets, required-check changes, hook activation, generic-approval changes, or
   CodeRabbit native request-changes mutation.
7. Merge the generated activation PR through legacy authority and archive normally. Hand the committed provisional
   manifest plus private checkpoint hashes to promotion for enabled-policy requalification.

## Required output for promotion

- A committed baseline capability table distinguishing satisfying, partial, unavailable, and unqualified behavior.
- At least one enabled hosted adapter whose complete request/evidence path passed the baseline matrix.
- Exact App, Actions, provider, actor, controller, workflow, policy, rubric, guidance, parser, and default-branch
  identities with hashes of the corresponding private raw checkpoints.
- Proof that legacy `merge-ok` remains required, project hooks remain inactive, CodeRabbit native request-changes
  remains enabled, and no enforcement layer changed.
- A deterministic candidate that promotion can revalidate and upgrade to the final `CutoverAcceptanceProof` only
  after the enabled-policy matrix passes.

## Non-goals

- Do not add, remove, rename, or source-repin any required check.
- Do not activate project `post-pr-open` or `pre-merge`.
- Do not remove legacy CI authority, generic approvals, or CodeRabbit native request-changes.
- Do not repair controller/provider defects on the activation branch or accept unshipped probe results.
- Do not claim the enabled aggregate path is accepted before promotion reruns it from the merged default branch.

---
