# Task List: Plan Amendment

- **Design:** `spec-plan-amendment.md`

---

## **Phase 1:** Amendment placement conventions

_Purpose:_ Establish the task-list conventions an amendment's revision work uses — the per-amendment parent id
series, yielded placement, the retirement of parent reopening, and `_Amended in:_` as a protected post-completion
bullet — and prove them against every shipped consumer before the procedure that depends on them is authored.

_Mode:_ `slice` — closes on the amendment placement conventions being expressible in a task list and accepted by
every shipped consumer.

_Exit criterion:_ A task list declaring more than one segment, carrying an `X.R` inside a segment-closing phase
ahead of that phase's verifier plus an `X.R2`, an `X.Y.R`, and an `_Amended in:_` bullet under a `[x]` parent,
parses without refusal through the structural scan, the segmentation scan, the task cursor, and the delivery task
inventory, with the parent's Goal digest unchanged by the appended bullet.

### `[x]` **1.1 Extend the R scheme with per-amendment parent ids and yielded placement — D6**

- _Goal:_ A second and third amendment's corrective work sit in one task list without colliding ids, and a session
  resuming mid-detour reaches the open corrective parent from the cursor alone.

    - `[x]` **1.1.a Fixture proving the three id forms against every shipped consumer**
        - `__tests__/fixtures/amendment-task-list.ts` carries the shared list: two `slice` segments, `1.R` and
          `1.R2` ahead of Phase 1's verifier, `2.1.R` under an open parent. Neither segment is a `layer` — that
          mode exempts `segment-verifier-missing`, so a `layer` host would prove only half the placement rule.
        - `__tests__/integration/task-list-amendment-placement.test.ts` holds all four consumers clean: no
          structural or segmentation diagnostic, the cursor at `1.R` / `1.R.a`, and an inventory classifying both
          corrective parents as implementation work.

    - `[x]` **1.1.b § Revision Numbering states the series, placement, and the retired practice**
        - `strategy-task-list-formatting.md` § Revision Numbering now carries the `X.R2` / `X.R3` series, the
          ahead-of-verifier placement rule, yielded placement under a bound plan, and parent reopening stated as
          the prohibition it is rather than as a practice that changed.
        - The `X.R` gloss gained the corrective-parent sense beside its existing phase-level follow-on one; the
          section stays additive, so no prior use of the scheme is narrowed.

- _Outcome:_ The `X.R2` series, ahead-of-verifier placement, yielded placement, and the retirement of parent
  reopening are stated once in `strategy-task-list-formatting.md` and proven against all four shipped consumers.
  The shipped pre-commit default still reads `1.R2` as a requirement code; only this project's
  `hooks.strict_meta_ref_patterns` override is narrowed, so the id series is not yet expressible in an installed
  project.

### `[x]` **1.2 Protect `_Amended in:_` across completion — D6**

- _Goal:_ A completed task whose behavior a later amendment changed records that fact without reversing its marker
  or disturbing the Goal text a bound delivery plan digests.

    - `[x]` **1.2.a Fixture proving the bullet survives completion with the Goal digest intact**
        - The fixture gained an `amendedIn` option appending `_Amended in:_ 1.R (A1)` at Goal-child depth beneath
          the completed parent; it splits on the Goal's tail line and throws rather than silently emitting the
          base list if that anchor ever drifts.
        - Goal text, the parent's `semanticDigest`, and the whole `inventoryDigest` a bound plan compares are all
          byte-identical with and without the bullet; a companion case authors the same words as a continuation
          line and shows the digest move, so the depth is what the protection rests on.
        - The descriptor lint is asserted clean but is weak here by construction: a completed parent's cluster
          carries only `_Goal:_`, and the spacing rule needs two adjacent descriptors before it inspects anything.

    - `[x]` **1.2.b The formatting strategy and task-list template carry the bullet**
        - Both completion paragraphs in `strategy-task-list-formatting.md` now name `_Amended in:_ X.R (An)`
          beside `_Retired in:_`, and the root-level one states the Goal-child depth as what keeps the bullet
          outside the Goal's descriptor extent.
        - `template-tasks.md` shows it under the parent-with-subtasks example, with a comment giving the depth
          and the reason. The example is inside the template's fenced block, so no scan or lint reaches it —
          the depth there was matched by eye against what the fixture proves.
        - `generate-tasks`' pre-save checklist now excepts the bullet from its no-amendment-provenance clause.
          The package carries that workflow only as a template, but the rendered `.arc/` copy is a Framework
          file the sync test compares, so the same edit had to land in both.

- _Outcome:_ `_Amended in:_` is now a stated protected post-completion bullet, shown at the depth the digest
  protection depends on, and no longer contradicted by the checklist shipping beside it. The fixture proves the
  depth; the template's copy sits behind a fence where nothing can, which is why the two were authored together.

### `[x]` **1.3 Amendment placement conventions — D6** — validate exit criterion at segment scope

- _Goal:_ The fixture list carrying all four forms is exercised once against the four shipped consumers together,
  and the result is the segment's recorded evidence.

- _Outcome:_ Exercised once: a list declaring two `slice` segments and carrying `1.R` ahead of Phase 1's verifier,
  `1.R2`, `2.1.R`, and `_Amended in:_ 1.R (A1)` under the `[x]` parent. All four consumers accept it — no
  structural, segmentation, or descriptor diagnostic; cursor at `1.R` / `1.R.a`; inventory `ok` with both
  corrective parents implementation-scoped; Goal and inventory digests byte-identical across the appended bullet.
  The walk found the amended variant had never been put through the segmentation scan and added that case, so the
  criterion is now met by one list rather than by two partial ones.

## **Phase 2:** The `amend-design` procedure

_Purpose:_ Author the supplemental workflow that owns the detour start to finish — the definition site for the
amendment grammar, the arms, the depth ladder, the ceiling, placement, the sweep, closure, the capture commit, and
the bound-delivery interaction — under stable anchors the detection sites reference, and extract the segmentation
method its arms declare.

_Mode:_ `layer` through Phase 3 — closes on the complete substrate the detour rests on: the procedure itself plus
the corpus conventions it composes against, each load-bearing term with one definition site.

### `[x]` **2.1 Extract `resolve-plan-segmentation` into a method — D12**

- _Goal:_ The segmentation procedure has one definition site that a second consumer can declare, with
  `generate-tasks` firing it by declaration rather than carrying it inline.

    - `[x]` **2.1.a Create the method from the `generate-tasks` § Resolve plan segmentation content**
        - The procedure body and the mode table moved verbatim into `.default`, under neutral package frontmatter
          and an empty `## resolve-plan-segmentation.override`.
        - The blockquote carries Workflow, When, Signature, and Contract; the Contract line is the new assertion,
          the signature a move.

    - `[x]` **2.1.b `generate-tasks` declares and fires it at a marked callsite**
        - The section is now a signature callsite — the signature retained, the method fired through an
          invocation-marking link, and the name declared in `arc.methods`.
        - The scale-axis read's cross-reference is the third method link beside `resolve-planning-depth` and
          `classify-work-unit`.

- _Outcome:_ `resolve-plan-segmentation.md` ships as a Configurable method with its content unchanged; the template
  edit rendered to the project workflow. The project copy of the method landed here rather than with its recipe
  entry in Phase 5: the rendered workflow's link to it is a reference definition, and the pre-commit link check
  rejects one that does not resolve inside the same copy. Phase 5 still owns the recipe, classification, manifest,
  and inventory entries. The segmentation contract test's mode-table and ordering assertions now read the method in
  both copies; the workflow keeps the signature, the fire-point link, and the declaration.

### `[ ]` **2.2 Author the `amend-design` spine, vocabulary, and entry gate — D1, D2, D11**

- _Goal:_ A session holding a finding can run the gate top-down at the stop it is already at and learn which arm
  the evidence selects, or that the design holds.

- _Shape:_ Signature-led supplemental workflow — one-line signature in a leading blockquote, a bounded spine, the
  arms as one-line gates with their sections beneath, and its interlock carried inside as a constraint.

- _Note:_ Section headings here are cited by five external sites, which makes them load-bearing; say so in the
  workflow so a later editor does not rename one silently.

- _Context:_ `audience: collaborative (human and agent)` — the gate carries Owner-authorized stops, matching the
  planning workflows it composes with.

- _Shape:_ Authored in the package source; the `.arc/` counterpart lands with its recipe entry in Phase 5. The
  detection-site directives Phase 4 adds therefore point at a project-side file that does not exist yet — accepted,
  and gated by nothing.

- **Additional Context:** `strategy-workflow-authoring.md` — required before authoring any workflow file.

    - `[ ]` **2.2.a Frontmatter, signature, and the load-bearing-anchor note**
        - Declare the nine methods the arms may fire: `resolve-planning-depth`, `classify-work-unit`, `task-audit`,
          `spec-review`, `adversarial-review`, `assess-design-proportionality`, `design-audit`,
          `validate-criteria`, and `resolve-plan-segmentation`.
        - Mark a fire-point for each one. `adversarial-review` stays declared in its own right — the depth ladder
          fires it directly, independently of `validate-criteria` owning it as a dependency.
        - Carry one line in the workflow saying why both are declared, so a later reader does not tidy the
          direct declaration away. The rule it rests on is the one 2.6 refines.
        - The `resolve-plan-segmentation` declaration presumes 2.1 has landed; declared earlier it resolves to a
          missing method.
        - The marks themselves land across 2.3 through 2.5. Re-verify all nine by hand when the phase's last task
          closes — the corpus audit checks declaration only and cannot tell a marked fire-point from a missing one.

    - `[ ]` **2.2.b The five-step decision tree, keyed to outcomes**
        - Steps run top-down, first match wins, citing the statement or criterion that decided it.
        - Carry the coarse-coverage rule: criteria too coarse to decide route to the spec-depth arm.

    - `[ ]` **2.2.c Authority by arm**
        - Task arm proceeds within the increment; spec-depth and design arms are Owner-authorized at an existing
          stop; escalation is always the Owner's.
        - The member site's three shipped answers map onto arms, and none lands work inside the verifier's own
          increment.

    - `[ ]` **2.2.d Load-bearing vocabulary, defined once before use**
        - Amendment, arm, footprint, detour. Effective report and delta are defined in `validate-criteria` and
          referenced, not redefined.
        - Scope the definition of "amendment": the ADR methodology already defines an append-only Amendments tier
          with its own grammar, and the delivery surface uses the word for a plan revision. Say which sense this
          procedure means rather than shadowing either.

### `[ ]` **2.3 Author the depth ladder, assurance invariant, and ceiling — D3, D4**

- _Goal:_ An amendment's rigor follows its own derivation depth rather than the work unit's `Class`, and a change
  that reopens what the work unit is exits by extraction instead of lifecycle regression.

    - `[ ]` **2.3.a The three-rung ladder and the canonical procedures at scope**
        - `low` / `medium` / `high` per `resolve-planning-depth`, naming which procedures run at scope on each rung.
        - At `high`, the work unit's `Class` ratchets to the realized floor through `classify-work-unit` — the
          read that gives that method its fire-point; the write itself is 2.5.b's.
        - State that stage procedures at scope move no lifecycle state, advance no stage pointer, and repoint
          nothing.

    - `[ ]` **2.3.b The assurance invariant and the accretion guard**
        - Amended artifacts pass the gates the originals passed, over the footprint, at the amendment's depth;
          prior findings carry through so untouched elements are never re-attacked.
        - The accretion guard suggests a consolidation read and names no threshold.

    - `[ ]` **2.3.c The ceiling and its two accepted consequences**
        - The exit is the decomposition workflow's extraction mode, named as the operation and referenced for
          its invocation shape: a complete extraction stages an additive result from a cut map and then thins the
          source, so no single command line belongs here.
        - Never a whole planning-workflow re-entry, and never a lifecycle regression.
        - A landed member's contract is immutable, and the "can carry" read is judgment the classifier narrows
          rather than makes.

### `[ ]` **2.4 Author the amendment record, placement rules, and propagation sweep — D5, D6, D7**

- _Goal:_ One amendment has one identity across its three projections, revision work anchors to the task it
  corrects, and the sweep closes over everything the change reaches in both directions.

    - `[ ]` **2.4.a The `## Amendments` log and its closed row grammar**
        - Define the grammar once, here: id, date, arm token, summary, `_Supersedes:_`, `_Trigger:_`, `_Work:_`,
          `_Revalidated:_`, each with its closed token set.
        - Body revises in place; frozen surfaces cross-reference the row; the landed-element exception appends a
          supersession line outside the digested extent.

    - `[ ]` **2.4.b Notes and task-list projections**
        - Reasoning lands in `notes-*` keyed by the id, only when it exceeds a few lines; the companion is created
          on first need as `task-audit` already prescribes.
        - The task list carries revision work citing the id in the parent's Goal — no forward-amendment paragraphs.

    - `[ ]` **2.4.c Placement rules and the three worked cases**
        - Cite the formatting strategy for the id series and placement mechanics; carry here only the calls the
          amendment makes — which parent takes the work, when `X.Y.R` applies, what triggers `_Amended in:_`, and
          that a corrected task's Goal is never edited.
        - No revision phase by default; a genuinely new capability is a new segment authored through
          `resolve-plan-segmentation`, fired at scope.

    - `[ ]` **2.4.d The propagation sweep bounded by the footprint**
        - Forward over remaining tasks and later criteria, backward over evidence already recorded.
        - Three classifications: unaffected, fold into the same batch, or reopens another design question — the
          detour never exits carrying a known unsettled thing.

### `[ ]` **2.5 Author closure, the capture commit, and the bound-delivery interaction — D8, D9, D10**

- _Goal:_ The detour closes when the check that opened it passes again, the point-in-time design is recoverable
  from git, and an amendment under a bound plan composes with the shipped classifier instead of surprising it.

- _Note:_ The bound/unbound branch dispatches on what `arc delivery entry inspect` returns; do not write the
  comparison out as prose that evaluates plan state.

    - `[ ]` **2.5.a Per-site closure and the delta**
        - The five-row closure table; the distinction between the detour being open and `_Revalidated:_` naming the
          closing check.
        - Member-site closure: the closing task carrying a preserved boundary report does not re-walk — a rule keyed
          to a fact on the task being executed, never to the log.
        - Name the delta and cite `validate-criteria` for its shape; the effective report and the delta are that
          method's to define.

    - `[ ]` **2.5.b The capture commit per arm**
        - Spec-depth and design arms: one commit before corrective work, routed as `workflowCommit`, with the
          `Class` ratchet written through `arc finalize create-spec --class` rather than a hand edit.
        - Task arm rides the increment's task commit; the review site rides the review-fix increment's commit.

    - `[ ]` **2.5.c The five perturbation axes under a bound plan**
        - Task ids and contiguity, design-element digests, seams, authoring snapshots, and revision-before-execution.
        - State the digest-extent convention: the element's settled statement text, excluding appended supersession
          lines.

### `[ ]` **2.6 Refine the method-declaration rule to its conditional form — D12**

- _Goal:_ A workflow that declares a method its own body fires reads as correct rather than as a violation, and a
  declaration made only on another method's behalf still reads as one.

- _Rationale:_ The rule is categorical today, but loading is fire-point-gated and the resolved graph dedupes, so a
  second declaration of an already-reachable method costs no context. What it protects is encapsulation — a
  declaration carried on another method's behalf goes stale the moment that method's dependencies change.

- **Additional Context:** `strategy-workflow-authoring.md` § Author-side Declaration Rule — the sentence this task
  refines and the surrounding fire-point contract.

    - `[ ]` **2.6.a The conditional rule and its test**
        - Declare what your own body may fire; never add a declaration because a method you declare needs it. A
          method your own body fires directly is your declaration even when a method you also declare depends on it.
        - State the test: strike the other method from your declarations — if you still fire this one, it is yours.

    - `[ ]` **2.6.b Confirm no existing declaration changes under it**
        - Run the test across the corpus's declared methods. The shipped consumers of `validate-criteria` declare
          it alone and their bodies do not fire `adversarial-review`, so the refinement reclassifies nothing.

## **Phase 3:** Corpus conventions the amendment composes against

_Purpose:_ Land the record and closure conventions in their owning documents — the criteria method's effective
report and delta form, the spec forms' amendment log, the appended-criterion group rule, the design-element
citation recommendation, and the evidence-sink rule's forward pointer — each cross-referencing the procedure
rather than restating it.

_Exit criterion:_ No load-bearing term is restated across this work unit's ship surface, and a term that shadows an
existing corpus sense says which sense it means; each of the four spec forms carries its amendment log; and
`validate-criteria` states effective-report composition, the delta form, and the log-driven delta linkage.

### `[ ]` **3.1 State effective-report composition and the delta form in `validate-criteria` — D8**

- _Goal:_ A member re-record after an amendment supplements its boundary report instead of producing a second full
  one, and the terminal walk finds those supplements through the log.

- _Note:_ The delta is a supplement to the existing report schema, not a second schema — it lists only what
  changed, and never restates fields or digests the base report already carries.

- _Context:_ Edits land in the method's `.default` section, the framework half a Configurable file's parity diff
  compares.

    - `[ ]` **3.1.a Effective-report composition beside the report schema**
        - Base report plus ordered deltas: same-locus entries overridden by the latest, appended criteria present
          only in the delta, span taken from the latest. The work-unit walk consumes it where it consumes the base.

    - `[ ]` **3.1.b The delta form and its per-criterion verdict**
        - Changed criteria, the new span, the summary; unchanged criteria omitted.
        - The three borrowed verdict tokens, stated as vocabulary-only; the verdict never replaces `state`, and a
          superseded criterion is `[~]` citing the row id with no verdict.
        - The token spellings come from the spec's own record and rename without design change; the owning work
          unit's current vocabulary is not readable from this branch, so do not treat a lookup as verification.

    - `[ ]` **3.1.c Log-driven linkage**
        - The walk locates deltas through the `## Amendments` rows' `_Work:_` pointers — never positionally and
          never by scanning a member's revision parents.

### `[ ]` **3.2 Add the amendment log to the four spec forms — D5**

- _Goal:_ A spec reaching its first amendment has somewhere to record it without inventing a section shape.

- _Note:_ Each template carries the heading and one placeholder example row only. The grammar and its token sets
  stay defined once, in the workflow — four restated grammars is the drift this split exists to prevent.

    - `[ ]` **3.2.a Trailing `## Amendments` on the three sectioned forms**

    - `[ ]` **3.2.b Trailing `**Amendments:**` label on the brief form**

### `[ ]` **3.3 Add the appended-criterion group rule and the evidence-sink forward pointer — D5, D6**

- _Goal:_ An amendment that appends a criterion knows which group can still resolve it, and a reader hitting the
  evidence-sink rule learns where a failed exit criterion's correction lands.

    - `[ ]` **3.3.a § Success Criteria extends its assignment rule to the amendment case**
        - The section already assigns each criterion to the earliest member boundary whose validator can see its
          evidence. Extend that sentence rather than adding a parallel rule: the member carrying the corrective
          parent, or the seam group when the correction lands at the terminal.
        - State the consequence — a criterion appended to a closed member's group never resolves.

    - `[ ]` **3.3.b The evidence-sink rule gains its forward pointer**
        - Where a failed exit criterion's correction lands, cited by section anchor.

### `[ ]` **3.4 Recommend design-element citation in parent-task titles — D7**

- _Goal:_ The sweep's hit list is greppable when a parent names the design element it realizes.

- _Note:_ Recommended, never scanned. The suffix sits inside the bold title and composes with the trailing
  verifier role suffixes; `tasks-plan-segmentation.md` is the shipped precedent for both combinations.

- _Context:_ `generate-tasks` is template-only in the package — edit the template and render. A direct project-copy
  edit is silently reverted by the render in 5.3.a.

    - `[ ]` **3.4.a The formatting strategy's parent-task section carries the recommendation**
        - State the form: the citation sits inside the bold title, ahead of any trailing verifier role suffix.

    - `[ ]` **3.4.b `generate-tasks`' parent-task skeleton step carries it at the authoring moment**

## **Phase 4:** Entry surface — the doors and the detection sites

_Purpose:_ Make the procedure reachable from every site that detects a gap: the ad-hoc skill door, the task loop's
four directives, the terminal and review entry directives, the reopen anchor correction, and the two audit skills'
route-onward lines.

_Mode:_ `slice` through Phase 5 — closes on the procedure being reachable from every detection site and
installable into a fresh project.

_Design decisions:_ Every citing file reaches the workflow through one reference-style link definition at its tail,
so the later relocation of `amend-design` edits one definition per file rather than every inline link. Directive
lines name the workflow and its anchor, never the internal terms `arm`, `footprint`, or `detour`, which are defined
only inside it.

### `[ ]` **4.1 Author the `arc-amend-design` skill door — D1, D12**

- _Goal:_ A developer who can point at a wrong task or a falsified decision mid-session has a door that runs the
  gate rather than patching inline.

    - `[ ]` **4.1.a The skill body dispatches into the workflow**
        - Authored in the package source; the `.arc/` counterpart lands with its recipe entry in Phase 5.

    - `[ ]` **4.1.b A directive description naming the trigger and the default it suppresses**
        - A specific finding or suspected gap enters the gate, which decides whether it is an amendment; do not
          patch inline or nest revision work under a verifier.
        - Carry the door rule: specificity picks the door, never confidence. It is restated on all three skill
          surfaces on purpose — a description must be self-contained to fire — so it is not a one-definition-site
          violation to collapse later.

### `[ ]` **4.2 Carry the four task-loop directives — D1, D8**

- _Goal:_ Every gap the loop itself detects reaches the procedure from the stop the agent is already at.

- _Note:_ The segment-site stop line is a prose template by necessity — nothing observes a segment-verifier failure
  today, so there is no slot to precompose from. Record that as a disclosed residue so it does not grow into a
  family of prose templates.

- _Context:_ Edits land in the package template and render to the project copy; the task loop has no hand-edited
  project-side original.

- **Additional Context:** `notes-plan-amendment.md` § Forward-compat check detail — why the no-re-walk rule is
  keyed to the closing task's preserved report rather than to an open log row.

    - `[ ]` **4.2.a The segment-site stop**
        - The loop has no segment-verifier awareness today, so this authors its first mention — enough context for
          the directive to mean something, not a line dropped onto an existing stop.
        - A segment verifier is an ordinary parent, so a failed scenario is a failed completion: the stop belongs in
          the completion protocol, keyed on the task carrying the segment-verifier role suffix with a scenario that
          did not pass. That reads the task being executed, never list-wide state.
        - A failed scenario is not a completion: stop and enter, do not patch inline, do not nest revision work
          under the verifier.

    - `[ ]` **4.2.b The member-report prompt's three answers routed into the gate**
        - All three shipped answers enter the gate; none lands work inside the verifier's own increment.

    - `[ ]` **4.2.c The no-re-walk rule in the member-boundary step**
        - A closing task that already carries a preserved boundary report closes on the effective report rather
          than re-walking.

    - `[ ]` **4.2.d The must-stop directive**
        - An unanticipated design decision enters the gate rather than being resolved in the increment.

### `[ ]` **4.3 Direct terminal verification and review response into the procedure — D1, D2**

- _Goal:_ An unmet criterion at terminal verification and a `fix` disposition that would change the spec both reach
  the gate instead of improvising a correction.

    - `[ ]` **4.3.a `verify-work-unit`'s unmet-criterion stop carries the entry directive**

    - `[ ]` **4.3.b `review-response`'s `fix` disposition carries it**
        - The tree runs over a `fix` before the set is approved; steps 1 and 2 exit to the ordinary review-fix path
          with no row.
        - This one is a Configurable method: the directive lands in its `.default` section, not the Framework
          workflow edit flow 4.3.a uses.

### `[ ]` **4.4 Correct `reopen-work-unit`'s entry directive and task anchor — D6**

- _Goal:_ A reopen after a design-arm amendment anchors on something the CLI accepts.

    - `[ ]` **4.4.a Replace the `X.Y.R` example with a cursor-leaf anchor**
        - `--task` must equal the current executable leaf, so the example anchors `Task X.R.a — …`, never the
          parent and never `X.Y.R`.

    - `[ ]` **4.4.b The entry directive names the bound-delivery refusal**
        - `arc reopen` refuses a coherently bound delivery; a bound stack's correction runs through the review-fix
          continuation.

### `[ ]` **4.5 Route the audit doors onward — D1**

- _Goal:_ An audit that surfaces a specific finding hands it to the procedure instead of ending at a finding list.

    - `[ ]` **4.5.a `arc-task-audit` routes a specific finding onward**
        - Extend the skill's existing route-onward sentence rather than adding a parallel one.
        - Its existing broad-design escalation to the design audit stays.

    - `[ ]` **4.5.b `arc-design-audit` routes a verified finding onward**
        - This skill carries no outbound route today — its `arc-task-audit` mentions are inbound scope statements.
          Author the line at the mid-impl escalation bullet rather than extending an existing sentence.

## **Phase 5:** Ship registration and two-copy parity

_Purpose:_ Register the new workflow, method, and skill in the install set and every list that enumerates them,
refresh the generated indexes, and hold both copies of each edited framework surface identical.

_Exit criterion:_ A fresh install carries `amend-design.md`, `resolve-plan-segmentation.md`, and the
`arc-amend-design` skill; the skill resolves through the canonical skill list; every detection-site directive
resolves to a live anchor in the workflow; and every edited framework surface is identical across the package
source and the project copy.

### `[ ]` **5.1 Register `arc-amend-design` as a canonical skill — D12**

- _Goal:_ The skill installs and generates per-tool copies everywhere the canonical skills do.

    - The name joins the unit skills test's fixture map first — that map generates synthetic `SKILL.md` files and
      is keyed exhaustively by canonical skill name, so the addition fails as a typecheck error until
      `CANONICAL_SKILLS` carries the name. Its description string is fixture text, never the shipped one; the two
      already diverge for other skills.

    - Then `CANONICAL_SKILLS`, the install recipe, and the skills README, which is a full enumeration with
      one-line descriptions.

    - The recipe entry, the project copy, and the manifest entry for this skill land in one commit. The sync test
      asserts exact equality between manifest keys and recipe-derived outputs, so a recipe entry alone is red.

    - Build `test-first` (one behavior at a time):
        - The skill resolves through `CANONICAL_SKILLS` and generates one copy per configured tool
        - A fresh install carries `system/.internal/skills/arc-amend-design/SKILL.md`
        - The generated per-tool copies match the canonical body

### `[ ]` **5.2 Add the workflow and method to the install set — D12**

- _Goal:_ A fresh `arc init` carries the procedure and its extracted method, each classified correctly.

- _Context:_ The new method is Configurable and the workflow is Framework. Classification is a hand-maintained
  list, so a method omitted from it silently classifies as Framework and the manifest assertion fails.

- **Additional Context:** `strategy-package-project-sync.md` § File Inventory and Dependency Map — the inventory
  this task keeps current; the task works directly in that strategy's domain.

    - The method name joins four hand-maintained arrays across three files first — the integration init test holds
      two (an installs list and a manifest list), plus the integration update list and the e2e init list. The unit
      init test is a single-representative spot check and needs nothing. Every assertion in those arrays is
      positive-only, so a missed array is silently green rather than red.

    - `init-recipe.json` and `classification.ts` follow. Each artifact's recipe entry, project copy, and manifest
      entry land in one commit, as the method-install precedent did — the sync test's exact manifest/recipe
      equality makes a recipe entry on its own red.

    - The methods README is a coupling table for methods that have related methods, and states that unlisted
      methods are independent. This one is independent, so it gains no row.

    - Build `test-first` (one behavior at a time):
        - A fresh install carries the supplemental workflow and the extracted method
        - The method classifies as Configurable in the generated manifest
        - Update over an installed project moves neither file through added, removed, or conflicted

### `[ ]` **5.3 Hold both copies identical and the derived inventories current — D12**

- _Goal:_ Nothing this work unit edited differs between the package source and the project copy, and no
  hand-maintained inventory still describes the pre-amendment corpus.

    - `[ ]` **5.3.a Pre-existing project copies reconciled against package source**
        - Scope is the files this work unit edits; the three new files and their manifest entries arrived with
          their recipe entries in 5.1 and 5.2.
        - Run the render for the edited Framework files. It refuses any recipe-resolved source whose output is
          missing, and that refusal is global — which is why the new files' copies could not have waited for this
          task.
        - `validate-criteria` and `review-response` are held **byte-identical in full** by the sync test, not just
          across their `.default` sections. Reconcile them by targeted edit and verify whole-file equality; the
          `.default`-diff rule is the fallback for Configurable files that test does not cover.

    - `[ ]` **5.3.b `amend-design` joins the direct planning-consumer list**
        - It declares `assess-design-proportionality`, so the sync test's consumer list covers it.

    - `[ ]` **5.3.c `strategy-package-project-sync.md`'s counts and Configurable list**
        - Five hand-maintained numbers move: the Framework count in prose and again in the summary table, the
          Configurable count in a heading and the same table, and the installed-file total as the fifth.
        - The enumerated Configurable list gains the new method.

### `[ ]` **5.4 Reachable and installable procedure — D12** — validate exit criterion at segment scope

- _Goal:_ A fresh install is exercised end to end: the three artifacts arrive, the skill resolves, and each
  detection-site directive is followed to a live anchor in the workflow.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` `amend-design.md` ships as a supplemental workflow with the D1 signature, the D2 tree with its five steps,
  three arms, and authority rules, the D3 ladder and assurance invariant, the D4 ceiling, the D5 record, the D6
  placement rules, the D7 sweep, the D8 per-site closure table, the D9 capture commit, and the D10 interaction —
  each under a stable anchor, with no internal work-unit reference in its prose.
- `[ ]` `arc-amend-design` ships as a canonical skill, resolves in the canonical skill list and the install recipe,
  and dispatches into the workflow.
- `[ ]` All five detection sites carry a directive line that enters `amend-design` by anchor: the task loop's
  segment-site stop, the three answers of its member-report prompt, and its must-stop; `verify-work-unit`'s
  unmet-criterion stop; `review-response`'s `fix` disposition. The task loop's member-boundary step carries the
  no-re-walk rule.
- `[ ]` `arc-task-audit` and `arc-design-audit` route onward to `amend-design`; `reopen-work-unit`'s example anchors
  a cursor leaf and its entry directive names the bound-delivery refusal.
- `[ ]` `validate-criteria` carries the effective-report composition rule, the delta form with the borrowed
  three-token verdict stated as vocabulary-only, and the log-driven delta linkage.
- `[ ]` `resolve-plan-segmentation` ships as a method with its content unchanged, declared and fired from both
  `generate-tasks` and `amend-design`, and resolves in the install set.
- `[ ]` The task-list formatting strategy carries the per-amendment parent ids, the placement rules including
  yielded placement, the retirement of parent reopening, `_Amended in:_` as a protected post-completion bullet, the
  appended-criterion group rule, the design-element citation recommendation, and the evidence-sink rule's forward
  pointer; the task-list template carries `_Amended in:_`; `generate-tasks` carries the citation recommendation in
  its parent-task skeleton step and the checklist clause excepting `_Amended in:_` from its
  no-amendment-provenance rule.
- `[ ]` `strategy-workflow-authoring.md`'s method-declaration rule reads conditionally — a workflow declares what
  its own body fires, never what it would carry only on a declared method's behalf — with the striking test stated,
  and no existing corpus declaration changes under it.
- `[ ]` The three sectioned spec forms carry a trailing `## Amendments` section and the brief a trailing
  `**Amendments:**` label, each with a placeholder row; the grammar is defined once, in the workflow.
- `[ ]` A task list declaring more than one segment, carrying an `X.R` inside a segment-closing phase ahead of
  that phase's verifier plus an `X.R2`, an `X.Y.R`, and an `_Amended in:_` bullet under a `[x]` parent, parses
  without refusal through the structural and segmentation scans, the task cursor, and the delivery task inventory,
  with the Goal digest unchanged by the appended bullet.
- `[ ]` Every edited framework surface's shipped content is identical in the package source and the project copy —
  Framework files and the two edited Configurable methods by the sync test's whole-file equality, other
  Configurable files by `.default` diff — with the task loop and `generate-tasks` edited in their templates.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
