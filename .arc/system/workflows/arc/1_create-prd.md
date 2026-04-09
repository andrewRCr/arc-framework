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
documents, use [02_define-project.md](initial-setup/02_define-project.md).

---

## Process

**Branch context:** Under full protection (`branch.protection: full`), PRD creation happens on a
planning branch — verify you're on one before proceeding (created via
[activate-planning-branch][activate-planning-branch]). Under partial protection (the default),
PRDs may be created directly on the base branch.

Before starting, review the project's META-PRD and TECHNICAL-OVERVIEW to ensure the new work aligns
with existing vision and technical direction.

### Step 1: Check for Existing Planning Artifacts

Check if a `plan-*.md` document exists for this work. Plan documents capture resolved decisions,
alternatives considered, and approach direction before requirements crystallize into a PRD. See
[Work Planning Strategy][work-planning] for `plan-*` conventions and the discovery checklist.

Where to look depends on your project's PM mode ([`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git**: `.arc/backlog/{category}/` — plans live in the backlog as part of the planning
  pipeline and graduate to PRDs when ready
- **none / external**: `.arc/active/{category}/` — plans are co-located with the PRDs they feed
  into (no backlog directory)

**If a plan exists**: Read it as your primary context. It may reference supplemental `notes-*.md`
files with additional detail — read those too. Before proceeding, assess PRD-readiness: check for
unresolved design decisions, open unknowns marked for future resolution, or missing concrete details
that the PRD would need to specify. If the plan isn't ready, surface the gaps and resolve them (or
return to plan refinement) before investing in PRD writing. Treat the plan as authoritative upstream
exploration state — focus discovery (Step 3) on remaining gaps and ambiguities rather than broad
rediscovery.

**If no plan exists**: Proceed directly to discovery.

### Step 2: Determine Work Category

Classify as **feature** or **technical**:

- **Feature**: Adds user-visible capability from the product vision
- **Technical**: Infrastructure, architecture, or internal improvement

This determines save location and influences PRD emphasis — features lean toward user impact,
technical work leans toward system impact and migration strategy.

### Step 3: Conduct Discovery

Ask clarifying questions to establish the "what" and "why." The "how" comes during task generation
and implementation. See the [discovery checklist][discovery-checklist] for comprehensive coverage.

**With a plan**: Ask targeted questions only — fill gaps, validate assumptions, and resolve open
items that block formalization.

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

**Naming:** The `{{WORK_NAME}}` descriptor in the PRD filename becomes the work unit's identifier
across all artifacts — task list (`tasks-{{WORK_NAME}}.md`), notes (`notes-{{WORK_NAME}}.md`),
completion record, and branch name. Choose a concise, descriptive slug (e.g., `api-modernization`,
`cli-implementation`). Avoid abbreviations that only make sense in context or overly long
compound names.

**Save location** depends on your project's PM mode ([`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git**: `.arc/backlog/{category}/prd-{{WORK_NAME}}.md` — PRDs start in backlog and
  graduate to `active/` during [activation][activate-work-unit]
- **none / external**: `.arc/active/{category}/prd-{{WORK_NAME}}.md` — PRDs save directly to
  active (no backlog directory). Create the directory first if it doesn't exist: `mkdir -p .arc/active/{category}/`

### Step 5: Retire Plan Documents

If a `plan-*.md` document fed into this PRD, retire it now. Plan documents are ephemeral — they
serve exploration and are deleted once the PRD captures the conclusions (see
[Work Planning Strategy][work-planning] § Plan Documents).

1. **Audit for reference content**: Scan the plan for implementation detail, design rationale, or
   context that the PRD doesn't capture but would be valuable during task generation or execution.
   Migrate this to a `notes-*.md` file alongside the PRD (same directory).
2. **Delete the plan**: `git rm` the `plan-*.md` file (and any supplemental files that fed into it,
   unless they have independent archival value — e.g., research files may belong in
   `reference/research/`).
3. **Stage with the PRD commit**: The plan deletion and any `notes-*` creation should be part of the
   same commit as the PRD.

**Stop here** — do not proceed to task generation. The PRD should be reviewed first. When ready,
continue with [2_generate-tasks.md](2_generate-tasks.md).

---

[work-org]: ../../../reference/strategies/arc/strategy-work-organization.md
[work-planning]: ../../../reference/strategies/arc/strategy-work-planning.md
[discovery-checklist]: ../../../reference/strategies/arc/strategy-work-planning.md#discovery-checklist
[template-prd]: ../../../reference/templates/template-prd.md
[activate-work-unit]: work-unit-lifecycle/activate-work-unit.md
[activate-planning-branch]: work-unit-lifecycle/planning/activate-planning-branch.md
[arc-config]: ../../arc-config.yml
