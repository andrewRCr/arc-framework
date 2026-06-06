# Metadata: Out-of-WU Session Entry

| **State**  | **Owner** | **Branch** | **Class** | **Priority** |
| ---------- | --------- | ---------- | --------- | ------------ |
| `Planning` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism`
- **Depends On:** [none] (upstream — errand-enablement, work-routing-discipline, in-flight-awareness — all shipped)

- **Origin:** [internal]
- **Design:** `draft-out-of-wu-entry.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Promote to spec. Core: realign `session-init`'s entry dispatch so an explicit
  `--errand` (and a future `--housekeep`) signal routes on the **Resume** arm (active WU present), not
  only on Orient — retiring the circular "Errand signal not consumed (non-Orient arms)" rule and reaching
  `run-errand`'s existing relocation path. Folds in: bare-`--errand` validity + short-circuit wording
  (`arc-session` skill / `session-init`); atomic captures carrying a stable slug (`arc-inbox`); and the
  design-bearing `--housekeep`-flag-vs-warm-path question. See `draft-out-of-wu-entry.md` § Scope and
  § Open Questions. Independently shippable — not gated on CWC/AWL.

---
