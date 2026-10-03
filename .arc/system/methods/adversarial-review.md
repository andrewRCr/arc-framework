---
name: adversarial-review
description: Fresh-context adversarial review mechanism for planning and verification fire-points.
arc:
  methods:
    - source-grounding
    - assess-design-proportionality
related:
  - source-grounding
  - assess-design-proportionality
  - frontline-review
  - implementation-audit
  - review-chunking
  - standard-review
  - validate-criteria
override-active: false
---

# Method: adversarial-review

> - **Workflow:** [draft-design.md][draft-design], [create-spec.md][create-spec],
>   [generate-tasks.md][generate-tasks], [amend-design.md][amend-design],
>   [process-task-loop.md][process-task-loop],
>   [verify-work-unit.md][verify-work-unit],
>   [prepare-work-unit.md][prepare-work-unit], [integrate-work-unit.md][integrate-work-unit]
> - **When:** A stage boundary runs its readiness, finalization, task-generation, or work-unit verification gate
>   and has a supplied rubric to attack.
>
> - **Signature:** `adversarial-review(rubric, artifacts, orientation, pass-cap, fold-verification?,
>   prior-findings?, authored-partition?, aggregate-evidence?, partition-map?)` → findings report
> - **Contract:** Given a supplied rubric and stage artifacts, run that rubric adversarially with fresh context,
>   primary-held judgment, caller-owned launch policy, and convergence-oriented follow-up. Findings are advisory for
>   mutation until the primary verifies and disposes them; the method never creates a hard gate or satisfying
>   evidence by itself.

## adversarial-review.override

[No override configured]

## adversarial-review.default

Adversarial review is the mechanism that runs a supplied rubric from outside the primary's working context. It is
not itself a rubric: each fire-point supplies the artifact-specific questions, artifacts, and interpretation.
See [Work Planning Strategy § Review at Planning Boundaries][planning-review] for the reasons and ordering.

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

**Loop to convergence.** Each returned pass first enters source verification, complete disposition approval, and
approved response performance. A permitted successor pass attacks the settled artifact and the prior fixes, not only
the original report, so fresh signal — rather than settlement of old signal — determines convergence.

**Launch-neutral and caller-scaled.** The caller owns launch policy. An offer callout marks a discretionary
invocation whose recommendation posture and pass cap may scale with the work unit's `Class`; a required invocation
is unconditional and uses the same mechanism without an offer. The mechanism never weakens the caller's obligation
or replaces its interlock.

### Invocation contract

The primary agent is the runtime. It marshals the fire-point inputs, spawns each fresh pass, verifies every returned
finding against source, presents the complete disposition set for approval, performs approved responses, and decides
under the exit gate whether the loop has converged or stopped. One logical pass uses one fresh reviewer unless the
authored-partition or bounded chunk-series carrier applies; each reviewer performs one fresh call inside that pass. A
reviewer never edits the target, assigns dispositions, closes conversations, or attests its own result. It receives
only the pass-specific context serialized from the subagent-context inputs below; it never receives private loop control
state such as `pass-cap`, `fold-verification`, convergence decisions, or spawn bookkeeping. The primary adds
the pass ordinal, verified disposition report, continuation recommendation, and stop reason only after the reviewer
returns. Only an authorized adapter may attest a completed exact target as satisfying evidence.

**Signature — canonical callsite.** The fenced block below is the call expression: a workflow invokes the method
by instantiating it. Its single top-level key is the method name — the shape that identifies a method call
wherever it appears.

```yaml
adversarial-review:
  rubric:          # rubric method(s) + the fire-point's gate question
  artifacts:       # artifact under audit + upstream chain + key-file pointers
  orientation:     # fixed set — § Context provisioning
    - AGENT-BRIEF.ARC
    - AGENT-BRIEF.PROJECT
  pass-cap:        # per Class — Light 1 / Heavy 2 / Novel 3 (§ Exit gate)
  fold-verification: # on for planning folds; primary-side only, omitted otherwise
  prior-findings:  # pass two onward — prior findings + applied fixes; omitted on pass one
  authored-partition: # attention carrier only — existing contract-closed groups; omitted otherwise
  aggregate-evidence: # authored-partition aggregate only — scoped reports + complete coverage facts
  partition-map:   # partitioned pass only — named slices + ownership boundaries; omitted otherwise
```

**Named inputs:**

| Input                | Kind                  | Contents                                                       |
| -------------------- | --------------------- | -------------------------------------------------------------- |
| `rubric`             | per-stage             | Rubric(s) to attack, including their referents.                |
| `artifacts`          | per-stage             | Artifact under audit plus its upstream chain.                  |
| `orientation`        | fixed                 | Artifact-neutral briefings shared with every pass.             |
| `pass-cap`           | `Class`-scaled        | Primary-side cap on spawned passes; not serialized.            |
| `fold-verification`  | optional primary-side | `on` enables § Fold verification; omitted leaves it off.       |
| `prior-findings`     | pass two onward       | Prior findings and applied fixes; omitted from the first pass. |
| `authored-partition` | attention carrier     | Existing contract-closed groups (§ Authored-partition mode).   |
| `aggregate-evidence` | aggregate call only   | Current scoped reports plus complete coverage facts.           |
| `partition-map`      | partitioned pass only | Named slices + ownership boundaries (§ Novel fan-out hook).    |

`rubric`, `artifacts`, `orientation`, `prior-findings`, `authored-partition`, `aggregate-evidence`, and
`partition-map` (when present) are subagent-context inputs. Serialize the inputs needed by each fresh call.
`pass-cap` is a primary-side loop bound only: the primary uses it to decide how many logical passes it may run.
`fold-verification` is primary-side only too; it enables § Fold verification. Never serialize either input to a
reviewer.

**Return schema:**

The report schema below is canonical. The primary uses it when validating a pass result and serializes it into
`{report-schema}` in the prompt template.

```yaml
findings:
  - title:      # one line
    severity:   # critical | major | minor
    locus:      # the specific passage, file, symbol, or diff region at issue
    evidence:   # paths + source-grounded observations
    rationale:  # why it breaks, or what two competent engineers would build differently

withstood:
  - # decision-relevant claim or region examined with no finding to report

verdict:        # one line keyed to the fire-point's gate question
```

One `withstood` entry means: the reviewer examined this decision-relevant claim or region and has no finding to
report. It does not mean that the artifact is correct, complete, or cleared. The field stays freeform because the
reviewer chooses where absence of a finding is informative; do not turn it into an inventory of every touched region.

Before relaying a `withstood` statement, the primary applies a claim-type risk gradient. Externally verifiable claims
about source, behavior, or the diff are worth spot-checking. Internal judgments about what the reviewer considered
convincing or coherent are not independently verifiable. This gradient does not require independent verification of
every attention entry. `withstood` remains outside severity, disposition, convergence, and evidence attestation.

**Prompt template:**

```text
You are performing one fresh adversarial-review pass.

Use only the context supplied in this prompt plus source files you inspect directly.
Do not rely on the primary agent's intent, unstated assumptions, or prior session context.

Rubric:
{rubric}

Artifacts (paths — read them directly before forming any finding):
{artifacts}

Orientation (paths — read them directly before forming any finding):
{orientation}

Read the complete current artifact and its governing rubric before using prior
findings. On later passes, re-attack repairs after that read while checking the
entire artifact for new failures.

Prior findings and fixes:
{prior-findings | "None. This is pass one."}

Authored partition:
{authored-partition | "None. Use one whole-target reviewer."}

Aggregate evidence:
{aggregate-evidence | "None. This is not an authored-partition aggregate call."}

Partition map:
{partition-map | "None. This is a standard non-partitioned pass."}

Attack the artifact against the rubric. Try to break it. Do not manufacture findings:
if the artifact holds up, say that plainly and specifically.

`withstood` records decision-relevant attention without a finding. It does not mean the
artifact is correct, complete, or cleared. Include it only where the absence of a finding
is informative; do not enumerate every touched region.

Do not edit the target, assign dispositions, close conversations, or attest the result.
Do not decide loop state, continuation, or authorization.

Return exactly this report shape:
{report-schema}

For each finding, include source-grounded evidence. The primary will verify every
finding against source before acting on it.
```

**Fire-point offer shape.** When caller policy makes invocation discretionary, the workflow callsite is a stop-class
control point: surfacing the offer is never skippable; running the pass is the user's call. The fire-point wraps the
instantiated signature block in the stop-class callout, with the method name and posture in the lead:

```markdown
> [!IMPORTANT]
> `adversarial-review` method — advisory fire-point (`Class`-scaled): {posture};
> offer the pass and await the call — user decides; decline proceeds normally.
```

A mandatory method invocation carries no callout — an unmarked signature block is an unconditional step. The
callout marks the user-decision control point, never method-hood itself.

### Severity model

Findings use a fixed, ordered severity enum across every fire-point. The levels and their ordering are part of
the method contract; each supplied rubric interprets what those levels mean for its own artifact and maps findings
into the enum rather than extending it.

**Fixed core enum:**

- `critical` — a real correctness defect or gate-breaking gap. A report's `verdict` cannot read clean with a
  live `critical`.
- `major` — a substantive design, grounding, or conformance problem that should resolve, but is not independently
  ship-blocking by category alone.
- `minor` — coherence residue, wording, or another low-materiality finding.

Ordering is `critical` > `major` > `minor`. The `minor` / `major` boundary is the materiality line the exit gate
reads.

**Severity is not disposition.** Severity measures materiality. Disposition is the primary's verified action on a
finding: fix it in place, carry it forward durably, or drop it. The primary assigns disposition only after source
verification and obtains approval for the complete set before any finding-driven response.

Disposition is orthogonal to severity: any severity can be fixed, carried forward, or dropped. Disposing a finding
settles the approved response backlog; it does not rewrite what the pass surfaced. Carry-forward is therefore not a
fourth severity, and no disposition flattens a confirmed `critical` or `major` into `minor`.

### Exit gate

Completeness and convergence are independent. Complete the approved response backlog for the current pass before
closing or continuing the normal loop; then read the pass's verified signal without treating that settlement as new
review evidence.

**Completeness.** Completeness is a property of the disposition backlog. Every reported finding has one approved
disposition, including a `reject` disposition for an unsupported finding. An undisposed refuted or `minor` finding
therefore leaves completeness open even when the pass signal converges.

**Convergence.** Convergence is a property of the pass result and its approved disposition set. A successor pass
exists to review what a material fix changed, so a pass converges unless its approved dispositions fix a
triage-confirmed finding above `minor`.

- A zero-finding report is a clean convergence.
- All-refuted and confirmed-minors-only passes converge once the complete disposition set is approved.
- A confirmed `critical` or `major` finding approved as `defer` or `reject` converges too: the artifact is unchanged,
  so another pass would only re-review it. The pass still reports the finding's verified grade.
- An approved fix of a confirmed `critical` or `major` finding withholds convergence; only a later fresh pass over
  the fixed artifact can establish a new converged result.
- A confirmed `minor` never authorizes another pass and never raises its verified severity to manufacture material
  signal. When it remains unusually informative, name it as a follow-up observation in the converged completion
  report; that observation is not control state or a permission request.

The primary-facing report distinguishes clean convergence, convergence with settled findings — confirmed `minor`
findings, or material ones deferred or rejected — and non-convergence. The approved disposition set decides which one
the completed pass established; performing the response never changes it.

**`Class`-scaled pass cap.** Use `Light` 1, `Heavy` 2, and `Novel` 3 as the default pass caps. Present every
completed result as `Pass N of M`. Every ended loop names one stop reason: converged, `cap-exhausted`, suspended, or
Owner-accepted. Owner acceptance is an accepted-risk terminus, not a converged result.

At `N == M`, a non-converged pass reports `cap-exhausted`; stop before another evaluator invocation. A converged
pass completes normally and reports that its allowance is exhausted. Neither outcome bypasses completeness for the
current pass, and cap exhaustion resolves no material finding.

**Re-inspection test.** Recommend another full pass when the folds changed the artifact so much that the last
pass's assessment no longer holds. Otherwise, the caller's response check verifies the rework — the fix check where
one is offered. This is a recommendation input, never a trigger or authorization; the share of majors landing in a
previous pass's fixes may inform its cost-and-signal rationale.

**Cap recommendation.** At `cap-exhausted` with material signal remaining, state a clear recommendation — another
pass or stop — with its cost-and-signal rationale in the same turn as the complete disposition report. The cap bounds
autonomy, not advice; it never settles whether review is done or permits another pass without approval.

When another pass may yield useful fresh signal, the primary may recommend it with a cost-and-signal rationale in the
same turn as the complete disposition report. A recommendation is not authorization. Disposition approval alone
authorizes no additional pass, and unused capacity under the cap is not permission. Every successor pass requires
explicit approval naming that activity and pass.

Explicit approval that names the activity and the next pass authorizes exactly one additional pass. When granted in
the disposition-report turn, retain that separate conditional decision in the caller's advisory evidence.
It is pending and unusable while any approved response remains incomplete. Complete response performance permits the
named pass; withdrawal or supersession invalidates it, as does an incompatible artifact, activity, or pass binding.
Launching the named fresh pass consumes that permission, and replay cannot authorize another pass. Any further
over-cap pass requires fresh approval.

A converged result is a signal about the latest pass, not a veto on an Owner-directed successor. The Owner may
authorize any number of later passes one at a time; a later material result re-enters the normal response loop,
where an approved fix leaves the latest pass non-converged. Neither a minor observation nor unused capacity starts a
pass without that decision.

**Uniform materiality threshold.** The convergence threshold does not vary by `Class`. `Class` scales the
recommendation posture and pass cap, not the meaning of material severity.

**Pass two onward.** Start with a full read of the current artifact and rubric. Then use `prior-findings` and the
primary's applied fixes to re-attack repaired loci; they are context, not the search frontier. Every pass reruns the
full rubric over the whole artifact. Add `prior-findings` only after pass one.

**Final-fold residual.** After the last pass, the last fix-check round's repairs remain unattacked by a successor
review. If no round ran, the final pass's folds remain that residual. The planning fire-points' post-settle coherence
re-read covers it, after rounds converge or the Owner stops them with the residual named. The method states the
reason; workflows own the re-read step.

### Fold verification

With `fold-verification: on`, a **fold** is a change landed in a reviewed planning artifact before the next review
reads it: an approved fix, a correction made while grounding those fixes, or another change the Owner approved.
This input enables author grounding, the offered fix check, kept reviewed versions, fold tags, and runner labels.

**Author grounding.** As part of performing the approved response, run [source-grounding][source-grounding] at
`fold` scope over the folds before the fix check:

```yaml
source-grounding:
  artifacts:  # changed artifacts + upstream chain + change account + kept reviewed versions
  scope: fold
```

A correction that carries out an approved action as approved folds inline: list it in the pass entry, name it in
the next report to the Owner, and give it to the fix check. A correction that changes what the approved action
decides returns for approval under [DEV-RULES.ARC § Review finding mutation guard][mutation-guard].

**Fold tags.** Each disposition fixing a planning artifact in place carries one tag, using
[resolve-planning-depth][resolve-planning-depth]'s correction-versus-new-design cut:

- `local correction` — an existing decision corrected where it stands;
- `new design` — a fix adds a concept, rule, type, field, or decision reaching beyond its finding's locus.

For a new-design fold, run [assess-design-proportionality][assess-design-proportionality] before presenting the
disposition set; prefer removing the constraint that caused the defect over adding repair machinery. It may also
raise the caller's re-entry floor. The Owner settles the tags by approving the tagged set. If the Owner retags a
fold as new design, run that method before it lands; a `revise` result returns as a changed disposition for approval.
Tags are recommendation inputs and a record, never the fix check's gate.

**Fix check — standing and timing.** A fix check is an independent review of the folds after author grounding,
before a successor pass launches, including after the last pass before its post-settle re-read. It is not a pass:
it sits outside the pass cap and its findings never enter the pass's convergence signal. It is not the evaluator
invocation § Exit gate stops before at `cap-exhausted`; that stop bounds passes, and the fix check still runs only
with the Owner's approval.

After each pass with folds, offer the fix check; propose it beside every disposition set carrying a fix, in the same
turn. The author never skips a check of its own work on its own authority; the Owner may decline it. Source-verify
every returned finding and present a complete disposition set for approval before repairs land: a second approval
within the pass. Response performance remains incomplete until the folds are author-grounded and the offered fix check
resolves — declined, or run with every round's approved repairs landed and author-grounded. Conditional successor
permission stays pending until then.

**Target and rubric.** The first round spans the reviewed copies to the settled artifacts. Each later round spans
the versions the previous round reviewed to the artifacts its repairs left. Diff both kept versions of every
planning artifact the change touched and compare that diff with the supplied account; catch changes the account
does not list. Attack only what the folds changed, while reading the whole artifact and upstream chain for context.

The four rubric axes are:

- **closure** — does each fix resolve its finding?
- **behavioral grounding** — `source-grounding` at `fold` scope, probe-backed;
- **propagation and completeness** — `source-grounding`'s sweep;
- **new failure** — did a fix introduce a defect?

**Inputs and read instruction.** Reuse the invocation contract: `rubric` takes those four axes; `artifacts` takes
the two kept versions of each planning artifact the change touched, the later one the settled artifact, plus the
upstream chain; `prior-findings` takes the account. The account includes the checked findings as reported (the
pass's in round one, the previous round's thereafter) and their approved `fix` / `defer` / `reject` actions, the
author's grounding corrections, and other changes the Owner approved since those versions, each with locus and
what changed. Omit the author's disposition rationale. `pass-cap` does not apply to this check.

Use the canonical prompt template unchanged except for its read paragraph, replaced with:

```text
Read the complete current artifacts, their upstream chain, and the four-axis rubric.
Derive the change from both kept versions of each touched artifact, then check the
findings' approved actions and the listed corrections and other approved changes
against that diff. Attack the change in its whole-artifact context for closure,
grounding, propagation, completeness, and new failure. The change, not the account,
is the search frontier. If kept versions are unavailable, scope from the account
alone and state that limitation in the report.
```

**Runner label.** With fold verification on, the serialized report schema's `verdict` names the runner by
`source-grounding`'s rule in every pass report and every fix-check report. An `author` fix-check report does not
count; the Owner reruns it or skips it with a note, never the author alone. Where subagents are unavailable,
[DEV-RULES.ARC § Sub-agent scope][sub-agent-scope] applies; its manual fresh-session pass counts only while it never
loads the work unit's SESSION-NOTES.

**Rounds and recommendation.** Propose each further round beside that round's complete disposition set. Each round
checks the previous round's repairs and the rules they rest on, runs only with Owner approval, and is declinable;
there is no round cap. The primary recommends, and the Owner decides:

- First round: read the fold tags with the same turn's successor decision. Recommend the fix check when any fold is
  new design or no full pass will follow; recommend declining when all folds are local corrections and a full pass
  will follow. Propose both decisions together so the Owner settles both.
- Later rounds: recommend another round when the exit gate's convergence rule, read over the previous round's
  result and approved dispositions, would withhold convergence; recommend stopping otherwise.

These readings guide recommendations only, never the outer pass's signal or a gate. At any round, the exit gate's
re-inspection test may recommend a full pass instead. Every round's findings and repairs join the applied response
given to the next pass in `prior-findings`, as context rather than its search frontier. The next outer pass covers
the last round's repairs; after the last pass, the post-settle coherence re-read does, once the rounds converge or
the Owner stops them with the residual named.

**Kept reviewed versions.** At each pass's launch and each round's launch, copy every present planning artifact of
the work unit — draft, spec, task list, notes — since folds can extend beyond the reviewed set. Keep the copies under
`.arc/user/{identity}/.internal/reviewed-versions/{slug}/{sha256}.md`, keyed by work-unit or stub slug and content hash.
`getUserInternalDir` resolves the identity's internal directory per checkout, including for a stub groomed before
start; the user-notes `serialize` walk skips dot-prefixed paths, and `classifyUserSyncPath` classifies them
`never-synced`. The copies stay local.

Record each artifact's filename and hash in the pass entry for the pass and each round. Remove the copies once the
loop has ended, its stop reason is recorded, and no round is offered or running. Moving to another machine or
checkout may lose the copies; scope the fix check from the account alone and disclose that limitation in its report.

### Pass record

Advisory planning callers keep the finding/account/action set, conditional decision, response-performance check, and
consumption fact in `ADVERSARIAL-PASSES.md` in the work unit's personal workspace; criteria callers keep them with
the criteria report. This creates no lane-progress record, code-review operation, Candidate, policy binding, or receipt.

A planning pass entry carries:

- the artifact reviewed and, with fold verification on, the filename and content hash of each kept version for the
  pass and each fix-check round;
- `Pass N of M` and the rubric;
- the complete source-verified finding/account/action set, each fixing fold's tag and each finding's origin: the
  original artifact, a previous pass's fix, a fix-check repair, or another change the Owner approved between reviews.
  A finding in a gap takes the origin of the text that left that gap in what it changed;
- each fix-check round's complete set, accounts, and actions;
- the author's fold-grounding corrections after the pass and each round, plus other changes the Owner approved
  between those reviews;
- the response-performance check and the consumption fact;
- the stop reason and any conditional next-pass decision.

Attach every round's set to the entry of the pass whose fixes it checks; it creates no new record kind. A stub
groomed before it starts has no workspace yet: its commit-body summary line remains its only record, and it does
not keep the new entry fields. Its kept versions still serve the fix check's diff.

### Authored-partition carrier mode

When a large target already has a stable authored partition — delivery-plan members, review chunks, criteria groups,
or equivalent contract-closed boundaries — the primary may use an authored-partition carrier mode as an advisory
attention aid. Bundle the partition into at most two or three contract-closed group sets. For each scoped reviewer,
serialize its exact assigned group set, corresponding artifact slice, and complete rubric for that scope. Then run
one fresh seam-and-aggregate reviewer over the complete union. The aggregate consumes every scoped report plus the
authored partition's complete coverage facts, verifies full coverage and cross-group seams, and emits the
whole-target result; every call together remains one logical pass.

Omit `aggregate-evidence` from the scoped calls. Supply it only to the aggregate call, serialized as every scoped
report plus the authored partition's complete coverage facts. It is current-pass evidence, never `prior-findings`.

This carrier does not invent or automatically derive partitions, create 1:1 member fan-out, persist state, add a CLI
surface, or add an interlock. Without a stable authored partition, use one whole-target reviewer. It does not satisfy
`review-chunking` or weaken that method's closure, seam, and aggregate obligations. It does not use `partition-map`,
which remains reserved for Novel fan-out with disjoint responsibility and AND-convergence semantics.

### Bounded chunk-series carrier mode

When `review-chunking` invokes the bounded chunk-series carrier mode, the carrier runs fresh bounded contexts
serially as sequential attention isolation within one logical pass. The carrier keeps a stable evaluator profile and
complete rubric across every closure chunk and the seam; only the current scope and its explicit external or
pre-existing annotations vary.

The carrier orchestration owns exact-target identity, partition, and coverage state outside those contexts. Each
chunk or seam report has no standalone authority. A fresh non-author aggregate context consumes the complete report
series and coverage facts, inspects targeted source loci as needed, and emits the caller role's one whole-target
result. Evaluator-call count does not change pass accounting.

This mode is distinct from Novel partitioned fan-out: the series isolates attention across dependent scopes inside
one review responsibility, rather than assigning orthogonal responsibilities to parallel evaluators.

### Context provisioning

Context provisioning gives the pass enough design-grounded material to attack the artifact while preserving the
fresh-read property. It is a prescribed first-read path set, not a prose dump of the primary's understanding. The
mechanism assumes the reviewer can inspect repository files directly; when that is unavailable, use the
subagent-unavailable degrade path from [DEV-RULES.ARC § Sub-agent scope][sub-agent-scope].

**`artifacts` — stage-keyed set.** Each fire-point supplies the artifact under audit plus the upstream chain that
defines correctness for that stage:

| Fire-point                  | Artifact set                                      |
| --------------------------- | ------------------------------------------------- |
| draft readiness             | draft                                             |
| create-spec finalization    | draft + spec                                      |
| generate-tasks finalization | spec + task list                                  |
| verify-work-unit            | spec + task list + the diff under verification    |
| frontline review            | exact change target + `implementation-audit` lens |
| standard review             | exact change target + `implementation-audit` lens |

On upstream-stage re-entry, downstream artifacts derived from the earlier version are stale. When `generate-tasks`
re-enters `create-spec`, its prior `tasks-*` is stale; when re-entry reaches `draft-design`, both prior `spec-*` and
`tasks-*` are stale when present. Do not supply them in `artifacts` or key-file pointers as checkable references.
Briefly tell the reviewer they carry no authority, so a discovered difference is not a finding. Review the current
stage against authoritative upstream inputs, then rebuild and review downstream artifacts at their own boundaries.
For `generate-tasks`'s in-place spec correction, update the spec and task list together, then review the current
pair at the task-generation boundary without stage re-entry.

Also include a non-exhaustive key-file pointer list when the stage has known implementation or reference loci.
Keep the list neutral: "key files, not necessarily complete" is orientation, while "the files I think are
dangerous" is author belief.

At `verify-work-unit`, the pass independently re-validates the spec's success criteria against the diff. Do not
feed it the implementer's self-verification result, and do not use `[x]` / `[~]` / `[ ]` task markings as evidence
for whether the implementation satisfies the spec.

At `frontline review` and `standard review`, when the change under review is governed by a spec, also supply that
spec's scope boundary — the section recording what the work deliberately does not do. Both lanes run routinely on
errands and off-work-unit changes that have no such boundary; there is nothing extra to supply in those cases.

For those two rows only, a finding whose remedy would cross that boundary must say so plainly and ground the
crossing in behavior required for correctness, safety, or a stated goal. That the change could be more complete,
more symmetric, or more defensive is not such a ground.

**`orientation` — fixed set.** Every pass receives artifact-neutral project ground truth:

- `AGENT-BRIEF.ARC`
- `AGENT-BRIEF.PROJECT`

Goal referents such as `PROJECT-PRD`, `TECHNICAL-OVERVIEW`, or project equivalents enter only when the supplied
rubric names them. Constitution and strategy documents stay pointer-listed and are read on demand when a rubric or
finding needs them.

The line is ground truth in, author beliefs about the artifact out.

**`prior-findings` — pass two onward only.** Omit `prior-findings` on pass one. The primary's focus list and
likely breakpoints are exactly where its blind spots can hide, so the first pass should not inherit them. For pass
two onward, provide the prior findings and the primary's applied fixes so the fresh pass can attack the settled
artifact and the repairs.

### Novel partitioned fan-out hook

The standard run is one fresh subagent per pass. For `Novel` work only, the primary may propose a partitioned pass
one when the surface is wide enough that one reviewer would spread thin and the surface admits a clean partition.
This hook is default off and contract-only; it does not add orchestration or make fan-out automatic.

**Entry test — partition-ability.** Partition only when slices are orthogonal and have ownable seams. Orthogonality
means a reviewer can own a slice's responsibility without relying on another slice's unresolved judgment. If seams
are dense everywhere, stay with the standard single-reviewer pass.

This is distinct from deliverable bisectability. A review slice needs attention partition; a PR or deliverable cut
needs a green, consistent intermediate state. Do not treat one test as evidence for the other.

**Partition contract.** A partitioned pass supplies:

- `partition-map` — the named slices and their ownership boundaries.
- Per-slice `rubric` — the scoped rubric for that slice.
- Per-slice `artifacts` — the scoped artifact set plus the shared upstream chain.
- Shared `orientation` — the fixed orientation set from this method.

Each subagent keeps full repository read access, but its mandate is scoped to its slice.

**Seam-ownership rule.** The slice that originates a change owns its downstream blast radius. Where seams are too
dense for origin ownership, create a dedicated seam or integration slice. Partitioning must not orphan seam
defects.

**Merge and convergence.** Because responsibility is disjoint, merge reports by concatenation rather than
deduplicating overlap. A partitioned pass converges only when its approved dispositions fix no finding above `minor`
from any slice report; cross-report convergence is a simple AND over slice reports. After merging, the primary applies
the same source verification, disposition, and exit-gate rules as a standard pass.

---

[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[generate-tasks]: ../workflows/arc/generate-tasks.md
[process-task-loop]: ../workflows/arc/process-task-loop.md
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[prepare-work-unit]: ../workflows/arc/work-unit-lifecycle/prepare-work-unit.md
[sub-agent-scope]: ../rules/DEV-RULES.ARC.md#sub-agent-scope
[planning-review]: ../../reference/strategies/arc/strategy-work-planning.md#review-at-planning-boundaries
[amend-design]: ../workflows/arc/supplemental/amend-design.md
[source-grounding]: source-grounding.md
[assess-design-proportionality]: assess-design-proportionality.md
[resolve-planning-depth]: resolve-planning-depth.md
[mutation-guard]: ../rules/DEV-RULES.ARC.md#review-finding-mutation-guard
