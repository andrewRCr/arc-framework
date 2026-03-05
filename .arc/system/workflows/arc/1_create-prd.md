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
See [Work Planning Strategy][work-planning] for the full planning pipeline and `plan-*` conventions.

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
and implementation. See the [discovery checklist][discovery-checklist] for comprehensive coverage.

**With a plan**: Ask targeted questions — fill gaps, validate assumptions, resolve open items.

**Without a plan**: Ask broader questions to establish scope:

- **Problem/Goal**: What problem does this solve? What does success look like?
- **Scope**: What's in scope? What's explicitly out?
- **Requirements**: What must the solution do? What constraints exist?
- **Technical context**: Dependencies, integration points, migration concerns
- **Unknowns**: What needs investigation before implementation?

For interactive sessions, provide numbered options to keep responses quick.

### Step 4: Write and Save PRD

Generate the PRD using [template-prd.md][template-prd]. The template includes section guidance,
dependency tracking, priority levels, and document history conventions. Adapt emphasis based on
work type — not every section carries equal weight for every PRD.

Save to:

- **Feature**: `.arc/active/feature/prd-{{WORK_NAME}}.md`
- **Technical**: `.arc/active/technical/prd-{{WORK_NAME}}.md`

**Stop here** — do not proceed to task generation. The PRD should be reviewed first. When ready,
continue with [2_generate-tasks.md](2_generate-tasks.md).

---

[work-org]: ../../../reference/strategies/arc/strategy-work-organization.md
[work-planning]: ../../../reference/strategies/arc/strategy-work-planning.md
[discovery-checklist]: ../../../reference/strategies/arc/strategy-work-planning.md#discovery-checklist
[template-prd]: ../../../reference/templates/template-prd.md
