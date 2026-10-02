# Task List: grounded-planning-review

- **Design:** `spec-grounded-planning-review.md`

---

## **Phase 1:** The grounding check and its two stage callers

_Purpose:_ Ship `source-grounding` and route the two stage checks that already fire — `spec-review` at
`create-spec`, `task-audit` at `generate-tasks` — through it, so the check is installed and reached before anything
downstream builds on it.

_Mode:_ `slice` — closes on the new method installed and reached through the two stage checks that already fire.

_Exit criterion:_ A fresh install carries `source-grounding` as a Configurable core method, with the init, update,
and e2e suites green; `lint:arc:triggers` resolves it through `spec-review` and `task-audit`; the five methods files
this phase edits are byte-identical across both copies, and the `generate-tasks` template matches its rendered copy;
and reading `create-spec`'s self-review and `generate-tasks`' grounding audit through to `source-grounding` finds no
existence-only grounding left at either stage.

### `[x]` **1.1 Author `source-grounding` and hand `spec-review`'s grounding slice to it — D1, D2**

- _Goal:_ The behavior-grade check is stated whole in one overridable method, and `create-spec`'s self-review reaches
  it.

    - `[x]` **1.1.a Write `system/methods/source-grounding.md` in the package source**
        - Authored source-grounding with artifact/fold scopes, behavior checks, propagation sweep, non-mutating
          probes, severity interpretation, and the runner and actor rules.

    - `[x]` **1.1.b Hand `spec-review`'s grounding slice to `source-grounding`**
        - spec-review delegates grounding at artifact scope and scales its distance by the number of behavior claims
          while keeping the same bar and inline corrective posture.

    - `[x]` **1.1.c Mirror both files into `.arc/` byte-identical and run the Markdown gate with the contract checks**
        - Authored matching project copies of both methods; their package and project contents are byte-identical.

### `[x]` **1.2 Hand `task-audit`'s grounding floor to `source-grounding` — D1**

- _Goal:_ `task-audit` keeps no existence-only depth: its floor is `source-grounding`, `grounding-only` is that check
  run alone, and `generate-tasks` describes the depth that way.

- _Outcome:_ task-audit delegates its grounding floor to source-grounding, including grounding-only depth; category
  severity excludes grounding and named-referent drift. generate-tasks describes the same behavior-grade floor. The
  standalone skill retains its two inputs and disposition contract.

### `[x]` **1.3 Restate `design-audit`'s account of `spec-review` and pair the methods in the README — D1**

- _Goal:_ No method describes `spec-review`'s grounding as an existence check, and the Related Methods table names the
  new method's couplings.

- _Outcome:_ design-audit describes source-grounded behavior claims; the methods README records source-grounding and
  reciprocal links to spec-review, task-audit, and adversarial-review. Both Framework projections match the package
  source.

### `[x]` **1.4 Register `source-grounding` across every shipment surface — D1**

- _Goal:_ Projects install `source-grounding` as a Configurable core method, and every inventory that asserts the
  shipped methods fails without it.

- _Outcome:_ Registered source-grounding as a core Configurable method in the recipe, classifier, manifest, shipment
  inventories, and sync inventory. Added neutral-copy assertions for source-grounding, spec-review, and task-audit;
  install and classification assertions demonstrated omissions before registration, and a controlled drift
  demonstrated the copy assertion.

### `[x]` **1.5 Exercise the grounding check through both stage callers** — validate exit criterion at segment scope

- _Goal:_ The Phase 1 exit criterion holds, with the scenario and its result recorded.

- _Outcome:_ The segment scenario holds: fresh installs carry source-grounding as Configurable core, repeat updates
  preserve it, and the five edited method files and task-generation template match their project copies. Traced
  create-spec → spec-review and generate-tasks → task-audit to behavior checks and propagation sweeps, with no
  existence-only grounding at either caller.

## **Phase 2:** The review substrate — fold verification, exit gate, pass record, reasons

_Purpose:_ Give `adversarial-review` the fold-verification contract every planning caller will point at, and write the
reasons where projects read them, before any workflow cites a `§` anchor that does not yet exist.

_Mode:_ `layer` — closes on a settled method contract the planning workflows compose onto.

_Exit criterion:_ `adversarial-review` carries the `fold-verification` input, `### Fold verification`, `### Pass record`,
and the § Exit gate additions, byte-identical across both copies and held there by the neutral-contract list; its
pinned phrases and the `over-cap` fixture's signal still pass `pr-open-extensions.test.ts`; and
`strategy-work-planning.md` § Review at Planning Boundaries is reachable from the method's opening.

### `[x]` **2.1 Bring `adversarial-review`'s two copies into byte identity**

- _Goal:_ The method's copies are identical and held so by test, so every later edit lands in both without tripping
  the package-sync hook.

- _Outcome:_ Normalized only the package method’s two table separators to the project form; adversarial-review now
  joins the neutral-contract assertion, which caught the original drift before normalization. Both method copies are
  byte-identical.

### `[x]` **2.2 Write § Review at Planning Boundaries and point the method at it**

- _Goal:_ Projects can read why ARC reviews planning artifacts adversarially and grounds first, reached from where the
  review fires.

- _Outcome:_ Added Review at Planning Boundaries with the five reasons in order and links to the review and grounding
  mechanics; its Contents and Related Documentation entries resolve, and adversarial-review points to it from its
  opening. Both copies match.

### `[x]` **2.3 Add the `fold-verification` input and `### Fold verification` — D1, D3, D4**

- _Goal:_ With fold verification on, the method carries the author's fold grounding, the Owner-held fix check, the
  kept reviewed versions, the fold tag, and the runner label in one section, and the input stays primary-side like
  `pass-cap`.

    - `[x]` **2.3.a Thread `fold-verification` through the invocation contract**
        - Added the optional primary-side fold-verification input to the signature, YAML callsite, input table, and
          serialization boundary without changing the canonical reviewer prompt.

    - `[x]` **2.3.b State the author's fold grounding**
        - Requires fold-scope author grounding before the fix check, discloses inline corrections, and returns changed
          dispositions for approval.

    - `[x]` **2.3.c State the fix check**
        - Defines Owner-held independent fix-check rounds outside the pass cap and signal, with the four-axis rubric,
          change frontier, invocation-slot inputs, runner label, recommendations, and last-round coverage.

    - `[x]` **2.3.d State the kept reviewed versions**
        - Defines locally kept reviewed versions by slug and content hash, pass-entry recording, removal at loop end,
          and account-only scope with disclosure when copies are lost.

    - `[x]` **2.3.e State the fold tag**
        - Defines local correction and new design tags, with Owner settlement and proportionality assessment before
          new design lands.

    - `[x]` **2.3.f Declare what the section fires**
        - Declares and relates source-grounding and assess-design-proportionality; added amend-design to the caller
          header and reciprocal README couplings.

### `[x]` **2.4 Settle the exit gate and the pass record — D5**

- _Goal:_ A cap ends with a recommendation rather than silence, a successor rationale can cite the re-inspection test,
  and the pass-entry contents have one home every caller points to.

- _Outcome:_ Added the re-inspection recommendation and explicit cap recommendation while preserving the convergence
  rule and canonical prompt. Pass record now owns origins, fold tags, reviewed-version hashes, round sets,
  corrections, and continuation evidence; narrowed the residual to final-round repairs and corrected the over-cap
  fixture to exercise a confirmed major fix.

## **Phase 3:** The planning stages run the checks

_Purpose:_ Apply the edits across the four planning workflows so each stage grounds its own artifact, carries the actor
rule to every write, turns fold verification on at its pass, and points at the pass record, all naming no internal
work unit, ADR, corpus figure, research citation, or transitional state.

_Mode:_ `replication` — closes when every planning workflow carries its edits and the batch is verified.

_Exit criterion:_ `draft-design`, `create-spec`, `generate-tasks` (the template and its rendered copy), and
`amend-design` each carry their edits, identical across copies; the tests that pin the edited text and
`lint:arc:triggers` pass; and a hand check finds every new fire-point marked and every `§` pointer resolving.

### `[x]` **3.1 Carry the actor rule to every planning write — D2**

- _Goal:_ Every write a planning stage makes — authoring, revision, gate iteration, folds — meets the rule that a claim
  about shipped code names the code that does it.

- _Outcome:_ All four planning workflow openings carry the same actor rule for authoring, revision, gate iteration,
  and folds, linked to source-grounding; their package sources render to matching project copies.

### `[x]` **3.2 Ground each stage's own artifact behavior-grade — D1**

- _Goal:_ Every stage grounds its own artifact at source before any subagent sees it — `draft-design` newly,
  `amend-design` at scope, and `create-spec` and `generate-tasks` through the methods Phase 1 changed.

    - `[x]` **3.2.a `draft-design` fires `source-grounding` at readiness**
        - draft-design declares source-grounding and fires its marked artifact-scope author check once at readiness on
          medium/high paths before the adversarial offer; its pass rubric includes grounding.

    - `[x]` **3.2.b `amend-design` grounds at scope**
        - amend-design grounds affected spec elements at every depth, includes spec grounding and task grounding in
          its assurance rubric, and runs its accretion offer on that same rubric.

### `[ ]` **3.3 Turn fold verification on at every planning pass — D3**

- _Goal:_ Each planning stage's pass runs with the fold grounding, the offered fix check, the kept versions, the fold
  tags, and the runner label.

- _Note:_ The `amend-design` prose lands in the § The assurance invariant section that holds its pinned prior-findings
  sentence; keep that phrase. Run `pr-open-extensions.test.ts`, `framework-sync.test.ts`,
  `generate-tasks-delivery-authoring-contract.test.ts`, `delivery-composition-ownership.test.ts`, and
  `boundary-fit-workflow-contract.test.ts` at this task's gate.

    - `fold-verification: on` in the `adversarial-review` callsite of `draft-design`, `create-spec`, and
      `generate-tasks.template.md`
    - `amend-design`: stated in prose under § The assurance invariant, since its passes have no callsite block; the
      accretion guard's offer runs as that pass does
    - The verification and code-review callers stay untouched

### `[ ]` **3.4 Point each pass entry at § Pass record and trim the post-settle steps — D3**

- _Goal:_ The pass-entry contents and the residual reason are stated once, in the method, and `amend-design` gains the
  re-read its originals have.

- _Note:_ `pr-open-extensions.test.ts` pins phrases in each workflow's pass-entry paragraph ("apply the method's
  complete-disposition and bounded-continuation protocol", the personal-workspace locus, "later passes take their
  `prior-findings` from it", "a stub groomed before it starts has no workspace yet", "creates no lane-progress record")
  and `amend-design`'s prior-findings sentence. The pointer prose keeps them and the test stays unchanged.

- _Note:_ `generate-tasks-delivery-authoring-contract.test.ts` pins the `Post-settle coherence re-read` label by order,
  between `arc delivery compose` and the `workflow-interlock`. Path-based selection picks no code test for a
  Markdown-only change, so run `pr-open-extensions.test.ts`, `framework-sync.test.ts`,
  `generate-tasks-delivery-authoring-contract.test.ts`, `delivery-composition-ownership.test.ts`, and
  `boundary-fit-workflow-contract.test.ts` at this task's gate.

    - Three workflows: the pass-entry list becomes a pointer to `adversarial-review` § Pass record; the post-settle step
      drops its restated residual reason
    - `amend-design`: "as the planning passes do" points to § Pass record; under § The assurance invariant, the
      post-settle coherence re-read over the amended footprint, when its pass folded anything, as the last step before
      the amendment lands, on every arm

### `[ ]` **3.5 Exercise the planning stages against the substrate** — validate exit criterion at segment scope

- _Goal:_ The Phase 3 exit criterion holds, with the scenario and its result recorded.

    - Run `pr-open-extensions.test.ts`, `framework-sync.test.ts`, `generate-tasks-delivery-authoring-contract.test.ts`,
      `delivery-composition-ownership.test.ts`, `boundary-fit-workflow-contract.test.ts`, and `lint:arc:triggers`
    - Trace each stage's adversarial fire-point and post-settle step through to `adversarial-review` § Fold verification
      and § Pass record, and each `source-grounding` fire-point to its declaration

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` `source-grounding.md` ships as a Configurable method carrying the D1 signature, its `artifacts` and `scope`
  inputs, and `adversarial-review`'s report schema as its return, with `verdict` naming the scope and the runner

- `[ ]` `source-grounding` carries the behavior-grade check, the propagation sweep reaching source, the Reach rules, the
  factored procedure, non-mutating probes, the unnamed-actor finding, the severity interpretation, the rule by which
  the running agent labels its report `independent` only when it never loads author reasoning or the work unit's
  SESSION-NOTES and `author` otherwise, and the D2 rule as its authority; its prose names no internal work unit or
  corpus figure

- `[ ]` `source-grounding` resolves in `init-recipe.json`, `CONFIGURABLE_FILES`, the self-hosting manifest, the init,
  update, and e2e install inventories, and the unit init planning-method check; the package-sync inventory lists it
  with Configurable and installed-file counts matching the recipe; the methods README pairs it with its three
  consuming methods

- `[ ]` `spec-review`'s grounding slice and `task-audit`'s grounding floor each hand claim grounding to
  `source-grounding`, with the runner label by its rule and no new input, each declaring it and naming `amend-design`
  in its Workflow header; no existence-only grounding remains: `spec-review` no longer calls its grounding a light
  verification, `task-audit`'s `grounding-only` is `source-grounding` run alone, and `design-audit`'s account of
  `spec-review` is behavior-grade

- `[ ]` `adversarial-review` carries `fold-verification` as a primary-side, never-serialized input and a
  `### Fold verification` section carrying:
    - an opening definition of a fold: an approved fix, a correction the author makes while grounding the fixes, or
      another change the Owner approved, landed in a reviewed planning artifact before the next review reads it;
    - the author's `fold`-scope grounding of its folds as part of performing the response, before the fix check,
      folding inline with disclosure a correction that carries out an approved action as approved and returning one
      that changes what an approved action decides for approval under `DEV-RULES.ARC` § Review finding mutation
      guard, each correction listed in the pass entry, named in the next report, and handed to the fix check;
    - the fix check's standing outside the cap and the convergence signal, timing, change-since-last-review target,
      four axes, inputs without disposition rationale and the slots they fill, Owner-held rounds, and last-round
      coverage;
    - the runner named in each pass's and the fix check's `verdict`, with a fix-check report labeled `author` not
      counting as the fix check;
    - the fix check's recommendation, in one place: the folds' tags read with the same turn's successor decision for
      the first round, and the convergence-rule reading for later rounds;
    - the kept reviewed versions, with location, keying, recording, removal, and loss behavior;
    - the fold tag

- `[ ]` `adversarial-review` carries `### Pass record` with each fold's tag, each finding's origin, a finding in a gap
  taking the origin of the text that left it, the author's fold-grounding corrections, and other changes the Owner
  approved between reviews; it declares and relates `source-grounding` and `assess-design-proportionality`, and its
  opening points to `strategy-work-planning.md` § Review at Planning Boundaries

- `[ ]` `adversarial-review` § Exit gate states the re-inspection test as a recommendation input and makes a
  recommendation, another pass or stop, the default at `cap-exhausted`; its convergence rule and pass caps are
  unchanged, and its final-fold residual paragraph names the last fix-check round's repairs as the residual

- `[ ]` `draft-design`, `create-spec`, and `generate-tasks` each carry the stage-wide D2 line, `fold-verification: on`
  in their adversarial callout, a `§ Pass record` pointer in place of their pass-entry list, and a post-settle step
  without its restated residual reason

- `[ ]` `draft-design` declares `source-grounding`, runs it at `artifact` scope at the readiness boundary on the
  `medium` and `high` paths before the adversarial offer, and includes it in its adversarial rubric; `generate-tasks`'
  description of `grounding-only` and its greenfield framing are behavior-grade

- `[ ]` `amend-design` carries the stage-wide D2 line; `spec-review`'s grounding slice over the affected elements at
  every depth; the grounding slice and `task-audit`'s grounding floor over the footprint's tasks in its
  assurance-invariant rubric; `fold-verification: on` on its passes, the accretion guard's offer included; the
  post-settle coherence re-read when its pass folded anything, as the last step before the amendment lands; and a
  `§ Pass record` pointer

- `[ ]` `strategy-work-planning.md` carries `## Review at Planning Boundaries` with its Contents and Related
  Documentation entries; the section states the five reasons, points to `adversarial-review` and `source-grounding`
  for the mechanics, and cites no ADR or internal work unit

- `[ ]` ADR-036 is `Accepted` under `.arc/reference/adr/` and records the core model and this design's extension, each
  with its rejected alternatives; no shipped file cites it

- `[ ]` No always-loaded surface, CLI behavior, stored record, pass cap, or convergence rule changes

- `[ ]` `lint:arc:triggers` passes; every edited Framework file is identical across both copies; the methods
  `README.md`, `design-audit.md`, `adversarial-review.md`, `spec-review.md`, `task-audit.md`, and
  `source-grounding.md` pass the neutral-contract identity test; every commit passes `check-package-sync.sh`

- `[ ]` The `over-cap` fixture reaches `cap-exhausted` with material signal and expects the recommendation as the
  default

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
