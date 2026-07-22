# Task List: Solution Proportionality

- **Design:** `spec-solution-proportionality.md`

---

## **Phase 1:** Canonical method, first consumer, and delivery closure

_Purpose:_ Establish the decision contract, land its first authoring consumer with every installed dependency,
and relate it to ARC's broader design-fit rubric before the remaining planning surfaces consume it.

### `[x]` **1.1 Land the canonical method, drafting guard, and method inventory atomically**

- _Goal:_ Drafting receives one trigger-clean, overridable judgment that rejects materially unjustified machinery
  without simplifying below the chartered adequacy floor, and fresh installations include every dependency it uses.

- _Outcome:_ The canonical method, drafting-time guard, and six-method install closure now ship coherently across
  package and self-hosted copies. Recipe-derived manifest membership, Configurable classification, neutral parity,
  and focused init/update/E2E inventories cover the complete delivery slice without numeric count coupling.

### `[x]` **1.2 Compose proportionality with design-audit and the method index**

- _Goal:_ `design-audit` retains its broader efficacy and fit role while material complexity mismatch has one
  canonical criterion and every caller can discover the relationship without duplicated checklists.

    - `[x]` **1.2.a Reframe the Fit lens around the canonical proportionality method**
        - Delegated material complexity mismatch to `assess-design-proportionality` while preserving
          `design-audit`'s broader efficacy, coherence, forward-compatibility, finished-draft, read-only, and
          severity contracts; focused neutral parity now covers both methods.

    - `[x]` **1.2.b Register the method relationship in both indexes**
        - Registered the reciprocal method relationship in both projected indexes without adding loading
          machinery.

- _Outcome:_ Material proportionality now has one canonical criterion while `design-audit` retains broader design
  fitness, and the reciprocal index relationship makes their composition discoverable to override authors.

## **Phase 2:** Spec and design-boundary guards

_Purpose:_ Apply the canonical judgment while the spec crystallizes and at the two adversarial boundaries that
certify the design for downstream planning.

### `[x]` **2.1 Guard spec crystallization with correction and re-entry routing**

- _Goal:_ Every emitted spec form is proportionate before final review, with wrong settled mechanisms corrected in
  place and genuinely missing design routed back to its owning stage.

- _Outcome:_ Every spec form now invokes the canonical guard during crystallization and again over the saved spec
  before self-review. Settled mechanism errors correct in place, while findings that reopen derivation use the
  existing planning-depth valve to return to `draft-design`.

### `[x]` **2.2 Pair proportionality with design-audit at adversarial design boundaries**

- _Goal:_ Fresh-context draft and spec attacks test both general design fitness and material proportionality while
  retaining one severity model and primary-held disposition authority.

    - `[x]` **2.2.a Bind proportionality findings to existing severity semantics**
        - Bound goal-breaking adequacy regression to `blocker` and every other decision-bearing proportionality
          finding to `major`, leaving `minor` fit residue to `design-audit` and disposition authority with the
          primary.

    - `[x]` **2.2.b Expand the draft-readiness adversarial rubric**
        - Named `assess-design-proportionality` beside `design-audit` in both draft-readiness adversarial rubrics.

    - `[x]` **2.2.c Expand the spec-finalization adversarial rubric**
        - Named `assess-design-proportionality` beside `design-audit` in both spec-finalization adversarial rubrics.

- _Outcome:_ Draft and spec adversarial boundaries now combine material proportionality with broader design
  fitness under one severity, verification, disposition, pass-cap, and convergence contract.

## **Phase 3:** Task-generation backstop

_Purpose:_ Reassess the design once decomposition makes its implementation weight concrete, before content fill
institutionalizes unsupported machinery.

### `[x]` **3.1 Add the proportionality backstop and approved rebuild loop to task generation**

- _Goal:_ A provisional task skeleton can expose disproportionate design weight, stop for a deliberate correction,
  and restart cleanly before task detail is authored against an invalid referent.

- _Outcome:_ Structural decomposition now re-evaluates the settled design with materialized skeleton evidence
  before content fill. A clean result preserves the resolved path silently; an approved revision amends the spec,
  discards the superseded skeleton, and rebuilds from the scale/Class read without weakening the Class ratchet.

### `[ ]` **3.2 Lock direct planning-workflow declarations to the package source**

- _Goal:_ The three direct planning consumers cannot silently drop the proportionality method from their loading
  contracts while general trigger coverage continues to enforce non-orphaned methods.

- _Note:_ Design coverage: PD4, PD5, PD7, PD8.

    - In `packages/arc-framework/__tests__/integration/framework-sync.test.ts`, use the exported
      `parseWorkflowFrontmatter` helper from `src/scripts/audit-method-triggers.ts` in a focused real-corpus test over
      package `draft-design.md`, `create-spec.md`, and `generate-tasks.template.md`.
    - Assert that every named consumer declares `assess-design-proportionality` directly; do not replace the
      general `lint:arc:triggers` coverage check.
    - Retain the existing whole-file Framework comparison as the proof that rendering preserves declarations and
      surrounding call sites in all three self-hosted workflows; do not duplicate that projection contract.

## **Phase 4:** Standalone audit door and skill projection

_Purpose:_ Preserve ad-hoc design re-validation while making the installed canonical door discoverable and
generated consistently for every selected harness.

### `[ ]` **4.1 Extend the standalone design-audit door across both methods and input contracts**

- _Goal:_ A user-invoked design audit reports general design fitness and proportionality through one read-only door
  without weakening the finished-draft floor or exposing a second mutation gate.

- _Note:_ Design coverage: PD6, PD9. The package and self-hosted canonical sources land as one review increment so
  their neutral contract is aligned before recipe registration makes the Framework copy authoritative.

    - Rewrite the package and self-hosted skill frontmatter `description` as a directive, trigger-bearing discovery
      line for ad-hoc finished draft or spec re-validation across efficacy, fit, and proportionality.
    - Map `design` to the proportionality `candidate`, derive `problem` from `goal-referents` or the artifact's own
      problem statement, accept optional `substrate-referents`, and load both public methods.
    - Report combined recommendations through `design-audit`'s existing severity vocabulary while keeping the door
      user-invoked, read-only, and floored at a finished draft.
    - Retain package/project byte parity for the canonical definition.

### `[ ]` **4.2 Register and project the canonical design-audit skill**

- _Goal:_ Normal init and update generation includes `arc-design-audit` for every selected harness and keeps its
  typed description and canonical source synchronized.

- _Note:_ Design coverage: PD6, PD8.

    - Build `test-first` (one behavior at a time):
        - `[ ]` **4.2.a Register and install the canonical skill source**
            - Add a focused expectation for `arc-design-audit`, then extend `CANONICAL_SKILLS` in
              `src/lib/skills/resolution.ts` and the exhaustive `Record<CanonicalSkillName, string>` description
              fixture in `__tests__/unit/skills/skills.test.ts`.
            - Extend the integration init and update expectations with the canonical skill source's Framework
              presence under the core layer.
            - Add `system/.internal/skills/arc-design-audit/SKILL.md` to
              `packages/arc-framework/init-recipe.json` and add its recipe-derived Framework entry and pristine hash
              to `.arc/system/.internal/manifest.json` in the same increment.

        - `[ ]` **4.2.b Exercise canonical generation and update loops**
            - Let the existing per-skill unit and integration loops cover init output directories, canonical byte
              parity, and Codex supplements.
            - In `__tests__/integration/skills.test.ts`, modify the generated `arc-design-audit` skill, run update,
              and assert that its canonical content is restored so the new member is visible on the update path.

    - `[ ]` **4.2.c Index the standalone door in both canonical skill READMEs**
        - Add a directive, trigger-bearing entry for `arc-design-audit` to the package and self-hosted
          `system/.internal/skills/README.md` lists without growing the always-loaded session context.

## **Phase 5:** Behavioral acceptance

_Purpose:_ Exercise the judgment contract against the motivating precedents and both adequacy rails without
inventing a runtime evaluation subsystem.

### `[ ]` **5.1 Record the four proportionality case-family results**

- _Goal:_ The method demonstrates that it removes unsupported lifecycle cost, preserves consequence-justified
  complexity, and rejects simplification that drops required behavior.

- _Note:_ Design coverage: PD1-PD3, PD5, PD9.

- **Additional Context:** Resolve the live `review-surface-binding` and `session-locus-model` work units with
  `npx arc status <slug>` before reading `draft-review-surface-binding.md` § Grooming status, Proportionality
  posture, Approved dispositions and the fix path, and Scope boundaries and downstream fit;
  `notes-session-locus-model.md` § Right-sizing audit; and `tasks-session-locus-model.md` Phase 7.R.

    - Create `notes-solution-proportionality.md` and write each applied-method result as it is exercised so every
      judgment remains durable within this single review increment.
    - Record how the pre-revision `review-surface-binding` candidate flags durable fix carry, local anti-tamper,
      excessive public verbs, and over-broad evidence persistence, while the reduced candidate clears.
    - Record how the pre-7.R `session-locus-model` candidate flags maximum exactness on routine operator paths while
      retaining exactness for destructive paths.
    - Record a complex candidate whose mechanisms trace to concrete security, trust, compatibility, or failure
      consequences as `proportionate` regardless of project/team status.
    - Record a smaller candidate that loses stated behavior as `revise` with `adequacy-regression`.
    - Keep the evidence concise and read-only: no runtime state, evaluation subsystem, or mutation of the sibling
      work units.

## **Phase 6:** Verification

_Purpose:_ Validate the finished implementation and planning artifacts against the spec and repository gates.

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The canonical method returns only `proportionate` or decision-bearing `revise` findings through the five
  closed kinds, six-question lens, materiality threshold, and adequacy floor.
- `[ ]` Draft and spec authoring invoke the method while mechanisms form and at their final boundaries, with local
  correction and derivation re-entry routed to the owning stage.
- `[ ]` Draft/spec adversarial rubrics pair proportionality with `design-audit` through the existing severity,
  source-verification, disposition, and convergence contracts.
- `[ ]` Task generation evaluates the materialized skeleton before Content fill and requires an approved spec
  correction plus a fresh scale/Class read and full rebuild for `revise`.
- `[ ]` The standalone design-audit door loads both methods, maps optional substrate referents, remains read-only,
  and is generated from the canonical registry for every selected harness.
- `[ ]` Fresh init/update installs every direct planning dependency with Configurable method semantics, aligned
  package/project copies, manifest inventory, and canonical skill projection.
- `[ ]` The four judgment case families distinguish unsupported machinery from justified complexity and catch an
  adequacy-regressing simplification without adding an evaluation runtime.
- `[ ]` No project-status discount, appetite/decomposition rule, mandatory proof, persistent result, configuration
  axis, transitive loader, or new CLI surface is introduced.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
