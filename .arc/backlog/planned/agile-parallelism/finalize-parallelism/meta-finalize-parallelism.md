# Metadata: finalize-parallelism

| **State**  | **Owner** | **Branch** | **Class** | **Priority** |
| ---------- | --------- | ---------- | --------- | ------------ |
| `Planning` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `agile-parallelism`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `async-merge-lifecycle`,
  `worktree-default-start`, `single-owner-wu-model`, `partial-push-marker`, `stale-state-detect-and-pull`,
  `state-ref-write-safety`, `out-of-wu-entry`, `lifecycle-closeout`

- **Origin:** [internal]
- **Design:** `draft-finalize-parallelism.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** All dependencies shipped — **startable** as the agile-parallelism GA gate / cohort closeout
  (the cohort archives on its ship). Run the milestone path first (`draft-finalize-parallelism.md` § Milestone
  path): `adversarial-review` → `interlock-release-refinement` (own grooming iteration first) → `roadmap-tooling`,
  with the three pre-routed `USER-INBOX § Errand` captures interleaved. Launch this WU into a **spawned worktree,
  never `--here`** (draft § Verification design → Launch constraint); hand-provision deps until its
  dep-provisioning build item lands. Buffer drained 2026-07-01; gap-hunt matrix pass pending, then the draft is
  near formalization-ready for create-spec.
