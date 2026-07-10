# Draft: Reviewed-Lane Review Gate

- **Origin:** [internal] — promoted from the operational errand that investigated CodeRabbit's disappearing
  GitHub check on 2026-07-10.
- **Purpose:** Define and prove a provider-neutral, usage-aware review policy and one truthful merge gate for
  this repository. The policy decides when independent review is required, recommended, or exempt; accepts
  explicitly-authorized human and agent evidence without treating them as interchangeable; and uses CodeRabbit
  only as the first self-hosting adapter.

---

## Problem / Motivation

This repository currently relies on a manually-triggered CodeRabbit pass during reviewed PR integration. The
practice has three operational gaps:

1. CodeRabbit's visible GitHub progress check stopped appearing. PRs #217 and #218 received CodeRabbit reviews,
   but their head commits carried no CodeRabbit check or status; those reviews were submitted as `COMMENTED`, so
   neither review progress nor unresolved findings participated in branch protection.
2. `merge-ok` is the only required status and today means only "the required CI jobs passed." It can report
   success while an independent review is unrequested, running, stale, or blocked on findings. The name therefore
   overstates the result.
3. Parallel work increases review demand and can exhaust provider limits faster. Blanket review-on-open or
   review-on-every-push spends quota on low-value changes; purely manual triggering can omit a justified review
   and supplies no machine-readable reason for the decision.

The immediate symptom is CodeRabbit-specific, but the durable concern is not: given a PR change set, what review
obligations apply, which qualified sources may satisfy each obligation, whether capacity is available, and when may
the repository truthfully report that the PR is merge-ready?

ARC's self-hosting project uses CodeRabbit today and treats Codex CLI and Claude Code as equal primary agent
harnesses. Teams using ARC may instead require formal teammate approval, Code Owners, a different agent reviewer,
specialized deterministic tools, or combinations of these. The model must preserve those distinctions rather than
calling every source "AI review" or silently substituting one for another.

## Design Thesis

Separate five concerns and compose them only at the final gate:

1. **Policy decision** — deterministic, provider-neutral classification of the current PR change set.
2. **Review requirements** — typed obligations and the source kinds permitted to satisfy them.
3. **Capacity admission** — whether a recommended or required agent review can run without changing its policy
   meaning.
4. **Provider / harness execution** — an adapter requests a review and translates its observable evidence.
5. **Merge aggregation** — one controller-owned `merge-ok` check reports success only when CI and every applicable
   review requirement are satisfied for the current change set.

The public surface stays simple; the internal model stays explicit enough to avoid provider lock-in and false
substitution.

## Normalized Review Contract

### Decision

Every evaluated change set receives one explainable decision:

```text
review decision:
  disposition: required | recommended | exempt
  reasons: stable reason-code[]
  policy_version
  base_ref
  base_sha
  diff_base_sha
  head_sha
  change_set_id
  lane: reviewed | auto
  review_risk: sensitive | routine
  risk_classes[]
```

`diff_base_sha` is the merge base used by the PR's three-dot diff. `change_set_id` is a canonical digest of
`(base_ref, diff_base_sha, head_sha)`. A target-base tip advance that leaves this tuple unchanged preserves review
coverage because the reviewed diff is unchanged; existing CI/branch-protection freshness policy continues to govern
base-integration validity. A retarget, changed merge base, or changed head creates a new review change set. An
unresolvable base/diff is fail-safe sensitive and cannot produce satisfying evidence.

The change-set-level disposition is the aggregate: `required` when any requirement is required, otherwise
`recommended` when any requirement is recommended, and `exempt` when no review requirement applies. Each
requirement retains its own obligation and reason codes so a required peer approval cannot accidentally promote a
merely recommended agent analysis, or vice versa.

- **`required`** — merge remains blocked until the requirement is satisfied, explicitly waived by an authorized
  actor, or replaced by an allowed alternate source.
- **`recommended`** — no provider is invoked automatically. The integration workflow surfaces an offer with the
  classifier's reasons. Accepting records a change-set-scoped `require` override; declining spends no quota and is not
  represented as a waiver.
- **`exempt`** — the deterministic policy says this review class adds insufficient value. The decision remains
  visible and can be raised by a `require` override.

### Requirements and satisfiers

Disposition alone does not say who must review. A decision carries one or more typed requirements:

```text
review requirement:
  id
  kind: peer-approval | independent-analysis | specialist-review
  obligation: required | recommended
  acceptable_sources:
    - source_kind: human | agent | deterministic-tool
      qualifier: optional project-defined role or adapter capability
  count
  rubric_version
  change_set_id
  head_sha
```

Evidence is likewise normalized:

```text
review evidence:
  requirement_id
  source_kind
  source_identity
  result: clean | findings | failed | unavailable
  evidence_url_or_id
  rubric_version
  coverage: full | incremental
  coverage_from_sha
  coverage_through_sha
  base_ref
  diff_base_sha
  change_set_id
  head_sha
  observed_at
```

Source kinds are not implicitly interchangeable:

- A **peer / Code Owner approval** normally requires an authorized human teammate. An agent does not substitute.
- **Independent analysis** may accept CodeRabbit, Codex, Claude Code, another agent reviewer, or a qualified human
  only when the project policy lists that source as acceptable.
- A **specialist review** may require a human specialist, a deterministic security/dependency tool, or an approved
  specialist agent. The requirement defines the allowed set.

ARC's integration interlock remains the developer's authorization to merge. It is not fabricated teammate
approval and does not satisfy a `peer-approval` requirement unless a project explicitly defines self-review as
acceptable.

### Capacity and execution state

Capacity never rewrites the decision. It is recorded per candidate source, and execution is recorded per
requirement/request rather than as one PR-global provider state:

```text
capacity[source_identity]: available | exhausted | unknown

execution[requirement_id, request_id]:
  not-requested | queued | running | clean | findings
  failed | unavailable | waived | stale
```

- Required + unavailable stays blocking and offers an allowed alternate source, human substitution where policy
  permits, or an explicit waiver. It never degrades silently to exempt.
- Recommended + unavailable remains a visible non-blocking recommendation that was not run.
- A new change set invalidates overrides and prevents prior evidence from satisfying it alone. Prior clean evidence
  may participate only in the explicit contiguous coverage-chain rule below; otherwise it is `stale`.
- An alternate source may replace an unavailable request, but it cannot erase findings already returned by a
  requested review. Confirmed findings remain independently blocking until resolved and cleared by current-change-set
  evidence or explicitly dismissed by an authorized actor.

### Coverage composition

A `full` review covers `diff_base_sha..coverage_through_sha`. An `incremental` review covers exactly
`coverage_from_sha..coverage_through_sha`; an adapter that cannot prove both bounds cannot emit qualifying
incremental evidence. A requirement is satisfied for the current change set only by either:

- one clean full review through the current head; or
- a contiguous chain beginning with a full review from the current `diff_base_sha`, followed by zero or more
  incremental reviews whose `from` equals the preceding `through`, ending in a clean result at the current head.

Every link must share base ref, diff base, policy version, rubric version, requirement id, and source identity. A
prior `findings` link may remain in the chain only when later same-source evidence explicitly closes each finding
against a later covered head, or an authorized dismissal receipt does; the terminal link must be clean and no
finding may survive. Failed or unavailable links never contribute coverage. The self-hosting policy does not compose
coverage across sources: an alternate source runs a full review of the current change set. A retarget or changed
merge base breaks the chain. This permits full-at-H1 plus incremental-H1-to-H2 without pretending either item alone
covers H2, and forces a full review when a provider cannot prove coverage bounds or finding closure.

This chain rule governs diff-analysis requirements. A host-native `peer-approval` is atomic evidence bound to the
head GitHub reports for that approval and follows the repository's dismissal/staleness rules; it does not compose
across heads. A human or tool satisfying `independent-analysis` or `specialist-review` must still declare the same
full/incremental coverage contract as an agent source.

### Canonical ledger and trust

The controller recomputes policy, CI, provider checks, and host-native review state from GitHub, but security- and
spend-relevant transitions need durable controller receipts. The canonical receipt ledger is an append-only series
of controller-authored PR issue comments. Each carries a visible summary plus a machine-readable payload with:

```text
schema_version, event_id, idempotency_key
pr_number, base_ref, base_sha, diff_base_sha, head_sha, change_set_id
policy_version, rubric_version, requirement_id
action, request_id, generation, actor, actor_permission, reason
source_identity, coverage, coverage_from_sha, coverage_through_sha
result, evidence_url_or_id, observed_at
```

Only comments authored by the pinned controller application and valid against the receipt schema are ledger input.
User comments and workflow-dispatch inputs are commands only; after validation, the controller emits the receipt.
The `merge-ok` check is a replaceable projection of canonical GitHub state plus these receipts, and provider labels
are transient triggers. Neither is the audit ledger.

Request admission uses two identities. The requirement key is
`(PR, change set id, policy version, rubric version, requirement id)`. Each actual attempt has a request key that
adds source identity, coverage bounds, and a monotonically-increasing generation; exact request-key replay is the
dedupe boundary. The automatic initial request uses generation zero. An authorized refresh advances the generation,
and an allowed alternate-source fallback changes the source and runs full coverage, so neither is mistaken for a
duplicate.

Admission is two-phase. Before invoking a provider, the controller writes a `reserved` receipt for the request key;
provider acknowledgement or a terminal invocation failure writes the next receipt. A repair sweep encountering an
old reservation with no acknowledgement reports an ambiguous blocking failure and never retries automatically,
because the provider may have accepted the request before a webhook was lost. An authorized explicit refresh creates
the next generation. This makes missed-event repair possible without duplicate quota spend.

The self-hosting permission predicates are fixed:

- `require` and `refresh` commands require GitHub `write`, `maintain`, or `admin` repository permission;
- `waive` requires `maintain` or `admin` permission;
- alternate-agent attestations enter only through a default-branch `workflow_dispatch`, require `maintain` or
  `admin`, and must reference durable GitHub evidence.

The controller resolves the actor's current repository permission through GitHub before emitting a receipt. Human
approval evidence continues to use host-native review and Code Owner authorization rather than this command channel.

## Self-Hosting Policy

CI run weight is a mutable cost optimization: a code tree becomes `light` after its heavy checks pass. It must not
determine a review obligation. Introduce a separate `review_risk` classification that is a pure function of the
base/head change set and policy version and therefore cannot change while the change-set id is unchanged.

| Lane       | Review risk | Default agent-analysis disposition |
| ---------- | ----------- | ---------------------------------- |
| `auto`     | any         | `exempt`                           |
| `reviewed` | `routine`   | `recommended`                      |
| `reviewed` | `sensitive` | `required`                         |

The self-hosting `sensitive` predicate is exact and fail-safe. It applies when the changed set is empty or cannot be
resolved, when `scripts/classify-change.sh classify` identifies any path as part of the stable code surface, or when
a path is under `.github/**`, `.arc/system/**`, `.arc/reference/strategies/**`, `.arc/reference/adr/**`, or
`.arc/reference/briefs/**`; equals `.arc/reference/PROJECT-PRD.md`; or is the root `AGENTS.md` / `CLAUDE.md` harness
contract. Everything else is `routine`. The stable reason codes are `unknown-change-set`, `code-surface`,
`github-control-surface`, `arc-system-surface`, `strategy-surface`, `adr-surface`, `agent-brief-surface`,
`project-prd-surface`, `harness-contract-surface`, and `routine-doc-surface`; a decision carries every matching
reason.

The existing pure code-surface predicate already includes dependency manifests, lockfiles, release/build scripts,
the CLI/package trees, tests, and the shipped ARC fixture tree. Project-specific critical-path predicates can be
added only by a new policy version with fixtures; no prose-only category can silently raise or lower a decision.

Diff size is an escalation and decomposition signal, never a safe exemption. A one-line permission change may be
high risk; a large generated diff may be low-value for an agent reviewer. Generated-only, bot-authored, or other
special cases require explicit project predicates rather than a universal ARC assumption.

The lane decision also becomes a tested pure classifier. `auto` requires a non-empty change set confined to the
existing movable planning-artifact prefixes and passage of the author-ownership predicate. The versioned
self-hosting policy maps the GitHub author `andrewRCr` to ARC owner `andrew`; each changed `draft-*`, `tasks-*`,
`meta-*`, or `notes-*` resolves its companion meta and must name that owner. Existing artifacts resolve ownership
from the base revision, so changing `Owner` cannot make the same PR self-authorizing; a newly-created artifact uses
its new companion meta. Any owner transition is reviewed. `cohort-*` is deliberately ownerless and clears this
ownership comparison, matching the current cohort model. For owned artifacts, an unmapped PR author, different
owner, or missing/ambiguous companion meta fails safe to `reviewed`; design-authority, constitutional, and any other
non-lane paths do likewise. This implements foreign **author vs. artifact owner**, not merely whether the repository
currently has multiple WU owners.
Disciplined housekeep writes to the shared inbox or derived project view remain `reviewed + routine` until
`shared-inbox-model` supplies trustworthy operation provenance; this conservative false-positive is explicit and
does not trigger automatic review spend.

### Review timing and quota discipline

- Draft PRs consume no independent-review quota.
- Evaluate and trigger once when a merge-bearing PR reaches ready-for-review.
- Do not review on every push. A new change set leaves prior evidence non-satisfying except through a valid coverage
  chain and coalesces until the next explicit integration / review checkpoint.
- At that checkpoint, use an incremental review for a narrow addressed-findings delta and a full review when the
  changes materially interact with the whole PR.
- Deduplicate exact request keys; authorized refresh generations and allowed alternate sources are distinct attempts
  under the same requirement key.
- Route every initial and repeat provider request through controller admission. Project workflows never post a
  provider-native request command directly.
- Reserve automatic capacity for required reviews. Recommended reviews spend quota only after explicit acceptance;
  future schedulers may sample or queue them, but may not silently alter their disposition.

This follows the mature pattern of risk classification first and quota admission second. Provider limits are
adapter evidence, not ARC policy.

## Overrides and Agent Workflow

The integration workflow gains a provider-neutral checkpoint after PR creation / readiness:

1. Read the current decision, reasons, capacity, and evidence.
2. For `recommended`, surface a recommendation and ask whether to require the review for this change set.
3. For `required`, request an admitted provider automatically or surface the blocking unavailability and allowed
   alternatives.
4. Permit an agent to recommend `require` or `waive` in either direction, but never silently apply either.

The repository controller accepts authorized, reasoned commands equivalent to:

```text
/review-gate require <requirement-id> <reason>
/review-gate waive <requirement-id> <reason>
/review-gate refresh <requirement-id> <source|auto> <full|incremental> <reason>
```

The controller rejects an unknown requirement, disallowed source, cross-source incremental request, or coverage
shape that cannot extend the current chain. There is no implicit “waive all” command.

An override records actor, reason, timestamp, policy/rubric version, and change-set identity; posts a receipt; and
expires when any of those identities changes. Authorization follows the canonical trust predicates above. A
provider-specific ignore command is not an ARC waiver and cannot turn `merge-ok` green by itself.

The project `address-pr-review.md` workflow is rewritten in this WU: its initial and Step 7 re-review instructions
recommend coverage and invoke the controller command, which owns capacity admission, request receipts,
deduplication, and adapter dispatch. The direct `@coderabbitai review` / `@coderabbitai full review` operational
path is removed. If someone nevertheless triggers a provider out of band, independently verifiable evidence for the
current change set may still satisfy an allowed requirement; the controller records it as `unadmitted`, suppresses
any duplicate request, and reports the policy bypass rather than pretending the spend was admitted.

No durable user preference is introduced here. Project policy is versioned in this repository's tested classifier;
per-change-set decisions live in GitHub state and controller receipts. Any future personal defaults or provider
preferences compose with the configuration cohort's resolved user-scoped substrate rather than minting another
git-config key now.

## Provider and Harness Boundary

### Adapter contract

An adapter may:

- report `available | exhausted | unknown` capacity when the provider exposes it;
- request a full or incremental review for a requirement/change set and report exact coverage bounds;
- identify provider evidence and map it to normalized execution state;
- expose a stable evidence URL / identifier;
- report whether findings are blocking and whether a terminal result applies to the current change set.

It may not decide whether review is required or whether a different source may substitute.

### CodeRabbit — first self-hosting adapter

Add a repository `.coderabbit.yaml` with `inheritance: true` so ordinary organization settings continue to merge.
The repo-local delta will:

- keep blanket `auto_review.enabled: false`;
- opt in only through the controller's positive trigger label;
- enable canonical review progress plus failure propagation;
- enable Request Changes so unresolved findings become native blocking review state;
- avoid automatic review-on-every-push.

Treat the label as a one-shot request handshake, not durable PR classification: apply it only after admitting an
exact change set, then remove it after provider acknowledgement or terminal request failure. A live probe must show
that this edge triggers exactly once and does not retrigger on later pushes. If CodeRabbit's label behavior cannot
meet that contract, the adapter falls back to its explicit request command while the provider-neutral policy and
quota rules remain unchanged.

The adapter owns CodeRabbit labels, commands, status names, quota commands, and review-state translation. None enter
the normalized contract.

### Codex and Claude Code — equal harness fallback targets

ARC treats Codex CLI and Claude Code as equal primary harness targets. The core fallback is therefore a
**fresh-agent evidence path**, not a Codex-only path:

- a fresh Codex or Claude Code reviewer runs the same project review rubric against the current change set;
- the workflow records its result through an authorized, change-set-bound attestation with evidence;
- the controller accepts it only for requirements whose `acceptable_sources` include that agent source.

The attestation is a GitHub-authenticated default-branch workflow-dispatch assertion, not trusted parsing of agent
prose. Its minimal payload is requirement id, agent source identity, clean/findings/failed result, exact base ref,
diff base, head, change-set id, policy and rubric version, full coverage bounds, and a durable GitHub evidence URL or
artifact id. The controller records the submitting actor and time separately, rejects an unauthorized actor,
unknown requirement/source, or stale change set, and emits a ledger receipt. A `findings` assertion keeps the
requirement unsatisfied; resolving the findings requires new current-change-set evidence. An unauthenticated PR-body
token or unlinked local transcript is never gate evidence.

Codex additionally documents GitHub Cloud PR review triggered automatically or reactively through `@Codex`, plus a
local `/review` command for base-branch, commit, and uncommitted review. Treat PR-native Codex evidence as a candidate
adapter only after a live probe confirms stable GitHub artifacts. A local `/review` result needs explicit attestation
because it does not inherently publish gate evidence. Apply the same rule to any future Claude GitHub integration:
capability claims are not gate contracts until their observable events and head binding are verified.

This WU implements the generic alternate-agent attestation socket and may prove one PR-native alternate. It does not
build a general multi-provider registry.

## Truthful `merge-ok`

Internal concerns remain separate; the public required signal aggregates them:

```text
PR readiness / mergeability ─────┐
CI jobs ──> ci-ok ───────────────┤
                                 ├──> merge-ok (only required status)
policy decision + overrides ─────┤
human/agent/tool evidence ────────┘
```

`merge-ok` is a persistent controller-owned check for the latest change set:

- **pending** — the PR is draft, host mergeability is unresolved, an enforced base-freshness condition is unmet, CI
  or any required review is queued/running/not requested, evidence is stale, or capacity is unknown while a required
  request is unresolved.
- **failure** — the PR conflicts with its base; CI failed; required review failed/unavailable/timed out; blocking
  findings, unresolved required conversations, or a native requested-changes state remain; controller state is
  inconsistent.
- **success** — the PR is ready, non-conflicting, and base-fresh where enforced; CI passed; and each review
  obligation is inapplicable by policy, was declined while merely recommended, has valid current-change-set
  coverage/evidence, or was explicitly waived by an authorized current-change-set receipt.

Its output names every constituent decision and evidence source. A green `ci-ok` may coexist with a draft, conflict,
base-freshness wait, or pending review, but the only required/public aggregate, `merge-ok`, stays truthful. Success
means the controller can find no merge-eligibility blocker in its declared scope; the separate integration interlock
still supplies human authorization to merge.

### Event-driven controller

Do not hold an Actions runner while waiting for external review. Events wake reconciliation; they are never trusted
as complete state:

- PR open/reopen/synchronize/ready/draft/edit (including retarget) and label changes;
- external check completion or rerequest;
- submitted/edited/dismissed PR reviews;
- issue comments carrying trigger/override/refresh commands;
- a scheduled repair sweep for missed webhooks.

Every wake-up resolves the PR's current base ref, base tip, merge base, head, and change-set id; recomputes canonical
state; and rejects stale evidence. The review decision is pure over
`(change set id, policy version)` and cannot change merely because a CI or provider check completed; those events
change only evidence/capacity/execution projections. Per-PR concurrency and idempotent check updates prevent old
events from overwriting newer change sets.

Privileged GitHub automation uses `pull_request_target` only for metadata/API reconciliation and never checks out or
executes PR code. Fork events and user-controlled labels/comments are untrusted input. The controller uses the
narrowest token permissions and the required check pins its expected application source after live verification.

## Classifier and Storage Shape

Move the inline lane expression out of `.github/workflows/ci.yml` into the existing tested classifier surface. Emit
two explicitly separate records: mutable CI cost (`ci_weight`, `ci_reason`) and stable review policy (`lane`,
`review_risk`, disposition, reason codes, policy version, base ref, base SHA, diff-base SHA, head SHA, change-set id).
The GitHub workflow consumes both; only stable review fields enter the review decision. Provider adapters do not
reimplement either path policy.

The current classifier's housekeep-drain carve-out is not mechanically represented: PR #221 touched the shared
atomic inbox during a disciplined drain but classified `reviewed`. This WU does not hide that mismatch in a
CodeRabbit path filter. Its deterministic `reviewed + routine -> recommended` policy prevents an automatic provider
spend; the durable drain-provenance / shared-inbox rename seam coordinates with `shared-inbox-model`.

## Safe Rollout

Replacing the producer of an already-required context is riskier than the steady-state architecture. A missing
`merge-ok` blocks all PRs; duplicate same-name checks can become ambiguous; trusted event workflows run default-
branch code and cannot be fully proven on their own implementation PR.

Use a shadow-and-cutover sequence:

1. The WU ships the policy classifier, controller, adapters, project workflow checkpoint, and provider
   configuration while preserving the legacy CI-owned `merge-ok`. CI additionally emits the same aggregate as
   `ci-ok`. The controller emits `review-gate-shadow` and reads one GitHub Actions repository variable for rollout
   mode: `shadow | dual | final`, defaulting fail-safe to `shadow`. This is deployment state, not an ARC/user option.
2. After that code is on `main`, run live probes for exempt, recommended/accepted, required/clean,
   required/findings, stale head/retarget, alternate agent, provider failure, repair, override, and
   reserved-but-unacknowledged request paths. Keep rollout mode `shadow` until the result and expected application
   source are proven.
3. Begin the cutover Errand by adding `ci-ok` and `review-gate-shadow` to required contexts. Verify both on a current
   PR head, then remove the legacy `merge-ok` requirement. The repository is now truthfully gated by the proven
   controller plus an independently-required CI fallback; no required context is absent.
4. Open the cutover PR that removes the legacy CI-owned `merge-ok` job while retaining `ci-ok`. It passes under the
   temporary `ci-ok + review-gate-shadow` requirements and cannot collide with a controller-owned `merge-ok`, which
   is still disabled. Merge it through the ordinary integration gate.
5. Set rollout mode to `dual` and refresh open PRs. The controller emits both `review-gate-shadow` and its final
   `merge-ok`; add the final context as required only after it is green from the pinned source on a current head.
6. Remove the temporary `ci-ok` and `review-gate-shadow` requirements, then set rollout mode to `final` and refresh.
   `ci-ok` remains an internal constituent, the shadow alias disappears, and controller-owned `merge-ok` is the only
   required status. If any step fails, leave or restore the last proven required pair; never bypass to advance.
7. Verify the final required source, scheduled repair, ambiguous-reservation failure, and the documented rollback
   (`shadow` mode plus temporary `ci-ok + review-gate-shadow` requirements) before FP resumes.

The cutover is an ordered context transition after the WU has removed the design uncertainty; every intermediate
state has a present, truthful required gate and the old and new producers never share the `merge-ok` name.

## Alternatives Considered

### Configuration-only CodeRabbit repair

Explicit progress, failure, and Request Changes settings would restore useful behavior but leave the pre-trigger /
in-progress merge race and provider omission unmodeled. The settings remain part of the selected adapter, not the
whole solution.

### Trigger CodeRabbit on every reviewed-lane PR

Simple and deterministic, but reviewed-routine methodology/doc changes consume the same allowance as code, and every
push can multiply spend. The selected policy uses lane + stable review risk and a readiness checkpoint.

### Keep `merge-ok` green and add a second required `review-gate`

Internally clean but externally misleading: a check named `merge-ok` could be green while GitHub still blocks the
PR. The selected design separates internals and aggregates them into one truthful public result.

### Poll for CodeRabbit inside the current CI job

Holds a runner, races manual triggering, has awkward timeout/retry behavior, and does not reconcile missed external
events. The selected controller is event-driven and persistent.

### Treat all review sources as equivalent

Would let an agent silently replace required teammate approval or a generic human replace a specialist review. The
selected requirements declare acceptable source kinds explicitly.

### General multi-provider framework now

Would outrun proven contracts and overlap `review-method-family`. The selected WU defines one stable adapter/evidence
boundary, implements CodeRabbit plus generic manual-agent evidence, and lets verified providers add adapters later.

## Coordination and Boundaries

- **`review-method-family`** owns reusable ARC post-PR trigger/response methods and the eventual generalized
  provider-neutral workflow surface. Consume this WU's decision/evidence vocabulary; do not duplicate its repo
  controller.
- **`config-storage-architecture` / `customization-arch-realign`** own durable user-scoped settings and method /
  extension activation. This WU adds none and records only per-change-set override evidence.
- **`shared-inbox-model`** owns the project-inbox model and rename. It needs the housekeep-drain provenance /
  classifier seam so a future shared-inbox path does not regress lane policy.
- **`finalize-parallelism`** remains paused until the proven cutover closes. Parallel work is the usage and
  omission pressure this gate must withstand.
- Human-review policy remains host-native where possible (GitHub required reviews / Code Owners). The controller
  consumes its outcome for truthful aggregation rather than replacing team review governance.

## Scope

### In scope

- Provider-neutral decision, requirement, capacity, evidence, override, and lifecycle contracts.
- Tested self-hosting policy from lane + stable review risk, separate from mutable CI weight.
- Canonical classifier extraction from the inline workflow expression.
- Event-driven GitHub controller and truthful readiness/mergeability/CI/current-change-set `merge-ok` aggregation.
- Durable controller receipt ledger, exact authorization predicates, and audited require/waive/refresh commands.
- Project workflow rewrite that routes every initial and repeat request through controller admission.
- CodeRabbit adapter/configuration with organization inheritance.
- Generic fresh-agent attestation supporting Codex and Claude Code equally.
- Native human-review-state composition and fixtures, while self-hosting keeps formal peer approval disabled.
- Shadow-mode probes and the ordered, rollback-safe enforcement cutover Errand.

### Out of scope

- A general provider/plugin registry or multiple fully-automated provider adapters.
- ARC-wide durable review-policy configuration or user preferences before the configuration cohort settles.
- Replacing GitHub Code Owners, required-review governance, or team assignment policy.
- Proactive cross-repository quota purchasing, billing, or a global provider scheduler.
- Generalizing the repo-local checkpoint into ARC framework methods/extensions; route the proven contract to
  `review-method-family`.

## Success Signals

1. A reviewed-sensitive ready PR cannot merge until CI and current-change-set independent analysis are satisfied.
2. A reviewed-routine PR spends no agent quota by default, surfaces a reasoned recommendation, and gates after
   acceptance.
3. An auto-lane PR can pass without agent review; a draft PR spends no review quota and keeps `merge-ok` pending.
4. A new commit makes old evidence non-satisfying alone without automatically spending another review; a proven
   full-plus-contiguous-incremental chain can satisfy the new change set.
5. CodeRabbit findings, failures, and exhaustion remain blocking when its review is required; an allowed Codex,
   Claude, or human substitute runs full coverage and can satisfy only the requirement it is authorized for.
6. A fixture requiring peer approval cannot be satisfied by agent evidence.
7. Overrides are authorized, reasoned, change-set/policy/rubric-scoped, auditable, and expire when any scope changes.
8. Missed events recover through refresh/scheduled reconciliation without replaying an exact request; authorized
   refresh generations and full alternate-source fallbacks remain possible.
9. The required check never reports green while a declared readiness, conflict, base-freshness, CI, or review
   condition remains unsatisfied.
10. No new user-scoped git-config or premature ARC configuration surface ships.

## Planning Continuity

- **Readiness:** formalization-ready.
- **Resolved:** provider-neutral requirement/evidence model; human/agent non-equivalence; stable lane + review-risk
  policy independent of CI weight; readiness/checkpoint timing; quota separation; canonical receipt ledger and
  permissions; controller-owned request path; request/generation identity; contiguous coverage composition;
  foreign-author ownership; base/change-set identities; change-set overrides; one truthful aggregate;
  event-driven controller; CodeRabbit primary plus Codex/Claude fresh-agent fallback; configuration-cohort boundary;
  executable shadow rollout; authorized alternate-agent attestation contract.
- **Implementation validation:** prove CodeRabbit's one-shot label edge, exact GitHub artifacts, incremental coverage
  bounds, and finding-closure signal; probe reactive `@Codex`; pin the custom-check expected-source identity; and
  determine whether provider capacity can be queried mechanically or remains `unknown` until request failure. These
  empirical adapter facts select implementations inside the settled contracts; failure to prove a stable native
  artifact leaves that adapter disabled.
- **Next:** surface the audited, coherence-checked draft at the capture interlock.

## Scope Estimate

**Medium-to-large (roughly one to two weeks), Heavy by derivation and scale.** The design is one coherent gate, but
implementation spans the classifier/tests, GitHub workflow/controller, durable receipts, project review workflow,
CodeRabbit configuration, live provider probes, and branch-protection cutover. No hard work-unit dependency; the
cutover must complete before `finalize-parallelism` resumes.
