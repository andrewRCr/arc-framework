# Metadata: session-locus-model

| **State** | **Owner** | **Branch**                 | **Class** | **Priority** |
| --------- | --------- | -------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `feat/session-locus-model` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-session-locus-model.md`
- **Task List:** `tasks-session-locus-model.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.F.a.iii — Release the occupancy an in-place close leaves behind
- **Next Task:** Task 7.E.c.iv — Prove ownership before partial settlement mutates the inbox (line ~1354)
- **Blockers:** Retired-Errand residue occupies the primary — `test-fixture-cwd-path`'s role row survives its
  close with an unresolvable subject. Its lease was live at handoff, so `arc locus release` refused it as
  untrusted and `arc locus resolve` refused it as live; handoff itself refused `locus-unresolved`. The lease
  dies with the session, so the next session resolves it.

- **Next Action:** Clear the residue before any task work: `arc locus resolve
  sha256:aa0fd1be1eabefe3f84f969bdeb4c92181f3fe6654366acc6b6f0d993599ec5a --action abandon` — the live
  dogfood proof of Task 7.F.a.iii — then begin Task 7.E.c.iv

- **PR URL:** [none]
- **Completed:** [none]

---
