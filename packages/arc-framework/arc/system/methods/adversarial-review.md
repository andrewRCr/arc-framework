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

### Invocation contract

The primary agent is the runtime. It marshals the fire-point inputs, spawns each fresh pass, verifies returned
findings against source, applies dispositions, and decides whether the loop has converged. A subagent performs
exactly one pass and never receives primary-side loop state.

**Named inputs:**

| Input           | Kind             | Contents                                                           |
|-----------------|------------------|--------------------------------------------------------------------|
| `rubric`        | per-stage        | Rubric(s) to attack, including their referents.                    |
| `artifacts`     | per-stage        | Artifact under audit plus its upstream chain.                      |
| `orientation`   | fixed            | Artifact-neutral briefings shared with every pass.                 |
| `passBudget`    | `Class`-scaled   | Primary-side cap on spawned passes; not serialized.                |
| `priorFindings` | pass two onward  | Prior findings and applied fixes; omitted from the first pass.     |

`rubric`, `artifacts`, `orientation`, and `priorFindings` are subagent-context inputs. Serialize them into the
fresh pass prompt. `passBudget` is a primary-side loop bound only: the primary uses it to decide how many fresh
passes it may spawn, but the subagent never sees it.

**Return schema:**

The report schema below is canonical. The primary uses it when validating a pass result and serializes it into
`{reportSchema}` in the prompt template.

```text
findings:
- title: one line
  severity: one of `blocker`, `major`, or `minor`
  artifact-locus: the specific passage, file, symbol, or diff region at issue
  evidence: paths and source-grounded observations
  failure-rationale: why the artifact breaks, or what two competent engineers would build differently

what-held-up-under-attack:
- claims or artifact regions checked and cleared

certification-verdict: one line keyed to the fire-point's gate question
```

**Prompt template:**

```text
You are performing one fresh adversarial-review pass.

Use only the context supplied in this prompt plus source files you inspect directly.
Do not rely on the primary agent's intent, unstated assumptions, or prior session context.

Rubric:
{rubric}

Artifacts:
{artifacts}

Orientation:
{orientation}

Prior findings and fixes:
{priorFindings | "None. This is pass one."}

Attack the artifact against the rubric. Try to break it. Do not manufacture findings:
if the artifact holds up, say that plainly and specifically.

Return exactly this report shape:
{reportSchema}

For each finding, include source-grounded evidence. The primary will verify every
finding against source before acting on it.
```

**Canonical callsite shape:**

```text
adversarial-review:
  rubric: <rubric method(s) and fire-point gate question>
  artifacts: <artifact under audit + upstream chain + key-file pointers>
  orientation:
    - AGENT-BRIEF.ARC
    - AGENT-BRIEF.PROJECT
  passBudget: <Light 1 | Heavy 2 | Novel 3>
  priorFindings: <pass two onward: prior findings + applied fixes>
```

At runtime, spawn a fresh pass with the subagent-context inputs, verify every finding against source, apply a
primary disposition, and continue under the exit gate until convergence or `passBudget`.

### Severity model

Findings use a fixed, ordered severity enum across every fire-point. The levels and their ordering are part of
the method contract; each supplied rubric interprets what those levels mean for its own artifact and maps findings
into the enum rather than extending it.

**Fixed core enum:**

- `blocker` — a real correctness defect or gate-breaking gap. A certification verdict cannot read clean with a
  live `blocker`.
- `major` — a substantive design, grounding, or conformance problem that should resolve, but is not independently
  ship-blocking by category alone.
- `minor` — coherence residue, wording, or another low-materiality finding.

Ordering is `blocker` > `major` > `minor`. The `minor` / `major` boundary is the materiality line the exit gate
reads.

**Severity is not disposition.** Severity measures materiality. Disposition is the primary's verified action on a
finding: fix it in place, carry it forward durably, or drop it. The primary assigns disposition only after source
verification.

Disposition is orthogonal to severity: any severity can be fixed, carried forward, or dropped. A finding the
primary has acted on is resolved for the loop; an open finding above `minor` is what blocks convergence.
Carry-forward is therefore not a fourth severity, and it does not flatten a `blocker` or `major` into `minor`.

### Exit gate

The loop exits by convergence first and by pass cap only as a cost ceiling. Convergence is materiality-based, not
zero-findings-based.

**Convergence.** A pass converges when it surfaces no open primary-confirmed finding above `minor`.

- A zero-finding report is a clean convergence.
- A report with only `minor` findings may converge after the primary folds or disposes those findings.
- A `blocker` or `major` finding that the primary has fixed, dropped, or carried forward durably is resolved and
  does not force another pass by itself.
- An open `blocker` or `major` finding prevents convergence.

The `certification-verdict` distinguishes the clean case from the converged-with-minors-folded case.

**`Class`-scaled pass cap.** Use `Light` 1, `Heavy` 2, and `Novel` 3 as the default pass budgets. Stop at the
first condition reached: convergence or pass cap.

Reaching the cap with live `blocker` or `major` findings does not resolve them. Stop the automatic loop and surface
the unresolved findings at the stage interlock for the user's call.

**Uniform materiality threshold.** The convergence threshold does not vary by `Class`. `Class` scales the
recommendation posture and pass budget, not the meaning of material severity.

**Pass two onward.** Every pass is a full rubric re-run. Add `priorFindings` only after pass one, and include the
prior findings plus the primary's applied fixes. Do not run a narrowed fix-only attack; the later pass must still
be able to certify the whole artifact against the rubric.

**Final-fold residual.** The final pass's folded findings are not attacked by a successor pass. That residual is
why the planning fire-points later wire a post-settle coherence re-read before finalization commit; this method
states the reason, while the workflow fire-points own the actual re-read step.

### Context provisioning

Context provisioning gives the pass enough design-grounded material to attack the artifact while preserving the
fresh-read property. It is a prescribed first-read path set, not a prose dump of the primary's understanding. The
mechanism assumes the reviewer can inspect repository files directly; when that is unavailable, use the
subagent-unavailable degrade path from [DEV-RULES.ARC § Sub-agent scope][sub-agent-scope].

**`artifacts` — stage-keyed set.** Each fire-point supplies the artifact under audit plus the upstream chain that
defines correctness for that stage:

| Fire-point                  | Artifact set                                      |
|-----------------------------|---------------------------------------------------|
| draft readiness             | draft                                             |
| create-spec finalization    | draft + spec                                      |
| generate-tasks finalization | spec + task list                                  |
| verify-work-unit            | spec + task list + the diff under verification    |

Also include a non-exhaustive key-file pointer list when the stage has known implementation or reference loci.
Keep the list neutral: "key files, not necessarily complete" is orientation, while "the files I think are
dangerous" is author belief.

At `verify-work-unit`, the pass independently re-validates the spec's success criteria against the diff. Do not
feed it the implementer's self-verification result, and do not use `[x]` / `[~]` / `[ ]` task markings as evidence
for whether the implementation satisfies the spec.

**`orientation` — fixed set.** Every pass receives artifact-neutral project ground truth:

- `AGENT-BRIEF.ARC`
- `AGENT-BRIEF.PROJECT`

Goal referents such as `PROJECT-PRD`, `TECHNICAL-OVERVIEW`, or project equivalents enter only when the supplied
rubric names them. Constitution and strategy documents stay pointer-listed and are read on demand when a rubric or
finding needs them.

The line is ground truth in, author beliefs about the artifact out.

**`priorFindings` — pass two onward only.** Omit `priorFindings` on pass one. The primary's focus list and likely
breakpoints are exactly where its blind spots can hide, so the first pass should not inherit them. For pass two
onward, provide the prior findings and the primary's applied fixes so the fresh pass can attack the settled
artifact and the repairs.

---

[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[generate-tasks]: ../workflows/arc/generate-tasks.md
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
[sub-agent-scope]: ../rules/DEV-RULES.ARC.md#sub-agent-scope
