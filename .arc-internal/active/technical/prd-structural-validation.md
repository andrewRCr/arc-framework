# PRD: Structural Validation

**Type:** Technical
**Completed:** 2026-03-10
**Status:** Complete

---

## Introduction

WU3 (CLI & Distribution) will bake the `.arc/` file tree into CLI tooling — `arc init` scaffolds it,
`arc update` merges it, the manifest tracks it. Once paths, classifications, and directory structure
are encoded in CLI logic, changing them is expensive: manifest migrations, pristine copy rebuilds,
and adopter-facing breaking changes.

This work unit is the gating check before that happens. It validates that the post-WU2 file tree is
accurate, well-organized, and stable — then locks it down so WU3 can build on a settled foundation.
Issues found here are cheap fixes; the same issues found mid-WU3 are backtracking.

**Why now:** WU2 (Methodology Completion) landed significant structural changes — new files, expanded
configs, restructured workflows. The file classification inventory exists and was maintained during
WU2, but hasn't had a dedicated validation pass against the final state. Several directory organization
questions surfaced during WU2 that were intentionally deferred to this checkpoint.

## Goals

1. **Confirm the file inventory is accurate** — every `.arc/` file classified, counts correct, no gaps
2. **Stabilize directory layout** — evaluate and resolve open organization questions before WU3 locks
   paths into CLI tooling
3. **Verify merge-boundary cleanliness** — Configurable files have clean section-level separation
   between framework and project content (paragraph-level interleaving causes false merge conflicts)
4. **Catch content drift** — identify duplicated content introduced during WU2's extensive changes
5. **Establish the optional content pattern** — decide where opt-in docs live so WU3 can build
   for it without retrofitting later

## Use Cases

1. **WU3 CLI developer** — needs a settled file tree with accurate classifications to build the
   manifest, init scaffolding, and update system. Can trust that paths won't move after this
   validation passes.

2. **Adopter running `arc update`** — benefits from clean merge boundaries in Configurable files.
   Misclassified files or paragraph-level interleaving causes lost customizations or unnecessary
   conflicts.

3. **Future framework maintainer** — benefits from logical directory grouping. A maintainer looking
   for "how do I archive a work unit?" should find it in a place that makes sense, not in a
   catch-all directory.

## Requirements

**P0 (must-have):**

1. **Inventory validation** — walk the actual post-WU2 `.arc/` file tree against the inventory in
   `strategy-file-classification.md`. Flag: missing files, extra files, moved files, classification
   changes, layer assignment errors, count inaccuracies. Update the inventory to match reality.
   Verify both axes independently: classification (Framework/Configurable/Scaffolded) determines
   merge behavior, layer (Core/arc-in-git) determines which files `arc init` installs based on
   `pm.mode`. Misassignment on either axis causes WU3 bugs.

2. **Workflow directory evaluation** — assess the current `workflows/arc/supplemental/` structure
   and determine whether reorganization is warranted. Key concerns:
    - "Supplemental" undersells core lifecycle workflows (activate, integrate, archive, rotate-branch)
    - Session workflows (init, handoff) are a distinct concern mixed in with work-process workflows
    - Evaluate grouping options (subdirectories, renaming, or status quo with better discoverability)
    - Decide and implement — file moves are in scope

3. **Strategy directory evaluation** — assess `strategies/arc/` organization (10 files). Determine
   whether subdirectories or naming changes improve navigability, or whether the current flat
   structure is fine at this scale. Decide and document the decision.

4. **Mixed-concern audit** — confirmatory pass on all Configurable files. For each, verify framework
   and project content separate at the section level. Flag any paragraph-level interleaving with a
   proposed resolution.

5. **Optional content pattern** — decide where opt-in framework content lives (workflows, strategies,
   or other docs that ship with ARC but aren't installed by default). Establish a forward-compatible
   structure. Examples of future optional content: agent-specific subagent configurations,
   alternative review workflows, specialized strategy documents. The pattern should work for WU3's
   selective installation model.

8. **Workflow navigability validation** — walk common lifecycle scenarios (fully protected batch,
   partially protected, standalone planning, new-session discovery) through the complete workflow
   chain. Bookend approach: baseline before structural changes establishes findings that inform
   directory evaluation (R2) and de-duplication (R6); validation after structural changes confirms
   the end state is agent-navigable. Flag: dead-ends, ambiguous routing, excessive conditional
   parsing, cross-reference hops that force loading extra documents mid-operation.

**P1 (should-have):**

6. **De-duplication check** — audit for content appearing in multiple `.arc/` documents. Classify
   each instance (intentional reinforcement, accidental drift, misplacement) and resolve. Focus on
   high-traffic areas: DEV-RULES.ARC vs. workflows, strategies vs. workflows, arc-methods vs.
   workflows.

7. **Cross-cutting dependency map** — identify concepts that span multiple files and their blast
   radius. Focus on what WU3 needs: file classifications, config settings, method references,
   session state model. Output as a focused reference table, not a comprehensive document.

## Non-Goals

- **No CLI implementation** — outputs inform WU3 but don't build CLI features
- **No methodology changes** — this validates structure, not process. If a workflow's *content* needs
  updating, that's incidental work, not structural validation scope
- **No new strategy documents** — evaluation may recommend future splits but doesn't write new
  strategies
- **No template system design** — token rendering, conditionals, and init-recipe format are WU3
  scope

## Technical Considerations

**Sequencing:** Navigability baseline (R8) and inventory validation (R1) run first — the baseline
informs directory evaluation decisions, and the inventory establishes the accurate foundation other
checks reference. Layout evaluation (R2, R3) and mixed-concern audit (R4) can run in parallel after
that. Optional content pattern (R5) depends on layout decisions. De-duplication (R6) and dependency
mapping (R7) run last as they benefit from the full picture. Navigability validation (R8, second
pass) runs after all structural changes to confirm the end state is agent-navigable.

**Existing artifacts:**

- `strategy-file-classification.md` has the current inventory (64 files, taxonomy, merge strategies)
- `plan-wu3-cli-distribution.md` documents what WU3 needs from the file tree
- WU2's methodology completion touched most `.arc/` files — the git log is the authoritative record
  of what changed

**Layout changes are implementation:** Unlike the original PRD framing ("analysis only"), this work
unit includes file moves when the evaluation warrants them. Directory reorganization means `git mv`,
cross-reference updates, and inventory updates — all of which must land before WU3 starts.

**Impact on cross-references:** Any file moves require updating all documents that reference the moved
files — link definitions, workflow cross-references, strategy doc pointers, and the file inventory
itself. This is bounded work but must be thorough.

## Success Criteria

1. **Inventory matches reality** — every `.arc/` file appears in the inventory with correct
   classification, layer, and path. No unclassified files.
2. **Layout decided and stable** — workflow and strategy directory organization is evaluated,
   decided, and implemented (if changes warranted). No open structural questions remain for WU3.
3. **Merge boundaries clean** — every Configurable file has section-level separation confirmed.
   No paragraph-level interleaving that would cause false merge conflicts.
4. **Optional content pattern established** — forward-compatible structure exists (even if no
   optional content ships yet). WU3 can build selective installation against it.
5. **Workflow lifecycle paths are navigable** — agents following documented workflows reach the
   right next step without dead-ends or confusion from conditional density.
6. **WU3-ready** — the file tree, classifications, and directory layout are locked down. WU3 can
   hardcode paths with confidence.
7. **Lifecycle scenarios navigable** — common scenarios (fully protected batch, partially
   protected, standalone planning, new-session discovery) can be walked through the workflow
   chain without dead-ends, ambiguous routing, or excessive conditional parsing.

## Open Questions

1. **Workflow reorganization depth** — Resolved: both rename and reorganize. Promoted 8 lifecycle
   workflows from `supplemental/` to peer `work-unit-lifecycle/` directory. Session workflows promoted
   to `session-lifecycle/`. `supplemental/` retained for 3 genuinely supplemental guides.

2. **Optional content location** — Resolved: existing structure is already forward-compatible.
   External content lands in natural project-owned directories (`strategies/project/`, project workflow
   directories, arc-methods overrides). No new directories or classifications needed.

3. **Strategy split threshold** — Resolved: keep flat at 10 files. Reconsider at ~15–18. Current
   STRATEGY-INDEX.md provides sufficient conceptual grouping.

## Document History

| Date | Change |
| ---------- | ------ |
| 2026-02-26 | Initial draft (as WU2b, speculative scope pending WU2 completion) |
| 2026-03-06 | Full rewrite — refined to focused gating check based on post-WU2 reality. Dropped WU2b framing. Added layout evaluation with implementation scope. Added optional content pattern. Sharpened requirements against what WU3 actually needs. |
