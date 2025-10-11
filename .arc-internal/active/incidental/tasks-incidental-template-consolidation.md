# Incidental Task List: Template System Consolidation

**Status**: Pending
**Triggered by**: Framework default rules integration + template system simplification  
**Branched from**: Main framework development (post-terminology refactoring)
**Discovery Context**: Identified dual-template system complexity during framework defaults integration

## Overview

Major consolidation of the dual-template system to create unified template-first documents that include
framework defaults without dummy data. Eliminates `/templates/` directory and token replacement complexity
in favor of simple copy-adapt workflow.

## Task Breakdown

### 1. Analyze Current Dual System

**Status**: [ ] Pending

**Objective**: Document current template vs example file relationships and identify consolidation approach

**Subtasks**:

- [ ] 1.1 Catalog all files in `/templates/` directory
- [ ] 1.2 Catalog all `.example.md` files in `.arc/` structure  
- [ ] 1.3 Identify which templates/examples need framework defaults integration
- [ ] 1.4 Plan consolidation strategy for each file type

**Acceptance Criteria**:

- Complete mapping of dual-template system
- Clear consolidation plan for each document type
- Framework defaults integration strategy documented

---

### 2. Create Template-First Constitutional Documents

**Status**: [ ] Pending

**Objective**: Convert constitutional document templates to rich template-first format with framework defaults

**Subtasks**:

- [ ] 2.1 Create template-first DEVELOPMENT-RULES with framework defaults
- [ ] 2.2 Create template-first AI-SHARED with framework protocols
- [ ] 2.3 Create template-first META-PRD with structure guidance
- [ ] 2.4 Create template-first PROJECT-STATUS with structure guidance
- [ ] 2.5 Create template-first TECHNICAL-ARCHITECTURE with structure guidance

**Acceptance Criteria**:

- All constitutional templates include battle-tested framework defaults
- Clear guidance for customization without dummy data
- Template-first structure with inline documentation

---

### 3. Create Template-First Workflow Documents

**Status**: [ ] Pending

**Objective**: Convert workflow document templates to unified template-first format

**Subtasks**:

- [ ] 3.1 Create template-first CURRENT-SESSION with structure guidance
- [ ] 3.2 Create template-first PRD template with structure guidance  
- [ ] 3.3 Create template-first tasks template with structure guidance
- [ ] 3.4 Update workflow documents to reference new template locations

**Acceptance Criteria**:

- All workflow templates are self-contained and copy-ready
- Clear structure with population guidance
- No external template dependencies

---

### 4. Eliminate Legacy Template System

**Status**: [ ] Pending

**Objective**: Remove `/templates/` directory and token replacement system

**Subtasks**:

- [ ] 4.1 Verify all template content has been migrated to unified documents
- [ ] 4.2 Remove `/templates/` directory entirely
- [ ] 4.3 Update documentation references to template system
- [ ] 4.4 Remove any NPX/token replacement references from documentation

**Acceptance Criteria**:

- `/templates/` directory completely removed
- All references to dual-template system updated
- Documentation reflects new unified approach

---

### 5. Update Framework Documentation

**Status**: [ ] Pending

**Objective**: Update all framework documentation to reflect unified template-first approach

**Subtasks**:

- [ ] 5.1 Update main README.md to describe unified template approach
- [ ] 5.2 Update ADOPTION.md with new copy-adapt workflow
- [ ] 5.3 Update .arc/README.md to reflect new template locations
- [ ] 5.4 Update workflow documentation with new template references

**Acceptance Criteria**:

- All documentation describes unified template-first approach
- Copy-adapt workflow clearly explained
- No references to eliminated dual-template system

---

## Relevant Files

**Will be created**:

- Rich template-first documents in `.arc/` structure replacing `.example.md` files

**Will be modified**:

- All constitutional document `.example.md` files → rich template-first versions
- All workflow document references to template system
- `README.md`, `ADOPTION.md`, framework documentation
- Workflow documents that reference template locations

**Will be removed**:

- Entire `/templates/` directory
- Token replacement system references
- Profile system references (deferred for now)

**Dependencies**: Framework defaults analysis (completed)

## Notes

- Focus on template-first approach with framework defaults, not dummy examples
- Keep customization guidance concise and inline
- Maintain ARC methodology compatibility throughout
- Simplify adoption workflow to copy-rename-adapt pattern
- This consolidation will significantly improve framework usability and maintainability
