# Metadata: finalize-parallelism

| **State** | **Owner** | **Branch**                  | **Class** | **Priority** |
| --------- | --------- | --------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `feat/finalize-parallelism` | `Heavy`   | `P1`         |

- **Cohort:** `agile-parallelism`
- **Depends On:** roadmap-tooling

- **Origin:** [internal]
- **Design:** `spec-finalize-parallelism.md`
- **Task List:** `tasks-finalize-parallelism.md`

- **Current Workflow:** [none]
- **Last Completed:** Phase 2.I — Mid-flight build-items integration (Tasks 2.I.1–2.I.2 complete; Phase 2 complete)
- **Next Task:** Task 3.1.b — Scaffold, spawn, and groom the synthetic fixtures in-worktree (line ~502)
- **Blockers:** Two gates before the burn-in waves resume, both must ship + FP rebuild: (1)
  `notes-fetch-refspec-hardening` — a notes-fetch clobber bug (a plain `git fetch` force-overwrites/prunes unpushed
  user notes) makes notes-sync unsafe on FP's current build; (2) `roadmap-tooling` — the in-flight state-reporting
  layer (roster derivation + ROADMAP shared-mutable contention) reports false facts (see
  `notes-finalize-parallelism.md` § state-integrity finding), a GA blocker, now formalized as a hard `Depends On`.
  Waves must consume a trustworthy state layer, not characterize a broken one.

- **Next Action:** BLOCKED on `notes-fetch-refspec-hardening` (notes-sync clobber fix, now in planning). On
  resume, once that WU has merged to `main` and FP has merged `main` + rebuilt (`npm run build`): (1) controlled
  notes re-enable — `arc user save` → `arc user sync` (now clobber-safe), confirm convergence, which also pushes
  FP's unpushed commits; (2) sync pending USER-INBOX captures (incl. `cli-test-hardening` + probe-a's
  save-location capture); (3) retire the notes-clobber + notes-anomaly WORKING-MEMORY entries as their triggers
  are met; (4) resume Task 3.1.b as observer and merge `main`/rebuild/resume the two paused probe worktrees; drive
  3.2–3.3 induction. Detail in SESSION-NOTES.

- **PR URL:** [none]
- **Completed:** [none]

---
