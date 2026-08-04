# Metadata: Staleness-Guard Hard-Fail Policy

| **State** | **Owner** | **Branch**                   | **Class** | **Priority** |
| --------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `fix/staleness-guard-policy` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-staleness-guard-policy.md`
- **Task List:** `tasks-staleness-guard-policy.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Finalized `spec-staleness-guard-policy.md` at the `outline` form — the per-command
  hard-fail taxonomy is replaced by unconditional refusal against the built bundle, with a fast runtime-only
  rebuild as the remedy; the launcher and rebuild-on-invoke direction is rejected with recorded revisit triggers
  (2026-08-04).
- **Next Task:** Task 1.1 — Add the runtime-only build path (line ~19)
- **Blockers:** [none]

- **Next Action:** Begin Task 1.1 — derive the declaration-free tsup config and expose `build:fast` at the
  package and the repository root

- **PR URL:** [none]
- **Completed:** [none]

---
