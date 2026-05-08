# Status: Interlock Release Wrappers — Foundation

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-foundation

- **Spec:** `prd-release-wrappers-foundation.md`
- **Task List:** `tasks-release-wrappers-foundation.md`
- **Sibling Work Unit(s):** `plan-release-wrappers-ergonomics.md`

- **Last Completed:** Task 1.6 — `audit-log.ts` (JSONL writer + R14
  sanitization; schema validation as a TS assertion function). Closes Phase 1.
- **Next Task:** Task 2.1 — Refusal path: validation chain → exit codes
  10–13 → audit refused entry (line ~183)
- **Blockers:** [none]

- **Next Action:** Begin Phase 2 at Task 2.1 — `arc release commit` handler
  refusal path. Compose `resolveActiveWu` (1.4) + `authorizeRelease` (1.5) +
  `detectCommitDestructive` (1.3) into the refusal cascade; emit refused
  audit entries via `appendAuditEntry` (1.6) before exiting with the matched
  refusal code.

---
