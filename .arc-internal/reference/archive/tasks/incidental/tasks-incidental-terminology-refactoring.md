# Incidental Task List: Terminology Refactoring

**Status**: Complete
**Triggered by**: Framework clarity improvement during structural migration
**Branched from**: Main framework development (post-migration)
**Discovery Context**: Identified during discussion of sub-prd vs prd terminology clarity

## Overview

Major terminology and organizational refactoring to improve framework professionalism and clarity.
Changes "sub-prd" to "prd" throughout, adds constitutional workflow, and reorganizes supplemental workflows.

## Task Breakdown

### 1. Create Constitutional Workflow

**Status**: [x] Complete

**Objective**: Create 0-define-constitution.md workflow for project setup

**Subtasks**:

- [x] 1.1 Draft workflow content with initial/maintenance sections
- [x] 1.2 Include META-PRD, PROJECT-STATUS, TECHNICAL-ARCHITECTURE, DEVELOPMENT-RULES guidance
- [x] 1.3 Test workflow structure and clarity
- [x] 1.4 Add to workflows directory

**Acceptance Criteria**:

- New workflow guides both initial project setup and ongoing constitutional maintenance
- Clear distinction from feature-level PRD creation
- Integrates with existing constitutional document templates

---

### 2. Rename Core Workflow

**Status**: [x] Complete

**Objective**: Rename 1-create-sub-prd.md to 1-create-prd.md and update content

**Subtasks**:

- [x] 2.1 Rename workflow file
- [x] 2.2 Update internal content references from "sub-prd" to "prd"
- [x] 2.3 Clarify distinction from META-PRD creation
- [x] 2.4 Update workflow title and descriptions

**Acceptance Criteria**:

- Workflow clearly focused on feature-level PRDs
- No confusion with META-PRD creation process
- All internal terminology consistent

---

### 3. Update Directory Structure

**Status**: [x] Complete

**Objective**: Rename sub-prds directories to prds and update references

**Subtasks**:

- [x] 3.1 Rename .arc/upcoming/sub-prds/ to .arc/upcoming/prds/
- [x] 3.2 Update .arc-internal active directory references
- [x] 3.3 Update archive directory structure
- [x] 3.4 Update example filenames and prefixes

**Acceptance Criteria**:

- All directory names use "prds" terminology
- File naming conventions updated consistently
- Archive structure matches new terminology

---

### 4. Reorganize Supplemental Workflows

**Status**: [x] Complete

**Objective**: Move non-numbered workflows to supplemental/ subdirectory

**Subtasks**:

- [x] 4.1 Create .arc/reference/workflows/supplemental/ directory
- [x] 4.2 Move non-core workflows: manage-incidental-work, session-handoff, agent-pr-review, atomic-commit, archive-completed
- [x] 4.3 Update all path references to supplemental workflows
- [x] 4.4 Update workflow cross-references

**Acceptance Criteria**:

- Core workflows (0-1-2-3) remain in workflows/ root
- Supplemental workflows grouped in supplemental/ subdirectory
- All references updated to new paths

---

### 5. Update Documentation and References

**Status**: [x] Complete

**Objective**: Update all documentation, examples, and references

**Subtasks**:

- [x] 5.1 Update main README.md references
- [x] 5.2 Update ADOPTION.md paths and terminology
- [x] 5.3 Update .arc and .arc-internal README files
- [x] 5.4 Update CI workflow paths
- [x] 5.5 Update internal documentation cross-references
- [x] 5.6 Update example file references

**Acceptance Criteria**:

- All documentation uses "prd" terminology consistently
- All workflow path references updated
- Examples reflect new structure and terminology

---

## Relevant Files

**Will be created**:

- `.arc/reference/workflows/0-define-constitution.md`
- `.arc/reference/workflows/supplemental/` directory

**Will be modified**:

- `.arc/reference/workflows/1-create-sub-prd.md` → `1-create-prd.md`
- Directory structure (.arc/upcoming/sub-prds/ → prds/)
- `README.md`, `ADOPTION.md`, `.arc/README.md`, `.arc-internal/README.md`
- `.github/workflows/ci.yml`
- Various example and template files

**Dependencies**: None (all prerequisite structural work completed)

## Notes

- This work builds on successful structural migration completed earlier
- Focus on maintaining functionality while improving terminology clarity
- Each subtask should be atomic and committable independently
- Testing should verify all references are updated and functional
