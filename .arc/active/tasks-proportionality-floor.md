# Task List: Proportionality Floor

- **Design:** `spec-proportionality-floor.md`

---

## **Phase 1:** Proportionality floor and its always-loaded offset

_Purpose:_ Land the floor on the always-loaded surface and pay for it in the same phase, so the budget question
settles in one place rather than split across the work unit. The floor is the artifact every later phase leans
on, so it lands first.

_Design decisions:_ The floor belongs in `DEV-RULES.ARC` rather than a `DEV-RULES.{DOMAIN}.md` file. A rule that
proves position-conditional is evidence for the domain-rules mechanism; this one is universal by charter — it
must fire at every moment the planning-time method cannot reach — so the canonical universal set is its home.
The removal from `DEV-RULES.PROJECT` is an absorption into another always-loaded surface, not a demotion to an
on-demand destination, so no reachability trigger is owed for the content that moves.

### `[x]` **1.1 Proportionality section in `DEV-RULES.ARC`**

- _Goal:_ Every session loads a universal rule that traces material mechanism to a stated goal, real constraint,
  trust boundary, or observed failure, and that a literal reading cannot turn into under-delivery.

- _Outcome:_ `## Proportionality` sits between § Scaled Process, Invariant Discipline and § Commit Discipline in
  both copies of `DEV-RULES.ARC`, byte-identical, carrying all nine load-bearing clauses in the approved order and
  no `[invariant]` marker. The transcribed text measures 160 words under the counting rule — the same figure the
  design states — so the band check doubled as verification that nothing was lost in transcription.

### `[x]` **1.2 Scope-discipline removal from both `DEV-RULES.PROJECT` copies**

- _Goal:_ The doctrine the floor now carries exists in exactly one always-loaded place, and the adopter-side and
  repo-local budgets both collect the offset.

    - `[x]` **1.2.a Capture the two-copy baseline**
        - Captured the pre-edit cross-copy diff (293 lines — the copies diverge well beyond this entry) and kept
          it for the post-edit comparison in 1.2.c.

    - `[x]` **1.2.b Remove the lines from the project instance**
        - Removed the leading `**Scope discipline:**` entry from `.arc/system/rules/DEV-RULES.PROJECT.md`
          § Engineering Standards. The section now opens on the pre-public-release posture, which reads
          correctly under that heading; no surviving line was reseated.

    - `[x]` **1.2.c Remove the lines from the package source**
        - Removed the same doctrine from `packages/arc-framework/arc/system/rules/DEV-RULES.PROJECT.md` § Code
          Quality Principles. What remains is one seed principle plus the placeholder comments inviting
          language-specific standards — a well-formed template section.
        - Re-diffed against the 1.2.a baseline comparing divergence sets rather than hunk positions: the
          substantive set is unchanged, the only delta being blank-line realignment around the removal.

- _Outcome:_ The doctrine now lives only in the floor. Both copies were edited in place rather than synced, and
  the baseline comparison is what makes that verifiable — for a `Configurable` pair the framework-sync gate
  proves nothing, so a per-copy edit is indistinguishable from an introduced divergence once the pre-edit state
  is gone.

### `[x]` **1.3 Phrasing-consolidation sweep of `DEV-RULES.ARC`**

- _Goal:_ Wording that the floor now states once stops being restated around it, recovering some of the words the
  new section spends.

- _Outcome:_ Yield zero — both named surfaces were read against the floor text and neither restates it. The
  preamble governs not losing a discovered observation and the authority of capture surfaces; Anti-rider governs
  whether a **second concern** may ride the current change, keyed on concern-identity. The floor's nearest clause
  governs the **size of the response to one concern**. Adjacent subjects, no shared sentence to recover, so no
  edit was made rather than a manufactured saving. Recorded net growth: `DEV-RULES.ARC` +161 words (the 160-word
  section plus its heading), `DEV-RULES.PROJECT` −28 in each copy, so both always-loaded sets net +133 — the
  design's projected ~+130.

## **Phase 2:** Scope-boundary carrier chain, draft through spec

_Purpose:_ Give a work unit's Won't-Do commitments an unbroken path from the draft template through all four spec
forms into the finalized spec, with the amendment contract stated where a mid-implementation editor is already
reading. Without this phase the floor's scope-boundary clause points at a surface that no finalized spec
reliably carries.

_Design decisions:_ Freeze is at activation, and after it every boundary change — expansion or contraction —
appends a provenance line inside the section rather than to a parallel log. The ceremony is boundary-only by
design: other spec sections are records whose provenance git history already carries, and generalizing the
ceremony would tax exactly the behavior the floor wants more of.

The chain's weak link is its lightest path, in both workflows: `draft-design`'s `low` produces no draft artifact
and `create-spec` maps `low` to the one form with no boundary section, so in each stage placement decides whether
that path is covered at all. The other loss surface is author replacement of a template section body on emit.
Tasks 2.3.a and 2.3.b seat their lines above the split; 2.2.d and 2.3.c close the emit surface.

### `[x]` **2.1 Scope-boundary section in `template-draft.md`**

- _Goal:_ A new draft prompts for what the work will not do instead of for a size estimate no downstream stage
  consumes.

    - `## Scope Estimate` is replaced by `## Scope boundary (Won't Do)` in both copies, byte-identical. The
      heading shares "scope boundary" with the `outline` spec form so the carry-forward reads as one chain, and
      "Won't Do" reuses `template-tasks.md` vocabulary rather than coining a term.
    - The new body prompts for the adjacent work being left out and says why — so the spec inherits the boundary
      instead of rediscovering it — and retains the old section's dependencies prompt verbatim.
    - Confirmed forward-only and consumer-free: nothing under `packages/arc-framework/src` reads the old section
      name, and no template, workflow, or method references it. Existing drafts keep it until independently
      groomed.

### `[ ]` **2.2 Amendment carrier on all four spec forms**

- _Goal:_ Whichever form a work unit is specified in, exactly one boundary surface states that it freezes at
  activation and how a later change records itself.

- _Approach:_ Each form already has a boundary surface, so the carrier attaches to what is there. Add no new
  section to any template.

- _Shape:_ One wording, four consumers. Settle the carrier's phrasing once in 2.2.a and apply it verbatim in the
  other three — only the `brief` form's seating differs. Four independently-authored variants would read as four
  contracts, and the retain instruction downstream has to quote one exact line to be followable.

- _Context:_ All four templates live in
  `packages/arc-framework/arc/reference/templates/arc/work-unit/spec/` and are `Framework`, so each subtask edits
  the package source and mirrors byte-identically into the matching `.arc/` path. Four of the eight files
  Criterion 7 covers are these, and `.arc/` is the copy an editing session has open by default — so the
  wrong-direction edit is the easy mistake, and the pre-commit check for it warns rather than blocks.

    - `[ ]` **2.2.a Settle the carrier wording and apply it to the `outline` form**
        - Semantics are fixed: the boundary freezes at activation, and a change after that appends
          `Amended YYYY-MM-DD — <delta> — <prompt>`. Only the phrasing is open here.
        - `template-spec-outline.md` § Scope boundary (No-gos) gains the line directly under the heading.

    - `[ ]` **2.2.b PRD form**
        - `template-spec-detailed-prd.md` § Non-Goals gains the same line verbatim. On a paired PRD plus RFC this
          is the surviving carrier.

    - `[ ]` **2.2.c RFC form**
        - `template-spec-detailed-rfc.md` § Non-Goals is flagged `omit-when-paired`, so a paired set drops the
          section along with its carrier. Add the line anyway for the standalone case — exactly one carrier
          governs a spec either way.

    - `[ ]` **2.2.d `brief` form**
        - `template-spec-brief.md` has no boundary section and, in the template, no scope-boundary clause either:
          its whole body is brace-delimited guidance instructing the author to write one paragraph fusing intent,
          scope boundary, and the success signal.
        - Seat the carrier as a standalone italic line **after** the braced paragraph, not as text inside the
          braces. Braced guidance is the content an author replaces wholesale, so a carrier placed there is the
          single most likely thing to be lost on emit — the same failure the retain instruction exists to prevent,
          recreated one layer earlier and beyond its reach.
        - The line states that the freeze governs the **scope-boundary clause the author writes** and that clause
          alone; intent and the success signal keep revising in place, unfrozen. Amendment lines append after the
          paragraph.

### `[ ]` **2.3 Workflow-side instructions that keep the boundary alive**

- _Goal:_ The boundary survives both stage transitions that could silently lose it — the draft-to-spec handoff,
  and the template-to-finalized-spec emit.

- _Context:_ The emit case is the one that decides whether the amendment model has a delivery path at all. A
  template's section body is author-replaced guidance and the emit step carries a closed list of what to strip,
  so an unmarked line inside a replaced body is the most likely thing to be lost — and every template-level
  check would still pass while no finalized spec carried the carrier.

- **Additional Context:** `strategy-workflow-authoring.md` — required before editing either workflow file;
  frontmatter, method declarations, interlock markers, and routing class tags are not safely inferred from a
  neighbouring workflow.

    - `[ ]` **2.3.a Carry-forward line in `draft-design.md`**
        - State that the draft's scope boundary is what the spec inherits, so it is authored as a handoff
          surface rather than a private note.
        - Place it in § Draft in the resolved level, after the path-selection sentence and above the `low`
          heading — the last point common to all three paths. The `low` path produces no draft artifact, so a line
          seated in the draft-producing sections would govern `medium` and `high` only and drop the lightest path
          without failing anything.

    - `[ ]` **2.3.b Carry-forward line in `create-spec.md`**
        - State that the spec's boundary inherits and sharpens the draft's, and never silently drops it. This is
          also what picks up the boundary on the `low` path, where the inheritance is a carried confirmation
          rather than a draft section.
        - Seat it as an all-forms instruction above the per-form blocks, in the same band as § Proportionality
          guard (all forms) — the file's existing pattern for exactly this. The three form blocks sit below it and
          `low` maps to `brief`, so a line seated in the `outline` block would govern `outline` alone and miss the
          lightest path entirely. The `outline` block's own "the **scope boundary** (no-gos) is explicit" makes
          that the tempting wrong seat.

    - `[ ]` **2.3.c Retain-on-emit instruction in `create-spec.md` § Write and save**
        - Add an explicit instruction to retain the boundary carrier when emitting a spec, quoting the exact line
          settled in Task 2.2.a so an author can recognize it. The risk being closed is author replacement of a
          template section body, not the strip contract — that contract lists removals and never names the
          carrier, which is precisely why an unmarked line inside a replaced body goes missing.
        - Depends on 2.2.a: the instruction cannot quote a line that has not been settled.

    - `[ ]` **2.3.d Close the phase's gates**
        - Both workflow files are `Framework`: edit the package source, then mirror byte-identically to `.arc/`.
          The four spec templates carry the same obligation under Task 2.2.
        - Leave both workflows' YAML frontmatter alone. A test parses each one and asserts
          `assess-design-proportionality` is still declared, so a frontmatter slip fails the suite rather than the
          Markdown gate.
        - Run the Markdown gate, the ARC contract checks, **and** the code checks over the phase's edits. Every
          file this phase touches is Markdown, and all seven are under test in one form or another, so the
          Markdown-only carve-out does not apply here either.

## **Phase 3:** Reviewer-side boundary provisioning

_Purpose:_ Let a reviewer see the boundary a change is governed by, and oblige a finding whose remedy crosses it
to say so. This is the only phase that touches a reviewer-facing surface, and it is deliberately the narrowest
edit that reaches the two lanes in scope.

_Design decisions:_ The edit lands in `adversarial-review` § Context provisioning rather than in
`implementation-audit`'s finding floor. The audit method looks like the better home on method-contract grounds,
but its markdown twin stands beside a typed contract registered in code whose finding floor carries four
requirements; editing the markdown would reach the same two lanes while leaving the twin claiming a fifth
requirement the contract does not carry. Closing that gap means bumping the typed floor, which is a
hosted-review change this work unit does not make.

### `[ ]` **3.1 Boundary and finding-shape provisioning on the frontline and standard rows**

- _Goal:_ A frontline or standard pass over a spec-governed change arrives already holding that spec's scope
  boundary, and a finding that proposes crossing it names the crossing and grounds it in behavior required for
  correctness, safety, or a stated goal.

- _Approach:_ Both additions land as one short prose block after § Context provisioning's artifact-set table,
  naming the frontline review and standard review rows explicitly and conditioning both on the change being
  governed by a spec. The table's cells stay as they are: its rows list unconditional artifact sets, and a
  conditional entry inside a cell breaks that shape.

- _Rationale:_ Explicit row scoping is required rather than stylistic. § Context provisioning is one shared
  section, so an unqualified sentence there reads on every fire-point — including the planning rows, where the
  boundary is the artifact under audit rather than context for it. The two lanes also run routinely on errands and
  off-work-unit changes where no boundary exists.

- _Note:_ State the finding-shape obligation **self-contained**. A reviewer cannot be assumed to load the rules
  files, so the obligation must not cite a rail by name and leave the reviewer to chase it.

    - `[ ]` **3.1.a Capture the two-copy baseline**
        - Diff the two copies before editing either, for the same reason Task 1.2.a does it: once both are
          edited, a pre-existing difference is indistinguishable from an introduced one.

    - `[ ]` **3.1.b Edit the package source**
        - In `packages/arc-framework/arc/system/methods/adversarial-review.md` § Context provisioning, add the
          governing spec's scope boundary for the frontline and standard rows, plus the finding-shape sentence
          bound to those same two rows: a finding whose remedy crosses the boundary must say so and ground the
          crossing in behavior required for correctness, safety, or a stated goal.
        - Write clear of three phrases a negative test assertion forbids in this file: `per-chunk receipt`,
          `durable scope identity`, and `review-gate runtime state`, matched case-insensitively. The middle one is
          the live risk, since this edit's own subject is scope vocabulary.
        - Change no rubric: leave `frontline-review`, `standard-review`, and `implementation-audit` untouched, and
          add, remove, or reweight no dimension. § Severity model and § Exit gate are sections of the file this
          subtask opens, so they need protecting here rather than there — the edit stays inside § Context
          provisioning and touches neither.

    - `[ ]` **3.1.c Apply the same edit to the project instance**
        - The file is `Configurable` and the copies already differ, so make a targeted edit in
          `.arc/system/methods/adversarial-review.md` rather than copying. Re-diff and compare against the 3.1.a
          baseline: the only new difference should be this edit.

    - `[ ]` **3.1.d Confirm the existing string assertions still hold**
        - Three sites assert on this file's content across two test files, and two of them read **both** copies:
          one case in `framework-sync.test.ts` (package copy only), and two in `pr-open-extensions.test.ts` (both
          copies). Editing only one copy satisfies neither of the latter two.
        - Run the code checks — this phase's edits are Markdown but reach a file under test, so the Markdown-only
          gate carve-out does not apply here. Both type checks are needed before declaring types green.
        - Run the Markdown gate and the ARC contract checks over the phase's edits as well.

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` `DEV-RULES.ARC` carries a `## Proportionality` section of 150-170 words, targeting ~160 —
  whitespace-separated tokens containing a word character, excluding the heading — adjacent to § Scaled Process,
  Invariant Discipline, with all nine load-bearing clauses present and no `[invariant]` marker

- `[ ]` Neither copy of `DEV-RULES.PROJECT` contains the Scope-discipline lines, and the floor carries the
  authority attribution that replaces them

- `[ ]` `template-draft.md` contains no `## Scope Estimate` and carries a scope-boundary (Won't Do) section that
  retains the dependencies prompt

- `[ ]` `draft-design.md` and `create-spec.md` each carry one boundary carry-forward line, and `create-spec`
  § Write and save instructs the author to retain the boundary carrier when emitting a spec

- `[ ]` All four spec templates carry the amendment-contract line at their existing boundary surface, with the
  `brief` form's carrier governing its scope-boundary clause alone, and no new section added to any of them

- `[ ]` `adversarial-review.md` § Context provisioning lists the governing spec's scope boundary **for** the
  frontline and standard review rows and carries the self-contained finding-shape sentence, both explicitly scoped
  to those two rows and conditioned on the change being spec-governed; its string assertions at all three sites
  still pass, including the negative one; no rubric method is modified

- `[ ]` The eight `Framework` files among the touched set are byte-identical across the package source and the
  project instance with the framework-sync gate green; the two `Configurable` files carry the intended edit in
  both copies, verified per copy rather than by that gate

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
