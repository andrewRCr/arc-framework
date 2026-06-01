# Metadata: Work-Routing Discipline

- **State:** Active
- **Owner:** andrew
- **Branch:** `feat/work-routing-discipline`

- **Origin:** [internal]
- **Design:** `spec-work-routing-discipline.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-routing-discipline.md`
- **Last Completed:** Task 4.4 — errand-state probe: pure detection libs (errand-resume, in-flight-errand
  classifier, materialize candidates) + repoint of the staleness sweep onto `_Remind:_`-flagged `USER-INBOX`
  entries, the `errands.staleness_days` → `inbox.remind_after_days` rename (default 1), and a once/day
  rate-limit gate. Also closes 4.1–4.3 (inboxState probe + envelope wiring + housekeep intent/soft-offer).
- **Next Task:** Task 4.5 — session-init errand arms (workflow wiring) (line ~711)
- **Blockers:** [none]

- **Next Action:** Start Task 4.5 — wire the 4.4 probe libs into session-init (workflow + envelope): errand-resume
  arm (4.5.a — on `detectErrandResume`, load `run-errand`, not `process-task-loop`); `--errand` cold dispatch +
  discovery surfacing (4.5.b); materialize consumption + in-flight advisory with the rate-limited nudge (4.5.c).
  Note: the 4.4 libs are pure with caller-side git/forge enumeration still unwired — 4.5 supplies it + the
  `errandState` envelope slot + the `shouldNudge` marker file I/O.

---
