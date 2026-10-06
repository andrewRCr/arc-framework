# Metadata: cli-help-discovery

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Light`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** `[internal] — minted at the 2026-09-30 housekeep drain from a USER-INBOX capture`
- **Design:** `spec-cli-help-discovery.md`
- **Task List:** `tasks-cli-help-discovery.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:3d5aea9b80daa938450a9aec71a6d3a3a0b110c53acf0eb44534bd331ff9d90d`

- **Current Workflow:** [none]
- **Last Completed:** Task 3.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/817>
- **Completed:** 2026-10-05

## Release Notes Entry

CLI help makes it easier to find an operation and construct its invocation through task groups, concise summaries, and
practical examples.

### Changed

- Bare invocation shows a short introduction and help pointers, while explicit help retains the complete inventory.
- Root help and larger namespaces group operations by task; command pages retain native syntax and inherited options.
- Ten command pages include workflow examples, and status and JSON request help explain selection, input, and output
  contracts.

## Completion Notes

Delivered the agreed discovery contract across the existing registered command tree: concise entry help, grouped root and
namespace navigation, intentional summaries for all 184 visible commands, ten example pages, and precise status and
structured input pages. Commander supplies grammar, option annotations, wrapping, and hidden visibility.

All eight task-list success criteria are met, with discovery paths and verification evidence in
`notes-cli-help-discovery.md`. Local verification passed 16,135 routine tests, 68 focused help/editor E2E checks, whole-project
lint, both type checks, ARC contracts, and the full build. A CI assertion that rejected any mention of `--json` was corrected
to inspect option entries; all 42 review-surface E2E cases pass, including parser rejection checks. Required CI subsequently
passed, including all four E2E shards and Linux portability.

The fresh-context verification pass reported no findings on its recorded subject. Hosted Codex returned clean for the
reconciled publication head and for the refreshed Candidate after the test correction; frontline was skipped by explicit
direction. Base reconciliation preserved editor handoff guidance and required a line-wrap correction for the 80-column
contract. No requirement was superseded, and no original intent remains deferred.

---
