# Status: Interlock Release Wrappers — Foundation

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-foundation

- **Spec:** `prd-release-wrappers-foundation.md`
- **Task List:** `tasks-release-wrappers-foundation.md`
- **Sibling Work Unit(s):** `plan-release-wrappers-ergonomics.md`

- **Last Completed:** Task 4.1.b — `arc release record-enabled` sub-command:
  check-then-set via `gitConfigGet` makes the local-scope write to
  `arc.release.enabled` idempotent; `gitConfigSet` failures surface
  key-name + underlying git error via `writeStderr` with non-zero exit.
  Orchestrator + Commander adapter live in `record.ts`; sub-command
  registered on `arc release`.
- **Next Task:** Task 4.1.c — `record-disabled` sub-command (line ~300)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.1.c — implement `runReleaseRecordDisabled` in
  `record.ts` using `gitConfigUnset` (idempotent on absent key from the lib
  helper). Three behaviors per the task list: present-key unset, absent-key
  no-op, never-enabled silent success, plus unset-failure surfacing key + git
  error via `writeStderr`. Mirror the `handleReleaseRecordEnabled` adapter
  shape and register on `arc release`. Test-first per the four behaviors in
  `tasks-release-wrappers-foundation.md` § 4.1.c.

---
