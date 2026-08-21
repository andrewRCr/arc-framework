---
purpose: Execute the task list's verification phase — Tier 3 gates, success criteria, completion notes.
audience: agent
arc:
  methods:
    - validate-criteria
    - self-review
    - review-triage
    - commit-footer
    - quality-gate-commands
---

# Workflow: Verify Completion

Every task list ends with a verification phase containing a single task that points here. Delivery-member closing
tasks may fire criteria validation at member scope without becoming additional verification tasks or loading this
workflow. The terminal task description is intentionally thin — this workflow is the authoritative protocol.
Complete the first two steps below, mark the single verification task `[x]` with completion notes covering what
was verified (see [Completion Notes](#completion-notes)), stage every verified reviewable edit, then complete Step 3.

**Relationship to preparation and integration:** This is the implementer's validation pass and the final execution
task. Candidate attestation hands off to [prepare-work-unit][prepare-work-unit] for private review and convergence;
[integrate-work-unit][integrate-work-unit] begins only after `arc publish` starts public integration.

## Step 1 — Clean, Self-Review, and Run Tier 3 Quality Gates

Before the Candidate exists, clean the WU content:

- If `notes-{name}.md` exists, follow [`clean-work-unit.md`][clean] `§ Notes File Consolidation`: keep it only when
  already reference-ready, or delete it and remove task-file references.
- Apply [`clean-work-unit.md`][clean] `§ Task List Temporal-Noise Pass` when the task list carries temporal markers,
  ad-hoc inline status, or accumulated scratchpad content.

If the [`self-review` method][self-review] is effectively active, execute it against the local aggregate diff vs
the base branch. Classify findings per [`review-triage`][review-triage], obtain approval for the complete disposition
set, and commit approved fixes per [`commit-footer`][commit-footer] before continuing.

Run the full quality gate suite as defined by the project's [Quality Gates Strategy][quality-gates], using the
[quality-gate-commands method][arc-methods-qg] for the commands themselves. Even when incremental checks have been
clean throughout implementation, the full-suite run serves as attestation that everything passes as a whole.

## Step 2 — Validate Success Criteria Against Design Artifact

Run the criteria walk at work-unit scope:

```yaml
validate-criteria:
  scope:
    kind: work-unit
    criteria: task list's complete Success Criteria section
    diff: complete work-unit diff
    reachability: complete work-unit tree
```

Consume the report, then mark each criterion in the task list's Success Criteria section (see
[task-list-formatting strategy][task-list-formatting] § Success Criteria Section for format) using the three-state
model:

- `[x]` — **Met.** Criterion satisfied as planned, or addressed differently (add a
  **Deviation** note).
- `[~]` — **Superseded.** Intentionally dropped, deferred, or made irrelevant by a design
  decision during implementation (add a **Superseded** note).
- `[ ]` — **Not met.** A genuine gap that needs discussion before the work is complete.

**Criterion text is immutable.** Never rewrite a criterion to match what was built. The
original text preserves intent; annotations capture reality.

**Key convention:** Success criteria are only marked during this verification phase, not
during implementation. Implementation tasks get checked as work progresses; success criteria
get checked when the implementer steps back and validates outcomes against the upstream design
artifact.

Before closing the criteria pass, verify delivery integrity:

- At least one executable check fails when the composed system misses the work unit's top-level intent. If proof
  is possible only after deployment, record the forcing event and owning follow-on work unit explicitly.
- Present-tense architecture and completion claims distinguish implemented behavior from behavior proven live.
- Every deferred part of original intent has a correctly classified, sufficiently specified owner; essential
  unproven intent never rests on an assumed Errand or an unowned note.

## Step 3 — Attest the Candidate

Complete the verification task's success-criteria and completion-note edits, then run `arc attest {name} --json`. It
attests the staged subject as a Candidate, leaves lifecycle `State` unchanged, and returns the typed pre-publication
locus. It refuses while verified reviewable content is absent from that staged subject, naming what is missing. The
managed record and meta projection it writes are staged with it, so they ride the verification commit. A repeated
invocation over the same subject is a no-op.

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

[quality-gates]: ../../../../reference/strategies/arc/strategy-quality-gates.md
[arc-methods-qg]: ../../../methods/quality-gate-commands.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[clean]: ../supplemental/clean-work-unit.md
[self-review]: ../../../methods/self-review.md
[review-triage]: ../../../methods/review-triage.md
[commit-footer]: ../../../methods/commit-footer.md
[prepare-work-unit]: prepare-work-unit.md
[integrate-work-unit]: integrate-work-unit.md
