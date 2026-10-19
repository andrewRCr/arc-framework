---
purpose: Integrate a published work unit — push, change request, hosted review, composition, checkpoint, merge, and cleanup.
audience: agent
arc:
  methods:
    - code-review
    - assess-evidence-applicability
    - review-chunking
    - commit-footer
    - pull-request-format
---

# Workflow: Integrate Work Unit

Integrate a publicly scheduled WU through the single merge-to-main moment. Private Candidate preparation has already
settled; this workflow pushes the published branch, opens and reviews the change request, composes the final
candidate tail, checkpoints, merges, and cleans up.

**When to use:** `active/meta-{name}.md` shows `**State:** Integrating`, or a shipped candidate still has an
incomplete merge tail.

> [!NOTE]
> **WU still Active?** If it carries a Candidate, run
> [`prepare-work-unit.md`](prepare-work-unit.md). Without a Candidate, finish
> [`verify-work-unit.md`](verify-work-unit.md).

**Two timing phases inside one PR:**

1. **Phase 1: Open + iterate** — push, open the change request, and settle hosted review. Composition / sweep /
   ROADMAP do **not** fire here.
2. **Phase 2: Compose + sweep + ship** — post-review-approval, content cleanup + final-form composition + sweep +
   ROADMAP regen land as the final push before merge.

**Per-worktree isolation invariant preserved** — sweep lands on the WU branch before merge.

---

## Phase 1: Open and iterate

### 1) Push the branch and open the PR

`Integrating` is a suspendable point: a session can enter after `arc publish`, hand off across the review wait,
and a later session or machine re-enters here. Resolve the current state with
`arc status {name} --json`. An `active` result has not crossed the publication boundary and returns to
[`prepare-work-unit.md`](prepare-work-unit.md); `integrating` resumes this workflow; `shipped` can be an
already-swept candidate whose PR or post-merge tail remains incomplete.

On interruption, re-enter delivery status only through the public typed protocol. Resume an operation with its
self-contained handle; never reconstruct status from workflow prose or narrative meta fields.

When the status result is `integrating`, classify delivery intent before resolving a singleton change request or
performing any push:

```bash
printf '%s\n' '{"entryMode":"integrating"}' | arc delivery entry inspect -
```

Dispatch only on the returned route. `not-applicable` continues ordinary singleton integration below.
`resolve-delivery-status` resumes at Step 2's provider-neutral delivery-status reduction with its exact
`deliveryStatusAction`; only a downstream explicit review action represents review work; do not resolve a singleton
change request or enter delivery publication / position reconciliation. `review-fix-verification-required` invokes
`arc delivery review-fix continue -` with only the repository and remote identities, then follows the resumable
correction procedure in `deliver-stack.md`; do not enter whole-WU verification, frontline review, or singleton
prepublication. `candidate-verification-required` leaves this workflow for Candidate verification closeout; it
synthesizes no attestation or review action. `correction-route-ambiguous` stops after rendering `recommendedActionText`.
The seam has separated a work-unit branch carrying non-lifecycle content from an outstanding non-terminal member review,
and it attributes that content to neither route. Obtain the Owner's selection between the two returned routes and enter
the selected one unchanged; never infer it from branch movement, task-cursor position, or commit prose.
`candidate-renewal-required` invokes its exact `attestationAction`, requires `unchanged`, then re-runs this entry
inspection; attestation alone revalidates and refreshes the public delivery continuation without replaying verification
or leaving `Integrating`. `canonicalize-provisional`, `validate-canonical`, `continue-publication`, and `resume-bound`
leave this workflow and enter the matching route in [`supplemental/deliver-stack.md`](../supplemental/deliver-stack.md);
that workflow owns publication, state binding, member pull requests, and the landing window. `refused` stops after
rendering `recommendedActionText`; any other route also stops as an integration-entry contract violation. Do not perform
this entry dispatch on the `shipped` tail, which has already crossed initial publication.

Resolve the branch head, then invoke `arc review change-request resolve --head-ref {type}/{name} --head-sha {head-sha}`.
Follow its typed state:

| Resolver and change-request state              | Demonstrably already ran             | Resume at                                                      |
| ---------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| `integrating`; `none`                          | publication transition               | Step 1, from the idempotent **push** action                    |
| `integrating`; `open`                          | transition, PR open                  | Step 2 (review iteration), then candidate tail                 |
| `integrating`; `closed-unmerged`               | transition, former PR                | Reopen the request, then Step 2                                |
| `shipped` in `completed`; `open`               | transition, PR open, candidate sweep | Step 10                                                        |
| `merged-at-head`                               | transition, PR open, merge           | Verify Phase 2 products; when complete, resume at Step 10 tail |
| `merged-stale-head`, `ambiguous`, or `blocked` | unresolved                           | Stop; follow any emitted remedy text                           |

Resolve worktree/branch presence with `git worktree list` and `git branch --list {type}/{name}`. Within the
suspendable review cycle, resume the first incomplete candidate-tail step. Composition already written into the
meta's archive-phase sections and a committed sweep are observed, never redone. A resolver `state: shipped` with
an open, not merged PR resumes at Step 10. Steps 10–11 are individually re-runnable and no-op when their target is
already gone.

Before selecting the merged-PR tail, verify the meta contains Completion Notes and any applicable Release Notes.
Under `with-integration`, the resolver reports `shipped` in `completed`. A merged PR proves only that the merge ran,
not that composition or archival ran. If a required product is absent, preserve the branch and worktree; do not
invoke `arc user close` or `arc teardown`. Before the repair commit, run `arc check increment` when the repair
includes authored text the checks read; repairs confined to completed files are exempt. Land the missing products
through a lifecycle-only repair change request, then re-enter this guard.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin {type}/{name}`.

**Push the WU branch upstream.** Re-entry from the no-PR resume row starts here; pushing an unchanged branch is
idempotent, so both transitioned-but-unpushed and pushed-but-uncreated interruptions use this same resume action.

Invoke `arc review change-request resolve --head-ref {type}/{name} --head-sha {head-sha}`. `none /
create-change-request` continues below; `open / reuse-change-request` proceeds to Step 2; `closed-unmerged /
reopen-change-request` reopens before Step 2; `merged-at-head / complete` enters the merged tail. Every other typed
action stops. This resolver call is the pre-create exact-head validation.

Immediately before creation, re-resolve the current head with:

`arc review change-request resolve --head-ref {type}/{name} --head-sha {head-sha} --require-remote`. Continue only from
`none / create-change-request`; every other typed action dispatches as above. This exact replay requires the remote
branch itself to carry the creation head.

Invoke `arc merge lock resolve -` with the exact tree root. Follow only its typed action: `locked / open-locked`
creates the PR locked; `none / open-plain` creates it plain; `blocked / stop` halts creation before any PR exists.

Before creation, load [pull-request-format][pull-request-format] and follow its title and body guidance. Compose
from the diff, design, and verification, not release notes. Open the single PR on the resolved action:

```bash
gh pr create --base {base-branch} --head {type}/{name}            # open-plain
gh pr create --base {base-branch} --head {type}/{name} --draft    # open-locked
```

### 2) Review iteration

Bind the open PR from the resolver's returned `candidate` — the reuse and reopen arms carry it, and the creation
path uses the request Step 1 just opened.

Before spending a hosted pass on a branch already behind its base, read `arc base drift --json`. Keep `clean` and
regenerable-only drift silent and surface substantive or uncertain interaction as review context. This read is
advisory only: it authorizes no merge, commit, push, or target recomposition. Base mutation belongs exclusively to
Step 10's authoritative checkpoint planner and its typed base-merge arm.

Read `integrationBoundary.reservation` from the typed status projection. A null reservation means the standard lane
already settled or was a typed no-op before submission; do not invent a post-PR obligation. A carried reservation
must match the current Candidate and carries the ordered sources and exact obligation. Dispatch only on
`integrationBoundary.nextAction.kind`:

- `resolve-delivery-status` requires a delivery reservation. Execute `integrationBoundary.nextAction.command`. The
  WU-scoped public status reducer joins the current delivery bindings and durable review progress, selects the first
  outstanding retained member, observes that member's exact change request and checks, and returns a top-level
  `deliveryCursor`, the complete supporting conjunction, and the existing driver's next action. Only an exact
  `review-hosted-request` result authorizes provider work. Do not invoke frontline review, generic prepublication,
  private source selection, or a whole-work-unit fallback.
- For an ordinary singleton with a carried reservation, an exact open PR at the current head completes the
  `publication-pending / continue-publication` handoff. Resolve its `targetRef` and invoke
  `arc review status --target '{targetRef}'`. That status binds the reservation and durable pass progress to the
  open PR and returns the complete hosted request action; pass it unchanged to `arc review hosted request -` when
  status selects `review-hosted-request`. Do not repeat settled frontline review or build a provider request from
  pre-publication policy fields.
- `continue-pre-publication-review` remains the singleton continuation while a pre-publication action is still owed.
  Invoke `integrationBoundary.nextAction.command` and apply [code-review's successor decision][code-successor-decision]
  to its clean-fix-check continuation, including a hosted-first reservation before convergence verification or
  publication. That private continuation carries explicit acceptance through `lanes.standard.terminus`. After it settles
  and the exact PR is open, re-enter the singleton status route above.

Every other boundary action stops. Dispatch only on `nextAction` from the status result; `continue-pre-publication`
carries the boundary's own pre-publication `action`, so handle it as that boundary action, never as a review request.

Throughout this iteration, **re-enter status** means preserve the same status scope: execute the WU-scoped boundary
command again for a delivery, or use the exact `targetRef` command for an ordinary singleton. Append an authorized
judgment option; never narrow a delivery-status action to an agent-reconstructed member target.

Before source dispatch, run [code-review's successor decision][code-successor-decision] with the returned exact
subject; a selected delivery member uses `deliveryCursor.currentMember.target.headSha` as `memberHeadObjectId`.
This work-unit delivery route supplies its `terminusAction`; the published singleton supplies its explicit stop limit.

`select-coverage` applies [code-review's coverage selection][code-coverage-selection] to the returned offer and this
caller's stop capability. Re-enter the same status scope through its returned command; retain the resulting admission.

`stop` renders the refusal's `reason`, `detail`, and `remedy.text` verbatim. On the work-unit delivery route, a supplied
`terminusAction` also offers the exact Owner stop; render its `offer.interactionText` and follow the acceptance
procedure below on explicit acceptance. Otherwise stop, preserve the structured remedy, and follow its exact command
after repair.

At `obtain-ceiling-override`, apply [code-review's ceiling override][code-ceiling-override] with this exact status
scope and any supplied member terminus. Carry an approved consequence through `--ceiling-override` on the same
WU-scoped status command for delivery, or `arc review status --target '{targetRef}'` for an ordinary singleton.

A `review-hosted-request` or `review-local-prepare` result may also carry `terminusAction` after an earlier complete
pass. Surface it as an optional Owner alternative. The clean-fix-check recommendation above determines whether to stop
for that choice; otherwise, absent explicit acceptance, execute the returned review action unchanged.

Apply [code-review's convergence procedure][code-convergence] to the concluded look and returned applicability.
A delivery's authorized additional complete pass is exact JSON in `--additional-pass` on the same WU-scoped status
command. The ordinary singleton's discharge takes no additional-pass authorization and status returns `settled`;
this scope cannot launch an additional pass by supplying that option.

Apply [code-review's chunk gate][code-chunk-gate] before either carrier. Delivery uses status's returned measure;
the singleton supplies its exact change-set range and carries selected scope as `policyJudgment.scopeMode`.

When the Owner accepts any returned delivery-member terminus, add `judgment: { "mode": "owner-accepted" }` to
`terminusAction` and pass the resulting envelope unchanged to:

```bash
arc review terminus accept -
```

`recorded / commit-boundary` stages the exact boundary record. Commit and push it, then resume through the
selector-free correction procedure with only the repository and remote identities:

```bash
printf '%s\n' '{"repository":"{repositoryRef}","remote":"origin"}' | arc delivery review-fix continue -
```

The procedure performs any owed terminal-coordinate rebind before returning the first outstanding member.
`exact-replay / continue` and `refused / rerun-status` create no new head and re-enter status directly; the refused
arm does not reuse the stale offer. Every other result stops. The terminus records explicit Owner authority only;
never report the member clean or converged from it.

`review-hosted-request` enters [code-review's hosted await and settlement][code-hosted-await-and-settlement]
with the returned action unchanged.

`review-local-prepare` returns the exact standard-review driver admission. Pass its `action` unchanged as
`deliveryAdmission` in the ordinary local prepare request:

```bash
arc review local prepare -
```

Keep the returned member head and driver admission through preparation.

`review-singleton-local-prepare` supplies an ordinary work-unit request seed in `action.request`. Add
`evaluatorIdentity` and the work-unit `routingFacts`, then submit that request to `arc review local prepare -`.
Local prepare binds the Candidate lineage and reserved obligation from the submission boundary.

For the singleton's plain commit, apply [code-review's convergence procedure][code-convergence] to the returned
delta check or review-applicability stop. If ordinary local prepare asks for coverage, apply
[code-review's coverage selection][code-coverage-selection], completing this singleton's chunk measure before re-entry.

When `action.scopeSelection.mode` is `chunked`, apply [code-review's chunk gate][code-chunk-gate] to the prepared
exact target before launching the local operation.

For either local action, apply [code-review's local operation][code-local-operation], then re-enter the same status
scope. Retain delivery's admitted member head and the singleton's exact Candidate request seed.

`review-local-resume` applies [code-review's local operation][code-local-operation] to the returned resume action,
then re-enters this caller's same status scope.

`respond-to-findings` applies [code-review's findings round][code-findings-round] to `responsePlan`'s exact target,
source, and findings, with this caller's verification and authoring continuation below. Re-enter the same status scope
only after the durable response completes.

`delivery-correction-required / continue-delivery-correction` is the delivery-owned member fix route. Execute any
before-fix settlement first, then pass `payload.correctionAction` unchanged. Author only after the driver returns
`authoring-required`, and edit only its exact `authoring.checkoutPath` and `authoring.ref` under the returned
`authoringAuthorization`; resume only through `resumeAction`. A missing, stale, or different locus stops before
authoring.

A Candidate-bound private-member fix instead returns `ready-to-fix / apply-fix` with `payload.authoring`. Author
only at that exact active work-unit checkout, ref, and head; follow the Candidate response path in
[`prepare-work-unit.md`](prepare-work-unit.md), and reconstruct the delivery suffix only after Candidate advance as
the returned `deliverySuffixReconstruction` directs. A `ready-to-fix` response without `authoring` remains the
ordinary singleton route and never substitutes for the delivery-owned controller.

The action already carries the selected source, exact opened target, requested coverage, and any delivery-member
vehicle. When `resolve-review-applicability` carries `terminusAction`, surface that exact Owner alternative first.
Explicit acceptance follows the terminus path above and re-enters status without resolving applicability. Absent
explicit acceptance, render `selectionAction.interactionText`.

**Method fire-point** · [`assess-evidence-applicability`][assess-evidence-applicability]: At this pre-reconcile
`resolve-review-applicability` stop, apply the method to each supplied review projection whose applicability carries
`judgmentRequired: true`. Show the bounded check's findings and `supplemental | fresh` recommendation before the
Owner's choice. A `judgmentRequired: false` result is final; `merge-safety` never fires the method.

Obtain the Owner's typed choice and submit the returned `selectionAction` unchanged as `offer` beside that
`selection` to:

```bash
arc candidate applicability resolve {workUnitId} -
```

Outside a driven delivery correction, commit a returned `commit-selection`, then re-enter through
`arc review status`. When the correction driver supplied the applicability stop, pass the returned `recordEffect`
unchanged as the sole `recordEffects` entry beside its repository and remote resume input; the driver binds those
exact bytes before its machine-owned commit and push. `continue` retains the earlier attempt; `request-review`
re-enters status and receives the ordinary hosted request action. Applicability reruns, base movement, and pending
checks return to their typed checkpoint; `upgrade` and every `stop` remain stops.

For `requested / await` and either pending result, apply [code-review's hosted await and
settlement][code-hosted-await-and-settlement] with the returned action unchanged.

Hosted delivery-member request and await operations persist their admitted attempt in durable lane progress. Re-enter
through status after each concluded result; do not reconstruct `completedPasses` or route the public member back through
private policy. For the ordinary singleton continuation, retain `policy.payload.pass` as the authorizing
`completedPasses` input. A completed review advances that logical coordinate; pending chunk series and non-pass outcomes
retain the prior count. Only complete coverage counts toward the standard ceiling; fix checks run outside it.

- `clean / complete` — a delivery member re-enters status; an ordinary singleton feeds the returned `attempt`
  unchanged to `arc review resolve -`. Its `reviewOperationId` identifies the producer, while `hostedResultId`
  identifies the result content.
- `findings / triage` — enter [code-review's findings round][code-findings-round], using this caller's required
  verification and delivery/Candidate authoring route. Its committed verified-fix replay precedes push; use the
  remaining [hosted settlement][code-hosted-settlement] phases before re-entering this same status/resolve route.
- `rate-limited | transient-unavailable / try-next-source` — a delivery member re-enters status; an ordinary
  singleton feeds that safe outcome to the same driver call. The outcome does not consume the pass.
- Any ambiguous delivery, stale target, malformed output, source failure, or terminal failure stops. Never replay
  an uncertain request.

After any concluded attempt, invoke the same boundary status action again. The CLI selects the next retained target and
source; only `settled / continue-reconcile` with the typed discharge conjunction advances to Phase 2.

While a hosted await is live, speculative drafting of Completion Notes, Release Notes, and the cleanup plan is
allowed when useful. Do not commit, push, archive, regenerate readiness, or destructively clean from that draft
before `review-settled`.

After every target movement, re-enter through `arc review status` and dispatch its typed action. Do not classify
movement or choose review scope from prose; follow the applicability procedure above when its typed stop is returned.

Before any review-fix commit, run `arc check increment` when the fix includes authored state text the checks read;
completed-only repairs remain exempt.

Request `arc check gate commit` after every review-driven change. Before an approved fix's `verifiedFix` replay,
which attests the approved scope as performed, a `focused` scope also requests `arc check gate push --range --force`
and a `full` scope `arc check gate merge --force` over the new target. A new target invalidates clearance and merge
authorization; never rewrite a prior exact-target result as if it ran on the new head.

The WU stays in `**State:** Integrating` throughout this phase. Composition + sweep do not fire here.

---

## Phase 2: Compose, sweep, ship

### 3) Confirm review coordination

Confirm the public open-PR review protocol has reduced the routed WU obligation to `review-settled` — the
candidate-entry state, never merge readiness, and never established by a raw local clean report, a launched review
pass, or an unattested result. Candidate assembly begins only after that reduction. Every mutation- or
disposition set must already be approved for its exact target. An approved no-action record-only set may retain its
idempotent channel settlement for the checkpointed final transition, but it cannot remain merely proposed. This is
not the final-head checkpoint; base freshness belongs only to Step 10, after candidate composition.

Only that protocol's settled reduction establishes `review-settled`. Any pre-composition direction to merge once
review settles authorizes autonomous advance through candidate assembly to the final integration interlock; it is
not prospective merge authority over the candidate's not-yet-known head.

Candidate assembly now advances without another proceed turn. Stop only for a material alignment disagreement,
failed quality gate, base conflict, or unexpected state.

### 4) Spec-presence + alignment checks

First confirm the WU's `**Design:**` field resolves to a spec present in `active/` — a `spec-{name}.md` or the
layered `spec-{name}-prd.md` / `spec-{name}-rfc.md` pair; if absent, stop and surface.

Bind alignment and composition to the canonical settled WU change set, completed task outcomes, spec intent and
non-goals, success-criteria disposition, and verification evidence. The alignment checks below are soft; rarely
block if [`create-spec.md`][create-spec]'s alignment checks passed. Stop on material disagreement with final reviewed
scope; correct the source of truth before recomposing.

#### PROJECT-PRD

Always evaluated. Surface conflicts between final reviewed scope and PROJECT-PRD Principles / Out of Scope.

#### TECHNICAL-OVERVIEW

Fires only when the PRD touched technical surfaces (tech stack, architecture, runtime, dependencies,
infrastructure). Independent of the PROJECT-PRD check — scope distinction is the trigger.

### 5) Compose Release Notes Entry — uncommitted

Compose a public entry into `active/meta-{name}.md`'s archive-phase `## Release Notes Entry` section. Describe only
shipped reader/operator-visible outcomes supported by the exact candidate diff. Never include WU names or slugs,
task or phase references, branches, roadmap pointers, internal review or provider machinery, other internal
development jargon, or planned-but-unshipped work. Publicly supported review concepts and configuration may be
named when they are the shipped outcome.

Write one summary paragraph, then `### <Category>` headings for nonempty categories in this order: Added, Changed,
Removed, Fixed, Infrastructure, Deprecated, Security. Start one or more list items with a dash and one space under each
heading; indent continuation lines at least two spaces. Use Infrastructure only for an externally meaningful operational
change. An optional `### Breaking Changes` heading comes last and names the affected stability contract and required
migration. For example:

```markdown
## Release Notes Entry

The CLI now gives clearer guidance when an operation needs a retry.

### Added

- A status command that reports the current operation.

### Fixed

- Retry instructions retain the selected target.
  A changed target requires a fresh decision.
```

Omit the entire section when nothing reader/operator-visible ships; otherwise size it to what shipped.

Leave the edit uncommitted for the candidate-tail commit in Step 7.

### 6) Compose Completion Notes — uncommitted

Compose narrative Completion Notes into the meta file's archive-phase `## Completion Notes` section. Distinguish
delivered scope, material deviations or supersessions, and verified evidence. Synthesize the result; never repeat
the task list's verbatim record or git history. Size it to what there is to say. Always present — not omittable,
unlike Step 5's Release Notes. Leave it uncommitted until Step 7.

### 7) Commit completion content

Request `arc check increment` and stop on failure. Bundle the composition edits under the provisional-candidate
exception; this commit does not make the branch merge-ready.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): compose archive-phase content for {name}

- Release Notes Entry: <one-line summary>
- Completion Notes

Context: meta-{name}.md (integration)
```

When Step 5 omitted the Release Notes section (nothing user-facing), drop its bullet from the commit body.

See [DEV-RULES.ARC][dev-rules-arc] § Commit format and the [`commit-footer` method][commit-footer].

### 8) Cadence dispatch — `archive.cadence`

Read `archive.cadence` from [`arc-config.yml`][arc-config]:

- **`with-integration`** (default): Invoke [`archive-work-unit.md`][archive-work-unit] inline. Its `arc archive`
  sweep handles state flip `Integrating → Shipped`, the relocation `active/meta-{name}.md` →
  `completed/<dated>/{NN}_{name}/meta-{name}.md`, the logical `Branch → [none]`, the `PR URL` / `Completed`
  finalize-fact write (sourcing the PR URL from this ceremony's open PR), and ROADMAP regen per its
  cadence-invariant body — the **mergeable** ship, which rides this PR. Physical branch/worktree teardown is
  **not** archive's: it is Step 11's post-merge cleanup below. Returns; resume at Step 9.
- **`manual`**: Skip inline invocation. Archive runs separately post-merge via explicit `archive-work-unit.md`
  invocation. Step 9's push covers completion content only under this cadence.

### 9) Final push

What gets pushed varies by cadence:

- Under `with-integration`: completion content + sweep commits + ROADMAP regen commits.
- Under `manual`: completion content commit only. Sweep + ROADMAP fire later when `archive-work-unit.md` is
  invoked explicitly post-merge.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

After push, this is a provisional integration candidate, never merge readiness. Recompose its exact target, invoke
`arc review changeset resolve -` with `{ kind, baseRef, diffBaseSha, headSha }`, apply
[`review-chunking`][review-chunking] when its typed action requests selection, and make Step 2's review applicability
judgment. Only Step 10's exact-head integration authorization can release the merge.

### 10) Behind-base reconcile gate and merge

Apply the current WU's exact reconcile before composing a checkpoint:

```bash
arc wu reconcile {name} --apply --json
```

`pending` surfaces every advisory reference immediately and requires direction to retain them or a correction and
rerun. After correcting authored text the checks read, run `arc check increment` before rerunning reconcile;
completed-only corrections remain exempt.

`conflict` stops on its typed reason. `clean` continues to the checkpoint below. On `applied`, request
`arc check gate commit` over the staged correction, then commit:

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): reconcile {name} before integration

Context: meta-{name}.md (integration)
```

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

Restart this step. The correction changed the head, so no checkpoint evidence carries.

Invoke the checkpoint:

```bash
arc integrate checkpoint {name}
```

Invoke the checkpoint once per entry. Dispatch only on its typed `state` / `nextAction`, render the supplied next
action and presentation or remedy, and do not reconstruct movement, provider, eligibility, or review policy from its
payload.

The checkpoint reduces machine-proved `applicable` currentness internally, with no attended step. Follow every
surfaced Candidate-applicability action exactly:

- `candidate-applicability / rerun-checkpoint` invokes its supplied remedy and restarts this step.
- `candidate-applicability / stop` and `candidate-applicability / upgrade` render the typed result and stop. These
  arms never offer an authority selection.
- `candidate-applicability / request-authority` renders `payload.selectionOfferText`,
  `payload.recommendedActionText`, and `payload.selectionPromptText` verbatim, then stops for the named authority's
  explicit choice. Do not infer a selection from the recommendation.

**Method fire-point** · [`assess-evidence-applicability`][assess-evidence-applicability]: On this post-reconcile
route, when `payload.applicability.judgmentRequired: true`, load and apply the method to the supplied bounded
review or verification residual. Show its `supplemental | fresh` recommendation before the existing authority
selection; only the recorded selection acts. A `judgmentRequired: false` result is final, and `merge-safety` never
fires the method.

After an explicit `covered`, `targeted-check`, or `changed` choice, compose the strict input from
`payload.resolutionSelector`, the selecting actor, and that choice. For `targeted-check`, add the completed check's
evidence reference; the review movement check above runs once. Other evidence kinds retain their ordinary bounded
verification. Then invoke `arc candidate applicability resolve {name} -` with that input.
For `covered` or `targeted-check`, `resolved / commit-selection` and `exact-replay / commit-selection` leave the
Candidate selection staged. Request `arc check gate commit` over that correction, then commit:

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): record Candidate applicability for {name}

Context: meta-{name}.md (integration)
```

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

Restart this step. `resolved / continue` and `exact-replay / continue` mean that selection is already durable and
restart without a redundant commit. Only `resolved / establish-new-root` or `exact-replay / establish-new-root` —
produced by an explicit `changed` choice — follows ordinary scope selection, completed verification,
`arc attest {name} --new-root --json`, and the ordinary attestation commit and push contracts before a checkpoint
rerun. Every stale, conflicting, invalid, or unavailable resolution follows its typed next action without
substituting a selection in prose.

`candidate-publication-required / resume-pre-publication` renders its supplied reason, detail, coordinates, and
`payload.recommendedActionText` verbatim and invokes `payload.attestArgv` unchanged. A returned
`publication-pending` or `hosted-review-pending` locus keeps publication; continue at the shared publication-boundary
commit below. For any other locus, invoke the returned `locus.nextAction.command` and follow that ordinary
pre-publication procedure. At `candidate-publish-ready`, invoke `arc publish {name} --json`; require its idempotent
Integrating result, then complete the already-open Step 2 review for any carried reservation. Continue at the shared
publication-boundary commit below.

`candidate-publication-required / refresh-shipped-delivery` renders `payload.recommendedActionText` verbatim and
invokes `payload.attestArgv` unchanged. Require its unchanged `delivery-status-required` locus, then restart this
step. This shipped continuation does not enter private pre-publication review or invoke `arc publish`.

`terminal-rebind-required / reconcile-delivery-state` invokes its supplied `remedy.argv` with `remedy.stdin`
unchanged. `rebound / rerun-checkpoint` restarts this step; every other typed result stops.
This reuses ordinary delivery reconciliation and adds no new operation.

`candidate-publication-commit-required / commit-boundary` renders `payload.recommendedActionText` verbatim and
requires the staged path to equal `payload.boundaryPath`, then continues below.

For either staged publication route, request `arc check gate commit` over the exact new head and boundary correction,
then commit:

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): refresh publication boundary for {name}

Context: meta-{name}.md (integration)
```

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

Restart this step. Ordinary review and publication settlement remain authoritative; Candidate applicability
supplies neither verdict.

`recompose-required / rerun-checkpoint` invokes its supplied remedy and restarts this step.

`candidate-convergence-pending / run-convergence-verification` uses only the supplied `action.requiredScope`:
`focused` requests `arc check gate push --range --force`; `full` requests `arc check gate merge --force`. Retain
`action.verificationKind`, obtain a fresh verification evidence reference, replace only the `{verificationEvidenceRef}`
operand in `action.attestArgv`, invoke that exact argv, then restart this step. Never
invoke the placeholder-bearing argv unchanged or substitute the Candidate root verification reference.

`blocked / stop` renders its supplied reason, detail, and structured remedy, then stops. The delivery-native
`queue-not-atomic` refusal remains a stop and follows its supplied action. `ready / request-approval` continues at the
ready checkpoint below.

`blocked` with `retarget` or `reopen-and-retarget` renders the returned reason and remedy, then stops for explicit
direction to apply that exact remedy. On direction, invoke `remedy.argv` with `remedy.stdin` unchanged.
`remedied / terminal-checkpoint` restarts this step. `remedied / teardown-member` returns to the delivery teardown
path with its exact `selectedDeliverableId`. `blocked / trigger-ref-restore-required` renders its exact ref/head and
stops for Owner approval before restoring only that missing ref, then reruns the same remedy. Every other result
stops.

`reconcile / reconcile-base` and `reconcile / reconcile-regenerable` enter the base-merge arm by invoking the
checkpoint's supplied `remedy.argv` unchanged. The remedy binds the checkpoint's exact movement observation and
Candidate head; only the regenerable arm carries `--regenerate-roadmap`. `base-moved / rerun-checkpoint`,
`head-moved / rerun-checkpoint`, and `head-contained-by-base / rerun-checkpoint` restart this step. `blocked / stop`,
`conflict / stop`, and `regenerable-refused / stop` stop before every later fire point. Before stopping, render the
supplied semantic reason, detail, decisive coordinates, and `continuation` remedy or terminal explanation.
`skipped-clean / continue-reconcile` restarts this step without a push. On `merged / run-quality-gates`, request
`arc check new-head --from <pre-merge head>`, using the returned `expectedHead`; when the result's `dependencyChange` is
not null, reinstall the project's dependencies first. Make no applicability or review judgment before the checkpoint
classifies the exact target.

For `merged / run-quality-gates` only, push the reconciled head.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

Restart this step. The checkpoint now owns Candidate applicability, ordinary publication settlement, delivery
rebind, review status, and final readiness over the pushed exact head. No checkpoint approval carries across the
overlapping base-merge arm, and review carries across it only as the typed applicability result decides;
disjoint movement follows the typed applicability result without a fresh review by default.
Advisory receipts are not merge authority.

On `ready / request-approval`, render `payload.interlockSurface.machineEvidence.text` verbatim.

No commit or push may occur after `ready`.

Re-enter status once over the checkpointed head, in Step 2's status scope, and surface its `hostReview`, the host's
own review verdict — a merge blocker the ready evidence does not clear. `changes-requested` names each blocking
review's author, ID, and reviewed commit; the host refuses the merge while one stands, so obtain Owner direction to
dismiss it or request re-review before merge. `approval-required` names a host approval still missing. On
`unavailable` or a status refusal, surface the detail and inspect the PR's native review on the host instead.

> [!IMPORTANT]
> `integration-interlock`: Stop after the ready evidence and `hostReview` read. Surface each,
> the composed candidate-tail diff — the Release Notes entry and Completion Notes — with any swept or regenerated
> artifacts named rather than diffed, the review applicability calls and targeted verification retained from Step 2,
> the approved responses already performed there and the final dispositions carried by the checkpointed settlement
> plan, and the Owner direction obtained for any `hostReview` blocker.
> State that completed responses are not re-approved at this gate; approval executes the exact remaining plan,
> settles the review-response channel — hosted settlement already ran at Step 2 — ends review, and authorizes merge
> of the checkpointed head. Approval authorizes that exact request; it does not satisfy required checks and is not
> an instruction to invoke merge this turn while those checks are pending. Close with `Approve (or redirect)?`.

If direction requests a composition correction instead of merge authorization, keep the candidate unmerged. Append
the requested composition correction — never amend or rewrite the pushed head. Before committing a correction
that includes authored state text the checks read, run `arc check increment`; completed-only repairs are exempt.
Then rerun affected gates and routing, push through the configured release route, and rebuild the checkpoint over the
new head.

After approval, if the interlock surfaced required checks as not green, do not invoke merge this turn. Retain the
authorized checkpoint and re-enter once they are green. If required checks were green at the interlock, invoke:

```bash
arc integrate merge {name} --checkpoint {payload.checkpointHandle}
```

`merged / complete` proceeds to the tail. `awaiting-checks / retry` keeps the checkpoint and draft lock; surface
`payload.observationKind`, `payload.checks`, any `payload.diagnosticFailures`, and `payload.detail` when present, then
end the foreground attempt. Do not re-invoke recursively. A later retry invokes `payload.retry.argv` unchanged; the verb
revalidates the exact approved target and lifecycle, so the prior approval carries only while both remain unchanged.
`invalidated / checkpoint` returns to the checkpoint. `invalidated / reconcile-base` invokes the supplied `remedy.argv`
unchanged; the remedy carries the planner-observed `--expected-base` and approved `--expected-head`. When settlement
reports `fix-not-performed`, complete the approved fix and submit its exact `verifiedFix` response at the approved
verification scope before re-checkpointing the resulting head; the prior merge approval does not carry to a changed
head. Dispatch the typed base-merge result through the same result arms above, including the new-head check, push,
checkpoint, and approval after `merged / run-quality-gates`. `blocked / stop` stops. Render the merge result's supplied
`nextAction` and remedy or terminal explanation on every non-success arm rather than deriving a continuation from its
evidence fields. The integration interlock is the sole merge authority.

**Skip the merge when the PR is already merged** — the resume path's `merged-at-head` arm (Step 1) enters here with the
merge already landed (attended elsewhere, or unattended on the auto-merge lane); enter the same cleanup tail below.
For a delivery, the checkpoint's typed arm has already bound the exact terminal claim, landed heads, residual, top
target, and member-review conjunction before the integration interlock.

Retire the per-WU user workspace subdir (filesystem op only, no git ops — contents are gitignored):

```bash
arc user close {name}
```

This is an **individually re-runnable** step, not just the tail of a synchronous merge: on the resume path it is
the owning caller of `arc user close` — a merge that landed while no session attended it has no other closer.
`arc user close` no-ops when the subdir is already retired, so a re-run is safe.

Invoke delivery closeout with the exact current change-request repository bound as `repositoryRef` in Step 1:

```json
{"workUnitId":"{name}","repository":"{repositoryRef}","remote":"origin"}
```

```bash
arc delivery closeout -
```

`closed-out` renders `recommendedActionText` and continues. `blocked` renders `recommendedActionText` and stops;
every other typed result stops. The call is idempotent and returns `closed-out` with no plan IDs for an ordinary
non-delivery work unit.

### 11) Post-merge worktree cleanup

After `arc user close`, run `arc teardown <wu-name>` under the pre-merge `integration-interlock` approval — no
second prompt fires. This is the **physical** branch/worktree teardown the archive sweep (Step 8) deferred: it
runs post-merge, since a merged branch can only be reaped once its PR has landed. The verb resolves the shipped
WU's branch and composes the cleanup deterministically, presence-guarded throughout — a resume that re-enters
after a partial teardown skips what is already done:

- reaps the merged branch with a **merged-safe** delete, containment-checked against the upstream — so squash and
  rebase ships are handled where a reachability-from-base delete would refuse, and never a force delete;
- deletes the live remote head too when the branch has provably landed in the base (a plain merge leaves it to
  linger; a host's delete-on-merge already removed it — the idempotent no-op). When only the upstream copy proves
  preservation, the remote head is left intact and surfaced;
- from outside a distinct linked worktree, removes it after the existing clean and user-surface guards;
- from inside that worktree, preflights cleanliness, preservation, and every user-surface reconciliation before
  detaching `HEAD`; on success it reaps refs but leaves the current directory as a live terminal husk;
- keeps the primary/in-place arm unchanged — switch away from the WU branch and reap refs without husking;
- prunes the stale remote-tracking ref a deleted remote branch left behind.

Interpret a self-teardown result explicitly:

- **Husk created:** This session remains live in a detached, disposable worktree. Report whether the local branch
  was reaped. If it survived an operational delete failure, report the exact ref and retry `arc teardown <wu-name>`
  from this husk or the primary; remote deletion is skipped on that attempt and prune still runs. When the marker was
  stamped, the husk can be removed later by re-running teardown from outside or accepting the primary worktree's
  stale-worktree offer. When the marker is absent, malformed, or could not be extended, report an externally managed
  husk: remove/prune it manually from outside; do not promise a sweep backstop. Never reuse a husk for new work.
- **Cannot husk:** Dirty tree, unproven preservation, and blocked user-surface reconciliation are atomic refusals —
  the worktree remains branched and unchanged. Resolve a dirty tree or user-surface block and re-run. If preservation
  cannot be proven in place, inspect and dispose from outside the worktree. Stop at this step until the refusal is
  resolved; there is no `--force` escape.

An outside re-run may physically remove only a clean stamped husk whose live `HEAD` still equals its stamp. A dirty
or moved-`HEAD` husk is refused; a re-run from inside the husk never removes its own cwd.

Then run the [same-session finalize pass][session-handoff-finalize] as an opportunistic early catch — a no-op
unless this session opened another PR that has merged outside an attended ceremony (a concurrent WU, or this one
on the auto-merge lane). The workflow continues to `## Next step` normally.

---

## Next step

- **Under `with-integration` (default):** WU is fully shipped after merge — archive ceremony already landed in
  Step 8.
- **Under `manual`:** After merge, invoke [`archive-work-unit.md`][archive-work-unit] to complete archival
  post-merge.

## Related workflows

- [`reopen-work-unit.md`](reopen-work-unit.md) — the inverse; Integrating → Active (withdraw from review).
- [`prepare-work-unit.md`](prepare-work-unit.md) — preceding private-review ceremony; Active → Integrating.
- [`archive-work-unit.md`](archive-work-unit.md) — cadence-invariant archival; invoked inline under
  `with-integration` or explicitly under `manual`.

---

[review-chunking]: ../../../methods/review-chunking.md
[assess-evidence-applicability]: ../../../methods/assess-evidence-applicability.md
[commit-footer]: ../../../methods/commit-footer.md
[pull-request-format]: ../../../methods/pull-request-format.md
[archive-work-unit]: archive-work-unit.md
[session-handoff-finalize]: ../session-lifecycle/session-handoff.md#same-session-finalize-pass
[create-spec]: ../create-spec.md
[arc-config]: ../../../arc-config.yml
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md

[code-convergence]: ../../../methods/code-review.md#convergence
[code-successor-decision]: ../../../methods/code-review.md#successor-decision
[code-coverage-selection]: ../../../methods/code-review.md#coverage-selection
[code-chunk-gate]: ../../../methods/code-review.md#chunk-gate
[code-ceiling-override]: ../../../methods/code-review.md#ceiling-override
[code-findings-round]: ../../../methods/code-review.md#findings-round
[code-hosted-await-and-settlement]: ../../../methods/code-review.md#hosted-await-and-settlement
[code-hosted-settlement]: ../../../methods/code-review.md#hosted-settlement
[code-local-operation]: ../../../methods/code-review.md#local-operation
