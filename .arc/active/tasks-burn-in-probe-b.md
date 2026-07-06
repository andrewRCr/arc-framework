# Task List: burn-in-probe-b

- **Design:** `spec-burn-in-probe-b.md`

---

## **Phase 1:** Capture burn-in evidence

_Purpose:_ Produce the disposable Wave 1 evidence log for this spawned worktree. This phase stays doc-only and
records the lifecycle observations the fixture exists to exercise: boot-rich startup, notes save/load behavior,
ROADMAP/base contention, integration ordering, and cleanup readiness.

### `[ ]` **1.1 Create the evidence log scaffold**

- _Goal:_ `notes-burn-in-probe-b.md` exists with a clear structure for every required burn-in observation.

    - Create `notes-burn-in-probe-b.md` beside the spec and task list.
    - Include sections for spawned-worktree boot, notes save/load convergence, ROADMAP/base contention,
      integration ordering, archival/worktree cleanup, and observations not exercised.
    - Seed the current baseline: this worktree launched, the spec/task planning artifacts exist under
      `.arc/active/`, and `SESSION-NOTES` is seeded on disk but not yet saved to the notes ref.

### `[ ]` **1.2 Record the handoff-to-resume evidence pass**

- _Goal:_ The evidence log records at least one session handoff-to-resume cycle and the resulting notes behavior.

    - Run or resume across one real handoff boundary for this work unit.
    - After resume, record the observed `npx arc status --session-init --json` notes state in
      `notes-burn-in-probe-b.md`.
    - Confirm whether notes save/load converged, or record the exact non-converged state and recovery action.
    - Record any ROADMAP/base contention, integration-ordering, or archival/worktree-cleanup observations that
      surface during the lifecycle; if a condition was not observed, call that out explicitly in the
      observations-not-exercised section.

## **Phase 2:** Verification

### `[ ]` **2.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` `notes-burn-in-probe-b.md` records spawned-worktree boot evidence.
- `[ ]` `notes-burn-in-probe-b.md` records notes save/load convergence evidence after at least one
  handoff-to-resume cycle.
- `[ ]` `notes-burn-in-probe-b.md` records ROADMAP/base contention, integration ordering, and
  archival/worktree-cleanup observations, or explicitly says each was not observed.
- `[ ]` All quality gates pass.
- `[ ]` Ready for integration.
