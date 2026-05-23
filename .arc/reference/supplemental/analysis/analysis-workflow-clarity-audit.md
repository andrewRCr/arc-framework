# Analysis: Workflow Clarity Audit

**Purpose:** Comprehensive findings from Phase 7 clarity audit of hot-path workflows. Input for
remediation work before closing the structural validation work unit (WU2).

**Source:** Five parallel subagent walkthroughs + synthesis, conducted during Task 7.1 of
`tasks-structural-validation.md`.

**Date:** 2026-03-10

---

## Critical Constraint: Context Budget

**This constraint governs how every finding below is addressed. Read before acting on any item.**

### The problem

Session initialization loads 7-9 documents into the agent's context window before any work begins.
These documents compete for the same finite resource (context tokens) that the agent needs for
actual task execution. Every line added to a session-init-loaded document is a line the agent
carries for the entire session — whether or not it's relevant to the current task.

### Documents loaded every session (via session-init workflow)

| Document                                          | Classification | Approx Size | Notes                              |
|---------------------------------------------------|----------------|-------------|------------------------------------|
| AGENT-BRIEFING.ARC.md + AGENT-BRIEFING.PROJECT.md | Agent context  | ~90 lines   | ARC orientation + project overview |
| Agent-specific file (e.g., CLAUDE.ARC.md)         | Agent context  | ~60 lines   | Tool-specific guidance             |
| DEV-RULES.ARC.md                                  | Constitutional | ~300 lines  | Methodology rules                  |
| DEV-RULES.PROJECT.md                              | Constitutional | ~125 lines  | Project quality standards          |
| STRATEGY-INDEX.md                                 | Reference      | ~80 lines   | Strategy catalog                   |
| QUICK-REFERENCE.md                                | Reference      | ~155 lines  | Commands and environment           |
| WORK-STATUS.md                                    | Active state   | ~20 lines   | Current project pointer            |
| SESSION-NOTES.md                                  | Active state   | ~65 lines   | Prior session context (if exists)  |
| Active task list (partial)                        | Active state   | ~100 lines  | Current phase + current task       |

**Total init context budget: ~975 lines** (varies by project). This is the baseline cost before
any work begins.

### Documents loaded per-session but not at init

| Document             | When Loaded                     | Notes                                                 |
|----------------------|---------------------------------|-------------------------------------------------------|
| session-init.md      | Executed during init, then done | The workflow itself — agent follows it, then moves on |
| session-handoff.md   | End of session                  | Loaded once at session boundary                       |
| process-task-loop.md | Before first task execution     | Per DEV-RULES.ARC § When to Load                      |

### Documents loaded on-demand during work

All other workflows (create-prd, generate-tasks, activate-work-unit, archive-work-unit, etc.)
are loaded when the agent reaches that workflow step. These can be comprehensive — they're loaded
once for a specific purpose, used, and the work product (not the document) persists.

### The implied-reference trap

When a session-init-loaded document says "see X for details," the agent may load X during init
"to be safe" — especially if the reference is to a strategy or workflow that sounds relevant to
the current task. This creates cascading context pressure:

- DEV-RULES.ARC says "load the process-task-loop workflow before starting task execution" →
  agent loads it at init time instead of waiting for task start
- STRATEGY-INDEX lists 12 strategies with "Consult when:" triggers → agent might pre-load
  strategies that match the current task domain

**Design principle:** Session-init-loaded documents must be self-sufficient for their purpose
(orientation, not execution) without triggering premature document loading. Clarity improvements
to these documents must add precision, not volume. The right fix for an unclear reference in
DEV-RULES.ARC is often a sharper sentence, not an additional paragraph.

### Remediation guidance by document zone

**Zone 1 — Init-loaded documents** (AGENT-BRIEFING.ARC.md, AGENT-BRIEFING.PROJECT.md, DEV-RULES.ARC,
DEV-RULES.PROJECT, STRATEGY-INDEX, QUICK-REFERENCE, agent-specific files):

- **Hard constraint:** No net increase in document length. Every line added must be offset by a
  line removed or tightened elsewhere.
- **Preferred fix:** Sharpen existing language. Replace vague phrases with precise ones. Add a
  single clarifying clause, not a new paragraph.
- **Avoid:** New sections, expanded examples, inline summaries of referenced documents.
- **Test:** "Would a fresh agent execute this correctly with ONLY this document?" If yes, stop.
  If no, the fix should be the minimum change that flips the answer.

**Zone 2 — Per-session documents** (session-init.md, session-handoff.md, process-task-loop.md):

- **Moderate constraint:** These are loaded once per session at known points. Some growth is
  acceptable if it prevents incorrect execution, but they're still session-wide overhead.
- **Preferred fix:** Inline essential definitions at point of use. Add 1-2 sentence summaries
  before cross-references that require loading another document.
- **Avoid:** Duplicating full strategy content. If the cross-reference is to optional/on-demand
  guidance, keep the reference and add a one-line summary of what the agent needs to know
  *without* loading the referenced document.

**Zone 3 — On-demand documents** (all lifecycle workflows, supplemental workflows, strategies):

- **No constraint on length.** These are loaded for a specific task and can be as comprehensive
  as needed. Err on the side of clarity and completeness.
- **Preferred fix:** Full inline definitions, examples, diagnostic steps, decision criteria.
  The agent loads this document to execute a workflow — give it everything it needs.

---

## Infrastructure Findings

These are mechanical fixes — no judgment calls, no context budget concerns.

### I-1: File inventory gap (3 files missing)

**Location:** `strategy-file-classification.md` inventory table and summary counts

**Files to add:**

| File                           | Path (from `.arc/`)                       | Classification | Layer |
|--------------------------------|-------------------------------------------|----------------|-------|
| strategy-agent-hooks.md        | `reference/strategies/arc/`               | Framework      | Core  |
| strategy-session-management.md | `reference/strategies/arc/`               | Framework      | Core  |
| session-loop.md                | `system/workflows/arc/session-lifecycle/` | Framework      | Core  |

**Counts to update:** Framework 55 → 57, Total 83 → 86.

Also verify STRATEGY-INDEX.md includes entries for both new strategies (strategy-agent-hooks and
strategy-session-management). The session-loop entry was added per commit 081c8c3 completion
notes, but verify.

### I-2: Broken inline link in 1_create-prd.md

**Location:** `.arc/system/workflows/arc/1_create-prd.md`, line 17

**Current:** `[02_define-project.md](setup/02_define-project.md)`
**Should be:** `[02_define-project.md](initial-setup/02_define-project.md)`

**Cause:** Phase 2 renamed `setup/` → `initial-setup/`. This inline link was missed during the
22-file cross-reference update.

### I-3: N-01 — Missing forward link for partial protection in archive-work-unit

**Location:** `archive-work-unit.md`, Step 8 (Next Step), partial protection section (line ~182)

**Current:** "Archival is complete. WORK-STATUS.md points to the next action (typically
`1_create-prd.md`)."

**Issue:** Indirect routing via WORK-STATUS instead of an explicit forward link. Full protection
paths both have explicit links; partial protection delegates to WORK-STATUS.

**Fix:** Add explicit forward link: "**→ \[1\_create-prd.md\]\[create-prd\]** — Plan next work unit
(or follow WORK-STATUS.md Next Action if different)."

---

## Tier A — Would Cause Incorrect Agent Execution

Findings where a fresh agent would likely do the wrong thing, not just hesitate. All are in
Zone 3 (on-demand documents) except where noted.

### A1: Quality gate tiers undefined in process-task-loop

**Zone:** 2 (per-session)
**Location:** `3_process-task-loop.md`, lines 35-38

**Current:** "Run incremental quality checks on modified files — **Tier 1** — using the
\[quality-gate-commands method\]\[arc-methods-qg\]"

**Problem:** Agent told "run Tier 1" without knowing what Tier 1 contains. Must click through to
`strategy-quality-gates.md` to learn scope. Similarly, Tier 2 (line 102) is undefined.

**Impact:** Agent runs wrong checks, skips checks, or over-runs. Quality gate execution is the
most frequent checkpoint in the entire framework.

**Fix (Zone 2 — moderate addition):** Inline a compact tier summary at first mention. This is
the single most-used reference in the document and justifies the context cost:

```
Tier 1 (per-task): project quality-gate-commands on modified files
Tier 2 (coherent unit): full quality-gate-commands suite
Tier 3 (phase/pre-PR): Tier 2 + manual review checklist
See [Quality Gates Strategy][quality-gates] for tier boundaries and escalation.
```

This replaces the current explanation-by-reference with a 3-line definition that eliminates
the most common mid-task context switch.

### A2: "Coherent unit" undefined as Tier 2 trigger

**Zone:** 2 (per-session)
**Location:** `3_process-task-loop.md`, lines 93-97

**Current:** "the last subtask under a parent (all subtasks now `[x]`), or a standalone task
that touches integration-tested code"

**Problem:** "Integration-tested code" is vague. Agent cannot determine if a refactor task or
config change qualifies. Result: Tier 2 gates skipped when needed or run unnecessarily.

**Impact:** Under-gating misses integration issues. Over-gating wastes time and context on
unnecessary quality runs.

**Fix (Zone 2):** Replace "integration-tested code" with a concrete definition. The existing
parenthetical is close — tighten it:

"the last subtask under a parent (all subtasks now `[x]`), or a standalone task that modifies
code paths exercised by multiple components (API endpoints, shared services, cross-cutting
infrastructure)"

### A3: WORK-STATUS update semantics undefined in process-task-loop

**Zone:** 2 (per-session)
**Location:** `3_process-task-loop.md`, line 125-128

**Current:** "update WORK-STATUS.md — advance Next Task, Last Completed, and Next Action to
reflect the post-commit state. Stage it alongside the task list changes."

**Problem:** Gives field names but not format, not an example, not a link to the template. Agent
must discover the file structure independently. Incorrect updates break session continuity —
the next session's init reads WORK-STATUS to determine project state.

**Impact:** Wrong field format → next session-init misreads state → stale or wrong task pointer.

**Fix (Zone 2):** Add a brief format note after the existing instruction:

"Fields use the format from the WORK-STATUS template header. Next Task uses triple-anchor
format: `Task X.Y — Title (line ~NNN)`. Last Completed mirrors the same format. Next Action is
a free-text directive (e.g., 'Resume Phase 3 — Task 3.2')."

This is 3 lines and eliminates the need to load the template mid-workflow.

### A4: archive-work-unit Step 0 has no testable diagnostic

**Zone:** 3 (on-demand)
**Location:** `archive-work-unit.md`, Step 0 (lines 36-49)

**Current:** "If you ran activate-planning-branch (batch path), you're already on the right
branch — skip this step."

**Problem:** Agent must *remember* whether activate-planning-branch ran — impossible for a fresh
agent starting a new session. No git-state-based diagnostic provided.

**Impact:** Agent guesses, creates an unnecessary branch, or asks the user for information it
could determine from git state.

**Fix (Zone 3 — comprehensive):** Replace memory-based check with a testable diagnostic:

```
Check your current branch:
- On a planning/batch branch (e.g., `planning/*`, `batch/*`): Skip — you're on the right
  branch from activate-planning-branch.
- On the base branch: Create a housekeeping branch for standalone archival:
  `git checkout -b chore/archive-{name}`
```

### A5: archive-work-unit Step 5 WORK-STATUS reset for parent branches

**Zone:** 3 (on-demand)
**Location:** `archive-work-unit.md`, Step 5, "Archiving to parent work branch" section
(lines ~135-140)

**Current:** "Restore WORK-STATUS.md to the parent work unit's context — branch name, task list
path, and current task from where work was interrupted. The parent's state is recoverable from
the parent branch's task list and commit history."

**Problem:** Too terse for a complex operation. Agent doesn't know how to extract parent context
from git history. No step-by-step recovery.

**Impact:** Incorrect WORK-STATUS state after incidental archival → next session has wrong task
pointer for the parent work unit.

**Fix (Zone 3 — comprehensive):** Expand with recovery steps:

```
1. Identify the parent branch: `git log --oneline -1` on the parent branch, or check
   SESSION-NOTES for the branch name before the incidental was stacked
2. Locate the parent task list: `.arc/active/{category}/tasks-{parent-name}.md`
3. Find the next incomplete task in the parent's task list (first unchecked `[ ]` item)
4. Set WORK-STATUS fields:
   - Branch: {parent-branch-name}
   - Task List: path to parent task list
   - Next Task: first incomplete task (triple-anchor format)
   - Last Completed: last `[x]` task before the incomplete one
   - Next Action: "Resume {parent work unit} — Task X.Y"
```

### A6: archive-work-unit Step 4 sequence numbering command is brittle

**Zone:** 3 (on-demand)
**Location:** `archive-work-unit.md`, Step 4 (line ~103)

**Current:** Uses `find ... | wc -l` to count directories for the next sequence number.

**Problem:** Counts directories, not sequence numbers. Gaps in the archive (manual cleanup,
renumbered items) produce wrong results.

**Impact:** Wrong archive sequence number → inconsistent archive structure.

**Fix (Zone 3):** Either provide a more robust command that extracts actual sequence numbers, or
add a validation step: "Verify by listing the archive directory and confirming the next number
doesn't conflict with existing entries."

---

## Tier B — Would Cause Agent Hesitation (Recoverable)

Findings where the agent would pause, load an extra document, or infer correctly from context —
but a fresh agent shouldn't have to guess.

### B1: session-init Step 5 — pm.mode:none branch under-detailed

**Zone:** 2 (per-session — session-init.md)
**Location:** session-init.md, Step 5 (lines 206-211)

**Current:** 3 terse steps for none/external vs. 4 detailed steps + readiness-state paragraph
for arc-in-git.

**Problem:** The default mode gets less guidance than the non-default mode. No readiness states,
no guidance on partial artifacts in active/.

**Fix (Zone 2 — careful addition):** Expand none/external to match arc-in-git parity. Add
readiness context: "If artifacts exist in `active/`, report their state (draft PRD → needs
refinement; complete PRD → ready for task generation; task list present → ready for activation)."
This is ~2 lines and brings parity without duplicating the arc-in-git detail.

### B2: session-init Step 5 — protection mode term undefined

**Zone:** 2 (per-session — session-init.md)
**Location:** session-init.md, lines 213-215

**Current:** "> **Full protection (`branch.protection: full`):** Planning work requires a
branch..." — used without defining what protection modes are or what the alternative is.

**Problem:** Agent encounters a conditional without understanding the axis. Must infer that
partial protection means "no branch required."

**Fix (Zone 2 — minimal):** Add a parenthetical to the existing note: "> **Full protection
(`branch.protection: full`):** Planning work requires a branch. Under partial protection (the
default), proceed directly to `1_create-prd` — no planning branch needed."

One clause added, no new paragraph.

### B3: session-init Step 3 — extensions execution mechanism unclear

**Zone:** 2 (per-session — session-init.md)
**Location:** session-init.md, lines 130-135

**Current:** "If post-context-load extensions are configured, execute them now."

**Problem:** "Execute them" — how? Agent doesn't know the mechanism (read arc-extensions.md,
check if .steps section is populated, follow instructions if present).

**Fix (Zone 2 — replace, not add):** Replace the sentence with: "If the `post-context-load`
section in [`arc-extensions.md`][arc-ext-post-context-load] has steps (not the default
placeholder), follow those steps now." Same length, more precise.

### B4: session-init Step 4 — "active override" unexplained

**Zone:** 2 (per-session — session-init.md)
**Location:** session-init.md, lines 137-154

**Current:** "scan `arc-methods.md` for active overrides"

**Problem:** Agent doesn't know what an override looks like in the file.

**Fix (Zone 2 — minimal):** Add a clarifying clause: "scan `arc-methods.md` for active
overrides (any method whose `.override` section is populated rather than showing
`[No override configured]`)."

### B5: archive-work-unit — "completion metadata" undefined

**Zone:** 3 (on-demand)
**Location:** archive-work-unit.md, prerequisites (line ~11)

**Current:** "completion metadata exists"

**Problem:** Fresh agent doesn't know what integrate-work-unit produces.

**Fix (Zone 3):** Add parenthetical: "completion metadata exists (completion doc
`notes-{name}.md`, task list header updated with completion status — produced during
\[integrate-work-unit\]\[integrate-work-unit\])."

### B6: archive-work-unit Step 3 — "lasting reference value" has no criteria

**Zone:** 3 (on-demand)
**Location:** archive-work-unit.md, Step 3

**Current:** "Do any files have lasting reference value outside this work unit's context?"

**Problem:** Pure judgment call with no examples or decision criteria.

**Fix (Zone 3):** Add decision criteria:

```
Files with lasting reference value (move to reference/):
- Investigation/decision docs (why approach X was chosen over Y)
- Reusable procedures (rollback plans, migration guides)
- Performance benchmarks, architecture diagrams

Files without lasting value (archive only):
- Task-specific working notes, debugging logs
- Intermediate drafts superseded by final deliverables
```

### B7: archive-work-unit — "work package" terminology inconsistency

**Zone:** 3 (on-demand)
**Location:** archive-work-unit.md, archive structure section (line ~215)

**Current:** Uses "work package" once where the rest of the framework uses "work unit."

**Fix:** Replace "work package" with "work unit" for consistency.

### B8: process-task-loop — deferred review success criteria vague

**Zone:** 2 (per-session)
**Location:** `3_process-task-loop.md`, lines 78-92

**Current:** "Leave sufficient context for the user to review, iterate, commit, and hand off."

**Problem:** "Sufficient context" undefined. Agent doesn't know what state to leave.

**Fix (Zone 2 — tighten existing text):** Replace with: "Leave the task list updated, quality
gates passing, and changes uncommitted (user decides commit boundaries when they return)."

### B9: 2_generate-tasks — dependency metadata removal step incomplete

**Zone:** 3 (on-demand)
**Location:** `2_generate-tasks.md`, line 21

**Current:** "If the PRD has dependency metadata (Status and Related Work fields), remove them —
dependencies are resolved if you're generating tasks."

**Problem:** Doesn't address the case where dependencies are NOT resolved.

**Fix (Zone 3):** Add: "If dependencies are unresolved (Status shows a blocker), stop and
confirm with the user before generating tasks."

### B10: 2_generate-tasks — task list required sections not summarized

**Zone:** 3 (on-demand)
**Location:** `2_generate-tasks.md`, lines 108-113

**Current:** Defers entirely to strategy-task-list-formatting.md.

**Problem:** Agent must load a second document to know what sections are required.

**Fix (Zone 3):** Add a 1-line summary before the reference: "Required sections: Overview, Scope
(Will Do / Won't Do), phased Tasks with test-first ordering, Verification Phase, and Atomic
Tasks section. See \[strategy-task-list-formatting\]\[task-format\] for the full specification."

### B11: activate-work-unit — `[none]` syntax unexplained

**Zone:** 3 (on-demand)
**Location:** activate-work-unit.md, Step 5

**Current:** "Clear **Blockers** (set to `[none]`)"

**Problem:** Is `[none]` literal markdown? A placeholder? Agent must check existing
WORK-STATUS.md to confirm.

**Fix (Zone 3):** Show the expected output inline or note: "Literal text `[none]` — this is the
standard empty-state marker in WORK-STATUS.md."

### B12: session-handoff — Persistent Context purpose undefined

**Zone:** 2 (per-session — session-handoff.md)
**Location:** session-handoff.md, lines 51, 160-163

**Current:** Explains mechanism (removal triggers) but not purpose (what kinds of things
persist).

**Fix (Zone 2 — minimal):** Add one sentence: "Persistent entries are cross-session constraints
— naming conventions, architectural decisions, deferred work items — that apply until their
removal trigger is met."

### B13: integrate-work-unit — no explicit partial-protection directive after merge

**Zone:** 3 (on-demand)
**Location:** integrate-work-unit.md, "after merge" section (lines 163-171)

**Current:** Full-protection paths are documented; partial protection is implicit (absence of
full-protection note implies direct archival).

**Fix (Zone 3):** Add: "**Partial protection:** Proceed directly to
\[archive-work-unit\]\[archive-work-unit\] on the base branch — no branch setup needed."

---

## Tier C — Polish

Minor gaps that improve consistency but wouldn't block correct execution.

### C1: session-init — WORK-STATUS field names not listed for quick reference

**Zone:** 2
**Location:** session-init.md, Step 7 description (line ~84)

Could list field names parenthetically for quick reference, but the WORK-STATUS file itself is
only ~20 lines and is read in full. Low value-add.

### C2: session-init — team mode detection mechanism

**Zone:** 2
**Location:** session-init.md, active work context section

Team mode is mentioned (SESSION-NOTES.md location changes) but how to detect it isn't spelled
out. Low priority — team mode is not the default path and is configured explicitly.

### C3: session-handoff — override checking assumes init memory

**Zone:** 2
**Location:** session-handoff.md, lines 27-30

"if your project overrides session-state, follow the override instead" — assumes agent remembers
from init. Acceptable since overrides are rare and the reference is clear.

### C4: process-task-loop — Pre-Report Checklist lacks error pathways

**Zone:** 2
**Location:** 3_process-task-loop.md, lines 62-72

If quality gate fails, agent is told to "complete it before proceeding" but no guidance on how.
The quality gate failure section earlier in DEV-RULES.ARC covers this, and the process-task-loop
already has stop conditions for deferred review. Low incremental value.

### C5: 1_create-prd — edge-case feature/technical distinction

**Zone:** 3
**Location:** 1_create-prd.md, Step 2

Distinction between feature and technical is clear for common cases. Edge cases (is a
performance optimization technical or feature?) are judgment calls. Link to
strategy-work-organization exists. Low priority.

### C6: activate-work-unit — "modified files" ambiguity in Step 7

**Zone:** 3
**Location:** activate-work-unit.md, Step 7 staging instructions

"Stage all modified files and commit" — could be interpreted broadly. The code blocks below
list specific files, which is the intended scope. Minor wording tightening would help.

---

## False Positives from Audit

These were flagged by subagents but are not actual issues:

### FP-1: arc-extensions.md "broken reference" in process-task-loop

The execution-loop clarity agent reported `arc-extensions.md` as a broken reference from
`3_process-task-loop.md`. This is incorrect — the file exists at
`.arc/system/workflows/arc-extensions.md` and the relative path `../arc-extensions.md` from the
`arc/` subdirectory resolves correctly. The link validation agent independently confirmed all
286 reference-style link definitions are valid.

### FP-2: arc-config.yml "default mismatch"

The Scenario 5 agent noted that `arc-config.yml` shows `branch.protection: full` while comments
say `partial` is the default. This is correct behavior — the project's own config uses full
protection (non-default) for self-hosting. The comments document the framework default for
adopters. No fix needed.

---

## Scenario 5 Re-walk Results

The corrected Scenario 5 walkthrough (partial + pm.mode:none) confirmed the out-of-box path is
**smooth**. All cross-references resolve, all conditionals branch correctly, no dead-ends. The
two minor gaps identified (session-init Step 5 partial protection implicit, integrate-work-unit
after-merge partial path implicit) are captured as B2 and B13 above.

---

## Implementation Notes

### Ordering

Infrastructure items (I-1, I-2, I-3) are independent and can be done first or in parallel with
content work.

Tier A items should be addressed before Tier B. Within Tier A, the Zone 2 items (A1-A3, in
process-task-loop) affect every task execution and should be prioritized.

Tier B and C items can be addressed in any order. Group by document for efficiency — multiple
fixes to the same file in one pass.

### Zone 2 Additions — Budget Check

Tier A adds to Zone 2 documents (process-task-loop):

- A1 (quality gate tier summary): +3 lines, replaces vague reference
- A2 (coherent unit definition): ~0 net lines, tightens existing text
- A3 (WORK-STATUS format note): +3 lines, prevents template loading

Tier B adds to Zone 2 documents (session-init, session-handoff, process-task-loop):

- B1 (pm.mode:none parity): +2 lines
- B2 (protection mode clause): +1 clause (not a new line)
- B3 (extensions mechanism): 0 net lines (replace, not add)
- B4 (override explanation): +1 clause
- B8 (deferred review criteria): 0 net lines (replace vague with specific)
- B12 (persistent context purpose): +1 sentence

**Estimated net addition to Zone 2 documents: ~10 lines across 3 files.** Well within
acceptable bounds — these are targeted precision additions, not paragraph expansions.

### Quality Gate

Run Tier 1 (per-file lint) on each modified file. Run Tier 3 (full lint suite) after all
changes are complete.

---

[arc-ext-post-context-load]: ../../../system/extensions/post-context-load.md
