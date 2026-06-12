# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch** | **Class** | **Priority** |
| ---------- | --------- | ---------- | --------- | ------------ |
| `Planning` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `draft-async-merge-lifecycle.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** **Parked to backlog at draft** pending `notes-merge-coherence` (the build-first upstream).
  Decided to settle the engine contract before sinking spec/task work here — `async-merge-lifecycle` is at its
  cheapest stage to hold, and the notes-sync leg is the one buildable that binds to the notes engine (the other ~9
  are independent). **Resume via `init-work-unit` Path A** (graduate this stub from `backlog/planned/` → `active/`,
  which re-cuts `plan/async-merge-lifecycle`), then continue `create-spec.md` from `draft-async-merge-lifecycle.md`
  once `notes-merge-coherence` is at least spec'd (ideally shipped — lets this member ground against shipped code),
  re-grounding the notes-sync leg against its settled contract. Touchpoints already re-grounded (2026-06-12 sweep —
  draft holds, no rebuild). The eager-vs-lazy post-merge teardown § Open is still to decide at this spec.

---
