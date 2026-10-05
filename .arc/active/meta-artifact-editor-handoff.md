# Metadata: artifact-editor-handoff

| **State**     | **Owner** | **Branch**                     | **Class** | **Priority** |
| ------------- | --------- | ------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/artifact-editor-handoff` | `Light`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** `[internal] — minted at the 2026-09-30 housekeep drain from a USER-INBOX capture`
- **Design:** `spec-artifact-editor-handoff.md`
- **Task List:** `tasks-artifact-editor-handoff.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:c2bea9008e29757c9371e2a29679ee684ca3a0e28c093853c0722ee5fb5b71ad`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 2.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

The artifact viewer can open selected files directly in a configured editor.

### Added

- `arc view --editor` (`-e`) opens the real selected artifact using `ARC_EDITOR` or Git's editor configuration.
  Handoff inherits terminal streams, waits for the configured command, and preserves its wait flags. Forbidden
  interaction, conflicting destinations, missing artifacts, and editor failures return diagnostics.

## Completion Notes

Delivered an editor destination through the existing artifact resolver, preserving bare fallback and explicit
selection. The adapter selects the configured command, transports the real absolute filename separately, and
waits for process completion before returning. Help and the quick reference describe selection, interaction,
and wait-enabled GUI use. All ten success criteria were met without scope amendments or supersessions.

Linux native recorder checks exercise command arguments and filename transport; injected process checks cover
waiting, inherited streams, selection errors, launch failures, signals, and unsuccessful exits. After base
reconciliation, 16,077 routine tests and 41 focused view E2E checks passed, along with lint, both type checks,
ARC contracts, and the production build. The fresh verification follow-up returned no findings after the
command-preservation and helper-collision corrections. Hosted Codex reviewed the complete published change set
without findings, and required CI passed on the reviewed head.

---
