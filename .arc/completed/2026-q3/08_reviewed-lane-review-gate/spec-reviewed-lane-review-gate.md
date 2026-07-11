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
7. Use CodeRabbit as the first self-hosting provider while supporting maintainer-attested fresh Codex CLI and Claude
   Code review equally through a provider-neutral attestation path.
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

- `scripts/classify-change.sh` owns the canonical code-surface predicate through its existing argv interface plus a
  NUL-stdin mode, and emits mutable CI-cost results. The self-hosting policy consumes the same structured path set and
  code-surface result to emit the stable review-policy record; shell code does not parse meta ownership or review
  requirements.
- `packages/arc-framework/src/scripts/review-gate/core/` is the to-be-created host/provider-neutral reducer,
  requirement/evidence schema, admission engine, and verdict model.
- `packages/arc-framework/src/scripts/review-gate/hosts/github/` is the to-be-created GitHub host adapter and current
  receipt-store implementation: change-set discovery, permissions, review/conversation observation, App-comment
  persistence, and check-run projection.
- `packages/arc-framework/src/scripts/review-gate/providers/coderabbit/` is the to-be-created CodeRabbit provider
  adapter: capacity, request translation, acknowledgement, result/finding normalization, and closure evidence.
- `packages/arc-framework/src/scripts/review-gate/policy/self-hosting/` is the versioned plain-data repository policy,
  evaluator, author map, accepted-source qualifications, and rubric binding. Its policy document carries closed
  predicate/semantics identifiers plus parameters rather than executable functions. All review-gate script surfaces
  remain excluded from the published CLI bundle.
- `.github/workflows/review-gate.yml` is the to-be-created trusted default-ref event/schedule entry point. A read-only
  discovery job maps wake-ups to PR ids, then per-PR matrix jobs invoke protected controller code.
- `.github/workflows/review-gate-wakeup.yml` is the to-be-created secretless relay for review/review-comment events
  whose fork runs cannot receive privileged credentials; its completed run is only a reconciliation hint.
- `.github/workflows/review-gate-attest.yml` is the to-be-created default-branch `workflow_dispatch` entry for
  authenticated out-of-band agent and human attestations.
- A private maintainer-account-owned GitHub App, installed only on this repository, supplies the GitHub adapter's
  distinct receipt/check identity. Repository variables `ARC_REVIEW_GATE_APP_CLIENT_ID` and `ARC_REVIEW_GATE_APP_ID`
  hold its token-minting client id and evidence-authentication numeric id. GitHub environment `review-gate`,
  restricted to the selected default branch, holds `ARC_REVIEW_GATE_APP_PRIVATE_KEY`; privileged jobs reference it,
  and the deployment records environment-referencing jobs always mint stay inert bookkeeping (a rejected attempt
  leaves a failed record), never an access path.
- `.github/workflows/ci.yml` emits `ci-ok`, retains a temporary compatibility `merge-ok`, and exposes classifier
  output.
- `.coderabbit.yaml` is the to-be-created repository delta with account-level inheritance and explicit opt-in.
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
  post-final operational closeout PR applies the current-fact final-state wording after enforcement is proven.
- A new ADR under `.arc/reference/adr/` records the durable decision cluster: the evidence-composed App-owned
  required check replacing the CI-only rollup, receipt-over-comment authority, typed non-substitutable
  requirements, the provider-neutral core/host-adapter split, and the probe-revisable CodeRabbit non-satisfying
  determination.

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
- `GitHostAdapter` resolves host coordinates and actor permissions, observes native reviews/conversations, and
  projects the verdict to the host's required-status primitive.
- `ReviewReceiptStore` persists and reads ARC-owned review events through version-checked append. GitHub App comments
  are this deployment's backing store, not part of the receipt contract.
- `ReviewProviderAdapter` exposes capacity, request, acknowledgement, evidence, and finding-closure operations without
  deciding obligation or merge readiness.
- The execution adapter supplies trusted wake-ups and credentials. GitHub Actions is the self-hosting implementation;
  it is not part of `ReviewCore`.

The typed ports expose behavior rather than platform objects:

```text
GitHostAdapter:
  resolveChangeRequest(hostRef) -> NormalizedChangeRequest
  resolveActorCapabilities(actor) -> CapabilitySet
  observeNativeEvidence(changeRequestId) -> NativeEvidence[]
  publishVerdict(changeRequestId, GateProjection) -> HostProjectionRef

ReviewReceiptStore:
  readLedger(changeRequestId) -> { ledgerVersion, receipts[] }
  appendReceipt(receipt, expectedLedgerVersion) -> { ledgerVersion, durableEvidenceRef }

ReviewProviderAdapter:
  readCapacity(sourceIdentity) -> Capacity
  request(admittedRequest) -> RequestAcknowledgement
  observe(requestIdentity) -> ProviderObservation[]
  normalizeEvidence(observations) -> Evidence[]
```

`NormalizedChangeRequest`, capabilities, receipts, evidence, requests, and `GateProjection` are core-owned data. Host,
store, and provider adapters may retain opaque round-trip references, but those references never participate in policy
classification or verdict logic except through their validated normalized fields. A later backing-store or hosted
event-log implementation can replace GitHub comments without changing receipt, admission, or verdict semantics.

The core has no work-unit identity or PR-cardinality concept. One reconciliation targets one explicit
`change_request_id` / `hostRef`; an orchestration layer may later coordinate several change requests for one work unit
without changing requirement, evidence, admission, or verdict semantics. Host/workflow callers must pass the target
explicitly rather than rely on “the PR for the current branch” as a core invariant.

The GitHub App has only metadata read, checks write, pull-requests write, and commit-status read repository
permissions. Pull-requests write owns PR ledger comments and the one-shot label — GitHub routes issue-API
operations on a pull request through the pull-requests permission, so no issues permission is held — and also
observes native review state; the write grant cannot merge (merging additionally requires contents write, which
the App never holds). It has no OAuth authorization, webhook, persistent service, issues, contents write,
administration, secrets, members, actions, or workflow permission. Trusted jobs mint a short-lived installation token
scoped to the current repository through `actions/create-github-app-token` pinned to a full commit SHA, supplying
explicit `permission-*` inputs so the token never inherits a broader installation grant. The action receives
`ARC_REVIEW_GATE_APP_CLIENT_ID`; the adapter separately authenticates host evidence against
`ARC_REVIEW_GATE_APP_ID`.

The App private key is an environment secret, never a repository/organization secret. Before adding it, setup creates
or repairs environment `review-gate`, restricts deployment branches to the exact protected default branch, and
verifies a non-default dispatch cannot receive the secret — the environment rejects the job before any step runs.
Environment-referencing jobs always mint deployment records (a rejected attempt leaves a failed record); these
records are inert bookkeeping, not an access path. `GITHUB_TOKEN` remains
read-only and may fetch protected default-branch/base-repository objects but never authors an authoritative receipt or
gate check. Missing credentials, a missing installation, an unsafe environment, or an App-id mismatch fails closed.
Setup-time environment/secret/variable writes and branch-protection changes use the maintainer's authenticated local
`gh` credential, never broaden the runtime App.

The two canonical extension names describe only hook points. Each extension's project-filled `.actions` section may
contain numbered blocks of unrelated actions; the workflow executes them sequentially in authored order and halts on
failure. The framework package ships the canonical pair inactive and placeholder-only. This implementation prepares
inactive project actions for `post-pr-open` and the existing final-state `pre-merge-review`; the post-main cutover
activates both to enter `coordinate-pr-review.md`. `pre-pr-open` remains inactive here.

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

`change_set_id` hashes the UTF-8 tuple with literal NUL separators. `policy_version` is the SHA-256 digest of a
validated plain-data policy document: schema/semantics versions, closed lane/risk predicate identifiers and their
parameters, author map, requirement templates (including initial admission), accepted-source qualifications, pinned
expected App and provider bot account ids, timeouts, rubric bindings, and rollout-independent enforcement rules.
Canonicalization recursively sorts object keys, preserves array order, rejects non-JSON values and non-finite
numbers, and hashes the UTF-8 JSON bytes. Runtime
evaluator functions are not serializable policy; a semantic change requires a new closed predicate or semantics
version in the document. Rollout mode and observed provider capacity are excluded. The digest is not a hand-maintained
label. Section 4 defines the repository-owned rubric; the project runbook carries its operational copy and an explicit
initial `rubric_version` of `independent-analysis/v1`. Changing that rubric requires changing the version in the same
reviewed commit. Provider adapters declare which rubric version they are qualified to satisfy.

Reconciliation emits two separate records from one structured changed-path set and canonical code-surface predicate:

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

Artifact grouping is deterministic and ref-backed. A movable artifact's slug comes from its canonical basename; its
companion is `meta-<slug>.md` in the same logical artifact directory (the flat `active/` root or the matching nested
backlog directory). Existing/deleted groups read that companion from `diff_base_sha`; genuinely new groups read it from
`head_sha`. The policy adapter reuses the repository's ref-tree reader and canonical meta parser—never a checkout-local
scan. A rename across slugs/directories, an owner-field delta, multiple possible companions, mixed group ownership, a
missing/unparseable companion, or any other non-unique mapping resolves `reviewed`. Real-git fixtures cover the flat
and nested layouts, add/delete/rename/transition cases, and unusual valid filenames.

Disciplined housekeep changes to the shared inbox or derived project view remain conservatively
`reviewed + routine` until `shared-inbox-model` supplies trustworthy operation provenance. This known false positive
does not spend provider quota automatically.

#### Review risk

`sensitive` applies when the diff is empty/unresolvable, the pure `classify-change.sh classify` predicate (argv or
`--stdin0`) identifies any stable code-surface path, or a changed path matches one of:

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
be the PR author. CodeRabbit runs stock in shadow observation — repository review instructions implementing the
rubric are authored only if its qualification is pursued, versioned under `rubric_version` in that same reviewed
commit — and remains non-satisfying: its findings arrive as immutable App-bot review threads, but its thread
resolutions do not semantically confirm the underlying finding, a clean run leaves only a mutable walkthrough edit
with no coverage-bound artifact, and identical inputs do not reproduce a finding set. Mutable walkthrough text or its edit
revision can correlate a provider run but cannot identify a finding or prove clean coverage. If a source cannot
prove one of these capabilities, policy may not list it as acceptable even if it can post useful comments.

The implementation policy therefore ships CodeRabbit's satisfying qualification disabled while retaining its adapter
in shadow observation; current provider behavior is expected to leave it disabled, with the attestation path
carrying required proofs. If a live probe ever records every required capability, the cutover PR enables the
versioned qualification declaration (or leaves it disabled and uses explicit-request/generic-attestation fallback).
Enabling it changes `policy_version`, invalidates earlier shadow evidence, and requires a fresh required/clean
proof before the App-owned final context becomes required. No secret, runtime capacity value, or mutable host label controls
qualification.

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
initial_admission: automatic | checkpoint
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
review_run_id?, reviewer_claim?, submitter_identity?
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
not expose that identity, require a later source-confirmed result or authorized dismissal. For CodeRabbit, the source-
scoped finding identity derives from immutable GitHub review-thread/comment node ids bound to the provider's Bot
account — its immutable numeric user id; provider comments carry no `performed_via_github_app` — and provider run,
never a mutable walkthrough body. CodeRabbit-authored thread resolution is attributable but does not semantically
confirm the finding (observed: an unaddressed finding resolved while an addressed one stayed open), so no CodeRabbit
resolution or approval signal closes a finding; closure comes from qualifying current-change-set evidence or an
authorized dismissal receipt. User resolution by itself is insufficient. Aggregate `clean` without a valid closure
record for every prior finding cannot erase them.

Capacity is per candidate source and carries both `status: available | exhausted | unknown` and a reason/provenance
code. `provider-reported` accompanies a known available/exhausted result; unknown distinguishes `not-observable` from
`lookup-failed`. Execution is per requirement/request:
`not-requested | queued | running | clean | findings | failed | unavailable | waived | stale`. A new change set
invalidates overrides and makes prior evidence non-satisfying on its own; the coverage rule below is the only way
older analysis contributes to a later head.

Known exhaustion suppresses provider invocation and offers an allowed alternate, qualified human where policy permits,
or an explicit waiver. `unknown:not-observable` may permit the one already-justified required or explicitly accepted
attempt; `unknown:lookup-failed` suppresses automatic spend until repair or an authorized explicit refresh accepts the
uncertainty. A provider quota rejection becomes unavailable. Recommended + unavailable remains visible and
non-blocking. Capacity controls an attempt, never obligation, and cannot remain a blocker after current qualifying
evidence satisfies the requirement.

Source kinds are never implicitly interchangeable:

- A peer/Code Owner requirement normally accepts an authorized human teammate; agent evidence does not substitute.
- Independent analysis accepts only sources listed by project policy. The initial self-hosting set is CodeRabbit,
  maintainer-attested fresh Codex CLI, maintainer-attested fresh Claude Code, a later proven PR-native agent adapter,
  or a qualified human who is not the PR author.
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

At every wake-up, the execution adapter re-queries canonical host, receipt-store, and provider state and passes
normalized inputs to the core. Security- and spend-relevant transitions are storage-agnostic receipt events persisted
through `ReviewReceiptStore` with optimistic, version-checked append. In this deployment,
`GitHubCommentReceiptStore` uses controller-authored PR issue comments: one compact visible summary plus a collapsible
machine payload per authoritative transition. It never comments for observation, waiting, or routine check refreshes.
One additional compact App-authored ledger-anchor comment is created once per PR and updated in place with the current
ledger version/count; it is store metadata, not a receipt event. The current check echoes the anchor version as a
secondary projection. The validated storage envelope and receipt payload are:

```text
durable_record_id, recorded_at, last_modified_at
schema_version, event_id, idempotency_key, previous_ledger_version, receipt_hash
repository_id, change_request_id, base_ref, base_sha, diff_base_sha, head_sha, change_set_id
policy_version, rubric_version, requirement_id
action, request_id, generation, actor, actor_permission, reason
source_identity, coverage, coverage_from_sha, coverage_through_sha
result, evidence_url_or_id, observed_at
finding_ids[]
closures[]: { finding_id, authority_kind, authority_identity, evidence_url_or_id }
```

The core accepts only receipt-store-validated records. On GitHub that means an unedited, schema-valid comment from the
dedicated App with host-created record identity/time. User comments and dispatch inputs remain untrusted commands until
validation emits a receipt. `observed_at` records provider evidence time; it never orders authoritative receipts or
starts a timeout. Provider labels and `merge-ok` are projections, not the ledger.

Canonical receipt hashing includes the previous ledger version and validated payload, but not the store-assigned
envelope. Byte-equivalent records with the same idempotency key and predecessor collapse to one logical event;
divergent duplicates, forks, edits, missing pages, ledger regression, or malformed records fail closed. Every append
advances the stable PR-scoped anchor through the same expected-version discipline; a receipt/anchor mismatch, missing
anchor after bootstrap, or anchor regression detects deletion/tail truncation across head changes and force-pushes.
The App check echoes but never replaces that anchor. Receipt comments are append-only by controller discipline, not
an immutable host primitive; the anchor is the one deliberately mutable comment. Compromise or authorized destruction
of the receipt comments, anchor, and App checks together is an incident and enters the audited break-glass runbook;
the design does not claim tamper resistance against that authority boundary.

Request identities are hierarchical:

- requirement key: `(repository, change request, change set, policy version, rubric version, requirement id)`;
- request key: requirement key + source identity + coverage bounds + generation.

Exact request-key replay is rejected. The first admitted attempt for a change set is generation zero whether its
admission was automatic or explicit; a later same-change-set refresh advances the generation. An allowed
alternate-source fallback changes source and runs full coverage. Both remain under the same requirement without being
mistaken for duplicates.

Generation-zero automatic admission occurs only when a required change request is ready, its stable requirement
template sets `initial_admission: automatic`, and no request for that requirement has ever been admitted in its receipt
history. The self-hosting required independent-analysis template uses `automatic`; recommended work uses `checkpoint`
and never auto-admits. When every currently-acceptable source for a requirement is attestation-shaped (no
machine-invokable qualified provider), automatic admission reduces to surfacing the pending obligation — no
reservation or provider invocation fires — and the requirement waits on attested evidence, an explicit command, or
a waiver. A future multi-deliverable orchestration policy may select `checkpoint` for particular planned
deliverables without changing their obligation—the admission mode is versioned policy/topology, never mutable provider
capacity or remaining usage. On GitHub, the automatic arm covers an opened-ready PR, the first draft-to-ready
transition, and scheduled repair of a missed initial event. After any request has been
admitted, a new head invalidates evidence and leaves the current requirement `not-requested`; `synchronize` wakes
reconciliation but cannot spend quota. The open-PR workflow presents the checkpoint and an authorized `refresh`
admits generation zero for the new change set with validated full/incremental coverage. A later refresh on that same
change set advances the generation. Coalesced pushes before the checkpoint therefore create one current change set and
one request, while `merge-ok` remains pending for required analysis until admission and qualifying evidence complete.

Admission is a version-checked effect protocol:

1. Append a `reserved` receipt against the ledger version read before provider invocation.
2. Perform a bounded canonical re-read and invoke only when that reservation remains canonical and the current
   change-set/policy/permission guards still match.
3. Make at most one controller invocation attempt for the admitted request key.
4. Append an `acknowledged` or terminal-failure receipt when observable.

A reservation with no acknowledgement 10 minutes after its store-authenticated `recorded_at` becomes an ambiguous
blocking failure. Repair never retries it automatically because the provider may have accepted the request before a
response or webhook was lost. An explicit refresh creates the next generation. An acknowledged review with no
terminal evidence after 60 minutes becomes a visible retriable failure, never success. This is an at-most-one
controller-attempt guarantee, not an impossible claim of exactly-once delivery by an external provider.

The provider adapter selects one live-proven request mechanism before reservation. A trigger whose delivery is
ambiguous never falls through to another mechanism in the same generation; only provable pre-effect rejection permits
a different mechanism without risking duplicate spend. A user may still invoke a provider directly outside ARC. Such
an invocation can consume provider allowance, is never attributed to a reservation, and may enter the ledger only as
`unadmitted` evidence after independently passing the normal source/result/coverage/finding qualification contract.

### 7. Authorization and command surface

The controller accepts strict, host/provider-neutral commands; a host adapter maps its native authenticated input
surface onto them:

```text
/review-gate require <requirement-id> <reason>
/review-gate waive <requirement-id> <reason>
/review-gate refresh <requirement-id> <source|auto> <full|incremental> <reason>
/review-gate dismiss <requirement-id> <source-identity> <finding-id> <reason>
```

Identifiers match `[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}`. The reason is the trimmed final field, must be 1–1024 UTF-8
bytes, and rejects NUL, CR/LF, and other ASCII control characters; the whole command is at most 4096 UTF-8 bytes and
is never shell-tokenized. Attestation dispatch accepts one strict JSON manifest of at most 32 KiB, with at most 256
findings or closures, identifiers under the same bound, and evidence references of at most 2048 UTF-8 bytes. Oversize
or structurally unknown input fails before authorization.

`requirement-id` may name an active requirement or a policy-defined candidate template when an exempt/recommended
decision is raised. An accepted `require` command emits the scoped obligation override and immediately evaluates
generation zero for the policy-preferred source with full current-change-set coverage. Known exhaustion or a failed
capacity lookup suppresses invocation and leaves the new requirement blocking with the normal explicit-refresh,
alternate, and waiver paths. `dismiss` closes exactly one current, known `(source identity, finding id)` pair and
emits the dedicated dismissal receipt; it cannot imply a clean review or waive the surrounding requirement. There is
no implicit waive-all. The controller rejects unknown
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

The GitHub workflow authenticates authoritative API writes with the dedicated App installation token. Receipt/anchor
comments must carry the expected immutable `performed_via_github_app.id` plus bot account id; custom checks must report
the same App id as their source. Repository, change request, human, bot, and App authority binds to immutable numeric
or node ids, with mutable/case-insensitive logins retained only for display. The adapter pins the expected App id from
`ARC_REVIEW_GATE_APP_ID`, rejects `github-actions` or any other author/source even when names and payloads match, and
never accepts a login, check name, or `external_id` alone as authority.

The injected GitHub client pins the current REST API version and uses REST for repository, PR, collaborator permission,
review, issue-comment, and check operations. GraphQL is limited to paginated review-thread state (`isResolved` plus
`resolvedBy`) and the aggregate `reviewDecision`. All connections paginate completely. Idempotent reads use bounded
transient/rate-limit retries; writes are never retried blindly, and an ambiguous write re-queries by its stable
idempotency identity. Incomplete enumeration is unavailable/inconsistent state, never an empty success.

Events are wake-ups, never trusted snapshots. The privileged `review-gate.yml` listens for:

- `pull_request_target` open/reopen/synchronize/ready/draft/edit/retarget/label changes against the default branch;
- commit `status` changes, including CodeRabbit progress/failure;
- completed `workflow_run` events filtered to CI and the secretless review wake-up workflow;
- issue comments and opportunistic external check completion/rerequest;
- a 15-minute scheduled repair sweep over all open PRs in scope, including PRs with no existing gate state.

GitHub suppresses `check_run` workflow events for GitHub Actions-created suites, so CI completion relies on the
filtered `workflow_run`, never `check_run`. `review-gate-wakeup.yml` listens for submitted/edited/dismissed reviews and
created/edited/deleted review comments with no secrets, checkout, input execution, or writes. Its completed
`workflow_run` may identify candidate PRs but supplies no authoritative evidence. Fork events with missing/ambiguous
candidate mapping wait for scheduled repair rather than weakening policy.

Each privileged wake-up first runs read-only discovery without the App secret. Direct PR/comment/attestation events
name one candidate; status and workflow-run events resolve every associated open PR; schedule paginates every open PR
so a missed initial event with no anchor/check remains discoverable. Discovery emits a bounded, deduplicated matrix of
numeric repository/PR ids. Incomplete pagination, candidate overflow, or ambiguous mapping is visible failure, not a
partial success.

Each matrix leg resolves the latest change set, queries canonical state, validates receipts, rejects stale evidence,
and updates one custom check idempotently. Every receipt-authoring leg and attestation dispatch shares the same
repository-id/PR-id concurrency group with `cancel-in-progress: false`: queued wake-ups may coalesce, but a newer event
never cancels an effectful running reconciler. Event order is irrelevant because every run re-queries current state,
and final current-state guards stop stale writers. Updating the controller's own check must not recursively trigger
another reconciliation.

Privileged jobs reference the default-branch-restricted environment and check out `github.workflow_sha`; all actions
are full-SHA pinned, checkout persistence/caches are disabled, dependencies come from the protected lockfile, and the
controller invokes the installed local `tsx` binary without package-download fallback. A `workflow_dispatch` request
for a non-default ref cannot enter the environment or obtain the private key.

Each custom check uses deterministic external id `arc-review-gate:<PR>:<change-set>:<context-name>` and is looked up
by external id plus the dedicated App id before creation. If an interrupted race leaves multiple matches, the
reconciler elects the newest run, mirrors the canonical conclusion to every match, and reports the duplicate.
Enforcement cannot proceed until the live probe shows GitHub treats the context/source unambiguously; divergent
same-name checks are never ignored.

The controller uses `pull_request_target` only for trusted default-branch metadata/API work. It validates repository,
PR, ref, and 40-hex SHA identities, then fetches only the trusted base repository's base ref and
`refs/pull/<number>/head` using argument-array process execution and the narrow read token. It never follows a
fork-controlled remote, checks out or executes PR code, interpolates untrusted values into shell commands, or parses
path lists with newline assumptions. The App token remains limited to API/comment/check operations, and the required
check's expected application source is pinned to that App after live verification. Fork PRs receive the same policy
without secrets or write authority in untrusted code.

`merge-ok` is the only final required status:

```text
PR readiness / mergeability ─────┐
CI jobs ──> ci-ok ───────────────┤
native required-review decision ─┤
                                 ├──> merge-ok
policy decision + overrides ─────┤
human/agent/tool evidence ────────┘
```

Conclusions are:

- `pending`: draft PR; unresolved mergeability; enforced base-freshness wait; expected native review still required;
  queued/running/not-requested required work; stale evidence; or a required request suppressed by exhausted or
  lookup-failed capacity without a qualifying alternate, explicit refresh, or waiver.
- `failure`: base conflict; CI failure; required review failure/unavailability/timeout; blocking findings;
  unresolved review conversations; native requested changes/`CHANGES_REQUESTED`; malformed/inconsistent controller
  state.
- `success`: PR ready, non-conflicting, and base-fresh where enforced; CI passed; each review obligation is
  inapplicable, remains non-blocking recommended, is satisfied by current-change-set evidence, or is explicitly
  waived; and any configured host-native required-review decision is `APPROVED`.

The check summary names the policy decision, reason codes, requirement states, evidence sources/coverage, CI state,
and receipt links. Green means no blocker exists in this declared scope; the ARC integration interlock remains the
separate human authorization to merge.

### 9. CodeRabbit adapter

The repository adds `.coderabbit.yaml` with `inheritance: true` so normal account-level settings merge instead of
being shadowed by repository defaults. Its delta:

- enables auto review restricted to the single controller-owned trigger label (`auto_review.enabled: true` plus
  `auto_review.labels`); the label list restricts enabled auto review, and a disabled `auto_review` makes the
  label path inert, so blanket review stays off through the label restriction, not the enabled flag;
- clears `auto_review.description_keyword`, keeps `auto_review.drafts: false`, and sets
  `auto_review.auto_incremental_review: false`;
- enables CodeRabbit's `commit_status` pending/success projection and `fail_commit_status` failure projection;
- enables Request Changes so unresolved findings produce native blocking review state;
- leaves `review_status` inherited because it controls walkthrough-comment messaging, not the GitHub commit status.

Inheritance deep-merges objects and appends unique array entries, so repository static validation proves only this
delta—not the effective trigger set. Before cutover, `@coderabbitai configuration` must show the fully resolved
configuration has no inherited positive label, description keyword, global override, or other automatic path that
bypasses controller admission. If the effective configuration cannot be constrained, setup repairs the account-level
setting or selects the explicit-command request strategy; label qualification stays disabled.

The label is a one-shot request handshake, not durable classification. After writing a reservation, the controller
applies it for the exact change set and removes it after provider acknowledgement or terminal invocation failure.
A label application triggers one review; a persisting label does not re-review later pushes, so removal is hygiene
rather than spend control. The controller does not depend on a GitHub Actions `labeled` event caused by its own
`GITHUB_TOKEN`. CodeRabbit's commit status (context `CodeRabbit`) is provider progress evidence, not ARC's
authoritative required context: the status read exposes no creator identity, reports completion regardless of
verdict, and can assert completion for a head that carries no review object — provider identity therefore
authenticates through review/comment authorship, and the adapter observes comments and reviews as the substantive
signals.

The adapter's request mechanisms are role-split: the trigger label serves generation zero, and the explicit
full-review command serves refresh generations. The plain incremental command defers to the auto-review system
under label gating and is not a request mechanism. Only findings-bearing runs leave immutable evidence (a review
object plus thread comments); a clean run surfaces as a mutable walkthrough edit and an unbound completion
status, leaving no durable clean-coverage artifact. Runtime ambiguity never falls through from one mechanism to
another. Direct human CodeRabbit commands remain possible and may spend allowance, but ARC neither emits nor
attributes them to a reservation; their result can qualify only through the `unadmitted` evidence path. Provider
labels, commands, status contexts, quota commands, and response translation remain inside the adapter.

CodeRabbit capacity uses the normalized status plus provenance contract. Its non-spending rate-limit command
returns unstructured prose with no numeric or identity-bound content, so it is not promotable to a lookup
capability: the adapter reports `unknown:not-observable` and relies on the single admitted-attempt guard. Known
exhaustion and provider quota rejection block as unavailable and offer a permitted full alternate review or waiver;
capacity never rewrites policy.

### 10. Codex, Claude, and human evidence

The fallback contract is a source-neutral attestation, not a Codex-only integration. A fresh Codex CLI, Claude Code,
or CodeRabbit CLI reviewer runs the project rubric against the current full change set and publishes durable
evidence on GitHub. A
maintainer then invokes `review-gate-attest.yml` with `source_kind: agent`, a policy-accepted `reviewer_claim`, unique
`review_run_id`, harness kind/version, requirement id, result, base/diff/head identities, change-set id, policy/rubric
versions, full coverage bounds, evidence URL/id, run timestamps, and the normalized finding manifest plus any
explicitly closed finding ids.

The default-branch workflow authenticates and records `submitter_identity`, validates actor permission and payload,
rejects reused run ids or stale coverage, then emits a controller receipt. It does not claim to authenticate the
agent or cryptographically prove freshness: the policy explicitly trusts a `maintain`/`admin` actor's attestation of
the named fresh-run provenance. Agent prose is never parsed as authority; an unauthenticated PR-body token,
local-only transcript, or expiring/unlinked artifact is not gate evidence. A `findings` attestation remains blocking
until current-change-set evidence closes the findings.

Reactive `@Codex` or a future Claude GitHub integration becomes a native adapter only after a live probe proves a
stable current-head artifact and observable coverage/result contract. Local Codex `/review`, Claude Code review, and
CodeRabbit CLI review (structured agent-mode findings with rubric delivery through its instruction-file input;
coverage bounds resolved by the attesting maintainer and finding ids minted in the manifest) remain valid analysis
mechanisms but require the generic attestation because they do not inherently publish gate state.

Human review composes by requirement kind. The adapter normalizes individual reviews by immutable actor/head and
separately observes GitHub's aggregate `reviewDecision`. It never parses `CODEOWNERS` or claims which actor is a Code
Owner: ARC's existing setup surface installs/guides the base-branch mapping and GitHub evaluates its required-review,
count, stale-review, team, and ruleset semantics. When versioned project policy expects native required review,
`REVIEW_REQUIRED` remains pending, `CHANGES_REQUESTED` fails, `APPROVED` clears the host-native review blocker, and
missing/unknown state fails closed. A current native `APPROVED` by an accepted actor may separately satisfy only a
plain peer-approval requirement; it is not independent-analysis evidence.

A human satisfies independent analysis through the same dispatch with `source_kind: human`: the authenticated
dispatch actor's immutable identity must equal `source_identity`, hold `write`, `maintain`, or `admin`, be allowed by
the requirement's human qualifier, and not be the PR author. The human submits the full rubric result/finding manifest
and durable GitHub evidence link; the controller receipt is the authenticated attestation. Agent attestations remain
`maintain`/`admin`-submitted, with authenticated submitter identity separate from the claimed fresh agent/run.
Self-hosting formal peer/Code Owner enforcement remains disabled for the sole-maintainer repository; requested changes
and all unresolved review threads still block.

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
  the generic lifecycle hook. The caller supplies the platform-neutral
  `proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }` input; the hook never infers it from WU or
  branch state and does not infer WU-wide PR cardinality.
- `post-pr-open` fires after the workflow observes an open PR and before review iteration or the Errand integration
  interlock. It fires after creation and again when a later session re-enters with the PR already open. Its configured
  actions must therefore be idempotent. The caller supplies the platform-neutral
  `openedChangeRequest = { repositoryRef, hostRef, headSha }` input; each action re-queries current host/controller
  state from that explicit target rather than local memory or an assumption that the WU owns only one PR. The
  adapter treats these coordinates as opaque validated values and owns any host-specific conversion.

`pre-pr-review` is removed rather than retained as an alias. ARC has not crossed its public compatibility boundary,
and moving that name to the new fire point would silently change both timing and `review.pre_merge` gating. A
pre-release installation that customized the removed Configurable file must manually place any still-wanted,
non-review action at the appropriate canonical hook; an updater-retained copy is inert and no workflow declares or
fires it.

`integrate-work-unit.md` removes the old extension from the `diff-review` step, fires `pre-pr-open` directly before PR
creation, and fires `post-pr-open` at entry to Step 4. It also moves `pre-merge-review` from the pre-composition
position to Step 13 after the final/sweep push and every behind-base reconcile push, immediately before the integration
interlock. Any review action that creates and pushes a fix invalidates that checkpoint and loops through base-freshness
reconciliation plus the final review hook again. The integration interlock fires only after this loop reaches an
unchanged, current, settled head, guaranteeing a checkpoint after every lifecycle- or review-authored commit.

`run-errand.md` paginates an exact repository/head-branch PR lookup before creation. One open match is reused and
receives `post-pr-open`; no match enters the creation arm; one merged match for the current head skips review/merge and
continues to cleanup. A closed-unmerged match, conflicting or multiple candidates, or incomplete/failed lookup stops
for direction rather than reopening, creating, or choosing silently. The workflow fires `pre-pr-open` only on the
creation path and `post-pr-open` on both create and resume paths. Its `pre-merge-review` fire point moves before the
integration interlock; any resulting fix/request push invalidates the checkpoint and repeats base/current-head review
until stable. The extension's existing name is not normalized here.

Both canonical extension shells name only their hook point and accept multiple ordered project actions. The exact
inactive placeholder is `[No extension configured]`. A configured `.actions` section is a numbered list whose blocks
are actions; callers execute the blocks sequentially in authored order and stop before later actions when one fails.
Re-entry replays the list according to the hook's retry/idempotency contract. This convention adds no action registry
or parser-backed configuration axis. Package-source copies ship inactive with the placeholder.

This repository deletes the current local CodeRabbit subagent action with the old extension and leaves `pre-pr-open`
inactive, preventing duplicate provider spend and non-satisfying evidence. The implementation PR writes inactive
project `post-pr-open` and `pre-merge-review` action bodies that invoke `coordinate-pr-review.md`; it cannot activate
them before the trusted controller and App configuration exist on `main`. After shadow setup is proven, the cutover
PR activates those two hooks. Its already-running integration session invokes `coordinate-pr-review.md` explicitly
because its extension snapshot may predate the activation commit; future sessions discover the active actions
normally. Later project actions can be appended without renaming or multiplying hook points.

`coordinate-pr-review.md` replaces `address-pr-review.md` and broadens its responsibility from responding to findings
to coordinating one explicitly targeted open-PR review cycle. It settles that change request only; any future
multi-deliverable sequencing or WU-terminal aggregation remains the integration orchestrator's responsibility. On entry
it reads the normalized decision:

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
judgment and finding response, not a prerequisite for gate enforcement. If the controller/App is unavailable, the
coordination action fails closed with the outage-runbook pointer; only that audited break-glass procedure may suspend
the dead action for a repair PR.

### 12. Shadow rollout and enforcement cutover

The implementation PR preserves the legacy required context:

1. Refactor the current CI aggregate into `ci-ok`.
2. Add a thin compatibility job named `merge-ok` that depends on `ci-ok` and preserves today's required context.
3. Deploy the controller with GitHub Actions repository variable `REVIEW_GATE_CONTEXT_MODE=shadow` (missing/invalid
   values fail safe to `shadow`).
4. Emit `review-gate-shadow`; do not emit controller-owned `merge-ok`.
5. Ship `.github/review-gate.md` with the exact live probe, context transition, rollback, and recovery commands.

After the implementation reaches `main`, a separate Errand executes the runbook:

1. Create the private maintainer-account-owned App from the documented settings and install it only on this
   repository.
   Configure and verify the default-branch-only `review-gate` environment before adding its private-key secret; set
   `ARC_REVIEW_GATE_APP_CLIENT_ID` plus `ARC_REVIEW_GATE_APP_ID`, then dispatch shadow reconciliation from `main`.
   Prove a non-default dispatch receives no secret and that an App-authored receipt/check succeeds while same-name
   `github-actions` output and a wrong App identity are rejected.
2. Probe exempt, recommended/accepted, required/clean, findings, stale-head/retarget, agent/human attestation, provider
   failure/exhaustion, waiver, repair, bare-thread-resolution rejection, and reserved-but-unacknowledged paths. Prove
   label one-shot behavior, CodeRabbit evidence/coverage/closure authority, controller source identity, normal
   rollback, and the App/controller-outage break-glass transaction while the final App check is not sole-required.
3. Add `ci-ok` and App-owned `review-gate-shadow` as required contexts; verify both on a current PR; remove the legacy
   `merge-ok` requirement.
4. Open and merge the cutover PR that removes the CI compatibility `merge-ok` job while temporary requirements remain
   present and activates the project `post-pr-open` and `pre-merge-review` actions. The cutover session invokes
   `coordinate-pr-review.md` explicitly after the activation push because its loaded extension snapshot may be stale.
   When the probe proved CodeRabbit's full qualification contract, enable its versioned satisfying-source declaration
   in this PR; otherwise leave it disabled and retain the defined fallback.
5. Set mode `dual`; refresh open PRs under the resulting new `policy_version`; re-prove required/clean evidence and
   App-owned `merge-ok` from the pinned source, then add it as required.
6. Remove temporary `ci-ok` / `review-gate-shadow` requirements; set mode `final`; refresh; confirm the shadow alias
   disappears and App-owned `merge-ok` is the sole required status.
7. Open and merge a narrow operational closeout PR through the final gate, updating `TECHNICAL-OVERVIEW.md` from the
   delivered shadow description to the now-proven final architecture. `finalize-parallelism` remains paused until
   this current-fact documentation and the enforcement proof both land.
8. If any step fails, retain or restore the last proven required pair. Never bypass branch protection to advance.

Rollback from final mode is ordered: set `dual`, refresh and prove `review-gate-shadow`; add
`ci-ok + review-gate-shadow` as required; remove controller `merge-ok` from required contexts; then return to
`shadow`. The final context is never disabled while it is the only requirement.

That normal rollback assumes the controller and App can still publish. A controller-wide failure, missing App
installation/credential, or malformed-state failure uses an explicit audited break-glass requirement transition:

1. Freeze unrelated merges, record the incident/reason/actor/current required-context set and active review actions,
   and snapshot the current branch-protection/ruleset configuration.
2. Open a narrow repair PR that deactivates the unavailable project `post-pr-open` / `pre-merge-review` actions when
   necessary. The incident authorizes only this recorded action suspension; the current session follows the runbook
   instead of retrying the dead action. Give the exact repair diff to one fresh Codex CLI, Claude Code, or qualified
   human `independent-analysis/v1` reviewer and link its durable result/findings in the PR and incident. This evidence
   is break-glass process evidence, not a fabricated controller receipt or satisfying gate result.
3. Using the maintainer's authenticated admin credential, add the independently produced `ci-ok` context as required
   and verify it is present and green on the exact repair PR head. The repair PR must not modify the `ci-ok` producer
   or its workflow; otherwise a separately reviewed prerequisite restores that producer first.
4. Remove the unavailable App-owned `merge-ok` requirement only after `ci-ok` and the independent repair review are
   proven. Merge the narrow repair PR through normal branch protection—never `--admin`, never a direct base push—and
   record the resulting commit.
5. Restore App/controller operation in `shadow` and prove App-authored output plus spoof rejection. Open a reactivation
   PR, re-enable the project actions, and invoke `coordinate-pr-review.md` explicitly because that session's extension
   snapshot may predate activation. Then repeat the normal `shadow -> dual -> final` transition before unfreezing
   merges, restore the recorded final ruleset, and close the incident with before/after evidence.

The runbook exercises this transaction in a non-final state before cutover. It is an administrative recovery change
to the required-context set, not permission to bypass merge protection or weaken unrelated checks. At every mutation,
the old failing gate or the already-proven independent `ci-ok` context remains required; the set is never empty.

Every setup, cutover, rollback, and outage step begins by reading and comparing the expected mode, required-context
set/source identities, App installation, environment policy, and action activation. State-changing commands are
idempotent or guarded by an exact before-state, record their verified after-state in the operator log, and resume from
the last proven checkpoint after interruption. Unexpected divergence stops the transaction. Private-key creation and
rotation stream secret material from a protected file/stdin to `gh`; no command line, log, step summary, or repository
file receives it. Key rotation preserves the App identity; an App-id change follows the prove-new-before-remove-old
migration.

Legacy and controller producers never share the `merge-ok` name. Every intermediate state retains a present,
truthful required gate. `finalize-parallelism` remains paused until the operational sequence proves final enforcement
and merges the current-fact closeout documentation.

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

- Trusted workflows execute only `github.workflow_sha` from the protected default branch and never check out/execute
  PR code. Review events reach them only through a secretless, non-authoritative completion relay.
- Fork-controlled paths, labels, titles, comments, evidence links, and command arguments are parsed as untrusted
  data; shell interpolation is prohibited and changed-path transport is NUL-safe or structured JSON.
- Git object acquisition validates immutable repository/PR ids, refs, and SHAs; it fetches only base-repository refs
  through argument arrays and never follows a fork-controlled remote or exposes either credential to subprocess logs.
- The runtime App is repository-selected and limited to metadata read, checks write, pull-requests write, and
  commit-status read. Its environment-protected short-lived token requests those permissions explicitly and never
  expands to the account installation; CI and discovery jobs retain read-only `GITHUB_TOKEN`s.
- Commands re-query current repository permission. Waivers, dismissals, and agent attestations require
  `maintain`/`admin`; human self-attestation follows the qualified non-author rule in § 10.
- Receipt/anchor comments require immutable App/bot identities; checks require the App source. `github-actions`,
  another App, mutable login resemblance, stale, missing, malformed, or conflicting state fails closed.
- Private-key rotation changes credentials but not the pinned App identity. Changing App identity is an enforcement
  migration and follows the same prove-new-source-before-removing-old ordering as required-check cutover.
- Expected-source and fork behavior are live-probe gates before enforcement.

### Reliability and concurrency

- Reconciliation is idempotent over current host, receipt-store, and provider state.
- Read-only discovery fans every wake-up into one matrix leg per PR; version-checked receipt append, one shared
  non-cancelling repository/PR concurrency group, and final current-state guards prevent stale runs from invoking or
  overwriting a newer change set.
- Events only wake; scheduled repair scans every open PR in scope and reconstructs state after missed webhooks,
  including a missing initial gate.
- Reservation, bounded post-write re-read, and explicit generations permit at most one controller invocation attempt
  per request key without hiding ambiguous delivery.
- Store-authenticated `recorded_at` starts timeouts; provider `observed_at` is informational. Time is injectable in
  reducer tests, and 10-minute acknowledgement plus 60-minute terminal thresholds have boundary fixtures.
- A retarget or merge-base change invalidates review coverage even when the head SHA is unchanged.

### Cost and performance

- Draft PRs consume no independent-review quota.
- Reviewed-routine recommendations require explicit acceptance; automatic capacity is reserved for required work.
- New pushes coalesce until a checkpoint; valid same-source incremental chains avoid unnecessary full reviews.
- Controller runs are short and event-driven. Scheduled discovery paginates all open PRs but matrix reconciliation
  performs effectful work only for missing, pending, or nonterminal gate state.
- Provider capacity remains separate from policy; typed provenance distinguishes an unobservable limit from a failed
  lookup, and current qualifying evidence makes residual capacity irrelevant to the verdict.

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
- receipt/finding schema, optimistic append, duplicate/fork/truncation detection, host-authenticated chronology,
  application/permission validation, and strict bounded command/attestation parsing;
- host-adapter contract fixtures independent of GitHub plus GitHub mappings for trusted-base change-set discovery,
  immutable identities/permissions, individual reviews, aggregate `reviewDecision`, review threads, and checks;
- version-pinned REST/limited-GraphQL pagination, read retry/write ambiguity, incomplete enumeration, malicious
  fork-ref/remote input, stable anchor bootstrap/repair, and receipt/anchor/check destruction boundaries;
- dedicated-App client/id separation, environment-secret branch isolation, explicit token permission/current-repo
  scope, missing/wrong identity, GitHub Actions spoof rejection, and private-key rotation under a stable App id;
- normal rollback plus controller/App-outage break-glass ordering, exact-head `ci-ok` proof, repair-PR scope guard,
  dead-action suspension/restoration, independent repair-review evidence, and never-empty required-context sets;
- status/CI-workflow/review-relay event idempotency, candidate fan-out, per-PR race ordering, missing-gate repair, and
  shadow/dual/final check-name projection;
- CodeRabbit effective-config, label/command ambiguity, commit-status/failure/exhaustion, immutable-finding/closure,
  and direct-command fixtures plus generic agent/human attestations with authenticated submitter and claimed-run
  provenance;
- trust-domain-specific workflow parsing: the relay has no checkout or write credential; privileged controller and
  attestation jobs use full-SHA actions plus immutable default-ref checkout and environment-secret isolation; CI uses
  full-SHA actions but intentionally checks the event head with read-only authority; all retain least privilege,
  fork safety, and no package-download fallback;
- package/project extension registration, complete `pre-pr-review` reference removal, action-neutral descriptions,
  numbered multi-action execution/failure guidance, explicit invocation inputs, post-open re-entry, convergent
  final-head pre-merge placement, and deterministic Errand PR-state handling;
- `diff-review` default-boundary assertions: local author preflight, no external reviewer invocation, and no
  independent/peer evidence claim.

Normal Markdown, shell, TypeScript lint, source/test typecheck, unit/integration/E2E, build, and workflow smoke gates
remain mandatory. Live provider and branch-protection probes run only from the post-main cutover Errand.

### Migration and rollback

The compatibility CI alias makes the implementation PR mergeable under today's rule. Its project review actions stay
inactive until shadow mode proves the controller and App on `main`. The cutover requires temporary known-good contexts
before removing the old one, activates those actions only after their dependency is live, uses dual output only after
the legacy producer is absent, and retains a direct rollback to
`ci-ok + review-gate-shadow` through `final -> dual -> shadow`. No step requires a missing required check, duplicate
`merge-ok`, or protection bypass. The outage arm temporarily suspends dead project actions only inside the incident,
requires independently reviewed repair evidence, and restores the actions before final promotion.

### Compatibility and configuration

- `ReviewCore` is Git-host, receipt-store, execution-runtime, provider, and harness neutral; GitHub/App/Actions and
  CodeRabbit tokens never enter its policy, evidence, admission, or verdict contracts.
- `ReviewCore` is change-request scoped and cardinality-neutral. Multi-PR work-unit topology may coordinate several
  independent gate instances, choose versioned automatic-vs-checkpoint admission per deliverable, and aggregate WU
  completion outside the core without changing per-PR evidence truth.
- The GitHub host adapter, review receipt store, and CodeRabbit provider adapter are independent ports. A future
  GitLab host adapter maps the same core state without inheriting GitHub App, check-run, comment, or workflow concepts.
  A future private backing-store/backend event log may replace GitHub comments without changing core records; host
  projection then reconciles eventual consistency rather than attempting a cross-store transaction.
- ARC's existing CODEOWNERS template/setup remains a host configuration surface: the GitHub adapter consumes the
  host's aggregate required-review decision and individual reviews but never parses CODEOWNERS or asserts owner
  identity. Future CODEOWNERS generation therefore composes without changing core or adapter semantics.
- Codex CLI, Claude Code, and CodeRabbit CLI are equal generic agent evidence sources.
- `pre-pr-open` and `post-pr-open` name lifecycle boundaries rather than review actions; projects may attach multiple
  numbered, ordered actions without changing the hook namespace. Their explicit platform-neutral invocation inputs
  keep host conversion in adapters and prevent workflow/WU inference from becoming an interface contract.
- Project policy and the author map are versioned/tested repository code, not personal preference.
- Per-change-set commands/receipts are review integration state, not durable ARC/user configuration. The current
  GitHub-comment store is one adapter-owned backing implementation, not a new storage setting. The App private key
  remains in a default-branch-restricted GitHub environment; its Client ID and numeric evidence identity are
  non-secret repository operational configuration.
- Future personal/provider defaults wait for the configuration cohort's user-scoped storage model.
- ARC package installation alone creates no hosted review footprint: the lifecycle extensions ship inactive and
  placeholder-only, with no App, workflow, check, branch-protection change, or PR comment. Local mode never activates
  a remote adapter implicitly. Once a project explicitly enables a required gate, adapter failure blocks rather than
  silently weakening its obligation; ARC's local lifecycle remains usable while the gate is repaired or rolled back.
- `review-gate-github-adapter` consumes the live proof to ship optional manifest-guided setup, selected-repository App
  installation, pinned workflow distribution, smoke/doctor, upgrade, and uninstall behavior for ARC projects. Before
  mutation, setup discloses the App permissions, tracked workflows/configuration, required checks, visible compact
  audit comments, notification potential, and outage-blocking behavior alongside the durable-admission, repair,
  evidence, and audit guarantees received in exchange. Other hosts and future receipt stores remain separate adapters.
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
   receipt-store, CodeRabbit-provider, execution, and self-hosting-policy adapters satisfy explicit independent port
   contracts.
4. Every accepted independent-analysis source is qualified against `independent-analysis/v1` with exact coverage,
   durable result/finding evidence, failure distinction, and explicit finding-closure behavior.
5. Reviewed-sensitive ready PRs require current qualified analysis; reviewed-routine PRs spend no quota unless
   accepted; auto and draft PRs trigger no review.
6. Full and incremental evidence can satisfy a requirement only through coverage and authority-bound per-finding
   closure rules; bare thread resolution is insufficient, and alternate sources cannot erase surviving findings.
7. A required PR whose versioned template is automatic-eligible admits at most one automatic initial request per
   requirement history; checkpoint-only templates and later pushes spend nothing until an authorized checkpoint
   coalesces work into one current-change-set request.
8. Every provider request has a version-checked durable reservation and unique request key; bounded post-write
   confirmation permits at most one controller invocation attempt, exact replay is rejected, and explicit
   same-change-set generations plus permitted alternate-source attempts remain possible.
9. Waivers, finding dismissals, overrides, and agent/human attestations enforce current host permissions, scope to the
   current change-set/policy/rubric identities, and leave controller receipts.
10. `merge-ok` stays pending/failing for every declared readiness, conflict, base-freshness, CI, review, stale,
   timeout, or inconsistent-state blocker and names the blocker in its summary.
11. The trusted controller executes no PR code, handles fork inputs safely, reconciles idempotently, and repairs
   missed events without automatically replaying ambiguous provider requests.
12. Authoritative GitHub receipt/anchor projections and checks use the dedicated current-repository App token with
    explicit permissions and a default-branch environment secret, authenticate immutable host/App/bot identity and
    record time, detect edit/fork/truncation/regression against the stable PR anchor, and reject `github-actions`,
    another App, missing credentials/installation, unsafe secret context, or a mismatched App id; branch protection
    pins the proven App source.
13. CodeRabbit account-level inheritance is preserved; resolved-config trigger exclusivity, commit-status/failure,
    Request Changes, capacity provenance, full/incremental, immutable-finding, and source-closure behaviors are
    fixture-covered and listed as live-probe gates, with satisfying qualification disabled until a probe-backed
    cutover PR enables its versioned declaration.
14. Maintainer-attested fresh Codex CLI and Claude Code full reviews can satisfy only allowed requirements through
    durable attestations that authenticate the submitter and record bounded claimed-run provenance without claiming
    direct agent authentication; a local-only transcript cannot turn the gate green.
15. Human peer approval, qualified-human independent analysis, requested changes, dismissal, unresolved threads, and
    expected host `reviewDecision` fixtures compose without parsing CODEOWNERS, treating aggregate host approval as
    independent analysis, or treating self-authorization as teammate review.
16. Package/project live surfaces contain no `pre-pr-review` declaration or fire point; package source ships inactive
    `pre-pr-open` / `post-pr-open` shells with the exact empty placeholder, and work-unit/Errand integration exercises
    the specified create/resume boundaries with explicit typed proposed/observed change-request inputs.
17. The implementation leaves this repository's prepared `post-pr-open` and final-head `pre-merge-review` actions
    inactive; the post-main cutover activates both to invoke `coordinate-pr-review.md`, leaves `pre-pr-open` inactive,
    and supports numbered additional actions with halt-on-failure behavior and no duplicate local CodeRabbit spend.
18. `coordinate-pr-review.md` contains no direct provider request path, routes initial/repeat decisions through the
    controller, is re-entry-safe for an explicitly targeted already-open PR, and settles that PR's lifecycle-created
    final/reconcile and review-fix heads through a convergent checkpoint before merge approval without assuming
    WU-level PR cardinality.
19. `diff-review` remains an author-side local preflight with no default external provider and no ability to satisfy
    independent/peer review evidence; its checklist and `review.pre_merge` invocation otherwise remain stable.
20. The implementation PR preserves legacy `merge-ok`, emits `ci-ok` and shadow-capable state, and ships a
    status/CI/review-relay event graph plus all-open-PR repair whose per-PR workers share one concurrency key. Its
    executable normal and controller/App-outage runbooks keep required-context sets nonempty/non-colliding and never
    authorize an admin merge bypass; they state the credential/visible-comment footprint, expected volume, authority
    boundary, value received, safe opt-in/rollback sequence, restart guards, dead-action suspension/restoration, and
    independently reviewed repair path.
21. No new user-scoped git-config key, ARC review-provider/receipt-store setting, published CLI surface, runtime
    dependency, or premature generalized provider registry ships.
22. `TECHNICAL-OVERVIEW.md` accurately describes the shadow state delivered by the WU, and a final-gated operational
    closeout PR records the final state after cutover proof; all applicable documentation, shell, TypeScript,
    typecheck, unit/integration/E2E, build, and workflow checks pass.

## Open Questions

None at design level. Sandbox probes have answered the CodeRabbit contract questions — resolved configuration and
label mechanics, commit-status identity and completion-only semantics, finding identity via the provider Bot
account, non-confirming closure signals, unpromotable capacity lookup — with evidence recorded in
`notes-reviewed-lane-review-gate.md`; CodeRabbit's satisfying qualification is expected to remain disabled. The
post-main cutover Errand still empirically proves this repository's own surfaces — App-authored receipts/checks,
branch protection's expected application identity, fork behavior — re-confirms the CodeRabbit behaviors under this
repository's settings, and probes reactive `@Codex` artifacts if pursued. Failure to prove a native adapter
contract leaves that adapter disabled or selects the already-defined explicit-request/generic-attestation fallback;
it does not reopen the normalized design. The downstream GitHub-adapter WU must separately prove manifest callback
portability, explicit footprint consent, Local-mode non-activation, and setup/upgrade/uninstall UX before
publishing it. The backend WU
separately decides whether neutral review receipts become backend-canonical operational events, adapter-owned events
using the same port, or optional non-materialized state.
