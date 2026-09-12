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

### `[x]` **2.2 Author the `amend-design` spine, vocabulary, and entry gate — D1, D2, D11**

- _Goal:_ A session holding a finding can run the gate top-down at the stop it is already at and learn which arm
  the evidence selects, or that the design holds.

    - `[x]` **2.2.a Frontmatter, signature, and the load-bearing-anchor note**
        - The nine methods the arms may fire are declared; their fire-points land across 2.3 through 2.5, and all
          nine are re-verified by hand when this phase's last task closes.
        - The workflow carries one line on why `adversarial-review` is declared directly as well as through
          `validate-criteria`, so a later reader does not tidy the direct declaration away.

    - `[x]` **2.2.b The five-step decision tree, keyed to outcomes**
        - Top-down, first match wins, each match citing the statement or criterion that decided it; the
          coarse-coverage rule routes an undecidable pair to the spec-depth arm.

    - `[x]` **2.2.c Authority by arm**
        - Task arm proceeds within the increment; the spec-depth and design arms are Owner-authorized at an
          existing stop, marked with a `task-interlock` constraint rather than a new prompt shape; escalation is
          always the Owner's.
        - The member site's three shipped answers map onto arms, none landing work inside the verifier's own
          increment.

    - `[x]` **2.2.d Load-bearing vocabulary, defined once before use**
        - Amendment, arm, footprint, and detour are defined before first use; the amendment entry scopes itself
          against the ADR tier and a delivery plan revision. Effective report and delta are referenced to
          `validate-criteria`.

- _Outcome:_ `amend-design.md` is authored in the package source with the signature blockquote, the six-step spine,
  the vocabulary, the entry gate, and authority by arm. Section headings are declared load-bearing in the workflow
  itself, so the detection sites Phase 4 adds have stable anchors to enter by. The spine's steps 2 through 6 name
  sections 2.3 through 2.5 author; they are plain section references rather than links, so the file stays
  self-consistent as those sections land.

### `[x]` **2.3 Author the depth ladder, assurance invariant, and ceiling — D3, D4**

- _Goal:_ An amendment's rigor follows its own derivation depth rather than the work unit's `Class`, and a change
  that reopens what the work unit is exits by extraction instead of lifecycle regression.

    - `[x]` **2.3.a The three-rung ladder and the canonical procedures at scope**
        - `low` / `medium` / `high` resolved over the finding and the gap, each rung naming the procedures that
          run at scope on it; `classify-work-unit` takes its fire-point from the `high` rung's ratchet read.
        - Stage procedures at scope are stated to move no lifecycle state, advance no stage pointer, and repoint
          nothing.

    - `[x]` **2.3.b The assurance invariant and the accretion guard**
        - The rubric is named in full, with prior findings carried through so untouched elements are never
          re-attacked; the guard suggests a consolidation read against no threshold.

    - `[x]` **2.3.c The ceiling and its two accepted consequences**
        - The exit names `decompose-work-unit`'s extraction mode as the operation and defers to that workflow for
          its invocation shape.
        - Extraction moves scope rather than code, and the "can carry" read stays judgment the classifier narrows
          rather than makes.

- _Outcome:_ Eight of the nine declared methods now have a marked fire-point — the ladder fires
  `resolve-planning-depth`, `task-audit`, `spec-review`, `resolve-plan-segmentation`, `adversarial-review`, and
  `classify-work-unit`, and the assurance invariant fires `assess-design-proportionality` and `design-audit`.
  `validate-criteria` is the remaining one, and closure fires it.

### `[x]` **2.4 Author the amendment record, placement rules, and propagation sweep — D5, D6, D7**

- _Goal:_ One amendment has one identity across its three projections, revision work anchors to the task it
  corrects, and the sweep closes over everything the change reaches in both directions.

    - `[x]` **2.4.a The `## Amendments` log and its closed row grammar**
        - The grammar is defined once, here — id, date, arm token, summary, `_Supersedes:_`, `_Trigger:_`,
          `_Work:_`, `_Revalidated:_` — each with its closed token set, beside a two-row example.
        - Body revision in place, the frozen surfaces' cross-reference, the appended-criterion group, and the
          landed-element exception each state where the change lands.

    - `[x]` **2.4.b Notes and task-list projections**
        - Reasoning is keyed to the row id in `notes-*` and only past a few lines; the task list cites the id in
          the corrective parent's Goal and carries no forward-amendment paragraphs.

    - `[x]` **2.4.c Placement rules and the three worked cases**
        - The formatting strategy carries the id series and mechanics; the workflow carries only the calls the
          amendment makes, plus the failed-verifier, cross-member, and reopened-design cases.
        - A new capability is a new segment resolved through `resolve-plan-segmentation` rather than a revision
          phase.

    - `[x]` **2.4.d The propagation sweep bounded by the footprint**
        - Forward and backward passes with the three classifications, the backward case keyed to a passed segment
          verifier taking `_Amended in:_` rather than a rewritten outcome.

- _Outcome:_ The record, placement, and sweep sections complete the capture-and-revise half of the spine. Each
  projection references its owner rather than restating it — the formatting strategy for placement mechanics,
  `validate-criteria` for the delta, `deliver-stack` and `reopen-work-unit` for the two worked cases that leave
  this procedure's surface.

### `[x]` **2.5 Author closure, the capture commit, and the bound-delivery interaction — D8, D9, D10**

- _Goal:_ The detour closes when the check that opened it passes again, the point-in-time design is recoverable
  from git, and an amendment under a bound plan composes with the shipped classifier instead of surprising it.

    - `[x]` **2.5.a Per-site closure and the delta**
        - The five-row closure table, with the detour being open kept distinct from `_Revalidated:_` naming the
          closing check.
        - Member-site closure keys the no-re-walk rule to the preserved boundary report on the task being
          executed, never to the log; the delta cites `validate-criteria` for its shape.

    - `[x]` **2.5.b The capture commit per arm**
        - One `workflowCommit` before corrective work on the spec-changing arms, with the `Class` ratchet written
          through `arc finalize create-spec --class`; the task arm rides the increment's commit and the review
          site the review-fix increment's.

    - `[x]` **2.5.c The five perturbation axes under a bound plan**
        - Task ids and contiguity, design-element digests, seams, authoring snapshots, and revision before
          execution, with the digest-extent convention stated and not enforced.
        - The bound/unbound branch takes the typed result of the execution-mode delivery entry inspection the task
          loop already runs, rather than prose that evaluates plan state.

- _Outcome:_ The workflow is complete end to end and every one of the nine declared methods now has a marked
  fire-point — `validate-criteria` fires at member-site closure. The file's section order follows the spine, so
  the anchors the detection sites will cite are settled before Phase 4 writes them.

### `[x]` **2.6 Refine the method-declaration rule to its conditional form — D12**

- _Goal:_ A workflow that declares a method its own body fires reads as correct rather than as a violation, and a
  declaration made only on another method's behalf still reads as one.

    - `[x]` **2.6.a The conditional rule and its test**
        - The categorical sentence is replaced by the conditional pair, with the striking test stated inline:
          strike the other method from your declarations, and if you still fire this one it is yours.
        - Both copies of the strategy carry byte-identical text; the file is Framework-classified and has no
          template.

    - `[x]` **2.6.b Confirm no existing declaration changes under it**
        - The test was run mechanically across the corpus: `validate-criteria` is the only method carrying a
          dependency, and `amend-design` is the only workflow declaring both it and `adversarial-review`. The
          refinement reclassifies nothing that already shipped.

- _Outcome:_ The refinement lands with the first case rather than after it, so `amend-design`'s direct
  `adversarial-review` declaration reads as licensed on arrival. Re-verifying the nine declarations at phase close
  found the assurance invariant naming its rubric declaratively rather than firing it; that line now reads as an
  invocation, so all nine fire-points are marked.

## **Phase 3:** Corpus conventions the amendment composes against

_Purpose:_ Land the record and closure conventions in their owning documents — the criteria method's effective
report and delta form, the spec forms' amendment log, the appended-criterion group rule, the design-element
citation recommendation, and the evidence-sink rule's forward pointer — each cross-referencing the procedure
rather than restating it.

_Exit criterion:_ No load-bearing term is restated across this work unit's ship surface, and a term that shadows an
existing corpus sense says which sense it means; each of the four spec forms carries its amendment log; and
`validate-criteria` states effective-report composition, the delta form, and the log-driven delta linkage.

### `[x]` **3.1 State effective-report composition and the delta form in `validate-criteria` — D8**

- _Goal:_ A member re-record after an amendment supplements its boundary report instead of producing a second full
  one, and the terminal walk finds those supplements through the log.

    - `[x]` **3.1.a Effective-report composition beside the report schema**
        - The effective report is the base plus ordered deltas — same-locus entries overridden by the latest,
          appended criteria present only in the delta, span taken from the latest — and is consumed wherever the
          work-unit-scope walk consumes the base, naming both the group disposition and the regression detection.

    - `[x]` **3.1.b The delta form and its per-criterion verdict**
        - Changed criteria with evidence, appended criteria with theirs, the new span, and the summary; unchanged
          criteria omitted and recorded digests never restated.
        - `carries` / `supplemental` / `fresh` stated as vocabulary applied by judgment; the verdict never replaces
          `state`, and a superseded criterion is `[~]` citing the row id with no verdict.
        - `delta` and `verdict` both shadow an existing corpus sense, so each says which sense it means — a
          supplement to one member's report rather than a work-tree diff, and per-criterion rather than the
          report-level verdict the adversarial companion returns.

    - `[x]` **3.1.c Log-driven linkage**
        - Deltas are located through the `## Amendments` rows' `_Work:_` pointers — never positionally and never by
          scanning a member's revision parents.

- _Outcome:_ `validate-criteria` carries an `### Amendment deltas` section beside the report schema in both copies,
  cross-referencing `amend-design` for the log rather than restating its grammar. The workflow's project copy landed
  in this commit: the section links to it, and link resolution is checked per copy, so the citing edit could not
  land first.

### `[x]` **3.2 Add the amendment log to the four spec forms — D5**

- _Goal:_ A spec reaching its first amendment has somewhere to record it without inventing a section shape.

    - `[x]` **3.2.a Trailing `## Amendments` on the three sectioned forms**
        - `outline`, `detailed` · `PRD`, and `detailed` · `RFC` each close on the heading, the guidance line, and
          one example row whose `_Supersedes:_` names that form's own frozen section.

    - `[x]` **3.2.b Trailing `**Amendments:**` label on the brief form**
        - The label matches the form's existing `**Success Criteria:**` shape rather than introducing a heading.

- _Outcome:_ Every row is a placeholder example that points at `amend-design` for the grammar instead of carrying
  one, so the four forms cannot drift apart from the definition or from each other. Each template gained its first
  reference-definition block to hold that link.

### `[x]` **3.3 Add the appended-criterion group rule and the evidence-sink forward pointer — D5, D6**

- _Goal:_ An amendment that appends a criterion knows which group can still resolve it, and a reader hitting the
  evidence-sink rule learns where a failed exit criterion's correction lands.

    - `[x]` **3.3.a § Success Criteria extends its assignment rule to the amendment case**
        - The appended case reads as the same rule continued — the group of the member carrying the corrective
          parent, or the seam group when the correction lands at the terminal.
        - The consequence is stated with its cause: a criterion appended to a closed member's group never resolves,
          because terminal verification dispositions member groups from their recorded evidence.

    - `[x]` **3.3.b The evidence-sink rule gains its forward pointer**
        - Anchored on `amend-design` § Placement of revision work, hung off the clause that opens the gap — the
          verifier never hosting the correction is why the reader needs somewhere else to look.

- _Outcome:_ Both edits continue an existing sentence instead of adding a parallel rule, so neither the assignment
  rule nor the evidence-sink rule now has a second statement to keep in step.

### `[x]` **3.4 Recommend design-element citation in parent-task titles — D7**

- _Goal:_ The sweep's hit list is greppable when a parent names the design element it realizes.

    - `[x]` **3.4.a The formatting strategy's parent-task section carries the recommendation**
        - The form is stated with an example carrying both suffixes: `— Dn` inside the bold, the verifier role
          suffix trailing outside it, with a pointer to the section owning the second.

    - `[x]` **3.4.b `generate-tasks`' parent-task skeleton step carries it at the authoring moment**
        - Added beneath the enumerable-unit anchor sentence the step already carries, and rendered to the project
          copy.

- _Outcome:_ Both sites scope the recommendation to RFC-form specs, where the enumerable units are design elements;
  the other three forms keep the anchor sentence they already had. The workflow states the recommendation and defers
  the form to the strategy, so the suffix has one definition.

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

### `[x]` **4.1 Author the `arc-amend-design` skill door — D1, D12**

- _Goal:_ A developer who can point at a wrong task or a falsified decision mid-session has a door that runs the
  gate rather than patching inline.

    - `[x]` **4.1.a The skill body dispatches into the workflow**
        - The skill names the three shapes the door takes, states which door a caller wants, and dispatches into
          `amend-design` at the stop already in hand — reaching it through one reference-style definition at the
          tail plus an anchored one for the entry gate.
        - Authored in the package source; the `.arc/` counterpart lands with its recipe entry in Phase 5.

    - `[x]` **4.1.b A directive description naming the trigger and the default it suppresses**
        - The description names the trigger with its three concrete forms, then the default it suppresses: do not
          patch inline or nest revision work under a verifier.
        - The door rule closes the description and is stated again in the body, so the description fires
          self-contained. It is restated on all three skill surfaces on purpose, so it is not a
          one-definition-site violation to collapse later.

- _Outcome:_ The door exists in the package source alone and nothing resolves it yet — `CANONICAL_SKILLS`, the
  install recipe, and the project copy all belong to 5.1, so the file is inert until then. Every inventory
  assertion over the skills source is positive-only and none enumerates the directory, so an unregistered skill
  reads green rather than red in the meantime.

### `[x]` **4.2 Carry the four task-loop directives — D1, D8**

- _Goal:_ Every gap the loop itself detects reaches the procedure from the stop the agent is already at.

- **Additional Context:** `notes-plan-amendment.md` § Forward-compat check detail — why the no-re-walk rule is
  keyed to the closing task's preserved report rather than to an open log row.

    - `[x]` **4.2.a The segment-site stop**
        - The loop now names the segment-verifier role suffix and what a task carrying it closes on — its first
          mention of either — then stops on a scenario that did not pass, keyed on the task in hand rather than on
          list-wide state. It sits in the completion protocol between the task's own verification step and the
          deferred-review policy.
        - The line refuses both the inline patch and corrective work hung under the verifier, and names the
          verifier's own re-run as what closes the failure.

    - `[x]` **4.2.b The member-report prompt's three answers routed into the gate**
        - `Fix now`, `amend`, and `defer` all enter the workflow by its entry-gate anchor; the line states that
          none of them lands work inside the verifier's own increment, and that the closing task settles later on
          the effective report.

    - `[x]` **4.2.c The no-re-walk rule in the member-boundary step**
        - A closing task already carrying a preserved boundary report closes on the effective report, cites the
          subtask that recorded the delta, and dispatches to the resolved completion branch instead of walking a
          second time.

    - `[x]` **4.2.d The must-stop directive**
        - An unanticipated design decision enters the gate at the stop the loop already fires, rather than being
          settled inside the increment.

- _Outcome:_ Four directives plus one tail definition pair, edited identically in the package template and the
  project copy. Disclosed residue: the segment-site stop is prose because nothing observes a segment-verifier
  failure today and there is no slot to precompose from. It becomes a rendered line once an observer exists, and
  its precedent is not a licence for a second prose template.

### `[x]` **4.3 Direct terminal verification and review response into the procedure — D1, D2**

- _Goal:_ An unmet criterion at terminal verification and a `fix` disposition that would change the spec both reach
  the gate instead of improvising a correction.

    - `[x]` **4.3.a `verify-work-unit`'s unmet-criterion stop carries the entry directive**
        - The directive follows the existing stop on an unmet criterion: enter by the entry-gate anchor, take the
          corrective work to a revision parent instead of patching it in place, and let the rerun the stop already
          prescribes close it.

    - `[x]` **4.3.b `review-response`'s `fix` disposition carries it**
        - The directive closes the disposition-building paragraph, where a `fix` is still a proposal: the gate
          either hands the correction back to the ordinary fix path with no record, or returns an amendment whose
          row is proposed inside the same disposition set, so the approved set binds the amended target.
        - This one is a Configurable method: the directive lands in its `.default` section, not the Framework
          workflow edit flow 4.3.a uses. The sync test holds the whole file equal, so both copies still move.

### `[x]` **4.4 Correct `reopen-work-unit`'s entry directive and task anchor — D6**

- _Goal:_ A reopen after a design-arm amendment anchors on something the CLI accepts.

    - `[x]` **4.4.a Replace the `X.Y.R` example with a cursor-leaf anchor**
        - The `--task` example now reads `Task X.R.a — …` and its comment names the corrective parent's executable
          leaf, so the sample stops contradicting the cursor rule stated two paragraphs below it.

    - `[x]` **4.4.b The entry directive names the bound-delivery refusal**
        - The directive sits in the withdraw-vs-stay judgment, where the caller arrives: the gate settles what
          changes, the corrective parent is authored and committed first so `--task` has a leaf to anchor on, and
          a coherently bound delivery refuses here and routes to `deliver-stack`'s review-fix continuation instead.

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

    - `init-recipe.json` and `classification.ts` follow. Each artifact's recipe entry and manifest entry land in
      one commit — the sync test's exact manifest/recipe equality makes a recipe entry on its own red. Both
      project copies already landed with the artifacts themselves, so registration is all this task adds.

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
        - Scope is the files this work unit edits; the three new files' manifest entries arrived with their
          recipe entries in 5.1 and 5.2, and the skill's project copy with them. The method's and the workflow's
          project copies landed with the artifacts themselves, ahead of registration.
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

    - `[ ]` **5.3.d `resolve-plan-segmentation`'s consumer row names both workflows**
        - Its blockquote `**Workflow:**` row still lists `generate-tasks.md` alone; `amend-design` declares and
          fires it, and the success criterion covering the method's two consumers would otherwise catch the
          omission only at terminal verification.
        - The row sits above the override sections, so both copies carry the same edit.

### `[ ]` **5.R Accept `X.R2` ids in the shipped meta-reference pattern**

- _Goal:_ Per A2, supply what 5.2's registration scope missed: the shipped pattern that refuses `X.R2` accepts it,
  so a project following the placement rules is not blocked by its own pre-commit hook.

- _Note:_ Nothing pins the pattern's content, so there is no test to go red first; 6.1 verifies by exercising a
  task id through the hook rather than by asserting the string.

    - `[ ]` **5.R.a Narrow the shipped `hooks.strict_meta_ref_patterns` default**
        - The default `\b[RB][0-9]+\b` treats a dot as a word boundary, so the numbered tail of `1.R2` reads as a
          requirement code and the commit is refused. Require a non-identifier, non-dot character before a bare
          R/B id; bare `R12` / `B3` and the quoted `R/C` rename scores must still match.
        - The package `arc-config.yml` default, its comment's rationale, and both hook copies move together.

    - `[ ]` **5.R.b This repo's override reconciled against the shipped default**
        - The override narrowed only the project copy ahead of the default. Once the default carries the same
          reading, remove the override as redundant or state why it still differs — an override silently equal to
          its default is drift waiting to happen.

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
- `[ ]` `DEV-RULES.ARC` § Method and extension loading reads the method-declaration rule conditionally, matching
  `strategy-workflow-authoring.md`, in both the package source and the project copy
