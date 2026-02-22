# Plan: ARC Methodology Gaps

**Origin:** Gaps discovered during structural readiness pass (code review, archive workflow execution)
**Status:** Collecting — not yet scoped as a formal work unit

---

## Context

The structural readiness pass introduced several new concepts (many-to-one branch model, team
coordination, configurable branching) that are structurally complete but revealed methodology gaps
during execution and code review. These gaps share a common theme: ARC's operational workflows and
conventions need refinement to fully support the new structural capabilities.

These items were initially captured as atomic tasks but are individually too large for atomic
treatment and collectively form a natural work unit.

## Candidate Items

### Workflow Gaps

- **Create `rotate-branch.md` supplemental workflow for intermediate branch transitions**

    Multi-branch work units (stacked PRs, team sub-branches, phased delivery) are supported
    by the many-to-one branch-task-list model, but the workflow system has no guidance for
    branch transitions mid-work-unit. `activate-work-unit.md` covers the first branch,
    `archive-completed.md` covers the last — nothing covers the middle.

    What variance looks like without it:

    - Inconsistent quality gate tiers at intermediate merges (Tier 1? Tier 2?)
    - No pattern for PR descriptions on partial work (completion doc doesn't apply)
    - Task list branch metadata (`Branch(es):` field) updated inconsistently or forgotten
    - Next branch setup is ad-hoc (branch from updated base? current HEAD?)
    - Session state (CURRENT-SESSION.md) may not reflect the branch change

    What the workflow should cover (lightweight):

    1. When to rotate (decision criteria: phase boundary, diff size, reviewability)
    2. Pre-merge checklist (quality tier, task list branch metadata update, PR description
       pattern for partial work)
    3. Next branch setup (create from updated base after merge)
    4. Session state update

    No archival, no completion doc, no PROJECT-STATUS/ROADMAP — those are end-of-work-unit
    concerns. This is the clean handoff from one branch to the next within the same work unit.

- **Audit ARC workflows and guidance for multi-branch / team gaps**

    The many-to-one branch model and team coordination content are new and untested in
    practice (solo dev, branches historically tied 1:1 to work units). The `rotate-branch`
    gap was found during archive workflow execution — there are likely other gaps.

    Scope: Gap analysis across all workflows and non-workflow guidance (strategies,
    DEVELOPMENT-RULES, agent files) with emphasis on:

    - Multi-branch work unit scenarios (stacked PRs, phased delivery, team sub-branches)
    - Team coordination touchpoints (task ownership handoffs, shared branch patterns)
    - Assumptions that implicitly rely on 1:1 branch-to-work-unit coupling
    - Any workflow steps that reference "the branch" (singular) where multi-branch is possible

    Output: List of gaps with severity (blocks adoption vs. causes variance vs. cosmetic)
    and recommended fixes (workflow update, new workflow, strategy addition, etc.).

### Convention Gaps

- **Establish evolution guidance for semi-immutable documents (PRDs, ADRs)**

    PRDs and ADRs are treated as semi-immutable but lack clear guidance on what happens when
    reality diverges from the original document. Current state:

    - ADRs: Have supersede guidance (new ADR replaces old), but amendment mechanics for
      minor corrections vs. full supersession are undocumented
    - PRDs: No formal guidance. Completed PRDs may drift from implementation (e.g.,
      file paths changed during implementation) with no documented convention for whether
      to amend, annotate, or leave as historical record
    - Task lists: Well-covered — success criteria validation checks reality, not just
      checkboxes

    Approach: Research first, then design. Research ADR amendment practices (RFC 2119-style,
    ADR tools ecosystem) and PRD evolution patterns. Determine whether a unified amendment
    format works across both document types or if they need different treatment.

    Key design question: Should amendments be inline annotations or separate sections? ADRs
    have prior art; PRDs likely need a lighter touch since they're planning artifacts, not
    architectural contracts.

- **Add intermediate work-unit status between "In Progress" and "Complete"**

    The archive-completed workflow updates PROJECT-STATUS and ROADMAP in Phase 3 (post-merge),
    but work is functionally done in Phase 1. Two states can't represent three realities:
    actively being worked on, done but unmerged, and merged+archived.

    Current thinking: A three-state progression could eliminate the gap. Possible labels for
    the intermediate state (not yet decided): "In Review", "Pending Merge", "Awaiting Review",
    "Complete (unmerged)".

    Additional scope: Standardize the canonical status values across all docs that reference
    them. Currently inconsistent — `maintain-task-notes.md` alone had "COMPLETE", "Completed",
    and "Complete" (fixed to "Complete" during review, but the broader set of valid values
    needs documenting alongside the new intermediate state).

    Likely touchpoints: PROJECT-STATUS template, archive-completed workflow,
    agent-pre-merge-review, maintain-task-notes.md, ROADMAP conventions.

- **Prevent version reference drift when source docs are updated**

    When a versioned source-of-truth doc (e.g., DEVELOPMENT-RULES.md) gets its version bumped,
    downstream files that reference the version can silently drift.

    Options to evaluate:

    - Behavioral norm in development methodology (agent remembers to cascade)
    - Githook validation (automated check that references match source)
    - Both: behavioral norm as guidance, githook as safety net

    Could scope broader than just version strings — any cross-doc reference that should stay
    in sync — but start with the concrete version reference case.

### Structural Questions

- **Reconsider PROJECT-STATUS location** — Currently in `reference/constitution/` alongside
  META-PRD, TECHNICAL-OVERVIEW, and DEVELOPMENT-RULES. Those are project *identity* docs
  (what it is, how it's built, what rules govern it) that change infrequently. PROJECT-STATUS
  is *operational state* that changes regularly — closer in nature to ROADMAP than META-PRD.

    Options considered:

    1. Repo root — maximum visibility for public-facing use, but breaks `.arc/` containment
    2. `.arc/` root — visible within ARC directory, not buried in subdirectory (leaning here)
    3. `reference/` root (not `constitution/`) — reference material without constitutional claim
    4. Leave it — "constitution" is a loose grouping and it's findable where it is

    Touchpoints if moved: `02_define-project.md`, `archive-completed.md`, `weekly-review.md`,
    PROJECT-STATUS template, any workflow referencing `reference/constitution/PROJECT-STATUS.md`.

### Template Usability

- **Add githook customization guidance** — The pre-commit hook's meta-project reference check
  (CHECK 8) uses simple patterns (`Task X.Y`, `Phase X`, `.arc/`) that could produce false
  positives in domain-specific code (e.g., games with phases, multi-step processes). The hook
  should include a comment or documentation noting that adopters may need to adjust patterns
  for their domain. Could range from a simple comment to configurable suppression (e.g.,
  per-file opt-out token, configurable patterns in `arc-config.yml`).

## Planning Notes

- The audit item may subsume or expand the rotate-branch item depending on what gaps are found
- The convention gaps (doc evolution, status values, version drift) may be independent enough
  to handle as a separate smaller work unit or as atomic tasks after research clarifies scope
- External research needed for: ADR amendment practices, PRD evolution patterns
- No formal PRD needed until this is prioritized for execution — this doc captures the planning
  surface for scoping decisions

---

**Created:** 2026-02-21 (during structural readiness pass code review)
