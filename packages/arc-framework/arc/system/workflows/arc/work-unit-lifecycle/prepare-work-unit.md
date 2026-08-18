---
purpose: Prepare a verified Candidate for publication through private review, convergence, and the publication transition.
audience: agent
arc:
  methods:
    - self-review
    - frontline-review
    - standard-review
    - review-chunking
    - review-triage
    - review-response
    - commit-footer
    - quality-gate-commands
---

# Workflow: Prepare Work Unit for Publication

Prepare a verified Candidate for public integration. Verification remains the final execution task; this workflow
starts from its durable Candidate attestation, settles private review and convergence, then schedules publication.

**When to use:** All tasks in `tasks-{name}.md` are marked `[x]`, `active/meta-{name}.md` shows
`**State:** Active`, and the typed integration boundary projects a Candidate locus.

> [!NOTE]
> **No Candidate?** Finish [`verify-work-unit.md`](verify-work-unit.md), including `arc attest`. **Already
> Integrating?** Publication already began; load [`integrate-work-unit.md`](integrate-work-unit.md).

---

## 1) Resolve the Candidate preparation locus

Invoke `arc status {name} --json` and require the Candidate-bearing Active boundary. Session initialization and
recovery project this state as `sessionType: prepublication` with `workflow: prepare-work-unit`; never infer it from
`Current Workflow`, `Next Action`, or SESSION-NOTES.

Re-enter every review operation only through the public typed protocol in Step 2. Retain any returned operation ID
and follow its last `state` / `nextAction`: resume local work with `arc review local resume -`, and re-invoke the
owning idempotent verb for frontline, response, reduction, or pre-publication composition. When no public action can
advance, leave the Candidate in `Active` and state the exact source change or direction required for re-entry.

## 2) Settle pre-publication review

If the [`self-review` method][self-review] is effectively active, execute it against the local aggregate diff vs
the base branch. Classify findings per [`review-triage`][review-triage] and commit fixes per
[`commit-footer`][commit-footer]. When inactive, continue with the typed procedure.

From the local Candidate branch, compose the change-set routing facts — content kind, risk, determinacy,
ownership, and surface authority — as the author judgment the repository cannot read. The lane routing target, the
routed `standardReview` projection, the work unit's `Class`, and each lane's effective method activity are composed
from repository state by the command below; never assemble or restate them here.

Invoke `arc review pre-publication <wu> --json`, carrying the routing facts as `--change-set`, each lane's scope
mode, the frontline lane's one-run invocation override, and any approved ceiling override as `--lanes`, and a
completed author self-review as `--self-review settled`. A user-directed skip of an enabled frontline lane is
`lanes.frontline.invocation: { mode: "skip" }`; it cannot suppress the standard lane. Re-invoke after every lane
operation with the same `--change-set`, `--lanes`, and `--self-review` values verbatim: the command composes durable
progress, but those values are author judgment it cannot recover.

The envelope's `target` is the exact target every exact-target operation below binds against. A null `target`
means the checkout could not compose one; resolve the returned advisory before invoking any operation. The lane
`target` inside `policy` routes lanes and does not identify a review.

Before invoking or rendering review attention for each new target, read the latest planning decision prose for the
selected `assess-boundary-fit` outcome and its evidence basis. A recorded `stays one WU` decision stays silent while
evidence is semantically unchanged; invocation, elapsed time, and restatement are not material deltas. Otherwise
invoke `arc review chunking resolve -` with the envelope's `target` and any exact-target `scopeSelection`, then
dispatch only on its typed state/action pair:

- `disabled / none`, `below-threshold / continue-review`, `scope-selected / continue-review`, or
  `evidence-unavailable / continue-review` — continue without attention text.
- `consider-chunks / select-review-scope` — render `recommendedActionText` verbatim, then apply
  [`review-chunking`][review-chunking].
- `delivery-bound / continue-review` — render `recommendedActionText` verbatim and use the bound delivery plan;
  never also offer chunked review.

Select whole-target or chunked scope separately for frontline and standard review. Carry a selection by
re-invoking the procedure with it in `--lanes`; never recompute thresholds in prose.

A null `policy` means no lane operation is open — follow the envelope's `nextAction.kind`, one of
`run-self-review`, `run-convergence-verification`, or `publish-candidate`. Otherwise follow only the `policy`
state/action pair:

- `skipped | no-op | pass-complete / none` — lane complete.
- `awaiting-change-request / open-change-request` — retain the hosted-first reservation and complete at
  `candidate-publish-ready`.
- `ready / run-frontline` — invoke `arc review frontline resolve -`, then `arc review frontline run -`.
- `ready / local-prepare` — invoke `arc review local prepare -`.
- `findings / respond` — enter the disposition protocol below.
- `approval-required / obtain-ceiling-override` — surface the exact consequence and `Approve (or redirect)?`.
- `chunk-pending / continue-chunks` — continue the selected local chunk series.
- `stale-target / select-scope` — rerun chunking against the current target.
- `blocked | unavailable | invalid-override / stop` — surface diagnostics and stop.

Dispatch local operations only through public typed actions. The evaluator submits status, result, findings, and
run identity to `arc review local attest -`; runtime-owned bindings come from the immutable operation. Resume with
`arc review local resume -`, reduce with `arc review reduce -`, and submit approved dispositions with
`arc review respond -`. A command error envelope carries no dispatchable state.

For every finding, run [`review-triage`][review-triage] and [`review-response`][review-response]. Present one
unqualified severity when the reviewer and ARC grades agree, label both only when they differ, and include the source
locus plus a discrete `Recommended disposition:` line. Approval of the complete unchanged surfaced set is required
before any mutation or commitment; the approver need not repeat its canonical digest. Approved fixes run Tier 1
gates ([`quality-gate-commands`][arc-methods-qg]), commit
atomically, and produce a new target. Disclose review applicability from the exact delta: `targeted` for confidently
narrow non-interacting record or lifecycle changes, `focused` for a bounded interaction, and `full` for behavioral,
authority, contract, materially interacting, or uncertain changes. Clearance never carries.

Proceed only from `candidate-publish-ready`; its durable boundary carries any hosted-first reservation into
publication without classifying it as settled or no-op.

## 3) Schedule publication

```bash
arc publish {name} --json
```

The verb reads `Next Action` from the boundary it writes and `Last Completed` from the last `[x]` task. Supply
`--last-completed "{work}"` or `--action "{pointer}"` only when that read refuses or is wrong.

The executor fires `Active → Integrating`, writes the composed orientation, regenerates ROADMAP, and stages the
publication boundary with any reservation. An advisory-only reconcile stops before transition; edit and rerun, or
obtain explicit direction to retain all advisories and use `--allow-advisories`. Confirm ROADMAP changed only for
the state flip.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): publish {name}

- Flip State: Active → Integrating

Context: meta-{name}.md (integration)
```

After the transition commit, load [`integrate-work-unit.md`](integrate-work-unit.md). Its Step 1 owns the first
push and change-request creation; do not push from this workflow.

---

## Related workflows

- [`verify-work-unit.md`](verify-work-unit.md) — preceding execution close; attests the Candidate.
- [`integrate-work-unit.md`](integrate-work-unit.md) — begins after `arc publish` at `State: Integrating`.
- [`reopen-work-unit.md`](reopen-work-unit.md) — withdraws public integration back to `Active`.

---

[self-review]: ../../../methods/self-review.md
[review-chunking]: ../../../methods/review-chunking.md
[review-triage]: ../../../methods/review-triage.md
[review-response]: ../../../methods/review-response.md
[commit-footer]: ../../../methods/commit-footer.md
[arc-methods-qg]: ../../../methods/quality-gate-commands.md
