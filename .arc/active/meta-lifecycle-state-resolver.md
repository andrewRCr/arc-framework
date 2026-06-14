# Metadata: lifecycle-state-resolver

| **State**  | **Owner** | **Branch**                      | **Class** | **Priority** |
|------------|-----------|---------------------------------|-----------|--------------|
| `Planning` | `andrew`  | `plan/lifecycle-state-resolver` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-lifecycle-state-resolver.md`
- **Task List:** `tasks-lifecycle-state-resolver.md`

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `activate-work-unit.md` — task list generated at `high` depth (5 phases: state-space model
  & index → Projection A slug→state → Projection B membership & archival-trigger → consumer reads & queryable
  surface → verification). Grounding audit settled `parked = (Active, planned)`, `shipped?` as merged-fact-only
  (integration-time readiness deferred to `lifecycle-transition-core`), and migration of the cohort-consistency
  validator onto the resolver. Activation can defer until implementation begins.

---
