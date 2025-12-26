# Tasks: Sync CineXplorer Refinements (2025-10-24)

## Context

Syncing battle-tested improvements from CineXplorer back to ARC framework. CineXplorer has been the primary
development project for several weeks, accumulating refinements to workflows, AI instructions, and constitutional
documents. This sync also includes structural changes (new directories/organization patterns) and 3 new comprehensive
strategy documents.

**Work Type**: Incidental (reactive maintenance - framework sync)
**Status**: COMPLETE

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

### Optional (Phase 6): CURRENT-SESSION Format Improvements ✅

Extract format/structure improvements (not temporal content):

- [x] 6.1 Review CURRENT-SESSION.md format differences
  - [x] 6.1.1 Read both versions (CineXplorer vs. Framework)
  - [x] 6.1.2 Identify format/structure improvements (session protocol, status sections)
  - [x] 6.1.3 Ignore temporal content (branch names, current work, blockers)
  - [x] 6.1.4 Document findings

- [x] 6.2 Apply format improvements to framework template
  - [x] 6.2.1 Update `.arc/active/CURRENT-SESSION.example.md` with format improvements (N/A - no improvements)
  - [x] 6.2.2 Keep framework version minimal/generic (template-appropriate) (N/A - no changes needed)
  - [x] 6.2.3 Lint and verify (N/A - no changes made)

**Completed**: Phase 6 analysis complete

**Findings**: CineXplorer's CURRENT-SESSION has evolved into a detailed, project-specific operational document with:
- Extensive Docker container verification steps (5 containers expected)
- Specific venv path checking and tool availability verification
- Detailed work history with commit hashes and file counts
- 173 lines of temporal content vs. framework's 78-line generic template

**Decision**: No changes made to framework template. CineXplorer's additions are all operational/temporal content specific to an active Django+React project. The framework's minimal, generic template remains more appropriate for adopters to customize.

**Structural observations**:
- Session Startup Protocol expanded from "read session-init.md" to detailed verification steps
- But those steps are runtime-environment-specific (Docker, venv tools, path verification)
- Framework correctly references session-init.md for protocol details (keeps CURRENT-SESSION lean)
- No format/structure improvements that apply to a documentation-only framework template

### Completion (Phase 7): Directory Structure Migration & Validation

- [x] 7.1 Migrate directory structure to work categorization pattern (both .arc/ and .arc-internal/)
  - [x] 7.1.1 Document current vs. new structure pattern (done in task list notes section)
  - [x] 7.1.2 Migrate `.arc/` template structure
    - [x] 7.1.2.1 Create `active/technical/` with .gitkeep
    - [x] 7.1.2.2 Create `upcoming/technical/` and `upcoming/feature/` with .gitkeep files
    - [x] 7.1.2.3 Migrate `reference/archive/` from doc-type to work-categorization
      - [x] Create `archive/technical/`, `archive/incidental/`, `archive/feature/` subdirs
      - [x] Move existing archived content (completion-sample.example.md → technical/)
      - [x] Add .gitkeep files to empty category dirs (incidental, feature)
      - [x] Update `archive/README.md` to explain new structure
      - [x] Remove old doc-type directories (completion-metadata/, notes/, prds/, tasks/)
    - [x] 7.1.2.4 Update `.arc/README.md` to document new directory structure
    - [x] 7.1.2.5 Remove old `upcoming/` structure (notes/, prds/, tasks/)
  - [x] 7.1.3 Migrate `.arc-internal/` framework structure
    - [x] 7.1.3.1 Create `active/technical/` directory
    - [x] 7.1.3.2 Create `upcoming/technical/` and `upcoming/feature/` directories
    - [x] 7.1.3.3 Migrate `reference/archive/` from doc-type to work-categorization
      - [x] Create `archive/technical/`, `archive/incidental/`, `archive/feature/` subdirs
      - [x] Move existing archived content (2 incidental task files)
      - [x] Update `archive/README.md` to explain new structure
      - [x] Remove old doc-type directories (completion-metadata/, notes/, sub-prds/, tasks/)
  - [x] 7.1.4 Update relevant workflows that reference directory paths
    - [x] Updated `atomic-commit.md` (upcoming/tasks → upcoming/feature and upcoming/technical)
    - [x] Updated `session-handoff.md` (upcoming/notes → active/feature for notes)
  - [x] 7.1.5 Lint and verify all changes (zero violations, 69 files checked)

**Completed**: Phase 7.1 directory structure migration complete

**Changes Made**:
- **`.arc/`**: Created technical/ subdirs in active/ and upcoming/, migrated archive to work-categorization
- **`.arc-internal/`**: Same structure migration, moved 2 archived incidental task files
- **Workflows**: Updated 2 workflow files with correct path references
- **Documentation**: Updated archive READMEs and main .arc/README.md

**Files Affected**:
- 3 new directories in .arc/active/ and .arc/upcoming/ (with .gitkeep)
- 3 new archive subdirs in .arc/reference/archive/ (with .gitkeep for empty)
- 3 new directories in .arc-internal/active/ and .arc-internal/upcoming/
- 3 new archive subdirs in .arc-internal/reference/archive/
- 2 README.md files updated (archive READMEs)
- 1 main README.md updated (.arc/README.md)
- 2 workflow files updated (atomic-commit.md, session-handoff.md)
- Old directory structures removed from both .arc/ and .arc-internal/

- [x] 7.2 Update framework-level documentation
  - [x] 7.2.1 Update main README.md if new capabilities added (N/A - no changes needed)
  - [x] 7.2.2 Update CHANGELOG.md with comprehensive sync summary
  - [x] 7.2.3 Update ADOPTION.md if workflow changes affect adoption process (N/A - no directory references)
  - [x] 7.2.4 Update TECHNICAL-ARCHITECTURE.md with new directory structure
  - [x] 7.2.5 Add .gitkeep files to .arc/active/feature/ and .arc/active/incidental/

**Completed**: Phase 7.2 framework documentation updates complete

**Changes Made**:
- **CHANGELOG.md**: Added comprehensive summary of all Phases 1-7 changes including directory migration
- **TECHNICAL-ARCHITECTURE.md**: Updated directory tree to show work-categorized structure
- **ADOPTION.md**: No changes needed (no directory-specific references found)
- **Main README.md**: No changes needed (references .arc/ generally, not specific subdirs)
- **Additional .gitkeep files**: Added to .arc/active/feature/ and .arc/active/incidental/ for consistency

**Files Modified**: 2 (CHANGELOG.md, TECHNICAL-ARCHITECTURE.md)
**Linting**: Zero violations (69 files checked)

- [x] 7.3 Final validation
  - [x] 7.3.1 Run full markdown lint on all changed files (zero violations, 69 files)
  - [x] 7.3.2 Verify all internal links resolve correctly (one stale path fixed in atomic-commit.md)
  - [x] 7.3.3 Check that all template placeholders are consistent (281 placeholders found, all valid)
  - [x] 7.3.4 Verify no CineXplorer-specific content leaked into templates (verified clean)
  - [x] 7.3.5 Review git status and diff stats

**Completed**: Phase 7.3 final validation complete

**Validation Results**:
- **Markdown linting**: ✅ Zero violations (69 files checked)
- **Internal links**: ✅ All links valid (fixed one stale upcoming/tasks/ reference)
- **Template placeholders**: ✅ 281 placeholders consistent across templates
- **CineXplorer content**: ✅ No project-specific content leaked (only in CHANGELOG and archived tasks)
- **Git status**: ✅ Clean changes ready for commit

**Change Summary** (18 files):
- **Modified**: 8 files (task list, 2 READMEs, TECHNICAL-ARCHITECTURE, 2 workflows, CHANGELOG)
- **Deleted**: 10 files (old structure directories and READMEs)
- **Created**: 10 new directories with .gitkeep files and content
- **Net change**: +270 lines, -444 lines (174-line reduction)

**Files ready for staging**:
- 8 modified markdown files
- 10 deleted old structure files
- 10 new untracked directories (need `git add`)

## Success Criteria

- [x] All identified improvements successfully synced from CineXplorer (Phases 0-7 complete)
- [x] No CineXplorer-specific content in framework templates (verified in Phase 7.3)
- [x] All template placeholders consistent and documented (281 placeholders verified)
- [x] Zero markdown linting violations across all changed files (69 files pass)
- [x] All cross-references verified and working (stale paths fixed)
- [x] Framework documentation updated to reflect new content (CHANGELOG, TECHNICAL-ARCHITECTURE)

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

### Directory Structure Pattern (from CineXplorer)

**New Pattern: Work Categorization Throughout Lifecycle**

**Active & Upcoming** (flat subdirs - typically one active item per category):
- `active/feature/` - Feature work documents
- `active/technical/` - Technical infrastructure work
- `active/incidental/` - Reactive maintenance work
- `upcoming/feature/` - Planned features
- `upcoming/technical/` - Planned technical work

**Archive** (work-categorized with work-level subdirs when multiple docs exist):
- `archive/feature/` - Completed feature work
- `archive/technical/` - Completed technical work
  - Single-doc items: `tasks-something.md` (flat in category)
  - Multi-doc items: `work-name/` subdir containing `prd-*.md`, `tasks-*.md`, `notes-*.md`, `completion-*.md`
- `archive/incidental/` - Completed incidental work
  - Same pattern: flat for single docs, subdirs for multi-doc work

**OLD Pattern (Framework Current): Doc-Type Categorization**
- `archive/completion-metadata/`
- `archive/notes/`
- `archive/prds/`
- `archive/tasks/` (with nested subdirs)

**Migration needed**: Framework archive/ still uses old doc-type pattern

---

**Created**: 2025-10-24
**Source Repository**: CineXplorer @ `/home/andrew/dev/CineXplorer/.arc/`
**Target Repository**: ARC Framework @ `/home/andrew/dev/arc-agentic-dev-framework/.arc/`
**Workflow Reference**: `.arc-internal/reference/workflows/supplemental/sync-cinexplorer-refinements.md`
