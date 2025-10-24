# Workflow: Generate Task List

## Purpose

This workflow guides the creation of detailed, executable task lists from PRDs (Product Requirements Documents).
Task lists break down feature or technical work into step-by-step implementation plans that can be followed
incrementally, with clear checkpoints and quality gates.

**When to use:** After a PRD has been created and work is ready to move into active implementation planning.

## Goal

Create a comprehensive task list in Markdown format that transforms PRD requirements into actionable development
steps. The task list should provide clear implementation guidance while respecting existing codebase patterns and
architectural decisions.

## Output

- **Format:** Markdown (`.md`)
- **Location:**
    - Feature work: `.arc/upcoming/feature/`
    - Technical work: `.arc/upcoming/technical/`
- **Filename:** `tasks-[name].md` (e.g., `tasks-user-profile-editing.md`, `tasks-api-modernization.md`)

**Note:** Task lists typically start in `.arc/upcoming/` during planning, then move to `.arc/active/` when
work begins. See [Project Structure](../strategies/strategy-work-categorization.md) for complete lifecycle.

## Process

### Step 1: Review PRD and Project Context

Read the specified PRD to understand requirements, user stories, and acceptance criteria. Then review
foundational documents for broader context:

- **[META-PRD](../constitution/META-PRD.md)** - Product vision and core features
- **[PROJECT-STATUS](../constitution/PROJECT-STATUS.md)** - Current priorities and project state
- **[TECHNICAL-ARCHITECTURE](../constitution/TECHNICAL-ARCHITECTURE.md)** - Architectural patterns and conventions

### Step 2: Assess Current Codebase State

Review the existing codebase to identify:

- Existing infrastructure and architectural patterns that can be leveraged
- Components or features that already exist and relate to PRD requirements
- Files, components, and utilities that may need modification
- Testing patterns and quality standards to follow

### Step 3: Generate Parent Tasks

Based on the PRD analysis and codebase assessment, identify the major phases of work required to implement
the feature or technical improvement. Create 3-7 high-level parent tasks that represent logical implementation
phases.

**Considerations:**

- Each parent task should represent a complete phase that produces testable value
- Order tasks to minimize dependencies and enable incremental progress
- Include phases for testing, documentation, and quality validation

**Example parent task structure:**

```markdown
## Tasks

- [ ] 1.0 Create Core Data Models
- [ ] 2.0 Implement API Endpoints
- [ ] 3.0 Build UI Components
- [ ] 4.0 Testing and Validation
- [ ] 5.0 Documentation and Polish
```

Present parent tasks and confirm the high-level plan aligns with expectations before proceeding to detailed
sub-tasks.

### Step 4: Break Down into Sub-Tasks

For each parent task, define specific, actionable sub-tasks that:

- Follow logically from the parent task
- Cover implementation details implied by the PRD
- Include quality checkpoints (linting, type checking, tests) at appropriate stages
- Reference specific files, components, or patterns where appropriate
- Are small enough to complete in a single work session (typically < 3 files modified)

**Sub-task guidelines:**

- **Test-first protocol**: For models, APIs, and business logic, include test sub-tasks before implementation
- **Quality gates**: Include linting and type-checking steps after significant changes
- **Incremental validation**: Structure tasks so progress can be verified at each step

### Step 5: Add Implementation Notes Section (Placeholder)

If architectural decisions, patterns, or constraints emerged during planning, they can be documented in an
"Implementation Notes" section at the bottom of the task list. This provides context for future developers
and explains why certain approaches were chosen.

### Step 6: Generate Final Task List

Combine parent tasks, sub-tasks, and optional implementation notes into the standard Markdown structure:

```markdown
# Task List: [Feature/Work Name]

**PRD Reference:** `.arc/active/[category]/prd-[name].md`
**Branch:** `feature/[feature-name]` or `technical/[work-name]`

## Implementation Notes

_(Optional: Document architectural decisions, patterns, constraints discovered during planning)_

## Tasks

- [ ] 1.0 Parent Task Title
  - [ ] 1.1 Sub-task description
  - [ ] 1.2 Sub-task description
- [ ] 2.0 Parent Task Title
  - [ ] 2.1 Sub-task description
  - [ ] 2.2 Sub-task description
```

### Step 7: Save Task List

Save the generated task list in the appropriate category directory matching the PRD location:

- Feature work: `.arc/upcoming/feature/tasks-[name].md`
- Technical work: `.arc/upcoming/technical/tasks-[name].md`

The `[name]` should match the base name of the input PRD file
(e.g., if the input was `prd-user-profile-editing.md`, the output is `tasks-user-profile-editing.md`).

## Target Audience

Task lists should be written for developers (junior to mid-level) who will implement the feature with:

- Awareness of existing codebase context
- Understanding of the broader product vision from the META-PRD
- Familiarity with the project's testing and quality standards

**Writing style:**

- Clear, actionable sub-task descriptions
- Specific enough to guide implementation without over-prescribing solutions
- References to patterns, files, or approaches where helpful
- Assumes familiarity with the tech stack but not with every project-specific pattern

## Task List Structure

**Numbering convention:**

- Parent tasks: `1.0`, `2.0`, `3.0`, etc.
- Sub-tasks: `1.1`, `1.2`, `2.1`, `2.2`, etc.
- All tasks start unchecked: `- [ ]`

**Task completion tracking:**

- Mark completed: `- [x] 1.1 Sub-task description`
- Task list is a living document, updated throughout implementation
- See [Task Processing Loop](3-process-task-loop.md) for execution workflow

## Reference Template

**The task list must follow this exact structure:**

```markdown
# Task List: [Feature/Work Name]

**PRD Reference:** `.arc/active/[category]/prd-[name].md`
**Branch:** `[category]/[name]`

## Tasks

- [ ] 1.0 Parent Task Title
  - [ ] 1.1 Sub-task description (specific, actionable)
  - [ ] 1.2 Sub-task description (includes quality checkpoints)
- [ ] 2.0 Parent Task Title
  - [ ] 2.1 Sub-task description
- [ ] 3.0 Parent Task Title (may not require sub-tasks if purely structural or configuration)


## Implementation Notes

_(Optional section for documenting architectural decisions, patterns, or constraints discovered during planning)_
```
