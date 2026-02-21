# Atomic Tasks - ARC Framework

**Purpose:** Small, one-off tasks that are ready to execute (GTD "Next Actions").

**How to use:**

1. Add tasks with checkboxes under "Active" section
2. When complete:
   - Mark `[x]` and add completion notes
   - Move to `reference/archive/{quarter}/completed-atomic-{quarter}.md` (insert at top)
   - Add branch line after completion notes (with empty line separator):

     ```markdown
     - [x] Task description
         - **Outcome:** What was done, key changes
         - **Files:** list of modified files

         - **Branch:** `feature/feature-name` or `technical/tech-name`
     ```

3. Commit atomic work with: `Context: {category} (atomic / no associated task list)`
   - Categories: maintenance, refactor, documentation, planning

**Referencing completed work:** "see {task name} in `completed-atomic-{quarter}.md`"

- Quick access: [Current quarter archive](../reference/archive/2026-q1/)
- **Quarter format:** Use `YYYY-qN` (e.g., `2025-q4` for Oct-Dec 2025)

---

## Active

- [ ] **Create `rotate-branch.md` supplemental workflow for intermediate branch transitions**

    Multi-branch work units (stacked PRs, team sub-branches, phased delivery) are supported
    by the many-to-one branch-task-list model, but the workflow system has no guidance for
    branch transitions mid-work-unit. `activate-work-unit.md` covers the first branch,
    `archive-completed.md` covers the last — nothing covers the middle.

    **What variance looks like without it:**

    - Inconsistent quality gate tiers at intermediate merges (Tier 1? Tier 2?)
    - No pattern for PR descriptions on partial work (completion doc doesn't apply)
    - Task list branch metadata (`Branch(es):` field) updated inconsistently or forgotten
    - Next branch setup is ad-hoc (branch from updated base? current HEAD?)
    - Session state (CURRENT-SESSION.md) may not reflect the branch change

    **What the workflow should cover (lightweight):**

    1. When to rotate (decision criteria: phase boundary, diff size, reviewability)
    2. Pre-merge checklist (quality tier, task list branch metadata update, PR description
       pattern for partial work)
    3. Next branch setup (create from updated base after merge)
    4. Session state update

    No archival, no completion doc, no PROJECT-STATUS/ROADMAP — those are end-of-work-unit
    concerns. This is the clean handoff from one branch to the next within the same work unit.

- [ ] **Audit ARC workflows and guidance for multi-branch / team gaps**

    The many-to-one branch model and team coordination content are new and untested in
    practice (solo dev, branches historically tied 1:1 to work units). The `rotate-branch`
    gap was found during archive workflow execution — there are likely other gaps.

    **Scope:** Gap analysis across all workflows and non-workflow guidance (strategies,
    DEVELOPMENT-RULES, agent files) with emphasis on:

    - Multi-branch work unit scenarios (stacked PRs, phased delivery, team sub-branches)
    - Team coordination touchpoints (task ownership handoffs, shared branch patterns)
    - Assumptions that implicitly rely on 1:1 branch-to-work-unit coupling
    - Any workflow steps that reference "the branch" (singular) where multi-branch is possible

    **Output:** List of gaps with severity (blocks adoption vs. causes variance vs. cosmetic)
    and recommended fixes (workflow update, new workflow, strategy addition, etc.).

<!-- General refinement pass escalated to task list: tasks-content-refinement-pass.md
     (in progress on branch technical/content-refinement-pass). -->
