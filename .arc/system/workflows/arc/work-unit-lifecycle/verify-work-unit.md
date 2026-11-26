---
purpose: Execute the task list's verification phase — merge quality gate, success criteria, verification record.
audience: agent
arc:
  methods:
    - code-review
    - verification-review
    - commit-footer
    - review-chunking
    - route-discovered-work
---

# Workflow: Verify Completion

Every task list ends with a verification phase containing a single task that points here. Delivery-member closing
tasks fire criteria validation as member-scope verification tasks without loading this workflow. They remain distinct
from the sole terminal work-unit verification task. The terminal task description is intentionally thin — this
workflow is the authoritative protocol. Complete the first two steps below, then Step 3, which writes the single
verification task's [verification record](#verification-record), closes the task, and attests the Candidate.

**Relationship to preparation and integration:** This is the implementer's validation pass and the final execution
task. Candidate attestation hands off to [prepare-work-unit][prepare-work-unit] for private review and convergence;
[integrate-work-unit][integrate-work-unit] begins only after `arc publish` starts public integration.

## Step 1 — Clean, Self-Review, and Run the Merge Quality Gate

Run `arc inbox personal --target {name} --json` for every capture that still names this work unit, including held
captures, and `arc inbox {name} --json` for its inbound list. A successful personal listing must report `clear`. A
successful inbound listing must report `listed` and `pending.count` is zero. On a failed or refused listing, surface the
diagnostic and apply its reported remedy. If the remedy completes the listing, use its result to establish whether
entries remain. Otherwise rerun the listing after repair. Require both checks to confirm no entries remain before
cleanup. Route named captures and pending inbound entries through the Owner's pass below, then recheck both lists.

**Method fire-point** · [`route-discovered-work`][route-discovered-work]:

```yaml
route-discovered-work:
  entry: each inbound entry, and each listed capture
  door: owner's planning pass
  host: this work unit
```

On confirmation, carry out each outcome; no outcome holds the capture in this work unit. A `fold` enters
[`amend-design`][amend-design] over the capture, and any work it adds returns to the task loop before verification
resumes. Remove each routed capture with `arc user inbox-remove --id <id> --expected-version <version>`, taking both
from its listed row, or rewrite it in place when its outcome is itself a capture. Record each rejection or dismissal,
with its reason, in the verification record's `_Captures:_` category. Then recheck both lists as above.

Before the Candidate exists, clean the WU content:

- If `notes-{name}.md` exists, it stays with the work unit through its archive: follow [`clean-work-unit.md`][clean]
  `§ Notes File Consolidation` unless it is already reference-ready.
- Apply [`clean-work-unit.md`][clean] `§ Task List Temporal-Noise Pass` when the task list carries temporal markers,
  ad-hoc inline status, or accumulated scratchpad content.

Run [code-review's author check][code-author-check] over the aggregate diff before the merge gate below.
Its approved fixes must land before this verification's evidence is gathered.

When the task list carries a Delivery Plan, inspect every member-close scale-attention result before the terminal
merge quality gate. Each completed member must record the resolver's exact target, state, and disposition, plus metrics
when the resolver supplies them. A `disabled / none` result is complete without metrics because its typed envelope
carries none. A `consider-chunks / select-review-scope` result is resolved only by a selected bounded-review route or an
explicit capable whole-target choice under the [`review-chunking` method][review-chunking]. Missing evidence, an
unresolved attention result, or an unbound member re-cut stops and returns to the delivery-member boundary in
[`process-task-loop.md`][process-task-loop]. Member-close evidence covers its completed span only; it never replaces the
exact post-materialization recheck.

Request `arc check gate merge --force` before the final local attestation.

## Step 2 — Validate Success Criteria at Work-Unit Scope

Before the criteria walk or its first independent reviewer, invoke `arc review changeset resolve -` over the complete
work-unit diff, including local edits, using `validate-criteria` § Verification subject for its exact coordinates.
This also applies without a Delivery Plan. Dispatch on the resolver's typed state/action pair:

- `disabled / none`, `below-threshold / continue-review`, or `scope-selected / continue-review` — continue.
- `consider-chunks / select-review-scope` — render `recommendedActionText`, then apply
  [`review-chunking`][review-chunking]. Select bounded scopes or an explicit capable whole-target route before launch.
  Keep the selected criteria and verification rubric unchanged.
- `delivery-bound / continue-review` — use the bound member scopes as seeds, assess the selected member or seam's
  attention burden under `review-chunking`, and resolve any uncovered verification scope before launch.
- `evidence-unavailable / continue-review`, command failure, or an unsupported result — preserve the diagnostic and
  resolve the missing measurement or scope evidence before launch; never treat it as below threshold.

Retain the returned target, state, metrics when supplied, and scope disposition with the criteria report. Reuse an
unchanged exact-subject result. This check creates no review evidence and leaves the independent companion's offer
intact; the committed member-close and post-materialization checks retain their own boundaries.

Inspect the task list for a Delivery Plan, then run the criteria walk at work-unit scope with exactly one of these
criteria shapes.

Without a Delivery Plan:

```yaml
verification-review:
  scope:
    kind: work-unit
    criteria: task list's complete flat Success Criteria section
    diff: complete work-unit diff
    reachability: complete work-unit tree
```

With a Delivery Plan:

```yaml
verification-review:
  scope:
    kind: work-unit
    criteria:
      member-groups: recorded delivery-member criteria reports
      seams: task list's Cross-member seams group
    diff: complete work-unit diff
    reachability: complete work-unit tree
```

Run [verification-review][verification-review] over the selected scope, including its [author criteria
walk][verification-walk] and [independent companion][verification-companion].

Consume the resulting report, then mark each criterion in the task list's Success Criteria section (see
[task-list-formatting strategy][task-list-formatting] § Success Criteria Section for format) using the three-state
model:

- `[x]` — **Met.** Criterion satisfied as planned, or addressed differently (add a
  **Deviation** note).
- `[~]` — **Superseded.** Intentionally dropped, deferred, or made irrelevant by a design
  decision during implementation (add a **Superseded** note).
- `[ ]` — **Not met.** A genuine gap that needs discussion before the work is complete.

If the combined report contains any `[ ]` criterion, stop. Leave the terminal work-unit verification task
incomplete and do not enter Step 3 until the gap is fixed, deliberately superseded (including an approved
deferral), or otherwise resolved; then rerun the criteria walk against the current work-unit subject.

Enter [`amend-design`][amend-design] over the gap at that stop; its [entry gate][amend-design-gate] decides what
the gap changes, and the corrective work takes a revision parent of its own rather than being patched in here. The
rerun above is what closes it.

**Criterion text is immutable.** Never rewrite a criterion to match what was built. The
original text preserves intent; annotations capture reality.

**Key convention:** Success criteria are only marked during this verification phase, not
during implementation. Implementation tasks get checked as work progresses; success criteria
get checked when the implementer validates the scoped criteria against implementation evidence.

Before closing the criteria pass, verify delivery integrity:

- At least one executable check fails when the composed system misses the work unit's top-level intent. If proof
  is possible only after deployment, record the forcing event and owning follow-on work unit explicitly.
- Present-tense architecture and completion claims distinguish implemented behavior from behavior proven live.
- Every deferred part of original intent has a correctly classified, sufficiently specified owner; essential
  unproven intent never rests on an assumed Errand or an unowned note.

## Step 3 — Attest the Candidate

Complete the verification task's success-criteria marks and its verification record, run `arc check increment`, and
save them with `arc save`.

> [!IMPORTANT]
> `task-interlock`: Stop after saving the checked verification record. Present the verification report and use
> the [task loop's structured completion prompt][process-task-loop] with `to prepare-work-unit` as the target.
> Await Owner approval before closing the task.

After approval, run `arc task close <id> --state-only` when verification left no tracked change. When verification
changed tracked files, follow the task loop's configured closing-commit route (`arc release commit --close`,
`taskCommit`).

After task closure succeeds, run `arc attest {name} --json`. It attests the staged subject as a Candidate, leaves
lifecycle `State` unchanged, and returns the typed pre-publication locus. It requires the canonical task list to
be readable, structurally valid, and closed with `no-open-task`. An open, missing, unbound, unreadable, or malformed
task list refuses before Candidate authority is written. It also refuses while verified reviewable content is absent
from the staged subject, naming what is missing. A repeated invocation over the same subject is a no-op.

After successful attestation, check for a staged change to the review copy when spec tracking is enabled, even when
`designExport` is absent. Use its reported path when present or the exact spec export path shown below.

```bash
git diff --cached --name-only HEAD -- .arc/specs/{name}/spec-{name}.md
```

Require a successful diff. If it lists the copy, commit only that path. If the index matches HEAD for the copy,
continue directly to Candidate preparation.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): export the review copy of spec-{name}

Context: meta-{name}.md (prepublication)
```

Dispatch only on the typed result. `attested` and `unchanged` complete the review-copy check above before Candidate
preparation. At this closeout point, `blocked / establish-new-root` follows freshly completed Steps 1 and 2 plus
structural task-list closure. For that result, execute its exact `continuation.argv`, then require
`attested / re-root` and complete the same review-copy check. A missing or malformed continuation, any other action
or result, or a blocked result reached without fresh full verification stops. Use only the supplied re-root command.

This Step 3 invocation is the initial Candidate attestation or an explicitly requested new root. A later convergence
attestation belongs to `prepare-work-unit`.

## Verification Record

Before closing the verification task, write a verification record that makes the task self-documenting — a reader
of the archived task list should understand what was verified without loading this workflow. The verification task
uses italic descriptor bullets in lieu of the single `_Outcome:_` rule (per
[strategy-task-list-formatting § Goal/Note Lines][task-list-formatting] — verification-task exception). Cover both of
the first two, and the third when Step 1 rejected or dismissed a capture:

- _Quality gates:_ what ran and the outcome (e.g., "md lint, code lint, typecheck,
  42 tests, build — all passed")
- _Success criteria:_ summary disposition (e.g., "8 criteria: 7 met, 1 superseded
  with annotation")
- _Captures:_ each capture Step 1 rejected or dismissed, with its reason

---

[verification-review]: ../../../methods/verification-review.md
[verification-walk]: ../../../methods/verification-review.md#author-criteria-walk
[verification-companion]: ../../../methods/verification-review.md#independent-companion
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[clean]: ../supplemental/clean-work-unit.md
[review-chunking]: ../../../methods/review-chunking.md
[route-discovered-work]: ../../../methods/route-discovered-work.md
[prepare-work-unit]: prepare-work-unit.md
[integrate-work-unit]: integrate-work-unit.md
[amend-design]: ../supplemental/amend-design.md
[amend-design-gate]: ../supplemental/amend-design.md#entry-gate
[process-task-loop]: ../process-task-loop.md

[code-author-check]: ../../../methods/code-review.md#author-check
