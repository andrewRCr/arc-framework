# Workflow: Sync Framework Updates to Adopting Project

## Purpose

This workflow documents the process of syncing consolidated ARC framework improvements from the arc-agentic-dev-framework
repository to this project. This ensures the project benefits from battle-tested refinements and framework enhancements
developed across all ARC-adopting projects.

## When to Run This Workflow

Run this sync workflow when:

- Starting work on a project (arc-portfolio, TaskFocus) after time away
- After completing a CineXplorer sync that brought in significant refinements
- After isolated framework improvements in this repo
- When you notice an adopting project's `.arc/` documentation is outdated
- Before starting significant new work in an adopting project

**Pattern**: Run at session start for adopting projects to ensure they have latest framework improvements.

## Sync Direction Flow

Understanding the three-tier sync pattern:

```
CineXplorer (primary) ──sync-cinexplorer-refinements.md──> ARC Framework
                                                                    │
                                                                    │ sync-with-arc-framework.md
                                                                    │ (this workflow)
                                                                    ▼
                                                            This Project
                                                            (arc-portfolio, TaskFocus, etc.)
```

## Scope

### What to Sync (Include)

**Framework Template Documents**:

- `.arc/reference/` directory improvements:
    - `constitution/` - Constitutional documents and standards
    - `workflows/` - Process documentation
    - `agent/` - AI collaboration guidance
    - `strategies/` - Strategy and pattern documents
- `.arc/active/CURRENT-SESSION.md` - **Format/structure improvements only**
    - Session Startup Protocol updates
    - Section organization improvements
    - Standard section additions
- `.arc/README.md` - Directory overview improvements

**Framework Version References**:

- Track which framework commit/date the project was last synced from
- Document in project's `.arc/sync-history.md` (if it exists)

### What NOT to Sync (Preserve)

**Project-Specific Customizations**:

- Project-specific sections in constitutional documents
- Custom workflows unique to that project
- Project-specific strategy documents
- Tech stack configurations
- Environment-specific details

**Active Work**:

- Current `.arc/active/` content (except format improvements to CURRENT-SESSION.md)
- `.arc/backlog/` planning specific to that project
- `.arc/reference/archive/` completed work history
- `.arc-internal/` framework-project-specific workspace

**Principle**: Adopt framework improvements while preserving project adaptations.

## Process

### 1. Preparation

**1.1 Verify Current Location**

```bash
pwd
# Should show the ADOPTING project directory, not arc-agentic-dev-framework
# Example: /home/andrew/dev/arc-portfolio
```

**1.2 Check Project Git Status**

```bash
git status
# Ensure clean working tree before sync
# Commit or stash any in-progress work
```

**1.3 Document Framework Version**

Note the current framework state you're syncing FROM:

```bash
# In arc-agentic-dev-framework repo
cd ~/dev/arc-agentic-dev-framework
git log --oneline -1
# Note commit hash and date
```

**1.4 Create Sync Task List (Optional)**

For significant syncs, create a task list in the adopting project:

```bash
# In adopting project
# Location: .arc-internal/active/incidental/
# Naming: tasks-sync-arc-framework-YYYY-MM-DD.md
```

### 2. Analysis

**2.1 Identify Framework Changes**

Compare framework repo state with project state:

```bash
# Quick file comparison
diff -qr ~/dev/arc-agentic-dev-framework/.arc/reference/ \
        .arc/reference/ | head -20

# Or use AI Explore agent:
# "Compare .arc/reference/ between framework repo and this project"
```

**2.2 Categorize Changes**

Identify:

- **New files**: Added to framework since last sync
- **Updated files**: Structural or content improvements
- **Deleted files**: Consolidated or deprecated in framework
- **Renamed files**: Better organization patterns

**2.3 Check for Conflicts**

Look for areas where project has custom adaptations:

- Project-specific sections in constitutional docs
- Custom workflow additions
- Modified command patterns for tech stack
- Strategy documents created for this project

**Strategy**: Merge framework improvements while preserving custom sections.

### 3. File-by-File Sync

For each file to sync:

**3.1 Read Framework Version**

```bash
# Read from framework repo
cat ~/dev/arc-agentic-dev-framework/.arc/reference/workflows/some-file.md
```

**3.2 Read Project Version**

```bash
# Read from current project
cat .arc/reference/workflows/some-file.md
```

**3.3 Identify Custom Content**

Mark sections that are project-specific:

- Project name references (not just placeholders)
- Custom workflows added by you for this project
- Tech stack specific commands or patterns
- Project-specific examples

**3.4 Merge Strategy**

Choose approach based on customization level:

**Scenario A: No Custom Content**

- Replace entire file with framework version
- Simplest and cleanest approach

**Scenario B: Minor Custom Sections**

- Copy framework version
- Re-add custom sections marked clearly
- Add comments noting custom additions

**Scenario C: Heavy Customization**

- Keep project version
- Manually merge specific framework improvements
- Document what was NOT synced and why

**3.5 Apply Updates**

Update the file in the adopting project:

```bash
# Direct replacement (Scenario A)
cp ~/dev/arc-agentic-dev-framework/.arc/reference/workflows/some-file.md \
   .arc/reference/workflows/some-file.md

# Or manual merge for custom content (Scenarios B/C)
# Use editor or AI assistance
```

**3.6 Quality Check**

```bash
# Lint the specific file
npx --yes markdownlint-cli .arc/reference/workflows/some-file.md

# Fix any violations immediately
```

### 4. Special Cases

**4.1 CURRENT-SESSION.md Format Updates**

Only sync structural improvements:

- Session Startup Protocol additions
- New standard sections
- Section organization improvements

Preserve all current work content:

- Current branch and tasks
- Session notes and blockers
- Project-specific context

**4.2 Constitutional Documents**

Common pattern for META-PRD, DEVELOPMENT-RULES, etc.:

1. Check if project has custom sections (often at end)
2. Sync framework improvements to standard sections
3. Preserve custom sections
4. Add clear markers between framework and custom content

**4.3 AI Instructions**

Update AGENTS.md references and core guidance, but preserve:

- Project-specific tech stack details
- Custom quality gate commands
- Project-specific paths and conventions

**4.4 New Framework Files**

When framework has new files not in project:

1. Copy new file directly
2. Check if it needs any project-specific adaptation
3. Update project's directory READMEs to reference it
4. Verify cross-references work in project context

### 5. Validation

**5.1 Cross-Reference Check**

```bash
# Verify internal links still work
# Check from adopting project directory
grep -r "\.md)" .arc/reference/ | grep -v "http"
# Manually verify key links
```

**5.2 Quality Gates**

```bash
# Lint all synced files
npx --yes markdownlint-cli .arc/**/*.md .arc-internal/**/*.md

# Review changes
git status
git --no-pager diff --stat
```

**5.3 Customization Check**

Verify preserved content:

- Project-specific sections still present
- Custom workflows intact
- Tech stack commands appropriate
- No framework placeholders where project values should be

**5.4 Sanity Check Active Work**

Ensure active work wasn't affected:

```bash
# Check CURRENT-SESSION.md still has current work
cat .arc/active/CURRENT-SESSION.md | grep -A 5 "Session Information"

# Verify active tasks unchanged (unless you wanted to update them)
ls -la .arc/active/
```

### 6. Documentation

**6.1 Update Sync History**

If project maintains sync history:

```bash
# Add entry to .arc/sync-history.md (if exists)
echo "## Sync $(date +%Y-%m-%d)" >> .arc/sync-history.md
echo "" >> .arc/sync-history.md
echo "- Framework commit: [commit hash]" >> .arc/sync-history.md
echo "- Files synced: [list key files]" >> .arc/sync-history.md
echo "- Custom content preserved: [note any custom sections]" >> .arc/sync-history.md
```

**6.2 Update Project Documentation**

If sync brought significant changes, note in:

- Project's CHANGELOG (if maintained)
- CURRENT-SESSION.md notes section (framework sync completed)

### 7. Commit

**7.1 Review Changes**

```bash
git status
git --no-pager diff
```

**7.2 Stage Changes**

```bash
# Stage all .arc/ changes if comprehensive sync
git add .arc/

# Or stage selectively
git add .arc/reference/workflows/
git add .arc/reference/constitution/DEVELOPMENT-RULES.example.md
```

**7.3 Commit Message**

Use conventional commits format:

```bash
git commit -m "chore(arc): sync framework updates from arc-agentic-dev-framework

- Update workflows: [list key workflows]
- Update constitution: [list key docs]
- Sync from framework commit [hash] (2025-10-17)
- Preserve project-specific customizations in [files]"
```

**7.4 Verify Commit**

```bash
git show --stat
# Verify only intended files changed
# Verify active work files NOT changed (unless intentional)
```

## Tips & Best Practices

### Start with Constitutional Documents

Sync foundation documents first:

1. DEVELOPMENT-RULES
2. META-PRD (if framework-based)
3. TECHNICAL-ARCHITECTURE
4. PROJECT-STATUS

Then workflows, strategies, and AI instructions.

### Preserve Project Identity

Framework improvements should enhance, not erase, project-specific adaptations:

- Keep project-specific examples that work well
- Preserve custom workflows that solve project-unique problems
- Maintain tech stack specific commands
- Don't over-genericize what works

### Mark Custom Sections Clearly

When merging custom content back into framework-based docs:

```markdown
<!-- PROJECT-SPECIFIC: Custom section below -->

## Custom Workflow for This Project

...

<!-- END PROJECT-SPECIFIC -->
```

This makes future syncs easier to identify what to preserve.

### Sync Incrementally

Don't sync everything at once if framework has diverged significantly:

- Start with critical constitutional documents
- Then core workflows
- Then supplemental workflows
- Finally strategies and examples

Commit in phases for clear history.

### Track What Wasn't Synced

In CURRENT-SESSION.md or sync history, note:

- Files skipped due to heavy customization
- Framework features not applicable to this project
- Areas where project approach differs intentionally

This helps future syncs understand deliberate divergences.

### Test After Sync

If project has quality gates, run them:

```bash
# Project-specific examples
npm run lint        # If project has code
npm test            # If project has tests
# etc.
```

Ensure framework doc updates didn't break project-specific references.

## Success Criteria

- [ ] All relevant framework improvements synced to project
- [ ] Project-specific customizations preserved
- [ ] Zero markdown linting violations
- [ ] All cross-references work in project context
- [ ] Active work content intact and current
- [ ] Quality gates pass (if applicable)
- [ ] Sync documented (commit message or sync history)
- [ ] Project ready for continued development

## Related Workflows

- `sync-cinexplorer-refinements.md` - Opposite direction (project → framework)
- `session-init.md` - Often run after sync to resume project work
- `session-handoff.md` - Context preservation principles apply
- `atomic-commit.md` - Commit strategy for sync changes

---

**Note**: This workflow assumes the adopting project follows ARC framework structure. For projects with
significant deviations, adapt the process to match their organizational patterns while preserving the core
sync principles.
