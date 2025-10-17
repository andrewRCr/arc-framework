# Workflow: Maintain Task & Notes Hygiene

Use this workflow when an active task list has accumulated historical notes or when the companion notes document
needs pruning. **Execute this workflow before archiving completed incidental work** to ensure both files are
reference-ready.

**Goal:** Keep the task file lean and scannable while preserving rich historical context in the notes file.

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
- Ready to archive incidental work
- Preparing documentation for future reference

**What happens:**

- ✅ Clean up task file (migrate verbose blocks)
- ✅ Add migrated content to notes file
- ✅ **Clean up notes file** (TOC, headers, remove temporal markers)
- ✅ Prepare both files for archival

## Inputs

- Path to the task list (e.g., `.arc/active/incidental/tasks-*.md`)
- Path to the related notes file (e.g., `.arc/active/incidental/notes-*.md`)
- Current project rules: [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md)

## Checklist

### 1. Confirm Pairing

- Verify both files refer to each other and cover the same scope
- Note overall status (In Progress, Completed) and remaining unchecked tasks
- Update status metadata at top of both files (Created/Completed dates)

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
- Common locations: "Implementation Notes", similar sections (at the bottom of the task list doc),
  Relevant Files section, inline notes

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
- **What stays**: Top-matter context, task list, bottom-matter notes relevant to remaining work, Relevant Files
- **What migrates**: Historical explanations with no future dependencies

**Mode 2 (Archival Preparation - ALL WORK COMPLETE):**

- **Goal**: Transform task file into quick-reference skeleton
- **Decision Criteria**: "Is this part of the quick reference or the deep dive?"
- **Task file becomes**: Top-matter + Task list + Relevant Files + Completion Summary ONLY
- **Everything else migrates**: ALL bottom-matter sections (Implementation Notes, Task List Coordination,
  Decision Logs, etc.) → Notes file

**Archival Task File Structure (Mode 2 only):**

```markdown
# Task File (Quick Reference Skeleton)

## Top-Matter (KEEP - concise context)
- Metadata (Created, Completed, Status, Effort)
- Context (1-2 paragraphs: why this work, what triggered it)
- Scope & Boundaries (what's in/out of scope)

## Task List (KEEP - historical record)
- [x] All task checkboxes with inline outcomes
- Preserves what was actually done

## Relevant Files (KEEP - quick reference)
- File paths with one-line descriptions
- Helps locate implementation quickly

## Completion Summary (KEEP - archival summary)
- Work Accomplished
- Major Deliverables
- Key Architectural Decisions
- Metrics

## EVERYTHING ELSE MIGRATES TO NOTES FILE:
❌ Implementation Notes section → Notes file
❌ Task List Coordination section → Notes file
❌ Decision Logs section → Notes file
❌ Investigation Details section → Notes file
```

**Why This Structure?**

- **Quick reference** (2-3 min scan): "What was done, what files changed, what was achieved?"
- **Deep dive** (notes file): "How was it done, why these decisions, what was the journey?"

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
- [x] 6.5 Implement session auth fallback
    **IMPORTANT for Tasks 7-9:** All endpoints must check session auth after JWT.
    Authentication order: JWT → API Key → Session (Priority 3).
    See test_session_auth.py for pattern. All future endpoints must follow this.
    [Additional 10 lines of implementation guidance...]

<!-- MIGRATE (historical, no future dependencies) -->
- [x] 3.4 Debug CSRF token issue - RESOLVED
    **Root Cause:** Referer header missing in form.submit() due to browser security
    **Solution:** Switched to fetch() API with explicit headers
    **Investigation:** Tried 5 different approaches... [15 lines of debugging journey]
    **Result:** Working, 0 regressions, all tests pass
```

**The key question:** "Will someone working on Tasks 7-10 need this context daily?"

---

**What to Keep:**

- ✅ **All task lines exactly as written** (checkboxes, descriptions, inline outcome notes)
- ✅ Task structure and hierarchy (parent tasks, subtasks, indentation)
- ✅ "Relevant Files" section (helpful reference during work)
- ✅ "Completion Summary" section (for completed work)
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

**Archival Mode Migration (Mode 2 Only)**

**⚠️ When all tasks are complete, apply different rules:**

**Scan Top-Matter** (above task list):

- ✅ **Keep**: Metadata, brief context (1-2 paragraphs), scope boundaries
- ✅ **Keep concise**: If context/scope sections exceed 100 lines, migrate detailed subsections to notes

- ❌ **Migrate**: Detailed background investigations, verbose decision rationale in context section

**Scan Task List**:

- ✅ **Keep verbatim**: All task lines exactly as written (never modify)

**Scan Bottom-Matter** (below task list):

- ✅ **Keep**: Relevant Files section (quick reference for finding implementation)
- ✅ **Keep**: Completion Summary section (archival summary of what was achieved)
- ❌ **Migrate ALL to notes file**: Implementation Notes, Task List Coordination, Decision Logs,
  Investigation Details, Architecture Decisions, Any other explanatory sections

**Result**: Task file becomes 200-400 line quick reference skeleton showing WHAT was done. Notes file becomes
comprehensive deep-dive showing HOW and WHY.

**Example Archival Migration:**

```markdown
<!-- TASK FILE BEFORE ARCHIVAL CLEANUP (800 lines) -->

## Context
[50 lines of background]

## Tasks
[300 lines of task checklist]

## Relevant Files
[50 lines of file list]

## Task List Coordination
[100 lines explaining scope boundaries]

## Implementation Notes

### Task 5: OAuth Token Strategy
[50 lines of architectural decisions]

### Task 7: Hook Architecture
[150 lines of design rationale]

## Completion Summary
[100 lines of metrics and achievements]

<!-- TASK FILE AFTER ARCHIVAL CLEANUP (350 lines) -->

## Context
[50 lines of background - kept concise]

## Tasks
[300 lines of task checklist - unchanged]

## Relevant Files
[50 lines of file list - unchanged]

## Completion Summary
[100 lines of metrics - unchanged]

<!-- NOTES FILE GAINS -->

## Task List Coordination (Migrated from Task File)
[100 lines explaining scope boundaries]

## Implementation Notes (Migrated from Task File)

### OAuth Token Strategy Architecture
[50 lines of architectural decisions from Task 5]

### Hook Facade Pattern Design
[150 lines of design rationale from Task 7]
```

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

**This step makes the difference between a notes file that gets used vs ignored.**

**Add Table of Contents:**

- Create TOC section at top (after metadata, before first major section)
- Group by category: "Major Investigations & Decisions", "Implementation Details", "Historical Context",
  "Reference"
- Use markdown anchor links for navigation
- Keep TOC concise (one-line description per section)

**Update Section Headers:**

- Remove task references from headers (e.g., "Task 5.5: Django Ninja CSRF..." →
  "CSRF Integration Issue Resolution")
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

### 7. Quality Checks

- Run `npx markdownlint-cli2 --fix <task-file> <notes-file>`
- Review diff to ensure no accidental task-checkbox edits
- Verify TOC anchor links work (spot check 2-3 links)
- Confirm task file is now lean and scannable (can grasp structure in <2 minutes)
- Confirm notes file has clear navigation (can find specific topic in <1 minute)

## Output

**Task File:**

- Lean, scannable structure showing what was accomplished
- Concise inline notes documenting outcomes
- Completion summary with metrics and accomplishments
- Clear next steps
- **Target:** Can understand scope and outcomes in 2-3 minutes

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

2. **Task List Question**: "Can I understand what was accomplished AND what context remaining work needs by
   scanning this file in <3 minutes?" If no, it needs cleanup.

3. **Migration Decision**: Ask "Will someone working on the next task need this context?" not
   "Is this verbose?"

4. **Notes File Question**: "Can I find a specific technical decision without scrolling through 1500 lines?"
   If no, it needs TOC + headers (archival prep only).

5. **Migration Pattern**: Don't delete anything - migrate historical content to "Historical Implementation
   Details" section in notes file. Storage is cheap, context loss is expensive.

6. **Archival Prep ROI**: 20 minutes of cleanup dramatically increases likelihood of actually using these docs
   6 months later.

## Common Pitfalls

❌ **Modifying task descriptions**: Task lines are historical records - changing "Consider adding alert
   threshold" to "Consider alert thresholds" loses information
❌ **Ignoring stale references**: After restructuring tasks, "(Task 7)" might now mean Task 8 - fix these
   before they cause confusion
❌ **Leaving content out of order**: Task 8 notes appearing before Task 7 notes after restructuring -
   reorder sections to match current numbering
❌ **Cleaning notes file mid-work**: Notes file cleanup is ONLY for archival prep (Mode 2), not mid-work cleanup (Mode 1)
❌ **Leaving bottom-matter in archived task files**: When all work complete, Implementation Notes/Coordination
   sections must migrate to notes file - task file is quick reference only
❌ **Leaving temporal markers in archived work**: "Pending approval", "To be filled" confuses future readers
❌ **Skipping TOC for archival**: 1500-line notes file without navigation is effectively unusable
❌ **Over-editing notes**: Don't remove the exploration journey - that's valuable context
❌ **Deleting instead of migrating**: Lost context can't be recovered
❌ **Inconsistent headers in archived work**: "Task 5.5.6.3" vs "Frontend CSRF Guide" - pick one style
❌ **Skipping archival prep**: "I'll clean it up later" = never gets cleaned up
❌ **Treating all cleanup the same**: Mode 1 (mid-work) keeps relevant context in task file, Mode 2 (archival)
   migrates ALL bottom-matter to notes

✅ **Task lines stay verbatim** (historical record of what was done)
✅ **Task file shows the what and why** (scannable structure)
✅ **Notes file shows the how and journey** (detailed reference)
✅ **Notes file cleanup only at archival** (not mid-work)
✅ **Both files are navigable** (TOC, clear headers, no temporal confusion - after archival)
✅ **Future-you says "thank you"** (actually uses these docs when needed)
