# Metadata: lifecycle-ux-polish

| **State**     | **Owner** | **Branch**                 | **Class** | **Priority** |
| ------------- | --------- | -------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/lifecycle-ux-polish` | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-lifecycle-ux-polish.md`
- **Task List:** `tasks-lifecycle-ux-polish.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 3.1 — Complete verification; PR #149 opened
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 4 — review iteration

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/149>
- **Completed:** [none]

---

## Release Notes Entry

ARC's session and work-unit lifecycle gets quieter and more robust: handoff no longer offers a late housekeep
detour, session-init reports live git facts from probes, session entry gains explicit `--next` / `--start`
shortcuts, errand cleanup handles host-deleted branches, and activation foreign-write checks stop warning on a
work unit's own renamed planning ref.

### Added

- `arc-session --next` and `arc-session --start <wu-slug>` entry shortcuts for the bare-clean resume/start
  cases, with normal interlocks and guard surfaces preserved.
- Handoff status/user-slot notes-drift surfacing, matching the disk-vs-ref advisory shape already used by
  session-init.

### Changed

- `session-handoff` runs without the between-WUs housekeep offer or dead `inboxState` consumption; the
  housekeep nudge remains at session-init.
- `session-init` treats SESSION-NOTES as context only for live git state and renders git facts from fresh probe
  slots.
- Always-loaded ARC guidance now states the release-wrapper call shape and requires loading commit-format /
  commit-footer methods before composing commits.

### Fixed

- `arc errand close --force` now removes the errand record when the local branch is already gone, including the
  case where symbolic `HEAD` still names the deleted branch and needs to switch back to base first.
- Activation foreign-write checks now self-exclude the current work unit by meta path, suppressing false
  warnings from stale remote-tracking refs while preserving genuine overlap detection.

## Completion Notes

Shipped the lifecycle-UX polish cluster as one coherent cleanup across session, handoff, errand, activation, and
commit-path surfaces. The doc lobe removed end-of-session housekeep noise, made session-init's live-state
authority explicit, documented the `--next` / `--start` shortcuts, and added always-loaded guidance for release
wrappers and commit-message method loading. The code lobe added handoff notes-drift parity, hardened
`closeErrand` for already-deleted branches, and threaded originating meta-path self-exclusion through the
foreign-write detector.

The main implementation refinement from review was the errand-close dead-branch case: it was not enough to skip
deleting an absent branch, because `HEAD` can still be symbolic to the deleted branch name. The final close path
uses symbolic branch resolution, hops back to base when needed, and only then cleans the errand record.

Scope held to the spec's boundaries: no inline `Class` resolution flag, no stored errand tip SHA, no standing
auto-proceed setting, and no duplicated commit-format skeleton. Verification ran the Tier 3 local gates before
PR, then the review-fix pass reran focused errand-close coverage plus lint, typecheck, full tests, shell and
markdown lint, and build. CI is green on PR #149, and the second CodeRabbit pass returned no actionable
comments with all review threads resolved.

---
