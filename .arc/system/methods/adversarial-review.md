---
name: adversarial-review
description: Fresh-context adversarial review mechanism for planning and verification fire-points.
override-active: false
---

# Method: adversarial-review

> - **Workflow:** [draft-design.md][draft-design], [create-spec.md][create-spec],
>   [generate-tasks.md][generate-tasks], [verify-work-unit.md][verify-work-unit]
> - **When:** A stage boundary runs its readiness, finalization, task-generation, or work-unit verification gate
>   and has a supplied rubric to attack.
>
> - **Contract:** Given a supplied rubric and stage artifacts, run that rubric adversarially with fresh context,
>   primary-held judgment, and convergence-oriented follow-up. Findings are advisory until the primary verifies
>   them against source; the method never creates a hard stage gate by itself.

## adversarial-review.override

[No override configured]

## adversarial-review.default

Adversarial review is the mechanism that runs a supplied rubric from outside the primary's working context. It is
not itself a rubric: each fire-point supplies the artifact-specific questions, artifacts, and interpretation.

The properties below are the method's identity contract. An override that drops one of them is no longer
adversarial review, even though the current method model states that contract as advisory rather than
tool-enforced.

**Fresh context per pass.** Each pass is performed from fresh context so the reviewer is not carrying the
primary's assumptions, attempted fixes, or preferred reading. The harness-conditional posture and unavailable-
subagent degrade path live once in [DEV-RULES.ARC § Sub-agent scope][sub-agent-scope]; callers reference that
locus rather than restating it.

**Adversarial stance.** The reviewer tries to break the artifact against the supplied rubric. It must not invent
findings to satisfy the assignment: if the artifact holds up, the report says that plainly and specifically.

**Primary holds judgment.** Every returned finding is `PLAUSIBLE` until the primary verifies it against source.
The primary owns validation, disposition, gate decisions, and any edits that land from the pass; findings are
never applied blindly.

**Loop to convergence.** The primary may run additional fresh passes after addressing confirmed findings. Later
passes attack the settled artifact and the prior fixes, not only the original report, so the loop can catch
regressions or second-order breaks before the stage closes.

**Advisory and `Class`-scaled.** Launching the mechanism is an accept-or-decline recommendation whose posture
scales with the work unit's `Class`. It informs the stage interlock; it does not replace the interlock or make the
stage impossible to approve.

---

[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[generate-tasks]: ../workflows/arc/generate-tasks.md
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
[sub-agent-scope]: ../rules/DEV-RULES.ARC.md#sub-agent-scope
