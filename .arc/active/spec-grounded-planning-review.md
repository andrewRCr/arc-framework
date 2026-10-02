# Spec (`detailed` · `RFC`): grounded-planning-review

- **Origin:** [internal] — extracted from `planning-iteration-mechanics` (2026-10-01): that work unit's concerns about
  planning-stage adversarial review, together with the `USER-INBOX` capture that prompted the cut.

- **Purpose:** Make planning-stage adversarial passes spend on design judgment rather than on slips the author could
  have caught, and keep the slips a pass's own fixes introduce out of the next pass. A planning claim about shipped
  behavior is grounded in source by its author when it is written, from fresh context inside each pass, and by the
  author and then a fresh reviewer when a fold rewrites it between passes.

---

## Introduction / Context

Adversarial passes over planning artifacts keep finding defects the author could have found alone: a named function
that does something other than the artifact says, a reference that does not resolve, a rule whose reach was never
swept. Each such finding spends a fresh reviewer on what source already answers and crowds out the design judgment
the pass exists for.

The defects arrive at three moments: when a claim is first written, when it survives unchecked into the first pass,
and when a fold between passes writes new claims nobody checks before the next pass. Two kinds recur, and today's
grounding catches neither:

- **Behavioral grounding** — every named symbol exists but does something other than the claim says. Today's
  grounding is existence-grade. `spec-review`'s grounding slice checks that named things exist and that claims are
  "plausible against reality — a light verification"; `task-audit`'s grounding floor reports "exists / missing /
  drifted"; `draft-design` runs no grounding before its adversarial fire-point at all. Reading the code path end to
  end, or probing it, catches these.
- **Propagation** — a claim adds a rule or concept whose reach was never swept, or states a list as complete when it
  is not. Only reading the rule against everything it governs catches these.

Nothing checks a fold before the next pass relies on it. The mutation guard (`DEV-RULES.ARC` § Review finding
mutation guard) verifies each _finding_ against source before it is fixed; nothing verifies the _fix_. A successor
pass re-attacks prior fixes, but a fold is new design, written after the stage's own grounding and after the
reviewer, and the next full pass spreads its attention across the whole artifact. The post-settle coherence re-read
after the final pass is the author's own read, neither fresh nor source-grounded.

**Evidence, in brief** (full record in `notes-grounded-planning-review.md`). One work unit dominates and is
uncontrolled, but its record is complete and the pattern recurs at every stage. `storage-contract` ran seventeen
planning passes across draft, spec, and task list. Across its fourteen successor passes, 43 of 58 verified majors
were fix-borne, read by locus under the counting rule in § Open Questions, and 13 of 20 at each stage's pass 2. The
record's own text attributes 20 of the 58, 16 of 24 over draft passes 4 and 5 and task-list passes 2, 4, and 5. A
fresh agent tracing the 27 source claims task-list pass 2's fixes rested on found one false and five partly true,
and the following pass's two majors were genuine interface decisions. A narrow fix check over ten folds found three majors,
two of them behavioral grounding and one completeness. Inspection practice closes rework the same way, with a
follow-up that verifies each correction and checks for defects the correction introduced. Published work finds that
prompted LLM self-correction without external feedback has not been shown to improve output outside tasks suited to
it, and can degrade reasoning, and that LLM evaluators favor their own generations.

**Expected effect.** On the next `Heavy` or `Novel` work unit planned under this design, the share of its successor
passes' majors that are fix-borne falls clearly below `storage-contract`'s share measured the same way,
both across all successor passes and at matching pass positions. The design can measure this but cannot verify it
here (§ Open Questions).

## Goals

- **The author grounds first, at every planning stage.** Every planning claim about what shipped code, an external
  tool, configuration, or a shipped rule does is checked at source by tracing or probing, not by existence. Each
  stage — draft, spec, task list, and amendment — runs the check as its own, best effort, before any subagent sees
  the artifact. The author also grounds its own folds before anyone checks them.
- **Independent grounding where a pass spends.** Every accepted planning pass grounds the author-grounded artifact
  from fresh context through its own rubric, with no extra call before it.
- **Every pass's folds are checked before anyone relies on them.** After the author grounds its folds, a fresh
  reviewer attacks only what they changed, in Owner-held rounds. The check sits outside the pass cap and outside the
  next pass's convergence signal.
- **Claims are checkable.** A claim about shipped behavior names the code that does it.
- **A principled successor recommendation.** The exit gate gives a reason to recommend another full pass, and at the
  cap a recommendation is the default.
- **A measurable record.** The pass record carries what the expected effect is measured from: reviewed-version
  hashes, each fold's kind, and each finding's origin.
- **The reasons are written down.** Why ARC reviews planning artifacts adversarially, and why the author grounds
  before any reviewer sees them, is stated where projects read it and recorded as a decision.
- **No growth where it costs every session:** no always-loaded content, no CLI behavior change, no new record kind.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **No CLI behavior change, stored record, or recording verb.** The classifier entry registers the new file and
  changes no behavior. No change to the pass cap or to the convergence rule.
- **No always-loaded content.** Always-loaded means the framework content `resolveLoadSetManifest` loads for every
  session regardless of stage: its `ARC_CONTEXT_ENTRIES`, which are the briefs, `DEV-RULES.*`, STRATEGY-INDEX, and
  QUICK-REFERENCE's environment section. Nothing is added there. A planning-stage workflow joins the load set only in
  its own stage's sessions, and the three gain their stage-wide lines and callout edits.
- **No fix check at verification or code-review callers,** and no change to code-review lanes' next-pass
  recommendation. That is owned by `review-orchestration-right-sizing`.
- **No mechanical enforcement of the actor rule.** Whether a named symbol resolves is `knowledge-lint`'s.
- **No re-validation of grounded claims after the base moves.** That is dependency conformance, held by
  `decomposition-doctrine`, with the general rule at `cross-wu-coordination`.
- **No `generate-tasks` entry gate on spec readiness** — `planning-iteration-mechanics`.
- **No eval of the judgment-layer behavior** — `workflow-eval-harness`.
- **No change to `ADVERSARIAL-PASSES.md` beyond its current file and shape:** new contents land as sections of
  existing pass entries.

## Proposed Design

Five decisions (D1–D5) and the ship surface that realizes them. The decision numbers match the draft's, so the pass
record stays traceable.

### D1 — `source-grounding`: one check, two scopes

A new configurable method, `source-grounding`, grounds planning claims in source. Its shape is the one
`adversarial-review` prototypes: a one-line signature, named inputs, a YAML callsite, and a return schema, all in the
public overridable cell.

```text
source-grounding(artifacts, scope) → findings report
```

| Input       | Kind     | Contents                                                |
| ----------- | -------- | ------------------------------------------------------- |
| `artifacts` | required | The artifact under check plus its upstream chain.       |
| `scope`     | required | `artifact` or `fold` — what the check reads; see below. |

`artifact` scope covers the whole artifact, an amendment's footprint, or a task scope. `fold` scope covers the change
since the last review (D3).

**Return schema:** `adversarial-review`'s report schema (`findings` with `title`, `severity`, `locus`, `evidence`,
and `rationale`, then `withstood` and `verdict`), so every consumer reads one shape. The `verdict` line names the scope
and the runner, `author` or `independent`, which the agent running the check sets by the rule below. An author-run
report is labeled so, and no consumer may read it as independent evidence.

**The check is behavior-grade.** For each claim about what shipped code does, the check traces the named code path or
probes it and confirms it does what the claim says. Existence alone does not pass.

**It sweeps propagation.** For each rule, concept, or complete-list claim, the check searches everything the claim
governs in the artifact and its upstream chain. Where the rule or list is about code, tools, or shipped rules, it
searches source too — callers, importers, and registries, by search or probe. A claim that a list is complete, or
that a composed outcome set covers every case, belongs to this sweep.

**Reach.** Everything the artifact claims exists outside itself is grounded at source: what code does, what external
tools do, configuration, and what shipped rules and methods require.

- A claim inherited from an upstream artifact is re-grounded at source, never by citing the artifact it came from.
- Fidelity to upstream decisions, such as a task list matching its spec, stays with each stage's alignment checks.
- Cross-references inside the artifact and the use of defined terms are coherence, not grounding. They stay with
  each stage's own coherence checks.

**How it runs.**

- **Factored.** Enumerate the claims, verify each against source on its own, then cross-check the claims against what
  was found. An independent runner does this without the author's reasoning in view.
- **Probe wherever a behavior claim can be cheaply executed,** since reading code to predict behavior is weaker than
  running it. Trace the named code path where it cannot.
- **Probes never mutate.** A probe never writes to the checkout, its refs or notes, a remote, or shared user state.
  Where executing a claim would, the check runs it against a disposable copy or traces instead. For example,
  `arc --no-input start` suppresses interaction and can run the complete start ceremony, so probing it in place is
  never cheap.
- **Unnamed actors are checked (D2).** A behavior claim with no named actor is a finding. If the claim holds once the
  actor is found, it is `minor`; otherwise it is graded as the false claim it is.

**Severity interpretation.** Findings map into `adversarial-review`'s fixed enum:

- `critical` — a false claim that a settled decision depends on, so the decision as written cannot work or reopens
  design.
- `major` — a false or unsupported claim about behavior or an external fact, or a propagation gap: a governed site the
  rule never reached, or a list stated complete that is not. Either would mislead the next stage or the implementation.
- `minor` — a claim true in substance but mis-stated (a wrong symbol name, a stale locus), or an unnamed actor whose
  claim holds.

**Who runs it — the author first, then independence.** Grounding is the author's job. Each stage grounds its own
artifact, best effort, before any subagent sees it, so an independent call is adversarial _to_ a best-effort
artifact rather than doing part of the author's work. A defect that grounding could have found and that surfaces
only downstream, forcing re-entry into an earlier stage, is that earlier stage's miss. Re-entry stays available and
is sometimes necessary, but it is never the plan. The stage's own check runs every time; independent grounding goes
only where a pass will spend — inside the pass itself, and in the fix check.

- **The stage's own check — author-run, every time.**
    - `draft-design` runs `source-grounding` at `artifact` scope over the finished draft, at the readiness boundary
      on the paths that produce one (`medium` and `high`). It runs in § Capture the draft, before the adversarial
      offer and the capture commit, the counterpart of `spec-review` at `create-spec`'s finalization. Like
      `spec-review`, it folds its fixes inline. It grounds once, at readiness, not on every shaping iteration, since
      claims churn while the design is still moving. `draft-design` declares `source-grounding` itself, since its own
      body fires it.
    - `spec-review`'s grounding slice and `task-audit`'s grounding floor hand their claim grounding to
      `source-grounding` at `artifact` scope. Neither gains an input; the agent running them sets the runner label by
      the rule below.
    - Both keep their posture: `spec-review` folds fixes inline, and `task-audit`'s findings feed `generate-tasks`'
      per-phase gates and carry its two-tier disposition in standalone runs.
    - `task-audit` keeps its two depths, but `grounding-only` becomes `source-grounding` run alone; no existence-only
      depth remains.
- **`amend-design` runs the same checks at scope.**
    - `task-audit` keeps its depth there: `grounding-only` over the revision tasks at `low`, and `full` over the
      affected phases at `medium` and `high`.
    - `spec-review`'s grounding slice runs over the affected spec elements at every depth, `low` included, since a
      determinate correction still rewrites a spec claim in place. At `medium` and `high` it sits beside the coherence
      slice, and the amendment pass's rubric gains it, with `task-audit`'s grounding floor over the footprint's tasks.
    - The assurance invariant already asks for this: the original spec passed both slices, and the original task list
      passed `task-audit`'s grounding floor.
- **The author grounds its own folds.** As part of performing a pass's approved response, the author runs
  `source-grounding` at `fold` scope over its folds, before the fix check runs (D3). The folds are small, so the
  check stays in-context and cheap.
    - The Owner's approval of the disposition set covers performing it, and grounding the folds is part of that. A
      correction that carries out an approved action as approved folds inline. A correction that changes what an
      approved action decides is a changed disposition: it returns for the Owner's approval under `DEV-RULES.ARC`
      § Review finding mutation guard, as a `revise` result does in D4.
    - An inline correction is disclosed rather than stopped for: the pass entry lists it, the next report to the Owner
      names it, and the fix check receives the list (D3).
- **Each accepted pass grounds through its own rubric,** its evaluator labeling the report by the runner rule (below).
- **The fix check is independent always** (D3): a run that reports `author` does not count as it.

**Who sets the runner.** The agent that runs the check sets the label in its `verdict`, by one rule `source-grounding`
states. It is `independent` only when that agent never had the author's context: given the artifacts, their upstream
chain, and orientation, and never loading author reasoning or the work unit's SESSION-NOTES — an adversarial pass's
evaluator, the fix check's reviewer, or a manual fresh-session pass started without session-init. Otherwise it is
`author`. A later session of the same work unit is `author`, since session-init loads the active work unit's
SESSION-NOTES (`resolveLoadSetManifest`), and so is a manual pass that compacts in the work unit's checkout, since
session-recover's load set carries them there too. Only the agent running the check knows what it has loaded, so no
caller supplies the label.

**Each pass grounds through its rubric.** When a rubric that carries the check runs inside an adversarial pass, the
grounding is the pass's own, and its evaluator labels it by the runner rule. So `create-spec`'s finalization rubric
(`spec-review`), `generate-tasks`' (`task-audit`), and `amend-design`'s pass rubric (`spec-review`'s grounding slice,
and `task-audit`'s grounding floor over the footprint's tasks) gain it without a further call. `draft-design`'s pass
rubric carries neither method, so its callout names `source-grounding` directly.

**Why independence goes there.** Published work finds that prompted LLM self-correction without external feedback
has not been shown to improve output outside tasks suited to it, and can degrade reasoning, and that LLM evaluators
favor their own generations. A probe is an external signal, but the author reads its probes and traces with its own
reasoning in view, so the author-run check is the floor, not the independent check. Independence goes where a
reviewer's attention is at stake — inside each pass — and the fix check goes where the record shows fix-borne slips.
Paths with no pass are cheaper and retryable, and every recorded case for independence had passes. The bar does not
scale with planning depth; the cost tracks how many behavior claims are present.

**No subagent.** Where the harness has no subagent, the fix check is delegated review under `DEV-RULES.ARC`
§ Sub-agent scope's harness-conditional clause, as a pass already is. The Owner chooses between its options: skip with a
note, or a manual fresh-session pass that never loads the work unit's SESSION-NOTES. A manual pass that loads them
anyway, as one that compacts in the work unit's checkout does, reports `author` and does not count as the independent
check: the Owner reruns it or skips it with a note. The author never skips it on its own. The stage's own check runs
regardless.

### D2 — Name the actor

A claim that states what shipped code does names the code that does it, in the existing backticked symbol form —
`classifyRemoteFailure` returns `error` — never an unnamed actor ("today's selection", "the walk"). The rule attaches
to the **kind** of claim, not its weight: whether a claim is "load-bearing" is undecidable, but whether it "states what
shipped code does" is not.

It costs nothing on a well-formed claim and bites only on vague ones. Naming the actor makes the claim checkable: a
named symbol is a citation the reader can follow, not an attestation that the author checked it. Attribution buys
checkability, not correctness — a citation can name a source that does not support the claim — so D2 never stands
alone: D1's behavior check tests the support.

**Where the rule lives.** Its authority and its check live in `source-grounding`, never in an always-loaded surface. A
method loads only when called, and every call comes after the claim is written. So one stage-wide line in the opening
of each planning workflow carries the rule to every write the stage makes — authoring, revision, gate iteration, and
folds. The line states the rule and points to `source-grounding`. The four workflows are `draft-design`,
`create-spec`, `generate-tasks`, and `amend-design`. No marker syntax is added.

The split with `knowledge-lint` is clean: whether a named symbol resolves is mechanical and lint's; whether it does
what the claim says is `source-grounding`'s.

### D3 — The planning checks: the fix check

The fix check lives in one new `adversarial-review` section, `### Planning checks`, gated by one primary-side input.
It reuses the method's invocation contract and report schema, with its own read instruction in place of the canonical
template's: the template tells a later-pass reviewer to check the whole artifact for new failures, and the fix
check's instruction is scoped to the change.

**The gate input.** `planning-checks: on` joins `adversarial-review`'s signature as a primary-side input. Like
`pass-cap`, the primary holds it and never serializes it to a reviewer. When on, it turns on four things: the
author's grounding of its folds (D1), the offered fix check after each pass with folds, the kept reviewed versions,
and the fold tag (D4). The callouts at `draft-design`, `create-spec`, and `generate-tasks` set it, and so does
`amend-design`'s pass. Verification callers omit it and keep their own loops; code-review lanes are other machinery,
whose fixes run through review increments.

**Its standing.**

- **Outside the cap and the convergence signal.** The fix check is not a pass. It does not count against `pass-cap`,
  and its findings never enter a pass's convergence signal — keeping fix-introduced slips out of that signal is the
  point. It may also spare an over-cap full pass that the fixes alone would have prompted.
- **Its findings are findings.** The primary source-verifies them and presents them as a complete disposition set,
  and the set is approved before any repair lands. Under the mutation guard, this is a second approval within the
  pass.
- **Owner-held.** The author never skips it on its own authority. It examines the author's own work, and an agent is
  never the judge of whether a check applies to its own work. It is proposed per pass and per round, and the Owner
  may decline it.

**The fix check.**

- **When.** After a pass's approved fixes fold and the author has grounded them (D1), and before the next pass
  launches — including after the last pass, before the post-settle re-read. Where the planning checks are on, the
  primary proposes it beside every disposition set that carries a fix, in the same turn; the author's own grounding
  of the folds is part of performing that response.
- **Part of performing the response.** The fix check belongs to performing the pass's approved response, which
  § Exit gate already requires to complete before a named successor pass may launch. Response performance is
  incomplete until the folds are author-grounded and the offered fix check resolves — declined, or run with every
  round's approved repairs landed and author-grounded. Until then a conditionally approved successor's permission
  stays pending.
- **Target — the change since the last review.** The first round runs from the reviewed copy to the settled artifact.
  Each later round runs from the version the previous round reviewed to the artifact its repairs left. The reviewer
  derives the change by diffing the two kept versions and checks the findings' actions, the author's listed
  corrections, and any other change the Owner approved since the reviewed version against that diff, so a change
  the account does not list is caught outside the author.
- **Attention scoped, reading not.** The reviewer attacks only what the folds changed, but reads the change in the
  context of the whole artifact and its upstream chain. No review practice treats a delta alone as sufficient.
- **Four axes:**
    - **closure** — does each fix resolve its finding?
    - **behavioral grounding** — `source-grounding` at `fold` scope, probe-backed;
    - **propagation and completeness** — `source-grounding`'s sweep;
    - **new failure** — did the fix itself introduce a defect?

  Closure and new failure are stated in `### Planning checks`, and the two grounding axes are `source-grounding`.
  That section is the rubric's one home.
- **Inputs.** The findings it checks, as reported: the pass's in the first round, the previous round's after that.
  Each comes with its approved action — `fix`, `defer`, or `reject` — plus the two versions the target spans and the
  upstream chain. It also receives the corrections the author's fold grounding made and any other change the Owner
  approved since the reviewed version, each as a locus and what changed.
  It does not receive the author's disposition rationale, so its grounding half stays factored.
- **Rounds.** Each further round attacks the previous round's repairs and the rules they rest on. It is proposed
  beside that round's disposition set and is declinable like the first. Every round runs only on the Owner's
  approval, so no round cap is needed.
- **The recommendation, in one place.** The Owner decides each round; the primary recommends.
    - **First round.** The primary reads the folds' tags (D4) together with the same turn's successor decision. It
      recommends the fix check when any fold is new design, or when no full pass is to follow. When every fold is a
      local correction and a full pass is to follow, it recommends declining, since that pass reads them. Whether a
      full pass follows is the exit gate's successor decision, made in the same turn, so the two are proposed
      together and the Owner settles both.
    - **Later rounds.** It recommends another round when the exit gate's convergence rule, read over the previous
      round's result and approved dispositions, would withhold convergence, and stopping when it would not.
    - Both readings are recommendation inputs only, never the pass's signal or a gate. At any round's turn, D5's
      re-inspection test may recommend a full pass instead.
- **The next pass sees it.** Every round's findings and repairs join that pass's applied response, so they reach the
  next pass in its `prior-findings`. They are context, not the search frontier.
- **Coverage of the last round.** The next outer pass covers the last round's repairs. After the last pass, the
  post-settle coherence re-read does, by which point the rounds have converged or the Owner has stopped them with the
  residual named. The unattacked residual shrinks to the last round's repairs; it does not vanish.
  `adversarial-review`'s final-fold residual paragraph narrows to say so. The three workflows' post-settle steps drop
  their restatement of the reason, since the method owns it. `amend-design` has no such step, though its pass is a
  planning fire-point, so its assurance invariant gains the re-read its originals had. When its pass folded anything,
  the coherence re-read runs over the amended footprint as the last step before the amendment lands, on every arm.

**The reviewed versions are kept, locally.** The diff needs both versions, and planning folds land uncommitted.

- **Copying.** At each pass's launch and each round's launch, a caller with the planning checks on copies every
  planning artifact of the work unit that is present — draft, spec, task list, notes — since folds land beyond the
  reviewed set.
- **Location.** The copies go under the identity's `.internal/` directory at
  `.arc/user/{identity}/.internal/reviewed-versions/{slug}/{sha256}.md`, keyed by work-unit or stub slug and by each
  file's content hash. `getUserInternalDir` resolves that directory per checkout. The notes' save-side `serialize`
  walk skips every dot-prefixed path, and `classifyUserSyncPath` names such paths `never-synced`. So the copies stay
  out of the notes the personal workspace syncs, and a stub groomed before start has the directory too.
- **Recording and lifetime.** The pass entry records each artifact's filename and hash: the reviewed version as the
  pass's, and each round's as that round's. The copies are removed once the loop has ended: its stop reason is
  recorded, and no fix-check round is offered or running.
- **Loss.** A loop that moves to another machine or checkout loses its copies. Its fix check then scopes from the
  account alone — the findings' actions, the author's corrections, and other changes the Owner approved — and says
  so in its report.

### D4 — Classify each fold

Where the planning checks are on, each disposition that fixes a planning artifact in place carries one tag. The tag
draws `resolve-planning-depth`'s existing cut between correcting an existing decision and authoring new design
(§ Mid-stage re-entry, "Re-entry vs. in-place correction"):

- **local correction** — an existing decision corrected where it stands;
- **new design** — the fix adds a concept, rule, type, field, or decision that reaches past its finding's locus.

**Proportionality on new design.** A new-design fold runs `assess-design-proportionality` before the disposition set
is presented, preferring removal of the constraint that produced the defect over repair machinery. A new-design fold
may also be a floor-raising signal for the caller's re-entry valve.

**The Owner settles the tags.** Approval of the tagged set settles each tag, so the author's own tag never decides
alone whether its fold is checked. A fold the Owner retags as new design runs `assess-design-proportionality` before it
lands, and a `revise` result returns as a changed disposition for approval. The tag is a recommendation input (D3)
and a record, never the fix check's gate.

### D5 — The exit rule stays; the successor rationale gains the re-inspection test

`adversarial-review` § Exit gate already settles the two concerns routed here: convergence that read clean right after
material findings, and a pass cap that ended silently.

- Convergence reads material findings whatever their origin, so a fix-introduced major counts as any other.
- Every result is `Pass N of M`, and `cap-exhausted` is a named stop.
- Over-cap passes need explicit approval, one at a time.
- A successor recommendation carries a cost-and-signal rationale.

Which dispositions withhold convergence is the exit gate's own rule, as shipped; this design restates none of it. No
change to any of the above.

**The re-inspection test.** A principled reason to give in the successor rationale, from inspection practice:
recommend another full pass when the folds have changed the artifact so much that the last pass's assessment no
longer holds. Otherwise, the caller's own check of the response verifies the rework — the fix check, where the caller
offers one. The test is a recommendation input, never a trigger, and it authorizes nothing. The share of a pass's
majors that land in the previous pass's fixes stays evidence the primary may cite in that rationale.

**The cap bounds autonomy, not advice.** A pass cap or configured ceiling limits what runs without asking; it is not a
verdict that review is done. At `cap-exhausted` with material signal remaining, the primary never launches another
pass on its own, and never treats the cap as settling the question either. In the same turn as the disposition report
it states a clear recommendation, another pass or stop, with its cost-and-signal rationale. The shipped "may
recommend" becomes that default at `cap-exhausted`.

**Reach.** Both additions live in § Exit gate, so they reach every caller that runs the method's pass cap — the
planning callers, and the criteria passes `validate-criteria` runs at verification and in the task loop — with no
caller text. Code-review lanes reach a next-pass recommendation through other machinery, `review-triage` and the review
gate's pass policy, which this design leaves alone (§ Non-Goals).

### The pass record

The pass-entry contents are listed once, in a new `adversarial-review` subsection, `### Pass record`. It absorbs the
existing § Exit gate paragraph that names where advisory planning callers and criteria callers keep their evidence.
The three planning workflows replace their own copies of the list with a pointer to it, and `amend-design`'s "as the
planning passes do" points there too. A planning pass entry carries:

- the artifact reviewed and, where the planning checks are on, each kept version's filename and content hash — the
  pass's and each fix-check round's;
- `Pass N of M` and the rubric;
- the complete source-verified finding/account/action set, each fold carrying its tag (D4) and each finding naming
  its origin — the original artifact, a previous pass's fix, a fix-check repair, or another change the Owner approved
  between reviews, a finding in a gap that text left in what it changed taking that text's origin;
- each fix-check round's set, with its accounts and actions;
- the corrections the author's fold grounding made, after the pass and after each round, and any other change the
  Owner approved between them;
- the response-performance check and the consumption fact, as today;
- the stop reason and any conditional next-pass decision.

Each fix-check round's set attaches to the entry of the pass whose fixes it checks, and mints no record kind. A stub
groomed before it starts has no workspace, so its commit-body summary line stays its only record, as today. The new
fields are not kept for it, and the expected effect is measured over work units that have a workspace. Its kept copies
still serve the fix check's diff.

### The reasons, written down

The method states the mechanism. Why ARC runs it gets two homes, one per audience.

- **For projects — a strategy section.** `strategy-work-planning.md` gains `## Review at Planning Boundaries`. It
  states why ARC reviews planning artifacts adversarially, and in what order:
    - a design defect is cheapest to fix before any code depends on it;
    - a reviewer from fresh context, because a model checking its own output without external feedback rarely
      improves it, and a model judging its own output favors it;
    - the primary verifies every finding and the Owner holds the spend, because findings are advisory and a cap
      bounds autonomy, not advice;
    - the author grounds first, so the reviewer is adversarial to a best-effort artifact rather than doing part of
      the author's work, and a defect grounding could have found that surfaces only downstream is the earlier
      stage's miss;
    - folds are checked, because a fix is new design written after the reviewer.

  It stands alone and points to `adversarial-review` and `source-grounding` for the mechanics.
  `adversarial-review` points back to it from its opening, so the section is reachable where the review fires.
  STRATEGY-INDEX stays unchanged; its existing work-planning entry already covers the strategy.
- **For ARC's maintainers — ADR-036.** It records planning-stage adversarial review as a decision. That covers the
  core model the method shipped with, from `spec-adversarial-review.md`: fresh context per pass, adversarial stance,
  primary-held judgment, loop to convergence under a materiality exit gate, and an advisory `Class`-scaled launch.
  It also covers this design's extension: author-first grounding at every stage, independent grounding inside each
  pass, the fix check, and the cap posture. Both carry their rejected alternatives, the pre-pass run among them.
    - **Written now, not in execution.** It is authored after this spec's passes settle and surfaced with the spec at
      Gate 1. It is written `Accepted`, ready to implement, and rides the spec's ceremony commit as a non-moving
      artifact under `.arc/reference/adr/`. An Accepted decision changes only by supersession, so a later return of
      the pre-pass run supersedes it.
    - **Internal only.** No shipped file cites it. The strategy section carries what projects need on its own.

### Ship surface

Package source first (`packages/arc-framework/arc/`), synced to `.arc/`. `generate-tasks` is edited in its
`generate-tasks.template.md` counterpart.

Methods, under `system/methods/`:

- **`source-grounding.md` (new)** — D1, D2. The signature, named inputs, and return schema; the behavior-grade check
  and the propagation sweep; Reach; the factored procedure; non-mutating probes; the unnamed-actor finding; the
  severity interpretation. `related:` names its three consuming methods, and its Workflow header names the four
  planning workflows.
- **`adversarial-review.md`** — D3, D4, D5.
    - A pointer from the opening of `.default` to `strategy-work-planning.md` § Review at Planning Boundaries.
    - The `planning-checks` input in the signature line, the callsite, and the named-inputs table.
    - `### Planning checks`: the author's grounding of its folds; the fix check with its standing, recommendation,
      rounds, target, inputs, rubric, and read instruction; the kept reviewed versions; and the fold tag.
    - The § Exit gate additions, the narrowed final-fold residual paragraph, and `### Pass record`.
    - `arc.methods` declares `source-grounding` and `assess-design-proportionality`; `related:` gains
      `source-grounding`; the Workflow header gains `amend-design`.
- **`spec-review.md`** — D1. The grounding slice hands claim grounding to `source-grounding`, with the runner label
  by its rule; the "light verification" wording and the form-scaling lines are updated; `arc.methods` and `related:`
  are added; the Workflow header gains `amend-design`.
- **`task-audit.md`** — D1. The grounding floor hands claim grounding to `source-grounding`, with the runner label by
  its rule; `grounding-only` is defined as that check run alone; the "exists / missing / drifted" stop line and the
  `depth` input row are updated; `arc.methods` and `related:` are added; the Workflow header gains `amend-design`.
- **`design-audit.md`** — D1. Its account of `spec-review` ("its concrete references are real") is restated
  behavior-grade.
- **`README.md`** — D1. Related Methods rows pair `source-grounding` with `spec-review`, `task-audit`, and
  `adversarial-review`.

Workflows, under `system/workflows/arc/`:

- **`draft-design.md`, `create-spec.md`, and `generate-tasks.template.md`** — D2, D3. Four edits each: the stage-wide
  D2 line; `planning-checks: on` in the adversarial callout; the pass-entry list replaced by a `§ Pass record`
  pointer; the post-settle step's restated residual reason dropped.
- **`draft-design.md`, additionally** — D1. `arc.methods` declares `source-grounding`, and § Capture the draft fires
  it at `artifact` scope on the `medium` and `high` paths, before the adversarial offer. The adversarial callout's
  rubric gains `source-grounding`, so the draft's pass grounds through its own rubric.
- **`generate-tasks.template.md`, additionally** — D1. The `grounding-only` gloss ("the
  named-files-and-symbols-exist floor") and the greenfield framing ("verifying named files and symbols exist") are
  restated behavior-grade.
- **`supplemental/amend-design.md`** — D1, D2, D3. The stage-wide D2 line; `spec-review`'s grounding slice at scope at
  every depth; the grounding slice and `task-audit`'s grounding floor over the footprint's tasks in the
  assurance-invariant rubric; `planning-checks: on` on its pass, stated in
  prose under § The assurance invariant since that pass has no callsite block; the post-settle coherence re-read
  under the same section, when its pass folded anything; "as the planning passes do" pointing to `§ Pass record`.

Strategies, under `reference/strategies/arc/`:

- **`strategy-work-planning.md`** — the new `## Review at Planning Boundaries` section (§ The reasons, written
  down), its Contents entry, and Related Documentation entries for `adversarial-review` and `source-grounding`.

Registration — D1:

- `init-recipe.json`, `CONFIGURABLE_FILES` in `classification.ts`, and the self-hosting manifest register the new
  method as a core Configurable file.
- The method inventories in `integration/init.test.ts` (both lists), `integration/update.test.ts`, and
  `e2e/init.e2e.test.ts` gain `source-grounding`, as does `unit/init.test.ts`'s check that every planning method the
  authoring workflows require ships.
- `strategy-package-project-sync.md`'s file inventory gains the new method, and its counts move with it: the
  Configurable count in the inventory heading and the classification table (45 → 46), and the self-hosting
  installed-file total (152 → 153). `framework-sync.test.ts` checks those counts against the recipe.
- `framework-sync.test.ts`'s neutral-contract list gains `source-grounding.md`, `adversarial-review.md`,
  `spec-review.md`, and `task-audit.md`, so their two copies stay byte-identical. `spec-review` and `task-audit` are
  identical today. `adversarial-review`'s copies differ at two table separators, so the first commit that touches it
  changes only those two lines, in the package copy alone, converting them to the project copy's form.
  `check-package-sync.sh` refuses a staged project copy of a Configurable file that matches the package copy while
  the committed copies differ; after that first commit they no longer differ.

Test fixtures — D5:

- **`__tests__/fixtures/adversarial-review/over-cap/`** — its expected behavior states the recommendation, another
  pass or stop, as the default at `cap-exhausted`, where it now says the primary may recommend. Its scenario approves
  a fix of the confirmed major rather than carrying it forward, since a carried-forward major now converges and the
  pass would not reach `cap-exhausted`. The signal `pr-open-extensions.test.ts` pins for it is unchanged.

**Swept and unaffected:**

- the `arc-task-audit` skill stays true: its depth line ("the grounding floor alone") holds once the floor is
  `source-grounding`, and its "Two caller inputs" stay two, since the runner label is not an input;
- `strategy-session-operations.md`'s Method Classification by Trigger table lists no planning method, so it gains no
  row;
- `framework-sync.test.ts`'s design-proportionality check pins the four planning workflows only, so
  `adversarial-review`'s new declaration needs no test change;
- `assess-design-proportionality`, `validate-criteria`, and the verification and code-review callers are untouched.

**Declarations.** `source-grounding` declares no methods, and must not declare `adversarial-review` back. It has
four direct consumers, and each declares it in `arc.methods`: the three consuming methods, and `draft-design`, whose
own body fires it. `create-spec`, `generate-tasks`, and `amend-design` reach it through `spec-review` and `task-audit`
and do not redeclare it. `lint:arc:triggers` checks that it is reachable. The four fire-point markers are checked by
hand, since no fire-point validator exists.

## Alternatives & Rationale

- **A separate pre-flight method plus a separate fix check** — the routed captures' layering. Rejected for one check
  at two scopes (D1): the check is the same, and only its target differs.
- **A tripwire-gated narrow attack.** It could fire after the fact (the share of findings in the previous fixes) or
  ahead of time (a fix that asserts behavior, adds a concept, needed an Owner decision, spans sections, or sits in a
  code-dense work unit). Rejected: no candidate is reliable, each is arbitrary at its edge, and a fold-scoped check's
  cost already tracks fold size. Owner-held decline replaces the trigger (D3).
- **The fix reviewer inside the next pass,** as one more fresh reviewer in one logical pass. Rejected: fix-borne
  findings would enter that pass's convergence signal and draw its attention, which is what this work removes.
- **The fix check counted against the pass cap.** Rejected: it has a different purpose — verifying a response before
  review, the mirror of verifying a finding before fixing it.
- **An author-only fix check.** Rejected: the author examining its own fixes is not independent, and self-correction
  without external feedback has not been shown to improve output.
- **An independent grounding run at every stage, every time.** Rejected: a fresh agent on every `Light` spec and task
  list, plus an approval stop that `spec-review`'s inline posture does not have, for paths no pass will spend on.
  Independence goes where a pass will spend, inside the pass; the stage's own check stays the floor (D1).
- **An independent grounding run before the first pass,** on top of the pass's own grounding. Rejected: once the
  author's check is behavior-grade, the run sits between two checks doing the same job, the author's and the pass
  rubric's, which grounds from fresh context. Run by hand before this spec's first pass, it found three majors and
  thirteen minors the author's check missed, for about 340k tokens. But nothing shows the pass would have missed
  them. The run would also have checked internal cross-references and defined terms; those stay with each stage's
  own coherence checks, and a pass reads the whole artifact. The pass record's origins show whether passes keep
  spending on grounding slips (§ Open Questions); if they do, the run returns through a later decision that
  supersedes ADR-036.
- **Keeping that run and dropping grounding from the first pass's rubric.** Rejected: the run's own folds would get
  only the author's grounding, and the pass rubric would vary by condition.
- **Leaving drafts ungrounded until `create-spec`.** Rejected: a pass at the draft's readiness boundary would spend
  on slips its author could have caught, and `create-spec`'s re-grounding would surface them only after the draft
  was captured, which makes re-entry the plan. Grounding is the author's job at every stage (D1).
- **The reasons in an ADR alone, or in the strategy alone.** Rejected: shipped content cannot cite an ADR, so
  projects would get the mechanism without its reasons, and a strategy section keeps no durable record of the
  decision and the alternatives it turned down.
- **A STRATEGY-INDEX entry for the review reasons.** Rejected: the index is one of the `ARC_CONTEXT_ENTRIES`
  `resolveLoadSetManifest` loads for every session, and the method's pointer reaches the section where the review
  fires.
- **A last-pass fix check wired into each stage's workflow.** Rejected: the method's rules already cover it, and four
  workflow copies would restate them.
- **Git blob IDs for the reviewed version** (`git hash-object -w` at pass launch). Rejected: the blob is unreachable,
  so `git gc` prunes it after two weeks — within a long grooming loop.
- **Reviewed-version copies in the personal workspace,** beside `ADVERSARIAL-PASSES.md`. Rejected: `serialize` carries
  that workspace's files into the user's notes, which would carry transient copies to every machine, and a stub
  groomed before start has none.
- **Pointers on "load-bearing" claims, or a `file:line` on every claim.** Rejected: the first is undecidable, and the
  second churns and rots. Pointers go by claim kind, at symbol grain (D2).
- **Re-pointing the successor pass at the fixes.** Rejected: it amends the method's rule that prior fixes are context,
  not the search frontier, and it still spreads one reviewer across both jobs.
- **One fix-check round per pass.** Rejected on the record: the rounds kept finding majors in the previous round's
  repairs, and a single round would hand that layer to the post-settle re-read, which is the author's own.
- **A cap on rounds.** Not needed: every round runs only on the Owner's approval at a disposition turn.
- **Folding a bounded few findings at a time.** Not adopted: the record's fix-borne majors track new design inside a
  fold, not the number of fixes. D4's proportionality run and further rounds address that; batching would not.
- **An always-loaded reminder.** Rejected: it would restate verify-before-assuming, which fails exactly when the
  author does not notice.
- **`runner` as an input.** Rejected: the label describes what the agent running the check has loaded, which that
  agent knows first-hand. An input would have to be threaded through `spec-review`, `task-audit`, their callers, and
  the `arc-task-audit` door to reach it. The label lives in the report's `verdict` instead (D1).
- **The author grounding its proposed fixes before approval, in place of its landed folds.** Rejected: a fold's slips
  are written while it lands, after approval, as the three this spec's own fold grounding caught were, so grounding
  the proposal alone would miss them.

## Cross-cutting Considerations

**Audience boundary.** `source-grounding`, the method edits, the workflow edits, and the strategy section are
adopter-facing. They name no internal work unit, ADR, corpus figure, research citation, or transitional state. The
methods and workflows state the mechanism; the strategy section states the reasons in terms that stand alone. The
evidence and prior art stay in this spec, its notes companion, and ADR-036, which is internal. The interim file
mechanic is stated as what it does, without forward-pointing to the storage program.

**Testing.** The ship surface is prose, registration, and one test fixture. What is mechanically checked:

- the new method resolves in the install set — `init-recipe.json`, `CONFIGURABLE_FILES`, the manifest, and the
  init, update, and e2e inventories — and the package-sync inventory's counts match the recipe;
- `lint:arc:triggers` resolves it through its consumers' declarations;
- every edited Framework file is identical across the package source and the project copy (`framework-sync.test.ts`);
- the methods `README.md` and `design-audit.md`, the edited `adversarial-review.md`, `spec-review.md`, and
  `task-audit.md`, and the new `source-grounding.md` are byte-identical across both copies, through
  `framework-sync.test.ts`'s neutral-contract list, which the last four join as `assess-evidence-applicability.md` did;
- `check-package-sync.sh` passes at every commit, given the commit order under Registration;
- `pr-open-extensions.test.ts` pins phrases in the three workflows' pass-entry paragraphs and in
  `adversarial-review`'s § Exit gate paragraphs, matched anywhere in each file, and the `over-cap` fixture's signal.
  The edits keep those phrases, or update the test with them;
- the Markdown gate passes.

Checked by hand: fire-point markers, `§` pointers, and link fragments in prose.

The judgment-layer behavior has no mechanical check and is held for `workflow-eval-harness`.

**Migration and rollout.** In-flight review loops pick up the new rules at their next fire-point. Existing
`ADVERSARIAL-PASSES.md` entries are not back-filled. Pre-public-release posture applies: no compatibility reader for
the old pass-entry list.

**Cost.** The stage's own check stays in-context, and at `draft-design` it runs once per draft, at readiness. The
author's grounding of its folds is in-context and fold-sized. A pass's own grounding runs inside the pass, with no
extra call. Each fix-check round costs about one subagent; the record's heaviest pass took four rounds. The
recommendation steers the fix check to where it finds things: folds that add new design, and the last pass. Light
work, and local corrections with a full pass still to follow, are expected mostly to decline it.

**Authority and trust.** No subagent runs without the Owner: every pass and every fix-check round is proposed and
declinable. The author's own checks need no approval of their own: the stage's own checks keep their stages' gates,
and fold grounding returns only a correction that changes an approved disposition (D1). Findings stay advisory until
the primary verifies and disposes them. The runner label keeps author-run grounding from reading as independent
evidence. Probes never mutate shared state (D1).

**Forward compatibility.**

- **Storage.** At the storage flip, each adversarial pass becomes a review record (`storage-contract` D5). The
  refinements between passes become the artifacts' history, derived by `history` rather than written. The account
  cannot be derived, since an approved fold and an inline correction are both edits between the same versions: each
  finding's origin, each fold's tag, each round's set, the author's corrections, and other changes the Owner approved
  attach to the pass's review record as written content. The fix check's target is defined as last-reviewed version
  → settled version, which `history` derives after the flip. The fix check mints no record kind: each round attaches
  to a pass's entry, today as sections of `ADVERSARIAL-PASSES.md` entries in the file's current shape.
- **Procedure.**
    - No prose-encoded trigger is evaluated, and no markup is added.
    - The fix check reuses the report schema rather than a second hand-written shape.
    - One file mechanic does enter method prose: copy, key, and remove the reviewed version. That cuts against the
      principle that prose names verbs, not file mechanics. It is a stopgap — `history` retires it, and a verb for it
      now would be machinery the flip deletes.
- **Composition (`composable-workflows`).**
    - `source-grounding` takes the signature-led method shape that work unit generalizes.
    - The fix check sits in one section behind one input. It has inputs and an outcome — the procedural kind that
      extracts whole as a private method, leaving one gate line.
    - Cross-file pointers cite `§` anchors (`§ Planning checks`, `§ Pass record`), never step ordinals.
    - `adversarial-review` declares `source-grounding` as today's schema allows; it becomes an arm-gated entry when
      conditional declaration lands.
- **Knowledge.** `source-grounding` has four direct consumers, which earns the extraction. The rule's authority
  lives at its fire site, and a stage-wide line carries it to the write. The reasons live in an on-demand strategy
  reached from the method that fires the review. Nothing grows the always-loaded set.

**Alignment.**

- **PROJECT-PRD.** Checked against _Operational friction down, judgment friction up_ — passes: grounding is codified,
  so a pass's attention lands on design judgment, and every fix-check round stays an Owner decision. Also checked
  against _Configurable methodology, open ecosystem_ — passes: the new method is an overridable Configurable default,
  and the no-subagent path stays harness-agnostic. Also checked against _Designed to evolve_ — passes: the design
  feeds the planning record back into the methodology. Nothing touches § Out of Scope: the subagents are read-only
  derivation, never isolated execution.
- **TECHNICAL-OVERVIEW.** Checked against § 2 Architecture Components, Customization Surfaces, Methods — passes:
  one more per-file overridable method, registered through the existing install path. No new tech.

**Boundary fit and Class.**

- `assess-boundary-fit`: stays one work unit, with no delivery-plan candidate. It is one concern — ground a planning
  claim when written, inside each pass, and when a fold rewrites it — designed as a whole. The ship surface is one new
  method, four method edits and the methods README, four workflow edits, one strategy section, one test fixture, and
  registration, all reviewable together. ADR-036 lands with this spec, not with the ship surface.
- `classify-work-unit`: `Heavy`. Derivation fired — the checks, their fire-points, their accounting, and the
  authoring rule had to be worked out — and the design composes `adversarial-review`, `spec-review`, `task-audit`,
  and `assess-design-proportionality` rather than inventing a model. Scale does not fire. The ADR is the Owner's
  call, not the `Novel` overlay's: the design is composed, but planning-stage review had no recorded decision.

**Coordination,** routed at draft close and cross-referenced here only:

- `knowledge-lint` — whether a named symbol resolves;
- `review-orchestration-right-sizing` — code-review lanes' next-pass recommendation; the pass-record schema at the
  storage flip;
- `planning-iteration-mechanics` — the `generate-tasks` entry gate;
- `cross-wu-coordination` and `decomposition-doctrine` — re-validation after the base moves;
- `workflow-eval-harness` — the eval.

## Success Criteria

- `source-grounding.md` ships as a Configurable method carrying:
    - the D1 signature, named inputs (`artifacts`, `scope`), and `adversarial-review`'s report schema as its return,
      whose `verdict` names the scope and the runner;
    - the behavior-grade check, the propagation sweep reaching source, the Reach rules, the factored procedure,
      non-mutating probes, the unnamed-actor finding, and the severity interpretation;
    - the rule by which the running agent labels its report `independent` only when it never loads author reasoning
      or the work unit's SESSION-NOTES, and `author` otherwise;
    - the D2 rule as its authority.

  Its prose names no internal work unit or corpus figure.
- It resolves in `init-recipe.json`, `CONFIGURABLE_FILES`, the self-hosting manifest, the init, update, and e2e
  install inventories, the unit init test's planning-method check, and the package-sync strategy's inventory, whose
  Configurable and installed-file counts match the recipe. It also has Related Methods rows with its three consuming
  methods.
- `spec-review`'s grounding slice and `task-audit`'s grounding floor each hand claim grounding to `source-grounding`,
  with the runner label by its rule and no new input, and each declares it. Both name `amend-design` in their Workflow
  header. No existence-only grounding remains: `spec-review` no longer calls its grounding a light verification,
  `task-audit`'s `grounding-only` is `source-grounding` run alone, and `design-audit`'s account of `spec-review` is
  behavior-grade.
- `adversarial-review` carries the `planning-checks` input as primary-side and never serialized, and a
  `### Planning checks` section carrying:
    - the author's `fold`-scope grounding of its folds as part of performing the response, before the fix check,
      folding inline with disclosure a correction that carries out an approved action as approved, and returning one
      that changes what an approved action decides for approval under `DEV-RULES.ARC` § Review finding mutation
      guard, with each correction listed in the pass entry, named in the next report, and handed to the fix check;
    - the fix check's standing outside the cap and convergence signal, timing, change-since-last-review target, four
      axes, inputs without disposition rationale, Owner-held rounds, and last-round coverage;
    - the fix check's recommendation, in one place: the folds' tags read with the same turn's successor decision for
      the first round, and the convergence-rule reading for later rounds;
    - the kept reviewed versions, with location, keying, recording, removal, and loss behavior;
    - the D4 fold tag.
- `adversarial-review` also carries a `### Pass record` subsection listing the entry contents, with each fold's tag,
  each finding's origin, a gap taking the origin of the text that left it, the author's fold-grounding corrections, and
  other changes the Owner approved between reviews. It declares `source-grounding` and `assess-design-proportionality`,
  and its opening points to `strategy-work-planning.md` § Review at Planning Boundaries.
- `adversarial-review` § Exit gate states the re-inspection test as a recommendation input and makes a
  recommendation, another pass or stop, the default at `cap-exhausted`. Its convergence rule and pass caps are
  unchanged. Its final-fold residual paragraph names the last fix-check round's repairs as the residual.
- `draft-design`, `create-spec`, and `generate-tasks` each carry:
    - the stage-wide D2 line;
    - `planning-checks: on` in their adversarial callout;
    - a `§ Pass record` pointer in place of their pass-entry list;
    - a post-settle step without its restated residual reason.

  `draft-design` also declares `source-grounding` and runs it at `artifact` scope at the readiness boundary on the
  `medium` and `high` paths, before the adversarial offer, and its adversarial rubric
  includes `source-grounding`. `generate-tasks`' description of `grounding-only` and its greenfield framing are
  behavior-grade.
- `amend-design` carries:
    - the stage-wide D2 line;
    - `spec-review`'s grounding slice over the affected elements at every depth;
    - the grounding slice, and `task-audit`'s grounding floor over the footprint's tasks, in its assurance-invariant
      rubric;
    - `planning-checks: on` on its pass;
    - the post-settle coherence re-read when its pass folded anything, as the last step before the amendment lands;
    - a `§ Pass record` pointer.
- `strategy-work-planning.md` carries `## Review at Planning Boundaries`, with its Contents entry and Related
  Documentation entries. The section states the five reasons in § The reasons, written down, points to
  `adversarial-review` and `source-grounding` for the mechanics, and cites no ADR or internal work unit.
- ADR-036 is `Accepted` under `.arc/reference/adr/` and records the core model and this design's extension, each with
  its rejected alternatives. No shipped file cites it.
- No always-loaded surface, CLI behavior, stored record, pass cap, or convergence rule changes.
- `lint:arc:triggers` passes. Every edited Framework file is identical in the package source and the project copy.
  The methods `README.md`, `design-audit.md`, `adversarial-review.md`, `spec-review.md`, `task-audit.md`, and
  `source-grounding.md` pass the neutral-contract identity test, and every commit passes `check-package-sync.sh`.
- The `over-cap` fixture reaches `cap-exhausted` with material signal and expects the recommendation as the default.
- All quality gates pass (tests, linting, type checking).
- Ready for integration.

## Open Questions

- **Whether the fix-borne share falls.** The expected effect: on the next `Heavy` or `Novel` work unit planned under
  this design, the share of its successor passes' majors that are fix-borne falls clearly below `storage-contract`'s
  share measured the same way, both across all those passes and at matching pass positions, since a later pass
  reviews more text earlier fixes wrote and a capped work unit runs fewer passes. A major is fix-borne when it lands
  in text written after an earlier review — a pass's fix, a fix-check repair, or another change the Owner approved
  between reviews — or in a gap that text left in what it changed; these are the pass record's non-original origins.
  The baseline was counted from `storage-contract`'s pass record over its planning passes on 2026-10-02, while that
  work unit was active, since leaving active state closes a work unit's workspace and its pass record with it: 43 of
  58 majors across its fourteen successor passes, 13 of 20 at each stage's pass 2, and 7 of 10 at pass 3. The
  per-pass table is kept in `notes-grounded-planning-review.md`. The expected effect also has the new work unit's
  first-pass majors mostly design findings rather than slips the grounding check covers. Majors count once verified;
  a rejected finding does not count. The pass record's origin field makes the share readable, and the Owner reads the
  new work unit's share from its record before it leaves active state, for the same reason. Resolved by use, after
  this work unit ships.
- **Whether passes still spend on grounding slips.** Before every pass, the author's check is behavior-grade, and
  each pass also grounds from fresh context. Pass 1's entry records each finding's origin, so the record shows how
  many of its majors are slips the author's check should have caught. This spec's own stage ran an independent
  pre-pass run by hand after the author's grounding, and it found three majors and thirteen minors. If grounding slips
  keep dominating first passes on the next few `Heavy` or `Novel` work units, the pre-pass run returns through a later
  decision that supersedes ADR-036 (§ Alternatives & Rationale). Resolved by use.
- **Whether one work unit's pattern generalizes.** The evidence is one `Novel` work unit, uncontrolled; `Heavy` work
  may show less, and light work is expected mostly to decline the fix check. Resolved by use.
- **Whether naming the actor prevents slips, or only makes them checkable.** It was tested against two recorded
  slips only. D2 never stands alone, so the design does not depend on the answer.

---
