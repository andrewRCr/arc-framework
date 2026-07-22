# Draft: Solution Proportionality

- **Origin:** `USER-INBOX § Work Unit`, routed at the 2026-07-21 housekeep drain from decomposition-program
  grooming.
- **Purpose:** Make ARC challenge whether a candidate design is justified by its chartered problem while the draft
  and spec are still being authored, then re-check that judgment before finalization, task generation, and
  decomposition can ratify unnecessary machinery.

---

## Problem / Motivation

ARC's planning instruments are asymmetric: they search for missing coverage and under-delivery, but no standing
instrument asks which design elements the motivating problem does not justify. Overdesign can therefore pass every
gate and surface only after the design has been fully elaborated or implemented, when shrinking it means undoing
work instead of declining unnecessary machinery at the point of choice.

The guard must operate on the **design**, before tasks are cut. Implementation-time simplification is a useful
downstream discipline but is too late for this concern: faithfully implementing a disproportionate spec still
produces a disproportionate system.

The guard must also be model-agnostic and artifact-level. It should express the carrying cost of unnecessary
machinery, not encode assumptions about any current model's tendencies.

### Concrete precedent cases

This is not an abstract failure mode. Two recent work units expose different versions of it:

- **`review-architecture`** shipped a coherent but enormous review model (its own completion record reports 307
  files and roughly 24.4k inserted lines). Verification then found typed contracts with no production caller. Its
  active follow-on, `review-surface-binding`, now carries a proportionality revision that reduced a sketched twelve
  public verbs to seven, replaced durable fix-carry machinery with re-review at the new head, made local-operator
  anti-tamper a permanent non-goal, and reserved evidence-grade persistence for evidence that can actually satisfy
  a gate. It also owns a prune-at-consumption pass over dormant predecessor machinery.
- **`session-locus-model`** solved all six motivating checkout/recovery failures, but a post-implementation
  `design-audit` found that the spec had answered deliberately open questions at the maximum-exactness end of the
  range. Its remedial Phase 7.R now removes or demotes a harness-capability refusal, host-truth re-entry gates, a
  digest-backed housekeep commitment protocol, cross-machine grooming arbitration, and noisy routine narration.
  The retained boundary is consequence-based: full exactness for data-destroying paths; advisory or simple-conflict
  semantics for ordinary operator-facing paths.

The shared hypothesis to test is not merely "large WUs are bad." Both designs could justify substantial machinery.
The likely failure pattern is that completeness and exactness were evaluated one-way: every imagined state received
a mechanism, but each mechanism was not forced to show a chartered need, an authority or consequence proportional
to its ceremony, and the absence of a viable composition from existing substrate or cheap recovery.

## Proportionality Semantics

The comparison is **candidate solution ↔ chartered problem and real constraints**. It is not project prestige,
team size, schedule appetite, or current codebase size.

- **No project-size or team-size discount.** "Solo project," "early-stage project," "small codebase," or "few
  users today" does not by itself justify a weaker design. ARC must not bias a project downward with "you do not
  need all this" reasoning.
- **Real context still counts.** Active user scale, security and trust boundaries, data-loss impact, recovery cost,
  compatibility promises, operational environment, and plausible growth can create genuine requirements. They
  matter through the concrete requirement or failure consequence they establish, not as status proxies.
- **Adequacy remains a floor.** Proportionality is a two-sided test: remove accidental complexity without shaving
  off mechanisms required for correctness, safety, or a stated goal. A smaller design is not better when it merely
  externalizes risk or leaves a requirement unanswered.
- **Appetite is orthogonal.** `planning-iteration-mechanics` owns the time/continuation question: whether to keep
  investing, cut scope, or park the work. This work unit asks whether the solution chosen for the accepted scope is
  justified. The two concerns may share evidence but retain separate owners and decisions.
- **Composition before invention.** A candidate should use existing ARC concepts, methods, records, verbs, and
  lifecycle seams where they satisfy the need. New substrate is justified only when the existing substrate cannot
  carry a chartered requirement without distortion.
- **Lifecycle cost counts.** A mechanism's cost includes new concepts, states, schemas, persistence, recovery,
  migration, configuration, narration, tests, and future compatibility obligations—not only implementation lines.

## Direction

### One canonical method, applied at more than one time

Extract `assess-solution-proportionality` as the one public judgment method:

```text
assess-solution-proportionality(problem, candidate, substrate-referents?) -> { verdict, findings }
```

Its named inputs are:

| Input                 | Kind     | Contents                                                                                     |
| --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `problem`             | required | Chartered goals and scope plus real constraints, failure consequences, and trust boundaries. |
| `candidate`           | required | The candidate design at its current maturity, from an emerging direction through a spec.     |
| `substrate-referents` | optional | Key existing ARC surfaces; otherwise discover them narrowly from the problem and candidate.  |

The result is decision-bearing rather than a bag of unranked observations:

- **`proportionate`** — `findings` is empty; proceed.
- **`revise`** — one or more findings identify a design correction required before the caller proceeds. Each
  finding records `kind`, candidate `locus`, source-grounded `evidence`, and a `credible-alternative`. The closed
  kinds are `unsupported-machinery`, `missed-composition`, `disproportionate-rigor`, `speculative-capability`, and
  `adequacy-regression`.

Only report a finding when removing or recomposing the mechanism would materially reduce lifecycle cost without
losing required behavior, or when a proposed simplification would lose required behavior. Broader fit rationale
residue stays with `design-audit`; this method has no ambiguous direct-call note tier. The caller owns timing and
routing; the method owns this contract and the criteria below:

1. **Goal-to-mechanism trace:** Which chartered goal, constraint, failure mode, or trust boundary requires each
   material mechanism? An element with no answer is presumptively excess.
2. **Minimal credible alternative:** What is the least elaborate design that still satisfies the goals and real
   constraints? This is a counterfactual baseline, not an automatic winner.
3. **Existing-substrate composition:** Which existing ARC primitive already supplies all or part of the needed
   behavior? If a new primitive remains, what concrete mismatch makes composition insufficient?
4. **Marginal justification:** Relative to the credible baseline, what additional requirement or risk reduction
   buys each increment of machinery, and is that benefit commensurate with its lifecycle cost?
5. **Consequence-scaled rigor:** Is exactness placed where failure is destructive, authoritative, irreversible, or
   expensive, while cheap-to-retry and advisory paths use correspondingly lighter recovery and ceremony?
6. **Essential-complexity check:** Would removing the mechanism leave the problem intrinsically complex, or is the
   mechanism itself creating states, coordination, or recovery obligations the charter never demanded?

The lens should scale naturally with planning depth. A `brief` may clear it in a sentence or no recorded prose; a
design with several non-obvious mechanisms may need an explicit baseline and justification. Do not make every spec
carry boilerplate merely to prove the check ran.

### Apply during authoring, before sunk design effort

- **`draft-design`:** Apply the lens whenever a candidate direction introduces a material mechanism. Ask the
  baseline, composition, and marginal-justification questions before elaborating that mechanism into a rich draft.
  This must apply at every depth; the current high-path "minimum viable version" prompt is too narrow a home.
- **`create-spec`:** Re-apply the same lens while crystallizing the design at every spec form. The spec should
  remove unsupported machinery, not merely document it more precisely. A non-obvious proportionality judgment may
  be recorded in Alternatives / Decisions / Rationale according to form, while obvious cases stay terse.

Both workflows declare the method because both invoke it directly. The call is always-on but judgment-shaped: no
new state machine, probe slot, configuration axis, or agent-interpreted control flow.

### Re-check at the two design boundaries

`design-audit` is already declared by both `draft-design` and `create-spec`, and both stages include it in their
pre-finalization adversarial rubric. Its Fit lens already says complexity should be proportional to the problem.
Keep that semantic relationship without inventing an unavailable method-to-method load contract: both workflows
declare `assess-solution-proportionality` directly and supply it beside `design-audit` in the adversarial rubric.
`design-audit` points its proportionality criterion to the canonical method rather than restating its questions.
The full audit keeps its finished-draft floor; the extracted method remains usable while a candidate is still
forming.

The final check cannot be the only check—otherwise ARC discovers excess after paying to design it. It also should
not depend solely on accepting an optional fresh-context adversarial pass. The in-context authoring workflow should
re-apply the lens before its interlock; the adversarial `design-audit` pass independently attacks the same judgment
when invoked.

A direct `revise` verdict is a design-readiness gap: revise the candidate and re-run the method before the workflow
interlock. In the paired adversarial rubric, an `adequacy-regression` that breaks a goal maps through
`design-audit` to `blocker`; the other four kinds map to `major`. `design-audit` may still report its own `minor`
fit residue outside this method's revision threshold. These are two executions of one criterion, not two
independently authored rules.

### Keep a task-generation backstop

Task generation may materialize scale the draft and spec made hard to see. Re-run the method immediately after
Structural decomposition produces the phase / parent skeleton and rough subtask-count signals, before Content fill
and before the planned cohort/decomposition tripwire. **Shrink before split:** a `revise` verdict stops the current
path, routes back to amend the spec, and invalidates the provisional skeleton. Restart `generate-tasks` at **Resolve
depth & Class**, re-run the scale-axis read against the amended design, and rebuild the skeleton from scratch under
the newly resolved level and path. The existing Class ratchet still governs; the route neither forces a Class
demotion nor preserves a skeleton derived from a superseded spec. A proportionate but large surface proceeds to the
split reading. This is a backstop and correction route, not the primary detection point; most excess should already
have been declined in `draft-design` or `create-spec`. `generate-tasks` therefore declares the method as its own
direct consumer.

## Industry Idiom Grounding

A bounded research pass found a useful convergence: established idioms do not say "make the design small" or
"match the design to the team." They say to incur complexity for concrete, evidenced needs and to distinguish the
problem's inherent complexity from complexity introduced by the solution.

- **Essential vs. accidental complexity.** Brooks' distinction gives the main anti-overshoot rail: the guard should
  remove complexity created by the chosen solution without pretending the domain's essential difficulty can be
  designed away. This is why the credible baseline must still satisfy every goal and real constraint
  ([Brooks][brooks]).
- **Simple design has an ordered adequacy floor.** Kent Beck's rules, as summarized by Fowler, put passing behavior,
  clear intent, and absence of duplication ahead of merely having fewer elements. "Fewest elements" therefore
  means the least machinery after adequacy and clarity hold, not minimalism as the first objective
  ([Beck/Fowler][beck-design]).
- **YAGNI targets speculation, not malleability.** It argues against features and flexibility built for unneeded
  future cases while preserving refactoring and the ability to change when a need becomes real. For ARC, a known
  forward constraint may justify a seam; an imagined option does not justify building the future mechanism now
  ([Fowler][yagni]).
- **Information hiding follows credible change axes.** Parnas' modularization criterion is a useful test for a new
  abstraction: hide a design decision that is genuinely likely to change, rather than creating structure around
  workflow steps or hypothetical variation. The test is evidence of volatility, not project/team size
  ([Parnas][parnas]).
- **Prefer deep composition over broad scaffolding.** Ousterhout's "deep module" framing supports reusing an
  existing ARC seam that hides substantial behavior behind a small interface, and challenges generic substrate
  that spreads dependencies or exposes more concepts than the charter needs ([Ousterhout][ousterhout]).
- **Demand evidence for optimization complexity.** Knuth's argument is implementation-oriented, so it is supporting
  rather than governing doctrine here. It still supplies a sound special-case question when a design adds
  machinery for performance: is the critical path measured, or guessed ([Knuth][knuth])?

The synthesis for this work unit is: **justify complexity by chartered behavior, known constraints, credible change
axes, and consequence; preserve a clean path to evolve; do not prepay for hypothetical capability.** None of these
idioms supports discounting a design because the project is solo, young, or currently small.

## Recording and Placement

The method is the canonical home because it has genuine fan-in: two authoring workflows, their boundary checks,
`design-audit`, and the task-generation backstop. That satisfies the knowledge-architecture extraction rule without
growing always-loaded context.

Use the loading substrate that exists now rather than silently depending on the future transitive-closure model:

- `draft-design`, `create-spec`, and `generate-tasks` each declare `assess-solution-proportionality` because each
  invokes it directly;
- the draft-readiness and spec-finalization adversarial call sites explicitly supply both
  `assess-solution-proportionality` and `design-audit` as their rubric methods;
- the standalone `arc-design-audit` skill maps its `design` input to `candidate`, derives `problem` from its
  existing goal referents or the artifact, accepts optional `substrate-referents`, and explicitly loads and runs
  both methods, preserving the same design check through that entry door; and
- the methods index records the relationship so either method's readers can find the canonical proportionality
  criterion.

This repeats known-consumer dependency declarations, not the criterion itself. Do not add a method dependency
field or transitive resolver in this work unit. `knowledge-architecture` already owns that future substrate; its
inbox receives this method pair as a concrete regression case. Once transitive loading ships, the compatibility
declarations can collapse without changing the criterion or its fire points.

Do not add a mandatory spec slot or a proof-of-check marker. Recording is proportional too:

- a non-obvious mechanism's justification lands in the artifact's existing Alternatives, Decisions, Rationale, or
  equivalent section;
- an obvious proportional candidate needs no ceremonial evidence line; and
- a finding that changes the design is folded into the forward artifact with no audit provenance.

The shipped method uses ARC-native criterion names and questions. Brooks, Beck, YAGNI, Parnas, Ousterhout, and
Knuth remain planning rationale, not new load-bearing vocabulary every executing agent must learn.

## Scope Boundaries

- Keep the appetite/continuation tripwire with `planning-iteration-mechanics`; coordinate the evidence seam only.
- Do not use project size, team size, current codebase size, or present-day popularity as a complexity allowance or
  denial. Only requirements, constraints, risks, and failure consequences count.
- Do not turn this into an implementation-cleanup or code-refactoring standard. It acts on candidate designs before
  tasks exist; ordinary KISS/YAGNI implementation guidance is supporting input, not the owner.
- Do not absorb decomposition doctrine. This work owns shrink; `decomposition-doctrine` owns split, in that order.
- Do not retroactively remediate `review-architecture` or `session-locus-model`; their existing owners carry those
  corrections. Use them as evidence and regression fixtures for this guard.

## Success Signals

- Applied to the two precedent designs before task generation, the method identifies the unsupported or
  over-rigorous mechanisms their later right-sizing records removed or demoted.
- A complex design whose mechanisms trace to real requirements, trust boundaries, or costly failure modes passes
  without being discounted because the project is solo, young, or currently small.
- `draft-design`, `create-spec`, `design-audit`, and the task-generation backstop all read one canonical criterion;
  no duplicated checklist can drift independently.
- Every known entry path loads the canonical criterion under the current contract: direct workflow declarations
  for the three planning stages, explicit paired adversarial rubrics at the two design boundaries, and an explicit
  paired load in the standalone design-audit skill.
- Direct callers receive one deterministic routing result: `proportionate` proceeds; `revise` identifies the
  source-grounded design corrections required before proceeding.
- Task generation routes `revise` back to the spec before content fill or decomposition, restarts its scale/Class
  read, and rebuilds rather than preserving the invalid skeleton; a large but justified design proceeds unchanged.
- Non-obvious proportionality rationale survives in the artifact's existing decision structure without adding a
  mandatory section or proof marker to every spec.

## Resolved Decisions

- The canonical home is a new public `assess-solution-proportionality` method, not an expanded audit-only passage or
  a mandatory spec field.
- `draft-design` and `create-spec` use it while authoring and re-run it before their workflow interlocks.
- The two adversarial design-boundary rubrics pair it explicitly with `design-audit`; `design-audit` references the
  canonical Fit criterion without claiming an unsupported transitive load dependency.
- The method takes `problem`, `candidate`, and optional `substrate-referents`, and returns `proportionate | revise`
  with closed, structured finding kinds. Direct `revise` blocks readiness; adversarial findings map into
  `design-audit` severity without inventing a second decision tier.
- `generate-tasks` and the standalone `arc-design-audit` skill declare or load it explicitly at their own entry
  points; the skill maps its existing inputs and adds optional substrate referents. The methods index records its
  relationship with `design-audit`.
- Transitive method dependency loading stays with `knowledge-architecture`; this work uses compatibility
  declarations at known consumers and supplies the method pair as that WU's regression case.
- Direct boundary failures are readiness gaps; adversarial discoveries retain `design-audit` severity. Both read
  the same criteria.
- Non-obvious justification records in existing artifact sections; no marker proves that the check ran.
- The task-generation backstop fires after the structural skeleton and before content fill / decomposition. A
  `revise` result amends the spec and restarts the stage's scale/Class read before rebuilding the invalid skeleton.
- Industry idioms inform the ARC-native criteria but do not become runtime vocabulary or project/team-size proxies.
- The concern stays one work unit: authoring, audit composition, and the task backstop are consumers of one judgment
  contract, not independently deliverable subsystems.

## Scope Estimate

Crosses one canonical method, the `draft-design` and `create-spec` authoring and boundary fire sites,
`design-audit` Fit alignment, the standalone design-audit skill, the methods index, and a generate-tasks backstop
coordinated with decomposition. Framework surfaces require package-source and project-copy synchronization. The
method and workflow judgment changes also need behavior-level verification against the two precedent designs plus
proportional and under-designed counterexamples.

`Class: Heavy`: a real design was authored across several existing planning surfaces, but it composes established
ARC methods and fire points rather than inventing a new model. The draft-design depth was `medium`—a bounded set of
placement and guardrail decisions—and the concern stays one work unit under the cohort-fit discriminator.

---

[beck-design]: https://martinfowler.com/bliki/BeckDesignRules.html
[brooks]: https://www.cs.unc.edu/techreports/86-020.pdf
[knuth]: https://pic.plover.com/knuth-GOTO.pdf
[ousterhout]: https://web.stanford.edu/~ouster/cgi-bin/book.php
[parnas]: https://prl.khoury.northeastern.edu/img/p-tr-1971.pdf
[yagni]: https://martinfowler.com/bliki/Yagni.html
