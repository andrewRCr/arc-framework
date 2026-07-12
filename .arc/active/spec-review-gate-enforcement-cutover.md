# Spec (`detailed` · `RFC`): Review Gate Enforcement Cutover

- **Origin:** [internal]

- **Purpose:** Complete the self-hosting review controller with provider-neutral request execution, passive
  exact-head waiting, hosted CodeRabbit and Codex evidence adapters, conversation settlement, and an independent
  outage-repair path. Ship those capabilities and their fail-closed qualification machinery without replacing the
  repository's legacy required CI authority.

---

## Introduction / Context

The repository already has a host/provider-neutral review core, GitHub reconciliation, authenticated App receipts,
check projection, CodeRabbit integration, generic attestations, and secretless wake-up discovery. It does not yet
provide the complete practical PR lifecycle: a qualifying review is not always requested automatically, the
PR-opening agent has no durable action when a hosted provider requires that developer's identity, and the agent must
be manually prompted to notice provider results after multi-minute latency. Provider artifacts also occupy different
GitHub surfaces, and a same-head artifact is not necessarily caused by the controller's request.

Live probes established the concrete constraints. Hosted Codex accepts a developer-authored `@codex review`, reports
findings as a full-commit review, reports a clean result as an issue comment carrying a reviewed SHA prefix, leaves
older findings unresolved, and rejects an ARC-App-authored request because the App actor has no connected Codex
account. CodeRabbit can submit an empty approval after an unrelated review thread is resolved, so native approval is
not substantive evidence. GitHub App installation tokens are becoming longer opaque values; both the classic and
stateless formats work with the current controller when treated opaquely.

This work completes the inactive controller and the machinery needed to qualify it from immutable default-branch
code. `review-gate-enforcement-qualification` owns the live qualification and provider-policy activation that follow
this delivery; `review-gate-enforcement-promotion` then owns required-check and project-hook promotion.

## Goals

- Make an applicable PR enter a durable pending review state before any hosted provider request can take effect.
- Let the PR-opening agent perform a provider request that requires its authenticated developer identity without
  inventing App credentials or waiting for manual user coordination.
- Return control to that agent when CI or aggregate review state changes, without consuming model work during the
  wait or coupling the watcher to provider prose.
- Build fail-closed qualification for hosted CodeRabbit and hosted Codex that can retain useful partial capabilities
  and enable only baseline-proven satisfying adapters under deterministic fallback policy.
- Bind provider evidence causally to one controller-owned request generation, the exact frozen PR head, pinned
  identities, and versioned semantics.
- Settle every finding at its original GitHub conversation locus and prevent pushes from silently invalidating an
  active review.
- Provide a preinstalled, Actions-pinned and exclusive-writer-proven recovery authority that can replace an
  unavailable App check without an empty required-check interval or an administrative merge bypass.
- Provide the default-branch probes and typed evidence contracts that the qualification work uses to prove App scope,
  token formats, event routing, waiting, provider outcomes, fallback, and outage recovery before promotion.
- Produce an extraction-ready contract boundary and qualification handoff that the planned
  `review-gate-github-adapter` can productize for ARC installations without reimplementing review semantics.

## Non-Goals

- Do not change classic branch protection or the `main-protection` ruleset's required-check authority.
- Do not activate project `post-pr-open` or `pre-merge`; their final activation belongs to the promotion work.
- Do not disable CodeRabbit's native `request_changes_workflow` until the ARC App check is required.
- Do not add Code Owner enforcement or claim generic GitHub approvals are human governance.
- Do not ship the adopter-facing GitHub adapter, public ARC CLI setup surface, webhook service, or durable external
  queue in this work. This delivery must remain extraction-ready; productization is deferred, not rejected.
- Do not add API-billed review providers or evaluate Copilot, Grok, or hosted Claude as speculative fallbacks.
- Do not execute live qualification or record observed capability values in this work; those require the merged
  implementation and belong to `review-gate-enforcement-qualification`.

## Proposed Design

### 1. Extend the neutral request and projection contracts

Treat this repository as the first qualified installation, not the product boundary. Keep neutral state machines,
request execution, evidence, fallback, conversation settlement, waiting, and head-mutability checks free of
self-hosting policy and GitHub installation mechanics. Keep Git-host behavior behind `GitHostAdapter`, provider
behavior behind `ReviewProviderAdapter`, receipt persistence behind `ReviewReceiptStore`, and execution/projection
behind injected ports. Repository policy supplies lane thresholds, provider order, identities, labels, check names,
workflow names, and qualification declarations.

The neutral contracts remain repository-internal source during this work, but their exported types and injected
boundaries are the handoff consumed by `review-gate-github-adapter`. Self-hosting launchers may bind them to `gh`,
GitHub Actions, and this repository's policy; neutral reducers and validators may not import that policy or assume a
specific App, provider, repository, workflow filename, or protection layout.

Extend the neutral request/receipt state to carry:

- repository, change request, requirement, full change-set identity, policy and rubric versions;
- provider identity, coverage bounds, generation, and request key;
- request mechanism and required transport actor;
- reservation, pending-projection, trigger, acknowledgement, and terminal timestamps;
- the owned trigger event id and actor;
- terminal evidence ids, finding ids, settlement state, contamination, and supersession.

The review-gate extensions remain inactive, no open PR exists, and a repository-wide GitHub comment scan found no
persisted receipt marker. The merged request/receipt code is therefore unused development scaffolding, not a deployed
protocol. Replace it before activation with one definitive schema-version-1 request and receipt contract; do not
carry a compatibility parser, mixed-ledger mode, schema-upgrade receipt, or terminal-proof migration path.

The closed parser rejects obsolete pre-activation shapes rather than silently defaulting them. Canonical request keys
and receipt hashes bind every causal field and predecessor version. The comment store preserves that exact identity,
and the ledger validates linear envelope order, immutable records, idempotency, anchor parity, and semantic
congruence through one code path. Expose stable contract name/version constants beside the hand-written codec so a
future schema-library implementation can replace its internals without creating a parallel consumer-facing type.

Expose actor-dependent work as one canonical `needs-user-trigger` action containing the request key, provider, exact
full head, generation, exact command text, and required GitHub actor id. This action is controller state, not prose
inference. Self-hosting policy selects `pr-author` for hosted Codex; admission resolves the PR author's immutable
GitHub user id. A different authenticated actor cannot consume the action. The downstream adapter may support an
explicit project/user actor mapping, but each admitted action still resolves to one exact actor id.

Implement two reusable action operations with repository-only launchers:

- `review-gate:next-action` re-queries the authenticated App projection/receipt ledger and neutral reducer for the
  exact PR/head, then returns a typed action or terminal/attention state as JSON. It never extracts commands from
  display prose.
- `review-gate:perform-action` accepts the exact request key, generation, PR, and head; revalidates the current action
  and the current `gh` actor; posts the exact command once; adopts an ambiguously returned post only after exact
  actor/body/time re-query; dispatches default-branch reconciliation; and returns the posted/adopted comment id. The
  controller independently re-queries GitHub and binds that event id before acknowledging the request.

A projection remains pending for trigger-required/queued/running work, provider latency, unavailable capacity
knowledge, ambiguous delivery, grammar drift, unsettled findings, waiver review, or timeout requiring explicit
repair. Only qualifying current-head evidence plus complete settlement produces success.

The ARC App projection is the aggregate machine-review state. `ci-ok` remains an independent Actions-owned CI state;
provider-native checks and approvals are inputs only. Exempt changes await `ci-ok`. Reviewed changes await the
aggregate projection, which incorporates CI, provider request/evidence, finding settlement, native blocking review
state, waiver, fallback, and timeout.

### 2. Enforce pending-first execution and a frozen review head

For every required request, execute in this order:

1. Append the durable reservation with optimistic ledger versioning.
2. Publish the App's pending aggregate check on the exact head.
3. Re-read GitHub and confirm the pending projection exists on that head from the pinned App.
4. Initiate the provider effect or expose `needs-user-trigger`.
5. Bind acknowledgement and terminal observations to the reservation.

A confirmed pending trigger, acknowledgement, queued state, or running state is an active request flight and freezes
the head. `coordinate-pr-review` and `integrate-work-unit` must not push while the flight is live. Clean, findings,
failed, or unavailable is a terminal provider result and ends that flight; it does not by itself make the aggregate
gate successful or close findings.

After terminal findings, the same head remains blocked but is not trapped. A DEFER/REJECT disposition settles on that
head without a push. For FIX, the coordinator prepares the local fix, records a `begin-fix` transition naming the
terminal request and carried finding ids, then receives authorization for exactly one push to a new head. That
transition supersedes the old request generation for satisfaction while preserving its findings as a required
lifecycle tail on the new change set. Reconciliation of the new head consumes the authorization, invalidates any
unused replay, and admits follow-up review only after the new pending projection is confirmed. A non-terminal flight
uses explicit abandon/supersede/restart before any head change.

Implement a reusable exact-head mutability query over the host and receipt ports, then expose it here through a
repository-only `review-gate:assert-head-mutable` launcher. Invoke that launcher immediately before workflow-driven
pushes whenever an opened change request exists. It rejects an active flight, stale/ambiguous head, missing
`begin-fix`, or reused head-update authorization. Do not add a repository-wide git pre-push network hook: pushes
without an opened PR have no review flight, while the PR coordination fire sites have the canonical change-request
context needed for a deterministic guard. The downstream GitHub adapter may expose the same neutral query through
its supported CLI surface.

Ambiguous writes are never repeated blindly. After an ambiguous comment or label response, re-query by reservation
time, exact actor, exact body/label, and current head. A confirmed existing event is adopted; absence remains
ambiguous and blocking until explicitly repaired.

### 3. Establish an exclusive trigger window

Provider output has no controller request id. Causal attribution therefore requires an exclusive trigger window:

1. Qualification proves automatic, inherited, global, keyword, and alternate unowned request paths disabled for the
   repository's selected mode.
2. Before requesting, scan the entire PR—not only the current head—for earlier unowned provider triggers/effects.
3. Record every command/label event with its PR-wide event id, actor, body/label digest, event time, and the canonical
   PR head observed when the event occurred. Label attribution uses immutable GitHub timeline events.
4. Record the controller-owned label/comment event and head snapshot on the reservation. An owned comment must remain
   present, unedited, actor/body-identical, and bound to that snapshot through terminal acceptance and while its
   evidence is current.
5. Accept terminal evidence only after that event, for its frozen head, with no intervening trigger through terminal.

Any direct collaborator or provider command outside the owned event contaminates the generation. Its artifacts cannot
satisfy or waive the requirement. Do not start fallback or a replacement generation while that unowned effect could
still be live. A head push does not terminate a PR-wide command effect; require provider-specific terminal/cancellation
evidence for the event's head before a later generation proceeds. An edit or deletion invalidates an owned trigger and
its rubric delivery; its effect remains potentially live until terminal proof, after which a new owned generation is
required.

Route `issue_comment` created/edited/deleted and label/unlabel events. For deletion, the default-branch wake-up path
records a bounded GitHub-event tombstone containing comment id, actor, prior body digest, event time, and observed PR
head before canonical re-query loses the comment. Existing comments and timeline events are repaired by scheduled
scans; qualification proves the event/tombstone path from controller activation onward and fails closed for a PR whose
pre-activation trigger history cannot be established. Temporal order and head equality without this PR-wide lifecycle
are insufficient.

### 4. Qualify CodeRabbit without making it all-or-nothing

Retain the existing CodeRabbit provider boundary and evolve its declared capabilities from observed evidence rather
than provider branding. Generation zero uses the ARC-App-authored `arc-review-gate` label; later full-coverage
generations use a controller-authored `@coderabbitai full review` comment. Bind the exact label or comment event to the
reservation and prove the resolved repository configuration has no bypassing automatic path.

Qualifying satisfaction requires pinned provider identity, durable distinct clean/findings outcomes, exact current-
head full coverage, policy/rubric binding, stale rejection, finding enumeration, and a declared settlement capability.
The visible `CodeRabbit` status is wake-up/progress evidence, never a verdict by itself. An empty native approval is
non-satisfying without the reservation and substantive full-head evidence.

Record one of two valid qualification outcomes:

- **Satisfying:** enable `coderabbit-pr` in the hosted policy and author the reviewed provider instructions for
  `independent-analysis/v1` in the same semantics-version change.
- **Partial/non-satisfying:** retain any proven request, progress, or finding-observation capabilities, but disable it
  as a satisfying source. Do not globally discard useful observations or weaken the aggregate gate to admit them.

A proven pre-effect rate-limit rejection or explicit capacity exhaustion may select the next adapter. Unknown
capacity permits one owned attempt. Paused, skipped, oversized, acknowledged-silent, or ambiguous outcomes remain
blocking unless a terminal observation proves no provider effect remains live.

### 5. Add a hosted Codex PR adapter

Implement `codex-pr` behind the same neutral adapter contract. Keep repository-global automatic Codex review disabled
so selective requests retain exclusive attribution. Add a top-level `AGENTS.md` `## Review guidelines` contract for
`independent-analysis/v1`: intent/scope, correctness/failure behavior, trust/compatibility, verification, and
coherence/maintainability. The rubric version changes with the guidance. Qualification resolves the effective
`AGENTS.md` guidance for every changed path, rejects missing/conflicting nested guidance, and records its digest.

For an admitted request, return `needs-user-trigger` with a developer-authenticated command that names
`independent-analysis/v1`, repeats its five focus dimensions, and invokes `@codex review`. This uses both documented
Codex review-guidance transports: durable repository Review guidelines and explicit one-off focus in the owned PR
comment. The PR-opening agent consumes the action through `review-gate:perform-action`; a bare `@codex review` is an
unowned contaminating trigger.

Pin Codex GitHub App id `1144995` and bot user id `199175422`. Version and fail-close both semantic parsers:

- **Findings:** require a standard submitted Codex review whose full `commit_id` equals the requested frozen head;
  enumerate its durable review-comment findings.
- **Clean:** require an unedited App/bot issue comment anchored by `Codex Review:`, the exact
  `Didn't find any major issues.` clause, and exactly one `Reviewed commit` marker. Resolve the displayed SHA prefix
  to one repository commit and require equality with the frozen full head.
- **Unavailable:** recognize only the pinned connected-account response grammar/link when it is the earliest
  qualifying response after the owned trigger, before any next generation, on the frozen head, with no competing
  trigger.

Unknown or changed grammar remains pending. A later clean review does not resolve or claim verification of older
Codex threads. The coordinator owns those conversations under the settlement rules below.

Codex is satisfying only when qualification proves the current guidance digest, owned rubric-bearing trigger, pinned
identity, uncontaminated exact-head result, and controlled probe cases exercising every rubric dimension. A rubric or
guidance change lands with its version change and re-runs qualification. Ledger metadata alone never proves rubric
delivery.

Connected-account unavailability is a separately qualified capability. The observed App-authored response validates
only pinned grammar/identity fixtures because the App actor is inadmissible under production `pr-author` policy. With
the current connected PR author, self-hosting declares this capability `parser-only/non-terminal`: a matching response
remains blocking diagnostic evidence and cannot auto-fallback. Enable terminal `unavailable` only after a disposable
PR authored by an admissible, intentionally unconnected configured actor live-proves the complete owned-trigger path;
otherwise explicit repair handles loss of entitlement. Do not create or disconnect an account merely to satisfy
qualification.

### 6. Select fallback deterministically

The versioned self-hosting policy order is `coderabbit-pr`, then `codex-pr`; disabled/non-qualified entries are
skipped. At least one hosted adapter must be enabled and live-proven before completion. Automatic fallback is legal
only for:

- explicit capacity exhaustion before an effect;
- a proven pre-effect rejection such as a rate-limit response; or
- an explicit terminal provider failure proving no effect remains live.

Record source supersession before admitting the alternate, and keep at most one live source per requirement
generation. Effect-ambiguous delivery, acknowledged silence, ambiguous terminal artifacts, or contaminated windows
never auto-replay or auto-fallback. CLI agent and qualified-human attestations remain explicit, authorized repair
paths, not automatic policy entries.

### 7. Share one passive await transport while retaining distinct semantics

Implement the await state machine as a reusable runtime over injected host reads, clock, backoff, and output ports.
Expose it here through a repository-only `review-gate:await` launcher. Its inputs are repository, PR number, expected
full head, wait kind (`ci` or `review`), polling interval, and timeout; its JSON output reports typed state transitions
and a typed terminal result. The self-hosting launcher authenticates through the current developer's `gh` session,
reads only canonical GitHub state, verifies the PR head on every cycle, and never receives the App private key or
installation token. `review-gate-github-adapter` later wraps the same runtime in its supported installation/CLI
surface rather than cloning its semantics.

For `ci`, observe source-pinned `ci-ok` on the expected head. For `review`, observe only the ARC App's aggregate check
and its bounded controller detail/receipt reference; never parse CodeRabbit, Codex, or other provider prose locally.
Poll at low frequency with bounded backoff and emit output only when the normalized state changes. Waiting performs
no model inference and exits on success, failure, stale head, timeout, authentication failure, or malformed/ambiguous
projection. A missed GitHub event therefore delays reconciliation only until scheduled repair; it cannot make the
local watcher miss a terminal aggregate state.

Update the project PR coordination workflow so the PR-opening agent:

1. dispatches admission and reads canonical state through `review-gate:next-action`;
2. performs a matching `needs-user-trigger` through `review-gate:perform-action` when present;
3. starts `review-gate:await` for the exact head;
4. re-enters coordination on each terminal/attention result; and
5. repeats after fixes and a new owned generation until settled.

The GitHub wake-up workflow remains the controller's event transport. Expand its safe proxy coverage for review,
review-comment, issue-comment creation/edit/deletion, label/unlabel, status, check, and CI workflow completion events.
A coordinator-owned thread mutation dispatches exact-PR/head reconciliation directly. Scheduled discovery is the
repair backstop, not the normal latency path.

### 8. Settle findings at their original conversation loci

Provider satisfaction and conversation settlement are separate capabilities. Each adapter declares whether it can
settle its own findings. For every finding:

- **FIX:** land the fix before requesting the applicable follow-up review; preserve the head freeze while that review
  is active. After terminal findings, record `begin-fix` before the one authorized new-head push; carry the finding
  ids into the new head's lifecycle tail.
- **DEFER/REJECT:** reply directly to the original inline comment/thread with a repository-language rationale before
  recording closure.
- **Provider-owned closure:** accept only a qualified provider closure tied to the known finding.
- **Coordinator-owned closure:** post the direct reply and resolve the thread only after policy permits it, then
  dispatch exact-head reconciliation.

Project policy resolves `authorizedFindingActors`; self-hosting selects the PR author only when that actor has
maintain permission, otherwise one configured maintainer. A bare GitHub thread resolution or actor membership in a
broad native-review set is never closure authority.

The coordinator-owned sequences are exact:

- **FIX:** terminal findings → authorized `begin-fix` receipt with carried ids → one new-head push → exact-head CI and
  a qualifying full-head follow-up provider result → authorized `fixed` receipt naming the original finding, fix head,
  verification refs, follow-up evidence ref, and durable direct-reply id → thread resolution → reconciliation. The
  follow-up may contain other findings but cannot carry a source-confirmed recurrence of the issue being closed. The
  reply says the coordinator addressed and verified the fix; it never claims the provider verified that individual
  fix.
- **DEFER/REJECT:** an authorized disposition receipt names the finding, decision, bounded rationale, and direct-reply
  id on the unchanged head before resolution.
- **Provider-owned:** accept only a source-confirmed closure from the finding's qualified source identity.

Add dedicated receipt actions and reducers for these transitions. `knownHostActors` alone cannot authorize closure;
the reducer checks policy-resolved actor, sequence, exact heads, finding lifecycle tail, and durable event references
before removing a finding from the aggregate blocker set.

Commit messages and top-level PR comments may summarize but never close an inline finding. Do not claim a provider
verified an individual fix unless its evidence actually establishes that. PR bodies, review replies, and summaries
must use ordinary repository and engineering language; methodology-internal work-organization vocabulary is not
load-bearing on reviewer-visible surfaces.

### 9. Preinstall an independent outage-repair authority

Add `.github/workflows/review-gate-repair.yml` during this work, while the App is not required. The workflow:

- runs only by `workflow_dispatch` from immutable default-branch code;
- uses `GITHUB_TOKEN` with `statuses: write` and no ARC App credential;
- validates a bounded attestation manifest through the existing `independent-analysis/v1` validator against live
  repository, PR, author, diff base, change set, exact frozen head, policy, rubric, runtime, and freshness;
- accepts maintainer-attested qualified agent evidence or an authenticated non-author human review;
- writes `review-repair-ok` to that exact head through GitHub Actions App id `15368`.

Provision a dedicated, secretless `review-gate-repair` environment through a compare-and-stop operator procedure.
Its deployment policy resolves and admits only the live repository default branch; no other workflow references it.
Qualification verifies the environment and its branch policy from live GitHub state before any repair dispatch.

GitHub enforcement pins `{context, app_id}` and therefore identifies the GitHub Actions producer family, not an
individual workflow. Complete the authority with a closed privileged-job invariant. Repository Actions defaults are
live-proven read-only and every workflow declares explicit permissions. The repair validation job has read-only
permissions; the separate writer job alone receives `statuses: write`, uses no checkout, reusable/local/remote
action, dependency install, repository/organization secret, or dynamic called script, and performs one inline,
constant-context status write only after rechecking its bounded validation output and the live PR head. The static
audit resolves workflow/reusable-call permissions and rejects every other Actions-token writer or repair-environment
reference. A PAT or another App cannot produce Actions App id `15368` and is excluded by the required source pin,
rather than by an impossible repository-wide secret scan. Qualification and every repair dispatch compare the live
repository setting, environment policy, immutable default-branch workflow, and exact writer-job shape before
accepting the status. The status target links the exact run, workflow path, workflow SHA, PR, and head, which the
operator proves before changing enforcement. This authority is **Actions-pinned and exclusive-writer-proven**, not
workflow-source-pinned by branch protection alone.

The repair PR may not change the emergency workflow, permission/call graph, exclusive-writer validator, or attestation
validator and use that changed code as its own authority. If it changes the normal `ci-ok` producer, it also needs
independent unchanged CI/reviewer proof. Rehearse the complete add-before-remove sequence while the App projection
remains non-required: prove `ci-ok`, attestation, and exclusive-writer audit; create and prove `review-repair-ok`; add
it while the App context remains present; then remove the unavailable App context. Restoration performs the reverse:
add and prove the restored App context before removing `review-repair-ok`.

### 10. Deliver inactive machinery and hand qualification forward

The single implementation delivery PR contains the contracts, runtimes, adapters, watcher, workflows, behavior
guards, tests, runbook, the self-hosting review-gate section of `TECHNICAL-OVERVIEW.md`, and the sanitized evidence
schema. Keep `post-pr-open` and `pre-merge` inactive and leave legacy CI `merge-ok` required. Do not mutate provider
policy from live observations or promote enforcement in this work. After ordinary delivery verification, integrate
and archive this work through the normal lifecycle.

Publish a sanitized extraction and qualification handoff that identifies reusable core contracts and ports, self-
hosting-only policy/configuration, GitHub/provider implementations, workflow execution assumptions, typed result
slots, source-identity requirements, token behavior, repair behavior, and unresolved productization constraints. It
contains no invented live capability values. The handoff must let `review-gate-enforcement-qualification` execute
the shipped probes without reverse-engineering the controller, and later let `review-gate-github-adapter` productize
the accepted boundary without moving policy into the neutral core.

The repository-only qualification coordinator is a hybrid boundary. A local developer-authenticated launcher verifies
a clean checkout at an immutable remote default-branch SHA, owns resumable private checkpoint files, performs only the
typed actor-executable actions assigned to the authenticated developer, and emits a sanitized result candidate. It
dispatches `.github/workflows/review-gate-qualify.yml` for App-authenticated and forced-token probes; that workflow
runs only from the default branch in the existing protected `review-gate` environment, accepts bounded repository/PR/
head/matrix inputs, and returns no credential-bearing output. The coordinator re-queries every result from GitHub and
refuses a changed default branch, incomplete matrix, checkpoint mismatch, fixture result, or unshipped implementation.

A deterministic activation compiler maps a typed baseline result into exact checked-in provider-policy declarations
and a provisional sanitized-manifest patch. The candidate binds source/actor identities, parser and rubric/guidance
versions, every capability outcome, terminal-unavailable mode, baseline default-branch SHA, and checkpoint hashes. A
diff validator permits only that generated policy/manifest delta and rejects manual additions, omissions, version
drift, or extra paths. The shipped runner can then re-execute the complete matrix through the enabled immutable
default-branch policy and emit a `CutoverAcceptanceProof` candidate.

The dependent qualification work unit owns baseline execution, activation delivery, failure repair/rerun, and the
provisional observed manifest. Promotion begins by rerunning the full matrix through the enabled policy and producing
the final sanitized proof before any required-check mutation. Live-only claims therefore never masquerade as this
implementation delivery's verification.

## Alternatives & Rationale

### Rely on provider-native checks and approvals

Rejected. Hosted Codex has no native check, provider outputs use different GitHub surfaces, and CodeRabbit produced an
empty approval without a qualifying CodeRabbit request. Native artifacts remain useful evidence and wake-up signals,
but the authenticated aggregate App projection is the only coherent machine-review verdict.

### Let the ARC App post every provider command

Rejected. The Codex probe proved the App bot does not inherit the developer's hosted subscription entitlement.
Actor-executable actions preserve selective hosted review without API billing and keep the authenticated developer as
the provider request principal.

### Let the agent poll each provider directly

Rejected. Provider-specific polling duplicates semantics, misses distinct terminal surfaces, and couples workflow
behavior to unstable prose. A low-frequency local watcher of the aggregate projection is cheap, passive, and
provider-neutral; adapters and controller events own provider parsing.

### Use a long-running GitHub Actions job as the agent wake-up mechanism

Rejected. It consumes hosted runner time, cannot directly resume the local coordinating process, and duplicates the
controller's event and scheduled-repair paths. The local await process can block without model work and return a typed
result in the existing agent session.

### Replay or fallback after a timeout

Rejected. A timeout does not prove the first provider effect failed to run. Blind replay can spend quota twice and
allow an unrelated terminal artifact to satisfy the wrong generation. Ambiguity remains blocking until the effect is
proven terminal or explicitly repaired.

### Preserve the unused development receipt shape as migration history

Rejected. Compatibility is warranted by persisted or consumed contracts, not by Git history alone. At design
correction time the review-gate extensions were inactive, no PR was open, and a repository-wide GitHub comment scan
found no receipt marker. Treating unused scaffolding as deployed history would add a second parser, mixed-ledger mode,
upgrade receipt, proof port, and repair path with no state to protect. The initial live schema replaces it directly.

### Close FIX findings immediately after pushing

Rejected. A pushed change and bare thread resolution do not establish authorized verification. The sequenced `fixed`
receipt combines maintainer authority, local verification, exact-head CI, qualifying follow-up review, and a direct
reply while accurately avoiding the claim that the provider verified the individual fix.

### Treat the GitHub Actions App id as a workflow identity

Rejected. Required-status source pinning distinguishes the Actions producer family, not a workflow path. A second
dedicated App would add another long-lived credential and installation lifecycle to emergency recovery. The selected
design instead proves one immutable default-branch status writer through repository-wide permissions/call-graph
exclusivity and exact-run verification; an installation that cannot prove exclusivity must choose a stronger adapter
authority rather than claim workflow pinning.

### Require CodeRabbit to qualify or remove it entirely

Rejected. Qualification is capability-specific. A non-satisfying adapter may still provide useful request, progress,
or finding evidence, while hosted Codex supplies the satisfying fallback. Conversely, if CodeRabbit proves every
required capability, it can remain first in policy without weakening the gate.

### Promote enforcement in the same delivery

Rejected. Default-branch-only protected code cannot be live-qualified before its own merge without trusting unshipped
controller code. This work ships inactive machinery, the qualification work proves and activates it from the default
branch, and promotion then changes enforcement add-before-remove.

## Cross-cutting Considerations

### Security and trust

- Preserve App permissions at metadata read, checks write, pull requests write, and statuses read, selected only for
  `andrewRCr/arc-framework`; no contents write or merge permission.
- Treat installation tokens as opaque bearer credentials. Never validate prefix, exact length, dot count, or regex;
  never persist them, expose them to git transport, or print them in logs and summaries.
- Pin App/bot identities and Actions source ids. Re-query canonical GitHub state after every untrusted event; webhook-
  style payloads and provider text are hints, not authority.
- Keep the protected environment and default-branch launch boundary for App credentials. The local watcher and repair
  workflow never receive the App private key.
- Fail closed on edited evidence, grammar drift, stale heads, ambiguous SHA prefixes, actor mismatch, competing
  triggers, receipt inconsistency, and incomplete finding settlement.

### Performance and operational cost

- Event-driven reconciliation is the primary path; scheduled discovery repairs missed events.
- The local watcher polls at low frequency with bounded backoff and emits only state changes. It consumes API quota
  and a sleeping local process, not model tokens or hosted runner minutes.
- Per-repository/PR concurrency lanes serialize authoritative writes without coupling distinct PRs that share a head.
- Do not request a provider before pending projection confirmation or while another source may be live.

### Testing

- Unit-test request state, exclusive-window contamination, parser grammars, identity/head checks, fallback legality,
  watcher transitions, freeze guards, settlement, closed receipt-ledger behavior, trigger tombstones, optional
  unavailable capability, and repair-attestation validation.
- Integration-test provider surfaces, App projection ordering, event routing, receipt reload, exact-head waiting,
  coordinator closure sequencing, workflow permission/call-graph exclusivity, and the emergency status producer.
- Extend workflow contract tests for pinned actions, default-branch checkout, secret boundaries, event filters,
  recursion suppression, and inactive project hooks.
- Run the full repository typecheck, test, lint, build, and shell/Markdown gates before delivery.
- Contract-test every qualification path against controlled fixtures; the dependent qualification work performs the
  live disposable-PR probes through the shipped default-branch implementation.

### Migration and rollout

No data or public-package migration is required: no live receipt exists and the controller remains inactive. The
definitive initial schema replaces unused development scaffolding before activation. Ship with project hooks inactive
and legacy CI authority unchanged. Qualification may activate only baseline-proven provider declarations; only
promotion may activate project hooks or alter required checks. The later GitHub-adapter work owns public packaging and
installation migration while consuming these extraction-ready contracts.

### User-facing impact

After final promotion, the PR-opening agent will request an applicable review immediately, perform any developer-
authenticated hosted trigger exposed by the controller, wait passively, and resume when the aggregate state needs
attention. The developer is no longer responsible for manually noticing each review round. Review comments and PR
descriptions remain understandable to collaborators who do not use ARC.

## Delivery Success Criteria

1. A required review reservation and App-authored pending projection are durably confirmed on the exact head before
   any provider effect, and provider latency cannot leave the PR review-green.
2. Every satisfying provider artifact is pinned to identity, policy/rubric, full current change set, frozen head, and
   one uncontaminated PR-wide controller-owned trigger window. Owned triggers remain immutable/present, mutation and
   deletion create tombstones, old-head effects require terminal proof, and direct commands cannot satisfy.
3. CodeRabbit capability declarations fail closed so an absent or partial qualification cannot turn native status or
   empty approval into authority, and the qualification runner can record an observed capability table.
4. Hosted Codex parsers, rubric transport, trigger ownership, and settlement contracts cover acknowledgement, full-
   commit findings, issue-comment clean, stale rejection, unknown grammar, every rubric dimension, and coordinator-
   owned closure. Connected-account grammar remains parser-only unless the later live gate proves an admissible actor.
5. Policy order and fallback select an alternate only after a proven legal terminal/pre-effect condition, with at most
   one live source; the qualification runner refuses a passing proof unless at least one hosted adapter qualifies.
6. The reusable await runtime and self-hosting watcher launcher observe source-pinned `ci-ok` or the aggregate App
   projection for one expected head, emit only typed changes, return every terminal/attention state, and perform no
   provider parsing or model work.
7. Review, review-comment, issue-comment, status, check, CI workflow, coordinator-thread, and scheduled-repair paths
   reconcile the same canonical state without recursive controller wake-ups or duplicate generations.
8. An active request flight freezes pushes; terminal findings permit a FIX push only through one consumed
   `begin-fix` authorization that carries the finding tail to the new head. FIX/DEFER/REJECT dispositions settle at
   the original finding locus, and reviewer-visible surfaces remain free of load-bearing methodology jargon. The
   guard imposes no network hook on pre-PR pushes.
9. The definitive initial request/receipt schema binds every causal field through one parser, identity algorithm, and
   ledger semantic validator; obsolete pre-activation shapes and malformed history fail closed.
10. Qualification-only direct minting passes both opaque token forms to the exact controller consumer without format
    assumptions, the pinned token Action is source-audited, and every path removes the temporary override and redacts
    credentials before emitting results.
11. App launch validation pins identities, least privileges, and the selected repository; denied capabilities and
    secret boundaries cover logs, storage, watcher, repair, and git transport.
12. The repair workflow and validator bind `review-repair-ok` to a live-verified secretless repair environment,
    immutable default-branch Actions code, a closed single-writer job shape, an exact-head bounded attestation, and an
    add-before-remove outage/restore procedure without App credentials.
13. Coordinator FIX closure requires the authorized sequenced receipt, exact new-head CI, qualifying follow-up review,
    verification/evidence refs, direct reply, and resolution; DEFER/REJECT and provider-owned closure retain distinct
    authority contracts.
14. The one implementation delivery PR leaves legacy CI `merge-ok` required and project review hooks inactive,
    installs deterministic activation derivation/diff validation plus machine-gated requalification, and archives
    through the ordinary work-unit lifecycle without recording unobserved live values.
15. Neutral request, evidence, fallback, settlement, await, and head-mutability modules depend only on injected ports;
    the sanitized handoff schema separates them from self-hosting policy and gives downstream work sufficient
    contracts to consume later live evidence without semantic reimplementation.

## Open Questions

None. Provider capability values and immutable evidence ids remain live-observed qualification outputs, not open
design decisions.

---
