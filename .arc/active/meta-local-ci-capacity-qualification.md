# Metadata: local-ci-capacity-qualification

| **State**     | **Owner** | **Branch**                              | **Class** | **Priority** |
| ------------- | --------- | --------------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `chore/local-ci-capacity-qualification` | `Light`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** `e2e-feedback-six-shard-rebalance Errand follow-up`
- **Design:** `spec-local-ci-capacity-qualification.md`
- **Task List:** `tasks-local-ci-capacity-qualification.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:6f5247dbea2653caa3386452b5e06ab42d354bfcdcec472ffa18567396a29758`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Completion Notes

Qualified the Mac mini's arm64 Lima guest as the routine Linux CI target and shipped what operates it: a
digest-pinned instance recipe with no host mounts, forwarded agent, or published port; start, status, and rebuild
helpers with a login-agent template for unattended restart; the benchmark that produced the measurements; and a
runbook section covering registration differences, the two-service configuration, restart behavior, and maintenance
windows. Routing moved to `arc-ci-mini` through the repository variable during execution; the VPS pair stays
registered as fallback and GitHub-hosted runners remain the recovery path.

The go verdict rests on five of six measurement thresholds. The concurrent-service limit of 1.25x per job failed at
1.389x and stays recorded as failed: the host pairs four performance cores with six efficiency cores, so a second
concurrent anchor spills onto slower cores whatever the allocation. Aggregate throughput held at 1.44x one service,
and the soak ratio cleared its threshold at 0.444. Three services were measured and rejected — 9.4 percent more
throughput at the cost of pushing the end-to-end helper past its subprocess budget — which is why two ship. The soak
criterion closed on one same-head pair plus two guest-only stability runs rather than three to five pairs, a
recorded deviation.

Verification closed with all ten success criteria met. After a base merge 978 commits wide, the attested Candidate
record no longer parsed under the current schema and was regenerated as a fresh root over the merged head. Tier 2
and build ran green there: markdown, the three ARC contract checks, both lint lanes, both type checks, 12,142 tests
passed and 1 skipped, and build.

No review lane ran. The standard lane closed on an explicit Owner acceptance at zero completed passes, and frontline
was skipped under the same direction: the change is repository CI operations, not product behavior. The durable
record shows frontline as skipped rather than as accepted risk.

---
