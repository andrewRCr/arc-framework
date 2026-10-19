---
name: verification-review
description: Scoped author criteria validation and its independent advisory companion
arc:
  methods:
    - review-model
    - validate-criteria
    - adversarial-review
related:
  - validate-criteria
  - adversarial-review
  - review-model
override-active: false
---

# Method: verification-review

> - **Workflow:** [verify-work-unit][verify-work-unit] and [process-task-loop][process-task-loop].
> - **When:** Verifying a change against its success criteria.
>
> - **Signature:** `verification-review(scope)` → criteria report and independent-review evidence
> - **Contract:** Run the author's criteria walk and offer its independent companion over the same selected scope.
>   Return evidence and unresolved findings; criterion marking, quality gates, and lifecycle changes stay with
>   the caller.

## verification-review.override

[No override configured]

## verification-review.default

Apply [review-model][review-model] before running or assessing this review.

### Inputs and return

```yaml
verification-review:
  scope:
    kind:            # delivery-member | work-unit
    criteria:        # selected member group, flat criteria, or recorded member reports plus seams
    diff:            # bounded member diff or complete work-unit diff
    reachability:    # cumulative member tree or complete work-unit tree
```

Use the work unit's recorded `Class` for the companion posture and cap. Keep all scope coordinates together.
Return the exact criteria report from the author walk plus the companion's pass record, complete dispositions,
stop reason, and any conditional next-pass decision. An unresolved criterion stays `[ ]`; independent findings remain
advisory until source-verified and dispositioned. This method marks no task-list criterion or task.

The procedure returns this evidence, without creating a shared stored record:

```yaml
criteria-report:      # exact validate-criteria report, including its shared span and entries
independent-review:   # null when declined; otherwise the retained pass records and approved dispositions
unresolved:           # unresolved criterion loci and finding decisions for the caller
```

### Author criteria walk

Run [validate-criteria][criteria-check] with the supplied scope:

```yaml
validate-criteria:
  scope:            # the caller's complete, unchanged scope value
```

Retain its exact criterion loci, digests, evidence, states, and shared span. Return to the caller with that report
and the independent evidence below; the check owns member-report composition and amendment deltas.

### Independent companion

After the author criteria walk, offer one fresh-context pass over the same selected scope. Use the work unit's
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

Each finding names the exact criterion it fails on its `**Fails:**` line; an out-of-scope finding identifies that
boundary instead of becoming a criterion gap.

After each returned pass, apply the method's complete-disposition and bounded-continuation protocol. Retain the
complete source-verified finding/account/action set, `Pass N of M`, stop reason, and any conditional next-pass
decision alongside the criteria report as ordinary closing-task evidence. This advisory evidence creates no
lane-progress record.

---

[review-model]: review-model.md
[criteria-check]: validate-criteria.md#validate-criteriadefault
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
[process-task-loop]: ../workflows/arc/process-task-loop.md
