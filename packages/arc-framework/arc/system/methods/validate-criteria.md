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

- `criteria` — the member group at member scope, or recorded delivery-member reports plus the seam group at
  work-unit scope;
- `diff` — the bounded member diff or complete work-unit diff; and
- `reachability` — the cumulative tree through that member or the complete work-unit tree.

Do not widen or reconstruct one coordinate independently of the others. At member scope, read the upstream design,
inspect the bounded diff and reachable tree, and resolve each criterion in the selected member group against
source-grounded evidence.

At work-unit scope, disposition each member group from its recorded boundary report; do not re-derive member
criteria from the complete work-unit diff. Require one report whose span matches each planned member, carry its
criterion text, evidence, and state forward, then use the complete diff and reachable tree to detect regressions
across group boundaries and walk the seam group and union coherence. A missing or mismatched member report is an
unresolved `[ ]`, not permission to reopen that member's bounded walk.

Use the three-state model in every report:

- `[x]` — met as planned, or met through a named deviation;
- `[~]` — intentionally superseded, deferred, or made irrelevant by a recorded design decision; and
- `[ ]` — not met; a genuine gap remains.

Criterion text is immutable. Report the original text and attach evidence or disposition; never rewrite the
criterion to agree with the implementation.

Return one entry per criterion in the selected scope. At work-unit scope, member entries carry their recorded
boundary evidence plus any union-level regression disposition; seam entries carry evidence from the terminal walk:

```yaml
criteria:
  - text:        # immutable criterion text
    evidence:    # source-grounded implementation and verification evidence
    state:       # "[x]" | "[~]" | "[ ]"
    span:        # the criteria slice, bounded diff, and reachability span walked
summary:         # count by state and any unresolved gap
```

At member scope, record the report as ordinary closing-task evidence without changing the task list's criterion
checkboxes. At work-unit scope, consume those reports, validate seam and union coherence, and let the terminal
verification workflow own marking after it consumes the combined report.

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
