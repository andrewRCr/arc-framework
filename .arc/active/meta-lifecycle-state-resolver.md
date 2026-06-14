# Metadata: lifecycle-state-resolver

| **State**  | **Owner** | **Branch**                      | **Class** | **Priority** |
|------------|-----------|---------------------------------|-----------|--------------|
| `Planning` | `andrew`  | `plan/lifecycle-state-resolver` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-lifecycle-state-resolver.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `generate-tasks.md` — the `detailed`·RFC spec is saved and self-reviewed. It crystallizes
  the `(phase, location)` model, the one-index / two-projections resolver (slug→state + cohort-membership), the
  archival-trigger detection, and the dep-state read half; the three entry-time open questions are resolved
  (single scan, pair + enum + `occupied?`/`shipped?` predicates, one index). Scale read keys on the implementation
  surface — a `src/lib/` pure-logic module plus fixtures.

---
