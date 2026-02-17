# Task List Formatting Strategy

**Version:** 1.6 | **Updated:** 2025-12-31 | **Status:** Active

## Purpose

Authoritative standards and conventions for task list structure, style, and organization across all work types
(feature, technical, incidental). This strategy ensures consistency, readability, and maintainability of task
documentation throughout the project lifecycle.

**Referenced by:**

- [2_generate-tasks.md](../workflows/2_generate-tasks.md) - Planned feature/technical work
- [manage-incidental-work.md](../workflows/supplemental/manage-incidental-work.md) - Reactive incidental work

## Table of Contents

1. [Quick Format Checklist](#quick-format-checklist)
2. [Task List Headers](#task-list-headers)
3. [Format Elements Reference](#format-elements-reference)
4. [Test-First Task Structure](#test-first-task-structure)
5. [Success Criteria Section](#success-criteria-section)
6. [Complete Annotated Example](#complete-annotated-example)
7. [Common Mistakes](#common-mistakes)
8. [Decision Guidelines](#decision-guidelines)

---

## Quick Format Checklist

Before finalizing any task list, verify:

- [ ] Phase headers use `### **Phase X:** Description` format
- [ ] Parent tasks have checkboxes and bold: `- [ ] **X.Y Description**`
- [ ] Subtasks use letter numbering: `- [ ] **X.Y.a Description**` (bold when detail bullets follow)
- [ ] Third level uses letters (`X.Y.a`, `X.Y.b`), not numbers (`X.Y.1`, `X.Y.2`) - letters signal depth
- [ ] Blank lines between subtasks when they have detail bullets beneath
- [ ] Unnumbered bullets for implementation details (no checkboxes, no numbers)
- [ ] Goal/Note lines indented 4 spaces from margin (same level as subtasks)
- [ ] Test subtasks come BEFORE implementation subtasks
- [ ] 4-space indentation per hierarchy level
- [ ] Backticks for all technical terms: `field_name`, `ClassName`, `/api/endpoint/`
- [ ] No time estimates anywhere (no duration emojis, minute counts)
- [ ] "Expect tests to FAIL initially" noted in test subtasks
- [ ] "Tests should now PASS" noted after implementation subtasks
- [ ] Success Criteria section at bottom with checkboxes (verified before archival)

---

## Task List Headers

Task list headers provide essential metadata and context. Format varies by task list type.

### Feature/Technical Task Lists

**Use when:** Planned work with dedicated branch and PRD (feature development, technical improvements)

**Required fields:**

```markdown
# Task List: [Feature/Technical Name]

**PRD:** `.arc/active/{feature|technical}/prd-[name].md`
**Created:** YYYY-MM-DD
**Branch:** `{feature|technical}/[branch-name]`
**Base Branch:** `main` (or parent branch if stacked)
**Status:** {Pending|In Progress|Complete}

## Overview

**Purpose:** One-sentence description of what this accomplishes.

## Scope

### Will Do

- What's included in this task list

### Won't Do

- What's deferred or out of scope

---

## Tasks

### **Phase 1:** ...
```

**Rules:**

- Title uses `Task List:` (not "Incidental:")
- PRD reference is absolute path from repo root
- Status values: `Pending` (planned), `In Progress` (active), `Complete` (done)
- Overview section includes Purpose
- Scope section defines boundaries (Will Do / Won't Do)
- Optional sections (Architecture Patterns, Current State, Testing Strategy, etc.) only when needed
- Horizontal rule (`---`) separates header from tasks
- Success Criteria section goes at bottom (see [Success Criteria Section](#success-criteria-section))

**Example:**

```markdown
# Task List: Service Layer Modernization

**PRD:** `.arc/active/technical/prd-service-layer-modernization.md`
**Created:** 2025-10-21
**Branch:** `technical/service-layer-modernization`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Modernize service layer with reusable helpers and class-based architecture.

## Scope

### Will Do

- Extract business logic from API endpoints to service layer
- Implement class-based service architecture
- Add comprehensive service layer tests

### Won't Do

- Performance optimization (separate enhancement)
- API versioning changes (out of scope)

---

## Tasks
```

### Incidental Task Lists

**Use when:** Reactive work discovered during implementation (bug fixes, quality improvements, tech debt)

**Required fields:**

```markdown
# Incidental: [Descriptive Title]

**Created:** YYYY-MM-DD
**Branch:** `incidental/[name]`
**Base Branch:** `[parent-branch-this-branched-from]`
**Status:** {Pending|In Progress|Complete}

## Context

**Discovered:** [Where/how found] - Brief description

**Interrupts:** [Task list path] at [location] OR `None` (fresh work)

**Problem:** One-sentence problem statement

**Why Now:** Brief rationale for immediate work

## Scope

### Will Do

- What's included in this task list

### Won't Do

- What's deferred or out of scope

---

## Tasks

### **Phase 1:** ...
```

**Rules:**

- Title uses `Incidental:` prefix
- Created date in YYYY-MM-DD format
- Branch is this task list's own branch (e.g., `incidental/filter-testing`)
- Base Branch is the parent branch this branched from (enables grep-based discovery of related work)
- Status values: `Pending` (not started), `In Progress` (active), `Paused` (blocked by other work), `Complete` (done)
- Discovered field shows discovery context
- **Interrupts** field shows what task list/task was paused (backward pointer) OR `None` if fresh work
- **When pausing parent work**, add `Paused At` and `Paused To` fields to the interrupted task list (forward pointer)
- **When resuming**, update `Status` back to `In Progress` and optionally add resume context
- Scope section separates included vs deferred work
- Horizontal rule (`---`) separates header from tasks
- Success Criteria section goes at bottom (see [Success Criteria Section](#success-criteria-section))

**Example (active work):**

```markdown
# Incidental: Navigation Filter State Preservation

**Created:** 2025-10-29
**Branch:** `incidental/navigation-filter-state-preservation`
**Base Branch:** `incidental/filter-integration-testing`
**Status:** In Progress

## Context

**Discovered:** Manual testing during Phase 3.6 (data quality filtering implementation)

**Interrupts:** `tasks-filter-integration-testing.md` at Phase 3.6, Task 3.6.2

**Problem:** Navigation loses filter query params, causing blank screens and collapsed panels.

**Why Now:** Blocks manual testing confidence and affects UX of newly implemented features.

## Scope

### Will Do

- Fix "Back to Results" button parameter preservation
- Restore advanced panel state after navigation
- Add comprehensive state management tests

### Won't Do

- Performance optimization (separate enhancement)
- Deep linking optimization (separate feature)

---

## Tasks

**Example (paused work):**

```markdown
# Incidental: Test Organization Standardization

**Created:** 2025-10-30
**Branch:** `incidental/test-organization-standardization`
**Base Branch:** `incidental/buffer-deduplication`
**Status:** Paused

## Context

**Discovered:** During Phase 3 planning for buffer deduplication work

**Interrupts:** `tasks-buffer-deduplication.md` at Task 3.1

**Paused At:** Phase 3 complete (test file analysis done, before Phase 4 file splits)

**Paused To:** `tasks-discover-endpoint-consolidation.md` - Critical endpoint architecture issues
discovered during browser testing

**Problem:** Test organization inconsistent and files too large.

**Why Now:** Must establish patterns before adding 15+ new tests.
```

**Pause chain traceability rules:**

1. **When creating new work that interrupts active work:**
   - New task list gets `Interrupts: [paused-task-path] at [location]`
   - Paused task list gets `Status: Paused`, `Paused At: [location]`, `Paused To: [new-task-path]`

2. **When resuming paused work:**
   - Update `Status` from `Paused` to `In Progress`
   - Optionally add resume note in Context or header

3. **Purpose:**
   - Git log shows priority shifts
   - Team understands work dependencies
   - Easy to reconstruct decision timeline

### Status Field Values

- **Pending**: Work planned but not yet started (task list created, waiting to begin)
- **In Progress**: Active work happening now (current session or recent sessions)
- **Complete**: All tasks finished, quality gates passed, work merged/delivered

---

## Format Elements Reference

### Phase Headers

**Format:** `### **Phase X:** Description`

**Rules:**

- Level 3 heading (`###`)
- Phase number in bold within heading: `**Phase X:**`
- Descriptive name after colon (not in bold)
- No time estimates
- Blank line before and after (visual separation)

**Examples:**

✅ **Correct:**

```markdown
### **Phase 1:** Backend Tests and Data Models

- [ ] **1.1 Write tests for core functionality**
```

❌ **Wrong:**

```markdown
### Phase 1: Backend Tests and Data Models  # Missing bold on "Phase 1:"

### **Phase 1: Backend Tests**  # Colon inside bold

### **Phase 1** Backend Tests  # Missing colon

### **Phase 1:** Backend Tests (2 hours)  # Time estimate (prohibited)
```

### Parent Tasks

**Format:** `- [ ] **X.Y Description**`

**Rules:**

- Checkbox with space: `- [ ]`
- Space after checkbox before bold
- Task number AND description both bold: `**X.Y Description**`
- Numbers follow pattern: `1.1`, `1.2`, `2.1`, etc. (not `1.1.0`)
- Description is concise but complete (what, not how)
- Indented 0 spaces from margin (top level within phase)

**Examples:**

✅ **Correct:**

```markdown
- [ ] **1.1 Write tests for data models**
- [ ] **1.2 Implement data models**
- [ ] **2.1 Write API integration tests**
```

❌ **Wrong:**

```markdown
- [ ] 1.1 Write tests for data models  # Not bold
- [ ] **1.1** Write tests for data models  # Only number bold
- [x] **1.1 Write tests for data models**  # Pre-checked (starts unchecked)
- **1.1 Write tests for data models**  # Missing checkbox1
- [ ] **1.1.0 Write tests for data models**  # Wrong number format
```

### Subtasks (Third Level)

**Format:** `- [ ] **X.Y.a Description**` (bold when detail bullets follow)

**When to use:** Parent task requires 2+ distinct, independently completable steps

**Rules:**

- Checkbox with space: `- [ ]`
- **Letter format: `X.Y.a`, `X.Y.b`, `X.Y.c`** (letters at third level for visual clarity)
- **Bold description when subtask has detail bullets beneath** (creates visual hierarchy)
- For consistency, accept bold even on rare single-line subtasks without details
- Indented 4 spaces from parent task
- Each subtask should be completable/testable independently
- Use test-first ordering (test subtask before implementation subtask)
- **Blank lines between subtasks when they have detail bullets** (improves readability)

**Examples:**

✅ **Correct (subtasks with detail bullets):**

```markdown
- [ ] **1.1 Write tests for data models**

    - [ ] **1.1.a Create test for `User` model validation**
        - Test: Email format validation
        - Test: Username uniqueness constraint
        - Expect tests to FAIL initially

    - [ ] **1.1.b Create test for `Profile` model relationships**
        - Test: Foreign key to `User`
        - Test: Auto-creation on user signup
        - Expect tests to FAIL initially

    - [ ] **1.1.c Run tests and verify failure messages**
```

✅ **Also correct (simple single-line subtasks):**

```markdown
- [ ] **1.2 Run quality gates**
    - [ ] 1.2.a Run linting checks
    - [ ] 1.2.b Run type checking
    - [ ] 1.2.c Verify no errors
```

❌ **Wrong:**

```markdown
- [ ] **1.1 Write tests for data models**
- [ ] 1.1.a Create test for User model  # Not indented
- [ ] **1.1.a** Create test for User model  # Only number bold
    - [ ] 1.1.a Create test with details  # Not bold but should be (has details below)
        - Test details
- [ ] **1.1.1 Create test for User model**  # Numeric third level (use letters)
```

### Letter Numbering (Third Level and Beyond)

**Format:** `X.Y.a`, `X.Y.b` for third level; `X.Y.a.1`, `X.Y.a.2` for fourth level

**When to use:** After two number levels, use letters for visual differentiation

**Rationale:**

- **Readability:** `7.3.a` is instantly clearer than `7.3.1` (letter signals deeper nesting)
- **Cognitive load:** Easier to track "I'm at the letter level" vs blending numbers
- **Common pattern:** Legal documents, academic outlines use this effectively
- **Visual differentiation:** Letters break up number sequences, reducing parsing effort

**Numbering hierarchy:**

```
Phase: ### **Phase X:**
Parent task: X.Y (e.g., 1.1, 2.3)
Subtask: X.Y.a, X.Y.b (letters at third level)
Fourth level (rare): X.Y.a.1, X.Y.a.2
```

**Guidelines:**

- Use letters after two number levels (third level) for visual differentiation
- If fourth level needed, resume numbers after letters
- Maintain 4-space indentation per level regardless of numbering scheme

**Examples:**

✅ **Correct (letter numbering at third level):**

```markdown
- [ ] **7.1 Systematic component audit**

    **Goal:** Review all components for token usage consistency.

    - [ ] **7.1.a Catalog all components**
        - Generate list of all `.tsx` files
        - Categorize by type: pages, layout, features
        - Create audit checklist

    - [ ] **7.1.b Verify button pattern consistency**
        - Check solid buttons use `bg="primary"` + `color="on-primary"`
        - Check outline buttons use proper border tokens
        - Document violations

    - [ ] **7.1.c Verify form control consistency**
        - Check all inputs use `input` token for borders
        - Check all focus states use `ring` token
        - Document violations
```

✅ **Correct (fourth level if needed):**

```markdown
- [ ] **7.2 Apply fixes from audit**

    - [ ] **7.2.a Apply button pattern fixes**
        - Work through button violation list from 7.1.b

        - [ ] **7.2.a.1 Fix primary button patterns**
            - Update 15 components with correct token pairs
            - Test across all themes

        - [ ] **7.2.a.2 Fix outline button patterns**
            - Update 8 components with border tokens
            - Test across all themes
```

❌ **Wrong (all numbers - hard to parse):**

```markdown
- [ ] **7.1 Systematic component audit**
    - [ ] **7.1.1 Catalog all components**  # 7.1.1 blends together
    - [ ] **7.1.2 Verify button patterns**  # 7.1.2 hard to distinguish from 7.1.1
    - [ ] **7.1.3 Verify form controls**    # Numbers blend, cognitive load increases
```

**Comparison readability:**

- `7.3.1` - Three numbers blend together (harder to parse)
- `7.3.a` - Instantly clear it's a sub-level (letter signals depth)
- `7.3.1.1` - Four segments, confusing
- `7.3.a.1` - Much clearer hierarchy (number-number-letter-number)

### Unnumbered Implementation Bullets

**Format:** `- Detail or guidance (no checkbox, no number)`

**When to use:**

Detail bullets serve two distinct purposes:

1. **Implementation guidance (non-actionable):**
   - File locations, line numbers
   - Architecture notes, design decisions
   - Expected behaviors ("tests FAIL initially", "tests should PASS")
   - Context or rationale

2. **Grouped sub-actions (actionable but coupled):**
   - Multiple tests created in same file/session
   - Manual testing scenarios done together
   - Configuration items changed together
   - Too granular/coupled to track separately as numbered subtasks

**Rules:**

- No checkbox, no numbers
- Indented 4 spaces from the task they support
- Can nest further (8 spaces for sub-bullets)
- Use backticks for technical terms
- Keep concise (1-2 lines per bullet)

**Examples:**

✅ **Correct (mixed guidance and grouped actions):**

```markdown
- [ ] **1.1 Write tests for data models**

    - [ ] **1.1.a Create comprehensive test file in `test_models.py`**
        - Test: Email format validation (grouped action - same file)
        - Test: Username uniqueness constraint (grouped action - same file)
        - Test: Password minimum length (grouped action - same file)
        - File location: `backend/apps/core/tests/test_models.py` (guidance)
        - Expect tests to FAIL initially (guidance)

    - [ ] **1.1.b Run tests and verify failure messages**
```

**Key distinction:** Unnumbered bullets provide **guidance or grouped actions**, not independent completable
steps that warrant tracking separately.

### Goal/Note Lines

**Format:** `**Goal:** One-line clarification` or `**Note:** Important context`

**When to use:** Parent task title is technical/terse and needs purpose/rationale clarification

**Rules:**

- Indented 4 spaces from margin (same level as subtasks)
- First word bold (`**Goal:**`, `**Note:**`, `**Rationale:**`, `**Purpose:**`, `**Approach:**`)
- Single line only (not a paragraph)
- Must illuminate purpose/impact, NOT repeat title
- Blank line after (before first subtask)

**Examples:**

✅ **Correct:**

```markdown
- [ ] **1.1 Write tests for data models**

    **Goal:** Validate field constraints and relationships before implementation.

    - [ ] **1.1.a Create test for `User` model validation**
        - Test: Email format validation
        - Test: Username uniqueness

    - [ ] **1.1.b Create test for `Profile` model relationships**
        - Test: Foreign key to `User`
```

✅ **Also correct (without Goal line):**

```markdown
- [ ] **1.1 Write tests for User and Profile model validation**

    - [ ] **1.1.a Create test for `User` model field constraints**
        - Test: Email validation
        - Test: Username uniqueness

    - [ ] **1.1.b Create test for `Profile` foreign key relationship**
        - Test: Foreign key constraint
```

❌ **Wrong:**

```markdown
- [ ] **1.1 Write tests for data models**
**Goal:** Validate field constraints  # Not indented to subtask level

- [ ] **1.1 Write tests for data models**
    **Goal:** Write tests for the data models.  # Repeats title, adds no value

- [ ] **1.1 Write tests for data models**
    **Goal:** This task involves writing comprehensive tests for all data models
    in the application to ensure field validation works correctly and relationships
    are properly established.  # Too long, should be 1 line
```

### Revision Numbering (R Scheme)

**Format:** `X.Y.R`, `X.Y.R.Z` for discovered/remaining work

**When to use:** When expanding a previously-complete subtask without destroying existing numbering

**Purpose:**

- Denotes "Revision" or "Remaining" work discovered during implementation
- Preserves original task numbering scheme
- Clearly indicates work wasn't part of original plan

**Rules:**

- Use `R` suffix when adding tasks to "complete" parent: `3.1.R`, `3.1.R.1`, `3.1.R.2`
- Documents mid-implementation discoveries without renumbering existing tasks
- Maintains audit trail of plan evolution

**Example:**

```markdown
- [x] **3.1 Implement pagination metadata**
    - [x] 3.1.1 Update hook to extract metadata

    - [ ] **3.1.R Additional integration tests discovered**
        - [ ] **3.1.R.1 Write tests for useMovieFetchRouter**
            - Test: metadata parameter accepted
            - Expect tests to FAIL initially

        - [ ] **3.1.R.2 Write stability tests for MovieGrid**
            - Test: No infinite fetches when metadata received
            - Expect tests to FAIL initially
```

**Rationale:** When task 3.1.1 revealed need for additional tests, using `3.1.R` preserves existing numbering
and clearly signals "this wasn't in the original plan."

### Emoji Usage

**Policy:** Avoid emojis in task planning; acceptable only in completion details

**Rules:**

- ❌ **Never in task descriptions or phase headers** (planning/execution)
- ❌ **Never in Goal/Note/Purpose lines**
- ✅ **Acceptable in completion details** (when marking tasks `[x]`):
    - Red X (❌): Explains deviations from plan with rationale
    - Green checkmark (✅): Discouraged as redundant (task already marked `[x]`)

**Rationale:**

- Completion details capture deviations/findings where relevant
- Don't add noise for no reason
- Green checkmarks redundant (checklist already shows completion)

**Example - Acceptable use:**

```markdown
- [x] **2.1.1 Create test for schema extraction**
    - ✅ **Completed**: 10 tests created, 9 failing as expected
    - ❌ **Deviation**: Also created test fixtures (not originally planned) - needed for DRY
```

**Example - Discouraged:**

```markdown
- [x] **2.1.1 Create test for schema extraction**
    - ✅ Created 10 tests  # Redundant - [x] already indicates completion
    - ✅ All tests working  # Adds no information
```

### Technical Terms

**Format:** Backticks for all technical identifiers

**Apply to:**

- Field names: `field_name`, `user_id`
- Class names: `ClassName`, `UserProfile`
- Function/method names: `method_name()`, `validate_email()`
- File names: `models.py`, `test_api.py`
- API endpoints: `/api/users/`, `/auth/login/`
- Constants: `MAX_LENGTH`, `DEFAULT_VALUE`
- Variables: `response_data`, `user_obj`

**Examples:**

✅ **Correct:**

```markdown
- [ ] 1.2.1 Create `User` model in `apps/core/models.py`
    - Add fields: `username`, `email`, `date_joined`
    - Implement `clean()` validation method
    - Use `EmailField` for email validation
```

❌ **Wrong:**

```markdown
- [ ] 1.2.1 Create User model in apps/core/models.py  # No backticks
```

### Indentation Rules

**Standard:** 4 spaces per hierarchy level

**Hierarchy:**

```
Phase Header (### **Phase X:**)
↓
Phase-level notes (0 spaces) **Purpose:** Optional context
↓
Parent Task (0 spaces) - [ ] **X.Y Description**
    ↓
    Goal/Note Line (4 spaces) **Goal:** Clarification
    ↓
    Numbered Subtask (4 spaces) - [ ] **X.Y.Z Description** (bold if details follow)
        ↓
        Detail Bullet (8 spaces) - Implementation detail
            ↓
            Sub-bullet (12 spaces) - Nested detail
```

**Visual example:**

```markdown
### **Phase 1:** Backend Implementation

**Purpose:** Establish data models with test-first approach.

- [ ] **1.1 Write tests for core functionality**

    **Goal:** Establish test coverage before implementation.

    - [ ] **1.1.a Create test for `User` model**
        - Test: Email validation
        - Test: Username uniqueness
        - Expect tests to FAIL initially

    - [ ] **1.1.b Create test for `Profile` model**
        - Test: Foreign key to `User`
        - Test: Auto-creation on user signup
        - Expect tests to FAIL initially

- [ ] **1.2 Implement core functionality**

    - [ ] **1.2.a Create `User` model in `models.py`**
        - Fields: `username`, `email`, `password_hash`
        - Add `clean()` method for validation

    - [ ] **1.2.b Run tests - should now PASS**
```

---

## Test-First Task Structure

**Critical principle:** Tests BEFORE implementation in each phase, not as separate final phase.

### Pattern 1: Simple Test-Implementation Pair

**Use when:** Single model/endpoint/component with straightforward tests

```markdown
### **Phase 1:** User Model

- [ ] **1.1 Write tests for User model**

    - [ ] **1.1.a Create test file `test_user_model.py`**
        - Test: Email validation
        - Test: Password hashing
        - Expect tests to FAIL initially

    - [ ] **1.1.b Run tests and verify failure messages**

- [ ] **1.2 Implement User model**

    - [ ] **1.2.a Create `User` model in `models.py`**
        - Fields: `username`, `email`, `password_hash`
        - Add validation in `clean()` method

    - [ ] **1.2.b Run tests - should now PASS**

    - [ ] **1.2.c Run quality gates (linting, type checking)**
```

### Pattern 2: Multi-Component Test-First

**Use when:** Multiple related components need testing

```markdown
### **Phase 2:** API Endpoints

- [ ] **2.1 Write API integration tests**

    - [ ] **2.1.a Create test for user registration endpoint**
        - Test: Successful registration with valid data
        - Test: Validation errors with invalid data
        - Test: Email uniqueness constraint
        - Expect tests to FAIL initially

    - [ ] **2.1.b Create test for user login endpoint**
        - Test: Successful login with correct credentials
        - Test: Failed login with wrong password
        - Test: Account lockout after failed attempts
        - Expect tests to FAIL initially

    - [ ] **2.1.c Run all tests and verify failures**

- [ ] **2.2 Implement registration endpoint**

    - [ ] **2.2.a Create `/api/register/` endpoint in `api.py`**
        - Accept `username`, `email`, `password`
        - Validate inputs, create user

    - [ ] **2.2.b Run registration tests - should now PASS**

- [ ] **2.3 Implement login endpoint**

    - [ ] **2.3.a Create `/api/login/` endpoint in `api.py`**
        - Authenticate user, return JWT token
        - Implement rate limiting

    - [ ] **2.3.b Run login tests - should now PASS**

- [ ] **2.4 Final quality gates**
    - [ ] 2.4.a Run full test suite (all tests pass)
    - [ ] 2.4.b Run linting and type checking
```

### Pattern 3: Feature with Backend and Frontend

**Use when:** Full-stack feature needs comprehensive testing

```markdown
### **Phase 1:** Backend Tests and Implementation

- [ ] **1.1 Write backend tests**

    - [ ] **1.1.a Create API integration tests**
        - Test endpoints, validation, error handling
        - Expect tests to FAIL initially

    - [ ] **1.1.b Create service layer tests**
        - Test business logic independently
        - Use mocks for external dependencies
        - Expect tests to FAIL initially

- [ ] **1.2 Implement backend**

    - [ ] **1.2.a Implement API endpoints**
        - Create routes, request handling

    - [ ] **1.2.b Implement service layer**
        - Business logic, data processing

    - [ ] **1.2.c Run backend tests - should PASS**

### **Phase 2:** Frontend Tests and Implementation

- [ ] **2.1 Write component tests**

    - [ ] **2.1.a Create tests for form component**
        - Test user interactions, validation
        - Mock API calls
        - Expect tests to FAIL initially

    - [ ] **2.1.b Create integration tests for feature flow**
        - Test complete user journey
        - Use MSW for API mocking
        - Expect tests to FAIL initially

- [ ] **2.2 Implement frontend components**

    - [ ] **2.2.a Create form component**
        - Input fields, validation, submit handler

    - [ ] **2.2.b Integrate with API service**
        - Wire up API calls, error handling

    - [ ] **2.2.c Run component tests - should PASS**

### **Phase 3:** End-to-End Validation

- [ ] **3.1 Manual testing**

    - [ ] **3.1.a Test complete flow in browser**
        - Verify all user paths work
        - Check error handling and edge cases

- [ ] **3.2 Quality gates**
    - [ ] 3.2.a Run full test suite (backend + frontend)
    - [ ] 3.2.b Run all linting and type checking
    - [ ] 3.2.c Verify no regressions
```

### Anti-Pattern: Tests After Implementation

❌ **Wrong - Tests as final phase:**

```markdown
### **Phase 1:** Implement Features
- [ ] **1.1 Create models**
- [ ] **1.2 Create API endpoints**
- [ ] **1.3 Create frontend**

### **Phase 2:** Write Tests  # DON'T DO THIS
- [ ] **2.1 Write model tests**
- [ ] **2.2 Write API tests**
- [ ] **2.3 Write frontend tests**
```

**Why wrong:**

- Tests written after implementation are harder and less effective
- No TDD benefit of driving design through tests
- Violates [DEVELOPMENT-RULES.md](../constitution/DEVELOPMENT-RULES.md) Test-First Protocol

---

## Complete Annotated Example

This example demonstrates all formatting elements in proper context:

```markdown
# Incidental: Filter State Preservation

**Created:** 2025-10-29
**Branch:** `incidental/filter-state-preservation`
**Base Branch:** `incidental/filter-integration-testing`
**Status:** In Progress

## Context

**Discovered:** Manual testing during Phase 3.6 (data quality filtering implementation)

**Interrupts:** `tasks-filter-integration-testing.md` at Phase 3.6, Task 3.6.2

**Problem:** UI state not preserved when navigating back from detail pages.

**Why Now:** Blocks manual testing confidence and affects newly implemented filter UX.

## Scope

### Will Do

- Fix state preservation for all filter types
- Add comprehensive test coverage
- Manual verification of navigation flows

### Won't Do

- Performance optimization (separate enhancement)
- History API refactoring (if not needed)

---

### **Phase 1:** Backend Test Infrastructure

- [ ] **1.1 Create test fixtures for state scenarios**

    **Goal:** Reusable fixtures to test state persistence across components.

    - [ ] **1.1.a Create fixture for filter state in `test_helpers.py`**
        - Return mock filter object with all fields
        - Support partial overrides for test variations
        - Include advanced filters (rating, year range)

    - [ ] **1.1.b Create fixture for navigation context**
        - Mock URL params and history state
        - Support detail→back→detail flows

- [ ] **1.2 Verify fixture compatibility with existing tests**

    - [ ] **1.2.a Run existing test suite with new fixtures**
        - Ensure no regressions
        - All tests should still PASS

### **Phase 2:** State Preservation Tests

- [ ] **2.1 Write tests for URL parameter preservation**

    - [ ] **2.1.a Create test in `test_navigation.ts`**
        - Test: All filter params survive navigation
        - Test: Unknown params preserved (forward compatibility)
        - Test: Page number preserved correctly
        - Expect tests to FAIL initially (implementation not updated)

    - [ ] **2.1.b Create test for edge cases**
        - Test: Empty filters (no params)
        - Test: Malformed URL params
        - Test: Very long param strings
        - Expect tests to FAIL initially

- [ ] **2.2 Write tests for UI state preservation**

    **Goal:** Ensure expanded panels stay expanded across navigation.

    - [ ] **2.2.a Create test for advanced panel state**
        - Test: Panel expanded with rating filters → detail → back → still expanded
        - Test: Panel collapsed with genres only → detail → back → still collapsed
        - Mock `useMovieCollectionState` hook
        - Expect tests to FAIL initially

    - [ ] **2.2.b Create test for filter collapsed state**
        - Test: Filters expanded → detail → back → still expanded
        - Expect tests to FAIL initially

### **Phase 3:** Implementation

- [ ] **3.1 Update URL parameter handling**

    - [ ] **3.1.a Modify `MovieCard.tsx` query string construction**
        - Capture all URL params from `useSearchParams()`
        - Pass all params to detail page URL
        - Preserve unknown params
        - File location: `components/movie/MovieCard.tsx:133-139`

    - [ ] **3.1.b Modify `MovieDetail.tsx` back button URL**
        - Read all params from current URL
        - Reconstruct complete back URL
        - File location: `pages/movie/MovieDetail.tsx:116-120`

    - [ ] **3.1.c Run URL preservation tests - should now PASS**

- [ ] **3.2 Update UI state preservation**

    - [ ] **3.2.a Verify `useEffect` auto-expand logic**
        - Effect detects advanced filters from URL
        - Sets `showAdvanced` to true when filters present
        - File location: `useMovieCollectionState.tsx:119-125`

    - [ ] **3.2.b Run UI state tests - should now PASS**

### **Phase 4:** Quality Gates and Manual Verification

- [ ] **4.1 Automated quality checks**

    - [ ] **4.1.a Run full test suite**
        - Backend: All tests pass
        - Frontend: All 416+ tests pass

    - [ ] **4.1.b Run linting and type checking**
        - ESLint: 0 violations
        - TypeScript: 0 errors
        - Pyright: 0 errors

- [ ] **4.2 Manual testing**

    - [ ] **4.2.a Test URL param preservation**
        - Apply filters → detail → back → verify filters
        - Test with all filter types

    - [ ] **4.2.b Test UI state preservation**
        - Expand advanced panel → detail → back → verify expanded
        - Test across multiple navigation cycles

    - [ ] **4.2.c Test browser back button**
        - Verify no regression in browser navigation
        - Test forward button as well

## Notes & Observations

**Technical Approach**:
- URL params: Simple pass-through, low risk
- UI state: Effect-based auto-expand using filters as signal

**Related Work**:
- Discovered during: `.arc/active/incidental/tasks-pagination-buffer-tracking.md`
```

**Key elements demonstrated:**

- ✅ Incidental task list header with all required fields
- ✅ Context section (Discovered, Interrupts, Problem, Why Now)
- ✅ Scope section (Will Do, Won't Do)
- ✅ Phase headers with proper formatting
- ✅ Parent tasks with checkboxes and bold
- ✅ Goal lines indented to subtask level (4 spaces)
- ✅ Numbered subtasks bold when detail bullets follow
- ✅ Unnumbered bullets for implementation details
- ✅ Test-first ordering throughout
- ✅ "Expect tests to FAIL" and "should now PASS" noted
- ✅ Backticks for all technical terms
- ✅ Proper indentation (4 spaces per level)
- ✅ Blank lines between subtasks with detail bullets

---

## Common Mistakes

### Mistake 1: Headers Instead of Parent Tasks

❌ **Wrong:**

```markdown
### **Phase 1:** Backend Implementation

### 1.1 Write tests for models  # This is a HEADER, not a task

- Create test file
- Add test cases
```

✅ **Correct:**

```markdown
### **Phase 1:** Backend Implementation

- [ ] **1.1 Write tests for models**  # This is a PARENT TASK

    - [ ] **1.1.1 Create test file**
        - Add test cases for validation
```

### Mistake 2: Missing Test-First Structure

❌ **Wrong (implementation before tests):**

```markdown
- [ ] **1.1 Implement User model**
- [ ] **1.2 Write tests for User model**
```

✅ **Correct (tests before implementation):**

```markdown
- [ ] **1.1 Write tests for User model**

    - [ ] **1.1.1 Create test file with validation tests**
        - Expect tests to FAIL initially

- [ ] **1.2 Implement User model**

    - [ ] **1.2.1 Create `User` model in `models.py`**
        - Tests should now PASS
```

### Mistake 3: Pre-checked Tasks

❌ **Wrong:**

```markdown
- [x] **1.1 Write tests**  # Never pre-check
```

✅ **Correct:**

```markdown
- [ ] **1.1 Write tests**  # Always start unchecked
```

### Mistake 4: Numbered Detail Bullets

❌ **Wrong:**

```markdown
- [ ] **1.1 Create model**
    - [ ] 1.1.1 Add username field  # Too granular for numbered subtask
    - [ ] 1.1.2 Add email field     # These are implementation details
```

✅ **Correct:**

```markdown
- [ ] **1.1 Create model**

    - [ ] **1.1.1 Add fields to `User` model in `models.py`**
        - Add `username` field (CharField, max 150, unique)
        - Add `email` field (EmailField, unique)
        - Add `date_joined` field (DateTimeField, auto_now_add)
```

### Mistake 5: Goal/Note Indentation

❌ **Wrong:**

```markdown
- [ ] **1.1 Refactor service layer**
**Goal:** Improve testability.  # Not indented properly

    - [ ] 1.1.1 Extract helper functions
```

✅ **Correct:**

```markdown
- [ ] **1.1 Refactor service layer**

    **Goal:** Improve testability by extracting pure functions.

    - [ ] **1.1.1 Extract helper functions**
        - Move validation logic to separate module
```

### Mistake 6: Missing Backticks

❌ **Wrong:**

```markdown
- [ ] 1.1.1 Create User model in models.py
    - Add email field with validation
```

✅ **Correct:**

```markdown
- [ ] **1.1.1 Create `User` model in `models.py`**
    - Add `email` field with `EmailValidator`
```

### Mistake 7: Vague Subtask Descriptions

❌ **Wrong:**

```markdown
- [ ] **1.1 Update component**
    - [ ] 1.1.a Fix the bug
    - [ ] 1.1.b Add the feature
```

✅ **Correct:**

```markdown
- [ ] **1.1 Update MovieCard component for filter preservation**

    - [ ] **1.1.a Capture all URL params in query string**
        - Use `useSearchParams()` to read current filters

    - [ ] **1.1.b Pass params to detail page via Link component**
        - Serialize params to query string
```

### Mistake 8: Numeric Third Level (Use Letters)

❌ **Wrong:**

```markdown
- [ ] **1.1 Write tests for User model**
    - [ ] **1.1.1 Create validation tests**  # Numbers blend together
    - [ ] **1.1.2 Create relationship tests**
    - [ ] **1.1.3 Run and verify failures**
```

✅ **Correct:**

```markdown
- [ ] **1.1 Write tests for User model**
    - [ ] **1.1.a Create validation tests**  # Letters signal depth
    - [ ] **1.1.b Create relationship tests**
    - [ ] **1.1.c Run and verify failures**
```

**Why:** Three consecutive numbers (`1.1.1`) are harder to parse than number-number-letter (`1.1.a`).
Letters at the third level provide visual differentiation and reduce cognitive load.

---

## Decision Guidelines

### Subtask Granularity: Numbered vs Detail Bullets

**Core principle:** Number subtasks when tracking completion adds value; use detail bullets when numbering creates noise.

#### Use Subtasks (X.Y.a) When

- **Independently completable** at different times/sessions
- **Clear checkpoint value** - marking complete signals progress
- **Could be assigned separately** or worked on by different people
- **Meaningful pause points** between steps

**Decision test:**

- Would you complete these at different times? → Subtasks
- Would you do them all in one sitting? → Detail bullets
- Does splitting add clarity or just noise? → If noise, use detail bullets

**Example needing subtasks:**

```markdown
- [ ] **2.1 Write API integration tests**

    - [ ] **2.1.a Create test for registration endpoint**
        - Test: Successful registration
        - Test: Validation errors

    - [ ] **2.1.b Create test for login endpoint**
        - Test: Successful login
        - Test: Failed login

    - [ ] **2.1.c Create test for logout endpoint**
        - Test: Session invalidation
```

The three subtasks represent independent checkpoints - different endpoints tested separately.

#### Use Detail Bullets When

Detail bullets serve two purposes:

**1. Implementation guidance (non-actionable):**

- File locations, line numbers: `File: components/MovieCard.tsx:133-139`
- Architecture notes: "Uses existing filter state as signal"
- Expected behaviors: "Expect tests to FAIL initially"
- Context or rationale: "Workaround for browser compatibility"

**2. Grouped sub-actions (actionable but coupled):**

- Multiple tests in same file created together
- Manual testing scenarios done in one session
- Configuration items changed together
- Too granular/coupled to track separately

**Example using detail bullets correctly:**

```markdown
- [ ] **3.2 Manual browser verification of showAdvanced auto-expand**
    - Apply rating filter → detail → back → verify expanded (grouped - same session)
    - Apply year range → detail → back → verify expanded (grouped - same session)
    - Single year → detail → back → verify collapsed (grouped - same session)
    - Genres only → detail → back → verify collapsed (grouped - same session)
    - Test across remounts (detail→back→detail→back) (grouped - same session)
```

All 5 items done in one manual testing session - splitting into subtasks creates noise without value.

#### Avoid Parent Tasks with Single Subtask

**Anti-pattern:** Parent task with only 1 numbered subtask

If you find this pattern, you have two options:

**Option 1: Collapse** (most common)

- Remove subtask number, make parent task more specific
- Move detail bullets to parent level
- Example:
    - ❌ `1.1 Write tests` → `1.1.1 Create test file`
    - ✅ `1.1 Create test file in test_navigation.ts`

**Option 2: Split** (if subtask contains multiple distinct actions)

- If subtask has "and" or multiple verbs representing separate completion events
- Example:
    - ❌ `2.3 Verify compatibility` → `2.3.1 Review and test integration`
    - ✅ `2.3 Verify compatibility` → `2.3.1 Review integration` + `2.3.2 Test integration`

**Example - Collapsed correctly:**

```markdown
❌ **Wrong (single subtask anti-pattern):**
- [ ] **1.1 Write tests for URL preservation**
    - [ ] **1.1.1 Create test file with all scenarios**
        - Test: All filter params survive navigation
        - Test: Unknown params preserved
        - Expect tests to FAIL initially

✅ **Correct (collapsed to parent):**
- [ ] **1.1 Create test file for URL preservation in `test_navigation.ts`**
    - Test: All filter params survive navigation
    - Test: Unknown params preserved
    - Expect tests to FAIL initially
```

**Example - Split correctly:**

```markdown
❌ **Wrong (multiple actions in single subtask):**
- [ ] **2.3 Verify MovieCollectionGrid compatibility**
    - [ ] **2.3.a Review integration and run tests**

✅ **Correct (split distinct actions):**
- [ ] **2.3 Verify MovieCollectionGrid compatibility**
    - [ ] **2.3.a Review integration code**
        - Check prop passing
        - Verify parameter flow
    - [ ] **2.3.b Run integration tests - should PASS**
```

### When to Add Goal/Note Lines

**Add Goal/Note line when:**

- Parent task title is technical/terse
- Purpose or rationale needs clarification
- Context would help future readers

**Skip Goal/Note line when:**

- Parent task title is already clear and descriptive
- Purpose is obvious from context
- Would just repeat the title

**Example needing Goal line:**

```markdown
- [ ] **3.2 Refactor buffer logic**

    **Goal:** Separate pagination metadata tracking from result filtering for clarity.

    - [ ] **3.2.a Extract metadata handling to separate function**
        - Move tracking logic to `pagination_helpers.py`
```

**Example NOT needing Goal line:**

```markdown
- [ ] **3.2 Write tests for buffer pagination metadata tracking**

    - [ ] **3.2.a Create test for metadata in API response**
        - Test: `next_tmdb_page_start` field present
        - Expect tests to FAIL initially
```

### When to Add Blank Lines Between Subtasks

**Add blank lines when:**

- Parent has 3+ numbered subtasks
- Each subtask has 2+ lines of detail bullets
- Improves readability through visual chunking

**Example with blank lines:**

```markdown
- [ ] **2.1 Write comprehensive test suite**

    - [ ] **2.1.a Create model validation tests**
        - Test field constraints
        - Test relationships
        - Expect tests to FAIL initially

    - [ ] **2.1.b Create API endpoint tests**
        - Test success cases
        - Test error handling
        - Expect tests to FAIL initially

    - [ ] **2.1.c Run all tests and verify failures**
```

**Skip blank lines when:**

- Subtasks are simple/single-line
- Parent has only 1-2 subtasks

---

## Success Criteria Section

**Required for all task lists.** Placed at the bottom after all phases, serves as completion verification checklist.

### Purpose

- **Pre-archival sanity check**: Verify all intended functionality before marking complete
- **Explicit verification**: Forces review of outcomes vs. just assuming completion
- **Easy to find**: Bottom placement makes it the natural final step

### Format

```markdown
---

## Success Criteria

- [ ] [Verifiable outcome derived from Scope "Will Do"]
- [ ] [Another verifiable outcome]
- [ ] [Functional requirement that can be tested]
- [ ] All quality gates pass (tests, linting, type checking)
- [ ] Ready for [archival | next phase | merge]
```

### Rules

- **Checkboxes required**: Unlike header prose, these are actionable verification items
- **Derived from Scope**: Each "Will Do" item should map to verifiable criteria
- **Include quality gates**: Always include "All quality gates pass" as standard item
- **Include readiness**: Always include "Ready for X" as final item
- **Mark before archival**: All items must be `[x]` before running archive workflow
- **No time estimates**: Same rule as rest of task list

### Examples

**Feature/Technical task list:**

```markdown
## Success Criteria

- [x] Service layer handles all business logic (API endpoints are thin wrappers)
- [x] Class-based architecture implemented for all services
- [x] 100% test coverage for service layer methods
- [x] All quality gates pass (611 backend tests, 504 frontend tests, 0 violations)
- [x] Ready for archival
```

**Incidental task list:**

```markdown
## Success Criteria

- [x] Within-page deduplication working (no duplicates on single page)
- [x] Cross-page deduplication working (no duplicates across pagination)
- [x] Backward navigation to page 1 consistent (same movies on return)
- [x] Filter changes reset session (new filters = fresh results)
- [x] All quality gates pass (backend 611, frontend 504, 0 violations)
- [x] Ready to resume interrupted work at Task 3.3
```

### Relationship to Scope

| Header Section                   | Bottom Section                         |
| -------------------------------- | -------------------------------------- |
| **Scope: Will Do**               | **Success Criteria**                   |
| Planning: "What we intend to do" | Verification: "Did we actually do it?" |
| Prose bullets, no checkboxes     | Checkboxes, verifiable items           |
| Written at task list creation    | Verified at task list completion       |

---

## References

- [DEVELOPMENT-RULES.md](../constitution/DEVELOPMENT-RULES.md) - Test-First Protocol
- [strategy-testing-methodology.md](./strategy-testing-methodology.md) - Testing standards and patterns
- [2_generate-tasks.md](../workflows/2_generate-tasks.md) - Planned work task generation
- [manage-incidental-work.md](../workflows/supplemental/manage-incidental-work.md) - Incidental work lifecycle
- [3_process-task-loop.md](../workflows/3_process-task-loop.md) - Task execution workflow
