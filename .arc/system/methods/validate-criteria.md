---
name: validate-criteria
description: Evidence-led success-criteria validation over an explicit member or work-unit scope.
related:
  - adversarial-review
override-active: false
---

# Method: validate-criteria

> - **Workflow:** [process-task-loop.md][process-task-loop], [verify-work-unit.md][verify-work-unit]
> - **When:** A delivery member or whole work unit reaches its criteria-validation boundary.
>
> - **Signature:** `validate-criteria(scope)` → criteria report
> - **Contract:** Walk the criteria, diff, and reachable tree selected by one explicit scope; report immutable
>   criterion text, evidence, resolved state, and the span walked; then offer the same fresh-context adversarial
>   companion at either boundary. The method gathers evidence and never marks task-list criteria.

## validate-criteria.override

[No override configured]

## validate-criteria.default

The caller supplies one scope value. That value binds all three validation coordinates together:

- `criteria` — the member group or whole-work-unit criteria slice;
- `diff` — the bounded member diff or complete work-unit diff; and
- `reachability` — the cumulative tree through that member or the complete work-unit tree.

Do not widen or reconstruct one coordinate independently of the others. Read the upstream design, inspect the
bounded diff and reachable tree, and resolve each criterion against source-grounded evidence.

Use the three-state model in every report:

- `[x]` — met as planned, or met through a named deviation;
- `[~]` — intentionally superseded, deferred, or made irrelevant by a recorded design decision; and
- `[ ]` — not met; a genuine gap remains.

Criterion text is immutable. Report the original text and attach evidence or disposition; never rewrite the
criterion to agree with the implementation.

Return one entry per criterion in the selected slice:

```yaml
criteria:
  - text:        # immutable criterion text
    evidence:    # source-grounded implementation and verification evidence
    state:       # "[x]" | "[~]" | "[ ]"
    span:        # the criteria slice, bounded diff, and reachability span walked
summary:         # count by state and any unresolved gap
```

At member scope, record the report as ordinary closing-task evidence without changing the task list's criterion
checkboxes. At work-unit scope, the terminal verification workflow owns marking after it consumes the report.

### Adversarial companion

After the primary walk, offer one fresh-context pass over the same selected scope. Use the work unit's
`Class`-scaled posture at both member and work-unit scope: recommend at `Novel`; make a neutral offer at `Light` or
`Heavy`. Withhold the primary report and all task-list criterion markings from the fresh pass. The primary compares
the returned report with its own walk and retains judgment over every finding.

> [!IMPORTANT]
> `adversarial-review` method — advisory fire-point (`Class`-scaled): recommend at `Novel`; surface a neutral
> offer at `Light` / `Heavy`. Offer the pass and await the call — user decides; decline proceeds normally.

```yaml
adversarial-review:
  rubric:          # the selected success-criteria slice, validated adversarially
  artifacts:       # upstream design + task list with markings withheld + the selected diff and reachable tree
  orientation:
    - AGENT-BRIEF.ARC
    - AGENT-BRIEF.PROJECT
  pass-cap:        # per Class — Light 1 / Heavy 2 / Novel 3
  prior-findings:  # pass two onward; omitted on pass one
```

---

[process-task-loop]: ../workflows/arc/process-task-loop.md
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
