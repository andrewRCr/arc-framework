# Notes: Structural Validation

Working notes for the structural validation work unit. Organized by topic — sections added
as phases produce findings.

---

## Scenario Definitions (Phase 0)

Reusable scenario set for navigability walkthrough (Phase 0 baseline) and post-change validation
(Phase 8). Each scenario defines a lifecycle path through ARC workflows, parameterized by
`branch.protection` mode from `arc-config.yml`.

### Scenario Set

**Scenario 1: Full Protection — Batch Transition**

- **Protection mode**: `full`
- **Context**: Work unit complete, next work unit planned. Most common fully protected lifecycle.
- **Path**: integrate-work-unit → *(merge PR)* → activate-planning-branch → archive-work-unit →
  1_create-prd → 2_generate-tasks → integrate-planning-branch → *(merge PR)* → activate-work-unit
  → 3_process-task-loop
- **Key characteristic**: Two PRs bracket the lifecycle transition — one for implementation, one
  for planning artifacts. The planning branch carries both archival and planning.
- **Config**: `branch.protection: full`, `pm.mode: arc-in-git`

**Scenario 2: Full Protection — Standalone Archival**

- **Protection mode**: `full`
- **Context**: Work unit complete, no next work unit imminent.
- **Path**: integrate-work-unit → *(merge PR)* → create housekeeping branch
  (`chore/archive-{name}`) → archive-work-unit → *(push, PR, merge)* → base branch with no
  active work
- **Key characteristic**: No activate-planning-branch — standalone archival uses a short-lived
  housekeeping branch, not a planning branch. archive-work-unit § header note documents both
  approaches.
- **Config**: `branch.protection: full`, `pm.mode: arc-in-git`
- **Note**: The task list's seeded scenario listed activate-planning-branch in this path. Corrected
  per archive-work-unit guidance: planning branches are for planning work; standalone archival uses
  a housekeeping branch.

**Scenario 3: Partial Protection — Direct Commit Lifecycle**

- **Protection mode**: `partial`
- **Context**: Solo developer, work unit complete, next work unit planned. Planning artifacts
  committed directly to base branch (documented exception for solo developers).
- **Path**: integrate-work-unit → *(merge PR)* → archive-work-unit *(on base branch)* →
  1_create-prd → 2_generate-tasks → activate-work-unit → 3_process-task-loop
- **Key characteristic**: Implementation still uses branches and PRs, but lifecycle transitions
  (archival, planning) happen directly on the base branch. No planning branch overhead.
- **Config**: `branch.protection: partial`, `pm.mode: arc-in-git`

**Scenario 4: Full Protection — Standalone Planning (New Session)**

- **Protection mode**: `full`
- **Context**: No prior work unit to integrate. Starting a new planning cycle — either first work
  unit, or returning after standalone archival left no active work.
- **Path**: session-init *(next-work-unit discovery)* → activate-planning-branch → 1_create-prd →
  2_generate-tasks → integrate-planning-branch → *(merge PR)* → activate-work-unit →
  3_process-task-loop
- **Key characteristic**: Entry point is session-init discovery (Step 5), not integrate-work-unit.
  The agent reads ROADMAP.md, checks backlog for existing artifacts, and proposes next steps.
- **Config**: `branch.protection: full`, `pm.mode: arc-in-git`

**Scenario 5: Default Configuration — Out-of-Box Experience**

- **Protection mode**: `partial`
- **Context**: New adopter using ARC defaults (`pm.mode: none`, `branch.protection: partial`).
  No backlog directory — files save directly to `active/`. Exercises the alternate artifact path
  that most new adopters will encounter first.
- **Path**: session-init → 1_create-prd *(saves to `active/`)* → 2_generate-tasks *(saves to
  `active/`)* → activate-work-unit *(skips Steps 1, 3 — files already in active)* →
  3_process-task-loop → integrate-work-unit → *(merge PR)* → archive-work-unit *(on base
  branch)* → next cycle
- **Key characteristic**: No `backlog/` directory. create-prd and generate-tasks save directly
  to `active/{category}/`. activate-work-unit skips file-move steps. Mode-detection sections in
  multiple workflows route to the `none/external` path.
- **Config**: `branch.protection: partial`, `pm.mode: none`

### Scenario Coverage Notes

**What's covered**: Five scenarios spanning both protection modes (partial, full) and three
lifecycle patterns (batch transition, standalone archival, new-session entry). Also covers both
PM modes (`arc-in-git` and `none`) to exercise different artifact paths.

**What's not covered** (intentionally excluded — edge cases, not primary paths):

- Multi-branch work units (rotate-branch intermediate merges) — same files/paths, process-level
  concern only
- Stacked incidental work (parent/child WU relationships) — same `active/{category}/` paths
- `pm.mode: external` — same workflow structure as `none`, different tracker integration
- Partial protection with planning branch (hybrid) — same workflows as Scenario 1
- Plan-\* exploration phase before create-prd — convention, not a distinct workflow

---

## Navigability Findings (Phase 0)

*Populated during Task 0.2 walkthrough. Each finding includes: scenario, workflow, specific
location, severity, and phase tag for downstream consumption.*

### Finding Template

```markdown
**[F-nn]** severity · scenario · workflow · location
Description of the issue.
**Phase tag**: Phase N (reason)
```

### Findings

**[F-01]** high · all scenarios · `3_process-task-loop.md` · end of document (after Verification
Phase section)

No forward link to integrate-work-unit after task completion. The document jumps from the
Verification Phase reference directly to Incidental Work Management. verify-completion.md
mentions integrate-work-unit as a relationship note, not a routing link. Every scenario ends
with the task loop, so this dead-end affects all paths.

**Phase tag**: Phase 6.1 (forward link missing from the workflow agents spend most time in)

---

**[F-02]** medium · Scenarios 1, 4 · `2_generate-tasks.md` · "Next Step" section (lines 112–119)

Forward link goes unconditionally to activate-work-unit. Under full protection, the correct
next step is integrate-planning-branch (PR the planning branch, merge, then activate). An agent
following the explicit link would attempt activation while artifacts are still on a planning
branch, hitting a prerequisite mismatch. activate-planning-branch documents the correct sequence
in its "What comes after" section, but 2_generate-tasks doesn't reference it.

**Phase tag**: Phase 6.2 (branch.protection drives different post-planning routing, but the
conditional is absent from this convergence point)

---

**[F-03]** medium · Scenarios 1, 2 · `integrate-work-unit.md` · Step 8, full protection note
(lines 163–166)

Under full protection, directs agent to activate-planning-branch without conditioning on whether
a next work unit is planned. Two distinct paths exist: batch (next WU planned → planning branch)
and standalone archival (no next WU → housekeeping branch). The decision point is not surfaced
here — agent must read ahead to archive-work-unit or activate-planning-branch to discover the
fork.

**Phase tag**: Phase 2 (routing decision spans multiple files without a clear entry point)

---

**[F-04]** medium · Scenarios 1, 3 · `1_create-prd.md` and `2_generate-tasks.md` · workflow
bodies

Neither workflow mentions branch context — whether the agent should be on a planning branch or
the base branch when creating artifacts. After archive-work-unit (Scenario 3) or
activate-planning-branch (Scenario 1), the agent transitions into these workflows with no
confirmation of expected branch state. The planning branch decision logic exists in
activate-planning-branch and strategy-work-organization but not in the workflows that execute
on that branch.

**Phase tag**: Phase 6.1 (branch context guidance scattered — exists in supplemental workflows
and strategy but absent from main numbered workflows)

---

**[F-05]** medium · Scenario 2 · `archive-work-unit.md` · prerequisites section (line 20)

Standalone archival under full protection requires a housekeeping branch
(`chore/archive-{name}`), but no workflow step creates it. The prerequisites mention it should
exist; the full protection header note describes it as an option. But the procedural "create
this branch now" instruction is missing. Agent must infer from prerequisites that branch creation
is their responsibility.

**Phase tag**: Phase 2 (missing procedural step for a protection-mode-specific operation)

---

**[F-06]** medium · Scenario 3 · `activate-work-unit.md` · prerequisites (lines 30–39)

Prerequisites state planning artifacts arrive via "Planning branch PR (partially or fully
protected)" — implying planning branches are required for partial protection. But
strategy-work-organization § Partially Protected documents that solo developers may commit
directly to base branch as a documented exception. The contradiction means an agent under partial
protection who committed directly would question whether they followed the correct path.

**Phase tag**: Phase 6.2 (partial protection semantics not integrated into workflow prerequisites)

---

**[F-07]** medium · Scenario 5 · `session-init.md` · Step 5, "Next work unit discovery" (lines
190–201)

Discovery guidance is scoped to `pm.mode: arc-in-git` only. For `pm.mode: none` (the default),
there is no equivalent section. The correct guidance ("Create a PRD when ready → 1_create-prd")
exists in archive-work-unit (line 115) but not in session-init. A new adopter with default
configuration hits a gap at the entry point.

**Phase tag**: Phase 6.2 (pm.mode conditional coverage incomplete at the discovery entry point)

---

### Metrics Summary

| Scenario | Docs Loaded | Conditionals Parsed | Cross-Ref Hops | Issues Hit |
|----------|-------------|---------------------|----------------|------------|
| S1       | 8           | 3                   | 2              | F-01–04    |
| S2       | 5           | 4                   | 3              | F-01,03,05 |
| S3       | 6           | 6                   | 1              | F-01,04,06 |
| S4       | 10          | 8                   | 3              | F-01,02    |
| S5       | 10          | 10                  | 18             | F-01,02,07 |

**Observation**: Scenario 5 (out-of-box) has the highest cross-reference hop count (18),
reflecting the cost of pm.mode conditionals spread across every workflow. Scenario 2 (standalone
archival) has the fewest docs loaded but the most ambiguous routing.

---

## Phase Input Tags

Cross-reference of findings by downstream phase.

**Phase 2** (directory evaluation): F-03, F-05
— Routing decisions that span multiple files; missing procedural steps for mode-specific operations

**Phase 6.1** (de-duplication): F-01, F-04
— Forward links missing from main workflows; branch context guidance scattered across supplemental
workflows and strategy docs instead of being present where agents need it

**Phase 6.2** (dependency map): F-02, F-06, F-07
— Cross-cutting conditionals (branch.protection, pm.mode) that create density at convergence
points; mode-specific semantics not fully integrated into workflow decision points
