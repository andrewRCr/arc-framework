# Metadata: lifecycle-state-machine

| **State**  | **Owner** | **Branch**                     | **Class** | **Priority** |
|------------|-----------|--------------------------------|-----------|--------------|
| `Planning` | `andrew`  | `plan/lifecycle-state-machine` | `Novel`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `draft-lifecycle-state-machine.md`
- **Task List:** [none]

- **Last Completed:** Resolved the protection-mode (full/partial) pass (mode = ship-layer property; relocation
  mutator bundle is mode-invariant for tracked-WU transitions; partial is the floor) and the downstream forward-
  compat alignment pass; draft consolidated, still at `maturing` (`13c5748f`).
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run the **completeness audit** — the draft → spec gate (per the draft's § Completeness audit):
  static + behavioral sweeps over the model, reading the lifecycle workflows fresh (`init` / `activate` /
  `deactivate` / `decompose` / `integrate` / `run-errand`); then consolidate the draft to formalization-ready and
  proceed to `create-spec`. The draft `Continuity` block is the resume anchor. Still flagged: propose
  `finalize-parallelism → lifecycle-state-machine` `Depends On`.

---
