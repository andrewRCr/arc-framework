# PRD: Methodology Maturation

**Type:** Technical
**Updated:** 2026-04-06

---

## Introduction

ARC's principles (P1-P11) are implementation-independent, but this independence isn't cleanly
expressed in the documentation, distribution model, or operational tooling. The methodology and
framework implementation are conflated in language, bundled together in installs, and the
human side of ARC's co-development model exists only as a principle statement with no
operational support.

This matters now because the next work unit (ARC Operating Modes — Lite + local mode) requires
knowing which ARC components are methodology (non-negotiable in any mode) vs implementation
(can be adapted per mode). Without foundational clarity on this boundary, mode design becomes
guesswork. Additionally, the project's two-copy architecture (`.arc/` project instance +
`packages/arc-framework/arc/` distributable source) has caused repeated content regressions
with no safeguard in place, and the CLI's update behavior doesn't match its own file
classification — Framework files go through three-way merge despite being classified as
"rarely customized by adopters."

Six convergent concerns drive this work unit:

1. Language conflation between methodology and framework implementation across docs
2. No standalone methodology artifact — nowhere to understand "ARC the methodology" independent
   of `.arc/` directories and specific file formats
3. Content placement coupling — methodology canon bundled with operational content in every
   install, creating unnecessary update surface
4. Update dependency gaps — no safeguard against package-project desync
5. Missing positioning — no connection to harness engineering framing or broader AI-assisted
   development landscape
6. Human-side co-development gap — P2's principle of active human participation has no
   operational expression beyond "the agent stops and waits"

## Goals

1. Establish a clear, referenceable boundary between ARC-the-methodology and ARC Framework
   (the implementation)
2. Prevent future package-project desync through documented safeguards and tooling
3. Fix CLI update behavior to match file classification (wholesale replace for Framework files)
4. Evaluate and implement content placement decisions using Diátaxis taxonomy as a lens
5. Articulate the human co-development posture as part of ARC's methodology definition
6. Expand ARC's skill set to support human judgment at key pipeline moments
7. Streamline install root surface area

## Use Cases

**UC1 — Methodology evaluator.** Someone reads about ARC and wants to understand the
methodology without adopting the framework. Today they must read strategy docs that mix
principles with implementation conventions. After this work, a focused methodology artifact
lets them understand what ARC asks in five minutes.

**UC2 — Framework maintainer editing methodology docs.** Today, editing a workflow step in
`.arc/` risks regressing the package source, and vice versa. After this work, a dev safeguard
strategy and dependency map make the edit flow explicit, with optional hook enforcement.

**UC3 — Adopter running `arc update`.** Today, updating can produce merge conflicts on
Framework files that adopters shouldn't have modified. After this work, Framework files are
wholesale replaced — silent, conflict-free updates.

**UC4 — Developer at a mandatory stop.** Today, the review increment offers only the agent's
completion report. After this work, the developer can invoke `arc-review` to surface structured
information (spec deviations, judgment calls, unexpected file changes) for independent judgment.

**UC5 — Developer starting a new work unit.** Today, going from "vague idea" to "plan doc" is
unstructured — no context gathering, no framing. After this work, `arc-plan` sets up the
exploration context so the conversation starts informed.

**UC6 — Operating Modes designer (downstream).** The Operating Modes work unit needs to know
which components are methodology (preserve in all modes) vs implementation (adapt per mode).
This work unit produces that classification and the conditional content inventory that informs
mode design.

## Requirements

### P0 — Must-have (gates downstream work or resolves active problems)

1. **Package-project sync audit.** Both copies agree on all non-Configurable content, with
   documented deviations limited to project-specific customizations.
2. **Dev safeguard strategy.** Project-level strategy doc with dependency map, edit flow rules,
   and the two-copy architecture documented. Referenced from DEV-RULES.PROJECT.
3. **Hook enforcement evaluation.** Assess and document whether a pre-commit check can catch
   edits to `.arc/` copies of distributed files. Implement if warranted.
4. **Methodology boundary definition.** A clear, referenceable statement of ARC's methodology
   commitments — what ARC asks independent of any implementation.
5. **Grey area resolutions.** Design decisions on all 10 identified named patterns (review
   increment granularity, tiered quality gates, work categories, issue triage routing, context
   loading tiers, trust hierarchy, strategy document pattern, deferred review scope, verification
   phase, context footer requirement). Each classified as methodology or implementation with
   documented rationale.
6. **Human co-development posture.** Methodology-level articulation of what effective
   co-development looks like during task execution. Descriptive framing, not prescriptive.
7. **CLI update behavior fix.** Framework-classified files wholesale replaced on `arc update`
   instead of three-way merged. Eliminates merge conflicts for all Framework files.
8. **Content placement evaluation.** Documented decisions on all three axes (install vs docs
   site, arc/ vs project/ extraction, strategy doc prose quality) with rationale.
9. **Conditional content architecture inventory.** All current conditionals across workflows,
   templates, and CLI documented. Scaling assessment for proposed modes. Pattern guidance for
   new conditionals.
10. **Install root surface area.** `.arc/README.md` removed from installs. Document Audiences
    content extracted to docs site before removal. `user/` directory placement evaluated with
    documented decision.

### P1 — Should-have (significant value, bounded deferral risk)

11. **Content placement implementation.** If Axis 1 (install vs docs site) or Axis 2 (arc/ vs
    project/ extraction) decisions require file moves, content extraction, cross-reference
    updates, or docs site content placement — implement them. No deferred cleanup.
12. **Strategy doc prose quality.** Where strategy docs mix Reference and Explanation content,
    rewrite to cleanly separate concerns. Both sides must stand alone — remaining operational
    reference in the install, extracted explanation on the docs site (or cleanly separated
    in-place).
13. **Language and positioning cleanup.** Docs consistently distinguish methodology from
    framework implementation. Harness engineering framing integrated. Priority: externally-facing
    docs, philosophy strategy, docs site, README, agent briefings.
14. **Harness engineering positioning.** Moderate depth: positioning section in philosophy
    strategy, reference in docs site "What is ARC" content. "ARC's approach maps to the harness
    engineering model" framing.
15. **Skill exploration and development.** Systematic evaluation of the ARC workflow surface.
    At minimum, arc-review designed and implemented. arc-plan and arc-plan-audit evaluated —
    implement those that pass the bar.
16. **Connect skills to methodology docs.** arc-task-audit and new skills referenced from the
    methodology and workflow docs they support.

### P2 — Nice-to-have (valuable if achievable within scope)

17. **`user/` directory relocation.** If a `system/` rename or alternative structure resolves
    the semantic mismatch, implement the move. Otherwise, document the decision to keep at root.
18. **Hook-level enforcement for package-project sync.** If the evaluation (Req 3) shows a
    pre-commit hook is warranted and the design is clean, implement it in this WU rather than
    deferring.

## Non-Goals

- **Implementing ARC Lite or local mode.** Downstream — Operating Modes work unit. This WU
  produces the inputs (methodology boundary, conditional inventory, content architecture) that
  mode design needs.
- **Changing ARC's principle definitions.** P1-P11 are stable. This work clarifies their
  expression and operational support, not their content.
- **Full docs site rebuild.** The docs site is already robust with full operational content.
  This WU adds whatever methodology/philosophy content is extracted from strategy docs, with
  structural changes as needed to accommodate it. The site should work as well after this WU
  as it does now — no deferred cleanup.
- **Workflow architectural changes.** Workflows are not being redesigned. However, if other
  changes in this WU require workflow updates to maintain coherence (language cleanup, skill
  references, path changes from structural decisions), those updates are in scope — not deferred.
- **Team mode redesign.** Team coordination strategy gets language cleanup, not operational
  changes.

## Technical Considerations

**Two-copy architecture.** The package source (`packages/arc-framework/arc/`) is authoritative
for Framework and Configurable files. The project instance (`.arc/`) is a rendered output of
the package source plus project-specific customizations. Deliverable 1 establishes the
safeguard; all subsequent deliverables respect the edit flow (methodology edits go through
package source).

**CLI change scope.** The update behavior fix (Req 7) is bounded: in `applyChangePlan()`,
check classification before merging — Framework → write directly, Configurable → three-way
merge. The file classification infrastructure already exists; the merge path just doesn't use
it. Existing tests cover the merge behavior and will need updating.

**Docs site integration.** The docs site uses MkDocs Material with GitHub Pages. Adding
methodology content requires new pages and navigation structure in `mkdocs.yml`. The site has
full operational content from WU4; methodology/philosophy content is currently limited to one
philosophy page and conceptual scaffolding on the landing page.

**Strategy doc rewriting.** Separating Reference from Explanation in strategy docs is prose
work, not structural. The `strategy-*` prefix stays. No new doc type or prefix. The Diátaxis
distinction is a working lens for implementation, not a permanent taxonomy change.

**Skill implementation.** Skills are markdown files in `.claude/skills/` (or equivalent for
other agent platforms). Skills that trigger workflows (like arc-commit → prepare-commits.md)
require both a skill file and a supporting workflow. New skills may require new workflow docs
in `system/workflows/arc/supplemental/`.

## Success Criteria

1. Package and project copies in sync with zero undocumented deviations
2. Dev safeguard strategy operational — loaded or referenced when methodology edits are in scope
3. A reader can distinguish what ARC-the-methodology requires from what ARC Framework implements,
   using the methodology summary artifact and grey area resolutions
4. Human co-development posture described in methodology docs — descriptive, not prescriptive
5. `arc update` wholesale-replaces all Framework-classified files without merge conflicts
6. Strategy docs cleanly separate operational reference from explanation — whether explanation
   relocates to docs site or is separated in-place
7. Content placement decisions documented with rationale on all three axes
8. At least one new skill (arc-review) designed, implemented, and connected to methodology docs
9. `.arc/` root README removed; Document Audiences content preserved on docs site
10. Conditional content inventory documented with scaling assessment for proposed modes
11. Docs site remains fully functional — any content additions include required structural
    changes (navigation, cross-references)
12. All workflow and doc references remain coherent after structural changes — no broken
    cross-references or stale paths

## Open Questions

### Resolve during work

1. **Content placement post-CLI-fix.** With merge burden eliminated, is there still sufficient
   motivation to move explanatory content to the docs site? Remaining motivations
   (discoverability, install focus, Diátaxis clarity) are real but weaker. May resolve toward
   in-place separation rather than relocation.
2. **Strategy doc prose quality scope.** Does the Reference/Explanation separation belong in
   Deliverable 4, Deliverable 3, or span both? Likely emerges during implementation as language
   cleanup and content placement converge.
3. **arc-plan workflow weight.** The collaborative exploration skill needs to be light enough
   that planning doesn't feel like a Procedure. Validate during skill design that it adds value
   over just starting a conversation.
4. **Skill candidates.** arc-plan and arc-plan-audit may not survive detailed design. The
   exploration has value regardless — confirming a moment doesn't need a skill is a useful
   finding.
5. **`user/` directory final placement.** Leaning toward keeping at root. Revisit if a
   `system/` rename naturally resolves the semantic mismatch. Final decision during
   implementation.
6. **Hook enforcement viability.** Pre-commit check for package-project sync may be clean and
   simple, or may have edge cases that make it not worth the complexity. Evaluate and decide
   during Deliverable 1 Phase 2.

## Document History

| Date       | Change        |
| ---------- | ------------- |
| 2026-04-06 | Initial draft |
