# Metadata: cli-layout-resolver

| **State**     | **Owner** | **Branch**                 | **Class** | **Priority** |
| ------------- | --------- | -------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/cli-layout-resolver` | `Heavy`   | `P2`         |

- **Cohort:** `cli-substrate-adoption`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-layout-resolver.md`
- **Task List:** `tasks-cli-layout-resolver.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Open the PR

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

ARC's CLI now resolves managed framework paths through validated semantic addresses, centralizing layout rules
across lifecycle, user-state, installation, status, and template flows while preserving the existing on-disk layout.

- **Added:** Typed layout schemas, canonical path projection, contained native materialization, and a deterministic
  migration-audit command.
- **Changed:** Lifecycle, session, install/update, view, readiness, and user-surface path construction now uses the
  shared resolver.
- **Fixed:** Invalid identities, traversal attempts, malformed roots, duplicate template outputs, and validation
  failures are rejected before filesystem or Git mutation.

## Completion Notes

Delivered a typed, root-independent layout authority backed by Zod schemas, canonical semantic projection, strict
native-path containment, stable local errors, and an isolated registry. Audited production callers now supply
semantic addresses across work-unit lifecycle, user documents, installation, templates, readiness views, and
artifact viewing, while exact discovery results and configured pointers remain authoritative where recomputation
would lose information.

The implementation kept storage, lifecycle inference, worktree selection, and procedure policy with their existing
owners; no layout-specific Git adapter, storage mode, or generic descendant-join escape hatch was introduced. Review
follow-ups strengthened template-output collision handling, identity path validation, validation failure ordering,
UTF-8 canonical sorting, schema-derived maintenance seams, and shared status and SESSION-NOTES helpers without
changing the public layout contract.

Verification passed Markdown, TypeScript, and shell lint; source and test typechecks; the full 7,104-test CLI suite
with one environment-gated skip; the build; and the index-pinned migration audit. Review follow-ups additionally
passed 6,122 unit tests and 94 targeted integration tests, and the final ledger certifies all 10,278 selected hits.

---
