# Workflow: Create PRD

## Purpose

This workflow guides the creation of **work-level PRDs** (Product Requirements Documents) that define
the scope and requirements for individual pieces of planned work - either user-facing features or technical
infrastructure improvements. Work PRDs build upon the broader product vision established in the META-PRD.

**Work Types:**

- **Feature PRDs** - User-facing capabilities (e.g., movie ratings, user profiles, search functionality)
- **Technical PRDs** - Infrastructure work (e.g., API modernization, type safety improvements, testing infrastructure)

See [Work Organization Strategy](../strategies/arc/strategy-work-organization.md) for the complete decision tree.

**Note**: This workflow is for creating **work-level PRDs**, not the project-wide META-PRD. For establishing
or updating constitutional documents (META-PRD, PROJECT-STATUS, TECHNICAL-OVERVIEW, DEVELOPMENT-RULES),
use [0_define-constitution.md](0_define-constitution.md) instead.

## Goal

Create a detailed PRD in Markdown format based on an initial concept. The PRD should be
clear, actionable, and provide sufficient context for implementation while maintaining alignment with the
overall product direction.

## Process

### Step 1: Review Project Context

After examining the feature description or request, but before asking questions, review the foundational project
documents to understand the complete context:

- **`.arc/reference/constitution/META-PRD.md`** - Product vision, core features, and user flows
- **`.arc/reference/constitution/TECHNICAL-OVERVIEW.md`** - Technical constraints, patterns, and architectural decisions
- **`.arc/reference/constitution/DEVELOPMENT-RULES.md`** - Code standards, quality gates, and development protocols
- **`.arc/reference/constitution/PROJECT-STATUS.md`** - Current priorities, progress, and project state

Ensure the requested feature aligns with the overall product direction, technical approach, and current priorities.

### Step 1.5: Check for Existing Notes Document (Notes-First Pattern)

Before conducting discovery, check if a corresponding `notes-*.md` file exists for this work. The "notes-first"
pattern captures evolving understanding during planning, with PRDs created only when work becomes active.

**Locations to check:**

- `.arc/active/feature/notes-{{FEATURE_NAME}}.md` (active feature work)
- `.arc/active/technical/notes-{{FEATURE_NAME}}.md` (active technical work)
- `.arc/backlog/feature/notes-{{FEATURE_NAME}}.md` (planned features)
- `.arc/backlog/technical/notes-{{FEATURE_NAME}}.md` (planned technical work)

**If notes document exists:**

1. **Read the entire notes document** - This becomes your primary context source
2. **Extract key information:**
   - Work scope, rationale, and priority
   - Technical approach, patterns, and architecture decisions
   - Effort estimates and time constraints
   - Known dependencies, constraints, or blockers
   - References to related work or completed foundation
3. **Use notes as basis for PRD** - The notes document informs your clarifying questions
4. **Focus discovery on gaps** - Ask targeted questions about ambiguities, missing details, or areas needing clarification

**If no notes document exists:**

- Proceed with standard discovery process (Step 2 onwards)
- The PRD will be created from the initial request and discovery session

**Rationale:** Notes documents prevent "PRD drift" (requirements becoming outdated before work starts) by
capturing planning insights without committing to formal requirements until work is ready to begin.

### Step 2: Determine Work Category

Before detailed discovery, determine whether this is **feature** or **technical** work:

**Decision criteria:**

1. **Does it add user-visible capability from the product vision?** → Feature work
2. **Is it infrastructure/architecture improvement?** → Technical work

See [Work Organization Strategy](../strategies/arc/strategy-work-organization.md) for complete decision tree and examples.

### Step 3: Conduct Discovery Session

Ask clarifying questions to gather sufficient detail about the "what" and "why" of the work. The "how"
(implementation details) will be determined during task generation and development.

**If working from notes document:**

- Ask **targeted clarifying questions** to fill gaps or resolve ambiguities in the notes
- Validate key assumptions made in the notes document
- Confirm scope boundaries, priorities, and sequencing
- Address any "Open Questions" or "TBD" items from notes
- Verify effort estimates and time constraints are still valid

**If working from initial request only:**

- Ask **broader clarifying questions** to establish the "what" and "why"
- Focus on problem definition, user impact, and goals
- Explore user stories, acceptance criteria, and scope boundaries
- Gather context about constraints, dependencies, and technical considerations

**For interactive sessions:** Provide options in numbered lists to enable quick responses and maintain momentum.

### Step 4: Generate and Save PRD

Using the project context, initial request, and discovery session responses, create a PRD following
the structure outlined below.

**Save location:**

- **Feature work** (user-facing): `.arc/backlog/feature/prd-{{FEATURE_NAME}}.md`
- **Technical work** (infrastructure): `.arc/backlog/technical/prd-{{FEATURE_NAME}}.md`

See [Work Organization Strategy](../strategies/arc/strategy-work-organization.md) for guidance on feature vs. technical.

## Clarifying Questions (Examples)

Tailor questions based on the specific feature request, but consider these common areas to explore:

- **Problem/Goal:** "What problem does this feature solve for the user?" or "What is the main goal we want to
  achieve with this feature?"
- **Target User:** "Who is the primary user of this feature?"
- **Core Functionality:** "Can you describe the key actions a user should be able to perform with this feature?"
- **User Stories:** "Could you provide a few user stories? (e.g., As a [type of user], I want to [perform an
  action] so that [benefit].)"
- **Acceptance Criteria:** "How will we know when this feature is successfully implemented? What are the key success criteria?"
- **Scope/Boundaries:** "Are there any specific things this feature _should not_ do (non-goals)?"
- **Data Requirements:** "What kind of data does this feature need to display or manipulate?"
- **Design/UI:** "Are there any existing design mockups or UI guidelines to follow?" or "Can you describe the
  desired look and feel?"
- **Edge Cases:** "Are there any potential edge cases or error conditions we should consider?"

## PRD Structure

### Header Metadata

Every PRD begins with metadata fields. The format depends on whether the PRD has dependencies
that delay task generation.

**Standard format** (most common - task generation follows immediately):

```markdown
# PRD: [Feature/Technical Name]

**Type:** Feature | Technical
**Status:** Ready for Implementation
**Created:** YYYY-MM-DD

---
```

**With dependencies** (task generation delayed until dependencies complete):

```markdown
# PRD: [Feature/Technical Name]

**Type:** Feature | Technical
**Status:** Pending Dependencies | Ready for Implementation
**Created:** YYYY-MM-DD
**Updated:** YYYY-MM-DD

**Related Work:**

- ⏳ Depends on: [Dependency name] - brief description
- ✅ Complete: [Completed dependency] - brief description

---
```

**Field definitions:**

- **Type:** `Feature` (user-facing) or `Technical` (infrastructure) per work organization
- **Status:** `Ready for Implementation` when task generation can proceed; `Pending Dependencies` if blocked
- **Created:** Date PRD was first written
- **Updated:** Date of last revision (only include when dependencies exist and PRD evolves while waiting)
- **Related Work:** Dependencies with status indicators (⏳ pending, ✅ complete)

**Rules:**

- Header metadata appears before the horizontal rule (`---`) that separates it from content
- No version numbers (git history tracks revisions)
- Updated field only when dependencies exist (PRDs written in advance may evolve)
- At task generation time, dependency-related fields are removed (see `2_generate-tasks.md`)

### Content Sections

The generated feature PRD should include the following sections:

1. **Introduction/Overview:** Briefly describe the feature and the problem it solves. State the goal.
2. **Goals:** List the specific, measurable objectives for this feature.
3. **User Stories:** Detail the user narratives describing feature usage and benefits.
4. **Functional Requirements:** List the specific functionalities the feature must have. Use clear,
   concise language (e.g., "The system must allow users to upload a profile picture."). Number these
   requirements.
5. **Non-Goals (Out of Scope):** Clearly state what this feature will _not_ include to manage scope.
6. **Design Considerations (Optional):** Link to mockups, describe UI/UX requirements, or mention
   relevant components/styles if applicable.
7. **Technical Considerations (Optional):** Mention any known technical constraints, dependencies, or
   suggestions (e.g., "Should integrate with the existing Auth module").
8. **Success Metrics:** How will the success of this feature be measured? (e.g., "Increase user
   engagement by 10%", "Reduce support tickets related to X").
9. **Open Questions:** List any remaining questions or areas needing further clarification.

## Target Audience

The feature PRD serves as a bridge between product vision and implementation:

- **Primary:** Implementation teams (developers, designers) who need clear, actionable requirements
- **Secondary:** Stakeholders seeking to understand feature scope and rationale

Requirements should be explicit, unambiguous, and provide sufficient context for informed decision-making
during implementation.

## Output Specifications

- **Format:** Markdown (`.md`)
- **Location:** `.arc/backlog/feature/` (user-facing) or `.arc/backlog/technical/` (infrastructure)
- **Filename:** `prd-{{FEATURE_NAME}}.md`
- **Token Format:** Use `{{UPPERCASE_SNAKE_CASE}}` for any placeholder values

## Workflow Completion

1. **Focus on requirements definition** - Do not proceed to implementation or task generation
2. **Prioritize discovery** - Ensure thorough understanding through clarifying questions
3. **Iterate on clarity** - Refine the PRD based on feedback and additional context
4. **Reference next steps** - Upon completion, the PRD is ready for task generation via `2_generate-tasks.md`
