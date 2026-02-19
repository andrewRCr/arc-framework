# PRD: Content Refinement Pass

**Type:** Technical
**Status:** Complete
**Created:** 2026-02-17
**Completed:** 2026-02-19

---

## Introduction

The ARC framework's `.arc/` template system — 37 files across workflows, strategies, constitution templates, agent
templates, and active/backlog scaffolding — has accumulated content quality issues over several months of development.
These include project-type bias from the original battle-testing project (CineXplorer), agent-specific content in
generic docs, inconsistent template approaches, and process documentation that doesn't distinguish essential guidance
from accumulated depth.

This PRD defines the content refinement pass (Roadmap Phase B.2): a systematic content quality improvement across all
`.arc/reference/`, `.arc/active/`, and `.arc/backlog/` template files. The goal is clean, accurate, properly-agnostic
content as a foundation for the structural analysis pass (B.3) and eventual public distribution.

**Pre-work completed:**

- Philosophy articulation and aspirational README (`README-ASPIRATIONAL.md`) — establishes the framework's voice,
  positioning, and north star for how it should present itself
- Landscape research (`research-landscape-analysis-2026-02.md`) — confirms ARC's positioning and key differentiators
- File-by-file evaluation (`notes-refinement-pass.md`) — 37-file content quality audit with 12 adopter concerns,
  8 strengths, and structural observations
- Planning document (`plan-content-refinement-pass.md`) — organizes findings into work areas with sequencing and
  resolved decisions

**Relationship to other work:**

- **Roadmap B.1** (distribution plan) — complete; informs template approach decisions here
- **Roadmap B.3** (structural analysis) — next phase; depends on clean content from this pass
- **Roadmap B.5** (README refresh) — absorbed by aspirational README pre-work
- **Technical backlog** — "General Refinement Pass" and "README.md Refresh" items both absorbed by this PRD

## Goals

1. **Eliminate project-type and tech stack bias** from framework-generic documents so ARC genuinely works for any
   project type (CLI tools, libraries, data pipelines, documentation projects, web apps, monorepos)

2. **Remove agent-specific content from framework-generic docs** so any AI coding agent can use ARC without
   encountering tool-specific assumptions

3. **Standardize template approach** across all `.example.md` files: structure + inline guidance + tokens for user
   content (not full project content requiring wholesale replacement)

4. **Streamline heavyweight process documentation** so essential guidance comes first and accumulated depth follows —
   without losing legitimate value

5. **Fix known content issues** identified in the evaluation: mismatches, stale references, missing examples,
   formatting errors

6. **Apply philosophy alignment** as a cross-cutting lens: each document touched should lean into ARC's tight-coupling
   philosophy where relevant, connecting rules to rationale

## User Stories

- As an **adopter evaluating ARC** for a Python CLI tool, I can read the framework docs without encountering
  assumptions about Docker, frontend frameworks, or feature branches with PRs — the framework feels applicable to
  my project type.

- As an **adopter using Gemini CLI**, I can follow the process-task-loop workflow without encountering Claude
  Code-specific tool references or JSON examples that don't apply to me.

- As an **adopter setting up a new project**, I can fill in template files by following inline guidance and replacing
  tokens — I don't need to strip out and replace 100% of a template's body content to make it mine.

- As an **adopter reading atomic-commit.md** for the first time, I understand the essential commit workflow within the
  first 40% of the document; edge cases and accumulated depth come later if I need them.

- As a **developer who has adopted ARC**, I encounter consistent patterns across all framework documents: consistent
  template style, consistent audience framing, consistent terminology.

## Functional Requirements

### Area A: Agnosticism Corrections (Foundational)

**A1. Project-type and tech stack agnosticism**

1. Audit all `.arc/reference/` workflows and strategies for implicit assumptions about project type (backend +
   frontend, Docker, feature branches with PRs, substantial test infrastructure)
2. Generalize language and examples to be project-type-neutral where possible
3. Add conditional framing ("Include if applicable", "For projects with frontend components") where sections genuinely
   only apply to certain project types
4. Ensure examples span multiple project types rather than defaulting to web app patterns

**A2. Agent and tooling agnosticism**

5. Generalize the "TodoWrite Tool" section in `3_process-task-loop.md` from Claude Code-specific to tool-agnostic
   (e.g., "session-scoped tracking tools")
6. Rework `agent-pre-merge-review.md` to have a tool-agnostic core with agent-specific details clearly separated
   (or moved to agent-specific files)
7. Audit remaining workflow and strategy docs for any other agent-specific content that has leaked into
   framework-generic documents

**A3. Document audience clarity**

8. Add brief audience indicators to documents where the audience isn't obvious — light touch, one-line notes (e.g.,
   "This workflow is executed by your AI agent; you don't need to read it for daily use — only when customizing")
9. Ensure `.arc/README.md` clearly communicates which documents are agent-executed, which are shared context, and
   which are human-facing (the audience table from the aspirational README provides the model)

### Area B: Template Consistency

**B1. Standardize template approach in `.example.md` files**

10. Rework `META-PRD.example.md` from CineXplorer-specific body content to structure + inline guidance + tokens. Each
    section should explain what goes there and why it matters, with tokens for user-owned content.
11. Rework `TECHNICAL-OVERVIEW.example.md` — same approach. Remove hardcoded project name, replace project-specific
    content with guidance + tokens.
12. Rework `PROJECT-STATUS.example.md` — same approach. Replace 130+ lines of CineXplorer completion history with a
    representative structure showing what a mature status doc looks like, using tokens.
13. Verify `DEVELOPMENT-RULES.example.md` (already well-templated) — check that frontend-specific sections have
    conditional framing for non-frontend projects
14. Verify other `.example.md` files maintain the standard approach

**B2. Align CURRENT-SESSION template with handoff workflow**

15. Update `CURRENT-SESSION.example.md` to use fields that match `session-handoff.md` expectations: "Following Task
    List", "Current Task" (with line number), structured completion tracking, "Additional Context for Next Session"

**B3. Fix completion sample**

16. Replace `archive/technical/completion-sample.example.md` with a proper sample matching the template described in
    `archive-completed.md` workflow. Remove non-standard YAML frontmatter.

**B4. Clarify strategy references**

17. Reframe `STRATEGY-INDEX.md` project strategy section to make clear these are examples of strategies adopters might
    create, not files that should exist
18. Check `DEVELOPMENT-RULES.example.md` and `2_generate-tasks.md` for similar phantom references and add clarifying
    framing

### Area C: Streamline Heavyweight Documentation

**Scope: within-document changes only.** Tighten prose, reorder sections, consolidate examples. Do not split documents
or move sections to new files — note any such opportunities for the structural analysis pass (B.3).

**Principle:** A reader who stops at 60% of the document should have everything they need for normal use. Essential
guidance first, accumulated depth and edge cases later.

19. Streamline `atomic-commit.md` (~430 lines) — evaluate whether all 6 pre-commit analysis steps are necessary given
    session-boundary improvements; consider reducing ceremony for simple cases while preserving the full protocol for
    complex commits
20. Streamline `maintain-task-notes.md` (~860 lines) — keep the two-mode structure (mid-work vs archival); tighten
    lessons-learned and common-pitfalls sections; front-load essential guidance
21. Streamline `strategy-task-list-formatting.md` (~1520 lines) — Quick Format Checklist is already well-positioned at
    top; tighten extensive edge cases and detailed rule explanations; consolidate or reduce examples where multiple
    examples serve the same point
22. Apply general "essentials first, depth later" reordering to other documents touched during Areas A-B where the
    opportunity is clear — not a separate full pass, but applied as a lens during other work
23. Clarify autonomous work mode framing in `CLAUDE.example.md` (and equivalents) as a bounded exception within the
    tight-coupling philosophy, not a separate operating mode

### Area D: Content Fixes

**D1. Document co-development and parallel work**

24. Add guidance in agent-facing docs that the developer may be making changes in parallel, so unexpected diffs are
    normal (not anomalies to flag)
25. Acknowledge co-development in process docs as part of the workflow, not an exception
26. Connect to "staying connected to the codebase" philosophy — single-threaded, small-scope work keeps the developer
    engaged whether they're reviewing, steering, or writing code alongside the agent

**D2. Specific identified fixes**

27. Add concrete example to "collaborative voice" rule in `DEVELOPMENT-RULES.example.md`
28. Replace `git add -A` with specific file staging in `activate-work-unit.md`
29. Fix double horizontal rule in `manage-incidental-work.md` (line ~306-307)
30. Generalize team language in `0_define-constitution.md` ("Team Review" → "Review with collaborators" or similar)
31. Add clarifying note in `2_generate-tasks.md` that `strategy-testing-methodology.md` is a project-level strategy
    adopters create, not a framework-provided file
32. Evaluate `agent/README.md` migration-from-AI-SHARED section — remove or minimize if stale for new adopters
33. Add "illustrative, not measured" clarification to metrics table in `agent-pre-merge-review.md`
34. Resolve minor redundancy between `strategy-adr-methodology.md` template section and `adr-template.md`

**D3. Auto-compact prohibition**

35. Document auto-compact/context-summarization prohibition in agent-specific template files (CLAUDE.example.md, etc.)
    with rationale: sessions must end with explicit handoff, not context degradation
36. Add brief note in session-init or session-handoff workflow about the assumption that sessions end with handoff,
    not compaction

## Non-Goals

- **Structural restructuring** — No splitting documents, moving sections to new files, or reorganizing the file tree.
  Structural findings are noted for the structural analysis pass (Roadmap B.3).
- **Distribution tooling** — No CLI work, manifest design, or package structure.
- **Adoption experience materials** — No getting-started guide, quick-start path, or entry-point materials beyond what's
  naturally improved by better content. Full E2 work depends on A-D outcomes and distribution decisions.
- **New workflows or strategies** — Improve existing content, don't add new process documents.
- **`.arc-internal/` content** — This PRD covers the deployable `.arc/` template system only. Internal framework docs
  are maintained separately.
- **Aspirational README iteration** — `README-ASPIRATIONAL.md` is a dev-repo planning artifact; further iteration
  happens organically, not as a formal task.

## Technical Considerations

- **Template approach is decided:** Structure + inline guidance + tokens for user content. This is driven by three-way
  merge requirements — framework-owned and user-owned content on separate lines minimizes conflict surface for the
  distribution system's update mechanism. See `plan-distribution-and-update-system.md` for details.

- **Markdown linting is the quality gate.** All modified files must pass `npx --yes markdownlint-cli2` with zero
  violations before any commit.

- **Preserve what works.** The evaluation identified 8 strengths (three-tier structure, numbered workflows, work
  categorization, session handoff, strategy/ADR distinction, GTD backlog, tiered quality gates, agent-agnostic
  architecture). These are guardrails during refinement — don't break them.

- **Philosophy alignment is a lens, not a phase.** When touching any document, ask: "Does this lean into the
  tight-coupling philosophy, undermine it, or just not engage with it?" Capture significant misalignments but don't
  force philosophy into every paragraph.

- **Distribution-awareness during content work.** Keep merge-friendliness in mind (especially when reworking templates
  in Area B), but don't let structural concerns block content corrections. If streamlining reveals needs for
  between-document restructuring, note them for B.3 rather than executing them.

- **Note structural observations.** When content work reveals structural issues (file should be split, sections belong
  elsewhere, mixed concerns), capture them as notes for the B.3 structural analysis pass.

## Sequencing

```text
A (Agnosticism) ──► B (Templates) ──► C (Streamlining) ──► wrap-up
                                            │
D (Content Fixes) ── interleave throughout ─┘
```

- **A before B:** Template cleanup should build on properly-agnostic content, not clean up content that still carries
  project-type or agent bias.
- **B before C (soft):** Streamlining is easier with consistent, clean templates as baseline. Not strictly blocked —
  can overlap.
- **D is independent:** Small fixes can be batched or interleaved with any area. Natural to fix items in a file while
  already editing it for A/B/C work.

## Success Criteria

1. All `.arc/reference/` workflow and strategy docs are free of project-type-specific assumptions (or use conditional
   framing where sections are project-type-dependent)
2. No agent-specific content remains in framework-generic documents
3. All `.example.md` constitution templates follow the structure + guidance + tokens approach — an adopter can fill
   them in rather than strip and replace
4. `CURRENT-SESSION.example.md` aligns with `session-handoff.md` expectations
5. All specific content fixes from D2 are addressed
6. Heavyweight docs (atomic-commit, maintain-task-notes, task-list-formatting) have essential guidance front-loaded;
   a reader stopping at 60% gets what they need for normal use
7. Auto-compact prohibition is documented in agent template files
8. All modified files pass markdown linting with zero violations
9. Structural observations encountered during content work are captured as notes for B.3

## Open Questions (Resolved)

1. **Streamlining calibration.** Resolved — "60% rule" established: a reader stopping at 60% gets
   everything needed for normal use. Applied across Phase 5 (atomic-commit 431→128 lines,
   maintain-task-notes 863→359 lines, task-list-formatting 1176→768 lines).

2. **agent-pre-merge-review.md scope.** Resolved — handled as a standard subtask within Phase 3
   (Task 3.8). CodeRabbit-specific content generalized to tool-agnostic patterns without requiring
   a separate work unit.

## Reference Documents

- Evaluation notes: `.arc-internal/active/notes-refinement-pass.md`
- Planning document: `.arc-internal/backlog/technical/plan-content-refinement-pass.md`
- Aspirational README: `README-ASPIRATIONAL.md`
- Landscape research: `.arc-internal/active/research-landscape-analysis-2026-02.md`
- Distribution plan: `.arc-internal/backlog/feature/plan-distribution-and-update-system.md`
- Roadmap: `.arc-internal/backlog/ROADMAP.md`
