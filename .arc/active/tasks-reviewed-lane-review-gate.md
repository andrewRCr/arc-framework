# Task List: Reviewed-Lane Review Gate

- **Design:** `spec-reviewed-lane-review-gate.md`

---

## **Phase 1:** Domain contracts and self-hosting policy

_Purpose:_ Establish the host/provider-neutral vocabulary, stable identities, policy boundary, and source
qualification rules that every adapter and reducer consumes.

### `[x]` **1.1 Define normalized review-domain contracts**

- _Goal:_ Core records and ports express review policy, evidence, requests, and verdicts without importing host,
  provider, workflow-runner, or harness concepts.

    - `[x]` **1.1.a Model change requests, policy, and requirements**
        - Added closed runtime guards for schema-versioned change requests, capability sets, policies, requirements,
          accepted source qualifiers, counts, and admission modes; exact schemas reject foreign identity/cardinality
          fields and invalid bindings.

    - `[x]` **1.1.b Model evidence, findings, and closures**
        - Added validated evidence, coverage, finding, and authenticated-closure records with stable source-scoped
          finding identities, safe evidence references, exact change bindings, and result/finding consistency.

    - `[x]` **1.1.c Model requests, receipts, capacity, and verdicts**
        - Added guarded request generations, storage-neutral receipt events and envelopes, capacity/reason pairs,
          requirement executions, and neutral gate projections retaining actor, source, blocker, and receipt detail.

    - `[x]` **1.1.d Define adapter ports and enforce core neutrality**
        - Added normalized host, receipt-store, and provider ports with expected-version append and opaque adapter
          references, plus fixture conformance and source/import scans that enforce the core neutrality boundary.

    - `[x]` **1.1.e Implement canonical policy and change-set identities**
        - Added NUL-delimited change-set hashing through the shared SHA-256 helper and canonical plain-JSON policy
          hashing with recursive key sorting, array-order retention, runtime exclusion, and fail-closed input checks.

- _Outcome:_ `src/scripts/review-gate/core/` now provides one validated, host/provider-neutral contract layer for
  every downstream adapter and reducer, with 37 focused unit checks covering round trips, invalid boundaries,
  neutrality, and canonical identities.

### `[x]` **1.2 Split CI cost from self-hosting review policy**

- _Goal:_ One canonical changed-path read yields independent CI-cost and stable review-policy decisions, so mutable
  verification history can never weaken an unchanged review obligation.

    - `[x]` **1.2.a Expose the canonical code-surface predicate safely**
        - Added argv-compatible `classify --stdin0` and moved `decide` to NUL-delimited diff transport, preserving
          fail-safe empty/ref behavior and exact whitespace/newline-bearing filenames through the shared predicate.

    - `[x]` **1.2.b Define the validated self-hosting policy document**
        - Added the closed plain-data self-hosting policy with versioned lane/risk predicates, identity map,
          requirement/rubric bindings, timeouts, and source declarations; mutable runtime fields and executable or
          unknown policy values fail validation.

    - `[x]` **1.2.c Classify review risk and stable reason codes**
        - Added the sensitive path matrix and complete stable reason-set reduction, including fail-safe unknown changes
          and routine documentation without generated, author, size, quota, or prior-verification exemptions.

    - `[x]` **1.2.d Resolve auto-lane ownership from exact refs**
        - Added deterministic flat/nested artifact grouping and exact-ref companion reads through `readMetaAtRef()`
          and `parseMetaRecord()`, with ownerless cohorts and reviewed fallbacks for every ownership, layout, move,
          author, parsing, or mixed-diff ambiguity; real-git fixtures cover unusual valid filenames and ref failures.

    - `[x]` **1.2.e Emit the aggregate self-hosting policy decision**
        - Added the exact-change-set decision binding lane, risk, stable reasons, policy digest, and retained typed
          requirements; it maps auto/reviewed-routine/reviewed-sensitive independently of mutable CI state.

- _Outcome:_ CI run-cost classification and review obligation now share one safe code-surface predicate but remain
  separate decisions: verification history can lighten CI without changing the policy-bound review record.

### `[x]` **1.3 Model typed requirements and source qualification**

- _Goal:_ Human approval, independent analysis, and specialist review remain distinct obligations whose accepted
  sources and counts cannot be widened implicitly.

    - `[x]` **1.3.a Reduce typed requirements without source substitution**
        - Added exact kind/qualifier matching, distinct source and human-actor counting, retained policy/change
          bindings, and independent native requested-change/conversation blockers.

    - `[x]` **1.3.b Qualify `independent-analysis/v1` sources**
        - Encoded the five-part rubric and closed qualification capabilities for attested CLI/human and durable-record
          sources; every required proof is fail-closed, runtime fields cannot enable a source, and the PR provider's
          satisfying declaration remains disabled for shadow observation.

    - `[x]` **1.3.c Aggregate requirement disposition without erasing detail**
        - Added required-first/recommended-second/exempt aggregation while retaining each typed requirement, accepted
          sources, count, satisfaction identities, reasons, and blockers for later verdict summaries.

- _Outcome:_ Peer approval, independent analysis, and specialist review now reduce as separate obligations; neither
  source matching, counts, qualification, native blockers, nor aggregate summaries can erase the underlying detail.

## **Phase 2:** Evidence, admission, and readiness reduction

_Purpose:_ Build the pure state machines that decide whether exact-change-set evidence satisfies typed
requirements, whether a request may spend quota, and whether the aggregate merge gate is truthful.

### `[x]` **2.1 Reduce coverage chains and finding closure**

- _Goal:_ Only a complete, current, authority-valid analysis chain can satisfy a review requirement, and no clean
  summary can silently erase an earlier finding.

    - `[x]` **2.1.a Validate full and incremental evidence links**
        - Added exact-binding, same-source full/incremental coverage reduction through the current head; gaps,
          overlaps, retargets, merge-base drift, cross-source links, stale terminals, and failed evidence fail closed.

    - `[x]` **2.1.b Track stable findings across evidence generations**
        - Added source-scoped immutable finding history that retains every open finding across later clean evidence,
          rejects identity reuse, and prevents alternate-source evidence from erasing another source's findings.

    - `[x]` **2.1.c Validate closure authority**
        - Added named-finding closure reduction for same-source confirmation, authenticated dismissal, and known
          host actors; stale, unknown, mismatched, or bare projection state cannot close findings or imply clean.

    - `[x]` **2.1.d Reduce evidence to requirement execution state**
        - Added the complete execution-state reducer over current evidence, receipts, waivers, and capacity; only
          coverage-complete, closure-consistent clean evidence satisfies, while stale history remains chain-eligible.

- _Outcome:_ Evidence can satisfy a requirement only through a current contiguous coverage chain with consistent,
  authority-closed finding history; obligation remains intact across every visible execution state.

### `[x]` **2.2 Admit idempotent provider requests from receipts**

- _Goal:_ Every possible provider spend is version-reserved durably and permits at most one controller invocation
  attempt per request identity, while explicit refreshes and qualified alternate sources remain available.

    - `[x]` **2.2.a Define canonical receipt and request keys**
        - Added hierarchical requirement/request keys, replay-stable idempotency, predecessor-bound receipt hashes,
          and anchor-checked ledger validation that collapses exact duplicates and rejects replay, edits, forks,
          divergence, missing history, or malformed identities.

    - `[x]` **2.2.b Admit the one automatic initial request**
        - Added generation-zero admission for ready required automatic work only, with admitted-history replay
          suppression and the declared exhausted/not-observable/lookup-failed capacity behavior; obligation is never
          rewritten by admission or capacity.

    - `[x]` **2.2.c Reserve before invocation and reconcile acknowledgement**
        - Added append-confirm-invoke sequencing with no effect from an unconfirmed reservation, at-most-one invocation,
          acknowledged/ambiguous terminal recording, and injected-clock ten-/sixty-minute boundaries derived solely
          from authenticated store time.

    - `[x]` **2.2.d Admit refresh, alternate, and out-of-band evidence paths**
        - Added authorized generation-advancing refresh, full-only qualified alternate admission, and durable current
          out-of-band evidence recording as `unadmitted`, suppressing provider spend without fabricating history.

- _Outcome:_ Every provider attempt now has one canonical request identity and a durable, version-confirmed reservation
  before invocation; retries, repair wakes, fallbacks, and external evidence cannot duplicate spend or weaken policy.

### `[x]` **2.3 Validate commands, overrides, and attestations**

- _Goal:_ Every requirement escalation, refresh, waiver, dismissal, and external attestation is strict,
  permission-checked, current-change-set scoped, and auditable.

    - `[x]` **2.3.a Parse the host-neutral command language**
        - Added strict bounded `require`, `waive`, `refresh`, and `dismiss` parsing with closed identifiers,
          source-scoped findings, byte/control checks, preserved reason text, and actionable fail-closed diagnostics;
          no shell interpretation, generic resolve, or implicit waive-all path exists.

    - `[x]` **2.3.b Authorize and scope command receipts**
        - Added live capability thresholds and actor/permission/reason-bearing receipts scoped to exact change-set,
          policy, and rubric identities; under-privileged or stale commands cannot mutate requirements or findings.

    - `[x]` **2.3.c Validate generic agent attestations**
        - Added bounded neutral manifests with separately authenticated maintain/admin submitters, accepted reviewer
          claims and runtime provenance, unique runs, exact recomputed coverage identity, durable evidence, and strict
          result/finding/closure validation; local, stale, oversized, reused, or token-like input fails closed.

    - `[x]` **2.3.d Validate qualified-human attestations**
        - Added the same bounded full-rubric manifest for qualified humans, requiring actor/source identity equality,
          non-author status, accepted qualification, write-or-higher permission, and durable evidence.

- _Outcome:_ Every command and attestation now crosses a strict syntax/schema boundary, a fresh capability check,
  and exact policy/change scope before it can emit auditable evidence or mutate one named obligation/finding.

### `[x]` **2.4 Reduce complete merge readiness to one verdict**

- _Goal:_ `merge-ok` is successful exactly when every declared PR, CI, and review blocker is absent, with a summary
  that explains all remaining obligations and evidence.

    - `[x]` **2.4.a Reduce readiness, mergeability, and base freshness**
        - Added the neutral readiness dimension: draft, unknown mergeability, and enforced base waits remain pending;
          conflicts fail; ready, mergeable, base-fresh changes pass without inventing review authorization.

    - `[x]` **2.4.b Reduce CI and typed review obligations**
        - Added CI, typed requirement, waiver, native decision, requested-change, and conversation reduction with
          failure-over-pending precedence; recommended-unsatisfied work stays visible and non-blocking.

    - `[x]` **2.4.c Fail closed on inconsistent controller state**
        - Added explicit malformed receipt, ledger fork/regression, duplicate projection, invalid capacity, and stale
          evidence handling; no inconsistency succeeds, while current qualifying evidence remains capacity-independent.

    - `[x]` **2.4.d Render the neutral gate projection**
        - Added deterministic neutral projections retaining policy/reasons, CI, requirement/evidence detail, blockers,
          ledger version, and durable references; summaries explain clean/waived/inapplicable states or every blocker
          without propagating untrusted markup.

- _Outcome:_ One failure-over-pending verdict now composes every declared readiness, CI, review, native, and
  consistency dimension, with a complete neutral projection that cannot hide residual obligations or evidence state.

### `[x]` **2.5 Independently review the core policy and reducer slice**

- _Goal:_ A fresh reviewer certifies the domain, policy, evidence, admission, and verdict implementation before host
  and provider integration can compound any mistaken assumption.
- _Outcome:_ CodeRabbit independently reviewed the activation-to-Phase-2 range; all eight findings were verified and
  resolved, including unsafe-reference hardening and shared validation cleanup. A warranted fresh pass over the fixes
  reviewed 54 files with no further findings.

## **Phase 3:** GitHub host adapter and trusted projection

_Purpose:_ Translate GitHub change requests, permissions, native review state, App-comment receipt storage, and check
runs into and out of the neutral ports without allowing host objects to become policy or record authority.

### `[x]` **3.1 Resolve GitHub change sets and actor capabilities**

- _Goal:_ The GitHub adapter produces complete normalized change-request and authorization facts from canonical API
  state without executing or trusting pull-request code.

    - `[x]` **3.1.a Build the injected GitHub API boundary**
        - Added `hosts/github/api/{http,rest,graphql}.ts`: an injected-`fetch` transport (REST version pinned via
          `X-GitHub-Api-Version`, no runtime dependency added), a `Link`-paginated REST client, and a
          cursor-paginated GraphQL client. Idempotent reads (`performRead`) retry transient/rate-limit/network
          failures then fail `unavailable`; writes (`performWrite`) make one attempt and surface `ambiguous` for an
          idempotency-keyed `reconcile` rather than resending. HTTP, schema, incomplete-pagination, and
          enumeration-cap failures stay explicit rather than collapsing to empty state, and the token is confined to
          request headers — asserted absent from every read/write/GraphQL outcome.

    - `[x]` **3.1.b Resolve exact pull-request coverage identities**
        - Added `hosts/github/pull-request.ts` — validates a REST PR payload into canonical facts bound to immutable
          numeric/node ids and 40-hex SHAs, retaining mutable refs only for observation and marking a distinct/absent
          head repository cross-repository. Added `hosts/github/coverage.ts` — fetches only the trusted base remote's
          base ref plus `refs/pull/<n>/head` via argument-array `GitExec` (idempotent: prior local refs cleared
          first), computes the merge base and NUL-framed changed-path set locally without checkout, and derives the
          `(base_ref, diff_base_sha, head_sha)` change-set id. Fails `sensitive` on invalid identity,
          unavailable/force-pushed objects, head mismatch, absent merge base, or unresolvable diff; conservative ref
          validation (no `..`, leading `-`, edge/double slashes) blocks fork-controlled ref/remote input before any
          git runs. Real-git integration fixtures cover base-tip-stable vs retarget/merge-base-moved identity,
          sensitive fail modes, injection rejection, and arbitrary-filename/rename transport.

    - `[x]` **3.1.c Resolve actor and author capabilities**
        - Added `hosts/github/actor.ts` — `normalizeActor` binds any account to its immutable numeric/node ids with
          login kept display-only, and `resolveActorCapabilities` re-queries the live collaborator-permission
          endpoint per actor, mapping the exact role (`role_name` preferred, legacy field as fallback) without
          over-granting. Identity is the numeric id, so a login case change or rename cannot alter it; a numeric-id
          mismatch, a bot account, removed access (permission `none` / 404), and any lookup failure all fail closed.
          Extended `pull-request.ts` to normalize the PR `author` separately (immutable-id bound) for non-author
          rules.

    - `[x]` **3.1.d Compose the `GitHostAdapter` change-request surface**
        - Added `hosts/github/change-request.ts` — `resolveChangeRequest` decodes an opaque `hostRef`
          (`github:<owner>/<repo>/pull/<n>`), combines PR facts and trusted coverage, and emits a
          `NormalizedChangeRequest` validated through the core parser so only the neutral nine keys cross the port
          (no GitHub object, payload, or URL leaks; PR number lives only inside the opaque `hostRef`, ids read as
          opaque). A companion neutral `ChangeContext` carries changed paths, author, draft/cross-repo/mergeability
          for the controller and policy. Fails `unavailable` on a PR-lookup failure, `sensitive` on an
          unresolvable/force-pushed change set, `invalid-ref` on a malformed ref — no partial record either way.
          Re-querying unchanged canonical state is deterministic (idempotency fixture).

- _Outcome:_ The GitHub host adapter's change-set + authorization surface is complete: every endpoint payload is
  validated and normalized inside `hosts/github/`, immutable numeric/node ids carry identity while mutable
  refs/logins stay observation-only, trusted-base git objects are fetched with a narrow read path separate from the
  API token, and the only core-facing record is the neutral `NormalizedChangeRequest`. Native evidence (Task 3.2)
  and verdict projection (Task 3.4) fill the remaining host-port methods; receipt persistence (Task 3.3) composes
  separately.

### `[x]` **3.2 Normalize native reviews and conversations**

- _Goal:_ Native approvals, requested changes, dismissals, and review conversations affect only the requirement and
  closure semantics GitHub can actually prove.

    - `[x]` **3.2.a Normalize review state by head and actor**
        - `native-review.ts` normalizes submitted reviews (REST, per-actor latest state-setting review;
          `commented`/`pending` set none) bound to the actor's immutable id and the head `commit_id`, and separately
          normalizes the GraphQL `reviewDecision`. `reduceNativeReview` yields a current qualified approval as a
          peer-approval candidate only (never independent analysis); stale (older head), self (author), and
          later-dismissed approvals drop out, current requested-changes blocks, and the decision maps only when policy
          expects native review (`review-required` / `changes-requested` / `approved`, missing → `unknown` fails
          closed). No CODEOWNERS parse or Code Owner inference.

    - `[x]` **3.2.b Normalize conversations and closure authority**
        - `resolveThreads` paginates every review thread and normalizes `isResolved` plus the immutable `resolvedBy`
          identity where the host exposes it. Every unresolved thread counts as a blocking required conversation
          independent of requirement count; a resolved thread yields a `host-native` closure for exactly its finding
          only when a qualifying resolver is known (a bare `isResolved` with no actor, or a caller-listed non-closing
          resolver such as the provider bot, yields no closure).

    - `[x]` **3.2.c Bind native evidence to exact host state**
        - Individual approval is atomic to its submitted head, so a head change stales it without composing across
          heads, and the aggregate host decision blocks merge readiness without manufacturing a Code Owner or an
          independent-analysis satisfaction. `reduceNativeReview` is pure over observed state, so a scheduled
          re-query reconstructs the same result as the edit/dismiss event stream.

- _Outcome:_ Native GitHub review state — individual reviews, aggregate `reviewDecision`, and review threads — is
  normalized to immutable-id-bound, head-exact facts that feed the core's `nativeReview` block (requested-changes,
  unresolved-conversation count, decision), peer-approval candidates, and `host-native` closures, with no CODEOWNERS
  parsing and no path by which `COMMENTED`, a bare thread resolution, or aggregate host approval becomes independent
  analysis.

### `[x]` **3.3 Implement the App-comment receipt store**

- _Goal:_ The neutral receipt-store contract gains a version-checked GitHub implementation whose compact visible
  comments are authenticated, tamper-evident within the declared App/admin boundary, and durably auditable.

    - `[x]` **3.3.a Parse visible-plus-machine receipt comments**
        - `receipt-comment.ts` serializes an authoritative receipt as an HTML-comment marker plus a visible summary
          and one collapsible JSON machine payload; `parseReceiptComment` extracts by structure only (never executes
          or interpolates), rebuilds the store envelope from the host comment's node id + created/updated times
          (payload time never trusted for ordering), and fails closed on oversized / missing / duplicate /
          malformed / missing-ledger-version / scope-mismatch / schema. Only authoritative transitions serialize.

    - `[x]` **3.3.b Authenticate receipt authorship by App identity**
        - `receipt-auth.ts` binds authority to `performed_via_github_app.id` plus the pinned immutable bot account
          id: `authenticateAppComment` rejects github-actions/other-App, non-bot, lookalike-id, and body-only
          identity claims, and (for receipts) edited comments, while the deliberately-mutable anchor authenticates
          under `allowEdits`. Identity is numeric, so a renamed bot login still authenticates and key rotation is
          transparent. `verifyAppIdentity` fails adapter initialization closed on App-id mismatch, credential
          (401/403), or an unavailable `/app`.

    - `[x]` **3.3.c Append receipts with current-state revalidation**
        - `GitHubCommentReceiptStore` requires the expected predecessor, revalidates actor authority plus repository,
          change-request, change-set, and policy identity immediately before the write, confirms the canonical result,
          and resolves exact idempotent or ambiguous replays without issuing a second effect.

    - `[x]` **3.3.d Reconstruct the ledger and detect contradictions**
        - Complete issue-comment enumeration now authenticates and parses receipts, orders them by ledger position,
          collapses byte-equivalent duplicates, and rejects edits, gaps, forks, divergent/replayed identities, or
          contradictory reservation, acknowledgement, result, failure, waiver, and dismissal histories.

    - `[x]` **3.3.e Maintain the stable PR-scoped ledger anchor**
        - A single authenticated mutable anchor bootstraps at version zero, advances after confirmed receipt writes,
          repairs only a unique one-receipt extension, and fails closed on deletion, regression, duplication, mismatch,
          incomplete enumeration, or an externally signalled total-state loss requiring break-glass.

- _Outcome:_ The GitHub receipt-store port now composes authenticated comments, a linear semantic reducer, optimistic
  append/replay handling, and a durable PR anchor into one fail-closed ledger whose recovery can repair an interrupted
  canonical extension without retrying an external effect.

### `[x]` **3.4 Project idempotent App-owned gate checks**

- _Goal:_ GitHub receives one authoritative, source-pinnable custom check per context/change set, with races and
  duplicates reconciled to the core verdict rather than hidden.

    - `[x]` **3.4.a Locate checks by deterministic external identity and App source**
        - The REST adapter completely enumerates `filter=all` history with GitHub's App/name filters, then admits only
          the exact PR/change-set/context external id, check name, and pinned App id; unchanged reconciliations update
          the elected run while same-name Actions/other-App checks remain non-authoritative.

    - `[x]` **3.4.b Publish neutral projections as GitHub check runs**
        - Pending/failure/success projections map to in-progress/completed GitHub checks with bounded escaped output,
          durable receipt/evidence links, and the anchor's ledger version/count retained as a secondary projection.

    - `[x]` **3.4.c Reconcile interrupted duplicate check creation**
        - The newest same-App/external-id run is elected while every exact duplicate receives the same canonical
          conclusion; duplicate ids remain surfaced and any failed update makes the publishing operation fail closed.

    - `[x]` **3.4.d Guard recursion and stale writers**
        - Controller-authored completion events are ignored, every create/update is preceded by a final head/change-set
          read, and the exported per-PR concurrency posture is shared and explicitly non-cancelling.

- _Outcome:_ The GitHub check adapter now treats App source plus deterministic external identity as authority, maps
  neutral verdicts without trusting host text, converges interrupted duplicate creation, and prevents recursive or
  stale writers from publishing over a newer change set.

## **Phase 4:** Review providers and out-of-band evidence

_Purpose:_ Prove the first provider adapter and the source-neutral human/agent fallback while preserving
capacity, coverage, finding authority, and non-substitution rules.

### `[x]` **4.1 Implement the CodeRabbit provider adapter**

- _Goal:_ CodeRabbit can be requested and observed through the neutral provider port without deciding obligation,
  weakening capacity failures, or claiming evidence capabilities not proven by fixtures/live probes.

    - `[x]` **4.1.a Translate admitted requests into one-shot provider triggers**
        - Generation zero selects the exclusive controller label and refresh generations select only the full-review
          command before reservation; stale/replayed requests trigger nothing, label cleanup follows every attempted
          label delivery, and ambiguous delivery remains effect-ambiguous without fallback.

    - `[x]` **4.1.b Observe acknowledgement, progress, result, and capacity**
        - Provider status, walkthrough, review, quota, and request signals reduce behind the neutral port while
          completion-only status/COMMENTED/mutable text stay non-authoritative; capacity retains provider-reported,
          not-observable, or lookup-failed provenance without changing policy obligation.

    - `[x]` **4.1.c Normalize coverage and durable findings**
        - Qualifying findings require exact coverage plus immutable review/thread/comment ids, concrete loci, and the
          versioned `coderabbitai[bot]` numeric identity; generic success remains non-satisfying and neither thread
          resolution nor provider approval emits a finding closure.

    - `[x]` **4.1.d Compose the provider adapter contract fixtures**
        - Probe-backed fixtures cover request selection, delivery ambiguity, progress/failure/capacity, Request
          Changes, immutable findings, direct-command `unadmitted` routing, and the deliberately disabled PR-provider
          qualification while preserving CodeRabbit as a shadow findings source.

- _Outcome:_ CodeRabbit now implements the neutral provider port without leaking provider vocabulary into policy:
  requests are single-effect and guard-bound, observations remain provenance-typed, and only live-proven immutable
  finding records cross the evidence boundary while clean and closure capabilities stay disabled.

### `[ ]` **4.2 Configure the repository CodeRabbit handshake**

- _Goal:_ Repository-local CodeRabbit settings inherit account-level policy while enabling only the controller-owned
  request/status/failure contract and detecting inherited paths that could bypass admission or multiply spend.

    - `[ ]` **4.2.a Add the minimal inherited repository delta**
        - Create `.coderabbit.yaml` with `inheritance: true`, `reviews.request_changes_workflow: true`,
          `reviews.commit_status: true`, `reviews.fail_commit_status: true`, and `reviews.auto_review` scalars that
          enable auto review restricted to the controller's positive label (`enabled: true` plus `labels`; a
          disabled `auto_review` makes the label path inert) while disabling draft/incremental/description-keyword
          triggers. Leave walkthrough-only `reviews.review_status` inherited.
        - Add a schema/static assertion that locks only the self-hosting delta and contains no ARC-level provider
          preference or credential.

    - `[ ]` **4.2.b Register configuration as live-probe-gated**
        - Require `@coderabbitai configuration` evidence for the fully resolved settings because inherited arrays and
          global overrides can preserve extra positive labels or trigger paths that static repository assertions
          cannot see. Keep label reaction, acknowledgement, later-push behavior, exact commit-status context/creator,
          coverage, capacity, and closure as explicit probes.
        - Keep label qualification disabled when the effective trigger set is not exclusive; repair the account-level
          setting or preselect the explicit-command strategy, and fail unavailable rather than infer any unproven
          capability.

### `[ ]` **4.3 Ingest qualified agent and human attestations**

- _Goal:_ Maintainer-attested fresh Codex CLI, Claude Code, and CodeRabbit CLI runs plus qualified human reviews can
  publish equivalent durable evidence while the controller states exactly which identity GitHub authenticated.

    - `[ ]` **4.3.a Define the source-neutral attestation payload**
        - Carry source kind, reviewer claim, unique review-run id, harness kind/version, run timestamps, requirement,
          result, exact base/diff/head/change-set identities, policy/rubric, full coverage bounds, evidence URL/id,
          finding manifest, and explicit closure ids in the Phase 2 bounded 32-KiB neutral manifest.
        - Build `test-first` (one behavior at a time):
            - Canonical Codex, Claude, CodeRabbit CLI, and human fixtures validate through one schema.
            - Missing/stale identities, incremental fallback, malformed findings, and expiring/unlinked evidence fail.

    - `[ ]` **4.3.b Validate durable evidence and reviewer qualification**
        - Apply the Phase 2 authorization/non-author/source rules after resolving the dispatch actor from GitHub;
          authenticate and record the submitter separately from the policy-accepted reviewer claim, and describe agent
          identity/freshness as maintainer-attested provenance rather than controller-authenticated fact.
        - Build `test-first` (one behavior at a time):
            - Agent attestations require maintainer submission and reject reused/stale run provenance; human
              attestations require actor/source equality.
            - A native reactive agent artifact is non-satisfying until an adapter proves its coverage/result contract.

    - `[ ]` **4.3.c Emit attestation receipts and suppress duplicate requests**
        - Convert accepted payloads into App-authored evidence receipts under the current requirement; mark independent
          out-of-band evidence `unadmitted` and let admission observe it before invoking a provider.
        - Build `test-first` (one behavior at a time):
            - Exact replay is idempotent and conflicting replay fails closed.
            - Clean qualifying evidence satisfies; findings evidence remains blocking with its finding ids.

    - `[ ]` **4.3.d Preserve provider-neutral operational guidance**
        - Document the full-rubric review input/output expected from each satisfying local mechanism — the two
          primary harnesses plus CodeRabbit CLI (instruction-file rubric delivery, maintainer-resolved coverage
          bounds, manifest-minted finding ids) — without embedding a Codex- or Claude-specific command into ARC
          framework surfaces.
        - Assert project workflow prose treats the qualifying mechanisms equally and leaves future PR-native adapters
          behind the same qualification boundary.

### `[ ]` **4.4 Independently review the host and provider adapter slice**

- _Goal:_ A fresh reviewer certifies GitHub translation, App authority, native evidence, CodeRabbit behavior, and
  generic attestations before the trusted runtime begins producing external effects.

    - Run the phase-completion quality gates, then give one fresh independent-analysis reviewer the spec, project
      orientation, and commit range after Task 2.5 through Phase 4.
    - Apply `independent-analysis/v1` with particular attention to trust boundaries, spoofing, coverage/closure loss,
      untrusted inputs, and provider-capacity leakage into policy; settle verified findings and re-run affected gates.
    - Default to one pass; add another only for substantive findings/fixes or an uncovered trust seam.

## **Phase 5:** Trusted reconciliation runtime and CI shadow graph

_Purpose:_ Run the controller only from protected default-branch code, reconstruct canonical state from event
wake-ups, and separate `ci-ok` from a shadow-capable review gate without breaking the legacy required context.

### `[ ]` **5.1 Reconcile events, races, timeouts, and scheduled repair**

- _Goal:_ Short-lived trusted controller runs reconstruct one current canonical state and converge despite duplicate,
  missed, reordered, coalesced, or delayed wake-ups without cancelling an effectful writer.

    - `[ ]` **5.1.a Normalize event wake-ups without trusting snapshots**
        - Parse `pull_request_target`, commit `status`, filtered CI/review-relay `workflow_run`, external check,
          issue-comment, dispatch, and schedule inputs only into repository/PR hints; re-query every
          policy/evidence/receipt fact from its authoritative adapter.
        - Build `test-first` (one behavior at a time):
            - Stale event payloads reconcile the current head rather than their embedded snapshot.
            - GitHub Actions CI completion maps through `workflow_run`, while CodeRabbit progress maps through
              `status`; neither depends on a suppressed/missing `check_run` event.
            - Unsupported/malformed events fail visibly without mutating receipts/checks.

    - `[ ]` **5.1.b Orchestrate read, reduce, effect, and final re-read**
        - Compose host/policy/receipt-store/provider adapters around pure reducers; append a reservation against the
          read ledger version, confirm it canonically before the provider effect, and publish only after a final guard.
        - Build `test-first` (one behavior at a time):
            - Re-running unchanged state produces no duplicate spend or receipt and an idempotent check update.
            - Head/permission/policy changes between reads abort stale effects and reconcile the new state.

    - `[ ]` **5.1.c Repair missed and nonterminal state on schedule**
        - Fully paginate every open PR in scope—including PRs with no anchor/check—then shortlist missing,
          pending/nonterminal state, rebuild it, apply the one-time automatic admission rule, and never replay
          ambiguous reservations. Fail visibly on pagination/candidate caps rather than silently omitting PRs.
        - Build `test-first` (one behavior at a time):
            - A ready PR with no gate/receipt state is discovered and repairs the initial required request once.
            - Recommended/exempt/settled PRs and ambiguous attempts spend nothing.

    - `[ ]` **5.1.d Bound races and injected time**
        - Let a read-only discovery job emit a bounded, deduplicated numeric repository/PR matrix for every event and
          scheduled scan. Run one effectful matrix leg per PR, sharing its repository-id/PR-id concurrency group with
          attestation and `cancel-in-progress: false`; let pending wake-ups coalesce and stale runs self-abort.
        - Inject the evaluation clock while deriving timeout age only from store-authenticated `recorded_at`; keep
          controller-check wake-ups nonrecursive.
        - Build `test-first` (one behavior at a time):
            - Interleaved older/newer reconciliations leave only the newest change-set projection authoritative.
            - One status/workflow run associated with multiple PRs fans out without sharing a write lane; discovery
              never receives App credentials or authors state.
            - Timeout boundary fixtures and self-check events converge deterministically.

### `[ ]` **5.2 Model and test shadow, dual, and final projection modes**

- _Goal:_ Rollout mode changes only check-name projection, never policy or verdict semantics, and every transition
  retains at least one truthful required context.

    - `[ ]` **5.2.a Map verdicts to shadow/dual/final context sets**
        - Default missing/invalid `REVIEW_GATE_CONTEXT_MODE` to shadow; emit only `review-gate-shadow` in shadow,
          shadow plus App `merge-ok` in dual, and only App `merge-ok` in final.
        - Build `test-first` (one behavior at a time):
            - All modes project the identical neutral verdict under the appropriate names.
            - The shadow controller never emits `merge-ok` while the CI compatibility producer exists.

    - `[ ]` **5.2.b Validate normal transition and rollback ordering**
        - Model required-context mutations so a proven pair is added/green before the prior context is removed across
          shadow-to-dual-to-final and final-to-dual-to-shadow paths.
        - Build `test-first` (one behavior at a time):
            - No valid transition creates an empty set or same-name multi-producer overlap.
            - Out-of-order/removal-first operations are rejected with the last proven set intact.

    - `[ ]` **5.2.c Validate App/controller-outage recovery ordering**
        - Require merge freeze/audit snapshot, exact-head independent `ci-ok` proof, repair-PR scope guard, and
          add-before-remove semantics; model incident-scoped review-action suspension plus independent repair-review
          evidence as prerequisites, and prohibit admin/direct-base bypass.
        - Build `test-first` (one behavior at a time):
            - Repair PRs touching the `ci-ok` producer cannot use that same proof.
            - A dead controller cannot leave its project action active in the repair path or manufacture a satisfying
              receipt for the substitute review.
            - Restoring the App re-enters shadow, restores/proves the project actions, and repeats normal promotion
              before final enforcement.

    - `[ ]` **5.2.d Render transition plans for the runbook**
        - Produce explicit current/next required contexts, mode, prerequisites, verification probes, and rollback
          target, including action activation and independent repair-review state where applicable, so operational
          steps are reviewable before mutation.
        - Build `test-first` (one behavior at a time):
            - Normal, rollback, and outage plans name a truthful guard at every mutation.

### `[ ]` **5.3 Wire trusted controller and attestation workflows**

- _Goal:_ GitHub Actions supplies narrow trusted wake-ups and short-lived App credentials while all executable code,
  policy, and dependencies come from the protected default branch.

    - `[ ]` **5.3.a Add the reconciliation workflow trigger shell**
        - Create secretless `.github/workflows/review-gate-wakeup.yml` for review/review-comment events with no
          checkout, untrusted-input execution, or write capability. Create privileged
          `.github/workflows/review-gate.yml` for `pull_request_target`, `status`, filtered CI/wake-up `workflow_run`,
          issue-comment, opportunistic external check, and schedule events with read-only discovery plus the per-PR
          reconciliation matrix.
        - Give `GITHUB_TOKEN` read permissions only. Full-SHA pin every action, check out `github.workflow_sha` with
          credential persistence/caches disabled, install locked dependencies, and invoke the installed local `tsx`
          binary without download fallback. Give only the controller's validated argument-array git-fetch boundary
          the narrow read token for base-repository objects.
        - Fix the workflow→controller invocation contract: two entry modules under `src/scripts/review-gate/` —
          `run-reconcile.ts` for the discovery/event reconciliation legs and `run-attest.ts` for attestation
          validation — receiving context through environment variables and the standard event-payload file, with no
          untrusted value or credential interpolated into argv or shell text.

    - `[ ]` **5.3.b Mint and constrain the GitHub App token**
        - Bind privileged jobs to GitHub environment `review-gate`. Require setup to restrict the environment to the
          exact protected default branch before storing `ARC_REVIEW_GATE_APP_PRIVATE_KEY`; non-default refs and
          absent/unsafe environment state fail closed before any step runs (environment-referencing jobs always
          mint deployment records — rejected attempts leave failed records; inert bookkeeping, not an access path).
        - Use full-SHA-pinned `actions/create-github-app-token` with `ARC_REVIEW_GATE_APP_CLIENT_ID`, the environment
          private key, explicit checks-write/pull-requests-write/statuses-read permission inputs (pull-requests
          write owns PR ledger comments and the one-shot label; no issues permission is held), and exact
          current-repository scope. Keep `ARC_REVIEW_GATE_APP_ID` separate for evidence authentication,
          `GITHUB_TOKEN` non-authoritative, and the App token out of git transport.
        - Add static workflow assertions for action pins, immutable checkout, permissions, environment/secret flow,
          client-id/App-id separation, current-repository scope, and no PR-code checkout/execution.

    - `[ ]` **5.3.c Add the authenticated attestation dispatch workflow**
        - Create `.github/workflows/review-gate-attest.yml` on default-branch `workflow_dispatch`, collect the strict
          bounded neutral payload, resolve the dispatch actor, join the same repository-id/PR-id concurrency group,
          and pass it to controller validation before App receipt write. Require `--ref` to name the protected default
          branch and bind the job to the same restricted environment so another ref cannot receive the private key.
        - Assert agent and human inputs share one contract, `github.workflow_sha` is the only checkout, and no
          untrusted prose is parsed as authority.

    - `[ ]` **5.3.d Cover fork and untrusted-input boundaries**
        - Add workflow/controller fixtures for fork PRs, malicious labels/titles/comments/evidence links, newline paths,
          malicious fork URLs/refs/SHAs, missing secrets/installations, and shell-free structured argument transport.
        - Verify fork review events traverse only the secretless wake-up plus default-ref `workflow_run`, relay data is
          hint-only, empty/ambiguous mappings defer to all-open-PR repair, and no secret or write credential enters
          PR-controlled execution. Prove a non-default attestation dispatch cannot enter the credential environment.

### `[ ]` **5.4 Refactor CI classification and compatibility rollup**

- _Goal:_ CI publishes an independent `ci-ok` result and retains a thin legacy `merge-ok` compatibility producer until
  the post-main cutover, while exposing stable classifier facts to the controller.

    - `[ ]` **5.4.a Publish CI-cost and canonical code-surface facts**
        - Keep CI weight on the Phase 1 NUL-safe `decide` path and add a `lane --stdin0` subcommand for the legacy
          path-only scheduling lane (peer of the Phase 1 `classify --stdin0` code-surface predicate; `ci.yml`'s
          existing `lane` output name and value contract are preserved). Feed `git diff --name-only -z` directly to
          that boundary without storing NUL-delimited paths in a shell scalar. Preserve add/delete/rename/move and
          arbitrary whitespace/newline names, with empty/unresolvable/parser-failed input resolving reviewed/heavy.
        - Expose the existing mutable CI record plus canonical code-surface diagnostics; the trusted controller—not PR
          CI—adds ownership and emits the authoritative review-policy record from default-branch code.
        - Preserve duplicate-push and verified-tree optimizations, and assert provider capacity/check results cannot
          affect the separately computed review record.

    - `[ ]` **5.4.b Rename the CI aggregate to `ci-ok`**
        - Roll up the current classify/lint/typecheck/unit/integration/E2E/portability graph under `ci-ok`, preserving
          skipped-vs-failed semantics and diagnostic job naming.
        - Add workflow assertions that every existing gated job remains represented and reviewed/light combinations
          retain current CI behavior.

    - `[ ]` **5.4.c Add the temporary compatibility `merge-ok` alias**
        - Emit legacy `merge-ok` only from CI as a thin dependency on `ci-ok` during shadow mode; prevent the
          controller from using that name until the cutover removes the alias.
        - Test all-success/skipped/failure/cancelled shapes and assert no intermediate workflow revision omits today's
          required context.

    - `[ ]` **5.4.d Exclude repository controller tooling from the published CLI**
        - Keep review-gate scripts reachable by repo `tsx` and normal lint/typecheck/test gates but outside the tsup
          entry graph and npm `files` payload; add an explicit packaging/build assertion.
        - Confirm no new production dependency or published CLI command/API is introduced.

### `[ ]` **5.5 Independently review the runtime and CI slice**

- _Goal:_ A fresh reviewer certifies event reconciliation, spend idempotency, projection modes, workflow trust, and
  CI compatibility before ARC lifecycle actions begin depending on the controller.

    - Run the phase-completion quality gates, then give one fresh independent-analysis reviewer the spec, project
      orientation, and commit range after Task 4.4 through Phase 5.
    - Apply `independent-analysis/v1` with race, fork, secret, default-branch execution, required-context continuity,
      and ambiguous-request failure scenarios; settle verified findings and re-run affected gates.
    - Default to one pass; add another only when material fixes could alter reconciliation or gate truth.

## **Phase 6:** ARC PR lifecycle and project review coordination

_Purpose:_ Expose action-neutral PR-open hooks in shipped ARC, place them consistently across work-unit and
Errand integration, and make this repository's review workflow controller-driven and re-entry-safe.

### `[ ]` **6.1 Replace the action-named pre-PR extension pair**

- _Goal:_ Shipped ARC exposes retry-safe `pre-pr-open` and idempotent `post-pr-open` lifecycle hook points whose
  names describe events and whose action lists can host unrelated ordered project behavior.
- _Approach:_ Edit package source first and mirror framework sections deliberately into the self-hosting instance;
  remove the pre-public `pre-pr-review` surface rather than retaining an inert compatibility alias.

    - `[ ]` **6.1.a Add inactive placeholder-only canonical extension shells**
        - Create package/project `pre-pr-open.md` and `post-pr-open.md` with fire timing, retry/idempotency, sequential
          ordered-action, halt-on-failure, and platform-neutral contracts.
        - Define the explicit inputs as
          `proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }` for `pre-pr-open` and
          `openedChangeRequest = { repositoryRef, hostRef, headSha }` for `post-pr-open`; callers supply them, adapters
          validate/convert their opaque coordinates, and neither hook infers branch/WU state or assumes one PR per WU.
        - Keep packaged copies `active: false` with the exact placeholder-only `.actions`; leave this repository's
          `pre-pr-open` inactive.

    - `[ ]` **6.1.b Remove `pre-pr-review` completely**
        - Delete both extension files and every declaration, fire-point marker, link, inventory, fixture, and local
          CodeRabbit subagent action; do not migrate the old name or its `review.pre_merge` gating semantics.
        - Add corpus assertions that no live package/project surface declares or fires `pre-pr-review` while harmless
          historical WU artifacts remain outside the product scan.

    - `[ ]` **6.1.c Register the lifecycle pair and multi-action contract**
        - Update both extension READMEs plus package/project configurability strategy copies with action-neutral naming,
          actual fire points, ordered actions, retry/idempotency expectations, and WU/Errand coverage.
        - Preserve `[No extension configured]` as the exact inactive placeholder; represent configured actions as
          numbered authored-order blocks, execute them sequentially, and halt before later blocks on failure.
        - Preserve point-of-use workflow declarations and avoid a new action registry, loading flag, or config axis.

    - `[ ]` **6.1.d Update install/update inventories and extension validation**
        - Replace the old file across the init recipe, classification/manifest/pristine baselines, package-sync
          strategy count/list, and init/update/status/E2E/unit expected sets; assert both new shells are Configurable,
          package-neutral, resolvable from fire-point markers, and stable across update.
        - Exclude movable `.arc/{active,backlog,completed}` planning/history artifacts from the no-legacy-name product
          scan so sibling WU records are not rewritten.
        - Verify project-filled `.actions` survive three-way update independently for both hooks.

### `[ ]` **6.2 Rewire work-unit PR-open and final-head checkpoints**

- _Goal:_ Work-unit integration fires generic PR-open actions on the correct create/re-entry boundaries and performs
  the final review-coordination checkpoint only after every lifecycle- or review-authored head update.

    - `[ ]` **6.2.a Separate local diff preflight from PR-open hooks**
        - Remove the old extension from the `review.pre_merge`-gated diff-review step in both workflow copies; keep the
          local preflight and finding triage otherwise unchanged.
        - Declare `pre-pr-open`, `post-pr-open`, and `pre-merge-review` in workflow frontmatter at point of use.

    - `[ ]` **6.2.b Fire `pre-pr-open` only on the creation path**
        - Place the hook after the PR head push and immediately before `gh pr create`; document create failure/retry
          behavior and skip it whenever an open PR already exists.
        - Add static lifecycle fixtures for fresh create, failed-create retry, and integrating resume.

    - `[ ]` **6.2.c Fire `post-pr-open` on create and open-PR re-entry**
        - Enter the hook after an open PR is observed and before review iteration, whether this session created the PR
          or resumed one; require actions to derive current controller/PR state.
        - Verify the re-entry table routes an existing open PR through the hook without replaying creation actions.

    - `[ ]` **6.2.d Move `pre-merge-review` to the final open-PR head**
        - Fire after composition/sweep/final push and after each behind-base reconcile push, immediately before the
          integration interlock; loop back through review coordination when that head is stale or unresolved.
        - Treat every review-action commit/push as checkpoint invalidation: repeat base freshness and the final hook
          until no head change occurs and the controller reports the current head settled.
        - Assert no lifecycle- or review-authored commit can land after the stable checkpoint and before merge approval.

### `[ ]` **6.3 Rewire Errand PR creation, reuse, and review checkpoints**

- _Goal:_ Errands reuse an existing PR safely, coordinate review on every open-PR entry, and settle the current head
  before the integration interlock without duplicating provider spend.

    - `[ ]` **6.3.a Detect and reuse an existing Errand PR**
        - Paginate an exact repository/head-branch lookup before creation; preserve lean Errand body/lane behavior only
          on the no-match create arm.
        - Reuse one open match; treat one merged match for the current head as cleanup-only; stop on closed-unmerged,
          conflicting/multiple candidates, incomplete enumeration, or lookup failure without reopening, creating, or
          selecting silently.
        - Add workflow/static fixtures for absent, open, current-head merged, closed-unmerged, ambiguous, incomplete,
          and lookup-failure states.

    - `[ ]` **6.3.b Fire PR-open hooks at Errand boundaries**
        - Fire retry-safe `pre-pr-open` only after the push and before create; fire idempotent `post-pr-open` on both
          newly-created and already-open paths before review/merge coordination.
        - Declare the new extensions in both packaged and self-hosting workflow frontmatter.

    - `[ ]` **6.3.c Place final review before merge authorization**
        - Move `pre-merge-review` ahead of the integration interlock for reviewed and auto lanes, and require any
          controller-driven fix/request cycle to settle before PR status is surfaced for approval.
        - Invalidate the checkpoint after every fix push and repeat current-base/final-head review until the head is
          unchanged and settled; only then surface integration approval or reviewed-lane handoff.
        - Preserve the explicit integration approval boundary and unattended auto-merge cleanup semantics.

    - `[ ]` **6.3.d Assert WU/Errand lifecycle symmetry**
        - Add cross-workflow checks for creation-only pre hooks, create/resume post hooks, sequential action ordering,
          halt-on-failure, and final-head review placement without claiming the two lifecycles are otherwise identical.

### `[ ]` **6.4 Clarify local diff preflight boundaries**

- _Goal:_ `diff-review` remains a cheap author-side aggregate preflight and cannot be mistaken for independent PR
  review evidence or a default external-provider invocation.

    - `[ ]` **6.4.a Narrow the method contract without redesigning it**
        - Update both method copies to state the local authoring-agent scope, add correctness/error-path coverage to
          the existing checklist, and explicitly deny peer/independent evidence authority.
        - Preserve its generic invocability, `review.pre_merge` behavior at the integration caller, override slot,
          finding triage, cleanup, consistency, documentation, and unresolved-marker checks.
        - Add package/project content assertions for the boundary and absence of a default provider command.

### `[ ]` **6.5 Coordinate the project open-PR review cycle**

- _Goal:_ The self-hosting workflow enters through normalized controller decisions, spends review quota only with
  admission, and returns only when current obligations/findings/conversations are settled.

    - `[ ]` **6.5.a Rename and broaden the project workflow**
        - Replace `address-pr-review.md` with `coordinate-pr-review.md`, update title/purpose/references, and frame it
          as the whole open-PR review cycle rather than a CodeRabbit finding-only response loop.
        - Keep provider-specific request/observation mechanics behind controller commands and adapter summaries.

    - `[ ]` **6.5.b Route required, recommended, and exempt entry decisions**
        - Resolve one explicit target `hostRef`, then read its normalized current decision: observe eligible one-time
          automatic admission, recommend explicit refresh for checkpoint-only/later required heads, ask before raising
          recommended work, and no-op exempt work while retaining explicit `require`.
        - Make entry idempotent across `post-pr-open` and final `pre-merge-review` invocations without aggregating all
          PRs that a future work unit might own.

    - `[ ]` **6.5.c Drive the finding-response and coverage loop**
        - Fetch/triage findings, apply only approved fixes, run affected gates, push, then recommend full vs incremental
          refresh; invoke controller `refresh` rather than direct CodeRabbit commands.
        - Wait on external review without polling and re-enter from canonical controller state after completion.

    - `[ ]` **6.5.d Enforce closure authority in workflow operations**
        - Use provider-confirmed closure or an approved controller `dismiss` receipt before resolving a host thread;
          remove bare `resolveReviewThread` and provider ignore/request commands as authority paths.
        - Preserve concise defer/reject rationale and current-change-set verification.

    - `[ ]` **6.5.e Prepare inactive self-hosting action wiring**
        - Populate project `post-pr-open` and `pre-merge-review` with numbered actions invoking
          `coordinate-pr-review.md`, but leave both inactive until the trusted controller/App exist on `main`; keep
          `pre-pr-open` inactive and packaged copies placeholder-only.
        - Assert additional actions can be appended in authored order and an exempt Errand returns without provider
          review.

### `[ ]` **6.6 Independently review the ARC lifecycle slice**

- _Goal:_ A fresh reviewer certifies package/project extension replacement, WU/Errand hook timing, explicit target
  context, local-preflight boundaries, and project review coordination before rollout documentation freezes them.

    - Run the phase-completion quality gates, then give one fresh independent-analysis reviewer the spec, project
      orientation, and commit range after Task 5.5 through Phase 6.
    - Apply `independent-analysis/v1` with package-sync, create/resume/reconcile paths, retry/idempotency, ordered
      actions, PR-cardinality neutrality, and direct-provider/thread-closure escape paths in scope.
    - Default to one pass; add another only for substantive lifecycle or packaged-surface fixes.

## **Phase 7:** Rollout safety and repository-level coherence

_Purpose:_ Make the shadow-to-final transition, rollback, and App-outage recovery executable; then close the
cross-layer security, packaging, workflow, and architecture-description seams before verification.

### `[ ]` **7.1 Ship the cutover, rollback, and break-glass runbook**

- _Goal:_ A post-main operator can prove the App/provider contracts and move required contexts forward or backward
  without a missing gate, duplicate `merge-ok`, unreviewed repair, or admin merge bypass.

    - `[ ]` **7.1.a Document setup and shadow authentication probes**
        - Create `.github/review-gate.md` with private account-owned App settings/permissions, selected-repository
          install, separate Client ID/numeric App ID variables, and creation/repair of a default-branch-only
          `review-gate` environment before its private-key secret is written through authenticated local `gh`.
        - Carry the operational copy of the `independent-analysis/v1` rubric with its explicit initial
          `rubric_version`, and state the same-commit rule: a rubric change and its version change land in one
          reviewed commit.
        - Cover deployment-record inertness (environment-referencing jobs always mint records; rejected attempts
          leave failed records — bookkeeping, never an access path), exact App token permissions/current-repo scope,
          main-ref shadow dispatch, non-default secret denial, App source proof, spoof rejection, and
          credential/installation/environment failure probes.
        - Stream private-key creation/rotation from a protected file/stdin through authenticated `gh` without argv,
          log, or step-summary exposure; keep runtime credentials out of repository/user configuration, preserve App
          identity across key rotation, and treat App-id changes as prove-new-before-remove-old migrations.
        - State that ARC/package installation creates no hosted footprint; before this repository opts in, disclose
          the App permissions, tracked workflow/configuration, compact visible audit comments/notification potential,
          expected transition-only volume, outage blocking, and the durable gate guarantees received in exchange.

    - `[ ]` **7.1.b Define the provider and evidence live-probe matrix**
        - Cover exempt, recommended/accepted, required/clean/findings, stale/retarget, CodeRabbit trigger/retrigger,
          resolved-config exclusivity, direct commands, exact commit-status context/creator, full/incremental bounds,
          immutable finding ids, closure authority, capacity provenance/failure, waiver/dismissal, agent/human
          attestation, reservation ambiguity, repair, and bare-thread-resolution rejection.
        - Prove `status` wakes CodeRabbit progress, CI completion wakes through filtered `workflow_run`, review events
          traverse the secretless relay, multi-PR candidates receive distinct concurrency lanes, and an open PR with no
          gate is found by scheduled repair.
        - Probe expected native `REVIEW_REQUIRED | CHANGES_REQUESTED | APPROVED` mapping without parsing CODEOWNERS;
          keep self-hosting formal Code Owner enforcement disabled and route reusable team setup/doctor verification to
          the downstream GitHub adapter.
        - State the fallback for every unproven native contract: explicit request or generic attestation, never inferred
          satisfaction.
        - Record the evidence needed for the cutover PR to enable CodeRabbit's satisfying declaration; leave it
          disabled when any required capability remains unproven. Note that enablement additionally authors the
          rubric-implementing provider review instructions, versioned under `rubric_version` in the same reviewed
          commit.

    - `[ ]` **7.1.c Script the required-context cutover and normal rollback**
        - Give exact inspect/mutate/verify commands for temporary `ci-ok + review-gate-shadow`, legacy alias removal,
          probe-backed qualification enablement (when earned), resulting policy-version invalidation, dual re-proof,
          App-owned `merge-ok` pinning, final cleanup, and reverse ordered rollback.
        - Activate project `post-pr-open` and `pre-merge-review` only in the cutover PR after shadow proof; explicitly
          invoke `coordinate-pr-review.md` for that PR because its integration session may hold the pre-activation
          extension snapshot, then verify later sessions discover the active actions normally.
        - Begin every step with an exact before-state comparison across mode, contexts/source ids, App/environment,
          and action activation; make mutation commands idempotent or compare-and-stop guarded, log the verified
          after-state, resume from the last proven checkpoint after interruption, and stop on unexpected divergence.
        - Require exact-head green proof after every mutation and retain the last proven pair on any failure. After
          final enforcement is proven, require a narrow final-gated closeout PR that updates
          `TECHNICAL-OVERVIEW.md` from shadow delivery to current final architecture before unpausing the dependent WU.

    - `[ ]` **7.1.d Script audited App/controller-outage recovery**
        - Define merge freeze, incident/ruleset snapshot, exact-head independent `ci-ok` proof, repair-PR producer
          guard, add-before-remove requirement mutation, normal protected merge, shadow restoration, and final
          re-promotion.
        - When coordination cannot reach the App/controller, make the repair PR deactivate the dead project actions
          and record the incident-scoped suspension instead of retrying them. Require one fresh Codex CLI, Claude Code,
          or qualified-human `independent-analysis/v1` review of the exact repair diff, linked visibly in the PR and
          incident without fabricating a controller receipt.
        - After shadow restoration, require a reactivation PR, explicit `coordinate-pr-review.md` invocation for its
          possibly stale extension snapshot, and proof that later sessions load the restored actions before final
          promotion and merge unfreeze.
        - Include a non-final rehearsal before cutover and prohibit `--admin`, direct base push, or empty requirements.

### `[ ]` **7.2 Close workflow and packaging regressions**

- _Goal:_ Cross-layer tests prove the repository integration as a whole—core/adapters/runtime/workflows/package
  content—without weakening ARC distribution or current CI behavior.

    - `[ ]` **7.2.a Add end-to-end controller contract fixtures**
        - Exercise canonical re-query through policy, receipts, provider/native evidence, admission, verdict, and GitHub
          projection for representative exempt/recommended/required, findings, stale, failure, waiver, and repair paths.
        - Cover the integrated behavior after the component contracts are in place:
            - Event and scheduled entry paths converge on the same receipt/check state.
            - No fixture can make the gate green through missing evidence, spoofed authority, or capacity mutation.

    - `[ ]` **7.2.b Harden and assert workflow trust domains**
        - Pin every external action in the three review-gate workflows and CI to a full commit SHA, including existing
          CI checkout/setup actions; preserve maintainable version comments or dependency-update metadata.
        - Assert the secretless relay has no checkout/write credential; privileged controller/attestation jobs check
          out only `github.workflow_sha` and own the App environment; CI intentionally checks the event head with a
          read-only token and cannot author receipts or controller checks.
        - Parse event sets, environment/permission scope, candidate fan-out/concurrency, fork safety, structured input
          transport, no-download execution, and nonrecursive check handling according to those distinct trust domains.
        - Assert every workflow file is valid YAML and every referenced script/policy path exists on the default branch.

    - `[ ]` **7.2.c Verify package/project extension and update behavior**
        - Run init/update/E2E assertions for the new extension pair, removed name, configurable action preservation,
          workflow declarations/fire markers, inactive implementation state, cutover activation instructions, numbered
          action/failure guidance, explicit invocation inputs, and package neutrality.
        - Confirm methodology edits are synchronized package-to-project without clobbering self-hosting `.actions`.

    - `[ ]` **7.2.d Verify build, publish, and dependency boundaries**
        - Inspect build/import output and the JSON file manifest from
          `npm pack --dry-run --json --workspace @arc-framework/cli` so repo-only controller/policy/host/provider
          sources and self-hosting workflows/config/runbook do not ship as CLI runtime/API while canonical ARC
          extension shells do.
        - Assert no new production dependency, CLI command, git-config key, review-provider setting, or generalized
          provider registry landed.

### `[ ]` **7.3 Describe the delivered shadow architecture**

- _Goal:_ Project architecture documentation accurately describes what the implementation PR delivers and leaves
  final-enforcement wording to the post-main operational closeout.

    - `[ ]` **7.3.a Update the technical overview at the architecture trigger**
        - Replace the CI-only merge-gating description with `ci-ok`, compatibility `merge-ok`, the shadow App/controller
          architecture, repository-only TypeScript core/adapters, CodeRabbit/generic attestation paths, and the no-
          webhook/service-runtime App boundary.
        - Describe the delivered shadow state as current fact, not the future final state or WU history; ensure the
          runbook owns operational transition detail and the final-gated closeout PR owns the current-fact final edit.

    - `[ ]` **7.3.b Record the architecture decision record**
        - _Goal:_ The decision cluster survives WU archival in a durable internal home that future sessions consult
          before reopening any of its calls.
        - Write the next-numbered ADR in `.arc/reference/adr/` covering: the evidence-composed App-owned required
          check replacing the CI-only rollup, receipt-over-comment authority, typed non-substitutable requirements,
          the provider-neutral core/host-adapter split, and the probe-revisable CodeRabbit non-satisfying
          determination (with its spike-evidence basis and the enablement path that would revise it).
        - Follow the ADR methodology's stability tiers; keep the record internal-only (no references from
          adopter-facing surfaces) and free of WU/task provenance beyond the standard decision context.

### `[ ]` **7.4 Independently review the rollout and coherence slice**

- _Goal:_ A fresh reviewer certifies the live-transition instructions, outage recovery, cross-layer fixtures,
  packaging boundary, and shadow architecture before whole-WU verification attacks the complete composition.

    - Run the phase-completion quality gates, then give one fresh independent-analysis reviewer the spec, project
      orientation, and commit range after Task 6.6 through Phase 7.
    - Apply `independent-analysis/v1` with command/runbook executability, never-empty context transitions, break-glass
      safeguards, publish contents, and documentation truth in scope; settle verified findings and re-run gates.
    - Default to one pass; add another only when a material operational fix changes the transition or trust model.

## **Phase 8:** Verification

_Purpose:_ Validate the settled implementation and planning record against the complete reviewed design.

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The delivered review gate, lifecycle wiring, rollout contract, and documentation satisfy the complete
  reviewed design and are ready for integration.

---

## Success Criteria

- `[ ]` Stable change-set and policy identities determine review disposition independently of CI history or capacity.
- `[ ]` Self-hosting lane, ownership, risk, and reason-code matrices fail safe for every unknown or ambiguous input.
- `[ ]` Core requirements, evidence, admission, and verdict logic remain host/provider/runtime/harness neutral and
  scope one explicit change request without assuming work-unit PR cardinality.
- `[ ]` Every satisfying independent-analysis source proves rubric, exact coverage, durable findings/results, and
  explicit closure behavior.
- `[ ]` Typed human, agent, deterministic-tool, and specialist evidence cannot substitute outside declared source sets.
- `[ ]` Full/incremental chains are contiguous and authority-valid; stale evidence and unclosed findings remain
  blocking.
- `[ ]` Automatic-eligible admission spends once for a required ready requirement; checkpoint-only topology and later
  heads wait for an authorized, deduplicated checkpoint without weakening obligation.
- `[ ]` Receipt-store versions, reservations, acknowledgements, generations, alternates, timeouts, and out-of-band
  evidence remain durable and idempotent, with no duplicate controller invocation attempt.
- `[ ]` Commands, waivers, dismissals, and agent/human attestations are permission-checked, scoped, and receipted.
- `[ ]` Individual native reviews and GitHub's expected aggregate review decision compose truthfully without parsing
  CODEOWNERS, inventing owner identity, or treating host approval as independent analysis.
- `[ ]` `merge-ok` is green only when readiness, mergeability, freshness, CI, requirements, findings, and conversations
  are satisfied or validly waived.
- `[ ]` Trusted reconciliation checks out only `github.workflow_sha`, receives review events through a secretless
  relay, maps status/CI/schedule wake-ups through read-only discovery into distinct per-PR concurrency lanes, handles
  forks safely, and repairs missing initial gates without replaying ambiguous spend.
- `[ ]` The environment-protected, permission-narrowed current-repository App token keeps Client ID separate from
  numeric evidence identity; receipt storage/checks reject GitHub Actions, wrong Apps, non-default secret access,
  missing credentials/installations, mutable resemblance, edits, forks/regression/truncation, and stale/malformed
  state.
- `[ ]` CodeRabbit inheritance is resolved and probed for trigger exclusivity; ARC emits only reserved one-shot
  requests, reports direct/unadmitted spend honestly, and requires proven commit-status, result, coverage, capacity-
  provenance, immutable-finding, and closure signals before cutover enables its satisfying declaration.
- `[ ]` Maintainer-attested fresh Codex CLI, Claude Code, and CodeRabbit CLI runs plus qualified-human reviews can
  satisfy allowed requirements only through durable attestations that distinguish authenticated submitters from
  claimed agent/run provenance.
- `[ ]` Package/project ARC surfaces replace `pre-pr-review` with inactive placeholder-only `pre-pr-open` and
  `post-pr-open` shells wired across WU and Errand create/resume boundaries with explicit target context.
- `[ ]` This implementation prepares inactive project `post-pr-open` and final-head `pre-merge-review` actions; the
  post-main cutover activates them for controller-driven coordination while `diff-review` remains non-independent
  author preflight.
- `[ ]` Shadow rollout, cutover, rollback, and App-outage recovery preserve a truthful non-empty required-context set
  without name collision or protection bypass, suspend/restore dead actions explicitly, and require durable
  independent review of any break-glass repair.
- `[ ]` Repository-only review-gate tooling remains outside the published CLI and adds no user or receipt-store config,
  production dependency, CLI surface, or premature provider registry.
- `[ ]` Technical and operational documentation describes the delivered shadow state, executable cutover contract,
  and required final-gated current-fact closeout.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
