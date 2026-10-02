---
name: source-grounding
description: Ground planning claims in source behavior and sweep their propagation across governed sites.
related:
  - spec-review
  - task-audit
  - adversarial-review
override-active: false
---

# Method: source-grounding

> - **Workflow:** [draft-design.md][draft-design], [create-spec.md][create-spec],
>   [generate-tasks.md][generate-tasks], [amend-design.md][amend-design]
> - **When:** A planning stage grounds its artifact, a pass grounds through its rubric, or a response grounds its
>   changes before a fix check.
>
> - **Signature:** `source-grounding(artifacts, scope)` → findings report
> - **Contract:** Ground external claims at source by tracing or probing behavior and checking propagation. Report
>   findings with the scope and runner named; an author-run report never counts as independent evidence.

## source-grounding.override

[No override configured]

## source-grounding.default

**Named inputs:**

| Input       | Kind     | Contents                                          |
| ----------- | -------- | ------------------------------------------------- |
| `artifacts` | required | The artifact under check plus its upstream chain. |
| `scope`     | required | `artifact` or `fold`, as defined below.           |

`artifact` covers the whole artifact, an amendment's footprint, or a task scope. A narrowed target travels in
`artifacts`. `fold` covers the change since the last review; there `artifacts` also carries the account of that
change and, when they were kept, the reviewed versions it starts from.

```yaml
source-grounding:
  artifacts:  # artifact + upstream chain; change account and reviewed versions at fold scope
  scope:      # artifact | fold
```

**Return schema:** The findings report uses [adversarial-review][adversarial-review]'s report shape:

```yaml
findings:
  - title:      # one line
    severity:   # critical | major | minor
    locus:      # passage, file, symbol, or diff region
    evidence:   # paths + source-grounded observations
    rationale:  # why the claim fails or would mislead its consumer

withstood:
  - # decision-relevant claim examined with no finding to report

verdict:        # one line naming the scope and runner: author | independent
```

### Check

**Behavior-grade.** For each claim about what shipped code does, trace the named code path or probe it and confirm
that it does what the claim says. Existence alone does not pass.

**Propagation.** For each rule, concept, or complete-list claim, search everything it governs in the artifact and
its upstream chain. Where the rule or list concerns code, tools, or shipped rules, search source too — callers,
importers, and registries, by search or probe. A claim that a list is complete or that a composed outcome set covers
every case belongs to this sweep.

**Reach.** Ground at source everything the artifact claims exists outside itself: code behavior, external tools,
configuration, and what shipped rules and methods require. Re-ground inherited claims at source rather than citing
the upstream artifact. Fidelity to upstream decisions stays with the stage's alignment checks; internal
cross-references and use of defined terms stay with its coherence checks.

**Procedure.** Enumerate the claims, verify each against source on its own, then cross-check them against what was
found. An independent runner does this without the author's reasoning in view. Probe wherever a behavior claim can
be cheaply executed; otherwise trace the named path.

**Non-mutating probes.** Never write to the checkout, its refs or notes, a remote, or shared user state. Execute a
mutating operation against a disposable copy or trace it instead. Suppressing interaction does not make an
operation read-only: `arc --no-input start` can execute the complete start ceremony.

**Name the actor.** A claim that states what shipped code does names the code that does it, in backticked symbol
form. Attribution makes the claim checkable; the behavior check establishes whether the source supports it. A
behavior claim with no named actor is a finding: `minor` if it holds once the actor is found; otherwise grade the
false claim.

### Severity interpretation

- `critical` — a false claim a settled decision depends on, so the decision as written cannot work or reopens design.
- `major` — a false or unsupported behavior or external-fact claim, or a propagation gap: a governed site the rule
  never reached, or an incomplete list stated complete. Either would mislead the next stage or implementation.
- `minor` — a claim true in substance but mis-stated, such as a wrong symbol name or stale locus, or an unnamed actor
  whose claim holds.

### Runner

Grounding is the author's job first. Each stage grounds its own artifact, best effort, before any subagent sees it;
the independent check attacks that best-effort artifact. A defect this grounding could have found that surfaces
only downstream is the earlier stage's miss. Re-entry remains available, but is never the plan. The stage's own
check runs every time; independent grounding runs inside each accepted pass and in the fix check.

The agent running the check sets the runner in `verdict`; callers supply no runner input. It is `independent` only
when that agent never had the author's context: supplied artifacts, upstream chain, and orientation, with no author
reasoning or work-unit SESSION-NOTES loaded. Otherwise it is `author`. A later session of the same work unit that
loads SESSION-NOTES is author-run, as is a manual pass that loads them during compaction recovery. A manual
fresh-session pass counts as independent only while it preserves that separation.

The fix check always requires independence. An `author` report does not count: the Owner reruns it or skips it with
a note, never the author alone. Where subagents are unavailable, follow
[DEV-RULES.ARC § Sub-agent scope][sub-agent-scope]; the stage's own grounding still runs.

---

[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[generate-tasks]: ../workflows/arc/generate-tasks.md
[amend-design]: ../workflows/arc/supplemental/amend-design.md
[adversarial-review]: adversarial-review.md
[sub-agent-scope]: ../rules/DEV-RULES.ARC.md#sub-agent-scope
