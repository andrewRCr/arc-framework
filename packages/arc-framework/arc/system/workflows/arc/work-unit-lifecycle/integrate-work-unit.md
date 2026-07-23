---
purpose: Ship a work unit — PR open, review iteration, post-approval composition + sweep, final push pre-merge.
audience: agent
arc:
  methods:
    - adversarial-review
    - self-review
    - frontline-review
    - standard-review
    - implementation-audit
    - review-triage
    - review-response
    - commit-footer
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

Compose the integration inputs (judgment — never fabricated):

- last completed — the WU's final completed work (the last `[x]` task / phase in `tasks-{name}.md`)
- next action — the integration pointer (`open the PR`)

```bash
arc integrate {name} --last-completed "{last completed}" --action "{next action}"
```

The executor fires the full `integrate` edge: flips `**State:** Active → Integrating`, writes `**Last Completed:**`
/ `**Next Action:**`, resets `**Next Task:** [none]`, regenerates `backlog/ROADMAP.md` so the In Flight table's
`State` column reflects `Integrating`, and stages both the meta and the ROADMAP. `{name}` defaults to the current
worktree's WU. The `Integrating` state covers PR open through review-response.

Confirm the regenerated ROADMAP diff is clean (the `State` flip only) before committing.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit` (subject `chore(arc):` per § Commit
> Discipline, meta-file commit shape):

```text
chore(arc): integrate {name}

- Flip State: Active → Integrating

Context: meta-{name}.md (integration)
```

Proceed to Step 2.

#### Resume entry — resolver state `integrating | shipped` (re-entry guard)

The transition already ran in a prior session (or the merge landed unattended). **Skip the state transition and
every pre-PR / PR-open step that already ran** — re-enter at the first incomplete tail step. Resolve the resume
point from observable state — PR open vs. merged, plus worktree/branch presence — never by redoing a completed
step:

On interruption, re-enter local and frontline review only through the public protocol in Step 3. Retain the returned
operation ID and follow the last typed `state` / `nextAction`: resume a local operation with
`arc review local resume -`, and re-invoke the owning idempotent verb for frontline, response, or reduction work.
Hosted-only waits remain behind the active project coordinator, which re-reads canonical host/provider state.
Never publish or reconstruct review state from workflow prose; the meta's narrative `Next Action` and persisted
controller conclusions are not operational authority. When no public action can advance yet, leave the vehicle in
`Integrating` and state the exact source change or deadline that should trigger human re-entry.

| Resolver and PR state                         | Demonstrably already ran             | Resume at                                                          |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `integrating`; no PR open                     | transition                           | Step 2 (local preflight → creation path)                           |
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

### 2) Local diff preflight

If the [`self-review` method][self-review] is effectively active:

1. Execute the [`self-review` method][self-review] against the local aggregate diff vs the base branch.
   Classify findings per the [`review-triage` method][review-triage]; commit fixes per the
   [`commit-footer` method][commit-footer].
When inactive, proceed directly to Step 3.

### 3) Open the PR

Push the WU branch upstream.

**Push extension contract** · `#pre-push-review`: Before every agent-managed push in this workflow, if the
extension appears in the active-extensions list, load and execute its `.actions`. Halt-on-fail surfaces an
actionable message; user fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin {type}/{name}`.

From the pushed branch, compose the exact aggregate review target and the explicit routing-facts record the
resolver consumes — `changeSetState`, `contentKind`, `reviewRisk`, `changeDeterminacy`, `ownership`,
`surfaceAuthority`, `assurance`, and `activity`. These are review-policy facts, not the canonical changed-path
record; supplying the latter resolves `changeSetState: unknown` and the maximal floor. Run
`arc review frontline resolve -` with `"invocation": {"mode": "inherit"}`. Follow only its typed
`state` / `nextAction` pair:

- `skipped / none` — continue.
- `offered / bind-source` — surface the unbound source action and stop this lane.
- `offered / obtain-authorization` — surface the authorization action; re-run resolve only after authorization.
- `ready / run-frontline` — pass the exact target and complete ready resolution to
  `arc review frontline run -`.

Dispatch the `frontline run` result by its typed `state` / `nextAction`. Continue on `clean / none`; retry only
`unavailable / retry`, `timed-out / retry`, or `failed / retry`; repair only an explicit `operator-repair` action;
recompose the target on `stale-target / prepare-current-target`. On `findings / respond`, run
[`review-response`][review-response], then pass the durable frontline outcome reference and approved disposition set
to `arc review respond -`.

When standard-review dispatch selects the delegated local lane, invoke `arc review local prepare -` with the
evaluator identity and routing facts. For `local prepare`, supply only `contentKind`, `reviewRisk`,
`changeDeterminacy`, `ownership`, and `surfaceAuthority`; the CLI derives `changeSetState`, assurance, and activity.
Follow only its typed `state` / `nextAction`:

- `exempt / none` — continue.
- `ready / launch-review` — give the returned reviewer payload to the separately authorized evaluator, then submit
  its normalized result with the returned operation ID to `arc review local attest -`.
- `unavailable / operator-repair` — stop and surface the binding diagnostics.
- `stale-target / prepare-current-target` — recompose and restart preparation.

Dispatch attestation by its typed action: run `arc review reduce -` on `attested-current / reduce`; recompose on
`stale-target / prepare-current-target`; rerun the review on `expired / rerun-review` or
`not-attestable / rerun-review`. After an interruption, invoke `arc review local resume -` with the operation ID and
follow its returned action rather than reconstructing state. On `respond-to-findings / respond`, run
[`review-response`][review-response], then pass the receipt reference and author-owned finding decisions to
`arc review respond -`. On `awaiting-approval / obtain-approval`, present the returned canonical proposal; after
exact approval, resubmit that proposal as the approved disposition state.

Dispatch `respond` by its typed pair: on `awaiting-approval / obtain-approval`, follow the approval step above; on
`ready-to-fix / apply-fix`, apply only the approved fix set, run Tier 1 quality gates, commit through the applicable
interlock, push through the workflow-wide push contract, then recompose the exact target and restart the selected
review lane; on `settled / reduce` or `already-settled / reduce`, invoke `arc review reduce -`; on
`stale-target / prepare-current-target`, recompose the exact target and restart the selected review lane. Dispatch
`reduce` the same way: route
`findings / respond` through [`review-response`][review-response] and `respond`; continue on `settled / none` or
`advisory-complete / none`; invoke the returned retry command on `retryable / retry`; recompose on
`stale-target / prepare-current-target`.

Any command error envelope, including `invalid-input`, stops the lane and carries no dispatchable state. Never treat
advisory receipts, outcomes, or reductions as merge authority.

Immediately before creation, compose
`proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }` from the pushed branch. If `pre-pr-open`
is active, execute its numbered `.actions` in authored order. Halt before later actions on failure. A failed
`gh pr create` does not make the hook durable: retry the creation path and its retry-safe actions. Skip this hook
whenever an open PR already exists.

Open the PR:

```bash
gh pr create --base {base-branch} --head {type}/{name}
```

Single PR per WU. The PR title's Conventional Commits type carries the signal.

**PR body:** load [`template-pull-request.md`][template-pull-request] for the canonical shape (Spec / Summary /
Changes / optional Test Plan / Out of Scope / Follow-Up Work) and its anti-patterns. Do not add sections
describing post-merge workflow continuity or next actions — those route to the meta file and SESSION-NOTES per
[DEV-RULES.ARC][dev-rules-arc] § Write for the reader, not the author.

### 4) Review iteration

Resolve the one open PR and compose `openedChangeRequest = { repositoryRef, hostRef, headSha }`. If `post-pr-open`
is active, execute its numbered `.actions` in authored order before review iteration. This idempotent hook fires on
both the newly-created path and every open-PR re-entry; actions derive current controller/host state from `hostRef`.
Review coordination and every hook invocation share this exact-head contract. If a review action changes the head,
recompose `openedChangeRequest` from the canonical current head before re-entry; never carry the prior head forward.

Re-enter the public `arc review` protocol from Step 3 with the exact target, effective routed obligation, and
explicit project channel `local | hosted | both`. An active project review coordinator may select a source and
supply hosted-only adapter actions, but it drives local and frontline transitions only through those commands.
Follow the returned typed state/action through reduction and send findings through
[`review-response`][review-response]. If the selected source is unavailable, partial, or failed, only a required
obligation blocks; recommended work stays visible and non-blocking. Recompose and repeat the protocol after any
approved fix changes the target.

Process any reviewer findings per the [`review-triage` method][review-triage]; commit fixes per the
[`commit-footer` method][commit-footer]. Re-run Tier 1 quality gates on modified files after each review-driven
commit.

The WU stays in `**State:** Integrating` throughout this phase. Composition + sweep do not fire here.

---

## Phase 2: Compose, sweep, ship

### 5) Candidate-entry requirement

Do not begin candidate assembly until Step 6 reduces the WU's routed review obligation to `review-settled`.
`review-settled` is the candidate-entry state, never merge readiness. A raw local clean report, a launched review
pass, or an unattested result does not establish it.

### 6) Confirm review coordination

Confirm the public open-PR review protocol has reduced the routed WU obligation to `review-settled`. This is not the
final-head checkpoint; base freshness belongs only to Step 13, after candidate composition.

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

Run the applicable quality gates and stop on failure. Bundle the composition edits under the provisional-candidate
exception; this commit does not make the branch merge-ready.

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

Invoke the active project review coordinator's exact-head mutability action with the current
`openedChangeRequest`, the outgoing local head, and any `begin-fix` authorization receipt. Stop on any typed refusal;
never reverse the current/outgoing head order.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

After push, this is a provisional integration candidate, never merge readiness.
Always recompose the candidate after any correction or interacting reconcile; only Step 13's exact-head integration
authorization can release the merge.

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
a base conflict stops, and any analyzer/host disagreement stops. Unavailable overlap, incomplete evidence, or a
substantive interaction also stops rather than weakening the reconcile.

Immediately refresh `arc base drift --json`. A `clean` result skips the merge; a changed `baseOid` restarts this same
read. When the identical OID still has the safe typed disjoint result, merge it append-only:

```text
git merge --no-edit {baseOid}
```

A merge conflict stops without resolution. Otherwise run Tier 1 quality gates and recompose the exact target. Ask
the active project review coordinator for the typed applicability proof. Carry the composition basis only when the
proof establishes the reviewed WU delta is unchanged and selects `carry`; an interacting or otherwise non-carry
result discards the basis, returns to Step 4 for required review, and recomposes the candidate afterward.

Repeat the Step 3 push extension contract, then invoke the active project review coordinator's exact-head mutability
action with the current `openedChangeRequest` and outgoing local head. Stop on a typed refusal; never reverse those
heads.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

After push, re-run required CI and routing on the new exact head before `pre-merge`. If the base moves again, return
to the same Step 13 drift read. Do not rebase, amend, force-push, or otherwise rewrite the pushed WU branch. Continue
only when the authoritative result is `clean`.

At the zero-behind final head, retain the `clean` result's `baseOid` as the current base-freshness evidence. Resolve
authoritative lifecycle state:

```bash
arc status {name} --json
```

Require a valid result for the exact WU and cadence. Under `with-integration`, require resolver state `shipped` in
`completed`, with the archive move, applicable cohort closeout, and readiness regeneration present. Under `manual`,
require resolver state `integrating`; archive and readiness products remain post-merge. Both cadences require
Completion Notes and any applicable Release Notes. Missing, ambiguous, or wrong-cadence products stop.

Compose the current `openedChangeRequest` and fire `pre-merge` when active. Its actions must report lifecycle
readiness plus checks, conversations, requirements, and controller settlement for this exact head, then
retain `openedChangeRequest.headSha` as `{approved-head-sha}`. Any candidate mutation or review action invalidates the
checkpoint and any prospective authorization: return to the authoritative lifecycle/drift reads, reconcile if
needed, and fire the final hook again. No lifecycle- or review-authored commit or push is allowed after this stable
checkpoint and before the integration interlock.

Compose the exact candidate-tail diff from the settled implementation head through task and notes cleanup,
composition, cohort closeout, archive moves, readiness regeneration, and reconcile commits. Surface this exact diff,
not excerpts alone.

No `gh pr merge`, auto-merge enablement, or queued merge may occur before these products exist and the final
integration-interlock fires. The integration-interlock is the sole merge authority.

A post-composition failure leaves the candidate unmerged and stops with its evidence. On re-entry, resume the first
incomplete candidate-tail step; never infer readiness from later products that happen to exist.

> [!IMPORTANT]
> `integration-interlock`: Stop before merge. Surface the exact approved head, complete candidate-tail diff, PR
> status (open threads, required approvals, checks), requirements, merge method, lifecycle readiness, and the clean
> base-drift result; await explicit integration approval before merging.

If direction requests a composition correction instead of merge authorization, keep the candidate unmerged. Append
the requested composition correction — never amend or rewrite the pushed head — rerun affected gates and routing,
push through the workflow contract, rebuild lifecycle/base evidence, and refire the integration-interlock over the
new exact head.

Immediately after approval, recompose `openedChangeRequest` from the canonical current head. If its `headSha`
differs from `{approved-head-sha}`, invalidate the approval and return to the review cycle. Otherwise, re-read PR status
for that exact head. If threads, required approvals, or required checks are no longer settled, invalidate the
approval and return to the review cycle.

With PR state still settled, immediately invoke `arc base drift --json` once more and apply the same strict
validation. `unavailable`, `skipped`, malformed, or unrecognized stops; `reconcile` returns to the reconcile loop
and requires a new exact-head checkpoint plus integration approval. Only `clean` permits the merge command, with
no extension, review action, lifecycle mutation, commit, push, fetch, or human stop between this final read and
merge:

```text
result = arc base drift --json
if <result is authoritative clean>:
    gh pr merge {pr-number} --merge --match-head-commit {approved-head-sha}   # strategy per config
else:
    <stop or return to the reconcile loop per the validated verdict>
```

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
[review-triage]: ../../../methods/review-triage.md
[review-response]: ../../../methods/review-response.md
[commit-footer]: ../../../methods/commit-footer.md
[template-pull-request]: ../../../../reference/templates/arc/work-unit/template-pull-request.md
[archive-work-unit]: archive-work-unit.md
[clean]: ../supplemental/clean-work-unit.md
[session-handoff-finalize]: ../session-lifecycle/session-handoff.md#same-session-finalize-pass
[create-spec]: ../create-spec.md
[arc-config]: ../../../arc-config.yml
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
