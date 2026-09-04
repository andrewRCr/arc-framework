---
name: validate-criteria
description: Evidence-led success-criteria validation over an explicit member or work-unit scope.
arc:
  methods:
    - adversarial-review
related:
  - adversarial-review
override-active: false
---

# Method: validate-criteria

> - **Workflow:** [process-task-loop.md][process-task-loop], [verify-work-unit.md][verify-work-unit]
> - **When:** A delivery member or whole work unit reaches its criteria-validation boundary.
>
> - **Signature:** `validate-criteria(scope)` → criteria report
> - **Contract:** Walk the criteria, diff, and reachable tree selected by one explicit scope; bind every immutable
>   criterion by its exact task-list locus and criterion digest, and report its evidence, resolved state, and the
>   shared span walked; then
>   offer the same fresh-context adversarial companion at either boundary. The method gathers evidence and never
>   marks task-list criteria.

## validate-criteria.override

[No override configured]

## validate-criteria.default

The caller supplies one scope value. That value binds all three validation coordinates together:

- `criteria` — the member group at member scope; the flat Success Criteria section at work-unit scope when no
  Delivery Plan is present; or recorded delivery-member reports plus the seam group at work-unit scope when one is;
- `diff` — the bounded member diff or complete work-unit diff; and
- `reachability` — the cumulative tree through that member or the complete work-unit tree.

Do not widen or reconstruct one coordinate independently of the others. At member scope, read the upstream design,
inspect the bounded diff and reachable tree, and resolve each criterion in the selected member group against
source-grounded evidence.

At work-unit scope, first inspect whether the task list contains a Delivery Plan. When none is present, open the
upstream design/spec artifact, inspect the complete work-unit diff and reachable tree, and resolve every criterion
in the flat Success Criteria section against actual outcomes. When a Delivery Plan is present, disposition each
member group from its recorded boundary report; do not re-derive member criteria from the complete work-unit diff.
Require one report whose span matches each planned member, carry its criterion loci, digests, evidence, and state
forward,
then use the complete diff and reachable tree to detect regressions across group boundaries and walk the seam group
and union coherence. Resolve each recorded locus against the current task list before carrying it. A missing,
ambiguous, or mismatched member report is an unresolved `[ ]`, not permission to reopen that member's bounded walk.

One report has one exact `criteria-slice` and one shared `span`. Every criterion in that slice gets one entry. Its
`locus` is the heading path plus 1-based ordinal — for example,
`Success Criteria > Member 6 — refresh-and-native-landing > 2` — and must resolve to exactly one immutable
criterion. Its `criterion-digest` is the SHA-256 digest of the parsed criterion text after removing the root bullet
and checkbox marker; marker state and Markdown layout are not identity. The task-list text remains the authority;
the digest detects identity drift without duplicating or paraphrasing that text into a second authority.

When carrying a member report into work-unit validation, resolve its locus and recompute the criterion digest from
the current task list. A changed digest — including one caused by an insertion or reorder that leaves the recorded
ordinal occupied by another criterion — is unresolved `[ ]`; never transfer the recorded evidence to the new text.

The normal member span records the bounded member diff and cumulative reachability through that member. When an
approved boundary-order deviation made a member's closing walk depend on a later member change, keep the original
member diff bounded and record the exception under `boundary-order-deviation`: name the deviation, identify the
later task or commit that supplies the dependency, and give the exact cumulative reachability actually inspected.
At work-unit scope, validate that dependency as a cross-boundary seam. The exception never absorbs unrelated later
work into the member report or permits member-criterion re-derivation.

Use the three-state model in every report:

- `[x]` — met as planned, or met through a named deviation;
- `[~]` — intentionally superseded, deferred, or made irrelevant by a recorded design decision; and
- `[ ]` — not met; a genuine gap remains.

Criterion text is immutable. Resolve it through the exact locus and attach evidence or disposition; never rewrite
the criterion or its locator to agree with the implementation.

Return one entry per criterion in the selected scope beneath the report's shared span. At work-unit scope without a
Delivery Plan, entries carry evidence from the terminal flat-criteria walk. With a Delivery Plan, member entries
carry their recorded boundary evidence plus any union-level regression disposition, and seam entries carry evidence
from the terminal walk:

```yaml
criteria-slice:      # exact task-list heading path selected by the caller
span:
  diff:              # bounded member diff or complete work-unit diff
  reachability:      # cumulative member tree or complete work-unit tree
  boundary-order-deviation: # null, or the named approved exception and exact later dependency
criteria:
  - locus:             # exact heading path plus 1-based ordinal within criteria-slice
    criterion-digest:  # sha256: digest of parsed immutable criterion text, excluding marker and layout
    evidence:          # source-grounded implementation and verification evidence
    state:             # "[x]" | "[~]" | "[ ]"
summary:         # count by state and any unresolved gap
```

At member scope, record the report as ordinary closing-task evidence without changing the task list's criterion
checkboxes. At work-unit scope, let the terminal verification workflow own marking after it consumes the flat report
or the combined member-and-seam report.

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
