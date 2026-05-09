# Status: Interlock Release Wrappers — Foundation

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-foundation

- **Spec:** `prd-release-wrappers-foundation.md`
- **Task List:** `tasks-release-wrappers-foundation.md`
- **Sibling Work Unit(s):** `plan-release-wrappers-ergonomics.md`

- **Last Completed:** Task 3.3 — `arc release push` success path:
  authorize branch invokes wrapped `git push` + writes `kind: "push"`
  audit (parsed `refStatus`) on exit 0 / `kind: "hook-failed"` audit
  with hook attribution on non-zero. Phase 3 closes.
- **Next Task:** Task 4.1.a — Extend `lib/git/exec.ts` with
  `gitConfigUnset` + scoped `gitConfigSet` (line ~285)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.1.a — add `gitConfigUnset(exec, key)`
  (uses `git config --unset <key>`; key-absent path returns no-op
  success without throwing) and widen `gitConfigSet` with optional
  `scope?: "local" | "global" | "system"` defaulting to `"local"`.
  Existing call sites pass no scope — behavior must stay unchanged.
  Test-first per the four behaviors enumerated in
  `tasks-release-wrappers-foundation.md` § 4.1.a.

---
