# Spec (`detailed` · `RFC`): Reviewed-Lane Review Gate

- **Origin:** [internal]

- **Purpose:** Replace the repository's CI-only `merge-ok` status with a truthful, host- and provider-neutral review
  core, deployed here through a dedicated GitHub host adapter and a usage-aware CodeRabbit provider adapter, while
  preserving human/agent distinctions and wiring action-neutral PR-open lifecycle extensions.

---

## Introduction / Context

Reviewed pull requests in this repository rely on a manually-triggered CodeRabbit pass, but CodeRabbit's visible
progress check no longer appears. PRs #217 and #218 received reviews whose head commits carried no CodeRabbit check
or status, and the reviews were submitted as `COMMENTED`. A pull request can therefore show the required `merge-ok`
check as green while independent review is unrequested, running, stale, blocked on findings, or unavailable.

The current `merge-ok` job is only a CI rollup. Parallel work increases the frequency of reviewed pull requests and
can consume provider allowances faster, so restoring a blanket provider check would solve the display symptom while
creating review storms and provider lock-in. The durable problem is to decide which review obligations apply to an
exact PR change set, admit a qualified source without duplicate spend, retain auditable evidence, and publish one
required status that is green only when its declared merge conditions are satisfied.

The project workflow that currently addresses PR findings is not attached to either integration lifecycle. Remembering
to invoke it manually is not a reliable entry contract once work units and Errands run in parallel. ARC also names the
existing pre-open extension after one possible action (`pre-pr-review`) rather than the lifecycle event, preventing the
same hook from cleanly hosting other project actions.

This WU deploys the first integration in this repository, but its core contracts remain independent of GitHub,
GitHub Actions, and CodeRabbit. It does not yet ship the GitHub adapter or self-hosting policy to ARC projects; a
downstream adapter-distribution WU productizes the live-proven implementation with setup/verify/uninstall UX.

## Goals

1. Publish one required `merge-ok` check that truthfully composes PR readiness, mergeability, CI, and applicable
   review obligations.
2. Classify review obligation deterministically from a stable change-set identity and project policy, never from
   mutable CI-cost state or provider capacity.
3. Preserve typed human, agent, and specialist requirements without allowing implicit source substitution.
4. Trigger required reviews at stable readiness/checkpoint boundaries while avoiding review-on-every-push and exact
   request replay.
5. Make provider requests, overrides, waivers, out-of-band attestations, and repair behavior durable and
   auditable.
6. Separate review policy/reduction, Git-host projection, review-provider invocation, and execution/runtime concerns
   so another host or provider does not change the core contract.
7. Use CodeRabbit as the first self-hosting provider while supporting fresh Codex CLI and Claude Code review equally
   through a provider-neutral attestation path.
8. Expose action-neutral `pre-pr-open` / `post-pr-open` extension points and attach this project's review-coordination
   workflow to the post-open point for both work units and Errands.
9. Roll enforcement out without a missing required context or simultaneous legacy/controller `merge-ok` producers.

## Non-Goals

- Building a general provider/plugin registry or several automated provider adapters.
- Implementing GitLab, Bitbucket, or another Git-host adapter.
- Publishing or installing the GitHub adapter for ARC projects in this WU. `review-gate-github-adapter` consumes the
  live-proven ports and delivers that optional integration before public release.
- Adding ARC-wide review-policy settings, user preferences, or new git-config keys before the configuration cohort
  settles its user-scoped substrate.
- Replacing GitHub Code Owners, required-review rules, team assignment, or merge authorization.
- Treating the repository maintainer's integration interlock as fabricated teammate approval.
- Purchasing quota, scheduling reviews across repositories, or managing provider billing.
- Generalizing review policy, provider selection, or finding-response methods into ARC; `review-method-family` owns
  that downstream work. This WU adds the lifecycle hook pair and clarifies `diff-review`'s existing local-preflight
  boundary, but does not rename or redesign the method family.
- Normalizing unrelated extension names or replacing the existing project-filled `.actions` mechanism with a new
  action registry/configuration substrate. The pre-public `pre-pr-review` surface is intentionally replaced rather
  than carried as a compatibility alias.
- Implementing the final branch-protection cutover inside the implementation PR. The WU ships shadow-capable code
  and a fixed runbook; a post-main Errand performs live validation and the context transition.

## Proposed Design

### 1. Component boundaries

The implementation stays inside existing project-internal GitHub Actions and typed repository-script surfaces:

- `scripts/classify-change.sh` emits mutable CI-cost and stable review-policy records from one canonical path set.
- `packages/arc-framework/src/scripts/review-gate/core/` is the to-be-created host/provider-neutral reducer,
  requirement/evidence schema, admission engine, and verdict model.
- `packages/arc-framework/src/scripts/review-gate/hosts/github/` is the to-be-created GitHub host adapter: change-set
  discovery, permissions, receipts, review/conversation observation, and check-run projection.
- `packages/arc-framework/src/scripts/review-gate/providers/coderabbit/` is the to-be-created CodeRabbit provider
  adapter: capacity, request translation, acknowledgement, result/finding normalization, and closure evidence.
- `packages/arc-framework/src/scripts/review-gate/policy/self-hosting/` is the versioned repository policy, author
  map, accepted-source qualifications, and rubric binding. All four remain excluded from the published CLI bundle.
- `.github/workflows/review-gate.yml` is the to-be-created trusted event/schedule entry point that invokes
  default-branch controller code.
- `.github/workflows/review-gate-attest.yml` is the to-be-created default-branch `workflow_dispatch` entry for
  authenticated out-of-band agent and human attestations.
- A private organization-owned GitHub App, installed only on this repository, supplies the GitHub adapter's distinct
  receipt/check identity. Repository variable `ARC_REVIEW_GATE_APP_ID` holds its non-secret identifier; Actions secret
  `ARC_REVIEW_GATE_APP_PRIVATE_KEY` holds its PEM key.
- `.github/workflows/ci.yml` emits `ci-ok`, retains a temporary compatibility `merge-ok`, and exposes classifier
  output.
- `.coderabbit.yaml` is the to-be-created repository delta with organization inheritance and explicit opt-in.
- `pre-pr-open.md` and `post-pr-open.md` are canonical framework extension shells mirrored between package source and
  project; the pre-public `pre-pr-review.md` extension is removed. `integrate-work-unit.md` and `run-errand.md` fire
  the canonical hooks around PR creation and open-PR entry and place the existing `pre-merge-review` hook after the
  final open-PR head update.
- The extension index and configurability strategy register the pair, its action-neutral naming, and ordered
  multi-action contract.
- `diff-review.md` gains a narrow boundary clarification: its default is local author-side preflight, not an external
  independent review or gate-evidence source. Its checklist and `review.pre_merge` behavior otherwise remain intact.
- `coordinate-pr-review.md`, renamed and expanded from `address-pr-review.md`, routes initial and repeat decisions
  through controller admission and drives the project finding-response cycle.
- `.github/review-gate.md` is the to-be-created runbook for probes, cutover, rollback, and recovery.
- `TECHNICAL-OVERVIEW.md` updates § 3's CI/merge-gating description with the shipped shadow architecture; the
  cutover Errand applies the final-state wording when enforcement changes.

The controller core is project tooling, not an ARC CLI command. It lives under the existing typed `src/scripts/`
pattern so normal TypeScript lint/typecheck/test gates cover it, but `tsup` does not import it into `dist/cli.js` and
the npm `files` list does not publish its source. The workflow invokes it with the repository's pinned `tsx`
development dependency after checking out default-branch code. The GitHub adapter's injected API boundary uses Node's
built-in `fetch`; no Octokit or other runtime package is added.

The controller may fetch PR/base objects for `git diff` and `git show`, but it never checks out or executes PR code.
All executable scripts, dependencies, policy, and workflow definitions come from the protected default branch.

The ports divide responsibility as follows:

- `ReviewCore` consumes normalized change requests, policy, evidence, and commands and emits provider requests plus a
  merge-readiness verdict. It contains no PR number, check-run id, App slug, workflow event, or provider command.
- `GitHostAdapter` resolves host coordinates and actor permissions, stores/reads durable receipts, observes native
  reviews/conversations, and projects the verdict to the host's required-status primitive.
- `ReviewProviderAdapter` exposes capacity, request, acknowledgement, evidence, and finding-closure operations without
  deciding obligation or merge readiness.
- The execution adapter supplies trusted wake-ups and credentials. GitHub Actions is the self-hosting implementation;
  it is not part of `ReviewCore`.

The typed ports expose behavior rather than platform objects:

```text
GitHostAdapter:
  resolveChangeRequest(hostRef) -> NormalizedChangeRequest
  resolveActorCapabilities(actor) -> CapabilitySet
  readReceipts(changeRequestId) -> Receipt[]
  appendReceipt(receipt) -> DurableEvidenceRef
  observeNativeEvidence(changeRequestId) -> NativeEvidence[]
  publishVerdict(changeRequestId, GateProjection) -> HostProjectionRef

ReviewProviderAdapter:
  readCapacity(sourceIdentity) -> Capacity
  request(admittedRequest) -> RequestAcknowledgement
  observe(requestIdentity) -> ProviderObservation[]
  normalizeEvidence(observations) -> Evidence[]
```

`NormalizedChangeRequest`, capabilities, receipts, evidence, requests, and `GateProjection` are core-owned data.
Adapters may retain opaque host/provider references for round trips, but those references never participate in policy
classification or verdict logic except through their validated normalized fields.

The GitHub App has only metadata read, checks write, and pull-request write repository permissions. It has no OAuth
authorization, webhook, persistent service, contents write, administration, secrets, members, or workflow permission.
Trusted workflows mint a short-lived installation token scoped to the current repository through
`actions/create-github-app-token` pinned to a full commit SHA. `GITHUB_TOKEN` may read protected default-branch content
but never authors an authoritative receipt or gate check. Missing credentials, a missing installation, or an App-id
mismatch fails the adapter closed. Setup-time secret/variable writes and branch-protection changes use the maintainer's
authenticated local `gh` credential, never broaden the runtime App.

The two canonical extension names describe only hook points. Each extension's project-filled `.actions` section may
contain an ordered set of unrelated actions; the workflow executes them sequentially in authored order and halts on
failure. The framework package ships the canonical pair inactive and action-empty. This repository activates
`post-pr-open` and the existing final-state `pre-merge-review`; both enter `coordinate-pr-review.md`.
`pre-pr-open` remains inactive here.

### 2. Stable identities and policy decision

Every reconciliation resolves:

```text
base_ref
base_sha                 # current target-branch tip, for observation
diff_base_sha            # merge base used by the PR three-dot diff
head_sha
change_set_id            # SHA-256(base_ref NUL diff_base_sha NUL head_sha)
policy_version
```

A retarget, changed merge base, changed head, or policy-version change invalidates the decision, overrides, and
standalone evidence. A base-tip advance that leaves `(base_ref, diff_base_sha, head_sha)` unchanged preserves review
coverage because the reviewed diff is unchanged; existing CI/branch-protection freshness policy continues to govern
base-integration validity. An unresolvable diff fails sensitive and cannot produce satisfying review evidence.

`change_set_id` hashes the UTF-8 tuple with literal NUL separators. `policy_version` is the SHA-256 digest of the
controller's recursively key-sorted canonical JSON policy object: lane/risk predicates, author map, requirement
templates, accepted-source qualifiers, timeouts, and rollout-independent enforcement rules. It is not a
hand-maintained label. Section 4 defines the repository-owned rubric; the project runbook carries its operational
copy and an explicit initial `rubric_version` of `independent-analysis/v1`. Changing that rubric requires changing
the version in the same reviewed commit. Provider adapters declare which rubric version they are qualified to
satisfy.

The classifier emits two separate records:

```text
ci:      { weight: light | heavy, reason: docs-only | verified | unverified }
review:  { lane, review_risk, disposition, reasons[], policy_version,
           base_ref, base_sha, diff_base_sha, head_sha, change_set_id }
```

`ci.weight` remains the existing mutable run-cost optimization: a previously verified code tree may become light.
No CI result or provider event can change `review` while its change-set and policy identities are unchanged.

The change set receives an aggregate disposition:

- `required` when any typed requirement is required;
- `recommended` when no requirement is required and at least one is recommended;
- `exempt` when no review requirement applies.

The aggregate is explanatory only. Each requirement retains its own obligation, reason codes, accepted source set,
count, rubric version, and change-set identity.

### 3. Self-hosting lane and review-risk policy

The initial independent-analysis policy is:

| Lane | Review risk | Disposition |
| --- | --- | --- |
| `auto` | any | `exempt` |
| `reviewed` | `routine` | `recommended` |
| `reviewed` | `sensitive` | `required` |

#### Lane

`auto` requires a non-empty diff confined to the existing movable planning-artifact prefixes and passage of the
author-ownership predicate. The versioned self-hosting identity map contains `andrewRCr -> andrew`.

- Existing `draft-*`, `tasks-*`, `meta-*`, and `notes-*` artifacts resolve ownership from the base revision's
  companion meta. Changing `Owner` cannot make the same PR self-authorizing.
- A new artifact resolves ownership from its new companion meta.
- Any owner transition is reviewed.
- `cohort-*` is ownerless and clears the owner comparison, matching the current cohort model.
- An unmapped author, different owner, missing/ambiguous meta, design-authority path, constitutional path, or other
  non-lane path fails safe to `reviewed`.

Disciplined housekeep changes to the shared inbox or derived project view remain conservatively
`reviewed + routine` until `shared-inbox-model` supplies trustworthy operation provenance. This known false positive
does not spend provider quota automatically.

#### Review risk

`sensitive` applies when the diff is empty/unresolvable, the pure `classify-change.sh classify` command identifies
any stable code-surface path, or a changed path matches one of:

- `.github/**`;
- `.arc/system/**`;
- `.arc/reference/strategies/**`;
- `.arc/reference/adr/**`;
- `.arc/reference/briefs/**`;
- `.arc/reference/PROJECT-PRD.md`;
- `.arc/reference/TECHNICAL-OVERVIEW.md`;
- root `AGENTS.md` or `CLAUDE.md`.

Everything else is `routine`. Stable reason codes are `unknown-change-set`, `code-surface`,
`github-control-surface`, `arc-system-surface`, `strategy-surface`, `adr-surface`, `agent-brief-surface`,
`project-prd-surface`, `technical-overview-surface`, `harness-contract-surface`, and `routine-doc-surface`. The
result includes every matching reason. Project critical paths may change only through a new policy version and
fixtures; prose categories cannot change enforcement.

Diff size is diagnostic/decomposition evidence, not an exemption. Generated-only and bot-authored exceptions do not
exist until an explicit tested predicate is added.

### 4. Typed requirements, independent-analysis rubric, and evidence

#### `independent-analysis/v1`

Every source accepted for an independent-analysis requirement evaluates the declared change-set coverage against the
same repository-owned rubric:

1. **Intent and scope:** the change implements its stated purpose, remains within scope, and does not omit a
   load-bearing requirement or include an unrelated change.
2. **Correctness and failure behavior:** logic, state transitions, data handling, error paths, edge conditions, and
   concurrency behavior are correct for both expected and adverse inputs.
3. **Trust and compatibility:** authorization, secrets, untrusted-input boundaries, external side effects, public
   contracts, migrations, and adjacent integrations preserve their declared invariants.
4. **Verification:** tests and other evidence exercise the material behavior and failure modes; a passing suite does
   not substitute for analysis of an uncovered risk.
5. **Coherence and maintainability:** naming, abstractions, documentation, cleanup, and cross-file consistency leave
   a comprehensible implementation without stale or contradictory surfaces.

The reviewer inspects the actual diff and the repository guidance needed to understand it, not only a PR summary or
the implementer's completion report. A finding carries a stable source-scoped id, severity, concrete locus, evidence,
and rationale. `clean` means every applicable rubric item was evaluated over the declared coverage, no new finding
remains, and every earlier finding in the evidence chain is explicitly closed or dismissed; silence, a generic
approval token, or absence of a provider comment is not clean evidence.

A source qualifies for this rubric only when its adapter or attestation path can bind the analysis to exact coverage,
publish durable result/finding evidence, distinguish clean/findings/failure/unavailability, and expose finding closure.
Codex CLI and Claude Code reviewers receive this rubric verbatim. A human qualifier attests the same rubric and cannot
be the PR author. CodeRabbit receives repository review instructions implementing the rubric and remains non-satisfying
until the live probe proves its full/incremental coverage, result, durable finding ids, and closure signals. If a source
cannot prove one of these capabilities, policy may not list it as acceptable even if it can post useful comments.

Changing the rubric changes `rubric_version`, invalidates prior evidence under the normal identity rules, and requires
adapter qualification fixtures plus the live probe before enforcement.

#### Requirements and evidence

Requirements use this normalized shape:

```text
id
kind: peer-approval | independent-analysis | specialist-review
obligation: required | recommended
acceptable_sources[]: { source_kind: human | agent | deterministic-tool, qualifier? }
count
policy_version
rubric_version
change_set_id
head_sha
```

Evidence records:

```text
requirement_id, source_kind, source_identity
result: clean | findings | failed | unavailable
evidence_url_or_id
policy_version
rubric_version
coverage: full | incremental
coverage_from_sha, coverage_through_sha
base_ref, diff_base_sha, change_set_id, head_sha
findings[]: { finding_id, severity, locus, evidence_url_or_id }
closures[]: { finding_id, authority_kind, authority_identity, evidence_url_or_id }
observed_at
```

`finding_id` is stable within a source identity and cannot be reused for a different finding. `findings` evidence must
name every newly-open finding. A closure is valid only when its authority is explicit and authenticated:

- `source-confirmed` — the same provider/reviewer identity explicitly closes the finding through durable evidence;
- `authorized-dismissal` — a permitted actor emits the dedicated dismissal receipt with source/finding id and reason;
- `host-native` — the Git host reports an authorized native review dismissal with actor identity.

A resolved-thread boolean alone is not closure evidence. The adapter must observe who resolved it; when the host does
not expose that identity, require a later source-confirmed result or authorized dismissal. Aggregate `clean` without a
valid closure record for every prior finding cannot erase them.

Capacity is per candidate source (`available | exhausted | unknown`). Execution is per requirement/request:
`not-requested | queued | running | clean | findings | failed | unavailable | waived | stale`. A new change set
invalidates overrides and makes prior evidence non-satisfying on its own; the coverage rule below is the only way
older analysis contributes to a later head.

Required + unavailable stays blocking and offers an allowed alternate, qualified human where policy permits, or an
explicit waiver. Recommended + unavailable remains visible and non-blocking. Capacity never rewrites disposition.

Source kinds are never implicitly interchangeable:

- A peer/Code Owner requirement normally accepts an authorized human teammate; agent evidence does not substitute.
- Independent analysis accepts only sources listed by project policy. The initial self-hosting set is CodeRabbit,
  fresh Codex CLI, fresh Claude Code, a later proven PR-native agent adapter, or a qualified human who is not the PR
  author.
- Specialist review accepts only the declared specialist human/tool/agent qualifier.
- The integration interlock authorizes merge but satisfies no peer-approval requirement.

When `count > 1`, each satisfying chain/approval must come from a distinct qualified source identity (and distinct
human actor for human sources); repeated reviews by one source do not inflate the count.

Self-hosting formal peer approval is disabled. The reducer nevertheless supports fixtures and native evidence for
projects/rules that combine peer approval with agent analysis. A native requested-changes state or unresolved
required review conversation blocks regardless of whether self-hosting policy separately requires peer approval.

### 5. Coverage and staleness

A full analysis covers `diff_base_sha..coverage_through_sha`. An incremental analysis covers exactly
`coverage_from_sha..coverage_through_sha`; a provider that cannot prove both bounds cannot emit qualifying
incremental evidence.

A diff-analysis requirement is satisfied by either:

1. one clean full review through the current head; or
2. a contiguous chain beginning with a full review from the current `diff_base_sha`, followed by incremental links
   whose `from` equals the preceding `through`, ending in a clean result at the current head.

Every link shares base ref, diff base, policy version, rubric version, requirement id, and source identity. Prior
`findings` evidence remains chain-eligible only when later same-source evidence explicitly closes every finding
against a covered head or an authorized dismissal receipt does. The terminal link must be clean; no finding may
survive. Failed/unavailable links provide no coverage.

Self-hosting does not compose coverage across sources. An alternate source runs a full current-change-set review. A
retarget or merge-base change breaks the chain. A host-native peer approval is atomic evidence bound to the head the
host reports and follows that host's approval-dismissal semantics; it never composes across heads.

An alternate may replace a request that is unavailable before findings exist, but its clean result cannot erase
findings already returned by another requested review. Those findings remain independently blocking until resolved
by qualifying current-change-set evidence from their source or explicitly dismissed by an authorized receipt.

### 6. Durable receipt ledger and request admission

At every wake-up, the execution adapter re-queries canonical host/provider state and passes normalized inputs to the
core. In this deployment, the GitHub adapter reads policy, CI, provider checks, reviews, conversations, and PR state.
Security- and spend-relevant transitions are append-only receipts; GitHub stores them as controller-authored PR
issue comments with a visible summary and machine-readable payload:

```text
schema_version, event_id, idempotency_key
repository_id, change_request_id, base_ref, base_sha, diff_base_sha, head_sha, change_set_id
policy_version, rubric_version, requirement_id
action, request_id, generation, actor, actor_permission, reason
source_identity, coverage, coverage_from_sha, coverage_through_sha
result, evidence_url_or_id, observed_at
finding_ids[]
closures[]: { finding_id, authority_kind, authority_identity, evidence_url_or_id }
```

The core accepts only host-adapter-validated receipts. On GitHub that means a schema-valid comment from the dedicated
App; user comments and dispatch inputs remain untrusted commands until validation emits a receipt. Provider labels and
`merge-ok` output are projections, not the ledger. Missing, conflicting, or malformed canonical receipts fail closed.

Request identities are hierarchical:

- requirement key: `(repository, change request, change set, policy version, rubric version, requirement id)`;
- request key: requirement key + source identity + coverage bounds + generation.

Exact request-key replay is rejected. The first admitted attempt for a change set is generation zero whether its
admission was automatic or explicit; a later same-change-set refresh advances the generation. An allowed
alternate-source fallback changes source and runs full coverage. Both remain under the same requirement without being
mistaken for duplicates.

Generation-zero automatic admission occurs only when a required change request is ready and no request for that
requirement has ever been admitted in its receipt history. On GitHub this covers an opened-ready PR, the first
draft-to-ready transition, and scheduled repair of a missed initial event. Recommended work never auto-admits. After
any request has been
admitted, a new head invalidates evidence and leaves the current requirement `not-requested`; `synchronize` wakes
reconciliation but cannot spend quota. The open-PR workflow presents the checkpoint and an authorized `refresh`
admits generation zero for the new change set with validated full/incremental coverage. A later refresh on that same
change set advances the generation. Coalesced pushes before the checkpoint therefore create one current change set and
one request, while `merge-ok` remains pending for required analysis until admission and qualifying evidence complete.

Admission is two-phase:

1. Write a `reserved` receipt before provider invocation.
2. Invoke the adapter.
3. Write an `acknowledged` or terminal-failure receipt when observable.

A reservation with no acknowledgement after 10 minutes becomes an ambiguous blocking failure. Repair never retries
it automatically because the provider may have accepted the request before a webhook was lost. An explicit refresh
creates the next generation. An acknowledged review with no terminal evidence after 60 minutes becomes a visible
retriable failure, never success.

### 7. Authorization and command surface

The controller accepts strict, host/provider-neutral commands; a host adapter maps its native authenticated input
surface onto them:

```text
/review-gate require <requirement-id> <reason>
/review-gate waive <requirement-id> <reason>
/review-gate refresh <requirement-id> <source|auto> <full|incremental> <reason>
/review-gate dismiss <requirement-id> <source-identity> <finding-id> <reason>
```

`requirement-id` may name an active requirement or a policy-defined candidate template when an exempt/recommended
decision is raised. An accepted `require` command emits the scoped obligation override and immediately admits
generation zero for the policy-preferred source with full current-change-set coverage; unavailable capacity leaves
the new requirement blocking and offers the normal alternate/waiver paths. `dismiss` closes exactly one current,
known `(source identity, finding id)` pair and emits the dedicated dismissal receipt; it cannot imply a clean review
or waive the surrounding requirement. There is no implicit waive-all. The controller rejects unknown
requirements/findings, disallowed sources, cross-source incremental requests, coverage that cannot extend the current
chain, stale change sets, and malformed commands.

Current self-hosting permissions are resolved through GitHub for every command:

- `require` / `refresh`: `write`, `maintain`, or `admin`;
- `waive` / `dismiss`: `maintain` or `admin`;
- agent attestation: `maintain` or `admin` through the default-branch dispatch workflow only;
- qualified-human self-attestation: matching non-author actor with `write`, `maintain`, or `admin` through that
  workflow only.

Overrides record actor, permission, reason, policy/rubric versions, and change-set identity and expire when any of
those scope identities changes. Provider-native ignore commands cannot waive ARC requirements or independently turn
`merge-ok` green.

Independently-verifiable out-of-band provider evidence may satisfy an accepted requirement if its source, result,
coverage, rubric, and change-set binding all qualify. The controller records it as `unadmitted`, suppresses a
duplicate request, and surfaces the policy bypass.

### 8. Controller reconciliation and `merge-ok`

The GitHub workflow authenticates authoritative API writes with the dedicated App installation token. Receipt
comments must be authored by that App bot and carry its numeric App identity; custom checks must report the same App
as their source. The adapter pins the expected App id from `ARC_REVIEW_GATE_APP_ID`, rejects `github-actions` or any
other author/source even when names and payloads match, and never accepts `external_id` alone as authority.

Events are wake-ups, never trusted snapshots. `review-gate.yml` listens for:

- PR open, reopen, synchronize, ready/draft, edit/retarget, label changes;
- external check completion/rerequest;
- submitted/edited/dismissed PR reviews;
- issue comments;
- a 15-minute scheduled repair sweep over pending gates.

Every run resolves the latest change set, queries canonical state, validates receipts, rejects stale evidence, and
updates one custom check idempotently. Per-PR concurrency cancels stale reconcilers. Updating the controller's own
check must not recursively trigger another reconciliation.

Each custom check uses deterministic external id `arc-review-gate:<PR>:<change-set>:<context-name>` and is looked up
by external id plus the dedicated App id before creation. If an interrupted race leaves multiple matches, the
reconciler elects the newest run, mirrors the canonical conclusion to every match, and reports the duplicate.
Enforcement cannot proceed until the live probe shows GitHub treats the context/source unambiguously; divergent
same-name checks are never ignored.

The controller uses `pull_request_target` only for trusted default-branch metadata/API work. It never checks out or
executes PR code, never interpolates untrusted values into shell commands, parses path lists without newline
assumptions, uses the narrowest token permissions per job, and pins the required check's expected application source
to the dedicated App after live verification. Fork PRs receive the same policy without secrets or write authority in
untrusted code.

`merge-ok` is the only final required status:

```text
PR readiness / mergeability ─────┐
CI jobs ──> ci-ok ───────────────┤
                                 ├──> merge-ok
policy decision + overrides ─────┤
human/agent/tool evidence ────────┘
```

Conclusions are:

- `pending`: draft PR; unresolved mergeability; enforced base-freshness wait; queued/running/not-requested required
  work; stale evidence; or required-source capacity still unknown.
- `failure`: base conflict; CI failure; required review failure/unavailability/timeout; blocking findings;
  unresolved required conversations; native requested changes; malformed/inconsistent controller state.
- `success`: PR ready, non-conflicting, and base-fresh where enforced; CI passed; each review obligation is
  inapplicable, remains non-blocking recommended, is satisfied by current-change-set evidence, or is explicitly
  waived.

The check summary names the policy decision, reason codes, requirement states, evidence sources/coverage, CI state,
and receipt links. Green means no blocker exists in this declared scope; the ARC integration interlock remains the
separate human authorization to merge.

### 9. CodeRabbit adapter

The repository adds `.coderabbit.yaml` with `inheritance: true` so normal organization settings merge instead of
being shadowed by repository defaults. Its delta:

- keeps blanket `auto_review.enabled: false`;
- opts in through one controller-owned positive trigger label;
- enables the canonical review-progress check and failure propagation;
- enables Request Changes so unresolved findings produce native blocking review state;
- disables review-on-every-push behavior.

The label is a one-shot request handshake, not durable classification. After writing a reservation, the controller
applies it for the exact change set and removes it after provider acknowledgement or terminal invocation failure.
The controller does not depend on a GitHub Actions `labeled` event caused by its own `GITHUB_TOKEN`; the external
CodeRabbit reaction is proven live.

If live validation shows the label retriggers on later pushes, does not fire with blanket auto-review disabled, or
cannot bind evidence to the admitted request, the adapter uses CodeRabbit's explicit full/incremental request command
behind the same controller admission path. Provider labels, commands, check names, quota commands, and response
translation remain inside the adapter.

Capacity is `available | exhausted | unknown`. Required + unavailable stays blocking and offers a permitted full
alternate review or waiver; recommended + unavailable remains a visible non-blocking recommendation. Capacity never
rewrites policy.

### 10. Codex, Claude, and human evidence

The fallback contract is a source-neutral attestation, not a Codex-only integration. A fresh Codex CLI or Claude Code
reviewer runs the project rubric against the current full change set and publishes durable evidence on GitHub. A
maintainer then invokes `review-gate-attest.yml` with `source_kind: agent`, requirement id, source identity, result,
base/diff/head identities, change-set id, policy/rubric versions, full coverage bounds, evidence URL/id, and the
normalized finding manifest plus any explicitly closed finding ids.

The default-branch workflow validates actor permission and payload, then emits a controller receipt. Agent prose is
never parsed as authority; an unauthenticated PR-body token, local-only transcript, or expiring/unlinked artifact is
not gate evidence. A `findings` attestation remains blocking until current-change-set evidence closes the findings.

Reactive `@Codex` or a future Claude GitHub integration becomes a native adapter only after a live probe proves a
stable current-head artifact and observable coverage/result contract. Local Codex `/review` and Claude Code review
remain valid analysis mechanisms but require the generic attestation because they do not inherently publish gate
state.

Human review composes by requirement kind. Host-native peer approval, Code Owner state, requested changes, dismissal,
and unresolved-conversation state are observed directly. Native `APPROVED` satisfies only a peer-approval requirement;
it is not independent-analysis evidence. A human satisfies independent analysis through the same dispatch with
`source_kind: human`: the authenticated dispatch actor must equal `source_identity`, hold `write`, `maintain`, or
`admin`, be allowed by the requirement's human qualifier, and not be the PR author. The human submits the full rubric
result/finding manifest and durable GitHub evidence link; the controller receipt is the authenticated attestation.
Agent attestations remain `maintain`/`admin`-submitted on behalf of the named fresh agent source.

### 11. PR-open lifecycle hooks and project coordination

`diff-review` remains the local aggregate preflight before the PR-opening push. Its default asks the authoring agent
to inspect its own diff for scope, correctness/error paths, consistency, cleanup, documentation drift, and unresolved
markers. That intentional checklist overlap catches cheap defects before submission, but it invokes no external
reviewer by default, publishes no independent evidence, and can satisfy neither peer approval nor independent
analysis. Projects may customize it, but only evidence admitted through the normalized review contract can satisfy a
PR obligation.

The framework introduces an action-neutral canonical pair:

- `pre-pr-open` fires after the PR head is pushed and immediately before `gh pr create`. It runs only when no PR for
  the branch exists. A failed create followed by recovery may repeat it, so configured actions must be retry-safe. It
  is not gated by `review.pre_merge`; that setting continues to govern the review-specific `diff-review` method, not
  the generic lifecycle hook.
- `post-pr-open` fires after the workflow observes an open PR and before review iteration or the Errand integration
  interlock. It fires after creation and again when a later session re-enters with the PR already open. Its configured
  actions must therefore be idempotent and derive current state from the PR/controller rather than local memory.

`pre-pr-review` is removed rather than retained as an alias. ARC has not crossed its public compatibility boundary,
and moving that name to the new fire point would silently change both timing and `review.pre_merge` gating. A
pre-release installation that customized the removed Configurable file must manually place any still-wanted,
non-review action at the appropriate canonical hook; an updater-retained copy is inert and no workflow declares or
fires it.

`integrate-work-unit.md` removes the old extension from the `diff-review` step, fires `pre-pr-open` directly before PR
creation, and fires `post-pr-open` at entry to Step 4. It also moves `pre-merge-review` from the pre-composition
position to Step 13 after the final/sweep push and every behind-base reconcile push, immediately before the integration
interlock. This guarantees a current-head checkpoint after the lifecycle's own mandatory commits.

`run-errand.md` detects and reuses an existing branch PR, fires `pre-pr-open` only on the creation path, and fires
`post-pr-open` on both create and resume paths. Its `pre-merge-review` fire point moves before the integration
interlock so any resulting fix/request cycle settles before merge approval. The extension's existing name is not
normalized here.

Both canonical extension shells name only their hook point and accept multiple ordered project actions. Package-source
copies ship inactive with no configured action. This repository deletes the current local CodeRabbit subagent action
with the old extension and leaves `pre-pr-open` inactive, preventing duplicate provider spend and non-satisfying
evidence. The project activates `post-pr-open` and `pre-merge-review`, invoking
`coordinate-pr-review.md`; later project actions can be appended without renaming or multiplying hook points.

`coordinate-pr-review.md` replaces `address-pr-review.md` and broadens its responsibility from responding to findings
to coordinating the whole open-PR review cycle. On entry it reads the normalized decision:

- `required`: observe the controller's one-time automatic ready-for-review admission, or, on a later coalesced head,
  explain the pending obligation and recommend the appropriate explicit checkpoint request;
- `recommended`: explain the reasons and ask whether to raise the named requirement for the current change set;
- `exempt`: request no provider review, while retaining the explicit `require` command.

The workflow waits on external review without polling, fetches and triages findings, applies approved fixes, pushes,
and recommends full versus incremental follow-up coverage. On approval it invokes `/review-gate refresh ...`; the
controller validates coverage, capacity, dedupe generation, and the provider request. It returns only when applicable
review obligations and conversations are settled. At the final `pre-merge-review` checkpoint, a stale or
`not-requested` required head receives the same recommendation/refresh cycle; a current clean/exempt head returns
without another request.

Finding closure follows the authority contract: a provider-confirmed re-review/auto-resolution may close its own
finding; defer/reject or a manually resolved fix uses `/review-gate dismiss ...` first, with the approved rationale.
Only after that receipt may the workflow resolve the host thread as a UI projection. A bare `resolveReviewThread`
mutation never becomes source-confirmed evidence. Direct provider request commands and unreceipted manual thread
closure cease to be operational paths.

The controller remains the correctness boundary: GitHub events and scheduled repair admit required work and keep
`merge-ok` non-green even if an ARC extension is missed. `post-pr-open` is the reliable workflow-entry boundary for
judgment and finding response, not a prerequisite for gate enforcement.

### 12. Shadow rollout and enforcement cutover

The implementation PR preserves the legacy required context:

1. Refactor the current CI aggregate into `ci-ok`.
2. Add a thin compatibility job named `merge-ok` that depends on `ci-ok` and preserves today's required context.
3. Deploy the controller with GitHub Actions repository variable `REVIEW_GATE_CONTEXT_MODE=shadow` (missing/invalid
   values fail safe to `shadow`).
4. Emit `review-gate-shadow`; do not emit controller-owned `merge-ok`.
5. Ship `.github/review-gate.md` with the exact live probe, context transition, rollback, and recovery commands.

After the implementation reaches `main`, a separate Errand executes the runbook:

1. Create the private organization-owned App from the documented settings, install it only on this repository, set
   `ARC_REVIEW_GATE_APP_ID` / `ARC_REVIEW_GATE_APP_PRIVATE_KEY`, and dispatch shadow reconciliation. Prove an
   App-authored receipt/check succeeds while same-name `github-actions` output and a wrong App identity are rejected.
2. Probe exempt, recommended/accepted, required/clean, findings, stale-head/retarget, agent/human attestation, provider
   failure/exhaustion, waiver, repair, bare-thread-resolution rejection, and reserved-but-unacknowledged paths. Prove
   label one-shot behavior, CodeRabbit evidence/coverage/closure authority, controller source identity, normal
   rollback, and the App/controller-outage break-glass transaction while the final App check is not sole-required.
3. Add `ci-ok` and App-owned `review-gate-shadow` as required contexts; verify both on a current PR; remove the legacy
   `merge-ok` requirement.
4. Open and merge the cutover PR that removes the CI compatibility `merge-ok` job while temporary requirements
   remain present.
5. Set mode `dual`; refresh open PRs; verify App-owned `merge-ok` from the pinned source; add it as required.
6. Remove temporary `ci-ok` / `review-gate-shadow` requirements; set mode `final`; refresh; confirm the shadow alias
   disappears and App-owned `merge-ok` is the sole required status.
7. If any step fails, retain or restore the last proven required pair. Never bypass branch protection to advance.

Rollback from final mode is ordered: set `dual`, refresh and prove `review-gate-shadow`; add
`ci-ok + review-gate-shadow` as required; remove controller `merge-ok` from required contexts; then return to
`shadow`. The final context is never disabled while it is the only requirement.

That normal rollback assumes the controller and App can still publish. A controller-wide failure, missing App
installation/credential, or malformed-state failure uses an explicit audited break-glass requirement transition:

1. Freeze unrelated merges, record the incident/reason/actor/current required-context set, and snapshot the current
   branch-protection/ruleset configuration.
2. Using the maintainer's authenticated admin credential, add the independently produced `ci-ok` context as required
   and verify it is present and green on the exact repair PR head. The repair PR must not modify the `ci-ok` producer
   or its workflow; otherwise a separately reviewed prerequisite restores that producer first.
3. Remove the unavailable App-owned `merge-ok` requirement only after `ci-ok` is proven. Merge the narrow repair PR
   through normal branch protection—never `--admin`, never a direct base push—and record the resulting commit.
4. Restore App/controller operation in `shadow`, prove App-authored output and spoof rejection, then repeat the normal
   `shadow -> dual -> final` transition before unfreezing merges. Restore the recorded final ruleset and close the
   incident with before/after evidence.

The runbook exercises this transaction in a non-final state before cutover. It is an administrative recovery change
to the required-context set, not permission to bypass merge protection or weaken unrelated checks. At every mutation,
the old failing gate or the already-proven independent `ci-ok` context remains required; the set is never empty.

Legacy and controller producers never share the `merge-ok` name. Every intermediate state retains a present,
truthful required gate. `finalize-parallelism` remains paused until the Errand proves final enforcement.

## Alternatives & Rationale

### Configuration-only CodeRabbit repair

Rejected as the complete solution. Progress/failure/Request Changes settings restore useful provider behavior but
leave the pre-trigger race, omitted-review state, quota policy, alternate reviewers, and truthful aggregate unsolved.
Those settings remain part of the adapter.

### Review every reviewed-lane PR or every push

Rejected. Reviewed-routine documentation would consume the same allowance as sensitive code, and repeated pushes
would multiply spend. Stable review risk plus ready/checkpoint admission preserves quota for justified reviews.

### Keep CI-owned `merge-ok` and require a second `review-gate`

Rejected. A green check named `merge-ok` while GitHub still blocks on another required review check is misleading.
Internal concerns remain separate, but one public aggregate owns the semantic name.

### Author controller state with `GITHUB_TOKEN`

Rejected. Its checks and comments carry the shared GitHub Actions application identity, so another workflow can emit
the same name/source and `external_id` cannot make branch protection distinguish the trusted controller. The dedicated
App supplies a separately pinnable source without adding a service runtime.

### Poll inside the CI rollup

Rejected. It holds a runner, races external/manual triggers, has weak retry/timeout semantics, and cannot repair
missed events cleanly. Persistent custom checks plus short event-driven reconciliation preserve state without a
long-running runner.

### Treat all reviewers as interchangeable

Rejected. It would let an agent replace teammate approval or a generic reviewer replace specialist evidence. Typed
requirements and explicit accepted-source sets preserve the distinction.

### Build a general provider framework now

Rejected. It outruns proven provider contracts and overlaps `review-method-family`. One provider port, CodeRabbit,
and generic agent/human evidence are sufficient to prove the model.

### Publish the GitHub adapter before self-host proof

Rejected. App creation/install UX, pinned reusable distribution, configuration placement, upgrades, and uninstall
behavior are a separate adopter-facing contract. This WU establishes reusable ports and proves one deployment;
`review-gate-github-adapter` productizes that evidence without delaying the `finalize-parallelism` gate.

### Use CI weight as review risk

Rejected. CI weight changes from heavy to light after a matching code tree passes heavy checks, so the same head
could lose a required review without changing its diff. Stable review risk must be independently derived.

## Cross-cutting Considerations

### Security

- Trusted workflows execute only protected default-branch code and never check out/execute PR code.
- Fork-controlled paths, labels, titles, comments, evidence links, and command arguments are parsed as untrusted
  data; shell interpolation is prohibited and changed-path transport is NUL-safe or structured JSON.
- The runtime App is repository-selected and limited to metadata read, checks write, and pull-request write. Its
  short-lived token is never expanded to the organization installation; CI jobs retain read-only `GITHUB_TOKEN`s.
- Commands re-query current repository permission. Waivers, dismissals, and agent attestations require
  `maintain`/`admin`; human self-attestation follows the qualified non-author rule in § 10.
- Receipts/checks accept only the dedicated App identity and schema. `github-actions`, another App, stale, missing,
  malformed, or conflicting state fails closed.
- Private-key rotation changes credentials but not the pinned App identity. Changing App identity is an enforcement
  migration and follows the same prove-new-source-before-removing-old ordering as required-check cutover.
- Expected-source and fork behavior are live-probe gates before enforcement.

### Reliability and concurrency

- Reconciliation is idempotent over current GitHub state and append-only receipts.
- Per-PR concurrency prevents old event runs from overwriting a newer change set.
- Events only wake; scheduled repair reconstructs state after missed webhooks.
- Reservation-before-invocation plus explicit generations prevents duplicate spend without hiding ambiguous
  delivery.
- Time is injectable in reducer tests; 10-minute acknowledgement and 60-minute terminal thresholds have boundary
  fixtures.
- A retarget or merge-base change invalidates review coverage even when the head SHA is unchanged.

### Cost and performance

- Draft PRs consume no independent-review quota.
- Reviewed-routine recommendations require explicit acceptance; automatic capacity is reserved for required work.
- New pushes coalesce until a checkpoint; valid same-source incremental chains avoid unnecessary full reviews.
- Controller runs are short and event-driven. Scheduled repair inspects only open PRs with pending/nonterminal gate
  state.
- Provider capacity remains separate from policy and may stay `unknown` when no reliable quota API exists.

### Testing

The typed controller exposes pure functions with injected host/time/provider boundaries. Tests cover:

- classifier path/risk/reason matrices, unknown diffs, mutable CI-weight independence, base-owned/new/transitioned
  artifacts, ownerless cohorts, mapped/unmapped authors, and retarget/change-set identity;
- `independent-analysis/v1` source-qualification fixtures for rubric delivery, exact coverage, durable findings,
  failure distinction, and closure capability;
- requirement aggregation, typed source non-substitution, formal peer fixtures, recommended acceptance/decline,
  waivers, native requested changes, conflicts, drafts, base freshness, and CI outcomes;
- full/incremental coverage chains, closure-authority identity, bare thread-resolution rejection, explicit dismissal,
  source changes, rubric/policy changes, and stale evidence;
- one-time automatic admission, synchronized-head coalescing, request reservation, exact replay, refresh generations,
  alternate-source full fallback, ambiguity/timeouts, and out-of-band evidence;
- receipt/finding schema, application/permission validation, and strict command parsing;
- host-adapter contract fixtures independent of GitHub plus GitHub mappings for change-set discovery, permissions,
  native review/conversation state, receipts, and check conclusions;
- dedicated-App authentication, current-repository token scope, missing/wrong identity, GitHub Actions spoof rejection,
  and private-key rotation under a stable App id;
- normal rollback plus controller/App-outage break-glass ordering, exact-head `ci-ok` proof, repair-PR scope guard, and
  never-empty required-context sets;
- event idempotency, per-PR race ordering, repair, and shadow/dual/final check-name projection;
- CodeRabbit label/command/progress/failure/exhaustion fixtures and generic agent/human attestations;
- workflow parsing plus least-privilege/fork-safety assertions;
- package/project extension registration, complete `pre-pr-review` reference removal, action-neutral descriptions,
  ordered multi-action execution guidance, post-open re-entry, final-head pre-merge placement, and Errand existing-PR
  reuse;
- `diff-review` default-boundary assertions: local author preflight, no external reviewer invocation, and no
  independent/peer evidence claim.

Normal Markdown, shell, TypeScript lint, source/test typecheck, unit/integration/E2E, build, and workflow smoke gates
remain mandatory. Live provider and branch-protection probes run only from the post-main cutover Errand.

### Migration and rollback

The compatibility CI alias makes the implementation PR mergeable under today's rule. Shadow mode proves the
controller without enforcement. The cutover requires temporary known-good contexts before removing the old one,
uses dual output only after the legacy producer is absent, and retains a direct rollback to
`ci-ok + review-gate-shadow` through `final -> dual -> shadow`. No step requires a missing required check, duplicate
`merge-ok`, or protection bypass.

### Compatibility and configuration

- `ReviewCore` is Git-host, execution-runtime, provider, and harness neutral; GitHub/App/Actions and CodeRabbit tokens
  never enter its policy, evidence, or verdict contracts.
- The GitHub host adapter and CodeRabbit provider adapter are independent ports. A future GitLab host adapter maps the
  same core state without inheriting GitHub App, check-run, comment, or workflow concepts.
- Codex CLI and Claude Code are equal generic agent evidence sources.
- `pre-pr-open` and `post-pr-open` name lifecycle boundaries rather than review actions; projects may attach multiple
  ordered actions without changing the hook namespace.
- Project policy and the author map are versioned/tested repository code, not personal preference.
- Per-change-set commands/receipts are host integration state, not durable ARC/user configuration. App credentials
  remain in GitHub Actions secrets; the non-secret project installation identity is repository operational config.
- Future personal/provider defaults wait for the configuration cohort's user-scoped storage model.
- `review-gate-github-adapter` consumes the live proof to ship optional manifest-guided setup, selected-repository App
  installation, pinned workflow distribution, smoke/doctor, upgrade, and uninstall behavior for ARC projects. Other
  hosts remain separate adapters.
- This WU supersedes `review-method-family`'s pending ownership of a WU-only post-PR trigger. That WU consumes the
  shipped action-neutral `post-pr-open` hook and `coordinate-pr-review` action split rather than adding a second or
  review-named extension; it retains ownership of reusable self/peer/response methods and content/lane-aware review
  actions. The generic hook also fires for Errands, while the controller decision lets an exempt Errand action return
  without requesting review.
- The proven decision/evidence vocabulary and hook/action split are routed to `review-method-family`; housekeep
  provenance is routed to `shared-inbox-model`.

### Project alignment

The design implements PROJECT-PRD's **Operational friction down, judgment friction up** principle by automating
classification, evidence, and repair while retaining explicit acceptance/waiver/merge decisions. Its typed,
host/provider-neutral boundary implements **Configurable methodology, open ecosystem**, and equal Codex/Claude support
preserves cross-tool compatibility. It adds no autonomous execution model or prescribed adopter tool choice.

It fits `TECHNICAL-OVERVIEW.md` § 2 Architecture Components and § 3 Infrastructure: the implementation uses the
existing TypeScript script pattern, GitHub Actions CI, strict typed/tested boundaries, and current Node/npm tooling.
The accepted technical-overview delta adds a private GitHub App as this repository's host-adapter identity and records
that it has no webhook/service runtime. The WU introduces no CLI runtime dependency or published command/API. It does
add inactive adopter-facing extension shells and intentionally replaces the pre-public action-named pre-open surface.

## Success Criteria

1. For a fixed change-set/policy identity, CI completion cannot change review disposition; retarget/head/policy
   changes deterministically invalidate it.
2. Self-hosting lane, owner, risk, and reason-code fixtures cover every predicate and fail safe on unknown input.
3. `ReviewCore` tests contain no GitHub, GitHub Actions, App, CodeRabbit, or harness type/token; GitHub-host,
   CodeRabbit-provider, execution, and self-hosting-policy adapters satisfy explicit independent port contracts.
4. Every accepted independent-analysis source is qualified against `independent-analysis/v1` with exact coverage,
   durable result/finding evidence, failure distinction, and explicit finding-closure behavior.
5. Reviewed-sensitive ready PRs require current qualified analysis; reviewed-routine PRs spend no quota unless
   accepted; auto and draft PRs trigger no review.
6. Full and incremental evidence can satisfy a requirement only through coverage and authority-bound per-finding
   closure rules; bare thread resolution is insufficient, and alternate sources cannot erase surviving findings.
7. A required PR admits at most one automatic initial request per requirement history; later pushes stale the gate
   but spend nothing until an authorized checkpoint coalesces them into one current-change-set request.
8. Every provider request has a durable reservation and unique request key; exact replay is rejected while explicit
   same-change-set generations and permitted alternate-source attempts remain possible.
9. Waivers, finding dismissals, overrides, and agent/human attestations enforce current host permissions, scope to the
   current change-set/policy/rubric identities, and leave controller receipts.
10. `merge-ok` stays pending/failing for every declared readiness, conflict, base-freshness, CI, review, stale,
   timeout, or inconsistent-state blocker and names the blocker in its summary.
11. The trusted controller executes no PR code, handles fork inputs safely, reconciles idempotently, and repairs
   missed events without automatically replaying ambiguous provider requests.
12. Authoritative receipts/checks use the dedicated repository-scoped App token and reject `github-actions`, another
    App, missing credentials/installation, or a mismatched App id; branch protection pins the proven App source.
13. CodeRabbit organization inheritance is preserved; the admitted trigger, progress/failure, Request Changes,
   quota, full/incremental, and finding-closure behaviors are fixture-covered and listed as live-probe gates.
14. Fresh Codex CLI and Claude Code full reviews can satisfy only allowed requirements through authenticated durable
    attestations; a local-only transcript cannot turn the gate green.
15. Human peer approval, qualified-human independent analysis, requested changes, dismissal, and unresolved-thread
    fixtures compose without treating self-authorization as teammate review.
16. Package/project live surfaces contain no `pre-pr-review` declaration or fire point; package source ships inactive,
    action-empty `pre-pr-open` / `post-pr-open` shells, and work-unit/Errand integration exercise the specified
    create/resume boundaries.
17. This repository activates `post-pr-open` and the final-head `pre-merge-review` checkpoint to invoke
    `coordinate-pr-review.md`, leaves `pre-pr-open` inactive, and supports ordered additional actions without
    duplicate local CodeRabbit review spend.
18. `coordinate-pr-review.md` contains no direct provider request path, routes initial/repeat decisions through the
    controller, is re-entry-safe across an already-open PR, and settles lifecycle-created final/reconcile heads before
    merge approval.
19. `diff-review` remains an author-side local preflight with no default external provider and no ability to satisfy
    independent/peer review evidence; its checklist and `review.pre_merge` invocation otherwise remain stable.
20. The implementation PR preserves legacy `merge-ok`, emits `ci-ok` and shadow-capable state, and ships executable
    normal plus controller/App-outage recovery runbooks whose required-context sets are never empty or name-colliding
    and never authorize an admin merge bypass.
21. No new user-scoped git-config key, ARC review-provider setting, published CLI surface, runtime dependency, or
    premature generalized provider registry ships.
22. `TECHNICAL-OVERVIEW.md` accurately describes the shadow state delivered by the WU and the final state delivered
    by the cutover; all applicable documentation, shell, TypeScript, typecheck, unit/integration/E2E, build, and
    workflow checks pass.

## Open Questions

None at design level. The post-main cutover Errand must empirically prove CodeRabbit's one-shot label behavior,
GitHub evidence and incremental-coverage bounds, finding-closure signal, provider-capacity observability, reactive
`@Codex` artifacts, App-authored receipts/checks, and branch protection's expected application identity. Failure to
prove a native adapter contract leaves that adapter disabled or selects the already-defined
explicit-request/generic-attestation fallback; it does not reopen the normalized design. The downstream GitHub-adapter
WU must separately prove manifest callback portability and adopter setup/upgrade/uninstall UX before publishing it.
