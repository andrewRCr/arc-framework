# Workflow: Create PRD

**Audience:** Collaborative — developer and agent work through this together.

**Purpose**: Guide the creation of work-level PRDs that define scope and requirements for individual
pieces of planned work. Work PRDs build on the project vision established in the META-PRD.

ARC distinguishes two work types:

- **Feature** — User-facing capabilities
- **Technical** — Infrastructure, architecture, or process improvements

See [Work Organization Strategy][work-org] for the complete
decision tree.

**Note**: This workflow covers work-level PRDs, not the project-wide META-PRD. For constitutional
documents, use [02_define-project.md](setup/02_define-project.md).

---

## Process

Before starting, review the project's META-PRD and TECHNICAL-OVERVIEW to ensure the new work aligns
with existing vision and technical direction.

### Step 1: Check for Existing Planning Artifacts

Check if a `plan-*.md` file exists for this work in `.arc/backlog/` (under the appropriate `feature/`
or `technical/` subdirectory). Plan documents are the primary pre-PRD planning
artifact — they capture research, resolved decisions, and approach before work becomes active.

**If a plan exists**: Read it as your primary context. It may reference supplemental `notes-*.md`
files with additional detail — read those too. Focus discovery (Step 3) on gaps and ambiguities
rather than broad exploration.

**If no plan exists**: Proceed directly to discovery.

PRDs are created when work becomes active, not speculatively — plan documents prevent requirements
from going stale by capturing evolving understanding during the planning phase.

### Step 2: Determine Work Category

Classify as **feature** or **technical**:

- **Feature**: Adds user-visible capability from the product vision
- **Technical**: Infrastructure, architecture, or internal improvement

This determines save location and influences PRD emphasis — features lean toward user impact,
technical work leans toward system impact and migration strategy.

### Step 3: Conduct Discovery

Ask clarifying questions to establish the "what" and "why." The "how" comes during task generation
and implementation.

**With a plan**: Ask targeted questions — fill gaps, validate assumptions, resolve open items.

**Without a plan**: Ask broader questions to establish scope:

- **Problem/Goal**: What problem does this solve? What does success look like?
- **Scope**: What's in scope? What's explicitly out?
- **Requirements**: What must the solution do? What constraints exist?
- **Technical context**: Dependencies, integration points, migration concerns
- **Unknowns**: What needs investigation before implementation?

For interactive sessions, provide numbered options to keep responses quick.

### Step 4: Write and Save PRD

Generate the PRD using the format below. Save to:

- **Feature**: `.arc/backlog/feature/prd-{{FEATURE_NAME}}.md`
- **Technical**: `.arc/backlog/technical/prd-{{FEATURE_NAME}}.md`

**Stop here** — do not proceed to task generation. The PRD should be reviewed first. When ready,
continue with [2_generate-tasks.md](2_generate-tasks.md).

---

## PRD Format

### Header

```markdown
# PRD: [Work Name]

**Type:** Feature | Technical
**Updated:** YYYY-MM-DD

---
```

For PRDs with unresolved dependencies, add before the rule:

```markdown
**Status:** Pending Dependencies

**Related Work:**

- ⏳ Depends on: [Dependency] — brief description
- ✅ Complete: [Resolved dependency] — brief description
```

When dependencies resolve, remove Status and Related Work, then proceed to task generation.

### Content Sections

Adapt emphasis based on work type — not every section carries equal weight for every PRD.

1. **Introduction** — What this work is and why it matters. State the problem or opportunity.
2. **Goals** — Specific objectives this work aims to achieve.
3. **User Stories or Use Cases** — For features: user narratives ("As a... I want... so that...").
   For technical work: system scenarios or migration cases that illustrate the change.
4. **Requirements** — Numbered list of what the solution must do. Be specific and unambiguous.
5. **Non-Goals** — What this work explicitly won't include. Critical for scope management.
6. **Technical Considerations** *(optional)* — Constraints, dependencies, architectural implications,
   or integration points. Often the core of technical PRDs; supplementary for features.
7. **Design Considerations** *(optional, primarily features)* — UI/UX requirements, mockups, or
   component patterns when applicable.
8. **Success Criteria** — How will you know this succeeded? Features might measure user impact;
   technical work might measure performance, reliability, or developer experience improvements.
9. **Open Questions** — Unresolved questions or areas needing further investigation.

---

[work-org]: ../../../reference/strategies/arc/strategy-work-organization.md
