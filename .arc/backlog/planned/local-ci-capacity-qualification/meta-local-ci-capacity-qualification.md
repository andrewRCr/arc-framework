# Metadata: local-ci-capacity-qualification

| **State**  | **Owner** | **Branch** | **Class** | **Priority** |
| ---------- | --------- | ---------- | --------- | ------------ |
| `Planning` | `andrew`  | [none]     | `Light`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** `e2e-feedback-six-shard-rebalance` Errand follow-up
- **Design:** [none]
- **Task List:** [none]
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Planned Light P1 stub created from the live CI-capacity investigation (2026-09-08).
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Plan and execute a staged Hyper-V canary: prove one isolated runner first, then concurrent
  throughput and local-development coexistence, before any repository routing change.

## Scope Contract

Qualify whether the local Windows workstation can safely and usefully provide on-demand Linux CI capacity through
an isolated Hyper-V guest. This work unit owns the bounded feasibility trial and its operational evidence; it does
not settle the repository's permanent hosted-versus-self-hosted posture.

- Establish a dedicated Ubuntu Hyper-V guest with no development checkout, host-shared folders, forwarded agent,
  personal credentials, or private-network reach. Use a repository-scoped runner and the existing disposable-host
  trust boundary.
- Benchmark the exact heavyweight E2E anchor first with one runner service and a conservative guest allocation.
  Measure warm and repeated latency, CPU, memory, swap, runner stability, and Windows/WSL resource pressure.
- Test local-development coexistence separately. Stop on sustained low host-memory headroom, new swap pressure,
  instability, or a material regression in representative WSL quality-gate wall time.
- Scale to two runner services only after the single-service canary passes, then require useful aggregate
  throughput without per-job collapse before registering the guest into the live runner pool.
- Run a bounded live Actions soak with the existing four-shard topology before considering any shard-count change.
  Preserve an immediate hosted/remote fallback and an on-demand start, idle-check, and stop procedure.
- Deliver the measurement ledger and a go/no-go recommendation to `self-hosted-ci-qualification`; that Heavy WU
  retains authority over the permanent CI route, remote fleet disposition, and recurring-cost decision.

## Out of Scope

- Unconditionally increasing the E2E shard count.
- Raising the current CI Vitest worker cap without new resource evidence.
- Buying, resizing, deregistering, or decommissioning remote capacity.
- Selecting the permanent repository-wide CI architecture.

- **PR URL:** [none]
- **Completed:** [none]

---
