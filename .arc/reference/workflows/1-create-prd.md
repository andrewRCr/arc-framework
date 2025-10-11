<!--
Derived from: https://github.com/snarktank/ai-dev-tasks/create-prd.md
Original work licensed under Apache License 2.0
Modifications: Enhanced for ARC framework integration with META-PRD system,
focus on feature-level PRD creation, dual-audience design, and feature-branch scope
-->

# Workflow: Create PRD

## Purpose

This workflow guides the creation of **feature-level PRDs** (Product Requirements Documents) that define
the scope and requirements for individual features or logical chunks of work, typically aligned with feature
branches. Feature PRDs build upon the broader product vision established in the META-PRD.

**Note**: This workflow is for creating **feature-level PRDs**, not the project-wide META-PRD. For establishing
or updating constitutional documents (META-PRD, PROJECT-STATUS, TECHNICAL-ARCHITECTURE, DEVELOPMENT-RULES),
use [0-define-constitution.md](0-define-constitution.md) instead.

## Goal

Create a detailed feature PRD in Markdown format based on an initial feature concept. The PRD should be
clear, actionable, and provide sufficient context for implementation while maintaining alignment with the
overall product direction.

## Process

### Step 1: Review Project Context

After examining the feature description or request, but before asking questions, review the foundational project
documents to understand the complete context:

- **`_docs/META-PRD.md`** - Product vision, core features, and user flows
- **`_docs/TECHNICAL-ARCHITECTURE.md`** - Technical constraints, patterns, and architectural decisions
- **`_docs/DEVELOPMENT-RULES.md`** - Code standards, quality gates, and development protocols
- **`_docs/PROJECT-STATUS.md`** - Current priorities, progress, and project state

Ensure the requested feature aligns with the overall product direction, technical approach, and current priorities.

### Step 2: Conduct Discovery Session

Ask clarifying questions to gather sufficient detail about the "what" and "why" of the feature. The "how"
(implementation details) will be determined during task generation and development.

**For interactive sessions:** Provide options in numbered lists to enable quick responses and maintain momentum.

### Step 3: Generate and Save PRD

Using the project context, initial request, and discovery session responses, create a feature PRD following
the structure outlined below. Save the completed PRD as `prd-{{FEATURE_NAME}}.md` in `_docs/prds/` directory.

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
- **Location:** `_docs/prds/`
- **Filename:** `prd-{{FEATURE_NAME}}.md`
- **Token Format:** Use `{{UPPERCASE_SNAKE_CASE}}` for any placeholder values

## Workflow Completion

1. **Focus on requirements definition** - Do not proceed to implementation or task generation
2. **Prioritize discovery** - Ensure thorough understanding through clarifying questions
3. **Iterate on clarity** - Refine the PRD based on feedback and additional context
4. **Reference next steps** - Upon completion, the PRD is ready for task generation via `2-generate-tasks.md`
