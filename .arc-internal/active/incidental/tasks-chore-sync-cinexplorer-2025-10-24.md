# Tasks: Sync CineXplorer Refinements (2025-10-24)

## Context

Syncing battle-tested improvements from CineXplorer back to ARC framework. CineXplorer has been the primary
development project for several weeks, accumulating refinements to workflows, AI instructions, and constitutional
documents. This sync also includes structural changes (new directories/organization patterns) and 3 new comprehensive
strategy documents.

**Work Type**: Incidental (reactive maintenance - framework sync)

**Source**: `/home/andrew/dev/CineXplorer/.arc/`
**Target**: `/home/andrew/dev/arc-agentic-dev-framework/.arc/`

**Scope Summary**:

- 15+ files with refinements (2-13 days ahead of framework)
- 3 new strategy documents (authentication, testing, type-safety)
- QUICK-REFERENCE.md pattern adoption
- maintain-docs.md workflow addition
- Structural improvements to various workflows

## Relevant Files

### New Files to Sync (CineXplorer)

- `.arc/reference/QUICK-REFERENCE.md` (339 lines)
- `.arc/reference/workflows/supplemental/maintain-docs.md` (181 lines)

### Modified Files to Sync (CineXplorer Ahead)

**Core Workflows**:

- `workflows/1-create-prd.md` (11 days newer)
- `workflows/2-generate-tasks.md` (13 days newer)

**Supplemental Workflows**:

- `workflows/supplemental/session-init.md` (5 days newer)
- `workflows/supplemental/atomic-commit.md` (10 days newer)
- `workflows/supplemental/manage-incidental-work.md` (5 days newer)
- `workflows/supplemental/maintain-task-notes.md` (4 days newer)
- `workflows/supplemental/archive-completed.md` (4 days newer)
- `workflows/supplemental/session-handoff.md` (2 days newer)

**AI Instructions**:

- `ai-instructions/AGENTS.md` (7 days newer)
- `ai-instructions/CLAUDE.md` (3 days newer)
- `ai-instructions/GEMINI.md` (2 days newer)
- `ai-instructions/WARP.md` (5 days newer)
- `ai-instructions/copilot-instructions.md` (2 days newer)

**Constitutional Documents**:

- `constitution/DEVELOPMENT-RULES.md` (7 days newer)
- `constitution/META-PRD.md` (9 days newer)
- `constitution/PROJECT-STATUS.md` (11 days newer)
- `constitution/TECHNICAL-ARCHITECTURE.md` (10 days newer)
- `constitution/README.md` (9 days newer)

**Active Templates**:

- `active/CURRENT-SESSION.md` - Format/structure improvements only (not temporal content)

### Framework Files (Do Not Overwrite - Framework Ahead)

- `workflows/0-define-constitution.md` (framework 4 days newer)
- `workflows/3-process-task-loop.md` (framework is latest)
- `workflows/supplemental/agent-pr-review.md` (framework has generic version)

## Analysis & Prioritization

### Critical (Phase 0): Foundation Work ✅

- [x] 0.1 Examine structural changes in CineXplorer .arc/ organization
  - [x] 0.1.1 Document any new directory patterns or reorganization
  - [x] 0.1.2 Identify if framework should adopt structural changes
  - [x] 0.1.3 Note any differences in .example.md patterns or naming conventions
  - [x] 0.1.4 Document findings for use in subsequent phases

**Status**: Complete - Findings documented in `notes-sync-phase0-findings.md`

### High Priority (Phase 1): New Strategic Content ✅

These are battle-tested, comprehensive documents that don't exist in framework:

- [x] 1.1 Sync QUICK-REFERENCE.md pattern (339 lines)
  - [x] 1.1.1 Read CineXplorer version and understand command patterns structure
  - [x] 1.1.2 Transform: Django+React specifics → generic web app template (already exists, updated)
  - [x] 1.1.3 Update `.arc/reference/QUICK-REFERENCE.example.md` (added markdown linting improvements)
  - [x] 1.1.4 Update cross-references to maintain-docs.md
  - [x] 1.1.5 Update `.arc-internal/reference/QUICK-REFERENCE.md` with improvements
  - [x] 1.1.6 Lint and verify quality (zero violations)

- [x] 1.2 Sync maintain-docs.md workflow (181 lines)
  - [x] 1.2.1 Read CineXplorer version
  - [x] 1.2.2 De-instance any project-specific references (already generic)
  - [x] 1.2.3 Place in `.arc/reference/workflows/supplemental/maintain-docs.md`
  - [x] 1.2.4 Update cross-references in QUICK-REFERENCE files
  - [x] 1.2.5 Lint and verify quality (zero violations)

**Status**: Complete
**Files modified**: 2 (QUICK-REFERENCE.example.md, QUICK-REFERENCE.md)
**Files created**: 1 (maintain-docs.md)
**Key improvements**:

- Added `--no-globs` flag guidance for markdown linting (prevents workspace-wide processing)
- Version bumped to 1.1 for template
- Documentation maintenance workflow now available

### High Priority (Phase 2): Core Workflow Refinements ✅

These are the most-used workflows with 11-13 days of battle-testing:

- [x] 2.1 Sync 1-create-prd.md improvements (11 days newer)
  - [x] 2.1.1 Read both versions and identify improvements
  - [x] 2.1.2 Replaced wholesale (no de-instancing needed)
  - [x] 2.1.3 Update `.arc/reference/workflows/1-create-prd.md`
  - [x] 2.1.4 Lint and verify quality (zero violations)

- [x] 2.2 Sync 2-generate-tasks.md improvements (13 days newer)
  - [x] 2.2.1 Read both versions and identify improvements
  - [x] 2.2.2 Replaced wholesale (no de-instancing needed)
  - [x] 2.2.3 Update `.arc/reference/workflows/2-generate-tasks.md`
  - [x] 2.2.4 Lint and verify quality (zero violations)

- [x] 2.3 Sync 3-process-task-loop.md improvements (13 days newer - UPDATED THIS MORNING)
  - [x] 2.3.1 Read both versions and identify improvements
  - [x] 2.3.2 Replaced wholesale (no de-instancing needed)
  - [x] 2.3.3 Update `.arc/reference/workflows/3-process-task-loop.md`
  - [x] 2.3.4 Lint and verify quality (zero violations)

**Status**: Complete
**Files modified**: 3 (1-create-prd.md, 2-generate-tasks.md, 3-process-task-loop.md)
**Key improvements**:

- **1-create-prd.md**: Work categorization (Feature vs Technical), notes-first pattern, updated paths
- **2-generate-tasks.md**: Cleaner structure, work categorization support, removed obsolete sections
- **3-process-task-loop.md**: Pre-report checklists, task description streamlining guidance, TodoWrite best practices

**Note**: 3-process-task-loop.md discovered during Phase 0 - Explore agent incorrectly identified it as up-to-date

### Medium Priority (Phase 3): Supplemental Workflow Refinements ✅

Recent improvements (2-10 days) to supporting workflows:

- [x] 3.1 Sync session-init.md improvements (5 days newer)
- [x] 3.2 Sync atomic-commit.md improvements (10 days newer, 189 lines)
- [x] 3.3 Sync manage-incidental-work.md improvements (5 days newer)
- [x] 3.4 Sync maintain-task-notes.md improvements (4 days newer)
- [x] 3.5 Sync archive-completed.md improvements (4 days newer)
- [x] 3.6 Sync session-handoff.md improvements (2 days newer)
- [x] 3.7 Sync agent-pre-merge-review.md (NEW, 598 lines - replaces agent-pr-review.md)

**Additional work completed in this phase:**

- [x] 3.8 Migrate to markdownlint-cli2 configuration
    - [x] Created `.markdownlint-cli2.jsonc` matching CineXplorer config (4-space indent, 120 line length)
    - [x] Updated DEVELOPMENT-RULES.md to reference markdownlint-cli2
    - [x] Updated QUICK-REFERENCE.md command patterns
    - [x] Updated CI configuration (.github/workflows/ci.yml)
    - [x] Removed old `.markdownlint.json`
    - [x] Fixed indentation in existing files to pass new linting rules
    - [x] Verified all markdown files pass linting (zero violations)

**Key improvements synced:**

- **atomic-commit.md**: Enhanced task context analysis, milestone completion guidance, feature branch practices
- **manage-incidental-work.md**: Streamlined workflow, clearer decision criteria
- **maintain-task-notes.md**: Enhanced notes patterns
- **archive-completed.md**: Improved archival patterns
- **session-handoff.md**: Path context verification improvements
- **agent-pre-merge-review.md**: Two-mode support (local + PR), comprehensive review workflow

### Medium Priority (Phase 4): AI Instructions Refinements ✅

Recent improvements (4-6 days) to AI collaboration guidance:

- [x] 4.1 Sync AGENTS.md improvements (6 days newer)
- [x] 4.2 Sync CLAUDE.md improvements (4 days newer)
- [x] 4.3 Sync GEMINI.md improvements (4 days newer)
- [x] 4.4 Sync WARP.md improvements (4 days newer)
- [x] 4.5 Sync copilot-instructions.md improvements (4 days newer)

**Key improvements synced:**

- **AGENTS.md**: Added "One subtask at a time" and "Manual commit control" to AI Collaboration Principles
- **AGENTS.md**: Added "Initialize session" workflow reference
- **All files**: Removed HTML comment scaffolding for cleaner production use
- **All files**: Updated version references (v0.2.0-dev with hash for DEVELOPMENT-RULES)
- **CLAUDE.md**: Adapted for documentation-only framework (no Docker/venv, markdown linting only)
- **Tool-specific files**: Streamlined, removed verbose template guidance

**Approach taken:**

- `.arc/reference/*.example.md`: Added structural improvements while keeping {{PLACEHOLDERS}} and guidance comments
- `.arc-internal/reference/*.md`: Copied CineXplorer's clean versions and adapted for framework-specific context

### Lower Priority (Phase 5): Constitutional Document Refinements ✅

Used CineXplorer's streamlined structure as source of truth, de-instanced for templates:

- [x] 5.1 Review constitutional document improvements
  - [x] 5.1.1 Compare DEVELOPMENT-RULES.md versions (7 days newer)
  - [x] 5.1.2 Compare META-PRD.md versions (9 days newer)
  - [x] 5.1.3 Compare PROJECT-STATUS.md versions (11 days newer)
  - [x] 5.1.4 Compare TECHNICAL-ARCHITECTURE.md versions (10 days newer)
  - [x] 5.1.5 Compare constitution/README.md versions (not present in either)
  - [x] 5.1.6 Document structural improvements vs. project-specific content

- [x] 5.2 Extract and apply structural improvements
  - [x] 5.2.1 Apply DEVELOPMENT-RULES.md structural improvements to `.arc/reference/constitution/DEVELOPMENT-RULES.example.md`
  - [x] 5.2.2 Apply META-PRD.md structural improvements to example template
  - [x] 5.2.3 Apply PROJECT-STATUS.md structural improvements to example template
  - [x] 5.2.4 Apply TECHNICAL-ARCHITECTURE.md structural improvements to example template
  - [x] 5.2.5 Update constitution/README.md if needed (N/A - doesn't exist)

**Approach**: Used battle-tested CineXplorer structure, removed project-specific content, kept HTML comment guidance for adopters
**Result**: Streamlined templates (558 total lines vs 1083 original - 48% reduction) with cleaner structure
**Linting**: All 74 markdown files pass with zero violations

### Optional (Phase 6): CURRENT-SESSION Format Improvements

Extract format/structure improvements (not temporal content):

- [ ] 6.1 Review CURRENT-SESSION.md format differences
  - [ ] 6.1.1 Read both versions (CineXplorer vs. Framework)
  - [ ] 6.1.2 Identify format/structure improvements (session protocol, status sections)
  - [ ] 6.1.3 Ignore temporal content (branch names, current work, blockers)
  - [ ] 6.1.4 Document findings

- [ ] 6.2 Apply format improvements to framework template
  - [ ] 6.2.1 Update `.arc/active/CURRENT-SESSION.example.md` with format improvements
  - [ ] 6.2.2 Keep framework version minimal/generic (template-appropriate)
  - [ ] 6.2.3 Lint and verify

### Completion (Phase 7): Documentation & Validation

- [ ] 7.1 Update framework-level documentation
  - [ ] 7.1.1 Update main README.md if new capabilities added
  - [ ] 7.1.2 Update CHANGELOG.md with sync summary
  - [ ] 7.1.3 Update ADOPTION.md if workflow changes affect adoption process
  - [ ] 7.1.4 Update `.arc/README.example.md` if structure changed

- [ ] 7.2 Final validation
  - [ ] 7.2.1 Run full markdown lint on all changed files
  - [ ] 7.2.2 Verify all internal links resolve correctly
  - [ ] 7.2.3 Check that all template placeholders are consistent
  - [ ] 7.2.4 Verify no CineXplorer-specific content leaked into templates
  - [ ] 7.2.5 Review git status and diff stats

## Success Criteria

- [ ] All identified improvements successfully synced from CineXplorer
- [ ] No CineXplorer-specific content in framework templates
- [ ] All template placeholders consistent and documented
- [ ] Zero markdown linting violations across all changed files
- [ ] All cross-references verified and working
- [ ] Framework documentation updated to reflect new content
- [ ] All changes committed in atomic, well-described commits
- [ ] Task list archived with completion metadata

## Notes

### De-Instancing Patterns to Watch For

| CineXplorer Content | Framework Template |
|---------------------|-------------------|
| `CineXplorer` | `{{PROJECT_NAME}}` |
| `/home/andrew/dev/CineXplorer/` | `{{REPO_ROOT}}/` |
| `infrastructure/docker-compose.yml` | `{{DOCKER_COMPOSE_PATH}}` |
| `.venv-backend/bin/` | `{{VENV_PATH}}/bin/` |
| Django/React/pytest specifics | Generic patterns with "Example tech stack" notes |
| `8000`, `5173`, `8444` (ports) | `{{BACKEND_PORT}}`, `{{FRONTEND_PORT}}`, `{{PROXY_PORT}}` |

### Workflow Approach

- Work one phase at a time (Phase 0 → Phase 7)
- Complete all subtasks in a phase before committing
- Await user approval before each commit
- Use atomic commits (one phase per commit for clarity)
- Run markdown linting after each file edit
- Preserve battle-tested structure and command sequences

---

**Created**: 2025-10-24
**Source Repository**: CineXplorer @ `/home/andrew/dev/CineXplorer/.arc/`
**Target Repository**: ARC Framework @ `/home/andrew/dev/arc-agentic-dev-framework/.arc/`
**Workflow Reference**: `.arc-internal/reference/workflows/supplemental/sync-cinexplorer-refinements.md`
