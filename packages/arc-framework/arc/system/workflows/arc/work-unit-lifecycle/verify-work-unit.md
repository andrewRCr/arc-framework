---
purpose: Execute the task list's verification phase — Tier 3 gates, success criteria, completion notes.
audience: agent
---

# Workflow: Verify Completion

Every task list ends with a verification phase containing a single task that points here.
The task description is intentionally thin — this workflow is the authoritative protocol.
Complete all three steps below, then mark the single verification task `[x]` with completion
notes covering what was verified (see [Completion Notes](#completion-notes)).

**Relationship to integrate-work-unit:** This is the implementer's validation pass. The
[integrate-work-unit workflow][integrate-work-unit] performs a second confirmation during
integration — a lightweight check that works whether the same person or a different team
member integrates.

## Step 1 — Tier 3 Quality Gates

Run the full quality gate suite as defined by the project's
[Quality Gates Strategy][quality-gates]. Even when incremental checks have been clean throughout
implementation, the full-suite run serves as attestation that everything passes as a whole.

## Step 2 — Validate Success Criteria Against PRD

Open the PRD, walk through its success criteria, and compare each against actual outcomes.
Then mark each criterion in the task list's Success Criteria section (see
[task-list-formatting strategy][task-list-formatting] § Success Criteria Section for format)
using the three-state model:

- `[x]` — **Met.** Criterion satisfied as planned, or addressed differently (add a
  **Deviation** note).
- `[~]` — **Superseded.** Intentionally dropped, deferred, or made irrelevant by a design
  decision during implementation (add a **Superseded** note).
- `[ ]` — **Not met.** A genuine gap that needs discussion before the work is complete.

**Criterion text is immutable.** Never rewrite a criterion to match what was built. The
original text preserves intent; annotations capture reality.

**Key convention:** Success criteria are only marked during this verification phase, not
during implementation. Implementation tasks get checked as work progresses; success criteria
get checked when the implementer steps back and validates outcomes against the PRD.

## Step 3 — Verify All Atomic Tasks Resolved

Review the atomic companion file (`atomic-{name}.md`). Every item must have a final
disposition — none should remain `[ ]`:

- `[x]` — **Completed.** Work done, completion note present.
- `[~]` — **Deferred.** Intentionally deferred with a note explaining where it goes next
  (backlog item, future work unit, etc.).

**Check for:**

- No `[ ]` items remaining — all atomic tasks either completed or consciously deferred
- Completion notes present on `[x]` items (what was done, where)
- Deferred items (`[~]`) have a forward pointer (where the work will be picked up)

If unresolved atomic tasks are found, address them before considering verification complete.
If the companion file is empty (no checkbox items), it will be deleted during integration —
no action needed.

## Step 4 — Pre-align Status File for Integration Handoff

Before marking the verification task `[x]`, update the active status file's `**Next Action:**`
to `integrate-work-unit Step 1 — verify completion` per the workflow-step-pointer convention
([session-handoff][session-handoff] § _Workflow step pointer_). This closes the inference gap
between verification close and integrate-entry — the session-init probe relies on this prefix
to set `sessionType: integration`. Stage with the verification commit.

## Completion Notes

When marking the verification task `[x]`, include completion notes that make the task
self-documenting — a reader of the archived task list should understand what was verified
without loading this workflow. The verification task uses three italic descriptor bullets in
lieu of the single `_Outcome:_` rule (per
[strategy-task-list-formatting § Goal/Note Lines][task-list-formatting] —
verification-task exception). Cover all three steps:

- _Quality gates:_ what ran and the outcome (e.g., "md lint, code lint, typecheck,
  42 tests, build — all passed")
- _Success criteria:_ summary disposition (e.g., "8 criteria: 7 met, 1 superseded
  with annotation")
- _Atomic tasks:_ disposition (e.g., "companion file empty" or "3 completed, 1 deferred
  to backlog")

---

[quality-gates]: ../../../../reference/strategies/arc/strategy-quality-gates.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[integrate-work-unit]: integrate-work-unit.md
[session-handoff]: ../session-lifecycle/session-handoff.md
