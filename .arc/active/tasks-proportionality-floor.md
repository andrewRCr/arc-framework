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

### `[x]` **2.2 Amendment carrier on all four spec forms**

- _Goal:_ Whichever form a work unit is specified in, exactly one boundary surface states that it freezes at
  activation and how a later change records itself.

    - `[x]` **2.2.a Settle the carrier wording and apply it to the `outline` form**
        - Settled wording: `_Frozen at activation; changes after that append:
          `Amended YYYY-MM-DD — <delta> — <prompt>`_`. It is the form this work unit's own spec already carries,
          so the phrasing is field-tested rather than newly coined.
        - Seated directly under `template-spec-outline.md` § Scope boundary (No-gos), above the section's prose.

    - `[x]` **2.2.b PRD form**
        - Same line verbatim under `template-spec-detailed-prd.md` § Non-Goals — the surviving carrier on a
          paired PRD plus RFC.

    - `[x]` **2.2.c RFC form**
        - Same line verbatim under `template-spec-detailed-rfc.md` § Non-Goals. The section is
          `omit-when-paired`, so a paired set drops it along with its carrier; the line serves the standalone
          case, leaving exactly one carrier governing a spec either way.

    - `[x]` **2.2.d `brief` form**
        - Seated as a standalone italic line after the braced paragraph rather than inside it. Braced guidance is
          replaced wholesale on emit, so a carrier placed there would be the single most likely thing lost —
          recreating the very failure the retain instruction exists to prevent, one layer earlier and beyond its
          reach.
        - Keeps the settled sentence verbatim and adds the form's scoping: the freeze governs the scope-boundary
          clause alone, intent and the success signal keep revising in place, amendment lines append below the
          paragraph.

- _Outcome:_ One wording reaches all four forms, so the retain instruction in Task 2.3.c has a single exact line
  to quote. No new section was added to any template — each carrier attached to the boundary surface already
  present — and all four pairs are byte-identical across the two copies.

### `[x]` **2.3 Workflow-side instructions that keep the boundary alive**

- _Goal:_ The boundary survives both stage transitions that could silently lose it — the draft-to-spec handoff,
  and the template-to-finalized-spec emit.

    - `[x]` **2.3.a Carry-forward line in `draft-design.md`**
        - § Draft in the resolved level now states that whatever the path produces, the scope boundary it records
          is what the spec inherits — authored as a handoff surface, not a private note.
        - Seated after the path-selection sentence and above the `low` heading, the last point common to all
          three paths, so the artifact-less `low` path is covered rather than silently skipped.

    - `[x]` **2.3.b Carry-forward line in `create-spec.md`**
        - New `### Scope-boundary carry-forward (all forms)` states that the spec's boundary inherits the
          draft's and sharpens it, never silently dropping a recorded commitment, and that where no `draft-*`
          exists the inheritance arrives as the carried determinacy-confirm instead.
        - Seated in the same all-forms band as § Proportionality guard, above the three per-form blocks — the
          file's existing pattern, and what keeps `low → brief` in scope.

    - `[x]` **2.3.c Retain-on-emit instruction in `create-spec.md` § Write and save**
        - Added directly after the strip contract, its complement: the carrier sits inside a section body the
          author replaces wholesale, so the instruction says to keep it and quotes the exact settled line in a
          `text` block for recognition, including the `brief` form's clause-scoping sentence.

    - `[x]` **2.3.d Close the phase's gates**
        - Both workflow pairs verified byte-identical, both diffs pure insertions with frontmatter untouched.
        - Markdown gate, all three ARC contract checks, and the full code checks green — `lint:ts`, `lint:sh`,
          both type checks, and the whole suite at 743 files.

- _Outcome:_ The chain is unbroken end to end: draft records the boundary, spec inherits and sharpens it, emit
  retains the amendment contract. Both lines sit above their stage's path split, so the two lightest paths — the
  one that produces no draft and the one that maps to the form with no boundary section — are covered by
  placement rather than by a criterion that would have passed either way.

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
