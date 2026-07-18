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

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration.*

### `[ ]` **Evaluate the `integration/review-gate/` test layout against the test-architecture principle**

- *Routed from:* `USER-INBOX § Work Unit`, housekeep drain (2026-07-15); captured during `cli-test-hardening`
  create-spec planning close.
- *Concern:* `cli-test-hardening` (spec Decision 11) codifies the test-architecture principle — layouts named by
  production surfaces, mocks at system boundaries, assertions on observable outcomes, scenario suites split only
  at independently navigable behavior — and applies it to files it touches, but defers the full
  `integration/review-gate/` layout evaluation: the surface is half-built with a three-WU chain pending
  (qualification → promotion → github-adapter), so restructuring its tests now would churn under active
  downstream work. Ride the layout evaluation on this chain — at qualification, or later at planning discretion —
  where the surface is being reworked anyway and the evaluation lands without independent churn.

### `[ ]` **Resolve review-gate digest determinism (locale sort + no NFC)**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-07-16); captured during
  `husk-lifecycle-drivers` Phase 1 (Task 1.1).
- *Concern:* `canonicalizePlainJson` in `review-gate/core/identity.ts` sorts object keys with `localeCompare`
  (ICU/locale-sensitive) and applies no NFC normalization, so its stored policy-version and change-set digests can
  diverge across Node/ICU builds or platforms — a latent cross-environment determinism risk in a trust digest that
  today only holds because every producer runs the same environment.
- *Approach:* decide between migrating review-gate onto the generalized canonical serializer
  (`lib/canonical/canonical-json.ts` — codepoint sort + NFC) behind an explicit digest-version bump with a re-hash
  migration for already-stored digests, or documenting the single-environment constraint as intentional. The
  generalized serializer already exists — `husk-lifecycle-drivers` built it fresh precisely to avoid mutating
  review-gate's stored digests in place — so the design fork is the stored-digest migration, not the sort/NFC fix
  itself.

### `[ ]` **Consume the review-lane vocabulary rather than minting a parallel classification**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-07-16); captured during FP
  wave-3 external-budget contention analysis — CodeRabbit adaptive-limit hit; metering data in
  `notes-finalize-parallelism.md` § Day-2 evidence.
- *Concern:* the holistic review WU (rescoped `review-method-family` — grooming pending) will define a review-lane
  vocabulary (roughly `none / local-only / local+pr / pr-only`) that decides which changes spend a metered PR
  review. The review-gate must consume that enum as its trigger policy — "don't request a PR review when the lane
  says it shouldn't" — rather than minting a parallel classification. Routed here as the next WU in the chain to
  groom the trigger surface; re-route along the chain (`-promotion` / `-github-adapter`) if grooming order changes.
  The reciprocal seam will be recorded in the review WU's draft § Cross-cutting.

### `[ ]` **Reduce Review Gate Wakeup relay billing overhead**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-07-16); captured during FP
  wave-3 external-budget contention analysis; run-rate data in `notes-finalize-parallelism.md` § Day-2 evidence.
- *Concern:* the wakeup relay (`review-gate-wakeup.yml`) is an echo-only job firing per review-comment event
  (`pull_request_review`, `pull_request_review_comment`) and bills GitHub's one-minute-per-job minimum each run —
  49 runs (~50 billable no-op minutes) in wave-3 day 1's 27-hour sample, comparable to a dozen heavy CI runs.
  Concurrency already collapses bursts within a PR (one running, one pending); chatty reviews across parallel PRs
  multiply it anyway.
- *Approach:* review-gate-owned design input, not a freestanding errand — the relay is the unprivileged-event →
  privileged-controller bridge, so any change (controller subscribing to review events directly, harder
  debouncing, batching) needs gate-architecture judgment.

### `[ ]` **Adopt the attestation-first fallback as the qualification go/no-go decision rule**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: review-gate-enforcement-qualification`), housekeep drain
  (2026-07-18); captured during post-FP wave-planning discussion, 2026-07-18.
- *Concern:* qualification requires at least one hosted adapter proven **satisfying**, and both hosted providers
  ship `partial` pre-qualification (`coderabbit-pr` cannot close findings, `codex-pr` is parser-only —
  `policy/self-hosting/schema.ts`). It is plausible neither proves satisfying under live probes, and no third
  hosted service is likely to expose better primitives. That would falsify the product bet ("hosted AI reviewers
  can be promoted to merge authority"), **not** the design: the core is provider-agnostic by construction
  (injected ports, independently qualified adapters), and a provider failing its capability matrix is the
  qualification system working as intended.
- *Approach — the decision rule:* two softening axes with opposite answers. (1) **Never soften the evidence
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

---

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
