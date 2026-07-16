# Metadata: CLI Test Hardening

| **State** | **Owner** | **Branch**                 | **Class** | **Priority** |
| --------- | --------- | -------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `chore/cli-test-hardening` | `Light`   | `P3`         |

- **Cohort:** `architecture-remediation`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-test-hardening.md`
- **Task List:** `tasks-cli-test-hardening.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 3.4 — set `isolate: false` on the `unit` vitest project (module import ~78s → ~52s on
  the tier), closing Phase 3. Preceded by Task 3.3, which quarantined the 15 module-mocking unit files into an
  isolated `unit-mocks` tier + a drift guard so the flip is leak-safe.
- **Next Task:** Task 4.1 — Shard the e2e job and sync the classifier (line ~213)
- **Blockers:** [none]

- **Next Action:** Start Task 4.1 — shard the e2e tier across a bounded GitHub Actions matrix (`vitest --shard`)
  and sync `HEAVY_CHECK_NAMES` in `scripts/classify-change.sh` byte-identically to the post-matrix check-run names.
  Edits `.github/workflows/ci.yml` + the classifier; matrix check-run names only materialize on GitHub, so verify
  by careful reading against the byte-identical constraint, not a local run. Stop-loss: structural leg rework or
  more than a couple in-CI tuning passes stops and captures the remainder.

- **PR URL:** [none]
- **Completed:** [none]

---
