# Work Organization Strategy

**Version:** 2.1 | **Updated:** 2025-12-18 | **Status:** Active

**Version history (latest first):**

- 2.1 (2025-12-18) – Added global sequence numbering for archive directories (`{NN}_` prefix by completion order)
- 2.0 (2025-11-10) – Added stacked branch workflow (ADR-013), renamed from "Work Categorization" to
  "Work Organization" to reflect expanded scope covering git workflow, directory structure, and archive organization
- 1.0 (2025-10-17) – Initial strategy (three-way split with incidental model)

## Purpose

Authoritative guidance for organizing development work in ARC-based projects. Defines work categorization
(feature/technical/incidental), git branch workflow including stacked branches, directory structure, commit
patterns, and archive organization.

Use this strategy when:

- Starting a new feature or technical improvement
- Discovering reactive work during development
- Deciding whether to create a git branch
- Organizing task documentation
- Planning project structure

## Table of Contents

1. [The Challenge](#the-challenge)
2. [Our Solution](#our-solution)
3. [Core Principles](#core-principles)
4. [Work Categories](#work-categories)
5. [Decision Rules](#decision-rules)
6. [Incidental Work Model](#incidental-work-model)
7. [Git Workflow](#git-workflow)
8. [Directory Structure](#directory-structure)
9. [Implementation Examples](#implementation-examples)
10. [Anti-Patterns](#anti-patterns)
11. [Migration Guide](#migration-guide)
12. [Related Documentation](#related-documentation)

---

## The Challenge

### Common Organizational Problems

**Semantic Confusion**: Work categories that describe size ("epic") rather than type create ambiguity.

**Examples of confusion:**

- "feature/backend-modernization" → Sounds like user features, but it's infrastructure work
- "feature/type-safety-improvements" → Sounds like features, but it's technical debt reduction
- "incidental" vs "small" → Conflates planning status with work size

**The real distinctions that matter:**

1. **PLANNED vs UNPLANNED** - Different workflows, documentation requirements, git strategies
2. **USER-FACING vs TECHNICAL** - Different stakeholders, different value propositions

**Problems this causes:**

1. Category names don't match content (cognitive dissonance)
2. Work type is lost in categorization
3. Git branch naming doesn't align with industry conventions
4. Difficult to communicate project state to stakeholders

---

## Our Solution

### Three-Way Split with Hybrid Incidental Model

**Primary Distinction: PLANNED vs UNPLANNED**

- **Planned work** (feature/ + technical/) → Gets PRDs, formal task lists, git branches
- **Unplanned work** (incidental/) → Gets task lists, NO PRDs, gets branches if substantial (>30min, multiple subtasks)

**Secondary Distinction: USER-FACING vs TECHNICAL** (for planned work)

- **feature/** → User capabilities from product vision
- **technical/** → Infrastructure improvements

This preserves the valuable planned vs unplanned distinction while clarifying work type.

### Directory Structure

```
.arc/active/
  feature/      # Planned user-facing work (implements product features)
  technical/    # Planned infrastructure work (improves "how we build")
  incidental/   # Unplanned quality work (discovered during development)
```

### Git Branch Naming

```
# Planned work (gets branches)
feature/user-authentication
feature/data-export
feature/advanced-search

technical/backend-modernization
technical/frontend-state-management
technical/testing-infrastructure

# Incidental work (gets branches if substantial work)
incidental/filter-integration-testing
incidental/pagination-buffer-tracking
incidental/theme-system-modernization
```

### Key Insight

**Work is categorized by TYPE and PLANNING STATUS, not SIZE.**

All three categories can contain large or small work. Incidental work can take 30 minutes or 15 hours. Size doesn't
determine category.

---

## Core Principles

### 1. Work Type, Not Work Size

**Categorization based on:**

- ✅ What kind of work (user-facing, infrastructure, reactive)
- ✅ Planning status (planned vs discovered)
- ❌ Duration or complexity

**Benefits:**

- Clear categorization rules
- No subjective "how big is epic?" debates
- Scalable to any project size

### 2. Industry Alignment

**Git branch naming follows industry conventions:**

- `feature/` - Standard for user-facing capabilities
- `technical/` or `refactor/` - Standard for infrastructure
- `chore/`, `fix/`, `test/` - Conventional Commit types

**Recognizable patterns:**

- Other developers understand immediately
- Follows Conventional Commits philosophy
- Compatible with automated tooling

### 3. Semantic Clarity

**Name immediately tells you what kind of work:**

- `feature/` = "What can users DO now that they couldn't before?"
- `technical/` = "How does the codebase work better internally?"
- `incidental/` = "What did we discover and fix along the way?"

**No cognitive dissonance:**

- Directory names match git branches
- Branch names match commit prefixes
- Clear communication with stakeholders

### 4. Pragmatic Solo Developer Workflow

**Planned vs unplanned demands different processes:**

- Planned work: Formal PRD, task breakdown, dedicated branch, structured commits
- Unplanned work: Task list for tracking, commits to current branch, conventional prefixes

**Avoids branch management overhead:**

- Solo developers benefit from simplicity
- Incidental work often cascades (fixing A reveals B reveals C)
- Task lists provide equivalent traceability

---

## Work Categories

### Category 1: Feature Work (User-Facing Capabilities)

**Definition:** Planned work that adds user-visible capabilities from product vision.

**Characteristics:**

- Referenced in product roadmap or META-PRD
- Adds new user capabilities
- Changes what users can do
- Has user-facing impact

**Examples:**

- User authentication system
- Data export functionality
- Advanced search with filters
- Recommendations engine
- Collaborative features

**Documentation:**

- PRD: `.arc/active/feature/prd-<name>.md`
- Tasks: `.arc/active/feature/tasks-<name>.md`
- Notes: `.arc/active/feature/notes-<name>.md`
- Git branch: `feature/<name>`

### Category 2: Technical Work (Infrastructure Improvements)

**Definition:** Planned work that improves codebase quality, architecture, or developer experience.

**Characteristics:**

- Infrastructure and tooling improvements
- Refactoring and code quality
- Testing and CI/CD enhancements
- Performance optimizations
- Developer experience improvements

**Examples:**

- State management migration (Redux → Zustand)
- Type safety improvements (adding TypeScript strict mode)
- Testing infrastructure (pytest migration, test helpers)
- Build system optimization (Vite configuration, bundle analysis)
- Service layer patterns (extracting business logic)

**Documentation:**

- PRD: `.arc/active/technical/prd-<name>.md`
- Tasks: `.arc/active/technical/tasks-<name>.md`
- Notes: `.arc/active/technical/notes-<name>.md`
- Git branch: `technical/<name>`

### Category 3: Incidental Work (Reactive Quality Improvements)

**Definition:** Unplanned work discovered during feature/technical development.

**Characteristics:**

- Discovered during development (not planned)
- Often cascades (fixing A reveals B)
- Requires pause/resume (interleaved with primary work)
- Can be large or small (stub updates = 30 min, type safety = 15 hours)

**Examples (by conventional commit type):**

**Maintenance (chore):**

- Dependency updates
- Configuration changes
- Tooling improvements
- Documentation updates

**Refactoring:**

- Code restructuring
- Pattern extraction
- Service layer work
- DRY improvements

**Fixes:**

- Bug fixes discovered during development
- Issue resolution
- Security patches

**Testing:**

- Test infrastructure improvements
- Coverage gap filling
- Security test additions

**Performance:**

- Performance optimizations
- Query optimization
- Bundle size reduction

**Documentation:**

- Tasks: `.arc/active/incidental/tasks-<type>-<name>.md` (e.g., `tasks-chore-update-deps.md`)
- Notes: `.arc/active/incidental/notes-<type>-<name>.md` (optional)
- Git branch: **None** (commits to feature/technical branch)

---

## Decision Rules

### Clear & Simple Decision Tree

**Step 1: Ask "Was this planned in advance?"**

- **No** (discovered during work) → `incidental/` (see Incidental Work Model)
- **Yes** (has PRD or formal planning) → Continue to Step 2

**Step 2: Ask "Does this add user-visible capability from product vision?"**

- **Yes** → `feature/` (user authentication, data export, search, etc.)
- **No** → `technical/` (modernization, type safety, refactoring, infrastructure)

**Why planned/unplanned is Step 1:** Different workflows apply - incidental work doesn't get PRDs or separate branches.

### Decision Examples

**Example 1: User Authentication**

- **Step 1:** Planned? → Yes (in product roadmap)
- **Step 2:** User-visible capability? → Yes (users can log in, register, reset password)
- **Category:** `feature/user-authentication`

**Example 2: State Management Migration**

- **Step 1:** Planned? → Yes (PRD created, task list generated)
- **Step 2:** User-visible capability? → No (changes implementation, not user features)
- **Category:** `technical/state-management-migration`

**Example 3: Type Safety Improvements**

- **Step 1:** Planned? → No (discovered type errors while implementing feature)
- **Category:** `incidental/tasks-chore-type-safety-improvements.md` (no branch)

**Example 4: Bug Fix During Feature Work**

- **Step 1:** Planned? → No (discovered while testing authentication)
- **Category:** `incidental/tasks-fix-auth-token-expiration.md` (no branch)

### Edge Cases

**Polish and UX Improvements:**

- If planned and substantial → `technical/ux-enhancements` (toast notifications, loading states, skeleton screens)
- If reactive and small → `incidental/tasks-refactor-loading-states.md`

**Refactoring:**

- Large, planned refactoring → `technical/service-layer-extraction`
- Discovered during feature work → `incidental/tasks-refactor-auth-service.md`

**Documentation:**

- Planned documentation project → `technical/api-documentation` or `feature/user-guide`
- Quick doc updates → `incidental/tasks-docs-update-readme.md`

---

## Incidental Work Model

### Why Incidental Work is Different

**Characteristics that make incidental work special:**

1. **Discovery-driven** - Can't plan what you haven't discovered yet
2. **Cascading nature** - Fixing type errors reveals stub issues → reveals test helper duplication
3. **Interleaved execution** - Must pause/resume feature work
4. **Variable size** - 30-minute stub update or 15-hour type safety overhaul

**Industry challenge:** Creating git branches for each discovered issue creates branch management overhead that outweighs
benefits for solo developers.

**Our approach:** Hybrid model combining task list tracking with conventional commit practices.

### File Naming: Conventional Commit Prefixes

**Pattern:** `incidental/tasks-<type>-<name>.md`

**Conventional commit types:**

- `tasks-chore-X` - Maintenance, tooling, config, dependencies
- `tasks-refactor-X` - Code restructuring, pattern extraction
- `tasks-fix-X` - Bug fixes discovered during development
- `tasks-test-X` - Test infrastructure, coverage improvements
- `tasks-perf-X` - Performance optimizations
- `tasks-docs-X` - Documentation updates

**Examples:**

```
incidental/tasks-chore-backend-type-safety.md
incidental/tasks-refactor-extract-test-helpers.md
incidental/tasks-fix-csrf-middleware.md
incidental/tasks-test-coverage-improvements.md
incidental/notes-chore-backend-type-safety.md (optional)
```

**Benefits:**

- ✅ Industry-standard terminology (aligns with Conventional Commits)
- ✅ Reduces filename redundancy
- ✅ Clear work type at a glance
- ✅ Filterable when archived

### Stacked Branch Workflow

**Incidental work that meets task list criteria gets separate git branches.**

**When to create a branch for incidental work:**

- ✅ Requires dedicated task list (>30min effort, multiple subtasks)
- ✅ Semantically distinct from current branch's work
- ✅ Desire independent merge/review capability

**When to stay on current branch:**

- ❌ Trivial fixes (<30min, single action)
- ❌ Work directly continues current branch's theme
- ❌ No separate task list justified

**Branch Naming:** Use `incidental/<name>` prefix matching task list name (minus `tasks-` prefix)

**Example:**

- Task list: `tasks-pagination-buffer-tracking.md`
- Branch: `incidental/pagination-buffer-tracking`

### Stacked Branch Model

**What is stacking:** Child branches created off parent branches (not always from main).

```
main
└── technical/service-layer-modernization
    └── incidental/filter-integration-testing
        └── incidental/pagination-buffer-tracking
```

**Why stacking makes sense:**

- Work discovered DURING parent work naturally depends on parent context
- Preserves causality (git history shows what triggered what)
- Enables independent review/merge of each logical unit
- Matches industry-standard "stacked development" pattern (Meta, Google)

### Branch Lifecycle

```
On Child Branch (Before PR):
1. Discover work that needs task list (>30min, multiple subtasks)
2. Create branch off current: git checkout -b incidental/<name>
3. Create task list: .arc/active/incidental/tasks-<name>.md
4. Work on branch, commit with task references
5. Complete work (all tasks done, quality gates pass)
6. Run maintain-task-notes.md Mode 2 (clean task list and notes files)
7. Create completion-{name}.md (executive summary, PR description draft)
8. Commit documentation changes to child branch

Code Review & Merge:
9. Run local code review (coderabbit review local)
10. Create PR against parent: gh pr create --base parent-branch --head child-branch
    (use completion doc as PR description template)
11. Address PR review findings (update completion doc if outcomes changed)
12. Merge PR (child → parent)

On Parent Branch (After Merge):
13. Delete merged branch: git branch -d incidental/<name>
14. Archive files: git mv to .arc/reference/archive/{quarter}/incidental/{NN}_{name}/
15. Commit archive changes on parent branch
16. Return to parent branch and continue work
```

**Key rule:** Task list in `.arc/active/` ↔ Git branch exists

### Merge Strategy

**Depth-first merging:** Complete deepest child first, merge up to parent.

```bash
# Example stack
main
└── technical/service-layer
    └── incidental/filter-testing
        └── incidental/pagination-fixes

# Merge order:
# 1. pagination-fixes → filter-testing (PR, merge, delete branch, archive task list)
# 2. filter-testing → service-layer (PR, merge, delete branch, archive task list)
# 3. service-layer → main (PR, merge, delete branch, archive task list)
```

**Why depth-first:**

- Child work must be integrated into parent before parent can be considered complete
- Prevents orphaned branches
- Natural cleanup rhythm

### Archive Timing

**Archive immediately when branch is deleted** (after merge completes).

This creates conceptual coherence:

- Branch exists → Task list in `.arc/active/`
- Branch deleted → Task list archived to `.arc/reference/archive/`

**Why this timing:**

- Prevents accumulation (can't forget to archive)
- Enforces cleanup discipline
- Makes "active" meaningful (only work with live branches)

### Code Review at Every Merge

Review required at EVERY merge point (not just merge to main):

**Method 1 (Lightweight):** Local review only

```bash
coderabbit review local  # Before PR
# Fix findings, commit
gh pr create --base parent-branch --head child-branch
```

**Method 2 (Thorough):** Two-pass review

```bash
# Pass 1: Local review
coderabbit review local
# Fix findings, commit

# Pass 2: PR review
gh pr create --base parent-branch --head child-branch
# CodeRabbit reviews PR
# Address findings, merge
```

**Choose based on scope:**

- Lightweight: Small changes (<300 lines), low risk
- Thorough: Large changes, user-facing, planned work

### Industry Alignment

**✅ Aligned with industry-standard "stacked development":**

- Stacked PRs/diffs pattern (Meta, Google, Graphite, gh-stack)
- Branch-per-logical-unit matches modern workflows
- Conventional commit types still used (chore/refactor/fix/test/perf)
- Task tracking for work management

**Tools supporting this:**

- Plain git (start here - sufficient for solo dev)
- gh-stack (GitHub CLI extension for stacked PRs)
- Graphite (SaaS, overkill for solo projects)
- git-town (comprehensive but heavy)

**Recommendation:** Use plain git with helpful aliases. Avoid tooling complexity until needed.

### Handling Branch Updates

**If parent branch updates while working on child:**

```bash
# Option 1: Rebase (clean history)
git rebase parent-branch

# Option 2: Merge (preserve merge points)
git merge parent-branch
```

**Choose rebase for:** Simple changes, clean history desired
**Choose merge for:** Complex conflicts, want to preserve exact history

---

## Git Workflow

### Branch Naming Conventions

**Planned work gets branches:**

```
# User-facing features
feature/user-authentication
feature/data-export
feature/advanced-search

# Infrastructure improvements
technical/backend-modernization
technical/frontend-state-management
technical/testing-infrastructure
```

**Incidental work (gets branches if substantial):**

```
# Incidental work with task lists (>30min, multiple subtasks)
incidental/filter-integration-testing
incidental/pagination-buffer-tracking
incidental/theme-system-modernization
```

### Commit Message Patterns

**Feature/Technical work:**

```bash
feat(auth): add JWT token refresh endpoint
refactor(api): extract user service layer
test: add integration tests for authentication flow
docs: update API authentication guide
```

**Incidental work (with task reference):**

```bash
chore: enable strict TypeScript mode (tasks-chore-type-safety.md Task 1.1)
refactor: extract test helper utilities (tasks-refactor-test-helpers.md Task 2.3)
fix: correct CSRF middleware configuration (tasks-fix-csrf.md Task 1.2)
test: add coverage for edge cases (tasks-test-coverage.md Task 3.1)
```

**Benefits of task references:**

- Traceability to task documentation
- Context for future developers
- Links work to planning artifacts
- Can reconstruct work history

### Branch Workflow Example (Stacked Model)

```bash
# Start planned technical work
git checkout -b technical/service-layer-modernization
git commit -m "refactor: extract MovieService class"

# Discover testing gaps (substantial incidental work - needs task list)
git checkout -b incidental/filter-integration-testing
# Create: .arc/active/incidental/tasks-filter-integration-testing.md
git commit -m "test: add filter integration tests (tasks-filter-integration-testing.md Task 1.1)"

# Complete filter testing work
coderabbit review local  # Local review
gh pr create --base technical/service-layer-modernization --head incidental/filter-integration-testing
# Merge PR, delete branch
git checkout technical/service-layer-modernization
git branch -d incidental/filter-integration-testing
# Archive: git mv .arc/active/incidental/ → .arc/reference/archive/{quarter}/incidental/{NN}_{name}/

# Resume service layer work
git commit -m "refactor: complete MovieService extraction"

# When service layer complete, merge to main
gh pr create --base main --head technical/service-layer-modernization
# Merge PR, delete branch, archive task list
```

### Historical Note: Workflow Evolution

**Version History:**

- **v1.0 (2025-10 to 2025-11-09)**: Single long-lived branch model
    - Feature/technical branches lived for weeks/months
    - All incidental work committed to feature/technical branch (no separate branches)
    - Task lists accumulated in `.arc/active/` (not tied to branch lifecycle)
    - Led to branch name semantic mismatch and accumulation issues
    - Example: `technical/service-layer-modernization` branch contained 8 different logical work units

- **v2.0 (2025-11-10+)**: Stacked branch model (see ADR-013)
    - Each substantial task list gets its own branch (if >30min, multiple subtasks)
    - Branches merge depth-first (child → parent → main)
    - Archive when branch deleted (prevents accumulation)
    - Semantic clarity and natural cleanup discipline
    - Industry-aligned with "stacked development" pattern

**Branches created before 2025-11-10** may not follow stacked model. This is expected and documented
in their CURRENT-SESSION.md context. All new work uses v2.0 stacked model.

**If examining historical branches:**

- `technical/service-layer-modernization` contains 7+ nested incidental task lists (v1.0 model)
- Commit messages still follow conventional format with task references
- Use `git log --grep="tasks-{name}.md"` to filter commits by logical work unit
- See ADR-013 for full context on why the change was made

---

## Directory Structure

### Active Work Organization

**Planned work directories:**

```
.arc/active/
  feature/
    prd-user-authentication.md
    tasks-user-authentication.md
    notes-user-authentication.md
  technical/
    prd-backend-modernization.md
    tasks-backend-modernization.md
    notes-backend-modernization.md
```

**Incidental work directories:**

```
.arc/active/
  incidental/
    tasks-chore-type-safety.md
    notes-chore-type-safety.md (optional)
    completion-chore-type-safety.md (created before PR)
    tasks-refactor-auth-service.md
    completion-refactor-auth-service.md (created before PR)
    tasks-fix-csrf-middleware.md
    completion-fix-csrf-middleware.md (created before PR)
```

### Archive Organization

**When work completes, archive preserves structure with global sequence numbering:**

```
.arc/reference/archive/{quarter}/
  feature/
    01_user-authentication/
      prd-user-authentication.md
      tasks-user-authentication.md
      notes-user-authentication.md
      completion-user-authentication.md
  technical/
    02_backend-modernization/
      prd-backend-modernization.md
      tasks-backend-modernization.md
      notes-backend-modernization.md
      completion-backend-modernization.md
    05_api-layer-modernization/
      ...
  incidental/
    03_chore-type-safety/
      tasks-chore-type-safety.md
      notes-chore-type-safety.md
      completion-chore-type-safety.md
    04_refactor-auth-service/
      tasks-refactor-auth-service.md
      completion-refactor-auth-service.md
```

**Sequence numbering:**

- `{NN}_` prefix indicates completion order (global across all categories)
- Gaps within a category show where other categories' work completed
- Reset to 01 at start of each quarter
- See [archive-completed.md](../../workflows/supplemental/archive-completed.md) for full archival workflow

### Directory Alignment

**Planned work - Perfect alignment:**

- Branch: `technical/backend-modernization`
- PRD: `.arc/active/technical/prd-backend-modernization.md`
- Tasks: `.arc/active/technical/tasks-backend-modernization.md`
- Notes: `.arc/active/technical/notes-backend-modernization.md`

**Incidental work - Task-based alignment (with branches post-ADR-013):**

- Branch: `incidental/chore-type-safety` (if >30min, multiple subtasks)
- Tasks: `.arc/active/incidental/tasks-chore-type-safety.md`
- Notes: `.arc/active/incidental/notes-chore-type-safety.md` (optional)
- Completion: `.arc/active/incidental/completion-chore-type-safety.md` (created before PR)
- Archive: `.arc/reference/archive/{quarter}/incidental/{NN}_chore-type-safety/` (all files together)

---

## Implementation Examples

### Example 1: Feature Work - User Authentication

**Product vision requirement:** Users need to create accounts, log in, and reset passwords.

**Decision process:**

1. **Planned?** → Yes (in product roadmap)
2. **User-visible?** → Yes (users can authenticate)
3. **Category:** `feature/user-authentication`

**Implementation:**

```bash
# Create PRD and task list
mkdir -p .arc/active/feature
# Create prd-user-authentication.md
# Create tasks-user-authentication.md

# Create git branch
git checkout -b feature/user-authentication

# Work through tasks with feature commits
git commit -m "feat(auth): add user registration endpoint"
git commit -m "feat(auth): add login endpoint"
git commit -m "feat(auth): add password reset flow"

# Merge when complete
git checkout main
git merge feature/user-authentication
```

### Example 2: Technical Work - Type Safety Improvements

**Technical need:** Project has grown, type safety gaps causing bugs.

**Decision process:**

1. **Planned?** → Yes (PRD created after spike/research)
2. **User-visible?** → No (internal code quality)
3. **Category:** `technical/type-safety-improvements`

**Implementation:**

```bash
# Create PRD and task list
mkdir -p .arc/active/technical
# Create prd-type-safety-improvements.md
# Create tasks-type-safety-improvements.md

# Create git branch
git checkout -b technical/type-safety-improvements

# Work through tasks with technical commits
git commit -m "chore: enable TypeScript strict mode"
git commit -m "refactor: add type annotations to API layer"
git commit -m "test: add type safety integration tests"

# Merge when complete
git checkout main
git merge technical/type-safety-improvements
```

### Example 3: Incidental Work - CSRF Middleware Bug

**Discovery:** While testing authentication, discover CSRF token validation failing.

**Decision process:**

1. **Planned?** → No (discovered during feature work)
2. **Category:** `incidental/tasks-fix-csrf-middleware.md`

**Implementation:**

```bash
# Currently on feature/user-authentication branch

# Create incidental task list
# Create .arc/active/incidental/tasks-fix-csrf-middleware.md

# Fix the issue with conventional commit
git commit -m "fix: correct CSRF middleware configuration (tasks-fix-csrf-middleware.md Task 1.1)"
git commit -m "test: add CSRF protection tests (tasks-fix-csrf-middleware.md Task 2.1)"

# Resume feature work
git commit -m "feat(auth): complete login endpoint"
```

### Example 4: Incidental Work - Test Helper Extraction (Larger Scope)

**Discovery:** While writing tests, notice significant duplication across test files.

**Decision process:**

1. **Planned?** → No (discovered during test writing)
2. **Category:** `incidental/tasks-refactor-test-helpers.md` (even though 15 hours of work)

**Implementation:**

```bash
# Currently on technical/testing-infrastructure branch

# Create incidental task list (breaks down 15 hours into subtasks)
# Create .arc/active/incidental/tasks-refactor-test-helpers.md

# Work through refactoring with conventional commits
git commit -m "refactor: extract HTTP test helpers (tasks-refactor-test-helpers.md Task 1.1)"
git commit -m "refactor: create user factory helpers (tasks-refactor-test-helpers.md Task 1.2)"
git commit -m "refactor: consolidate mock factories (tasks-refactor-test-helpers.md Task 2.1)"
git commit -m "test: update tests to use shared helpers (tasks-refactor-test-helpers.md Task 3.1)"

# Resume technical work
git commit -m "test: add integration test coverage"
```

**Note:** Size doesn't determine category. This is 15 hours of work but still incidental because it was
discovered, not planned.

---

## Anti-Patterns

### ❌ Don't: Mix Category Types

**Problem:** Using "epic" or size-based categorization.

```
.arc/active/
  epic/              # ❌ Describes size, not type
  small-features/    # ❌ Describes size, not type
```

**Why it fails:**

- Subjective size assessment
- Doesn't align with git conventions
- Loses semantic meaning

**✅ Do:**

```
.arc/active/
  feature/           # ✓ User-facing capabilities
  technical/         # ✓ Infrastructure improvements
  incidental/        # ✓ Reactive quality work
```

### ❌ Don't: Create Branches for All Incidental Work

**Problem:** Creating git branches for every discovered issue.

```bash
git checkout -b fix/csrf-token-validation
git commit -m "fix: correct CSRF validation"
git checkout feature/user-authentication
git merge fix/csrf-token-validation

git checkout -b refactor/extract-test-helper
git commit -m "refactor: extract helper"
git checkout feature/user-authentication
git merge refactor/extract-test-helper

# Branch juggling overhead!
```

**Why it fails:**

- Branch management overhead
- Context switching costs
- Doesn't scale for cascading discoveries
- Slows velocity for solo developers

**✅ Do:**

```bash
# Stay on feature/user-authentication branch

# Create task list for traceability
# .arc/active/incidental/tasks-fix-csrf.md

git commit -m "fix: correct CSRF validation (tasks-fix-csrf.md Task 1.1)"

# Create task list for refactoring
# .arc/active/incidental/tasks-refactor-test-helpers.md

git commit -m "refactor: extract test helper (tasks-refactor-test-helpers.md Task 1.1)"

# Continue feature work
git commit -m "feat(auth): complete authentication flow"
```

### ❌ Don't: Use Redundant File Naming

**Problem:** Repeating "incidental" in filename.

```
incidental/tasks-type-safety.md  # ✅ Clean naming
incidental/notes-refactoring.md  # ✅ Clean naming
```

**Why it fails:**

- Redundant information
- Doesn't indicate work type
- Harder to filter/search

**✅ Do:**

```
incidental/tasks-chore-type-safety.md      # ✓ Clear work type
incidental/tasks-refactor-auth-service.md  # ✓ Conventional commit type
```

### ❌ Don't: Forget Task References in Commits

**Problem:** Incidental commits without task references.

```bash
git commit -m "fix: CSRF validation"  # ❌ No context
git commit -m "refactor: extract helper"  # ❌ No traceability
```

**Why it fails:**

- Lost context for future developers
- Can't reconstruct work history
- No link to planning artifacts

**✅ Do:**

```bash
git commit -m "fix: correct CSRF validation (tasks-fix-csrf.md Task 1.1)"  # ✓ Traceable
git commit -m "refactor: extract test helper (tasks-refactor-test-helpers.md Task 1.1)"  # ✓ Documented
```

### ❌ Don't: Mix Planned and Unplanned Workflows

**Problem:** Treating incidental work like planned work (creating PRDs, complex planning).

```
# ❌ Don't create PRDs for incidental work
.arc/active/incidental/prd-fix-csrf-token.md  # Overkill!

# ❌ Don't create extensive notes for simple fixes
.arc/active/incidental/notes-fix-typo.md  # 200-line document for typo
```

**Why it fails:**

- Overhead doesn't match work type
- Slows velocity
- Creates unnecessary artifacts

**✅ Do:**

```
# ✓ Task list only for incidental work
.arc/active/incidental/tasks-fix-csrf-token.md

# ✓ Notes only when needed for complex incidental
.arc/active/incidental/notes-chore-type-safety.md  # Optional, only if helpful
```

---

## Migration Guide

### Adopting This Strategy

**For new projects:**

1. Create directory structure upfront:

   ```bash
   mkdir -p .arc/active/{feature,technical,incidental}
   mkdir -p .arc/backlog
   mkdir -p .arc/archive
   ```

2. Document decision rules in DEVELOPMENT-RULES.md
3. Add commit message conventions to git hooks (optional)
4. Start using immediately

**For existing projects:**

1. **Complete current work** - Don't rename mid-flight
2. **Create new structure** - Add `technical/` directory alongside `feature/`
3. **Adopt going forward** - New work uses three-way split
4. **Update documentation** - DEVELOPMENT-RULES, workflow guides
5. **Migrate gradually** - Archive old work as-is, new work uses new structure

### Transition Example

**Current state:**

```
.arc/active/
  feature/  # Contains both user-facing AND technical work
  incidental/
```

**Transition steps:**

```bash
# 1. Complete current work
# (Finish current feature/X work, archive normally)

# 2. Create technical directory
mkdir -p .arc/active/technical

# 3. Move planned technical work
mv .arc/backlog/prd-backend-modernization.md .arc/active/technical/

# 4. Update documentation
# - Update DEVELOPMENT-RULES.md
# - Update workflow guides
# - Document decision rules

# 5. Adopt for new work
git checkout -b technical/backend-modernization  # New convention
```

### Updating Documentation

**DEVELOPMENT-RULES.md changes:**

```markdown
## Work Categorization

The ARC framework uses a three-way work categorization system:

- **feature/** - Planned user-facing capabilities
- **technical/** - Planned infrastructure improvements
- **incidental/** - Unplanned reactive quality work

See [Work Organization Strategy](strategies/strategy-work-organization.md) for decision rules.

## Git Branch Naming

- Planned work: `feature/<name>` or `technical/<name>`
- Incidental work: No separate branches (commits to feature/technical branch)
- Commit format: `<type>: <description> (<task-file> Task X.Y)`
```

**Workflow guide changes:**

Update `2_generate-tasks.md` to reflect:

- feature/ and technical/ get PRDs + task lists + branches
- incidental/ gets task lists only, no PRDs, no branches
- Document incidental commit message format

---

## Backlog Organization

**Context:** Per ADR-014, backlog uses GTD-inspired two-tier structure for work that hasn't started yet.

### Structure

```
backlog/
  TASK-INBOX.md              # Zero-friction capture (flat bullets, lean)
  ROADMAP.md                 # Sequencing strategy, order of operations
  feature/
    BACKLOG-FEATURE.md       # Feature ideas (sections, non-atomic work only)
    plan-*.md                # Work units under planning/analysis
    prd-*.md                 # Work units ready for tasks
  technical/
    BACKLOG-TECHNICAL.md     # Technical ideas (sections, non-atomic work only)
    plan-*.md                # Work units under planning/analysis
    prd-*.md                 # Work units ready for tasks

active/
  ATOMIC-TASKS.md            # Committed atomic tasks (checkboxes, ready to execute)
  CURRENT-SESSION.md         # Session state
  feature/
  technical/
  incidental/
```

### File Purposes

**TASK-INBOX.md** (backlog root):

- Unsorted captures, processed weekly → buckets/atomic/action
- Flat bullets (no checkboxes), kept lean

**ROADMAP.md** (backlog root):

- Internal planning artifact for sequencing strategy
- Documents order of operations (phases), dependency analysis, scoping decisions
- Subject to change as project evolves
- Referenced from PROJECT-STATUS.md for detailed planning context

**ATOMIC-TASKS.md** (active root):

- GTD "Next Actions" - small, one-off tasks ready to execute
- Checkbox format: "Active" and "Completed (This Week)" sections
- Completed items deleted during weekly review

**BACKLOG-FEATURE.md / BACKLOG-TECHNICAL.md**:

- Section-based organization (e.g., "User Auth", "API Integration")
- Plain bullets (no checkboxes)
- Non-atomic work only (atomic tasks go to ATOMIC-TASKS.md)
- Graduate to plan/PRD files when scope defined, then delete from bucket

**plan-*.md and prd-*.md**:

- Individual files for scoped work units
- plan: Planning/analysis phase, research (backlog only, deleted after PRD)
- prd: Ready for task generation

### Processing Flow

```
Capture → TASK-INBOX.md
  ↓ Weekly Review
  ├─ Atomic & ready? → active/ATOMIC-TASKS.md
  ├─ Quick (<5min)? → Do immediately
  ├─ Feature idea? → BACKLOG-FEATURE.md
  ├─ Technical idea? → BACKLOG-TECHNICAL.md
  └─ Uncertain? → Leave in inbox

Bucket files → plan-*.md (when scope clear) → prd-*.md (when ready, delete plan)
```

### Commit Context for Atomic Tasks

Work from ATOMIC-TASKS.md or emergent atomic work uses:

```
Context: maintenance (atomic / no associated task list)
Context: refactor (atomic / no associated task list)
Context: documentation (atomic / no associated task list)
Context: planning (atomic / no associated task list)
```

Boundary categories: maintenance, refactor, documentation, planning

**Rationale:** Atomic tasks aren't archived (deleted after completion), so no long-term traceability.
Commit message IS the record.

### Discovery Mechanism

"Have we thought about X?" → Check 3 places:

1. TASK-INBOX.md (unsorted captures)
2. BACKLOG-FEATURE.md or BACKLOG-TECHNICAL.md (sections)
3. plan-*.md or prd-*.md files (scoped work units)

No separate index needed.

### Weekly Review

Core workflow (15-30 minutes):

1. Process TASK-INBOX.md
2. Review ATOMIC-TASKS.md (delete completed, reprioritize)
3. Review bucket files (promote to notes/PRD when ready)
4. Update PROJECT-STATUS.md

See [weekly-review.md](../workflows/supplemental/weekly-review.md) for full workflow.

### Design Decisions

- **No frontend/backend split** - Only feature/ and technical/
- **No incidental/ in backlog** - Stacked workflow (ADR-013) means incidental stays active
- **Maturity markers TBD** - Optional tags like `[Exploring]`, `[Ready]` evaluated in practice

See ADR-014 for complete rationale and alternatives considered.

---

## Related Documentation

- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) - Development standards and git workflow
- [2_generate-tasks.md](../workflows/2_generate-tasks.md) - Task breakdown workflow
- [3_process-task-loop.md](../workflows/3_process-task-loop.md) - Task execution workflow
- [atomic-commit.md](../workflows/supplemental/atomic-commit.md) - Commit creation and review
- [manage-incidental-work.md](../workflows/supplemental/manage-incidental-work.md) - Incidental work workflow
- [weekly-review.md](../workflows/supplemental/weekly-review.md) - Weekly backlog review process
- [ADR-014](../adr/adr-014-backlog-organization-gtd-inspired.md) - Backlog organization decision record

---

**Document Status**: This strategy document is the authoritative reference for work categorization in ARC-based projects.
The three-way split (feature/technical/incidental) with hybrid incidental model represents battle-tested patterns
validated across multiple project contexts.
