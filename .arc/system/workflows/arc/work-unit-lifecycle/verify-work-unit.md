---
purpose: Execute the task list's verification phase — Tier 3 gates, success criteria, completion notes.
audience: agent
arc:
  methods:
    - adversarial-review
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

## Step 2 — Validate Success Criteria Against Design Artifact

Open the task list's upstream design/spec artifact, walk through its success criteria, and
compare each against actual outcomes. Then mark each criterion in the task list's Success
Criteria section (see [task-list-formatting strategy][task-list-formatting] § Success Criteria
Section for format) using the three-state model:

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

### Adversarial verify (advisory)

The boundary carries an advisory adversarial fire-point that **augments** the self-verify above, never replaces
it: a fresh pass independently re-validates the spec's success criteria against the diff. The mandate is
**verify**, not review — the pass attacks the _claim of spec-conformance_ (criteria marked met that the diff
does not deliver, gaps, wrongly-superseded items); the diff is evidence for conformance, not the target of
open-ended quality critique (that runs in the review lanes). Withhold the implementer's `[x]` / `[~]` / `[ ]`
markings from the pass; the primary compares the independent result to the self-verify.

> [!IMPORTANT]
> `adversarial-review` method — advisory fire-point (`Class`-scaled): recommend at `Novel`; surface a neutral
> offer at `Light` / `Heavy`. Offer the pass and await the call — user decides; decline proceeds normally.

```yaml
adversarial-review:
  rubric:          # the spec's success criteria, validated adversarially (stage-owned; no separate rubric method)
  artifacts:       # spec-{name}.md + tasks-{name}.md (markings withheld) + the diff under verification
  orientation:
    - AGENT-BRIEF.ARC
    - AGENT-BRIEF.PROJECT
  pass-cap:        # per Class — Light 1 / Heavy 2 / Novel 3
  prior-findings:  # pass two onward; omitted on pass one
```

## Step 3 — Pre-align Meta File for Integration Handoff

Before marking the verification task `[x]`, run `arc finalize verify` — it writes the
integration-handoff pointer `integrate-work-unit Step 1 — verify completion` to the active meta
file's `**Next Action:**` through the field model (the workflow-step-pointer convention,
[session-handoff][session-handoff] § _Workflow step pointer_). This closes the inference gap
between verification close and integrate-entry — the session-init probe relies on this prefix
to set `sessionType: integration`. Stage with the verification commit.

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
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[integrate-work-unit]: integrate-work-unit.md
[session-handoff]: ../session-lifecycle/session-handoff.md
