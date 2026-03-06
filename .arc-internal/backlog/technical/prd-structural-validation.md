# PRD: Structural Validation Pass (WU2b)

**Type:** Technical
**Status:** Pending Dependencies
**Updated:** 2026-02-26

**Related Work:**

- Depends on: WU2 Methodology Completion — all methodology changes must land before validation
- Complete: WU1 (Philosophy & Configurability) — file classification strategy established
- Complete: WU1.5 (Foundational Gap Closure) — reclassification checkpoint specified

---

## Introduction

WU2's methodology completion transforms `.arc/` significantly: new files (DEV-RULES.ARC,
arc-extensions.md, arc-methods.md, rotate-branch.md, WORKFLOW-INDEX), restructured files
(DEV-RULES.PROJECT, slimmed strategies, redesigned session-init), expanded config, and hook
changes. After all that lands, the file tree needs validation — not to check individual changes
(WU2 quality gates handle that) but to verify the *whole* is coherent.

This validation produces the inventory WU3 (CLI design) needs to reason about what gets
templated, what gets updated during `arc update`, and what users own after initialization. Without
it, WU3 operates on assumptions about file classification that may not reflect post-WU2 reality.

**Why a separate work unit:** This work has a hard dependency on WU2 completion — it validates
the post-WU2 state, not a snapshot. It also produces different deliverables (analysis artifacts
vs. doc edits) and benefits from a separate review cycle. Requirements here are deliberately
lightweight and will sharpen as WU2 implementation reveals the actual post-change landscape.

## Goals

1. **Classify every `.arc/` file** — Produce a definitive ownership and update-strategy
   classification for the post-WU2 file tree
2. **Identify mixed-concern files** — Flag files that interleave framework-stable and
   project-configurable content, proposing separation or marking strategies
3. **Map cross-cutting dependencies** — Identify concepts that span files and their blast
   radius, informing WU3's update command design
4. **Eliminate accidental duplication** — Audit for content that migrated during WU1 → WU1.5 →
   WU2 without fully cleaning source documents

## Use Cases

1. **WU3 CLI designer** — Needs to know: which files does `arc init` scaffold? Which does
   `arc update` touch? Which are project-owned and never modified? The classification inventory
   answers all three directly.

2. **Adopter running `arc update`** — A file classified as "configurable" gets three-way merged;
   a file classified as "framework" gets overwritten. Misclassification means either lost
   customizations or stale framework content. The mixed-concern audit prevents this.

3. **Future maintainer editing a concept** — Changing how "archive trigger" works requires
   updates in strategy-work-organization, integrate-work-unit, archive-work-unit, process-task-loop, and
   rotate-branch. The dependency map shows this blast radius upfront.

## Requirements

> **Note:** These requirements are intentionally high-level. The specific scope and format of
> each deliverable will be refined after WU2 implementation reveals the final file tree.
> Requirements may be added, expanded, or adjusted based on what WU2 surfaces.

**1. File classification inventory**
Categorize every `.arc/` file using the classification taxonomy from
`strategy-file-classification.md`: framework-owned (update freely), configurable (merge
carefully), scaffolded (project-owned after init), project-owned (never touched by ARC).
Include an explicit reclassification pass — WU2 changes may shift classifications from their
pre-WU2 state. Output format TBD (classification table, annotated file tree, or strategy
document update).

**2. Mixed-concern identification**
Flag files that interleave framework-stable and project-configurable content at the paragraph
level. For each: note the specific sections and propose whether separation is warranted or
whether a marker/comment is sufficient. Validate the post-WU2 state — WU2's methodology
changes may have introduced new mixed-concern sections.

**3. Cross-cutting dependency mapping**
Identify concepts that span multiple files and map their blast radius: which concepts, if
changed, require updates across N+ files? Output informs WU3 CLI design — update commands
need to know which files move together. Format TBD.

**4. Content de-duplication audit**
Audit all `.arc/` documents for content appearing in multiple places. Classify each instance:
intentional reinforcement (summary referencing detail — mark authoritative source), accidental
drift (full copy that should be a cross-reference — trim), or misplacement (content in the
wrong document — relocate). Runs after all other validation items since it depends on the
complete post-WU2 document set.

## Non-Goals

- **No implementation changes** — This work unit produces analysis and recommendations. If the
  audit reveals files that should be split, content that should move, or classifications that
  need updating, those changes are either quick fixes applied inline or scoped as follow-up
  work for WU3.
- **No CLI design** — The outputs feed WU3 but don't prescribe CLI behavior.
- **No re-litigation of WU2 decisions** — Classification validates the result of decisions
  already made; it doesn't revisit them.

## Technical Considerations

**Sequencing within this work unit:** L1 (classification) and L3 (dependency mapping) can run
in parallel. L2 (mixed-concern) builds on L1's classifications. L4 (de-duplication) runs last
as it benefits from the full picture established by L1-L3.

**Existing strategy:** `strategy-file-classification.md` already defines the taxonomy and
classification principles. This work unit applies them to the post-WU2 file tree — it doesn't
redefine the taxonomy.

**Output consumers:** WU3 (CLI design) is the primary consumer. Outputs should be in a format
WU3 can reference directly during task generation. Secondary consumer: future maintainers
navigating cross-cutting changes.

**Expect this PRD to evolve:** WU2 implementation may surface structural concerns, new files,
or reclassification needs not anticipated here. This PRD should be updated as those emerge —
it's a living document until WU2b activates.

## Success Criteria

1. **Every `.arc/` file classified** — No unclassified files in the post-WU2 tree
2. **Mixed concerns flagged** — Every file with interleaved ownership has a documented
   disposition (separate, mark, or accept)
3. **Dependency map complete** — Cross-cutting concepts identified with blast radius documented
4. **Duplication resolved** — Every instance of duplicated content has a classification
   (intentional/drift/misplaced) and an action (mark source, trim, or relocate)
5. **WU3-ready** — Outputs are in a format that directly informs CLI design decisions

## Open Questions

1. **Output format** — Single document, multiple documents, or inline annotations in
   `strategy-file-classification.md`? Depends on volume and how WU3 wants to consume it.

2. **Scope of "fix inline" vs. "defer to WU3"** — If the audit reveals a file that clearly
   needs splitting, is that a quick fix here or WU3 scope? Likely case-by-case, but a
   principle would help.
