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
    - Feature work: `.arc/backlog/feature/`
    - Technical work: `.arc/backlog/technical/`
- **Filename:** `tasks-[name].md` (e.g., `tasks-user-profile-editing.md`, `tasks-api-modernization.md`)

**Note:** Task lists typically start in `.arc/backlog/` during planning, then move to `.arc/active/` when
work begins. See [Project Structure](../strategies/arc/strategy-work-organization.md) for complete lifecycle.

## Process

### Step 1: Review PRD and Project Context

Read the specified PRD to understand requirements, user stories, and acceptance criteria. Then review
foundational documents for broader context:

- **[META-PRD](../constitution/META-PRD.md)** - Product vision and core features
- **[PROJECT-STATUS](../constitution/PROJECT-STATUS.md)** - Current priorities and project state
- **[TECHNICAL-OVERVIEW](../constitution/TECHNICAL-OVERVIEW.md)** - Architectural patterns and conventions

### Step 1.5: Simplify PRD Header Metadata

PRDs written in advance (with dependencies) include extra metadata fields that are no longer needed
once task generation begins. Simplify the header to the standard format.

**Remove these fields if present:**

- `Updated:` line
- `Related Work:` section (dependencies are now complete)

**Keep these fields:**

- `Type:` (Feature or Technical)
- `Status:` (update to "In Progress" or leave as "Ready for Implementation")
- `Created:` (original creation date)

**Before:**

```markdown
# PRD: Feature Name

**Type:** Feature
**Status:** Ready for Implementation
**Created:** 2025-10-25
**Updated:** 2025-12-31

**Related Work:**

- ✅ Complete: Some Dependency - description

---
```

**After:**

```markdown
# PRD: Feature Name

**Type:** Feature
**Status:** Ready for Implementation
**Created:** 2025-10-25

---
```

**Rationale:** Dependency tracking is useful while waiting for prerequisites. Once task generation
begins, that context is historical and adds noise to the active document.

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

**Example parent task structure (showing test-first ordering):**

```markdown
## Tasks

### **Phase 1:** Core Tests and Data Layer

- [ ] **1.1 Write tests for data models**
- [ ] **1.2 Implement data models**

### **Phase 2:** Service Layer Tests and Implementation

- [ ] **2.1 Write service/API tests**
- [ ] **2.2 Implement service/API layer**

### **Phase 3:** UI Tests and Implementation

- [ ] **3.1 Write component/UI tests**
- [ ] **3.2 Implement UI components**

### **Phase 4:** Integration Testing and Quality Gates

- [ ] **4.1 Run full test suite**
- [ ] **4.2 Run quality gates**
```

**Note:** Tests come BEFORE or alongside implementation in each phase, not as separate final phase.

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

- **Test-first protocol (CRITICAL)**: Write test sub-tasks BEFORE implementation sub-tasks for:
    - Data models and schemas
    - API endpoints and business logic
    - Service layer functions
    - See [strategy-testing-methodology.md](../strategies/project/strategy-testing-methodology.md)
      and [DEVELOPMENT-RULES.md](../constitution/DEVELOPMENT-RULES.md) for complete protocol
- **Quality gates**: Include quality checkpoint tasks at appropriate stages:
    - Tier 1 (incremental): Linting, type-checking after significant changes
    - Tier 2 (integration): E2E checkpoint tasks when phases modify E2E-tested components (layout,
      navigation, forms, user interactions). See [Quality Gates Strategy](../strategies/arc/strategy-quality-gates.md)
- **Incremental validation**: Structure tasks so progress can be verified at each step
- **No time estimates**: Task lists should NOT include time estimates (duration emojis, minute counts, etc.)
  Focus on clear scope and completion criteria instead

### Step 5: Add Implementation Notes Section (Placeholder)

If architectural decisions, patterns, or constraints emerged during planning, they can be documented in an
"Implementation Notes" section at the bottom of the task list. This provides context for future developers
and explains why certain approaches were chosen.

### Step 6: Review Task List Formatting Standards

**CRITICAL:** Before generating the task list, review formatting standards:

**→ [strategy-task-list-formatting.md](../strategies/arc/strategy-task-list-formatting.md)** ← **Required reading**

This strategy document defines:

- Exact format for all task list elements (phase headers, parent tasks, subtasks)
- Test-first task structure patterns
- Complete annotated examples
- Common mistakes to avoid
- Decision guidelines for numbered subtasks vs. detail bullets

**Use the strategy's Quick Format Checklist to verify your generated task list.**

### Step 7: Generate Final Task List

Combine parent tasks, sub-tasks, and optional implementation notes into the standard Markdown structure following [strategy-task-list-formatting.md](../strategies/arc/strategy-task-list-formatting.md).

**Basic structure:**

```markdown
# Task List: [Feature/Work Name]

**PRD Reference:** `.arc/active/[category]/prd-[name].md`
**Created:** YYYY-MM-DD
**Branch:** `feature/[feature-name]` or `technical/[work-name]`
**Base Branch:** `main` (or parent branch if stacked)
**Status:** In Progress

## Tasks

### **Phase 1:** Core Tests and Implementation

- [ ] **1.1 Write tests for core functionality**

    - [ ] **1.1.a Create test for validation**
        - Test cases listed here
        - Expect tests to FAIL initially
    - [ ] **1.1.b Run tests and verify failures**

- [ ] **1.2 Implement core functionality**

    - [ ] **1.2.a Create implementation**
        - Implementation details here
    - [ ] **1.2.b Run tests - should now PASS**
    - [ ] **1.2.c Run quality gates**

## Implementation Notes

_(Optional: Document architectural decisions, patterns, constraints discovered during planning)_
```

See [strategy-task-list-formatting.md](../strategies/arc/strategy-task-list-formatting.md) for complete formatting rules
and annotated examples.

### Step 8: Save Task List

Save the generated task list in the appropriate category directory matching the PRD location:

- Feature work: `.arc/backlog/feature/tasks-[name].md`
- Technical work: `.arc/backlog/technical/tasks-[name].md`

The `[name]` should match the base name of the input PRD file
(e.g., if the input was `prd-user-profile-editing.md`, the output is `tasks-user-profile-editing.md`).

**Format verification:** Use the Quick Format Checklist in
[strategy-task-list-formatting.md](../strategies/arc/strategy-task-list-formatting.md)
to verify the generated task list follows all formatting standards before saving.

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

**Formatting standards:** See [strategy-task-list-formatting.md](../strategies/arc/strategy-task-list-formatting.md)
for complete formatting rules, test-first patterns, and examples.

## Task Completion Tracking

- All tasks start unchecked: `- [ ]`
- Mark completed: `- [x] 1.1 Sub-task description`
- Task list is a living document, updated throughout implementation
- See [Task Processing Loop](3_process-task-loop.md) for execution workflow

## Next Step (Optional)

When ready to begin implementation, activate the work unit:

**→ [activate-work-unit.md](supplemental/activate-work-unit.md)** - Create branch, move docs to active, update tracking

This step can be deferred if planning ahead (e.g., creating task lists for future work). Activate when
implementation is about to begin.
