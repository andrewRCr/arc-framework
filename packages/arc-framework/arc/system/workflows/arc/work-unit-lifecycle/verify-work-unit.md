---
purpose: Execute the task list's verification phase — merge quality gate, success criteria, completion notes.
audience: agent
arc:
  methods:
    - validate-criteria
    - self-review
    - review-triage
    - commit-footer
    - review-chunking
---

# Workflow: Verify Completion

Every task list ends with a verification phase containing a single task that points here. Delivery-member closing
tasks fire criteria validation as member-scope verification tasks without loading this workflow. They remain distinct
from the sole terminal work-unit verification task. The terminal task description is intentionally thin — this
workflow is the authoritative protocol.
Complete the first two steps below, mark the single verification task `[x]` with completion notes covering what
was verified (see [Completion Notes](#completion-notes)), stage every verified reviewable edit, then complete Step 3.

**Relationship to preparation and integration:** This is the implementer's validation pass and the final execution
task. Candidate attestation hands off to [prepare-work-unit][prepare-work-unit] for private review and convergence;
[integrate-work-unit][integrate-work-unit] begins only after `arc publish` starts public integration.

## Step 1 — Clean, Self-Review, and Run the Merge Quality Gate

Before the Candidate exists, clean the WU content:

- If `notes-{name}.md` exists, follow [`clean-work-unit.md`][clean] `§ Notes File Consolidation`: keep it only when
  already reference-ready, or delete it and remove task-file references.
- Apply [`clean-work-unit.md`][clean] `§ Task List Temporal-Noise Pass` when the task list carries temporal markers,
  ad-hoc inline status, or accumulated scratchpad content.

If the [`self-review` method][self-review] is effectively active, execute it against the local aggregate diff vs
the base branch. Classify findings per [`review-triage`][review-triage], present the standalone non-producer report,
obtain approval for the complete disposition set, and commit approved fixes per [`commit-footer`][commit-footer]
before continuing. Do not invoke the producer-backed response command or fabricate producer evidence.

When the task list carries a Delivery Plan, inspect every member-close scale-attention result before the terminal
merge quality gate.
Each completed member must record the resolver's exact target, state, and disposition, plus metrics when the resolver
supplies them. A `disabled / none` result is complete without metrics because its typed envelope carries none. A
`consider-chunks / select-review-scope` result is resolved only by a selected bounded-review route or an explicit
capable whole-target choice under the [`review-chunking` method][review-chunking]. Missing evidence, an unresolved
attention result, or an unbound member re-cut stops and returns to the delivery-member boundary in
[`process-task-loop.md`][process-task-loop]. Member-close evidence covers its completed span only; it never replaces
the exact post-materialization recheck.

Request `arc check gate merge --force` before the final local attestation.

## Step 2 — Validate Success Criteria at Work-Unit Scope

Inspect the task list for a Delivery Plan, then run the criteria walk at work-unit scope with exactly one of these
criteria shapes.

Without a Delivery Plan:

```yaml
validate-criteria:
  scope:
    kind: work-unit
    criteria: task list's complete flat Success Criteria section
    diff: complete work-unit diff
    reachability: complete work-unit tree
```

With a Delivery Plan:

```yaml
validate-criteria:
  scope:
    kind: work-unit
    criteria:
      member-groups: recorded delivery-member criteria reports
      seams: task list's Cross-member seams group
    diff: complete work-unit diff
    reachability: complete work-unit tree
```

Without a Delivery Plan, open the upstream design/spec artifact and compare every flat criterion against actual
outcomes in the complete diff and tree. With a Delivery Plan, the method dispositions member groups from their
recorded reports and walks only the seam group and union coherence against the complete tree.

**Method fire-point** · [`adversarial-review`][adversarial-review], declared by `validate-criteria`: After the
primary walk for either criteria shape, load its adversarial companion.

> [!IMPORTANT]
> `adversarial-review` method — advisory fire-point (`Class`-scaled): recommend at `Novel`; offer neutrally at
> `Light` / `Heavy`. Offer the pass and await the call — user decides; decline keeps the primary report.
>
> ```yaml
> adversarial-review:
>   rubric:          # selected work-unit Success Criteria slice
>   artifacts:       # upstream design + task list with markings withheld + complete diff and reachable tree
>   orientation:
>     - AGENT-BRIEF.ARC
>     - AGENT-BRIEF.PROJECT
>   pass-cap:        # per Class — Light 1 / Heavy 2 / Novel 3
>   prior-findings:  # pass two onward; omitted on pass one
> ```

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

Complete the verification task's success-criteria and completion-note edits, then run `arc attest {name} --json`. It
attests the staged subject as a Candidate, leaves lifecycle `State` unchanged, and returns the typed pre-publication
locus. It requires the canonical task list to be readable, structurally valid, and closed with `no-open-task`; an
open, missing, unbound, unreadable, or malformed task list refuses before Candidate authority is written. It also
refuses while verified reviewable content is absent from the staged subject, naming what is missing. The managed
record and meta projection it writes are staged with it, so they ride the verification commit. A repeated invocation
over the same subject is a no-op.

Dispatch only on the typed result. `attested` and `unchanged` continue to Candidate preparation. At this exact
closeout point, `blocked / establish-new-root` follows freshly completed Steps 1 and 2 plus structural task-list
closure: execute its exact `continuation.argv`, then require `attested / re-root` before continuing. A missing or
malformed continuation, any other action or result, or a blocked result reached without fresh full verification
stops; never infer or reconstruct a re-root command from prose.

This Step 3 invocation is the initial Candidate attestation or an explicitly requested new root. A later convergence
attestation belongs to `prepare-work-unit`; it keeps its projections staged and creates no second verification commit
boundary.

## Completion Notes

When marking the verification task `[x]`, include completion notes that make the task
self-documenting — a reader of the archived task list should understand what was verified
without loading this workflow. The verification task uses two italic descriptor bullets in
lieu of the single `_Outcome:_` rule (per
[strategy-task-list-formatting § Goal/Note Lines][task-list-formatting] —
verification-task exception). Cover both:

- _Quality gates:_ what ran and the outcome (e.g., "md lint, code lint, typecheck,
  42 tests, build — all passed")
- _Success criteria:_ summary disposition (e.g., "8 criteria: 7 met, 1 superseded
  with annotation")

---

[adversarial-review]: ../../../methods/adversarial-review.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[clean]: ../supplemental/clean-work-unit.md
[self-review]: ../../../methods/self-review.md
[review-triage]: ../../../methods/review-triage.md
[commit-footer]: ../../../methods/commit-footer.md
[review-chunking]: ../../../methods/review-chunking.md
[prepare-work-unit]: prepare-work-unit.md
[integrate-work-unit]: integrate-work-unit.md
[amend-design]: ../supplemental/amend-design.md
[amend-design-gate]: ../supplemental/amend-design.md#entry-gate
[process-task-loop]: ../process-task-loop.md
