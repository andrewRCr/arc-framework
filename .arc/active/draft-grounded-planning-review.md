# Draft: grounded-planning-review

- **Origin:** [internal] — extracted from `planning-iteration-mechanics` (2026-10-01): that work unit's concerns about
  planning-stage adversarial review, taken together with the `USER-INBOX` capture that prompted the cut.
- **Purpose:** Make planning-stage adversarial passes spend on design judgment rather than on slips the author could
  have caught, and keep the slips a pass's own fixes introduce out of the next pass. One idea runs through it: a
  planning claim about shipped behavior is grounded in source when it is written, before the first pass, and again
  when a fold rewrites it between passes.

---

## Problem / Motivation

Adversarial passes over planning artifacts keep finding defects the author could have found alone: a named function
that does something other than the artifact says, a reference that does not resolve, a rule whose reach was never
swept. Each such finding spends a fresh reviewer on what source already answers, and crowds out the design judgment
the pass exists for.

The defects arrive at three moments — when a claim is first written, when it survives unchecked into the first pass,
and when a fold between passes writes new claims that no one checks before the next pass. The mutation guard verifies
each _finding_ against source before it is fixed; nothing verifies the _fix_. A fold is new design, written after the
stage's own grounding and after the reviewer, and the next full pass spreads its attention across the whole artifact.
The post-settle coherence re-read that follows the final pass is the author's own read, neither fresh nor
source-grounded.

The slips split two ways, and the existing grounding catches neither:

- **Behavioral grounding** — every named symbol exists, but does something other than the claim says. Today's
  grounding is existence-grade: `spec-review`'s grounding slice checks that named things exist and that claims are
  "plausible", and `task-audit`'s grounding floor checks exists / missing / drifted. `draft-design` runs no grounding
  before its adversarial fire-point at all. Reading the code path end to end, or a probe, catches these.
- **Propagation** — a claim adds a rule or concept whose reach was never swept, or states a list as complete that is
  not. Only a read of the rule against everything it governs catches these.

## Evidence

One work unit dominates the evidence, uncontrolled, but its record is complete and the pattern recurs across stages.

- **`storage-contract` (Novel, code-dense) — sixteen passes across all three planning stages, as of 2026-10-01:** six
  on the draft, five on the spec, five on the task list, with the loop still running. Its `ADVERSARIAL-PASSES.md`
  records them all, with the fix checks after task-list passes 4 and 5.
    - Fix-introduced majors appear at every stage, not only in the code-dense task list. Draft pass 4: three of four
      majors correct pass 3's folds. Draft pass 5: four of five majors land on pass 4's folds or the save path under
      them. Spec passes 2 to 5: the majors cluster in mechanism decided after the previous pass. Task-list pass 2: four
      of eight majors are errors in pass 1's fixes. Task-list pass 4: three of four majors in pass 3's fixes. Task-list
      pass 5: two of three majors in fixed text — one where pass 4's fix check re-grounded after a base merge, one in
      lists stated as complete that pass 4's fix check had already extended.
    - The draft settled on a reframe that replaced an enumeration with a rule and removed mechanism (draft pass 6),
      after five passes whose majors were not weakening — not on pass count. Pass 6's three majors were detail gaps
      outside the class that ran through passes 2 to 5, and the Owner stopped the loop there.
    - **A natural A/B.** Before task-list pass 3, one fresh read-only agent traced the 27 source claims pass 2's fixes
      rested on, probing wherever a claim was about behavior: 21 held, 5 in part, 1 failed, yielding eight further
      fixes (two major). Pass 3's two majors were then both genuine interface decisions the plan had left open — the
      stated goal, observed. Pass 3's own fixes went in without a trace, and pass 4 found three of its four majors in
      them.
    - **A narrow fix check, after task-list pass 4.** One fresh subagent attacked only pass 4's ten folded fixes on
      closure, behavioral grounding (probe-backed), propagation and coherence, and new failure, before pass 5. It found
      three majors and seven minors; all held against source.
        - Two majors were behavioral grounding: a fix rested on "today's selection takes an active copy over every
          other", true only after the composition's reader has accepted the meta; another sourced "this checkout's
          copy" from a walk a probe showed disagreed with today's composed current-tree copy.
        - The third was propagation and completeness: exclusion lists stated as complete omitted about seven items,
          and one contradicted another task.
        - The minors split between grounding (an identity claim missing a second reader, an unstated remote name,
          laziness covering three stores but not the sync arm) and propagation (refusal-table and remedy gaps,
          undefined throw ordering, an unaddressed create path).
        - Probe-backed grounding of each fix's claims would have caught two of the three majors before the fold; the
          completeness failure needed an adversarial read of the fixes. Both are necessary, not either alone. Cost was
          one subagent, against a full whole-target pass rediscovering the same.
        - Confound: base merged mid-loop and unified the two lifecycle walks, dissolving one major and surfacing a new
          edge. Re-basing a plan on moving code is a drift source separate from the fixes (see Scope).
    - **Fix-check rounds, after task-list pass 5.** By the Owner's direction each round attacked the previous round's
      repairs and the rules they rest on. Four rounds over twelve fixes found 4, 2, 4, and 1 majors. Round one's majors
      sat mostly in the two mechanisms the pass had added; the later rounds' were mostly design-level, two resting on a
      false claim about today's code. After the fourth round's one design-level major, the Owner ended the rounds and
      approved a full pass, since no whole-target reviewer had seen four rounds of fixes, scoping it to finalize
      without a round if it returned only implementation detail.
    - Earlier fix-borne slips of both kinds, from task-list pass 2: a wrapped function that is not the one `arc sync`
      runs, a classifier returning `error` where the fix assumed `unreachable`, a subclass caught by its parent's
      class, a "spawns no Git" promise the read path could not keep (behavioral); placement required on every work
      item with no word on an Errand's, and rename and move exclusions written at a granularity the fixture contract
      could not express (propagation).
- **`delivery-plan-record` create-spec** — one measured pass produced twelve mechanical findings (source, reference,
  vocabulary, return-shape) and two design findings.
- **`wu-rename` create-spec** — three passes against a `Heavy` cap of two; pass 2 found a repair-introduced blocker,
  and pass 3 an original blocker both earlier passes missed.
- The Owner has seen the fix-borne pattern on earlier code-dense work units.
- **Inherited premises** — `delivery-plan-record` planning: empirical claims carried in from earlier artifacts read as
  settled and survived to an adversarial pass. The always-loaded verify-before-assuming rule depends on the author
  noticing an assumption, which an inherited premise defeats.

## Prior art

Gathered 2026-10-01 by three parallel research passes without a verification pass; the two items marked _verified_
were checked against source in-session, and summarizer-extracted figures are approximate.

- **Inspection follow-up.** Fagan inspection (IBM Systems Journal 15(3), 1976; IEEE TSE 12(7), 1986), Gilb & Graham
  (_Software Inspection_, 1993), and NASA-STD-8739.9 all close rework with a follow-up: the moderator, with the author,
  verifies every major defect was corrected and checks for new defects introduced by the correction. Follow-up is not
  another inspection. Full re-inspection is reserved for rework that leaves the product "so different from the
  inspected version that no assessment of the resulting quality can be safely made" (NASA SWEHB 7.10, _verified_). The
  often-quoted "re-inspect when over 5% was reworked" appears only in secondary sources.
- **Fixes that inject defects.** Capers Jones reports about 7% of repairs injecting a new defect on average, over 20%
  in complex, poorly structured code (secondary quotes). Yin et al., "How do fixes become bugs?" (ESEC/FSE 2011): 14.8%
  to 24.4% of sampled post-release OS fixes were incorrect, 39% for concurrency; causes included narrow focus on the
  specific bug and unfamiliarity with the code — the propagation and behavioral-grounding kinds.
- **Priming by prior comments.** Spadini, Çalikli, Bacchelli, "Primers or Reminders?" (ICSE 2020, abstract
  _verified_): with 85 developers, a visible prior comment raised detection of another bug of its type when that type
  is not normally considered, and did not affect detection of other types — "positive reminders", not negative
  primers. Single-round human code review.
- **Re-review tooling.** Gerrit (patch sets as commits under `refs/changes/`), Google's Critique (snapshots), and
  GitHub (commit SHAs) keep each reviewed version as an immutable, reachable snapshot and diff any two on demand. None
  prescribes delta-only re-review; the delta is a navigation aid. GitHub loses the anchor when a force-push drops the
  reviewed commit.
- **LLM self-verification.** Huang et al. (ICLR 2024): intrinsic self-correction without external feedback does not
  improve and often degrades reasoning. Kamoi et al. (TACL 2024) and Stechly, Valmeekam, Kambhampati (2024) concur;
  sound external verification helps. CRITIC (ICLR 2024): tool feedback beats tool-free self-critique, and models judge
  their own answers' truth barely above chance. Self-preference bias: LLM evaluators score their own outputs higher
  (Panickssery et al., 2024). Chain-of-Verification (Findings of ACL 2024): answering verification questions without
  the draft in context ("factored") repeats fewer of its errors, modestly; an explicit cross-check of the draft's claims
  against those answers gains most on longform text. For code behavior, execution signal beats reading (Self-Debug,
  ICLR 2024; LEVER, ICML 2023; CRUXEval).
- **Attribution.** AIS (Computational Linguistics, 2023) and ALCE (EMNLP 2023): per-claim attribution makes support
  measurable, not claims accurate — even the best models' citations fully support their claims only about half the
  time on ELI5. "The citation exists, the support fails" is the named-symbol failure.

## Decisions

### Class and boundary

- **`Class`: `Heavy`.** Derivation fires: the checks, their fire-points, their accounting, and the authoring rule had to
  be worked out. Composed rather than invented — every piece reuses `adversarial-review`, `spec-review`, `task-audit`,
  and `assess-design-proportionality`. Scale does not fire: method and workflow prose, no large code surface.
- **Boundary: stays one WU.** One concern — ground a planning claim when it is written, before the first pass, and
  again when a fold rewrites it. No independently deliverable surface; the pointer rule's mechanical enforcement is
  already `knowledge-lint`'s.

### D1 — One grounding check, two scopes

One shared method, **`source-grounding`**, grounds planning claims in source. It runs at two scopes with the same
check:

- **Artifact scope** — over the whole artifact, or an amendment's footprint.
- **Fold scope** — over what changed since the last review, as the grounding half of the fix check: a pass's folds, or
  the previous fix-check round's repairs (D3).

The check is **behavior-grade**: for each claim about what shipped code does, trace the named code path or probe it,
and confirm it does what the claim says — existence alone does not pass. It also **sweeps propagation**: for each rule,
concept, or complete-list claim, search everything it governs in the artifact and its upstream chain — and, where the
rule or list is about code, tools, or shipped rules, in source too: callers, importers, and registries, by search or
probe. Most recorded completeness slips were about the codebase.

**Reach.** Everything the artifact claims exists outside itself is grounded at source: what code does, what external
tools do (`git`'s output for an unconfigured remote was one recorded slip, settled by a probe), configuration, and what
shipped rules and methods require. A claim inherited from an upstream artifact is re-grounded at source, never by
citing the artifact it came from — "the spec says so" grounds nothing about code, which is how inherited premises
survive. Fidelity to upstream decisions (a task list matching its spec) stays with each stage's alignment checks.
Cross-references inside the artifact and defined-term use are coherence, not grounding: the stage's own check leaves
them to the stage's coherence checks, and the independent run checks them as well (below). A claim that a list is
complete, or that a composed outcome set covers every case, belongs to the propagation sweep.

**Who runs it.** The stage's own check runs every time; an independent run goes where a pass will spend.

- **The stage's own check, author-run, every time.** `spec-review`'s grounding slice and `task-audit`'s grounding floor
  hand their claim grounding to `source-grounding` and keep firing where they fire today, run by the author in its own
  context — behavior-grade, probe-backed, and labeled author-run. Their posture is unchanged: `spec-review` folds its
  fixes inline, and `task-audit`'s findings feed `generate-tasks`' per-phase gates. `task-audit` keeps its two depths,
  but `grounding-only` becomes `source-grounding` run alone, with no existence-only depth left. `amend-design` runs the
  same checks at scope. `task-audit` keeps its depth there — `grounding-only` over the revision tasks at `low`, and
  `full`, its default, over the affected phases at `medium` and `high`. `spec-review`'s grounding slice runs over the
  affected spec elements at every depth, `low` included, where a determinate correction still rewrites a spec claim in
  place; at `medium` and `high` it sits beside the coherence slice, and the amendment pass's rubric gains it too. The
  original spec passed both slices, so the assurance invariant — an amendment passes the gates the originals passed —
  already asks for it.
- **An independent run, riding an accepted pass.** When the Owner takes an adversarial pass at a planning fire-point —
  draft, spec, task list, or an amendment's footprint — a fresh read-only agent grounds the artifact just before the
  first pass, as derivation the primary then verifies. It is the fix check's sibling and shares its terms (D3); it
  belongs to launching the first pass, so its approved fixes fold before that pass launches and its finding set is
  recorded in the first pass's entry. Its own folds get no fix check, since pass 1 reads them; later passes need no
  second run, since each pass's folds get the fix check. Besides grounding, it checks that cross-references inside
  the artifact resolve and defined terms hold — the mechanical slips that reached `delivery-plan-record`'s pass past an
  existing coherence slice; it reads the whole artifact anyway, so this adds almost nothing. `draft-design` has no
  grounding of its own, so this run is its first; a declined pass skips it, and `create-spec` re-grounds every
  inherited claim at source anyway (Reach).
- **The fix check, independent always** (D3).

A session that did not write the artifact, such as the standalone `arc-task-audit` door run against an earlier plan,
is already non-author, and its run counts as independent.

**Why independence goes there.** An LLM checking its own output without an external signal does not improve it and
favors it (Prior art). A probe is external signal, but the author reads code to predict behavior with its own reasoning
in view, so the author-run check is the floor, not the independent check. The fresh run goes where a reviewer's
attention is at stake and, through the fix check, where the record shows fix-borne slips. The paths without a pass are
the cheaper, retryable ones, and every recorded case for independence had passes. The bar does not scale with depth;
the cost tracks the behavior claims present.

**How it runs.** The check is **factored**: enumerate the claims, verify each against source on its own, and
cross-check the claims against what was found; an independent run does so without the author's reasoning in view.
**Probe** wherever a behavior claim can be cheaply executed — reading code to predict behavior is weaker than running
it — and trace the named code path where it cannot. Findings use `adversarial-review`'s report schema, so every
consumer reads one shape. The author writes claims to D2 and applies the findings.

Where the harness has no subagent, the independent run and the fix check are delegated review under the shared
harness-conditional rule, and the Owner chooses between its options — skip with a note, or a manual fresh-session pass;
the author never skips either on its own. The stage's own check runs regardless.

### D2 — Name the actor

A claim that states what shipped code does names the code that does it, in the existing backticked symbol form —
`classifyRemoteFailure` returns `error` — never an unnamed actor ("today's selection", "the walk"). The rule attaches
to the **kind** of claim, not its weight: "load-bearing" is undecidable, while "states what shipped code does" is not.

It costs nothing on a well-formed claim and bites only on the vague ones. Every behavioral slip the narrow fix check
found among its majors was an unnamed-actor claim; the slips in task-list pass 2, and one of that check's minors, named
their actor and were still wrong. Naming the actor makes the claim checkable: a named symbol is a citation the reader
can follow, not an attestation that the author checked it.

What attribution buys is checkability, not correctness: per-claim citations routinely name a source that does not
support the claim (Prior art), which is exactly the named-symbol failure. So D2 never stands alone — D1's behavior check
is what tests the support. That naming the actor also prevents slips is inference from the record, not established.

The rule's authority lives in `source-grounding`, never in an always-loaded surface. A method loads only when called,
and every call comes after the claim is written, so one line states the rule for the whole stage in each planning
workflow — `draft-design`, `create-spec`, `generate-tasks`, and `amend-design`. The workflow stays loaded through its
stage, so the line covers every write there: authoring, revision, gate iteration, and folds. A line at each step would
sit closer to the write but miss every write site not listed. The split with `knowledge-lint` is clean: whether a named
symbol resolves is mechanical and is lint's; whether it does what the claim says is `source-grounding`'s. No new marker
syntax.

### D3 — The fix check is part of performing the fixes

After a pass's approved fixes are folded, and before the next pass launches, one fresh read-only reviewer attacks **only
what the folds changed**, on four axes: closure (does each fix resolve its finding), behavioral grounding (D1 at fold
scope, probe-backed), propagation and completeness (D1's sweep), and new failure in the fix itself. It reuses
`adversarial-review`'s invocation contract and report schema, with its own prompt variant. Each auxiliary call carries
its own read instruction in place of the canonical template's: the fix check's is scoped to the change, since the
template tells a later-pass reviewer to check the whole artifact for new failures; the independent run's covers claim
grounding, internal references, and defined terms across the whole artifact. Each fix-check round is a one-shot call,
not a pass. Its attention is scoped to the change, but it reads the change in the context of the whole artifact and its
upstream chain — no review practice treats a delta alone as sufficient. This is inspection's follow-up step: rework
verified, and checked for defects the correction introduced, by someone other than the author alone (Prior art).

Its rubric has one home, `adversarial-review`'s auxiliary-call section, which response performance invokes: closure
and new failure are stated there, and the grounding and propagation axes are `source-grounding` at fold scope.

It receives the findings it checks as reported — the pass's in the first round, the previous round's after that — with
each one's approved action (fixed, deferred, or rejected), the two versions its target spans, and the upstream chain.
It does not receive the author's disposition rationale, so its grounding half stays factored.

The first three terms below — outside the cap and the convergence signal, findings are findings, Owner-held — are
shared with D1's independent run, and the method states them once for both calls. They differ in what holds them: the
fix check is proposed per pass and per round and is declinable, while the independent run rides the Owner's
acceptance of the pass.

- **Inner loop, not outer.** The fix check belongs to performing the approved response, which the method already
  requires to complete before a named successor pass may launch. It sits **outside the pass cap**, and its findings
  never enter the next pass's convergence signal — keeping fix-introduced slips out of that signal is the point. It may
  also spare an over-cap full pass that the fixes alone would have prompted.
- **Its findings are findings.** Source-verified by the primary, presented as a complete disposition set, and approved
  before any repair lands — a second approval within the pass, the mutation guard unchanged.
- **Always proposed, Owner-held.** Where the planning checks are on, the primary proposes the fix check beside every
  pass's disposition set with folds, in the same turn; the Owner may decline it. The author never skips it on its own
  authority — it examines the author's own fixes, and an agent is never the judge of whether a check applies to its
  own work. That answers spend on light work units without a metric: decline at the disposition turn.
- **In rounds, the last pass included.** It follows every pass whose fixes landed, and it repeats: each further round
  attacks the previous round's repairs and the rules they rest on, proposed beside that round's disposition set and
  declinable like the first. The primary recommends another round when the exit gate's convergence rule, read over the
  round's result and approved dispositions, would withhold convergence, and stopping when it would not — a
  recommendation input only, never the pass's signal. At any round's turn, D5's re-inspection test may recommend a
  full pass instead, as the record's Owner chose after four rounds no whole-target reviewer had seen (Evidence). The
  next outer pass covers the last round's repairs; after the last pass, the post-settle coherence re-read does — by
  then the rounds have converged, or the Owner has stopped them with the residual named. The unattacked residual
  shrinks to the last round's repairs; it does not vanish. Because the rule lives in the method,
  `adversarial-review`'s final-fold residual paragraph narrows to match, the post-settle steps drop their restatement
  of that reason — the method owns it — and no stage gains a step.
- **The next pass sees it.** Every round's findings and repairs join that pass's applied response, so they reach the
  next pass in its prior findings — context, not the search frontier. Visible prior findings act as reminders for the
  kinds of slip they name, without measured cost to detecting other kinds (Prior art; single-round human review, so an
  inference for LLM reviewers).
- **Its target is the change since the last review.** In the first round it runs from the reviewed copy to the settled
  artifact; in each later round, from the version the previous round reviewed to the artifact its repairs left. The
  fix-check reviewer derives it by diffing the two, and checks the findings' actions against that diff, so a fold the
  account does not list is caught outside the author. Every recorded round before this draft's scoped from the account
  alone; this draft's own fix check diffed and found a change the account did not name. After the storage flip,
  `history` derives the change.
- **The reviewed versions are kept, locally.** At pass launch and at each round's launch, a caller with the planning
  checks on saves a copy of each of the work unit's planning artifacts present — draft, spec, task list, notes — since
  folds land beyond the reviewed set, under `.arc/user/{identity}/.internal/`, keyed by work unit or stub slug and by
  the version's content hash. The pass entry records each hash: the reviewed version as the pass's, and each round's as
  that round's. The copies go when the loop ends. That directory is per-machine and never serialized, so the copies
  stay out of the notes the personal workspace syncs, and a stub groomed before start has one too. Review tools keep
  every reviewed version as an immutable, reachable snapshot for the same reason (Prior art). A loop that moves to
  another machine or checkout loses its copies, and its fix check scopes from the findings' actions alone.

**Planning callers opt in.** One primary-side signature input, `planning-checks: on`, turns on both the independent
grounding run before the first pass (D1) and the offered fix check after each pass with folds. Like `pass-cap`, the
primary holds it and never serializes it to a reviewer. The draft, spec, and task-list fire-points and `amend-design`'s
pass set it. Verification callers omit it and keep their own loops; code-review lanes are other machinery, whose fixes
run through review increments.

### D4 — Classify each fold

Each disposition that fixes in place carries one tag, drawing `resolve-planning-depth`'s existing cut between
correcting an existing decision and authoring new design:

- **local correction** — an existing decision corrected where it stands;
- **new design** — the fix adds a concept, rule, type, field, or decision that reaches past its finding's locus.

A new-design fold runs `assess-design-proportionality` before the disposition set is presented, preferring removal of
the constraint that produced the defect over repair machinery — the lesson of the draft that settled on a reframe. A
new-design fold may also be a floor-raising signal for the re-entry valve. The Owner's approval of the tagged set
settles each tag, so the author's own tag never decides alone whether its fold is checked. A fold the Owner retags as
new design runs `assess-design-proportionality` before it lands, and a `revise` result returns as a changed
disposition for approval. The tag is an input and a record, never the fix check's gate.

### D5 — The loop's exit rule stays; its successor rationale gains the re-inspection test

Two routed concerns — convergence that read clean right after material findings, and a pass cap that ended silently —
are settled by `adversarial-review` § Exit gate as `review-signal-convergence` shipped it: convergence reads material
findings whatever their origin, so a fix-introduced major counts as any other; every result is
`Pass N of M`; `cap-exhausted` is a named stop; over-cap passes need explicit approval one at a time; and a successor
recommendation carries a cost-and-signal rationale. No change. The share of a pass's majors that land in the previous
pass's fixes stays evidence the primary may cite in that rationale. Each finding's account names whether it lands in a
previous pass's fix or a fix-check repair, so that share — and the success signal below — is readable from the record.
Which dispositions withhold convergence is the exit gate's own rule, which `review-driver-convergence` is correcting;
this design assumes the corrected rule and restates none of it.

The one addition is a principled reason to give in that rationale, from inspection practice: recommend another full
pass when the folds have changed the artifact so much that the last pass's assessment no longer holds; otherwise the
caller's own check of the response verifies the rework — the fix check, where the caller offers one (Prior art). It
is a recommendation input, never a trigger, and it authorizes nothing.

**The cap bounds autonomy, not advice.** A pass cap or configured ceiling limits what runs without asking — tunable to
the Owner's spend comfort — and is not a verdict that review is done. At the cap with material signal remaining, the
primary never launches another pass on its own, and never treats the cap as settling the question either: it states a
clear recommendation — another pass or stop — with its cost-and-signal rationale, so the Owner has the input to decide
whether to go over. The shipped method permits that recommendation ("may recommend"); this makes it the default at
`cap-exhausted`.

Both additions live in § Exit gate, so they reach every caller of the method — `verify-work-unit`'s
`validate-criteria` passes included — with no caller text. Code-review lanes reach a next-pass recommendation through
other machinery, `review-triage` and the review gate's pass policy, which already name the pass a fix will trigger and
its expected coverage, complete or incremental; applying the test there is routed to that machinery's owner
(Dependencies).

### Forward compatibility

- **Storage program.** Each adversarial pass becomes a review record at the storage flip (`storage-contract` D5), and
  the refinements between passes become the artifacts' history, derived rather than written. So the fix check's target
  is defined as last-reviewed version → settled version, which `history` derives after the flip. Neither auxiliary call
  mints a record kind: the independent run's finding set attaches to the first pass, and the fix check's to the pass
  whose fixes it checks — today sections of those passes' `ADVERSARIAL-PASSES.md` entries, in the file's current
  shape.
- **Procedure.** No prose-encoded trigger to evaluate — there is no tripwire. No new markup. The fix check reuses the
  method's report schema rather than a second hand-written shape. One file mechanic does enter method prose — copy,
  key, and remove the reviewed version — against the principle that prose names verbs, not file mechanics. It is a
  stopgap: `history` retires it at the storage flip, and a verb for it now would be machinery the flip deletes.
  Judgment-layer behavior like this wants an eval; that instrument is `workflow-eval-harness`'s.
- **Composition (`composable-workflows`).** That work unit generalizes `adversarial-review`'s signature-led method
  shape to workflows and extracts conditional arms as fragments, so the additions are authored to extract cleanly.
  `source-grounding` takes the method shape `adversarial-review` prototypes: a one-line signature, named inputs
  (artifacts with their upstream chain, and scope), a YAML callsite, and a return schema — `adversarial-review`'s
  report schema — in the public, overridable cell. The two auxiliary calls live in one section gated by one input;
  each has inputs and an outcome, the procedural kind that extracts whole as a private method, leaving one gate line.
  Cross-file pointers to that section and the pass-entry list cite `§` anchors, never step ordinals. The method
  declares `source-grounding` as today's schema allows; it becomes an arm-gated entry when conditional declaration
  lands.
- **Knowledge.** `source-grounding` has three direct consumers — `spec-review`, `task-audit`, and
  `adversarial-review` (its independent run and the fix check) — which earns the extraction; the four planning
  workflows reach it through them, and none re-declares it. The pointer rule's authority lives at its fire site, a
  stage-wide line in each planning workflow carries it to the write, and nothing grows the always-loaded set.

## Alternatives considered

- **A separate pre-flight method plus a separate fix check.** The routed captures' layering. Rejected for one check
  at two scopes (D1): the check is the same, only its target differs.
- **A tripwire-gated narrow attack.** After the fact (the share of findings in the previous fixes) or ahead of time (a
  fix that asserts behavior, adds a concept, needed an Owner decision, spans sections, or sits in a code-dense work
  unit). Rejected: no candidate is reliable, each is arbitrary at its edge, and a fold-scoped check's cost already
  tracks fold size. Owner-held decline replaces the trigger (D3).
- **The fix reviewer inside the next pass,** as one more fresh reviewer within one logical pass. Rejected: fix-borne
  findings would enter that pass's convergence signal and draw its attention — what the work unit exists to remove.
- **The fix check counted against the pass cap.** Rejected: a different purpose — verifying a response before review,
  the mirror of verifying a finding before fixing it.
- **An author-only fix check.** Rejected: the author examining its own fixes is not independent, and LLM
  self-verification without external signal does not improve output (Prior art).
- **An independent grounding run at every stage, every time.** Rejected: a fresh agent on every Light spec and task
  list, plus an approval stop `spec-review`'s inline posture does not have, for paths no pass will spend on.
  Independence goes where a pass will spend, and the stage's own check stays the floor (D1).
- **The pre-pass grounding or a last-pass fix check wired into each stage's workflow.** Rejected: the method's rules
  already cover both, and four workflow copies would restate them.
- **Git blob IDs for the reviewed version** (`git hash-object -w` at pass launch). Rejected: the blob is unreachable,
  so `git gc` prunes it after two weeks — within a long grooming loop.
- **Reviewed-version copies in the personal workspace,** beside `ADVERSARIAL-PASSES.md`. Rejected: that workspace
  syncs with the user's notes, carrying transient copies to every machine, and a stub groomed before start has none.
- **Pointers on "load-bearing" claims, or a `file:line` on every claim.** Rejected: the first is undecidable, the
  second churns and rots. Pointers by claim kind, symbol-grained (D2).
- **Re-pointing the successor pass at the fixes.** Rejected: it amends the method's rule that prior fixes are context,
  not the search frontier, and still spreads one reviewer across both jobs.
- **One fix-check round per pass.** Rejected on the record: task-list pass 5's rounds kept finding majors in the
  previous round's repairs, and one round would hand that layer to the post-settle re-read, the author's own read.
- **A cap on rounds.** Not needed: every round runs only on the Owner's approval at a disposition turn, so nothing
  runs without asking.
- **Folding a bounded few findings at a time.** A practice the routed pre-flight capture proposed. Not adopted: the
  record's fix-borne majors track new design inside a fold, not the number of fixes — task-list pass 5's round-one
  majors sat mostly in the two mechanisms the pass added. D4's proportionality run and further rounds answer that;
  batching would not.
- **An always-loaded reminder.** Rejected: it would restate verify-before-assuming, which already fails exactly when
  the author does not notice.

## Unknowns and Assumptions

No open design decisions remain.

- One Novel work unit's pattern generalizes to `Heavy` work, with light work mostly declining the fix check.
- A fix-check round costs about one subagent, and the record's heaviest pass took four rounds; the independent
  grounding run costs about one per accepted first pass, and the stage's own check stays in-context.
- Naming the actor would have forced the grounding the vague claims skipped — tested against two recorded slips.

## Scope

**In:**

- `source-grounding`, a new configurable method, installed the way the last method was: its `init-recipe.json`
  entry, the configurable-file list in `classification.ts` (omission silently classifies it framework-owned), the
  self-hosting manifest, the install and update test inventories, and the package-sync strategy's inventory.
- `adversarial-review`: the `planning-checks` input; one section for the two auxiliary calls — their shared terms once,
  then the independent run before the first pass and the fix check after each pass with folds, in Owner-held rounds,
  each with its scope, timing, rubric, inputs, and prompt variant; keeping the reviewed versions; the fold tag; the
  narrowed final-fold residual; the pass-entry contents, listed once where the method already names the record — the
  reviewed version and each fix-check round's as content hashes, `Pass N of M`, the rubric, the finding/account/action
  set with each fold's tag and each finding's origin, the independent-run set and each fix-check round's set, the stop
  reason, and any conditional next-pass decision; in § Exit gate, the re-inspection test and the recommendation default
  at `cap-exhausted`.
- `spec-review`'s grounding slice and `task-audit`'s grounding floor: claim grounding handed to `source-grounding`,
  author-run and behavior-grade.
- `amend-design`: `planning-checks: on` on its pass; `spec-review`'s grounding slice at scope at every depth and in
  its pass rubric; the stage-wide D2 line.
- The three planning workflows: `planning-checks: on` in each callout; the stage-wide D2 line; their copies of the
  pass-entry list replaced by a `§` pointer to the method's; and the post-settle steps' restated residual reason
  removed. `amend-design`'s "as the planning passes do" points to the same section.
- `lint:arc:triggers` checks that the new method is declared; fire-point markers in its three consuming methods are
  checked by hand, since no fire-point validator exists.

Package source first, synced to `.arc/`.

**Won't do:**

- No CLI behavior change, stored record, or recording verb — the classifier entry registers the file and changes no
  behavior; no change to the pass cap or the convergence rule.
- No always-loaded content.
- No fix check at verification or code-review callers, and no change to code-review lanes' pass recommendation —
  routed to its owner.
- No mechanical pointer enforcement — `knowledge-lint`'s.
- No re-validation of grounded claims after the base moves — dependency conformance, held for `decomposition-doctrine`
  with the general rule at `cross-wu-coordination`. Named actors give it a re-check list.
- No `generate-tasks` entry gate — `planning-iteration-mechanics`' open question, adjacent to the artifact-scope check.
- No eval — `workflow-eval-harness`.

## Success signal

On the next `Heavy` or `Novel` work unit planned with this in place, the share of its successor passes' majors that land
in earlier fixes — a pass's fixes or a fix check's repairs — taken across all those passes, falls clearly below
`storage-contract`'s two thirds: 16 of 24 majors over the five passes Evidence counts, while task-list pass 3, which
followed a grounding trace, had none. That work unit's first-pass majors are mostly design findings rather than slips in
claims the grounding check covers. Majors count once verified; a rejected finding does not count.

## Dependencies

- **Coordination (not blockers), routed at draft close:**
    - `knowledge-lint` — enforces that named symbols resolve. Its inbound entry still names
      `planning-iteration-mechanics` as the convention's owner, stale since this work unit's extraction, and expects to
      enforce "absence/shape rules". Under D2 no marker exists and whether a claim states shipped behavior is not
      mechanically decidable, so lint can check that a named symbol resolves but cannot detect a missing one.
    - The adversarial-pass record (`storage-contract` D5; the recording-verb capture targets
      `review-orchestration-right-sizing`) — recording is one call at the disposition approval, but two auxiliary
      finding sets sit beside a pass's own: the independent run's, approved before the first pass against an earlier
      version, and the fix check's, approved after the pass's disposition. The record schema either admits both or
      recording moves to successor launch; that owner decides. A fix check may run several rounds, and the record
      needs each finding's origin — whether it lands in a previous pass's fix or a fix-check repair (D5).
    - `review-orchestration-right-sizing` — whether code-review lanes' next-pass recommendation adopts the
      re-inspection test beside its existing complete-or-incremental coverage (D5).
    - `planning-iteration-mechanics` — whether `generate-tasks` gates spec readiness at entry sits beside the
      artifact-scope check.
    - The dependency-conformance capture — named actors serve its re-check.
- **Upstream, in flight:** `review-driver-convergence` — a rejected or deferred finding stops withholding convergence
  at any severity. D5 assumes the corrected exit gate, and the round recommendation reads that same rule (D3).
- **Storage program:** keep anything recorded about a pass within today's `ADVERSARIAL-PASSES.md` file and shape, and
  add no stored record.

## Continuity

- **Readiness:** formalization-ready — every settle-able decision is settled and the success signal is stated.
- **Resolved:** `Class` and boundary; D1–D5, with prior art folded in (factored, probe-backed grounding; the next pass
  seeing the fix check; the kept reviewed versions; the re-inspection test; the cap bounding autonomy rather than
  advice); the method's name; the fix check's rubric home, inputs, caller opt-in, rounds, and last-pass coverage; the
  exit gate's reach beyond planning; forward compatibility, `composable-workflows` included; the alternatives above.
  Adversarial passes 1 and 2 and both passes' fix checks (2026-10-01) moved independence to an accepted pass and the fix
  check, brought `amend-design` in as a planning caller at every depth, carried the D2 rule to each planning workflow,
  named the method's full install surface, stated each auxiliary call's terms once, made the fix check repeat in
  Owner-held rounds with a per-round target and one recommendation rule read from the exit gate, extended the
  propagation sweep into source, and recalibrated the success signal against the record's sixteenth pass. All five
  routed concerns are integrated: the fix check and pre-flight into D1 and D3, source grounding into D2, and the
  convergence and cap concerns discharged in D5.
- **Open:** none.
- **Next:** route the coordination items at draft close; then `create-spec`.

---
