# Workflow: Maintain Task & Notes Hygiene

**Audience:** Agent-executed — your agent follows this to clean up task lists before archival.

Use this workflow when an active task list has accumulated historical notes or when the companion notes document
needs pruning. **Execute this workflow before archiving completed work** to ensure files are reference-ready.

**Goal:** Remove temporal noise from task files while preserving the detailed historical record.
Evaluate notes file for archival worthiness. The task list's value is showing the journey — substantive content
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

**Timing:** After all work complete, BEFORE creating PR. Documentation cleanup commits to child branch
and becomes part of the work deliverable.

**What happens:**

- ✅ Remove temporal noise from task file (grep-based, not content judgment)
- ✅ Evaluate notes file (keep for archival or delete if scratchpad)
- ✅ **If keeping notes:** Clean up notes file (TOC, headers, remove temporal markers)
- ✅ Collect completion doc data during cleanup (for large files)
- ✅ Prepare files for archival

## Inputs

- Path to the task list (e.g., `.arc/active/{category}/tasks-*.md`)
- Path to the related notes file (e.g., `.arc/active/{category}/notes-*.md`)
- Current project rules: [DEV-RULES.PROJECT][dev-rules]

## Checklist

### 1. Confirm Pairing and Status

**Verify pairing:** Confirm both files refer to each other and cover the same scope.

**Verify completion status (Mode 2 only):** Scan entire task list to verify ALL checkboxes are
marked `[x]`. If any unchecked tasks found → STOP — use Mode 1 instead.

**Update status metadata:**

- Update `**Status**:` field in task file header (Mode 2: change to "Complete", remove temporal notes)
- Add/update `**Completed**:` date in both files (YYYY-MM-DD format)
- Note: All work uses separate `completion-{name}.md` (created in
  [archive-completed](archive-completed.md) workflow Phase 1, Step 3)

**Evaluate notes file disposition (Mode 2 only):**

Not all notes files are worth archiving:

- **✅ Keep & Clean** (proceed to Step 5): Contains archival-worthy research, documents architectural
  decisions not already captured in ADRs, preserves investigation journeys with future reference value
- **❌ Delete Entirely** (skip Step 5, delete in Step 6): Scratchpad notes with no archival value,
  content already captured in task file completion details or in ADRs/strategy documents

**Rule of thumb:** "Would I reference this 6 months from now, and is it not already in
ADRs/strategies?" If no → delete.

**If deleting:** Remove notes file reference from task file header in Step 6. Proceed directly to
`completion-{name}.md` creation in archive-completed workflow.

**Pointer directionality:** Task file headers may contain pointers to other task lists. Decision
is based on where the referenced file lives:

- **Backward pointer** (`Interrupts:`, `Paused:`) — points to where work resumes AFTER this task
  list. **KEEP** if referenced file is in `.arc/active/`. Remove if archived.
- **Forward pointer** (`Paused To:`, `Spawned:`) — points to child task lists spawned FROM this
  work. **REMOVE** if referenced file is in `.arc/reference/archive/`. Keep if still active.

**Assess file size (Mode 2 only):**

- **Lightweight (~100 lines or less):** The two-step section/fine-grained process in Step 3
  is likely unnecessary. A single pass with the temporal grep patterns (Step 3, Mode 2,
  Step B) is usually sufficient — files this small rarely accumulate the structural noise
  that section-level evaluation targets. Use judgment: a short file with dense multi-phase
  content may still benefit from section evaluation.
- **Small (~100–1000 lines):** Single-pass review — proceed normally
- **Large (~1000+ lines):** Process phase-by-phase. Create a brief progress tracker
  (`.arc/active/{category}/CLEANUP-PROGRESS-{name}.md`) to track which phases are cleaned and
  collect completion doc metrics incrementally. Delete tracker after completion doc is created.

### 2. Inventory Open Work and Fix References

**Inventory (Mode 1 focus):**

- If in-progress: identify what context remaining unchecked tasks need
- Flag any non-task content that has accumulated (notes, decision logs, technical context) —
  these belong in the notes file (`notes-{name}.md`), not in the task list
- **Key distinction:** Keep what remaining work needs (regardless of length); migrate historical
  explanations to the notes file

**⚠️ Task lines are historical records — NEVER modify task descriptions or outcomes.** A task line
is the checkbox with its description and inline outcome notes (e.g., `- [x] 4.3.3 Consider adding
alert threshold - DEFERRED to observability sprint`). These document what actually happened and must
stay verbatim.

**Fix stale task number references:**

After task list restructuring (inserted tasks, renumbered tasks), task number references within
the file may point to wrong numbers. Use the actual task checklist as source of truth:

- Search for patterns like "(Task 7)", "Task 7:", "Tasks 7-9" in task descriptions and
  completion notes
- Verify each reference points to the correct current task

```markdown
<!-- Example: After inserting Task 7a-7c, old reference needs updating -->
<!-- BEFORE --> **Manual E2E Validation** (Task 7) - Critical Path Only:
<!-- AFTER -->  **Manual E2E Validation** (Task 8) - Critical Path Only:
```

### 3. Clean Up Task File

#### Mode 1: Mid-Work Cleanup

**Decision criteria:** For each piece of verbose content around tasks, ask: "Will someone working
on the remaining tasks need this context?"

- **YES → Keep** in task file (even if verbose)
- **NO → Migrate** to notes file (see Step 4)

**What stays:** Context needed by remaining unchecked tasks, implementation patterns/constraints
guiding future work, active decisions affecting ongoing tasks.

**What migrates:** Historical explanations with no future dependencies, debugging journeys for
resolved issues, "why we chose X over Y" rationale (unless it affects remaining tasks), completed
work details not needed for remaining tasks.

```markdown
<!-- KEEP: relevant to remaining Tasks 7-9 -->
- [x] 6.5 Implement auth fallback
    **IMPORTANT for Tasks 7-9:** All endpoints must check secondary auth after primary.
    Authentication order: Primary → API Key → Session.

<!-- MIGRATE: historical, no future dependencies -->
- [x] 3.4 Debug token issue - RESOLVED
    **Root Cause:** Header missing in form.submit() due to browser security
    **Solution:** Switched to fetch() API with explicit headers
    **Investigation:** Tried 5 different approaches... [15 lines]
    → Migrate to notes file under "Token Issue Investigation (Task 3.4)"
```

#### Mode 2: Archival Cleanup

**⚠️ This is NOT a content reduction exercise.** Don't try to make the task list "scannable" —
that's the completion doc's job. The task file preserves the detailed sub-task record (can be
500-3000+ lines).

**What gets removed:** Temporal markers and scaffolding that only made sense during active work.

**What stays:** All task lines verbatim, research summaries, detailed completion notes, decision
rationale, implementation findings, quality gate results, backward pointers to active task lists.

**Two-step process — structure first, then fine-grained:**

**Step A: Section-level evaluation.** Scan the task file top to bottom. For each section heading
(##, ###), decide: **KEEP**, **REMOVE**, or **EVALUATE CONTENTS**.

Standard task list structure to preserve:

- Header metadata (PRD, Created, Completed, Branch, Base Branch, Status)
- Overview / Scope (Will Do / Won't Do)
- Tasks (phases with subtasks)
- Success Criteria

Non-standard sections — evaluate each:

- **Temporal scaffolding** (urgency rationale, status snapshots, "next steps", coordination
  notes) → Remove
- **Substantive content** (implementation findings, research, architectural decisions not captured
  elsewhere) → Keep in place or extract to notes file
- **Completion summaries** → Should be in separate `completion-{name}.md`, not task file

Before removing research or decision content, verify it's captured in ADRs or strategy docs. If
not captured elsewhere and substantive, keep it.

**⛔ Complete section evaluation before proceeding to Step B.**

**Step B: Fine-grained cleanup (grep patterns).** Find inline temporal markers within kept sections:

```bash
# Next Steps references (meaningless after completion)
grep -in "next step\|next:\|**next" tasks-*.md

# Temporal status markers
grep -in "status:.*complete\|status:.*pending\|status:.*blocked\|status:.*[0-9]/[0-9]" tasks-*.md

# Resume/Continue markers
grep -in "resume at\|continue with\|pick up at\|blocked on" tasks-*.md

# References to deleted notes file (if notes file was deleted)
grep -in "notes-.*\.md" tasks-*.md

# Inline subtask completion dates (header date is fine, subtask dates are noise)
grep -in "\*\*completed:\*\*.*202[0-9]" tasks-*.md

# Forward pointers to archived task lists
grep -in "spawned:\|created:.*tasks-\|interrupted by:" tasks-*.md
# Check: find .arc/reference/archive -name "tasks-<filename>.md"
# If found in archive → remove pointer. If in .arc/active/ → keep.
```

For each match: read context, verify it's temporal noise (not substantive), remove.

**Collect completion doc data (large files):** While processing each phase, note key deliverables
and quantitative metrics in CLEANUP-PROGRESS. This feeds completion doc creation and prevents
needing to re-read the entire file.

### 4. Migrate Content to Notes File

**This is APPEND-ONLY — do not clean up or reorganize the notes file itself.**

- Create "Historical Implementation Details" section near bottom of notes file (if it doesn't exist)
- Add migrated content under descriptive headings (e.g., "Alert Threshold Decision (Task 4.3.3)")
- Preserve full detail — this is the messy reference, don't summarize
- **Notes file cleanup happens only during archival prep (Step 5), not during migration**

### 5. Prepare Notes File for Archival

**⚠️ Mode 2 only — skip if task list is in-progress.**

The notes file is a working document during active development. Only clean up when all work is done.

**Step 5a: Consolidate and deduplicate.**

Notes files accumulate repetition during work — same decision explained in multiple places, duplicate
code examples, scattered information about the same topic.

Process:

1. Read through entire notes file identifying repeated information
2. For duplicates: keep the most complete version, delete clear duplicates, consolidate related sections
3. **Bias toward preservation:** Different perspectives on the same decision, chronological
   progression, and investigation journeys all have value. Only remove exact duplicates and
   redundant restatements.

```markdown
<!-- BEFORE: Same compatibility info repeated across 3 task sections -->
## Task 4.1: Auth Library Migration Research
[300 lines about library compatibility]

## Task 4.3: Auth Library Implementation
[50 lines repeating same compatibility info] + [200 lines implementation]

<!-- AFTER: Consolidated under topic, cross-referenced -->
## Auth Library Migration (Tasks 4.1-4.8)

### Compatibility Research (Task 4.1)
[300 lines - kept as comprehensive reference]

### Implementation (Task 4.3)
[200 lines implementation - kept]
See "Compatibility Research" above for library evaluation.
```

**Step 5b: Format for archival.**

- **Add Table of Contents** at top (after metadata). Group by category, use markdown anchor links.
- **Update section headers:** Remove task number references (e.g., "Task 5.5: Token Validation..."
  → "Token Validation Issue Resolution"). Make headers descriptive and standalone.
- **Remove temporal markers:** Delete "To be filled", "Pending approval", "Status: PENDING".
  Update decision records to show final outcomes.
- **Consolidate verbose explorations:** Preserve the journey but add summary at top of long sections.
- **Verify consistency:** Check anchor links, update metadata dates and status.

### 6. Update Cross References

- Confirm "Related Task/Notes" pointers are accurate in both files
- Update status metadata: task file `**Status**: Complete`, notes file `**Status**: Complete`
- Add completion date to both files
- **If notes file was deleted:** Delete the file (`git rm notes-{name}.md`) and remove all
  references to it from the task file
- **If bottom-matter was removed:** Add `---` after final task to indicate intentional end

### 7. Quality Checks

**Markdown linting:**

```bash
npx markdownlint-cli2 --fix --no-globs <task-file> <notes-file>
```

Review diff to ensure no accidental task-checkbox edits.

**Verify temporal noise removed:**

```bash
# Should return 0-2 matches (header metadata only)
grep -in "status:\|completed:.*202" tasks-*.md

# Should return 0 matches
grep -in "next step\|resume at\|blocked on" tasks-*.md
```

**For large files:** Mark all phases complete in CLEANUP-PROGRESS and review collected data.

**Notes file (if kept):** Verify TOC anchor links work (spot check 2-3). Confirm you can find
a specific topic in <1 minute.

---

**Context check for completion doc creation:**

If less than ~120k tokens remaining, stop here — commit cleanup work and note in SESSION-NOTES.md
that completion doc creation requires a fresh session. If sufficient context remains, proceed to
[archive-completed](archive-completed.md) Phase 1, Step 3 (Create Completion Metadata). Delete
CLEANUP-PROGRESS after completion doc is created.

## Output

**Three-tier system:**

- **Completion doc** (`completion-{name}.md`): Executive summary — "What was achieved?"
- **Task file** (`tasks-{name}.md`): Detailed sub-task record — "What was done?" (can be 500-3000+ lines)
- **Notes file** (`notes-{name}.md`, if kept): Deep-dive reference — "How/why decisions, investigation journeys"

**Task file target:** Historical record with inline outcomes preserved. No temporal noise, no
completion summary (that's the completion doc's job).

**Notes file target (if kept):** Table of contents, clean headers, rich historical detail organized
by topic. Find any specific decision or detail in <1 minute.

## Common Pitfalls

❌ **Modifying task descriptions** — task lines are historical records, keep them verbatim
❌ **Ignoring stale references** — after restructuring, "(Task 7)" might now mean Task 8
❌ **Cleaning notes file mid-work** — notes cleanup is Mode 2 only, not Mode 1
❌ **Leaving forward pointers in archived files** — remove pointers to archived task lists
❌ **Removing backward pointers** — keep pointers to active task lists where work resumes
❌ **Keeping completion summary in task file** — goes in separate `completion-{name}.md`
❌ **Leaving temporal markers** — "Pending approval", "To be filled" confuses future readers
❌ **Skipping TOC for archival** — large notes file without navigation is unusable
❌ **Deleting instead of migrating** — lost context can't be recovered
❌ **Over-editing notes** — don't remove the exploration journey, that's valuable context

---

[dev-rules]: ../../../../reference/constitution/DEV-RULES.PROJECT.md
