# Task List: burn-in-probe-a

- **Design:** `spec-burn-in-probe-a.md`

---

## **Phase 1:** Burn-In Evidence Capture

_Purpose:_ Capture the lifecycle evidence this disposable Wave 1 fixture exists to produce, with a small
`notes-burn-in-probe-a.md` companion as the durable record.

### `[x]` **1.1 Create the burn-in evidence log**

- _Goal:_ `notes-burn-in-probe-a.md` records the spawned-worktree lifecycle evidence needed to evaluate this
  fixture.

- _Outcome:_ Created `notes-burn-in-probe-a.md` with the observed spawn/session-init facts, PR #201/#202
  notes-status reprobes, artifact-placement correction, stale-upstream recovery, and sibling-touch warnings.

### `[x]` **1.2 Exercise handoff and resume evidence**

- _Goal:_ The evidence log shows whether first-handoff notes save/load works for this work unit.

- _Outcome:_ Ran the active-WU handoff path, synced the handoff note via a paired worktree/notes push, and
  recorded the post-handoff session-init result in `notes-burn-in-probe-a.md`: saved notes were current at
  `f29419c9`, with no false drift or reconcile prompt.

### `[x]` **1.3 Capture sibling coordination and integration evidence**

- _Goal:_ The evidence log shows whether this fixture coordinated cleanly with sibling burn-in work through
  integration.

- _Outcome:_ Recorded the final base and coordination reprobe in `notes-burn-in-probe-a.md`: current `main` was
  already contained, session-init resolved Task 1.3 cleanly, sibling overlap stayed visible through advisory
  warnings, and no false notes-drift or silent state contention surfaced.

## **Phase 2:** Verification

### `[x]` **2.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ `npm run -s lint:md`, `npm run lint:ts`, `npm run lint:sh`,
  `npm run typecheck:all`, `npm test`, and `npm run build` all passed.
- _Success criteria:_ 7 criteria checked against `spec-burn-in-probe-a.md`; all 7 met.

---

## Success Criteria

- `[x]` `notes-burn-in-probe-a.md` records seeded `SESSION-NOTES` boot evidence.
- `[x]` `notes-burn-in-probe-a.md` records first-handoff notes save/load evidence.
- `[x]` `notes-burn-in-probe-a.md` records a clean post-merge reprobe.
- `[x]` `notes-burn-in-probe-a.md` records sibling coordination during integration.
- `[x]` `notes-burn-in-probe-a.md` records no false notes drift or silent state contention.
- `[x]` All quality gates pass.
- `[x]` Ready for integration.
