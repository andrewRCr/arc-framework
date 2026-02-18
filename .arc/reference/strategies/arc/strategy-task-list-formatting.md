# Task List Formatting Strategy

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
# Incidental: CLI Output Encoding on Windows

**Created:** 2025-10-29
**Branch:** `incidental/cli-output-encoding`
**Base Branch:** `feature/multi-format-export`
**Status:** In Progress

## Context

**Discovered:** Manual testing during Phase 3.6 (CSV export implementation)

**Interrupts:** `tasks-multi-format-export.md` at Phase 3.6, Task 3.6.2

**Problem:** CLI output garbles non-ASCII characters on Windows terminals.

**Why Now:** Blocks manual testing confidence and affects newly implemented export features.

## Scope

### Will Do

- Fix encoding for all output formats (table, CSV, JSON)
- Add comprehensive encoding tests
- Manual verification across terminal types

### Won't Do

- Performance optimization (separate enhancement)
- Custom encoding configuration (out of scope)

---

## Tasks

**Example (paused work):**

```markdown
# Incidental: Test Fixture Deduplication

**Created:** 2025-10-30
**Branch:** `incidental/test-fixture-deduplication`
**Base Branch:** `technical/api-versioning`
**Status:** Paused

## Context

**Discovered:** During Phase 3 planning for API versioning work

**Interrupts:** `tasks-api-versioning.md` at Task 3.1

**Paused At:** Phase 3 complete (fixture analysis done, before Phase 4 consolidation)

**Paused To:** `tasks-auth-token-refresh.md` - Critical token refresh bug discovered during
integration testing

**Problem:** Test fixtures duplicated across 12 test modules.

**Why Now:** Must consolidate patterns before adding 15+ new versioned endpoint tests.
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
- [ ] **7.1 Systematic module audit**

    **Goal:** Review all modules for consistent error handling patterns.

    - [ ] **7.1.a Catalog all modules**
        - Generate list of all source files
        - Categorize by layer: core, services, utilities
        - Create audit checklist

    - [ ] **7.1.b Verify error propagation consistency**
        - Check service modules return typed error results
        - Check utility modules use consistent exception hierarchy
        - Document violations

    - [ ] **7.1.c Verify logging consistency**
        - Check all error paths include structured logging
        - Check all log entries include correlation IDs
        - Document violations
```

✅ **Correct (fourth level if needed):**

```markdown
- [ ] **7.2 Apply fixes from audit**

    - [ ] **7.2.a Apply error propagation fixes**
        - Work through violation list from 7.1.b

        - [ ] **7.2.a.1 Fix service module patterns**
            - Update 15 modules with correct return types
            - Verify error contracts with callers

        - [ ] **7.2.a.2 Fix utility module patterns**
            - Update 8 modules with typed exceptions
            - Verify error contracts with callers
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
        - File location: `tests/models/test_user.py` (guidance)
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
        - [ ] **3.1.R.1 Write tests for `PaginatedQuery` handler**
            - Test: metadata parameter accepted
            - Expect tests to FAIL initially

        - [ ] **3.1.R.2 Write stability tests for `ResultsList`**
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
- [ ] 1.2.1 Create `User` model in `src/models/user.py`
    - Add fields: `username`, `email`, `date_joined`
    - Implement `validate()` method for input checking
    - Use `EmailField` type for email validation
```

❌ **Wrong:**

```markdown
- [ ] 1.2.1 Create User model in src/models/user.py  # No backticks
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

### Pattern 3: Multi-Layer Projects

**Use when:** Feature spans multiple layers (e.g., backend + frontend, API + CLI, core + plugins)

**Approach:** Apply Pattern 1 or 2 to each layer as a separate phase, then add a final phase for
cross-layer validation (integration tests, end-to-end testing, quality gates). Each layer's phase
follows test-first ordering internally.

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
# Incidental: Config Validation Error Reporting

**Created:** 2025-10-29
**Branch:** `incidental/config-validation-errors`
**Base Branch:** `feature/plugin-system`
**Status:** In Progress

## Context

**Discovered:** Manual testing during Phase 3.6 (plugin loader implementation)

**Interrupts:** `tasks-plugin-system.md` at Phase 3.6, Task 3.6.2

**Problem:** Invalid configuration silently ignored instead of reporting clear errors.

**Why Now:** Blocks manual testing confidence and affects newly implemented plugin loading.

## Scope

### Will Do

- Fix error reporting for all configuration fields
- Add comprehensive validation tests
- Manual verification of error messages

### Won't Do

- Performance optimization (separate enhancement)
- Custom validation rules API (out of scope)

---

### **Phase 1:** Test Infrastructure

- [ ] **1.1 Create test fixtures for config scenarios**

    **Goal:** Reusable fixtures to test validation across configuration types.

    - [ ] **1.1.a Create fixture for valid configs in `test_helpers.py`**
        - Return mock config object with all required fields
        - Support partial overrides for test variations
        - Include nested config (plugin settings, environment overrides)

    - [ ] **1.1.b Create fixture for invalid configs**
        - Missing required fields, type mismatches, out-of-range values
        - Support combining multiple violations in one config

- [ ] **1.2 Verify fixture compatibility with existing tests**

    - [ ] **1.2.a Run existing test suite with new fixtures**
        - Ensure no regressions
        - All tests should still PASS

### **Phase 2:** Validation Tests

- [ ] **2.1 Write tests for field validation**

    - [ ] **2.1.a Create test in `test_config_validation.py`**
        - Test: Required fields report missing with field path
        - Test: Type mismatches report expected vs actual type
        - Test: Range violations report allowed bounds
        - Expect tests to FAIL initially (validation not updated)

    - [ ] **2.1.b Create test for edge cases**
        - Test: Empty config (all fields missing)
        - Test: Deeply nested invalid fields
        - Test: Multiple simultaneous violations
        - Expect tests to FAIL initially

- [ ] **2.2 Write tests for error message formatting**

    **Goal:** Ensure error messages are actionable and include fix suggestions.

    - [ ] **2.2.a Create test for error output format**
        - Test: Errors include field path (e.g., `plugins.auth.timeout`)
        - Test: Errors include expected type or value range
        - Test: Multiple errors collected and reported together
        - Expect tests to FAIL initially

    - [ ] **2.2.b Create test for suggestion generation**
        - Test: Typos suggest closest valid field name
        - Expect tests to FAIL initially

### **Phase 3:** Implementation

- [ ] **3.1 Update field validation logic**

    - [ ] **3.1.a Add validation to `ConfigLoader` required field checks**
        - Collect all violations before reporting (don't fail on first)
        - Include field path in each error
        - Preserve existing valid-config behavior
        - File location: `src/config/loader.py:89-120`

    - [ ] **3.1.b Add type checking to `ConfigParser.parse_field()`**
        - Report expected vs actual type
        - Handle nested configs recursively
        - File location: `src/config/parser.py:45-78`

    - [ ] **3.1.c Run field validation tests - should now PASS**

- [ ] **3.2 Update error message formatting**

    - [ ] **3.2.a Implement `ValidationErrorFormatter`**
        - Collect errors into structured report
        - Sort by field path for readability
        - File location: `src/config/errors.py` (new file)

    - [ ] **3.2.b Run error format tests - should now PASS**

### **Phase 4:** Quality Gates and Manual Verification

- [ ] **4.1 Automated quality checks**

    - [ ] **4.1.a Run full test suite**
        - Unit tests: All pass
        - Integration tests: All pass

    - [ ] **4.1.b Run linting and type checking**
        - Linter: 0 violations
        - Type checker: 0 errors

- [ ] **4.2 Manual testing**

    - [ ] **4.2.a Test missing field errors**
        - Remove required field → verify clear error message
        - Test with multiple missing fields

    - [ ] **4.2.b Test type mismatch errors**
        - String where int expected → verify helpful message
        - Test across all config field types

    - [ ] **4.2.c Test suggestion accuracy**
        - Typo in field name → verify closest match suggested
        - Test with various edit distances

## Notes & Observations

**Technical Approach**:
- Collect-then-report pattern for validation (no fail-fast)
- Recursive descent for nested config validation

**Related Work**:
- Discovered during: `tasks-plugin-system.md`
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

Quick reference for frequent errors. Each element's detailed ✅/❌ examples are in
[Format Elements Reference](#format-elements-reference) above.

1. **Headers instead of parent tasks** — Use `- [ ] **X.Y Description**` (checkbox + bold), not
   `### X.Y` (heading)
2. **Tests after implementation** — Test tasks come BEFORE implementation in each phase
3. **Pre-checked tasks** — All tasks start as `- [ ]` (unchecked), never `- [x]`
4. **Numbered detail bullets** — Implementation details use unnumbered bullets, not numbered subtasks
5. **Goal/Note at wrong indent** — Indent 4 spaces from margin (same level as subtasks), not at margin
6. **Missing backticks** — All technical identifiers need backticks: `ClassName`, `file.py`, `/api/path/`
7. **Vague descriptions** — Be specific: "Capture all query params before redirect", not "Fix the bug"
8. **Numeric third level** — Use letters (`1.1.a`) not numbers (`1.1.1`) — letters signal depth

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

#### Use Detail Bullets When

Items are done in one sitting, too granular/coupled to track separately, or non-actionable
context/guidance. See [Unnumbered Implementation Bullets](#unnumbered-implementation-bullets)
for the two-purpose breakdown (guidance vs grouped actions) and full formatting rules.

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
    - ❌ `2.3 Verify compatibility` → `2.3.a Review and test integration`
    - ✅ `2.3 Verify compatibility` → `2.3.a Review integration` + `2.3.b Test integration`

### When to Add Goal/Note Lines

**Add when:** Parent task title is technical/terse, purpose needs clarification, or context helps
future readers. **Skip when:** Title is already descriptive, purpose is obvious, or it would repeat
the title. See [Goal/Note Lines](#goalnote-lines) for formatting rules and examples.

### When to Add Blank Lines Between Subtasks

**Add when:** Parent has 3+ subtasks and each has 2+ detail bullets (visual chunking helps).
**Skip when:** Subtasks are simple/single-line or parent has only 1-2 subtasks.

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
- [x] All quality gates pass (tests, linting, type checking — 0 violations)
- [x] Ready for archival
```

**Incidental task list:**

```markdown
## Success Criteria

- [x] Required-field validation reports all missing fields with paths
- [x] Type-mismatch validation reports expected vs actual types
- [x] Nested config validation works recursively
- [x] Multiple errors collected and reported in single pass
- [x] All quality gates pass (tests, linting, type checking — 0 violations)
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
- [2_generate-tasks.md](../workflows/2_generate-tasks.md) - Planned work task generation
- [manage-incidental-work.md](../workflows/supplemental/manage-incidental-work.md) - Incidental work lifecycle
- [3_process-task-loop.md](../workflows/3_process-task-loop.md) - Task execution workflow
