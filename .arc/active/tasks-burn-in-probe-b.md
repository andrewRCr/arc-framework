# Task List: burn-in-probe-b

- **Design:** `spec-burn-in-probe-b.md`

---

## **Phase 1:** Capture burn-in evidence

_Purpose:_ Produce the disposable Wave 1 evidence log for this spawned worktree. This phase stays doc-only and
records the lifecycle observations the fixture exists to exercise: boot-rich startup, notes save/load behavior,
ROADMAP/base contention, integration ordering, and cleanup readiness.

### `[x]` **1.1 Create the evidence log scaffold**

- _Goal:_ `notes-burn-in-probe-b.md` exists with a clear structure for every required burn-in observation.

- _Outcome:_ Created `notes-burn-in-probe-b.md` with sections for every required burn-in observation and seeded
  the current baseline: spawned worktree active, planning artifacts present, ROADMAP activation render recorded,
  and `SESSION-NOTES.md` still in the expected seeded-but-not-yet-saved state before first handoff.

### `[x]` **1.2 Record the handoff-to-resume evidence pass**

- _Goal:_ The evidence log records at least one session handoff-to-resume cycle and the resulting notes behavior.

- _Outcome:_ Recorded the July 9 resume evidence in `notes-burn-in-probe-b.md`: session-init now reports local
  notes matching remote notes with latest local user note current at `edc952d9`; the evidence log also records
  the later `main` merge's `ROADMAP.md` conflict and keeps integration/cleanup items explicitly unexercised.

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
