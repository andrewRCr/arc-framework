# Metadata: lifecycle-state-resolver

| **State**  | **Owner** | **Branch**                      | **Class** | **Priority** |
|------------|-----------|---------------------------------|-----------|--------------|
| `Planning` | `andrew`  | `plan/lifecycle-state-resolver` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `draft-lifecycle-state-resolver.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `create-spec.md`. The draft is formalization-ready — the contract is settled (state
  enum, location-first resolution order, no-`git`-inference guard); spec-time work is the open questions
  (index shape + caching/invalidation, dep-edge discharge composing with `activate`'s mutator sequence,
  one-index-two-projections).

---
