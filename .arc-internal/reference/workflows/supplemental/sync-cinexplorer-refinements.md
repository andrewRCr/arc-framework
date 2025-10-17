# Workflow: Sync CineXplorer Refinements

## Purpose

This workflow documents the process of syncing battle-tested improvements from the CineXplorer project's
`.arc/` documentation back to the ARC framework repository. CineXplorer serves as the real-world testing
ground where the ARC system is refined through actual development work.

## When to Run This Workflow

Run this sync workflow when:

- You've made refinements to CineXplorer's `.arc/` documentation during development work
- Before starting isolated framework work sessions (e.g., weekend framework development)
- When you notice CineXplorer's documentation has evolved significantly
- Before publishing framework updates or releases

**Pattern**: This is an "as-needed" workflow based on accumulation of refinements, not a strict schedule.
Frequency naturally adjusts based on CineXplorer development activity.

## Scope

### What to Sync (Include)

**Stable Documentation Only**:

- `.arc/reference/` directory and all non-archive subdirectories:
  - `constitution/` - Constitutional documents and templates
  - `workflows/` - Process documentation
  - `ai-instructions/` - AI collaboration guidance
  - `strategies/` - Strategy and pattern documents
- `.arc/active/CURRENT-SESSION.md` - **Format/structure changes only** (new stable sections, protocol additions)
  - ⚠️ **Not temporal content**: Ignore session-specific work details, branch names, current tasks
  - ⚠️ **Only sync structural improvements**: Session Startup Protocol, section organization, standard sections
  - Note: File is gitignored everywhere except `.example.md` version
- `.arc/README.md` - Directory overview (if improvements are generic)

### What NOT to Sync (Exclude)

**Instance-Specific Content**:

- `.arc/active/` - Current work in CineXplorer (except CURRENT-SESSION.md format improvements)
  - ⚠️ **CURRENT-SESSION.md exception**: Only sync structural/format changes, never temporal work details
- `.arc/upcoming/` - CineXplorer-specific planning
- `.arc/reference/archive/` - CineXplorer's completed work history
- `.arc-internal/` - CineXplorer's internal workspace

**Project-Specific Details**:

- Tech stack specifics (unless as examples with clear templating)
- Deployment configurations
- Project-specific naming conventions
- Business logic or domain knowledge
- Session-specific work details (branches, tasks, blockers, notes)

## Process

### 1. Preparation

**1.1 Create Dated Task List**

Create a task list for tracking this sync:

```bash
# Naming convention: tasks-chore-sync-cinexplorer-YYYY-MM-DD.md
# Location: .arc-internal/active/incidental/
```

**Example**: `tasks-chore-sync-cinexplorer-2025-10-17.md`

**1.2 Identify Changes**

Use the Explore agent to compare repositories:

```
Compare stable .arc/ documentation between:
- Source: /home/andrew/dev/CineXplorer/.arc/
- Target: /home/andrew/dev/arc-agentic-dev-framework/.arc/

Identify:
1. New files in CineXplorer
2. Modified files with improvements
3. Structural differences
4. Content depth differences
```

### 2. Analysis

**2.1 Review Findings**

Categorize identified changes:

- **Critical**: Files that block planned framework work
- **High-Value**: Significant improvements with broad applicability
- **Nice-to-Have**: Minor refinements or examples
- **Project-Specific**: Changes that don't generalize

**2.2 Prioritize**

Create phases in the task list:

- **Phase 1**: Critical blockers
- **Phase 2**: High-value additions
- **Phase 3**: Internal documentation
- **Phase 4**: Optional/future work

### 3. De-Instancing

**3.1 Identify Project-Specific Content**

Look for:

- Project names (CineXplorer → `{{PROJECT_NAME}}`)
- Absolute paths → Template placeholders
- Specific ports/URLs → Configurable placeholders
- Tech stack details → Generic descriptions or clearly marked examples
- Business domain terms → Generic equivalents

**3.2 Common De-Instancing Patterns**

| CineXplorer Content | Framework Template |
|---------------------|-------------------|
| `CineXplorer` | `{{PROJECT_NAME}}` |
| `/home/andrew/dev/CineXplorer/` | `{{REPO_ROOT}}/` |
| `8000` (backend port) | `{{BACKEND_PORT}}` |
| `5173` (frontend port) | `{{FRONTEND_PORT}}` |
| `8444` (proxy port) | `{{PROXY_PORT}}` |
| `infrastructure/docker-compose.yml` | `{{DOCKER_COMPOSE_PATH}}` |
| `.venv-backend/bin/` | `{{VENV_PATH}}/bin/` |
| Tech stack specifics | Generic + note "Example tech stack" |
| Django/React commands | Generic patterns + tech stack note |

**3.3 Preserve Value While Generalizing**

- **Keep concrete examples** where they illustrate concepts clearly
- **Add context notes** explaining example tech stacks
- **Maintain structure** from real usage (don't over-abstract)
- **Preserve battle-tested sequences** (command order matters)

### 4. File-by-File Sync

For each file in the task list:

**4.1 Read Source**

- Read CineXplorer version
- Understand improvements and their motivation
- Identify what makes this version better

**4.2 Transform**

- Apply de-instancing patterns
- Add template placeholders where needed
- Preserve structure and formatting
- Maintain concrete examples with context

**4.3 Place in Framework**

Determine target location:

- `.arc/reference/` - Template/example content for adopters
- `.arc-internal/reference/` - Framework-specific internal docs

**Naming conventions**:

- `.example.md` suffix for template files in `.arc/`
- No suffix for actual workflow/reference docs
- Consider lean variants (e.g., `AI-SHARED-LEAN.example.md`)

**4.4 Update Cross-References**

- Add new files to README files in their directories
- Update workflow docs that reference the new content
- Verify internal links work in framework repo context

**4.5 Quality Check**

```bash
# Lint the specific file
npx --yes markdownlint-cli path/to/new-file.md

# Fix any violations immediately
```

### 5. Validation

**5.1 Cross-Reference Check**

- All internal links resolve correctly
- Template placeholders are consistent
- No CineXplorer-specific content leaked through

**5.2 Quality Gates**

```bash
# Lint all modified/new files
npx --yes markdownlint-cli *.md .arc/**/*.md .arc-internal/**/*.md

# Review all changes
git status
git --no-pager diff --stat
```

**5.3 Documentation Updates**

Check if these need updates:

- `README.md` - New capabilities or files
- `ADOPTION.md` - Workflow changes
- `CHANGELOG.md` - Document sync and key additions
- Directory READMEs - Reference new files

### 6. Commit Preparation

**6.1 Review Changes**

```bash
git status
git --no-pager diff
```

**6.2 Stage Changes**

Stage related files together (e.g., all Phase 1 files):

```bash
git add .arc/reference/QUICK-REFERENCE.example.md
git add .arc-internal/reference/QUICK-REFERENCE.md
git add .arc/reference/constitution/DEVELOPMENT-RULES.example.md  # If updated
```

**6.3 Commit Message Planning**

Use conventional commits format:

```
chore(sync): sync {description} from CineXplorer

- Add/update file 1
- Add/update file 2
- Key improvements/changes

Synced from CineXplorer (2025-10-17)
Closes tasks-chore-sync-cinexplorer-2025-10-17.md Phase N
```

**6.4 Await User Approval**

AI **NEVER** commits without explicit user approval. Present:

- Summary of changes
- Files affected
- Proposed commit message
- Any concerns or decisions needed

## Tips & Best Practices

### Start Small

- Sync critical blockers first (Phase 1)
- Commit phases separately for atomic history
- Don't batch unrelated improvements

### Preserve Real-World Structure

- If CineXplorer's structure works, keep it in templates
- Real usage beats theoretical organization
- Battle-tested sequences matter (especially commands)

### Document Rationale

- In task notes, capture why improvements matter
- Note what problem the refinement solved
- This context helps future framework work

### Maintain Two Versions Where Useful

Some files benefit from multiple variants:

- **Template version**: Heavy guidance for first-time users
- **Lean version**: Streamlined for experienced users
- Example: `AI-SHARED.example.md` vs `AI-SHARED-LEAN.example.md`

### Watch for Emerging Patterns

During sync, note:

- Files that change frequently (still evolving)
- Files that stabilize (good template candidates)
- New file types that emerge (signals missing framework components)
- Repeated de-instancing patterns (consider framework abstractions)

## Success Criteria

- [ ] All identified improvements successfully synced
- [ ] No CineXplorer-specific content in templates
- [ ] All template placeholders consistent and documented
- [ ] Zero markdown linting violations
- [ ] All cross-references verified
- [ ] Framework documentation updated
- [ ] Task list marked complete
- [ ] Changes committed with clear history

## Related Workflows

- `archive-completed.md` - Archival preparation (similar maintenance patterns)
- `maintain-task-notes.md` - Content organization principles apply
- `session-handoff.md` - Context preservation across sync sessions
