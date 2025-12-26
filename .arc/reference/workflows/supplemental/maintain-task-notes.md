# Workflow: Maintain Task & Notes Hygiene

Use this workflow when an active task list has accumulated historical notes or when the companion notes document
needs pruning. **Execute this workflow before archiving completed work** to ensure files are reference-ready.

**Goal:** Remove unambiguous temporal noise from task file while preserving the detailed historical record.
Evaluate notes file for archival worthiness. The task list's value is showing the journey - substantive content
stays even if verbose; the completion doc provides the scannable summary.

## When to Use This Workflow

**Two distinct usage modes:**

### Mode 1: Mid-Work Cleanup (Steps 1-4, 6-7)

**Goal:** Keep task file lean for daily session loading

**Use when:**

- Task list has accumulated verbose inline explanations (>100 lines of context blocks)
- After major investigations that added detailed decision rationale to task file
- After task list restructuring (inserted/renumbered tasks → stale references, out-of-order content)
- Task file is hard to scan quickly during session startup

**What happens:**

- ✅ Fix stale task number references from restructuring
- ✅ Reorder content to match current task numbering (both task file and notes file)
- ✅ Clean up task file (migrate verbose blocks to notes file)
- ✅ Add migrated content to notes file
- ❌ **DO NOT clean up notes file itself** (it's not loaded every session)
- ❌ **DO NOT prepare notes file for archival** (work is still in progress)

### Mode 2: Archival Preparation (All steps including 5)

**Goal:** Prepare both files for long-term reference and archival

**Use when:**

- Task list is 100% complete (all checkboxes marked)
- Ready to prepare work for PR and archival
- Preparing documentation for future reference

**Timing:** After all work complete, BEFORE creating PR. Documentation cleanup commits to child branch
and becomes part of the work deliverable.

**What happens:**

- ✅ Remove temporal noise from task file (grep-based, not content judgment)
- ✅ Evaluate notes file (keep for archival or delete if scratchpad)
- ✅ **If keeping notes:** Clean up notes file (TOC, headers, remove temporal markers)
- ✅ Collect completion doc data during cleanup (for large files)
- ✅ Prepare files for archival

## Inputs

- Path to the task list (e.g., `.arc/active/incidental/tasks-*.md`)
- Path to the related notes file (e.g., `.arc/active/incidental/notes-*.md`)
- Current project rules: [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md)

## Checklist

### 1. Confirm Pairing and Status

**Step 1a: Verify Pairing**

- Verify both files refer to each other and cover the same scope
- Check cross-references are accurate

**Step 1b: Verify Completion Status (Mode 2 Only)**

- **CRITICAL FIRST CHECK**: Scan entire task list to verify ALL checkboxes are marked `[x]`
- If any unchecked tasks found → STOP - Use Mode 1 instead (mid-work cleanup)
- Only proceed with Mode 2 if 100% tasks complete

**Step 1c: Update Status Metadata**

- Update `**Status**:` field in task file header:
    - Change from "IN PROGRESS" to "COMPLETE"
    - Remove any temporal notes (e.g., "~90% complete, ~5-8 hours remaining", "Paused", "Resume at")
    - Update to reflect final state
    - Note: Task list pointers ("Interrupts:", "Spawned:") are evaluated separately per pointer directionality guidance
- Add/update `**Completed**:` date in both files (YYYY-MM-DD format)
- Note: All work (feature/technical/incidental) uses separate `completion-{name}.md` document
  (created in archive-completed workflow Phase 1, Step 3)

**Step 1d: Evaluate Notes File Disposition (Mode 2 Only)**

**CRITICAL DECISION**: Not all notes files are worth archiving. Evaluate the notes file content:

**✅ Keep & Clean** (proceed to Steps 3-5):

- Contains archival-worthy research (design system investigations, library evaluations)
- Documents architectural decisions and design rationale NOT already captured in ADRs
- Preserves investigation journeys with future reference value
- Research findings that could be extracted into dedicated research docs
- Deep-dive implementation details worth preserving

**❌ Delete Entirely** (skip Steps 3-5, delete file in Step 6):

- Scratchpad/journey notes created during work with no archival value
- Temporary context only relevant during implementation
- Work notes already captured in task file completion details
- No research, architectural decisions, or reusable patterns
- Content already captured in ADRs or strategy documents

**ADR and Strategy Document Consideration:**

Before deciding to keep notes, check if content is already captured elsewhere:

- **ADRs** (`.arc/reference/adr/`) - Architectural decisions with context
- **Strategy docs** (`.arc/reference/strategies/`) - Domain guidance and patterns

**Decision criteria:**

1. Is this content already in an ADR or strategy doc? → Delete notes file
2. SHOULD this content be in an ADR or strategy doc? → If yes, it's probably important enough to preserve
   (consider extraction during archival)
3. Not important enough for ADR/strategy? → Probably not worth preserving unless unique research/investigation value

**If deleting notes file:**

- Check pointer directionality per guidance above (remove forward pointers to archived task lists)
- Keep backward pointers (active task lists where work will resume - use backticks with filename only)
- Delete notes file reference from task file header in Step 6
- Archival subdirectory still created (tasks + completion = 2 files minimum with unified completion docs)
- Proceed directly to creating completion-{name}.md in archive-completed workflow

**Rule of thumb:** Ask "Would I reference this 6 months from now, and is it not already in ADRs/strategies?" If no → delete.

**Understanding Pointer Directionality:**

Task file headers may contain pointers to other task lists. Understanding which to keep vs remove:

- **Backward pointer (KEEP):** Where work resumes AFTER completing this task list
    - Example: `**Interrupts:** tasks-discover-endpoint-consolidation.md` = "Resume that work when done here"
    - Pattern: Shows what was paused/interrupted to do this work
    - Keep if: Referenced task list still exists in `.arc/active/` (work will resume there)

- **Forward pointer (REMOVE at archival):** Child task lists spawned FROM this work
    - Example: `**Spawned:** tasks-csrf-fixes.md` = "Created this as subtask during our work"
    - Pattern: Shows work that branched off from this task list
    - Remove if: Spawned task list is archived in `.arc/reference/archive/` (already complete)

**Simple decision criteria:** Check file location

- Task list in `.arc/active/` → **KEEP pointer** (work ongoing or will resume)
- Task list in `.arc/reference/archive/` → **REMOVE pointer** (work complete, historical)

**Standard pointer labels:**

- **Backward (preferred: `Interrupts:`)**: Shows what task list/task was paused to do this work
    - Other acceptable: `Paused:`, `Resumes at:`, `Returns to:`
- **Forward (preferred: `Paused To:`)**: Shows what work interrupted this task list
    - Other acceptable: `Spawned:`, `Created:`, `Branched to:`

**Note:** `Interrupts:` goes in the child task list's Context section. `Paused To:` goes in the parent task list's header.

**Step 1e: Assess File Size & Select Strategy (Mode 2 Only)**

**Check file size:**

```bash
wc -l tasks-*.md
```

**Strategy selection:**

- **Small (<1000 lines):** Single-pass review - Steps 2-7 proceed normally
- **Large (≥1000 lines):** Phase-by-phase review with progress tracking

**For large files, create progress tracking file:**

Create: `.arc/active/{category}/CLEANUP-PROGRESS-{name}.md`

```markdown
# Cleanup Progress: {name}

## Phase Checklist

- [ ] Phase 1 (lines X-Y): {Brief description}
- [ ] Phase 2 (lines Y-Z): {Brief description}
[...for each phase...]

## Completion Doc Data (Collected During Cleanup)

### Phase 1
- Key deliverables: [Note as you process]
- Metrics: [Files created, components migrated, etc.]

### Phase 2
[...etc...]

## Issues Found & Fixed

- Phase X, line Y: [Issue description] → [Fix applied]
```

**Why progress tracking:** Large task lists may require multiple sessions. CLEANUP-PROGRESS tracks which
phases are done, collects completion doc metrics incrementally, and provides clear resume points.

### 2. Inventory Open Work

- Note whether task list is complete (all checkboxes marked) or in-progress
- **If in-progress: List remaining unchecked tasks and identify what context they need**
    - What decisions, patterns, or constraints do Tasks 7-10 depend on?
    - What implementation notes from Tasks 1-6 guide future work?
- Review completed task notes through the lens of "Do remaining tasks need this?"
- Identify verbose content AROUND tasks (not the task lines themselves)
- Flag sections labeled "Notes", "Implementation Notes", "Decision Log", "Context"
- **Remember:** Task lines (checkbox + description + outcome) are historical records - never modify them
- **Key distinction:** Keep what remaining work needs (regardless of length); migrate historical explanations
  that don't inform future tasks

### 2a. Fix Stale References and Reorder Content

**This step catches issues from task list restructuring** (inserted tasks, renumbered tasks, reordered sections)

**Check for stale task number references:**

- Use current task list (i.e., the actual checklist) numbers as source of truth
- Search task file for notes content patterns like "(Task 7)", "Task 7:", "Tasks 7-9", "Task 7.x"
- Verify each reference points to the correct current task, as per the actual task list structure
- Update references that became stale after restructuring
- Common locations: "Implementation Notes", similar sections (at the bottom of the task list doc), inline notes

**Check content ordering in task file:**

- **"Implementation Notes" section:** Ensure subsections appear in current task number order
    - Example: "Task 7" notes should appear before "Task 8" notes
    - If out of order (due to restructuring), move entire subsection blocks to correct position
    - Don't rewrite content - just reorder the blocks
- **"Task List Coordination" section:** Verify task references follow current numbering
- **Other sections:** Flag any task number references and verify accuracy

**Check content ordering in notes file** (if applicable):

- Scan for section headers with task numbers
- Ensure sections appear in ascending task number order
- Reorder if needed (move blocks, don't rewrite)

**Common restructuring scenarios:**

- **Inserted retroactive tasks** (7a, 7.1a between 7 and 8) → Old references to "Task 7" might now mean "Task 8"
- **Split tasks** → Single old reference now spans multiple task numbers
- **Merged tasks** → Multiple old references now point to single task
- **Reordered sections** → Task 8 notes appearing before Task 7 notes

**Fix pattern for stale references:**

```markdown
<!-- BEFORE (stale after inserting Task 7a-7c) -->
**Manual E2E Validation** (Task 7) - Critical Path Only:

<!-- AFTER (updated to current numbering) -->
**Manual E2E Validation** (Task 8) - Critical Path Only:
```

**Fix pattern for out-of-order content:**

```markdown
<!-- BEFORE (Task 8 notes appear before Task 7 notes) -->
## Implementation Notes

### Task 8: Manual E2E Validation
[notes about E2E]

### Task 7: Minimal Watchlist Implementation
[notes about watchlist]

<!-- AFTER (correct order) -->
## Implementation Notes

### Task 7: Minimal Watchlist Implementation
[notes about watchlist]

### Task 8: Manual E2E Validation
[notes about E2E]
```

**Why this matters:** Stale references and out-of-order content make the file confusing to scan. When someone
reads "Task 7" in notes but sees "Task 8" is actually the watchlist work, it breaks flow and wastes time.

### 3. Clean Up Task File

**⚠️ CRITICAL: Task lines are historical records - NEVER modify task descriptions or outcomes.**

**What is a "task line"?**

The line with the checkbox documenting what was done:

```markdown
- [x] 4.3.3 Consider adding alert threshold (multiple reuse attempts = attack) - DEFERRED to observability sprint
```

This includes:

- Checkbox and task number
- Full original task description (as it was written when created)
- Inline outcome notes appended to the line

**These document what actually happened - they must stay verbatim.**

---

**Archival Mode vs Mid-Work Mode - Critical Distinction**

**Mode 1 (Mid-Work Cleanup):**

- **Goal**: Keep task file lean while work continues
- **Decision Criteria**: "Do remaining tasks need this context?"
- **What stays**: Top-matter context, task list, bottom-matter notes relevant to remaining work
- **What migrates**: Historical explanations with no future dependencies

**Mode 2 (Archival Preparation - ALL WORK COMPLETE):**

- **Goal**: Clean task file for archival (remove temporal junk, repetition) while maintaining detailed
  sub-task granularity
- **Decision Criteria**: "Is this temporal scaffolding or permanent record?"
- **Task file remains**: Detailed sub-task level record with inline outcomes (length is fine - can be 500+ lines)
- **What gets removed**: Temporal markers ("pending", "blocked", "status notes"), excessive inline context blocks
  only relevant during implementation, clear repetition

**Archival Task File Structure (Mode 2 only):**

```markdown
# Task File (Detailed Work Record)

## Top-Matter (KEEP - concise context)
- Metadata (Created, Completed, Status, Branch, Base Branch)
- Context (1-3 paragraphs: why this work, what triggered it, discovery context)
- Backward pointers ONLY (`Interrupts:` - where work resumes, use backticks with filename only)
- Scope & Boundaries (what's in/out of scope)

## Task List (KEEP - complete detailed record)
- [x] All task checkboxes with inline outcomes
- [x] Sub-task granularity preserved (detailed record of work done)
- Length is NOT a concern - task files can be 500-3000+ lines
- Preserves WHAT was done at detailed level

**What NO LONGER exists in modern task files:**
- ❌ Forward pointers ("Interrupted by", spawned task lists) - remove these, they're complete
- ❌ Temporal status notes ("Paused", "Resume at", dates)
- ❌ Bottom-matter sections (Implementation Notes, Coordination, etc.) - old pattern
- ❌ Completion Summary section - now in separate completion-{name}.md file
```

**The Three-Tier System:**

- **Completion doc** (completion-{name}.md, 2-3 min read): Executive summary - "What was achieved?" (outcomes and metrics)
- **Task file** (tasks-{name}.md, detailed record): Complete sub-task level documentation - "What was done?" (can be long)
- **Notes file** (notes-{name}.md, IF kept): Deep-dive archival reference - "How/why decisions, investigation
  journeys" (optional - evaluate for archival worthiness)

---

**Decision Criteria: Relevance to Remaining Work (Mode 1 Only)**

**⚠️ IN ARCHIVAL MODE (Mode 2), SKIP TO "ARCHIVAL MODE MIGRATION" BELOW**

Before migrating any content during mid-work cleanup, ask these questions:

**1. Does remaining work need this context?**

- If YES → Keep in task file (even if verbose)
- If NO → Migrate to notes file

**2. Is this explaining completed work or guiding future work?**

- Explaining completed work (historical) → Migrate
- Guiding future work (active context) → Keep

**3. Would someone picking up *any* remaining uncompleted tasks (in this task list) need this information?**

- Yes → Keep (add reference in task description if needed)
- No → Migrate

**Rule of thumb:**

- Completed work with no future dependencies → **Migrate** (regardless of length)
- Completed work that informs remaining tasks → **Keep** (even if verbose)
- When in doubt about relevance → **Keep** (you can always migrate later)

**Examples:**

```markdown
<!-- KEEP (relevant to remaining Tasks 7-9, even though verbose) -->
- [x] 6.5 Implement auth fallback
    **IMPORTANT for Tasks 7-9:** All endpoints must check secondary auth after primary.
    Authentication order: Primary → API Key → Session (Priority 3).
    See test_auth.py for pattern. All future endpoints must follow this.
    [Additional 10 lines of implementation guidance...]

<!-- MIGRATE (historical, no future dependencies) -->
- [x] 3.4 Debug token issue - RESOLVED
    **Root Cause:** Header missing in form.submit() due to browser security
    **Solution:** Switched to fetch() API with explicit headers
    **Investigation:** Tried 5 different approaches... [15 lines of debugging journey]
    **Result:** Working, 0 regressions, all tests pass
```

**The key question:** "Will someone working on Tasks 7-10 need this context daily?"

---

**What to Keep:**

- ✅ **All task lines exactly as written** (checkboxes, descriptions, inline outcome notes)
- ✅ Task structure and hierarchy (parent tasks, subtasks, indentation)
- ✅ **Context needed by remaining uncompleted tasks** (even if verbose)
- ✅ **Implementation patterns/constraints guiding future work** (critical reference)
- ✅ **Active decisions affecting ongoing tasks** (keep until those tasks complete)

**What to Migrate to Notes File:**

- ❌ **Historical explanations with no future dependencies** (even if brief)
- ❌ **Completed work details not needed for remaining tasks** (regardless of length)
- ❌ Debugging journeys that led to current solution (historical record)
- ❌ Investigation details for closed decisions (no longer relevant)
- ❌ "Why we chose X over Y" rationale (unless affects remaining tasks)
- ❌ "References" / "Active References" sections (no longer needed after completion)
- ❌ Multi-paragraph "Context" sections explaining background for completed work

**Examples:**

```markdown
<!-- BEFORE CLEANUP -->
- [x] 4.3.3 Consider adding alert threshold (multiple reuse attempts = attack) - **DEFERRED to observability sprint**
    - **Decision:** Defer automatic alert thresholds to future observability sprint
    - **Rationale:** Current WARNING logs provide full audit trail for security team.
      Alert thresholds should be designed holistically with broader observability strategy
      to avoid alert fatigue and ensure actionable notifications.
    - **Trade-off:** Relies on manual log review vs automated alerts
    - **Future work:** Include in observability sprint planning (Q2 2025)

<!-- AFTER CLEANUP -->
- [x] 4.3.3 Consider adding alert threshold (multiple reuse attempts = attack) - DEFERRED to observability sprint (see notes: Alert Threshold Decision)

<!-- MIGRATED TO NOTES FILE -->
## Alert Threshold Decision (Task 4.3.3)

**Decision:** Defer automatic alert thresholds to future observability sprint

**Rationale:** Current WARNING logs provide full audit trail for security team...
[full detail preserved in notes file]
```

**Key principle:** The task line shows WHAT was done. The notes file explains WHY and HOW in detail.

---

**Archival Mode Cleanup (Mode 2 Only)**

**⚠️ When all tasks are complete, remove temporal noise while preserving the historical record.**

**What this is NOT:**

- Not a content reduction exercise
- Not making the task list "scannable" (completion doc does that)
- Not removing "verbose" completion notes or research summaries
- Not requiring judgment on "is this too detailed?"

**What this IS:**

- Removing markers that only made sense during active work
- Fixing references to deleted files
- Cleaning up forward-looking language in completed tasks

**For large files (≥1000 lines):** Process phase-by-phase, updating CLEANUP-PROGRESS as you go.

---

**⚠️ TWO-STEP CLEANUP: Structure First, Then Fine-Grained**

Archival cleanup has two distinct steps that MUST be done in order:

1. **Structure evaluation** - Identify and handle entire sections (top-matter/bottom-matter)
2. **Fine-grained cleanup** - Grep for inline temporal markers within kept sections

Do NOT skip to grep patterns - section-level evaluation catches the biggest issues.

---

**STEP 1: Section-Level Evaluation (MANDATORY FIRST)**

Evaluate entire sections before diving into line-by-line cleanup. Sections are either kept, removed,
or migrated - this is where the biggest cleanup decisions happen.

**Top-Matter Sections to REMOVE:**

- [ ] **"Why Now"** - Urgency rationale irrelevant after completion
- [ ] **"Root Cause Analysis"** - Temporal analysis explaining why work started (not what was done)
- [ ] **"Will Do" with checkmarks** - Redundant with actual task completions (scope without checkmarks OK)
- [ ] **"Research Completed" summaries** - **VERIFY** content exists in strategy doc before removing
- [ ] **"Critical Questions"** - Historical scaffolding once all answered

**Bottom-Matter Sections to REMOVE:**

- [ ] **"Notes" section** - Often contains stale snapshots, test counts, temporal state
- [ ] **"Research References"** - **VERIFY** in strategy docs before removing, or confirm not reusable
- [ ] **"Implementation Notes"** - Old pattern, now captured in task completions
- [ ] **"Completion Summary"** - Now in separate completion-{name}.md
- [ ] **"Task List Coordination"** - Old pattern
- [ ] **"Decision Logs"** - **VERIFY** captured in ADRs or strategy docs before removing

**Top-Matter Sections to KEEP:**

- Header metadata (Created, Completed, Branch, Base Branch, Status)
- Brief context (Discovered, `Interrupts:` pointer)
- Problem statement (what was fixed - brief historical context)
- "Won't Do" scope exclusions (useful record of deliberate decisions)

**Bottom-Matter Sections to KEEP:**

- "Success Criteria" - Verification checklist of outcomes (complements completion doc's executive summary)

**Research/Decision Content - Verification Required:**

Before removing any research summaries, decision logs, or reference sections:

1. **Identify the target location** - Which strategy doc or ADR should contain this?
2. **Grep to verify** - `grep -i "key-term" path/to/strategy.md`
3. **If not found**: Either migrate content to appropriate doc, or keep in task file
4. **If found**: Safe to remove from task file

Never assume content is captured elsewhere - verify before removal.

**Evaluation criteria:** For each section ask: "Is this temporal scaffolding, OR have I verified this content
exists elsewhere?" Only remove if yes to either.

---

**What to KEEP (even if long):**

- ✅ **All task lines verbatim** (checkbox + description + outcome)
- ✅ **Research summaries** - That's what the task accomplished
- ✅ **Detailed completion notes** - Historical record of work done
- ✅ **Decision rationale** - Why choices were made
- ✅ **Implementation findings** - What was discovered
- ✅ **Quality gate results** - Proof work was done
- ✅ **Backward pointers** - Active task lists where work will resume

**Rationale:** The task list's value is showing the journey. A 60-line research summary IS the record of what
that task accomplished. Don't try to make the task list scannable - that's the completion doc's job.

---

**STEP 2: Fine-Grained Cleanup (Grep Patterns)**

After section-level evaluation, use grep to find inline temporal markers within kept sections:

```bash
# 1. Next Steps references (meaningless after completion)
grep -in "next step\|next:\|**next" tasks-*.md

# 2. Temporal status markers
grep -in "status:.*complete\|status:.*pending\|status:.*blocked\|status:.*[0-9]/[0-9]" tasks-*.md

# 3. Resume/Continue markers
grep -in "resume at\|continue with\|pick up at\|blocked on" tasks-*.md

# 4. References to deleted notes file (if notes file was deleted)
grep -in "notes-.*\.md" tasks-*.md

# 5. Inline subtask completion dates (header date is fine, subtask dates are noise)
grep -in "\*\*completed:\*\*.*202[0-9]" tasks-*.md

# 6. Forward pointers to archived task lists
grep -in "spawned:\|created:.*tasks-\|interrupted by:" tasks-*.md
# Check if referenced file is in archive (use find, not ls with globs)
find .arc/reference/archive -name "tasks-<filename>.md"
# If found in archive → remove pointer (completed work)
# If not found → check .arc/active/ (keep pointer if work ongoing)
```

**For each match:**

1. Read context around the match
2. Verify it's temporal noise, not substantive content
3. Remove the specific marker/line
4. Note in CLEANUP-PROGRESS (for large files): "Phase X, line Y: removed [description]"

---

**Collect Completion Doc Data (Large Files)**

While processing each phase, note in CLEANUP-PROGRESS:

- Key deliverables (files created, components migrated, features implemented)
- Quantitative metrics (counts of things)
- Follow-up work mentioned (check if completed in later phases)

This data feeds completion doc creation and prevents needing to re-read the entire file.

### 4. Migrate Content to Notes File

**This is APPEND-ONLY - do not clean up or reorganize the notes file itself.**

- Create "Historical Implementation Details" section near bottom of notes file (if it doesn't exist)

- Add migrated content under descriptive headings with dates (e.g., "Alert Threshold Decision (Task 4.3.3, 2025-10-13)")
- Preserve full detail (this is the "messy reference" - don't edit or summarize)
- Add brief context line at top of each migrated section
- **DO NOT reorganize, clean up, or edit existing notes file content** (only do this during archival prep)

**Remember:** If task list is in-progress, notes file cleanup happens later during archival. For now, just
append migrated content.

### 5. Prepare Notes File for Archival

**⚠️ ARCHIVAL PREP ONLY - Skip this entire step if task list is in-progress.**

**This step is ONLY for Mode 2 (Archival Preparation):**

- Task list must be 100% complete (all checkboxes marked)
- Ready to archive incidental work
- Preparing for long-term reference

**If task list is in-progress, SKIP TO STEP 6.**

**Why this matters:** The notes file is a working document during active development. Cleaning it up mid-work
can remove context needed for remaining tasks. Only clean up when all work is done.

---

**Step 5a: Consolidate and Deduplicate Content (CRITICAL FIRST STEP)**

**This step makes the difference between a notes file that gets used vs ignored.**

Notes files are messy and unorganized during work - content gets added as discoveries happen, leading to repetition
and scattered information. **Before formatting, consolidate the content.**

**Guiding Principle:** Lean heavily towards keeping everything for historical reasons, but eliminate clear repetition.

**Process:**

1. **Read through entire notes file** to identify repeated information:
   - Same decision explained in multiple places
   - Duplicate code examples or patterns
   - Repeated explanations of the same issue/solution
   - Multiple sections covering the same topic from different angles

2. **For each repetition found:**
   - **Keep the most complete version** (usually the later one, as it has more context)
   - **Delete clear duplicates** (exact same information, no new insights)
   - **Consolidate similar content** (merge related sections that cover same topic)
   - **Add "See also" cross-references** if related info lives elsewhere

3. **What to keep (bias towards preservation):**
   - ✅ Different perspectives on the same decision (shows evolution of thinking)
   - ✅ Chronological progression (how understanding developed over time)
   - ✅ Context-specific details (even if topic is repeated)
   - ✅ Investigation journeys (even if verbose - this is the messy reference)
   - ✅ When in doubt, KEEP IT

4. **What to remove (only clear repetition):**
   - ❌ Exact duplicate paragraphs (copy-pasted content)
   - ❌ Redundant code examples (same code shown multiple times with no variation)
   - ❌ Repeated summaries of the same decision with no new information

5. **Consolidation patterns:**
   - Merge multiple sections about the same investigation into one comprehensive section
   - Move scattered notes about a topic into a single "Topic Name" section
   - Combine duplicate "lessons learned" or "key insights" lists

**Example - Before Consolidation:**

```markdown
## Task 4.1: Auth Library Migration Research
[300 lines about library compatibility]

## Task 4.3: Auth Library Implementation
[50 lines repeating same compatibility info]
[200 lines of implementation details]

## Task 4.7: Auth Library Testing
[Another 30 lines about library compatibility]
[Testing details]
```

**Example - After Consolidation:**

```markdown
## Auth Library Migration
**Context:** Migrated from old-auth-library to new-auth-library (Tasks 4.1-4.8)

### Compatibility Research (Task 4.1)
[300 lines - kept as comprehensive reference]

### Implementation (Task 4.3)
[200 lines of implementation details - kept]
See "Compatibility Research" above for library evaluation.

### Testing (Task 4.7)
[Testing details - kept]
See "Compatibility Research" above for compatibility notes.
```

**Time Estimate:** 20-40 minutes for thorough deduplication (depends on notes file size)

**Step 5b: Format for Archival**

After content consolidation, format for navigation and long-term reference:

**Add Table of Contents:**

- Create TOC section at top (after metadata, before first major section)
- Group by category: "Major Investigations & Decisions", "Implementation Details", "Historical Context",
  "Reference"
- Use markdown anchor links for navigation
- Keep TOC concise (one-line description per section)

**Update Section Headers:**

- Remove task references from headers (e.g., "Task 5.5: Token Validation..." →
  "Token Validation Issue Resolution")
- Make headers descriptive and standalone (future-you won't remember task numbers)
- Add brief context line under each major heading

**Remove Temporal Markers:**

- Delete "To be filled", "Pending approval", "Status: PENDING"
- Update decision records to show final outcomes
- Change "Next Steps" to "Implementation" or "Resolution"

**Consolidate Exploratory Sections:**

- Preserve the investigation journey but make it scannable
- Add summary at top of long exploratory sections
- Use "TLDR" or "Quick Summary" for verbose investigations
- Example: 300-line CSRF investigation → 50-line summary + detailed journey

**Verify Consistency:**

- Ensure all section headers follow similar patterns
- Check that anchor links in TOC work
- Update metadata (Created → Completed date, Status: Active → Complete)

**Estimated Time:** 15-30 minutes for archival prep

### 6. Update Cross References

- At the top of both files, confirm the "Related Task/Notes" pointers are accurate
- Update status metadata:
    - Task file: `**Status**: Completed`, `**Actual Effort**: ...`
    - Notes file: `**Status**: Complete`, `**Completed**: YYYY-MM-DD`
- Add completion date to both files
- **Add termination indicator**: If bottom-matter was removed, add `---` after the final task to visually
  indicate intentional end (prevents appearance of truncated file)

### 7. Quality Checks

**Markdown linting:**

- Run `npx markdownlint-cli2 --fix <task-file> <notes-file>`
- Review diff to ensure no accidental task-checkbox edits

**Verify temporal noise removed:**

Run the same grep patterns from Step 3 - should return minimal/no matches:

```bash
# Should return 0-2 matches (header only, not inline)
grep -in "status:\|completed:.*202" tasks-*.md

# Should return 0 matches
grep -in "next step\|resume at\|blocked on" tasks-*.md

# Should return 0 matches (if notes deleted)
grep -in "notes-.*\.md" tasks-*.md
```

If matches remain, return to Step 3 and fix.

**For large files:** Mark all phases complete in CLEANUP-PROGRESS and review collected data.

**Notes file (if kept):**

- Verify TOC anchor links work (spot check 2-3 links)
- Confirm can find specific topic in <1 minute

---

**Context Check for Completion Doc Creation**

**Check remaining context:** If less than ~120k tokens remaining, stop here:

1. Commit cleanup work: `git add .arc/active/ && git commit -m "docs: archival cleanup for {name}"`
2. Update CURRENT-SESSION.md: "Next action: Create completion doc (requires fresh context)"
3. Completion doc creation happens next session

**If sufficient context remains:** Proceed to archive-completed Step 3 (Create Completion Metadata).
The completion doc requires reading overview + final phases + CLEANUP-PROGRESS to be accurate.

**Delete CLEANUP-PROGRESS after completion doc created** - it's temporary tracking only.

## Output

**Task File:**

- Detailed sub-task level record showing what was accomplished
- Inline notes documenting outcomes at granular level (kept even if verbose)
- Research summaries, decision rationale, implementation findings preserved
- NO completion summary (now in separate completion-{name}.md)
- Length is fine - can be 500-3000+ lines for complex work
- **Target:** Historical record without temporal noise (not a scannable summary - that's the completion doc)

**Notes File:**

- Table of contents for quick navigation
- Clean section headers (no temporal markers)
- Rich historical detail preserved
- Organized by topic, not chronological chaos
- **Target:** Can find specific technical decision or implementation detail in 1 minute

**Archive Ready:**

- Both files suitable for long-term reference
- No temporal confusion ("pending", "to be filled")
- Clear, professional documentation

## Lessons Learned

**From Authentication Security Updates (2025-10-14) and Test-First Protocol Updates (2025-10-15):**

1. **Relevance Over Length**: Don't migrate based on line count alone. A 20-line implementation guide needed
   by Tasks 7-10 should stay. A 2-line note about completed Task 3 with no future dependencies should migrate.

2. **Task File Criteria**: "Does this cleanly document work completed at sub-task granular level, without temporal
   junk or repetition?" Length is fine - task files can be 500-3000+ lines. Completion doc (completion-{name}.md) is
   the executive summary.

3. **Migration Decision**: Ask "Will someone working on the next task need this context?" not
   "Is this verbose?"

4. **Notes File Question**: "Can I find a specific technical decision without scrolling through 1500 lines?"
   If no, it needs TOC + headers (archival prep only).

5. **Migration Pattern**: Don't delete anything - migrate historical content to "Historical Implementation
   Details" section in notes file. Storage is cheap, context loss is expensive.

6. **Archival Prep ROI**: 20-30 minutes of cleanup dramatically increases likelihood of actually using these docs
   6 months later.

7. **Unified Completion Docs** (as of 2025-11-17): All work (feature/technical/incidental) gets separate
   `completion-{name}.md`. No more completion summaries in task files - cleaner separation of concerns.

## Common Pitfalls

❌ **Modifying task descriptions**: Task lines are historical records - changing "Consider adding alert
   threshold" to "Consider alert thresholds" loses information
❌ **Ignoring stale references**: After restructuring tasks, "(Task 7)" might now mean Task 8 - fix these
   before they cause confusion
❌ **Leaving content out of order**: Task 8 notes appearing before Task 7 notes after restructuring -
   reorder sections to match current numbering
❌ **Cleaning notes file mid-work**: Notes file cleanup is ONLY for archival prep (Mode 2), not mid-work cleanup (Mode 1)
❌ **Leaving forward pointers in archived task files**: Remove pointers to archived spawned task lists (check `.arc/reference/archive/`)
❌ **Removing backward pointers**: Keep pointers to active task lists where work resumes (check `.arc/active/`)
❌ **Confusing pointer directionality**: See "Understanding Pointer Directionality" in Step 1d for clear criteria
❌ **Expecting bottom-matter sections**: Modern task files don't have these - if found, it's old pattern
❌ **Keeping completion summary in task file**: Completion summary now goes in separate completion-{name}.md (unified strategy)
❌ **Leaving temporal markers in archived work**: "Pending approval", "To be filled" confuses future readers
❌ **Skipping TOC for archival**: 1500-line notes file without navigation is effectively unusable
❌ **Over-editing notes**: Don't remove the exploration journey - that's valuable context
❌ **Deleting instead of migrating**: Lost context can't be recovered
❌ **Inconsistent headers in archived work**: "Task 5.5.6.3" vs "Frontend CSRF Guide" - pick one style
❌ **Skipping archival prep**: "I'll clean it up later" = never gets cleaned up
❌ **Treating all cleanup the same**: Mode 1 (mid-work) keeps relevant context, Mode 2 (archival) removes temporal
   junk but preserves detailed sub-task record

✅ **Task lines stay verbatim** (historical record of what was done)
✅ **Task file shows the what and why** (scannable structure)
✅ **Notes file shows the how and journey** (detailed reference)
✅ **Notes file cleanup only at archival** (not mid-work)
✅ **Both files are navigable** (TOC, clear headers, no temporal confusion - after archival)
✅ **Future-you says "thank you"** (actually uses these docs when needed)
