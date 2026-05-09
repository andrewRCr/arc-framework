# Status: Interlock Release Wrappers — Foundation

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-foundation

- **Spec:** `prd-release-wrappers-foundation.md`
- **Task List:** `tasks-release-wrappers-foundation.md`
- **Sibling Work Unit(s):** `plan-release-wrappers-ergonomics.md`

- **Last Completed:** Task 3.1 — `pushWorktreeBranch` widened with
  `args?: readonly string[]` + `inheritStdio?: boolean`; result shape
  carries `stdout`/`stderr` in both modes (Task 2.2 success-path landed
  in the prior commit).
- **Next Task:** Task 3.2 — Refusal path: validation + pushability →
  exit codes 10–14 → audit refused entry (line ~240)
- **Blockers:** [none]

- **Next Action:** Begin Task 3.2 — implement `arc release push`
  refusal cascade (12 → 10 → 13 → 14 → 11) in
  `src/handlers/release/push.ts` and register the `push` sub-command on
  `arc release` in `src/cli.ts`. Reuse the Phase 1 lib +
  `formatRefusal()`; route code 14 through `runPushabilityStatus`
  (block conditions + `force-push-required` advisory refuse;
  `auto-fixed` passes through). Code 15 reserved-for-empirical (no
  runtime check).

---
