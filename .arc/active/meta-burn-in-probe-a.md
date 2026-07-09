# Metadata: burn-in-probe-a

| **State**     | **Owner** | **Branch**              | **Class** | **Priority** |
| ------------- | --------- | ----------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `chore/burn-in-probe-a` | `Light`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal] — purpose-built burn-in fixture for finalize-parallelism wave 1 (disposable).
- **Design:** `spec-burn-in-probe-a.md`
- **Task List:** `tasks-burn-in-probe-a.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 2.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Completion Notes

burn-in-probe-a completed its role as a disposable doc-only lifecycle fixture for the first parallelism burn-in
wave. It exercised a spawned worktree from planning through integration entry, including seeded session context,
the first handoff/save/resume cycle, repeated base updates, branch activation, sibling-worktree coordination, and
the transition into an open integration PR. Its tracked evidence log preserves the observed behavior rather than
introducing any production methodology or CLI change.

The fixture confirmed that the spawned session booted rich, branch-bounded notes followed the owning branch,
session-init recovered the correct work-unit context after handoff, and foreign-write overlap remained loud and
advisory. During integration, a concurrent primary-checkout transition changed the live project roster after the
initial ROADMAP render; the staged-index assertion rejected that stale projection, and a fresh render recovered
cleanly before commit. This supplied an additional live proof that derived-state contention fails safely.

Verification passed the full local Tier 3 gate and both required PR checks. Findings that belonged outside the
fixture were routed to their owning work rather than repaired here, preserving the fixture's evidence-only scope.
