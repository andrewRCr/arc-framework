# Spec (`detailed` · `RFC`): Solution Proportionality

- **Origin:** [internal]

- **Purpose:** Give ARC one canonical planning-time judgment for whether a candidate design's machinery is
  justified by its chartered problem and real constraints. Apply it while drafts and specs are being authored,
  re-check it at design boundaries, and stop task generation from institutionalizing excess before decomposition.

---

## Introduction / Context

ARC's planning instruments test chiefly for missing coverage and under-delivery. They do not consistently ask
which material mechanisms the motivating problem fails to justify. A coherent but disproportionate design can
therefore reach task generation or implementation before anyone tests whether existing substrate, a cheaper
recovery path, or less exact ceremony would satisfy the same charter.

Two recent work units make the failure concrete. `review-architecture` shipped a large review model with typed
contracts that verification later found had no production caller; `review-surface-binding` subsequently reduced
its proposed public verbs, removed durable fix-carry and local-operator anti-tamper machinery, limited
evidence-grade persistence to satisfying evidence, and adopted prune-at-consumption. `session-locus-model` solved
its six motivating failures, then opened a remedial Phase 7.R to remove or demote maximum-exactness machinery on
routine operator paths while retaining full exactness for destructive ones.

The concern is the design, not implementation cleanliness. KISS or YAGNI applied while coding cannot repair a spec
that already requires unnecessary state, persistence, recovery, configuration, narration, or compatibility
obligations. The challenge must happen before tasks are cut, and early enough within draft and spec authoring that
ARC has not already paid to elaborate the mechanism it later rejects.

Proportionality is also not a status judgment about the project. Team size, repository age, current codebase size,
and present popularity neither justify nor disqualify a design. Active user scale, security boundaries, data-loss
impact, compatibility promises, operational conditions, and credible growth matter only through the concrete
requirement or failure consequence they establish.

## Goals

- Detect unsupported machinery, missed composition, speculative capability, and disproportionate rigor while a
  candidate design is still forming.
- Preserve an explicit adequacy floor so simplification never removes behavior required for correctness, safety,
  trust, or a stated goal.
- Give `draft-design`, `create-spec`, their adversarial design checks, the standalone design-audit door, and task
  generation one canonical criterion instead of independently maintained checklists.
- Compose with the shipped method-loading, workflow, skill, and task-generation substrate without adding runtime
  state, configuration, proof markers, or agent-interpreted control flow.
- Make task generation shrink a disproportionate design before applying decomposition to a large surface.
- Keep the result invariant across project and team shapes: the candidate is measured against the chartered
  problem and real constraints, never against perceived project importance.

## Non-Goals

- Deciding how long to keep planning, how much time to invest, or whether to cut accepted scope;
  `planning-iteration-mechanics` owns appetite and continuation.
- Defining implementation-time code simplification or refactoring guidance.
- Defining when a justified large concern should split; `decomposition-doctrine` owns decomposition after this
  work's shrink check.
- Retrofitting the `review-architecture` or `session-locus-model` implementations; their current owners carry the
  remedial changes.
- Adding method-to-method dependency fields or a transitive load resolver. `knowledge-architecture` owns that
  future substrate and has this method pair captured as a regression case.
- Adding a mandatory proportionality section, proof-of-check marker, configuration switch, persistent result, or
  new CLI command.

## Proposed Design

### PD1. Proportionality invariant

Compare the **candidate solution** with the **chartered problem and real constraints**. The least elaborate
credible design is a counterfactual baseline, not an automatic winner: it must still satisfy every goal and real
constraint. A smaller candidate that externalizes risk or drops required behavior is under-designed and fails the
same method.

Assess the full lifecycle cost of a material mechanism: concepts, states, schemas, persistence, recovery,
migration, configuration, narration, tests, and future compatibility obligations. New substrate is justified only
when existing ARC concepts, methods, records, verbs, and lifecycle seams cannot carry a concrete requirement
without distortion.

### PD2. Canonical method contract

Create the public `assess-design-proportionality` method with this signature:

```text
assess-design-proportionality(problem, candidate, substrate-referents?) -> { verdict, findings }
```

| Input                 | Kind     | Contents                                                                                     |
| --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `problem`             | required | Chartered goals and scope plus real constraints, failure consequences, and trust boundaries. |
| `candidate`           | required | Candidate design plus any stage-available materialized planning evidence.                    |
| `substrate-referents` | optional | Key existing ARC surfaces; otherwise discover them narrowly from the problem and candidate.  |

`candidate` spans the artifact's current maturity, from an emerging direction through a spec and provisional task
skeleton. Callers include only evidence available at their stage.

The method returns one decision-bearing result:

- **`proportionate`** — `findings` is empty; the caller proceeds.
- **`revise`** — every finding identifies a design correction required before the caller proceeds. A finding
  records `kind`, candidate `locus`, source-grounded `evidence`, and a `credible-alternative`.

Finding `kind` is a closed set:

- `unsupported-machinery` — no chartered goal, constraint, failure mode, or trust boundary requires the mechanism.
- `missed-composition` — existing substrate satisfies the need without the new mechanism's additional obligations.
- `disproportionate-rigor` — exactness, persistence, recovery, or ceremony exceeds the authority or consequence
  of the path it protects.
- `speculative-capability` — the mechanism prepays for a hypothetical option or change axis without credible
  evidence that it is required now.
- `adequacy-regression` — a proposed simplification loses behavior required by the problem or real constraints.

Only report a finding when removing or recomposing a mechanism would materially reduce lifecycle cost without
losing required behavior, or when a proposed simplification would lose required behavior. The method has no
non-decision-bearing note tier. Broader fit rationale residue remains `design-audit`'s concern.

### PD3. Assessment lens

The method applies six questions as one judgment:

1. **Goal-to-mechanism trace:** Which goal, constraint, failure mode, or trust boundary requires each material
   mechanism? An element with no answer is presumptively excess.
2. **Minimal credible alternative:** What is the least elaborate candidate that still satisfies the problem and
   real constraints?
3. **Existing-substrate composition:** Which current ARC primitive supplies all or part of the behavior, and what
   concrete mismatch prevents composition when a new primitive remains?
4. **Marginal justification:** What additional requirement or risk reduction buys each increment beyond the
   credible baseline, and is that benefit commensurate with its lifecycle cost?
5. **Consequence-scaled rigor:** Is exactness concentrated where failure is destructive, authoritative,
   irreversible, or expensive while retryable and advisory paths use lighter recovery and ceremony?
6. **Essential-complexity check:** Would removing the mechanism expose complexity intrinsic to the problem, or
   remove states and coordination created by the solution itself?

The criterion is invariant; recording scales to the candidate. An obvious case may produce no prose. A design with
non-obvious machinery records its justification in the artifact's existing Alternatives, Decisions, Rationale, or
equivalent structure.

### PD4. Authoring-time integration

Both `draft-design.md` and `create-spec.md` declare `assess-design-proportionality` in `arc.methods` because both
invoke it directly.

- **Drafting:** Add one shared authoring guard that applies at every drafting depth. Run it when a candidate
  direction introduces a material mechanism, before elaborating that mechanism, and re-run it at loop exit before
  the readiness/interlock boundary. A `revise` result stays in the drafting loop; `proportionate` adds no stop or
  evidence line.
- **Spec crystallization:** Apply the same guard while discovery translates the settled design into every spec
  form, and re-run it over the saved spec before the finalization self-review. A `revise` result is a readiness gap.
  Correct the spec in place when the finding identifies a named, already-settled mechanism, shape, or interface that
  is merely wrong. When resolution requires new design to be authored or reopens an unshaped or under-derived
  direction, use `resolve-planning-depth`'s existing mid-stage re-entry valve and route back to `draft-design`.
  `proportionate` proceeds without ceremony.

The workflows instantiate the method with the current problem/candidate and optional key substrate pointers. They
do not restate its checklist, introduce a detector, or create persistent state.

### PD5. Design-boundary composition

Keep `design-audit`'s finished-draft floor and broader efficacy/fit role. Under its Fit lens, point material
complexity mismatch to `assess-design-proportionality` rather than duplicating the six questions.

At the draft-readiness and spec-finalization adversarial call sites, explicitly supply both
`assess-design-proportionality` and `design-audit` in the rubric. The workflows already declare `design-audit` and
now also declare the proportionality method, so fresh reviewers receive both under the shipped loading contract.

Map proportionality findings into `adversarial-review`'s existing severity enum:

- an `adequacy-regression` that breaks a stated goal is `blocker`;
- an `adequacy-regression` short of goal-breaking and each of the other four kinds is `major`; and
- `design-audit` may still emit its own `minor` fit residue outside the proportionality revision threshold.

The fresh reviewer reports findings read-only. Existing primary-held verification, disposition approval, pass-cap,
and convergence rules remain unchanged.

### PD6. Standalone design-audit door

Extend the canonical `arc-design-audit` skill to load and run both methods. Preserve its existing `design` and
optional `goal-referents` inputs, map `design` to `candidate`, derive `problem` from `goal-referents` or the
artifact's problem statement, and accept optional `substrate-referents`.

The door remains user-invoked, read-only, and floored at a finished draft because `design-audit` owns the door's
eligibility. It reports the combined recommendations through `design-audit`'s existing severity vocabulary; it
does not expose a second gate or mutate the target.

### PD7. Task-generation backstop

Declare the method in the package `generate-tasks.template.md` and its rendered `generate-tasks.md` workflow. Run
it after Structural decomposition has produced phases, parent skeletons, and rough subtask-count signals, but
before Content fill and before any decomposition reading.

For this call, map the current spec and provisional task skeleton into `candidate`: include the spec decisions,
phase count, parent-task titles and anchors, and rough subtask-count signals. The backstop therefore re-evaluates
the design with the materialized planning evidence that prompted the late read; it does not merely rerun the
method over the unchanged spec.

- **`proportionate`:** continue on the current path. Large but justified scope is not a finding.
- **`revise`:** surface the findings and proposed spec correction at a conditional `workflow-interlock`; do not
  mutate the spec or skeleton before approval. On approval, amend `spec-{name}.md` in place, discard the
  provisional skeleton derived from the superseded spec, and restart `generate-tasks` at Resolve depth & Class.
  Re-read the scale axis and rebuild from scratch under the newly resolved level and path.

The existing Class ratchet continues to govern. Restarting does not force a Class demotion, and the no-demotion
guard does not preserve an invalid task artifact whose design referent changed. A declined finding leaves the
existing candidate unchanged and returns control to the developer; it is never silently treated as
`proportionate`.

### PD8. Loading, indexing, and two-copy delivery

Use the loading substrate that exists now:

- `draft-design.md`, `create-spec.md`, and `generate-tasks.template.md` declare the method directly;
- both adversarial design-boundary rubrics name the method beside `design-audit`;
- the standalone skill explicitly loads both methods; and
- `methods/README.md` records `assess-design-proportionality` and `design-audit` as related methods, while the
  canonical skills `README.md` lists the standalone design-audit door.

These are compatibility declarations at known consumers, not duplicated criteria. Do not add dependency fields to
method frontmatter or teach the trigger auditor transitive resolution in this work unit.

All adopter-facing edits originate in `packages/arc-framework/arc/` and project into `.arc/` under the existing
two-copy discipline. In particular, edit `generate-tasks.template.md` in package source and render its
`generate-tasks.md` project counterpart; do not copy the rendered project workflow back into the template. Add the
new method and update the workflow, method, index, and canonical skill copies in both package source and the
self-hosted project instance as their classifications require.

Close the install inventory for the touched planning chain. Add the new method and `arc-design-audit` skill to
`init-recipe.json`. The recipe currently also omits existing method files directly declared by these three planning
workflows: `assess-cohort-fit`, `assess-draft-readiness`, `adversarial-review`, `design-audit`, and `task-audit`.
Add those direct dependencies so a fresh install does not receive workflows that point to absent methods. Register
the six installed method files as Configurable in `classification.ts`, matching the method override contract.

Register `arc-design-audit` in `src/lib/skills/resolution.ts`'s `CANONICAL_SKILLS` list so normal init/update skill
generation projects the installed canonical source into every selected harness directory. Extend the typed
skill-description unit fixture for the new registry member; the existing all-canonical unit and integration loops
must then exercise its generation and update behavior alongside the other standalone doors.

This is bounded delivery closure, not the systemic recurrence fix. `self-hosting-manifest-freshness` retains
ownership of automatically detecting or eliminating future recipe/manifest inventory omissions. Do not absorb its
general guard or broader manifest-freshness repair into this work unit; only the recipe-derived entries and hashes
required by the touched inventory land here.

### PD9. Recording and vocabulary

Do not add a mandatory spec section or proof marker. A non-obvious justification belongs in an artifact's existing
decision structure; an obvious proportional candidate needs no evidence line; a finding that changes the design is
folded into the forward artifact without audit provenance.

The shipped method uses the ARC-native names in PD2 and PD3. Industry sources inform the rationale but do not add
runtime vocabulary executing agents must learn.

## Alternatives & Rationale

- **Expand only `design-audit`.** Rejected because its finished-draft floor and optional adversarial invocation
  discover excess after the mechanism has already been elaborated. The audit remains a boundary re-check, not the
  only guard.
- **Copy a checklist into each workflow.** Rejected because the criterion would drift across drafting, spec
  creation, audit, and task generation. The second consumer justifies one public method.
- **Require a minimal-solution or proof-of-check spec section.** Rejected because obvious cases would carry
  boilerplate unrelated to their design complexity. Existing rationale sections are sufficient when a judgment is
  worth recording.
- **Build transitive method loading now.** Rejected because the shipped workflow declaration contract can carry
  every known consumer, while `knowledge-architecture` already owns the generalized resolver.
- **Combine appetite or decomposition into this method.** Rejected because those are different decisions. Appetite
  asks whether to continue investing; decomposition asks how justified scope should split. Proportionality first
  asks whether the candidate should be that large at all.
- **Scale the design down for solo, early, or small projects.** Rejected because status proxies do not establish
  requirements. The same correctness, security, and consequence constraints produce the same result across team
  shapes.

The selected lens follows established idioms without turning them into slogans. Brooks' essential/accidental
distinction supports removing solution-created burden without denying domain complexity ([Brooks][brooks]). Beck's
simple-design ordering places adequacy, clarity, and non-duplication before fewest elements
([Beck/Fowler][beck-design]). YAGNI targets speculative capability while preserving malleability
([Fowler][yagni]). Parnas supports abstractions around credible change axes rather than hypothetical variation
([Parnas][parnas]). Ousterhout favors deep composition with fewer exposed dependencies
([Ousterhout][ousterhout]). Knuth supplies the narrower performance rule: complexity for optimization needs
evidence of a real critical path ([Knuth][knuth]).

## Cross-cutting Considerations

### Safety and trust

The adequacy rail is part of the method contract, not a balancing hint. Security boundaries, destructive failure,
authority, irreversibility, and costly recovery can justify substantial machinery. The method must never infer that
a solo team or small current user base weakens those requirements.

The method and standalone door are read-only. Existing workflow interlocks own design mutation, and the
task-generation backstop adds a conditional stop only on `revise`; the clean path gains no new ceremony.

### Context cost and performance

The method is on-demand and declares no always-loaded context. Optional substrate referents bound discovery to
known key surfaces; absent pointers trigger targeted discovery from the problem and candidate, not a repository-wide
survey. No runtime process, persistence, or repeated mechanical probe is introduced.

### Testing and verification

Mechanical verification covers Markdown, references, package/project projection, install inventory, method
enumeration, and direct workflow declarations. `lint:arc:triggers` must see at least one workflow declaration for
the new method, which is the general coverage guarantee that audit owns. A targeted package-source assertion using
the existing `parseWorkflowFrontmatter` helper must confirm that `draft-design.md`, `create-spec.md`, and
`generate-tasks.template.md` each declare `assess-design-proportionality`; framework-sync then proves the rendered
self-hosted workflows match their package sources. Fresh-install and framework-sync tests must also see the new
method, canonical skill, and every direct method dependency of the touched planning workflows installed with the
correct classification and rendered copies. A targeted registry assertion must name `arc-design-audit` in
`CANONICAL_SKILLS`; the skill-generation unit fixture and existing per-canonical-skill integration loops must prove
that init/update projects it into the selected harness directories.

Behavioral acceptance applies the method contract to four case families:

1. the recorded `review-surface-binding` before/after delta must flag the durable fix ledger, local anti-tamper,
   excessive public verbs, and over-broad evidence persistence that the proportionality revision removed;
2. the pre-7.R `session-locus-model` design must flag exactness on routine operator paths while accepting retained
   exactness on destructive paths;
3. a complex candidate whose mechanisms trace to real security, trust, compatibility, or failure consequences
   must return `proportionate` regardless of project or team size; and
4. a smaller candidate that drops required behavior must return `revise` with `adequacy-regression`.

These are judgment fixtures, not a reason to invent an evaluation runtime in this work unit. Verification records
the applied method result against the existing precedent artifacts and explicit counterexamples.

### Compatibility and rollout

No configuration, CLI, stored state, or method-frontmatter schema changes. Framework update semantics deliver the
new default method and merge workflow/configurable surfaces through existing classifications. The recipe and
classification additions correct install delivery; they do not add runtime behavior. Existing customized methods
remain governed by the normal override contract.

Harness-local generated skill copies remain derived delivery surfaces. The canonical package and `.arc/system`
skill sources plus the `CANONICAL_SKILLS` registry change here; adopter harness copies refresh through normal
`arc update` behavior.

### Project alignment

The design supports PROJECT-PRD's **Operational friction down, judgment friction up** principle by centralizing a
repeatable criterion while preserving human choice at material design corrections. It supports **Configurable
methodology, open ecosystem** by using the existing overridable method and host-neutral skill/workflow surfaces.
It stays within TECHNICAL-OVERVIEW § 2 Architecture Components: deployable methods, workflows, skills, templates,
and the existing package/project projection model; no new technology or infrastructure is introduced.

## Success Criteria

- `assess-design-proportionality` ships with the PD2 signature, closed finding kinds, adequacy floor, materiality
  threshold, and the six-question PD3 lens.
- `draft-design` and `create-spec` invoke the method during authoring and re-run it before their final boundaries at
  every resolved depth/form. `create-spec` corrects an already-settled local decision in place, but routes an
  unshaped or under-derived direction back to `draft-design` through the existing mid-stage re-entry valve.
- Their adversarial rubrics explicitly pair the method with `design-audit`; proportionality findings map to the
  existing severity enum without duplicating the criterion.
- The standalone `arc-design-audit` skill maps its inputs, accepts optional substrate referents, loads both methods,
  remains read-only and user-invoked, and is registered in `CANONICAL_SKILLS` for harness projection.
- `generate-tasks` runs the backstop between Structural decomposition and Content fill, passing the current spec and
  provisional skeleton's phase, parent-task, and rough subtask-count evidence as `candidate`. A `revise` result
  requires approval, amends the spec, restarts the scale/Class read, and rebuilds the invalid skeleton; a justified
  large design proceeds unchanged.
- The four behavioral case families in Testing and verification produce their stated outcomes, including the
  complex justified and adequacy-regression rails.
- `lint:arc:triggers` confirms general method coverage; a targeted source assertion confirms all three named direct
  consumers declare the method; Markdown/reference and framework-sync checks pass with those declarations present
  in package source and the self-hosted instance.
- Fresh init/update delivery includes `assess-design-proportionality`, the canonical `arc-design-audit` skill, and
  all existing direct method dependencies declared by the three touched planning workflows; installed methods use
  Configurable update semantics and the canonical skills index names the installed door.
- No project-size/team-size discount, appetite rule, decomposition rule, mandatory evidence section, persistent
  result, configuration axis, transitive loader, or new CLI surface is introduced.

## Open Questions

None at the design level. Exact sentence placement within the named workflow blocks and the phrasing of behavioral
acceptance records are implementation details constrained by PD1-PD9 and the Success Criteria.

---

[beck-design]: https://martinfowler.com/bliki/BeckDesignRules.html
[brooks]: https://www.cs.unc.edu/techreports/86-020.pdf
[knuth]: https://pic.plover.com/knuth-GOTO.pdf
[ousterhout]: https://web.stanford.edu/~ouster/cgi-bin/book.php
[parnas]: https://prl.khoury.northeastern.edu/img/p-tr-1971.pdf
[yagni]: https://martinfowler.com/bliki/Yagni.html
