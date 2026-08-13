---
purpose: Ship a work unit — PR open, review iteration, post-approval composition + sweep, final push pre-merge.
audience: agent
arc:
  methods:
    - adversarial-review
    - self-review
    - frontline-review
    - standard-review
    - review-chunking
    - implementation-audit
    - review-triage
    - review-response
    - commit-footer
    - quality-gate-commands
  extensions:
    - pre-pr-open
    - post-pr-open
    - pre-push-review
    - pre-merge
---

# Workflow: Integrate Work Unit

Ship a WU via the single merge-to-main moment. The PR opens with code-only commits; review iteration churns only
code. Post-review-approval, compose Release Notes Entry + Completion Notes into the meta file's archive-phase
sections, sweep + ROADMAP regen, and push the final pre-merge state.

**When to use:** All tasks in `tasks-{name}.md` are marked `[x]`; `active/meta-{name}.md` shows `**State:** Active`.

> [!NOTE]
> **WU not Active?** If `**State:** Planning`, run [`activate-work-unit.md`](activate-work-unit.md) first.

**Two timing phases inside one PR:**

1. **Phase 1: Open + iterate** — code commits only. Composition / sweep / ROADMAP do **not** fire here.
   Rejected PRs touch only code; no archive churn.
2. **Phase 2: Compose + sweep + ship** — post-review-approval, content cleanup + final-form composition +
   sweep + ROADMAP regen land as the final push before merge.

**Per-worktree isolation invariant preserved** — sweep lands on the WU branch before merge.

---

## Phase 1: Open and iterate

### 1) Pre-conditions + entry mode (fresh vs. resume)

`Integrating` is a suspendable point: a session can enter it, hand off across the review wait, and a later
session — or machine — re-enters here. Resolve the entry mode from the resolver — `arc status {name} --json` —
before doing anything else: `active` is a fresh entry, `integrating` is an in-progress resume, and `shipped` can be
an already-swept candidate whose PR remains open or whose post-merge tail remains incomplete.

#### Fresh entry — resolver `state: active`

Verify the integration context:

- Currently on the WU branch (per [`branch-format`][branch-format])
- `active/meta-{name}.md` exists and shows `**State:** Active`

Proceed to Step 2.

#### Resume entry — resolver state `integrating | shipped` (re-entry guard)

The transition already ran in a prior session (or the merge landed unattended). **Skip the state transition and
every pre-PR / PR-open step that already ran** — re-enter at the first incomplete tail step. Resolve the resume
point from observable state — PR open vs. merged, plus worktree/branch presence — never by redoing a completed
step:

On interruption, re-enter local and frontline review only through the public protocol in Step 3. Retain the returned
operation ID and follow the last typed `state` / `nextAction`: resume a local operation with
`arc review local resume -`, and re-invoke the owning idempotent verb for frontline, response, or reduction work.
Resume a hosted operation by passing its self-contained handle back to `arc review hosted await -`. Never publish
or reconstruct review state from workflow prose; the meta's narrative `Next Action` is not operational authority.
When no public action can advance yet, leave the vehicle in `Integrating` and state the exact source change or
deadline that should trigger human re-entry.

| Resolver and PR state                         | Demonstrably already ran             | Resume at                                                          |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `integrating`; no PR open                     | transition                           | Step 3, from the idempotent **push** action                        |
| `integrating`; PR open, not merged            | transition, PR open                  | Step 4 (`post-pr-open` → review iteration), then candidate tail    |
| `shipped` in `completed`; PR open, not merged | transition, PR open, candidate sweep | Step 13 (validate products, then final settlement)                 |
| PR already merged                             | transition, PR open, merge           | Verify Phase 2 products; when complete, resume at the Step 13 tail |

Resolve PR state with `gh pr view {type}/{name} --json state,mergedAt` (fall back to `gh pr list --head
{type}/{name}`); resolve worktree/branch presence with `git worktree list` and `git branch --list {type}/{name}`.
Within the suspendable review cycle, resume the first incomplete candidate-tail step. Composition already written
into the meta's archive-phase sections and a committed sweep are observed, never redone. A resolver `state: shipped`
with an open, not merged PR is the swept-candidate arm and resumes at Step 13. The tail steps (Steps 13–14 below) are
individually re-runnable and no-op when their target is already gone, so an over-eager resume costs nothing.

Before selecting the merged-PR tail, verify the meta contains Completion Notes and any applicable Release Notes;
under `with-integration`, the resolver reports `shipped` in `completed`. A merged PR proves only that the merge ran,
not that composition or archival ran. If a required product is absent, preserve the branch and worktree, and do not
invoke `arc user close` or `arc teardown`. Land the missing products through a lifecycle-only repair change request,
then re-enter this guard after it merges.

### 2) Pre-publication review

If the [`self-review` method][self-review] is effectively active:

1. Execute the [`self-review` method][self-review] against the local aggregate diff vs the base branch.
   Classify findings per the [`review-triage` method][review-triage]; commit fixes per the
   [`commit-footer` method][commit-footer].
When inactive, continue with the typed pre-publication procedure.

From the local Candidate branch, compose the immutable policy target
`{ repository, pullRequest: null, headSha }`, the routed `standardReview` projection, and the explicit routing facts.
For each new target, invoke `arc review chunking resolve -` once and retain its target statistics. Select
whole-target or chunked scope separately for frontline and standard review, then pass the exact selection to
`arc review resolve -`. The chunking recommendation informs this bounded scope judgment — apply the
[`review-chunking` method][review-chunking] to make it; the workflow never recomputes thresholds.

Resolve the frontline lane first, then the pre-PR standard lane. Follow only each returned `state` /
`nextAction` pair:

- `skipped | no-op | pass-complete / none` — the lane is complete at this boundary.
- `awaiting-change-request / open-change-request` — retain the exact hosted-first reservation and complete the
  pre-publication procedure at `candidate-submit-ready`.
- `ready / run-frontline` — invoke `arc review frontline resolve -`, then
  `arc review frontline run -` with the exact driver selection.
- `ready / local-prepare` — invoke `arc review local prepare -`.
- `findings / respond` — enter the disposition protocol below.
- `approval-required / obtain-ceiling-override` — surface the returned exact one-pass consequence and
  `Approve (or redirect)?`; only exact approval returns that override to the next identical target/lane call.
- `chunk-pending / continue-chunks` — continue the selected local chunk series without consuming the pass.
- `stale-target / select-scope` — recompose the target and rerun chunking before resolving again.
- `blocked | unavailable | invalid-override / stop` — surface the typed diagnostics and stop.

Dispatch frontline and local operations only through their public typed actions. Local preparation receives the
evaluator identity and routing facts; the evaluator submits status, result, findings, and run identity to
`arc review local attest -`. Runtime-owned bindings for repository, target/tree, source, rubric, and guidance are
injected from the immutable operation. Any supplied compatibility binding must match exactly. Resume with
`arc review local resume -`; reduce with `arc review reduce -`; submit approved disposition state with
`arc review respond -`. A command error envelope, including `invalid-input`, carries no dispatchable state.

For every finding, run [`review-triage`][review-triage] and [`review-response`][review-response]. Present reviewer
severity, ARC re-grade, source locus, and a discrete `Recommended disposition:` line. Approval is required before
any finding-driven fix, durable deferral, channel settlement, or other mutation/commitment. A complete no-action
record-only set may remain proposed for the final combined gate. Approved fixes run Tier 1 gates (commands per the
[`quality-gate-commands` method][arc-methods-qg]), commit atomically, and produce a new target locally; apply Step 4's
review applicability judgment rather than carrying clearance or merge authority.

Never treat advisory receipts, outcomes, reductions, scope recommendations, or disposition proposals as merge
authority. Proceed to Step 3 only from the typed `candidate-submit-ready` locus; its durable boundary carries any
hosted-first reservation into publication without classifying that obligation as settled or no-op.

### 3) Open the PR

Compose the submission inputs (judgment — never fabricated):

- last completed — the WU's final completed work (the last `[x]` task / phase in `tasks-{name}.md`)
- next action — the publication pointer (`push and open the PR`)

```bash
arc submit {name} --last-completed "{last completed}" --action "{next action}" --json
```

The executor fires `Active → Integrating`, writes the composed orientation, regenerates ROADMAP, and stages the
publication boundary with any carried reservation. An advisory-only reconcile stops before the transition and
surfaces every reference. Edit and rerun, or obtain explicit direction to retain all surfaced advisories and rerun
with `--allow-advisories`; the flag does not accept conflicts or stale mechanical edits.

Confirm the regenerated ROADMAP diff is clean (the `State` flip only) before committing.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit` (subject `chore(arc):` per § Commit
> Discipline, meta-file commit shape):

```text
chore(arc): submit {name}

- Flip State: Active → Integrating

Context: meta-{name}.md (integration)
```

**Push extension contract** · `#pre-push-review`: Before every agent-managed push in this workflow, if the
extension appears in the active-extensions list, load and execute its `.actions`. Halt-on-fail surfaces an
actionable message; user fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin {type}/{name}`.

**Push the WU branch upstream.** Re-entry from the no-PR resume row starts here; pushing an unchanged branch is
idempotent, so both transitioned-but-unpushed and pushed-but-uncreated interruptions use this same resume action.

Immediately before creation, compose
`proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }` from the pushed branch. If `pre-pr-open`
is active, execute its numbered `.actions` in authored order. Halt before later actions on failure. A failed
`gh pr create` does not make the hook durable: retry the creation path and its retry-safe actions. Skip this hook
whenever an open PR already exists.

Invoke `arc merge lock resolve -` with the exact tree root. Follow only its typed action: `locked / open-locked`
creates the PR locked; `none / open-plain` creates it plain; `blocked / stop` halts creation before any PR exists.

Open the PR on the resolved action:

```bash
gh pr create --base {base-branch} --head {type}/{name}            # open-plain
gh pr create --base {base-branch} --head {type}/{name} --draft    # open-locked
```

Single PR per WU. The PR title's Conventional Commits type carries the signal.

**PR body:** load [`template-pull-request.md`][template-pull-request] for the canonical shape (Spec / Summary /
Changes / optional Test Plan / Out of Scope / Follow-Up Work) and its anti-patterns. Do not add sections
describing post-merge workflow continuity or next actions — those route to the meta file and SESSION-NOTES per
[DEV-RULES.ARC][dev-rules-arc] § Write for the reader, not the author.

### 4) Review iteration

Resolve the one open PR and compose `openedChangeRequest = { repositoryRef, hostRef, headSha }`. If `post-pr-open`
is active, execute its numbered `.actions` in authored order before review iteration. This idempotent hook fires on
both the newly-created path and every open-PR re-entry; actions derive current host state from `hostRef`. Every
hook and review invocation shares this exact-head contract. If an action changes the head, recompose
`openedChangeRequest` from the canonical current head before re-entry.

Before spending a hosted pass on a branch already behind its base, read `arc base drift --json`. Keep `clean` and
regenerable-only drift silent. For substantive overlap, reconcile early only when the interaction is clear and
reviewing first would waste the pass; use an append-only merge, rerun Tier 1 gates, push, and recompose the target
without a permission stop. A conflict, material interaction, or uncertain product decision stops. This advisory
never replaces Step 13's authoritative final drift read.

Read `integrationBoundary.reservation` from the typed status projection. A null reservation means the standard lane
already settled or was a typed no-op before submission; do not invent a post-PR obligation. A carried reservation
must match the current Candidate and supplies the reserved `sourceId` and exact obligation. Bind the open pull
request to that reservation without rerunning chunking or source ordering, then invoke `arc review hosted request -`
with the reserved provider, exact opened target, and `coverage: complete`:

- `requested / await` — pass the returned self-contained handle to `arc review hosted await -`. Use the bounded
  wait again when it returns `pending / await`; do not build an agent polling loop.
- `clean / complete` — feed a `clean` attempt to `arc review resolve -`.
- `findings / triage` — run the disposition protocol. For each approved finding with
  `settlement: reply-and-resolve`, settle before feeding `findings` back to the driver. For `defer` or `reject`,
  invoke `arc review hosted settle -` with the unchanged originating `target` and `fixTarget: null`. For `fix`,
  apply and verify the approved change, commit and push it, recompose the current target, then invoke the same verb
  with the originating `target` plus that changed `fixTarget`. A finding with `settlement: not-applicable` is
  triage-only: never invoke `hosted settle`, post a reply or compensating summary comment, or resolve anything for
  it, regardless of disposition.
- `rate-limited | transient-unavailable / try-next-source` — feed that safe outcome to the same driver call; it may
  select the next configured source without consuming the pass.
- Any ambiguous delivery, stale target, malformed output, source failure, or terminal failure stops. Never replay
  an uncertain request.

While a hosted await is live, speculative drafting of Completion Notes, Release Notes, and the cleanup plan is
allowed when useful. Do not commit, push, archive, regenerate readiness, or destructively clean from that draft
before `review-settled`.

After every target movement, make and disclose a **review applicability** judgment from the exact delta:

- use targeted verification when prior complete coverage confidently remains applicable to a narrow,
  non-interacting record-only or lifecycle delta;
- run a focused supplemental check when a bounded interaction deserves attention but not a complete pass;
- repeat the applicable complete review for behavioral, authority, contract, materially interacting, or uncertain
  change.

These are judgment signals, not an eligibility checklist or proof obligation. A confident bounded choice proceeds
without asking permission and is retained for the final gate. An agent-selected supplemental review is disclosed
as it runs and enters the same finding/disposition loop; it does not settle `standardReview` unless it ran that
contract. A hosted supplemental request uses `coverage: incremental`; if its adapter reports
`effectiveCoverage: complete`, accept the broader review and disclose the upgrade. Stop only when the pass needs
new authority, material cost, or resolution of genuine uncertainty.

Re-run Tier 1 gates after every review-driven change. A new target invalidates clearance and merge authorization;
never rewrite a prior exact-target result as if it ran on the new head.

The WU stays in `**State:** Integrating` throughout this phase. Composition + sweep do not fire here.

---

## Phase 2: Compose, sweep, ship

### 5) Candidate-entry requirement

Do not begin candidate assembly until Step 6 reduces the WU's routed review obligation to `review-settled`.
`review-settled` is the candidate-entry state, never merge readiness. A raw local clean report, a launched review
pass, or an unattested result does not establish it.

### 6) Confirm review coordination

Confirm the public open-PR review protocol has reduced the routed WU obligation to `review-settled`. Every
mutation- or commitment-bearing disposition must already be approved; a complete no-action record-only set may
remain proposed for the combined final gate. This is not the final-head checkpoint; base freshness belongs only to
Step 13, after candidate composition.

Only that protocol's settled reduction establishes `review-settled`. Any pre-composition direction to merge once
review settles authorizes autonomous advance through candidate assembly to the final integration interlock; it is
not prospective merge authority over the candidate's not-yet-known head.

After settlement, clean the WU content:

- If `notes-{name}.md` exists, decide its disposition: follow [`clean-work-unit.md`][clean] `§ Notes File
  Consolidation`, keep it as-is only when already reference-ready, or delete it and remove task-file references.
- Survey the task list for temporal markers, ad-hoc inline status, or accumulated scratchpad content. When present,
  apply [`clean-work-unit.md`][clean] `§ Task List Temporal-Noise Pass`.

Candidate assembly now advances without another proceed turn. Stop only for a material alignment disagreement,
failed quality gate, base conflict, or unexpected state.

### 7) Spec-presence + alignment checks

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

### 8) Compose Release Notes Entry — uncommitted

Compose a public entry into `active/meta-{name}.md`'s archive-phase `## Release Notes Entry` section. Describe only
shipped reader/operator-visible outcomes supported by the exact candidate diff. Never include WU names or slugs,
task or phase references, branches, roadmap pointers, internal review or provider machinery, other internal
development jargon, or planned-but-unshipped work. Publicly supported review concepts and configuration may be
named when they are the shipped outcome.

Write a one-paragraph summary plus categorized lines from the Keep a Changelog set — **Added**, **Changed**,
**Removed**, **Fixed**, **Infrastructure**, **Deprecated**, **Security** — omitting empty categories and retaining
that order. Use **Infrastructure** only for an externally meaningful operational change. An optional **Breaking
Changes** callout must name the affected stability contract and required migration. Omit the entire section when
nothing reader/operator-visible ships; otherwise size it to what shipped.

Leave the edit uncommitted for the candidate-tail commit in Step 10.

### 9) Compose Completion Notes — uncommitted

Compose narrative Completion Notes into the meta file's archive-phase `## Completion Notes` section. Distinguish
delivered scope, material deviations or supersessions, and verified evidence. Synthesize the result; never repeat
the task list's verbatim record or git history. Size it to what there is to say. Always present — not omittable,
unlike Step 8's Release Notes. Leave it uncommitted until Step 10.

### 10) Commit completion content

Run the applicable quality gates ([`quality-gate-commands`][arc-methods-qg]) and stop on failure. Bundle the
composition edits under the provisional-candidate exception; this commit does not make the branch merge-ready.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): compose archive-phase content for {name}

- Release Notes Entry: <one-line summary>
- Completion Notes

Context: meta-{name}.md (integration)
```

When Step 8 omitted the Release Notes section (nothing user-facing), drop its bullet from the commit body.

See [DEV-RULES.ARC][dev-rules-arc] § Commit format and the [`commit-footer` method][commit-footer].

### 11) Cadence dispatch — `archive.cadence`

Read `archive.cadence` from [`arc-config.yml`][arc-config]:

- **`with-integration`** (default): Invoke [`archive-work-unit.md`][archive-work-unit] inline. Its `arc archive`
  sweep handles state flip `Integrating → Shipped`, the relocation `active/meta-{name}.md` →
  `completed/<dated>/{NN}_{name}/meta-{name}.md`, the logical `Branch → [none]`, the `PR URL` / `Completed`
  finalize-fact write (sourcing the PR URL from this ceremony's open PR), and ROADMAP regen per its
  cadence-invariant body — the **mergeable** ship, which rides this PR. Physical branch/worktree teardown is
  **not** archive's: it is Step 14's post-merge cleanup below. Returns; resume at Step 12.
- **`manual`**: Skip inline invocation. Archive runs separately post-merge via explicit `archive-work-unit.md`
  invocation. Step 12's push covers completion content only under this cadence.

### 12) Final push

What gets pushed varies by cadence:

- Under `with-integration`: completion content + sweep commits + ROADMAP regen commits.
- Under `manual`: completion content commit only. Sweep + ROADMAP fire later when `archive-work-unit.md` is
  invoked explicitly post-merge.

Repeat the Step 3 push extension contract before this push.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

After push, this is a provisional integration candidate, never merge readiness.
Recompose its exact target, rerun chunking preflight, and apply Step 4's review applicability judgment. Only
Step 13's exact-head integration authorization can release the merge.

### 13) Behind-base reconcile gate and merge

This is the candidate's final mutation site. Run the authoritative drift verb and parse its JSON:

```bash
arc base drift --json
```

Accept only a JSON object with `mode: authoritative`, a recognized verdict, and the verdict's required typed
fields. A healthy `clean` / `reconcile` result requires non-negative integer distance, a validated `baseOid`,
and the typed evidence fields; `reconcile` additionally requires a register. An `unavailable`, `skipped`,
unrecognized, malformed, or non-JSON result stops integration — surface its typed reason or parse failure.

On `reconcile`, continue autonomously only when the typed result carries a validated `baseOid`, complete integration
evidence, `overlap.status: available`, and an empty `substantivePaths` set. Re-read canonical host mergeability;
a base conflict stops, and an analyzer/host disagreement stops unless the conflicting path set is wholly
regenerable — the same line Step 4's advisory read draws, and the append-only merge below is the authoritative
test either way. Merging the base **in** is reversible; the merge this step later authorizes is not. Unavailable
overlap, incomplete evidence, or a substantive interaction also stops rather than weakening the reconcile.

Immediately refresh `arc base drift --json`. A `clean` result skips the merge; a changed `baseOid` restarts this same
read. When the identical OID still has the safe typed disjoint result, merge it append-only:

```text
git merge --no-edit {baseOid}
```

A merge conflict stops without resolution. Otherwise run Tier 1 quality gates and recompose the exact target. Ask
the operating agent for the same disclosed review applicability judgment as Step 4. Preserve prior complete
coverage with targeted verification when the merge is confidently non-interacting; otherwise run focused or
complete review and recompose the candidate afterward. Clearance and integration authority never carry.

Repeat the Step 3 push extension contract.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

After push, re-run required CI and routing on the new exact head before `pre-merge`. If the base moves again, return
to the same Step 13 drift read. Do not rebase, amend, force-push, or otherwise rewrite the pushed WU branch. Continue
only when the authoritative result is `clean`.

At the zero-behind head, apply the current WU's exact reconcile and parse its JSON:

```bash
arc wu reconcile {name} --apply --json
```

Accept only a schema-v1 result for the exact slug with status `clean`, `pending`, `applied`, or `conflict`. Malformed,
unrecognized, or command-failure output stops integration. `pending` stops and surfaces every advisory reference:
edit and rerun until `clean` / `applied`, or obtain explicit user direction to retain each advisory as intentional
before continuing. `conflict` — including missing, ambiguous, corrupt, or
otherwise unavailable replacement evidence — stops unmerged and surfaces the typed reason; the WU may remain
`Integrating`.

`clean` proceeds without a commit. On `applied`, run Tier 1 quality gates over the staged correction, then commit:

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): reconcile {name} before integration

Context: meta-{name}.md (integration reconcile)
```

Repeat the Step 3 push extension contract and exact-head mutability action, then push through `workflowPush`.
Rerun required CI and exact-head review coordination, and restart Step 13 from the authoritative base-drift read.
The correction invalidates every prior base, lifecycle, review, and pre-merge checkpoint; rebuild them from the new
head. Do not widen the review-readiness request or add a second merge-guard criterion.

At the zero-behind final head, retain the `clean` result's `baseOid` as the current base-freshness evidence. Resolve
authoritative lifecycle state:

```bash
arc status {name} --json
```

Require a valid result for the exact WU and cadence. Under `with-integration`, require resolver state `shipped` in
`completed`, with the archive move, applicable cohort closeout, and readiness regeneration present. Under `manual`,
require resolver state `integrating`; archive and readiness products remain post-merge. Both cadences require
Completion Notes and any applicable Release Notes. Missing, ambiguous, or wrong-cadence products stop.

Compose the current `openedChangeRequest` and invoke `arc review readiness -` with the exact tree root, target,
vehicle, and WU slug. Require the ready envelope for this head. Fire `pre-merge` when active; its actions report
checks, conversations, and requirements without replacing readiness or review settlement. Retain
`openedChangeRequest.headSha` as `{approved-head-sha}`. Any candidate mutation or review action invalidates the
checkpoint: return to the authoritative lifecycle/drift reads, reconcile if needed, and fire the final hook again.
No lifecycle- or review-authored commit or push is allowed after this stable checkpoint and before the integration
interlock.

Compose the exact candidate-tail diff from the settled implementation head through task and notes cleanup,
composition, cohort closeout, archive moves, readiness regeneration, and reconcile commits. Surface this exact diff,
not excerpts alone.

Compose and preview the final content-gated `## Review` record. Report `Local` and `Hosted PR` activity by
human-readable product/model and count, using `None` for an empty category. Report `Triage` with the GitHub identity
approving the final disposition set and distinct material-finding counts by final disposition. When prior complete
coverage carried across a later narrow delta, add `Coverage` with the targeted verification and delta character;
omit `Coverage` when every reported pass ran on this head. Omit the whole section when no review ran.

No `gh pr merge`, auto-merge enablement, or queued merge may occur before these products exist and the final
integration-interlock fires. The integration-interlock is the sole merge authority.

A post-composition failure leaves the candidate unmerged and stops with its evidence. On re-entry, resume the first
incomplete candidate-tail step; never infer readiness from later products that happen to exist.

> [!IMPORTANT]
> `integration-interlock`: Stop before merge. Surface the exact approved head, complete candidate-tail diff, every
> review applicability call and targeted verification, the proposed final dispositions and `## Review` record, PR
> status, requirements, merge method, lifecycle readiness, and the clean base-drift result. State that approval
> applies final dispositions and channel settlement, ends review, invokes the exact-head release when a lock
> applies, and authorizes merge only if the ordinary exact-head rechecks succeed unchanged. Close with
> `Approve (or redirect)?`.

If direction requests a composition correction instead of merge authorization, keep the candidate unmerged. Append
the requested composition correction — never amend or rewrite the pushed head — rerun affected gates and routing,
push through the workflow contract, rebuild lifecycle/base evidence, and refire the integration-interlock over the
new exact head.

Immediately after approval, apply the approved final dispositions and channel settlements, then recompose
`openedChangeRequest` from the canonical current head. If its `headSha` differs from `{approved-head-sha}`,
invalidate the approval and return through review applicability. Otherwise, re-read PR status for that exact head.
If threads, required approvals, or required checks are no longer settled, invalidate the approval and return
through review.

Replace any stale PR review summary with the previewed `## Review` record, so a released PR a human may open
already carries the complete record of what was done.

Invoke `arc merge lock release -` with the exact approved target, vehicle, and tree root. Follow only its typed
action: `released / proceed` continues; `no-lock / none` continues because no lock applies or the PR already holds
that state; `blocked / stop` invalidates approval. Re-read required checks on the unchanged head.

**A released PR is not a head-authorized PR.** Draft is a property of the pull request rather than of a commit, so
the release says the lock came off — never that it came off for one head. Both continuing actions carry the exact
`headSha` in their payload, and that head is the only one this approval reaches: merge it with the host's
head-matched merge below, and never let a head that arrived after the release inherit the authorization. Treating
`released / proceed` as permission to merge whatever head is current steps outside the verb's contract.

From that release until the merge command, the PR is open and released, so **every exit that is not that merge
command re-locks first** — each non-merge outcome of the reads below, and any stop they surface. Invoke
`arc merge lock hold -` with the same target, vehicle, and tree root, then take the exit; dispatch on its typed
action as above, and surface a `blocked / stop` hold with the exit that prompted it rather than in place of it.

With PR state still settled, immediately invoke `arc base drift --json` once more and apply the same strict
validation. `unavailable`, `skipped`, malformed, or unrecognized stops; `reconcile` returns to the reconcile loop
and requires a new exact-head checkpoint plus integration approval. Only `clean` permits the merge command, with
no extension, review action, lifecycle mutation, commit, push, fetch, or second human stop between this final read
and merge:

```text
result = arc base drift --json
if <result is authoritative clean>:
    gh pr merge {pr-number} --merge --match-head-commit {approved-head-sha}   # strategy per config
else:
    <stop or return to the reconcile loop per the validated verdict>
```

A merge command that returns nonzero is itself a non-merge exit, so it re-locks like any other. Re-read PR state
first — the merge may have landed before the failure — and skip the hold when it reports merged. While it is still
open, invoke `arc merge lock hold -` with the same target, vehicle, and tree root, dispatch on its typed action,
then stop and report the merge's own failure. Nothing below this line runs on that path.

**Skip the merge when the PR is already merged** — the resume path's PR-merged arm (Step 1) enters here with the
merge already landed (attended elsewhere, or unattended on the auto-merge lane); proceed straight to `arc user
close`.

Retire the per-WU user workspace subdir (filesystem op only, no git ops — contents are gitignored):

```bash
arc user close {name}
```

This is an **individually re-runnable** step, not just the tail of a synchronous merge: on the resume path it is
the owning caller of `arc user close` — a merge that landed while no session attended it has no other closer.
`arc user close` no-ops when the subdir is already retired, so a re-run is safe.

### 14) Post-merge worktree cleanup

After `arc user close`, run `arc teardown <wu-name>` under the pre-merge `integration-interlock` approval — no
second prompt fires. This is the **physical** branch/worktree teardown the archive sweep (Step 11) deferred: it
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
  Step 11.
- **Under `manual`:** After merge, invoke [`archive-work-unit.md`][archive-work-unit] to complete archival
  post-merge.

## Related workflows

- [`reopen-work-unit.md`](reopen-work-unit.md) — the inverse; Integrating → Active (withdraw from review).
- [`activate-work-unit.md`](activate-work-unit.md) — preceding ceremony; Planning → Active.
- [`archive-work-unit.md`](archive-work-unit.md) — cadence-invariant archival; invoked inline under
  `with-integration` or explicitly under `manual`.
- [`clean-work-unit.md`][clean] — supplemental content-cleanup toolkit invoked from Step 5.

---

[branch-format]: ../../../methods/branch-format.md
[self-review]: ../../../methods/self-review.md
[review-chunking]: ../../../methods/review-chunking.md
[review-triage]: ../../../methods/review-triage.md
[review-response]: ../../../methods/review-response.md
[commit-footer]: ../../../methods/commit-footer.md
[arc-methods-qg]: ../../../methods/quality-gate-commands.md
[template-pull-request]: ../../../../reference/templates/arc/work-unit/template-pull-request.md
[archive-work-unit]: archive-work-unit.md
[clean]: ../supplemental/clean-work-unit.md
[session-handoff-finalize]: ../session-lifecycle/session-handoff.md#same-session-finalize-pass
[create-spec]: ../create-spec.md
[arc-config]: ../../../arc-config.yml
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
