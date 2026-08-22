# Metadata: decompose-extraction

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `decompose-transform-integrity`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-decompose-extraction.md`
- **Task List:** `tasks-decompose-extraction.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:c4604d0480b4e19a334e0d5dc55cec0440f6d403a6cea17e781eb2ec22ae0d09`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/533>
- **Completed:** 2026-08-22

---

## Release Notes Entry

ARC can now extract unbuilt planning scope into independently deliverable work units while preserving the active
origin. The additive result lands first without changing source bytes; a separate authenticated finish then proves
the landed destinations before applying byte-preserving source thinning.

### Added

- Additive `arc decompose <origin> --extract <cut-map>` support for started Planning and Active origins, with
  origin-aware placement, retained-scope allocation, dependency transforms, and complete destination staging.
- Preview-first `--finish <cut-map>` source thinning with explicit `--apply`, exact source and base checks, landed
  destination authentication, preimage-bound apply authority, bounded restoration, and idempotent retries.

### Changed

- Decomposition schemas, topology, conservation, lifecycle discovery, result reporting, and workflow guidance now
  distinguish surviving-origin extraction from terminal retirement without introducing an extraction record.
- Boundary-fit and work-organization guidance now present active-origin extraction as a supported first-class
  decomposition path.

### Fixed

- Incomplete cohort scaffolds with the placeholder Purpose are refused before commit, and failed finish operations
  restore every source path whose mutation began before the failure surfaced.

## Completion Notes

Delivered the complete additive-land-then-finish extraction lifecycle. The additive leg admits started Planning and
Active origins, requires substantive ownership for every new member, preserves the origin and its committed
implementation, and keeps candidate-only members out of lifecycle discovery until landing. The finish leg proves
the original additive plan against the live base, previews exact thinning, binds apply authority to every source
preimage, preserves unrelated bytes and modes, and recovers bounded mutations without adding a receipt, ledger,
transition record, or automated launch authority.

Review refined the destination proof from exact scaffold-byte identity to exact invariant semantics for content
that destination owners may legitimately edit after scaffolding. It also bound apply authorization to the previewed
source preimages, restricted refresh of changed bytes to retained or explicitly dropped scope, and included a path
in restoration as soon as its filesystem mutation succeeds. These forward amendments preserve the original
additive-result authority while closing stale-preview and partial-apply races.

Verification completed on the published Candidate with Markdown and ARC contract checks, TypeScript and shell
lint, both strict typechecks, the production build, and the full suite of 10,468 passing tests across 813 files;
one file and one test were intentionally skipped. The final focused review found no further material issue.

---
