# Metadata: Check ID Stabilization

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Light`   | `P2`         |

- **Cohort:** `architecture-remediation`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-check-id-stabilization.md`
- **Task List:** `tasks-check-id-stabilization.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:77f1e1a9c0e25554e91ed3a41848cf0492740855a2823ccc3815ef5f8d19f6e9`

- **Current Workflow:** [none]
- **Last Completed:** Task 2.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/787>
- **Completed:** 2026-10-03

## Release Notes Entry

Pre-commit checks now use stable, descriptive identifiers that remain valid when checks move or new checks are added.

### Changed

- Replaced positional check labels with `CHECK[slug]` identifiers throughout the hook and its live references.
- Corrected schema, package-neutrality, and extension-point references to identify the checks that own them.

## Completion Notes

Migrated all 19 pre-commit checks and their live consumers to stable identifiers. Hook and integrity-script edits
preserve execution and diagnostic behavior. Source assertions select exact IDs with explicit next-heading and final
Summary boundaries, and cover insertion, reordering, missing IDs, duplicates, and missing terminal boundaries.
Historical records and other work units' planning artifacts retain their original vocabulary.

All eight acceptance criteria were verified. Complete local Tier 3 passed, including 13,266 tests, both type checks,
lint and ARC audits, and the ESM/declaration build. A fresh-context criteria review found no issues. Complete hosted
Codex review was clean at `213143982`; the approved generated ROADMAP reconciliation preserves the reviewed
contribution. Post-reconcile Tier 1 passed, including 51 affected tests. No material implementation deviation occurred.

---
