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

### `[ ]` **1.1 Author `source-grounding` and hand `spec-review`'s grounding slice to it — D1, D2**

- _Goal:_ The behavior-grade check is stated whole in one overridable method, and `create-spec`'s self-review reaches
  it.

- _Note:_ The two land in one commit. `lint:arc:triggers` enumerates the package `system/methods/` directory and fails
  any method no workflow reaches (`audit-method-triggers.ts`). No commit hook runs it; it runs at the task's gate with
  the ARC contract checks and is required in CI, so `source-grounding` committed before a reachable consumer declares
  it fails there.

- **Additional Context:** `spec-grounded-planning-review.md` § D1, § D2

    - `[ ]` **1.1.a Write `system/methods/source-grounding.md` in the package source**
        - Configurable method shape, as `adversarial-review` prototypes it: frontmatter (`name`, `description`,
          `related:` naming `spec-review`, `task-audit`, `adversarial-review`, `override-active: false`); header block
          (Workflow naming `draft-design`, `create-spec`, `generate-tasks`, `amend-design`; When; Signature;
          Contract); the `.override` placeholder; `.default`
        - `.default`: named inputs (`artifacts`; `scope` as `artifact` or `fold`); return schema reusing
          `adversarial-review`'s report schema, with `verdict` naming the scope and the runner; the behavior-grade
          check; the propagation sweep reaching source; Reach; how it runs (factored, probe where cheap, probes never
          mutate, unnamed actors); the severity interpretation; the runner rule; the D2 rule as its authority
        - `artifact` scope covers the whole artifact, an amendment's footprint, or a task scope; a narrowed target
          travels in `artifacts`, so no caller gains an input
        - `fold` scope covers the change since the last review; there `artifacts` also carries the account of that
          change and, when they were kept, the reviewed versions it starts from. The scope is stated in those terms,
          with no pointer to the section that later defines a fold
        - The runner values (`author`, `independent`) and the two scopes are defined here once; consumers use them
          unglossed
        - Declares no methods — never `adversarial-review`, which declares it back in Task 2.3
        - Shipped register: no internal work unit, ADR, corpus figure, or research citation

    - `[ ]` **1.1.b Hand `spec-review`'s grounding slice to `source-grounding`**
        - The grounding slice hands claim grounding to `source-grounding` at `artifact` scope, the runner label set by
          its rule, with no new input; restate its "the spec's concrete references are real" heading and its "light
          verification" line behavior-grade
        - Restate the form-scaling lines that scale grounding down ("near-trivial", "the handful of concrete references
          grounded", "all concrete references grounded"): the bar holds at every form, and the distance scales by how
          many claims about shipped behavior the form carries, so a `brief` still collapses to one minimal check —
          which keeps `create-spec`'s own account of the self-review true without an edit there
        - Restate the `.default` opening ("holds together and refers to real things") so the grounding slice reads
          behavior-grade; the frontmatter `description` drops "Lightweight" and reads "coherence and behavior-grade
          grounding, scaled to the form"
        - `arc.methods` declares `source-grounding`; `related:` added; the Workflow header gains `amend-design`
        - § Posture drops "Lightweight" too and reads "Corrective: fix what you can inline…"; the posture itself is
          unchanged — fixes still fold inline, and no gate is added

    - `[ ]` **1.1.c Mirror both files into `.arc/` byte-identical and run the Markdown gate with the contract checks**

### `[ ]` **1.2 Hand `task-audit`'s grounding floor to `source-grounding` — D1**

- _Goal:_ `task-audit` keeps no existence-only depth: its floor is `source-grounding`, `grounding-only` is that check
  run alone, and `generate-tasks` describes the depth that way.

    - The grounding floor hands claim grounding to `source-grounding` at `artifact` scope, runner label by its rule;
      caller inputs stay `scope` and `depth`
    - Restate the `depth` row and the "report exists / missing / drifted and stop there" line: `grounding-only` is
      `source-grounding` run alone
    - § Severity interpretation leaves grounding findings to `source-grounding`'s interpretation and keeps grading the
      eight categories: drop the grounding readings ("an ungrounded referent that makes a task unexecutable as
      written", the grounding half of "a substantive grounding or planning problem"), so no finding carries two grades
    - The Codebase drift category leaves drift in named referents — renamed, moved, changed, or deleted — to the
      grounding floor, and keeps new code added since the task was written that the task does not account for
    - `generate-tasks.template.md` and its rendered `.arc/system/workflows/arc/generate-tasks.md`: restate the
      `grounding-only` gloss ("the named-files-and-symbols-exist floor") and the greenfield framing ("verifying named
      files and symbols exist") behavior-grade. `generate-tasks-delivery-authoring-contract.test.ts` pins the two
      copies identical; run it at this task's gate
    - Two-tier disposition and the feed into `generate-tasks`' per-phase gates unchanged
    - `arc.methods` declares `source-grounding`; `related:` added; the Workflow header gains `amend-design`; mirror to
      `.arc/`
    - The `arc-task-audit` skill stays true as written ("the grounding floor alone", "Two caller inputs") — confirm, no
      edit

### `[ ]` **1.3 Restate `design-audit`'s account of `spec-review` and pair the methods in the README — D1**

- _Goal:_ No method describes `spec-review`'s grounding as an existence check, and the Related Methods table names the
  new method's couplings.

    - `design-audit` § Relationship to `spec-review`: "its concrete references are real" restated behavior-grade
    - Methods `README.md` Related Methods: a `source-grounding` row naming `spec-review`, `task-audit`, and
      `adversarial-review`, with the reciprocal entry on each of those three rows (add rows for `spec-review` and
      `task-audit`; extend `adversarial-review`'s)
    - Both files sit in `framework-sync.test.ts`'s neutral-contract list: mirror byte-identical

### `[ ]` **1.4 Register `source-grounding` across every shipment surface — D1**

- _Goal:_ Projects install `source-grounding` as a Configurable core method, and every inventory that asserts the
  shipped methods fails without it.

- _Rationale:_ Those inventories list only the methods they name, so a site that omits the new one reads green; writing
  each assertion before the registration lands proves it bites.

- _Note:_ The manifest's `pristine_hash` records the package file as registered and goes stale on later edits, as
  `adversarial-review`'s already has; only `assess-evidence-applicability`'s hash is pinned, and none is added here.

    - Shipment: `init-recipe.json` `include_files`; `CONFIGURABLE_FILES` in `src/lib/classification.ts`; a
      `.arc/system/.internal/manifest.json` entry (`Configurable`, `core`, `pristine_hash` the SHA-256 of the package
      file — the form the `assess-evidence-applicability` entry took)
    - `strategy-package-project-sync.md`: the inventory list entry; Configurable 45 → 46 in the inventory heading and
      the classification table; self-hosting installed files 152 → 153. `framework-sync.test.ts`'s existing count and
      manifest-alignment checks go red on the recipe entry until these and the manifest move with it
    - `framework-sync.test.ts`'s neutral-contract list gains `source-grounding.md`, `spec-review.md`, and
      `task-audit.md`
    - Lanes: the change mixes `src/**`, tests, JSON, and Markdown, so every check runs, plus `npm run test:e2e` since
      E2E files change
    - `integration/update.test.ts`'s per-file list gains `source-grounding`. It asserts only that a repeat update
      leaves listed files out of its change sets, so it cannot fail first; the entry keeps the list current
    - Build `test-first` (one behavior at a time):
        - `integration/init.test.ts`: the installed method-file list and the manifest `methodNames` list include
          `source-grounding`
        - `e2e/init.e2e.test.ts`'s method inventory includes it
        - `unit/init.test.ts`: the planning-method check ships it, and the `classifyFile` block asserts `Configurable`

### `[ ]` **1.5 Exercise the grounding check through both stage callers** — validate exit criterion at segment scope

- _Goal:_ The Phase 1 exit criterion holds, with the scenario and its result recorded.

    - Run the init and update integration suites, `npm run test:e2e`, `lint:arc:triggers`, and `framework-sync.test.ts`
    - Trace `create-spec` → `spec-review` → `source-grounding` and `generate-tasks` → `task-audit` →
      `source-grounding`, confirming neither stage's grounding remains existence-only

## **Phase 2:** The review substrate — fold verification, exit gate, pass record, reasons

_Purpose:_ Give `adversarial-review` the fold-verification contract every planning caller will point at, and write the
reasons where projects read them, before any workflow cites a `§` anchor that does not yet exist.

_Mode:_ `layer` — closes on a settled method contract the planning workflows compose onto.

_Exit criterion:_ `adversarial-review` carries the `fold-verification` input, `### Fold verification`, `### Pass record`,
and the § Exit gate additions, byte-identical across both copies and held there by the neutral-contract list; its
pinned phrases and the `over-cap` fixture's signal still pass `pr-open-extensions.test.ts`; and
`strategy-work-planning.md` § Review at Planning Boundaries is reachable from the method's opening.

### `[ ]` **2.1 Bring `adversarial-review`'s two copies into byte identity**

- _Goal:_ The method's copies are identical and held so by test, so every later edit lands in both without tripping
  the package-sync hook.

- _Note:_ This is the first commit to touch the method. It changes only the two table separators (package lines 96 and
  340) to the project copy's compact form, in the package copy alone: `check-package-sync.sh` refuses a staged project
  copy of a Configurable file that matches the package copy while the committed copies differ.

    - `adversarial-review.md` joins `framework-sync.test.ts`'s neutral-contract list in the same commit
    - Confirm `lint:md` accepts the compact separators on the package path before committing

### `[ ]` **2.2 Write § Review at Planning Boundaries and point the method at it**

- _Goal:_ Projects can read why ARC reviews planning artifacts adversarially and grounds first, reached from where the
  review fires.

- **Additional Context:** `spec-grounded-planning-review.md` § The reasons, written down

    - `strategy-work-planning.md`: a new `## Review at Planning Boundaries` stating the five reasons in the spec's
      order and pointing to `adversarial-review` and `source-grounding` for the mechanics; its Contents entry; Related
      Documentation entries for both methods
    - Shipped register: the section stands alone and cites no ADR, internal work unit, corpus figure, or research
      citation; STRATEGY-INDEX unchanged
    - `adversarial-review`'s `.default` opening gains the pointer to the section
    - Both files mirrored byte-identical

### `[ ]` **2.3 Add the `fold-verification` input and `### Fold verification` — D1, D3, D4**

- _Goal:_ With fold verification on, the method carries the author's fold grounding, the Owner-held fix check, the
  kept reviewed versions, the fold tag, and the runner label in one section, and the input stays primary-side like
  `pass-cap`.

- _Note:_ `pr-open-extensions.test.ts` requires the canonical prompt template never match
  `pass-cap|Pass N of M|cap-exhausted` and keep "do not decide loop state, continuation, or authorization"; the fix
  check's own read instruction lives in the new section, not in that template. Path-based selection picks no code
  test for a Markdown-only change, so run that test at this task's gate.

- **Additional Context:** `spec-grounded-planning-review.md` § D3, § D4, and § D1 "Who runs it"

    - The section sits after § Exit gate and before § Authored-partition carrier mode, ahead of the `### Pass record`
      Task 2.4 adds, since the record lists what this section defines
    - The section opens by defining a fold: a change landed in a reviewed planning artifact before the next review
      reads it — an approved fix, a correction the author makes while grounding the fixes, or another change the Owner
      approved
    - Each term the section makes load-bearing — fold, fix check, fold tag and its two values — is defined once here
      and used unglossed everywhere else
    - The kept-version path is stated here only; callers and the strategy name the concept, never the path
    - Shipped register: no internal work unit, ADR, corpus figure, research citation, or transitional state

    - `[ ]` **2.3.a Thread `fold-verification` through the invocation contract**
        - The signature line, the callsite YAML, and the named-inputs table, as a primary-side input never
          serialized to a reviewer; the serialization paragraph names it beside `pass-cap`

    - `[ ]` **2.3.b State the author's fold grounding**
        - `source-grounding` at `fold` scope over the folds, as part of performing the approved response, before the
          fix check
        - A correction that carries out an approved action as approved folds inline and is disclosed — listed in the
          pass entry, named in the next report, handed to the fix check; one that changes what an approved action
          decides returns for approval under `DEV-RULES.ARC` § Review finding mutation guard

    - `[ ]` **2.3.c State the fix check**
        - Its standing: outside the cap and the convergence signal; its findings are findings, under a second approval
          within the pass; Owner-held, proposed per pass and per round
        - It is not the evaluator invocation § Exit gate stops before at `cap-exhausted`: that stop bounds passes, and
          the fix check still runs only on the Owner's approval
        - When it runs and how it completes response performance; its change-since-last-review target; attention scoped
          with reading unscoped; the four axes; its inputs without disposition rationale
        - Its inputs fill the invocation contract's slots: `rubric` takes the four axes; `artifacts` takes the two kept
          versions of each planning artifact the change touched, the later one the settled artifact, and the upstream
          chain; `prior-findings` takes the account — the checked findings as reported with their approved actions,
          the author's corrections, and other changes the Owner approved; `pass-cap` does not apply, since the fix
          check is not a pass
        - Its read instruction is a short `text` block holding only the paragraph that replaces the canonical template's
          read paragraph, making the change, not the account, the search frontier; the rest of the template is used
          unchanged, and the block names no loop state (`pass-cap`, `Pass N of M`, `cap-exhausted`)
        - The runner label: with fold verification on, the serialized report schema's `verdict` also names the runner
          by `source-grounding`'s rule, in each pass's report and the fix check's. A fix-check report labeled `author`
          does not count as the fix check; the Owner reruns it or skips it with a note, and the author never skips it.
          Where the harness has no subagent, `DEV-RULES.ARC` § Sub-agent scope's clause applies, its manual
          fresh-session pass counting only when it never loads the work unit's SESSION-NOTES
        - Rounds, the one-place recommendation (first round from the fold tags and the same-turn successor decision;
          later rounds from the convergence-rule reading), the next pass seeing every round, and last-round coverage

    - `[ ]` **2.3.d State the kept reviewed versions**
        - Copy every present planning artifact at each pass's and each round's launch, under
          `.arc/user/{identity}/.internal/reviewed-versions/{slug}/{sha256}.md`; record filename and hash in the pass
          entry; remove once the loop has ended; scope from the account alone, and say so, when the copies are lost

    - `[ ]` **2.3.e State the fold tag**
        - `local correction` or `new design`, drawn from `resolve-planning-depth`'s cut; a new-design fold runs
          `assess-design-proportionality` before the set is presented; the Owner settles the tags; the tag is a
          recommendation input and a record, never the fix check's gate

    - `[ ]` **2.3.f Declare what the section fires**
        - `arc.methods` declares `source-grounding` and `assess-design-proportionality`; `related:` gains both; the
          Workflow header gains `amend-design`
        - The methods `README.md` Related Methods pairs `adversarial-review` and `assess-design-proportionality` on
          both rows; mirror it byte-identical

### `[ ]` **2.4 Settle the exit gate and the pass record — D5**

- _Goal:_ A cap ends with a recommendation rather than silence, a successor rationale can cite the re-inspection test,
  and the pass-entry contents have one home every caller points to.

- _Note:_ The recommendation paragraph this rewrites carries pinned phrases — "same turn as the complete disposition
  report", "a recommendation is not authorization", "disposition approval alone authorizes no additional pass" — and
  so does the paragraph `### Pass record` absorbs; keep them, and run `pr-open-extensions.test.ts` at this task's
  gate.

- **Additional Context:** `spec-grounded-planning-review.md` § D5, § The pass record

    - § Exit gate: the re-inspection test as a recommendation input; at `cap-exhausted` with material signal, a
      recommendation — another pass or stop — becomes the default in the disposition-report turn; the convergence rule
      and the pass caps unchanged
    - `### Pass record`, after `### Fold verification`: the entry-content list, absorbing the paragraph that names where
      advisory planning callers and criteria callers keep their evidence; a sibling of § Exit gate rather than part of
      `### Fold verification`, since criteria callers keep evidence too
    - The list carries each fold's tag, each finding's origin with a finding in a gap taking the origin of the text
      that left it, the author's fold-grounding corrections, and other changes the Owner approved between reviews
    - Shipped register: no internal work unit, ADR, corpus figure, research citation, or transitional state
    - The final-fold residual paragraph narrows to the last fix-check round's repairs and keeps the reason the
      workflows' post-settle steps will stop restating
    - The `over-cap` fixture: its scenario approves a fix of the confirmed major rather than carrying it forward, with a
      signal rationale that fits a fix, and stays a criteria-validation activity so no fix check enters it; its expected
      behavior states the recommendation as the default at `cap-exhausted`, still saying "stop before another evaluator
      invocation"

## **Phase 3:** The planning stages run the checks

_Purpose:_ Apply the edits across the four planning workflows so each stage grounds its own artifact, carries the actor
rule to every write, turns fold verification on at its pass, and points at the pass record, all naming no internal
work unit, ADR, corpus figure, research citation, or transitional state.

_Mode:_ `replication` — closes when every planning workflow carries its edits and the batch is verified.

_Exit criterion:_ `draft-design`, `create-spec`, `generate-tasks` (the template and its rendered copy), and
`amend-design` each carry their edits, identical across copies; the tests that pin the edited text and
`lint:arc:triggers` pass; and a hand check finds every new fire-point marked and every `§` pointer resolving.

### `[ ]` **3.1 Carry the actor rule to every planning write — D2**

- _Goal:_ Every write a planning stage makes — authoring, revision, gate iteration, folds — meets the rule that a claim
  about shipped code names the code that does it.

- _Note:_ Path-based selection picks no code test for these Markdown-only edits. Run the tests that pin these files
  at this task's gate: `pr-open-extensions.test.ts`, `framework-sync.test.ts`,
  `generate-tasks-delivery-authoring-contract.test.ts`, `delivery-composition-ownership.test.ts`, and
  `boundary-fit-workflow-contract.test.ts`.

    - One stage-wide line in the opening of `draft-design.md`, `create-spec.md`, `generate-tasks.template.md`, and
      `supplemental/amend-design.md`, in the same words, stating the rule and pointing to `source-grounding`; no marker
      syntax
    - `generate-tasks.template.md` carries no conditional blocks, so each edit lands identically in the rendered
      `.arc/system/workflows/arc/generate-tasks.md`

### `[ ]` **3.2 Ground each stage's own artifact behavior-grade — D1**

- _Goal:_ Every stage grounds its own artifact at source before any subagent sees it — `draft-design` newly,
  `amend-design` at scope, and `create-spec` and `generate-tasks` through the methods Phase 1 changed.

- _Note:_ 3.2.b rewrites the rubric list in the § The assurance invariant sentence that also holds `amend-design`'s
  pinned "pass any prior findings recorded in the work unit's `ADVERSARIAL-PASSES.md`"; keep that phrase. Run
  `pr-open-extensions.test.ts`, `framework-sync.test.ts`, and `boundary-fit-workflow-contract.test.ts` at this task's
  gate.

- **Additional Context:** `strategy-workflow-authoring.md` § Author-side Declaration Rule

    - `[ ]` **3.2.a `draft-design` fires `source-grounding` at readiness**
        - `arc.methods` declares it; § Capture the draft runs it at `artifact` scope on the `medium` and `high` paths,
          once at readiness, before the adversarial offer and the capture commit, folding fixes inline
        - The run is a marked fire-point — a `source-grounding:` block with `scope: artifact`, as `generate-tasks`
          marks `task-audit`
        - The adversarial callout's `rubric` gains `source-grounding`

    - `[ ]` **3.2.b `amend-design` grounds at scope**
        - § Depth and rigor: `spec-review`'s grounding slice over the affected elements at every depth, `low` included,
          beside the coherence slice at `medium` and `high`
        - § The assurance invariant: the pass rubric gains the grounding slice and `task-audit`'s grounding floor over
          the footprint's tasks
        - § The accretion guard: its adversarial offer over the accreted union runs as § The assurance invariant's
          pass does, on that rubric

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
