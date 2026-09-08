# Metadata: local-ci-capacity-qualification

| **State**  | **Owner** | **Branch**                             | **Class** | **Priority** |
| ---------- | --------- | -------------------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/local-ci-capacity-qualification` | `Light`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** `e2e-feedback-six-shard-rebalance` Errand follow-up
- **Design:** `draft-local-ci-capacity-qualification.md`
- **Task List:** [none]
- **Review Rubric:** [none]

- **Current Workflow:** `create-spec`
- **Last Completed:** Planned Light P1 stub created from the live CI-capacity investigation (2026-09-08).
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [begin current workflow]

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

**Forward amendment (2026-09-08):** the motivator is CI speed, not VPS cost. On a go result this work unit ships the
repository routed to the local runner (label and `ARC_CI_LINUX_RUNNER` routing, runbook, and start/idle/stop
procedure), with the remote VPS pool left registered as the fallback. `self-hosted-ci-qualification` is being retired
by errand because daily use already settled the question it was chartered to adjudicate; its measured findings
informed this draft. Decommissioning the paid VPS allocation stays a separate, approval-gated errand and is not
decided here. The "Selecting the permanent repository-wide CI architecture" exclusion below narrows accordingly: the
routing swap on go is in scope; fleet purchase, resize, and decommission remain out.

**Forward amendment (2026-09-08, second):** the trial target moves from a Hyper-V guest on the Windows workstation
to a Linux VM on the always-on M4 Mac mini already on the desk. Re-measured host accounting showed the 32 GB
workstation cannot hold a 12 GB WSL cap, its 13 to 15 GB Windows footprint, and a useful guest at once; a RAM
upgrade is priced out by current memory costs; and a single memory-starved slot would roughly tie the four-slot VPS
route on wall time. The mini is not a development machine, stays powered on, and will sit idle whenever CI is
active, which removes the coexistence, reclamation-proof, and guest-offline concerns entirely. The workstation
Hyper-V design is retained in the draft as the recorded fallback. The scope contract's bullets above are read with
"Mac mini Linux VM" in place of "Ubuntu Hyper-V guest" and without the local-development coexistence bullet.

## Out of Scope

- Unconditionally increasing the E2E shard count.
- Raising the current CI Vitest worker cap without new resource evidence.
- Buying, resizing, deregistering, or decommissioning remote capacity.
- Selecting the permanent repository-wide CI architecture.

- **PR URL:** [none]
- **Completed:** [none]

---
